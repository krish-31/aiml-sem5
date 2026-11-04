"""Evaluate the trained model on the held-out test networks.

Reports, for the temporal GNN and for simple baselines:
  - link forecasting: AUC, AP, ECE, Brier (does the model know which connections come next hour?)
  - next-hop forecasting: top-1/3/5 accuracy, MRR, calibration
  - attack-path forecasting: top-k path hit rate and time-to-detection
  - defense: for the recommended next cut (best action beyond known compromised machines) and for
    containment (isolating a compromised machine): risk cut, traffic blocked, cuts the true path

Baselines:
  random    every possible next machine equally likely
  heuristic hand-written rule: prefer machines that share users with the current one / were contacted before

Run:
    python -m attackpath.eval.evaluate --model checkpoints/tgnn.pt
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch

from attackpath.eval.metrics import hop_metrics, link_metrics
from attackpath.graph.builder import load_graphs, split_graphs
from attackpath.inference import prediction_hours, states_at, transition_matrix
from attackpath.defense.simulator import recommend, split_actions
from attackpath.models.tgnn import load_model
from attackpath.models.train import predict
from attackpath.paths.rank import top_k_paths

KS = (1, 3, 5)


def heuristic_matrix(pf: torch.Tensor, footholds: list[int]) -> torch.Tensor:
    """Rule-based move probabilities: shared users (stealable creds) and past contact."""
    n = pf.shape[0]
    score = 2.0 * pf[..., 2] + 1.0 * pf[..., 0]
    mask = torch.eye(n, dtype=torch.bool)
    mask[:, footholds] = True
    return torch.softmax(score.masked_fill(mask, float("-inf")), dim=1)


def random_matrix(n: int, footholds: list[int]) -> torch.Tensor:
    P = torch.ones(n, n)
    P.fill_diagonal_(0)
    P[:, footholds] = 0
    return P / P.sum(1, keepdim=True).clamp_min(1e-12)


def cuts_true_path(action, remaining: list[int]) -> bool:
    if action.kind == "isolate":
        return action.nodes[0] in remaining
    return tuple(action.nodes) in set(zip(remaining[:-1], remaining[1:]))


def evaluate(model_path: str, graphs_path: str, defend: bool = True, verbose: bool = True) -> dict:
    model, ckpt = load_model(model_path)
    T = ckpt["temperatures"]
    context = ckpt.get("context", 24)
    _, _, test = split_graphs(load_graphs(graphs_path), seed=0)
    say = print if verbose else (lambda *a, **k: None)
    say(f"evaluating on {len(test)} unseen test networks")

    ll, ly, _, _ = predict(model, test, context)
    link = {"raw": link_metrics(ll, ly), "calibrated": link_metrics(ll, ly, T["link"])}

    methods = ("tgnn", "tgnn_uncalibrated", "heuristic", "random")
    hop = {m: ([], []) for m in methods}
    hits = {m: {k: [] for k in KS} for m in ("tgnn", "heuristic", "random")}
    first_hit = {m: [] for m in ("tgnn", "heuristic")}
    defense, containment = [], []

    for gi, g in enumerate(test):
        hours = prediction_hours(g)
        states = states_at(model, g, hours, context)
        targets = torch.nonzero(g.critical).flatten().tolist()
        K = len(g.attack_path) - 1
        detected = {m: None for m in first_hit}
        for m, t in enumerate(hours):
            h, pf, normal = states[t]
            fh = g.attack_path[: m + 1]
            u, v = g.attack_path[m], g.attack_path[m + 1]
            remaining = g.attack_path[m:]
            P = {
                "tgnn": transition_matrix(model, h, pf, fh, T["hop"]),
                "tgnn_uncalibrated": transition_matrix(model, h, pf, fh, 1.0),
                "heuristic": heuristic_matrix(pf, fh),
                "random": random_matrix(g.num_computers, fh),
            }
            for name, M in P.items():
                hop[name][0].append(torch.log(M[u]))
                hop[name][1].append(v)
            for name in hits:
                paths = top_k_paths(P[name], fh, targets, k=max(KS))
                ranked = [p.nodes for p in paths]
                for k in KS:
                    ok = remaining in ranked[:k]
                    hits[name][k].append(ok)
                    if k == 5 and ok and name in detected and detected[name] is None:
                        detected[name] = m
            if defend:
                _, actions = recommend(P["tgnn"], fh, targets, normal, k=10)
                con, cuts = split_actions(actions, fh, u, P["tgnn"], targets)
                nxt = cuts[0] if cuts else None
                if nxt:
                    defense.append((nxt.risk_drop, nxt.blocked, cuts_true_path(nxt, remaining)))
                if con:
                    containment.append((con.risk_drop, con.blocked, cuts_true_path(con, remaining)))
        for name in first_hit:
            # hops of warning before the attacker reaches the target (0 = never predicted in time)
            first_hit[name].append(K - detected[name] if detected[name] is not None else 0)
        if verbose and (gi + 1) % 15 == 0:
            say(f"  {gi + 1}/{len(test)} networks")

    res = {
        "n_test_networks": len(test),
        "n_predictions": len(hop["tgnn"][1]),
        "temperatures": T,
        "link": link,
        "next_hop": {name: hop_metrics(*hop[name]) for name in methods},
        "path_hit_rate": {name: {f"top{k}": float(np.mean(hits[name][k])) for k in KS} for name in hits},
        "time_to_detection": {
            name: {
                "detected_before_target": float(np.mean([x > 0 for x in v])),
                "mean_hops_of_warning": float(np.mean(v)),
            }
            for name, v in first_hit.items()
        },
    }
    def summarize(rows):
        d = np.array(rows, dtype=float)
        return {
            "mean_risk_drop": float(d[:, 0].mean()),
            "mean_normal_blocked": float(d[:, 1].mean()),
            "share_meeting_target": float(((d[:, 0] >= 0.30) & (d[:, 1] < 0.10)).mean()),
            "cuts_true_path": float(d[:, 2].mean()),
            "n": len(rows),
        }

    if defense:
        res["defense"] = summarize(defense)  # the recommended next cut
    if containment:
        res["containment"] = summarize(containment)
    return res


def report(res: dict) -> str:
    L = []
    lk = res["link"]
    L.append(f"Test networks: {res['n_test_networks']}  |  next-hop predictions: {res['n_predictions']}")
    L.append("")
    L.append("LINK FORECAST (next hour)      AUC     AP      ECE     Brier")
    for k in ("raw", "calibrated"):
        m = lk[k]
        L.append(f"  {k:<28}{m['auc']:.3f}   {m['ap']:.3f}   {m['ece']:.3f}   {m['brier']:.3f}")
    L.append("")
    L.append("NEXT HOP                       top1    top3    top5    MRR     ECE")
    for k, m in res["next_hop"].items():
        L.append(f"  {k:<28}{m['top1']:.3f}   {m['top3']:.3f}   {m['top5']:.3f}   {m['mrr']:.3f}   {m['ece']:.3f}")
    L.append("")
    L.append("FULL REMAINING PATH IN TOP-k   top1    top3    top5")
    for k, m in res["path_hit_rate"].items():
        L.append(f"  {k:<28}{m['top1']:.3f}   {m['top3']:.3f}   {m['top5']:.3f}")
    L.append("")
    L.append("TIME TO DETECTION              caught before target   avg hops of warning")
    for k, m in res["time_to_detection"].items():
        L.append(f"  {k:<28}{m['detected_before_target']:.3f}                  {m['mean_hops_of_warning']:.2f}")
    for key, title in (("defense", "NEXT CUT   "), ("containment", "CONTAINMENT")):
        if key in res:
            d = res[key]
            L.append("")
            L.append(
                f"{title}  risk cut {d['mean_risk_drop']:.1%} | normal traffic blocked {d['mean_normal_blocked']:.1%} | "
                f"meets ≥30%/<10% target {d['share_meeting_target']:.1%} | cuts true path {d['cuts_true_path']:.1%}"
            )
    return "\n".join(L)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", default="checkpoints/tgnn.pt")
    p.add_argument("--graphs", default="data/processed/synthetic.pt")
    p.add_argument("--out", default="results/eval_synthetic.json")
    p.add_argument("--no-defense", action="store_true")
    args = p.parse_args()
    res = evaluate(args.model, args.graphs, defend=not args.no_defense)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(res, indent=2))
    print()
    print(report(res))
    print(f"\nsaved -> {args.out}")


if __name__ == "__main__":
    main()
