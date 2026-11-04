"""Train the temporal GNN on synthetic networks, then calibrate it.

Two jobs are learned together:
  1. link forecasting: which machine-to-machine connections appear next hour (all traffic)
  2. next-hop forecasting: where the attacker goes next, given where they are now

Each network is replayed from `context` hours before its attack to its last attack hop.
Every prediction for hour t+1 uses only hours ≤ t, so nothing from the future leaks in.

Run:
    python -m attackpath.models.train --graphs data/processed/synthetic.pt --out checkpoints/tgnn.pt
"""

from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from attackpath.eval.metrics import fit_hop_temperature, fit_link_temperature, hop_metrics, link_metrics
from attackpath.graph.builder import TemporalGraph, load_graphs, negative_sample, split_graphs
from attackpath.models.tgnn import History, TemporalGNN, save_model


def hop_examples(g: TemporalGraph) -> dict[int, list[tuple[int, int, list[int]]]]:
    """For each prediction hour t: [(attacker's current machine, true next machine, earlier footholds)]."""
    out: dict[int, list] = {}
    for k in range(1, len(g.attack_path)):
        t = g.attack_hop_windows[k - 1] - 1  # predict hop k from everything before the hour it happens
        out.setdefault(t, []).append((g.attack_path[k - 1], g.attack_path[k], g.attack_path[: k - 1]))
    return out


def replay_range(g: TemporalGraph, context: int) -> range:
    first = g.attack_hop_windows[0] - 1
    return range(max(0, first - context), g.attack_hop_windows[-1])


def run_graph(model: TemporalGNN, g: TemporalGraph, context: int, gen: torch.Generator, neg_ratio: int = 1):
    """Replay one network. Returns link logits/labels and hop logits/targets."""
    rng = replay_range(g, context)
    hops = hop_examples(g)
    hist = History(g, upto=rng.start)
    state = model.init_state(g)
    link_logits, link_labels, hop_logits, hop_targets = [], [], [], []

    for t in rng:
        state = model.step(g.snapshot(t), state)
        hist.add(t)
        h, pf = state["computer"], hist.pair_features()

        pos, _, _ = g.c2c.at(t + 1)
        if pos.shape[1]:
            neg = negative_sample(pos, g.num_computers, neg_ratio, gen)
            pairs = torch.cat([pos, neg], dim=1)
            link_logits.append(model.link_logits(h, pairs, pf))
            link_labels.append(torch.cat([torch.ones(pos.shape[1]), torch.zeros(neg.shape[1])]))

        for u, v, earlier in hops.get(t, []):
            hop_logits.append(model.hop_logits(h, u, pf, exclude=earlier))
            hop_targets.append(v)

    return link_logits, link_labels, hop_logits, hop_targets


@torch.no_grad()
def predict(model: TemporalGNN, graphs: list[TemporalGraph], context: int, seed: int = 0):
    model.eval()
    gen = torch.Generator().manual_seed(seed)
    ll, ly, hl, ht = [], [], [], []
    for g in graphs:
        a, b, c, d = run_graph(model, g, context, gen)
        ll += a
        ly += b
        hl += c
        ht += d
    return torch.cat(ll), torch.cat(ly), hl, ht


def train(
    graphs_path: str,
    out: str,
    epochs: int = 30,
    patience: int = 5,
    lr: float = 1e-3,
    context: int = 24,
    hop_weight: float = 1.0,
    seed: int = 0,
    model_kwargs: dict | None = None,
    verbose: bool = True,
) -> dict:
    torch.manual_seed(seed)
    random.seed(seed)
    np.random.seed(seed)
    graphs = load_graphs(graphs_path)
    tr, va, te = split_graphs(graphs, seed=0)
    model = TemporalGNN(**(model_kwargs or {}))
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    gen = torch.Generator().manual_seed(seed)
    best, best_state, bad, history = float("inf"), None, 0, []
    say = print if verbose else (lambda *a, **k: None)
    say(f"train/val/test networks: {len(tr)}/{len(va)}/{len(te)} | params: {sum(p.numel() for p in model.parameters()):,}")

    for epoch in range(1, epochs + 1):
        model.train()
        t0 = time.time()
        order = list(range(len(tr)))
        random.shuffle(order)
        tot = {"link": 0.0, "hop": 0.0}
        for i in order:
            ll, ly, hl, ht = run_graph(model, tr[i], context, gen)
            link_loss = F.binary_cross_entropy_with_logits(torch.cat(ll), torch.cat(ly))
            hop_loss = torch.stack([F.cross_entropy(lg.unsqueeze(0), torch.tensor([t])) for lg, t in zip(hl, ht)]).mean()
            loss = link_loss + hop_weight * hop_loss
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            tot["link"] += link_loss.item()
            tot["hop"] += hop_loss.item()

        vl, vy, vh, vt = predict(model, va, context)
        lm, hm = link_metrics(vl, vy), hop_metrics(vh, vt)
        val_loss = hm["nll"] + F.binary_cross_entropy_with_logits(vl, vy).item()
        row = {
            "epoch": epoch,
            "train_link": tot["link"] / len(tr),
            "train_hop": tot["hop"] / len(tr),
            "val_link_auc": lm["auc"],
            "val_hop_top1": hm["top1"],
            "val_hop_top3": hm["top3"],
            "val_loss": val_loss,
            "sec": time.time() - t0,
        }
        history.append(row)
        say(
            f"epoch {epoch:2d} | train link {row['train_link']:.3f} hop {row['train_hop']:.3f} | "
            f"val link AUC {lm['auc']:.3f} hop top1 {hm['top1']:.2f} top3 {hm['top3']:.2f} | "
            f"val loss {val_loss:.3f} | {row['sec']:.0f}s"
        )
        if val_loss < best - 1e-4:
            best, bad = val_loss, 0
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                say(f"early stop (no improvement for {patience} epochs)")
                break

    model.load_state_dict(best_state)
    vl, vy, vh, vt = predict(model, va, context)
    temps = {"link": fit_link_temperature(vl, vy), "hop": fit_hop_temperature(vh, vt)}
    say(f"calibration temperatures: link {temps['link']:.2f}, hop {temps['hop']:.2f}")

    Path(out).parent.mkdir(parents=True, exist_ok=True)
    save_model(model, out, temperatures=temps, context=context, history=history)
    say(f"saved -> {out}")
    return {"temperatures": temps, "history": history}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--graphs", default="data/processed/synthetic.pt")
    p.add_argument("--out", default="checkpoints/tgnn.pt")
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--patience", type=int, default=5)
    p.add_argument("--context", type=int, default=24, help="hours of history before each attack")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--hop-weight", type=float, default=2.0, help="weight of the next-hop loss vs the link loss")
    p.add_argument("--no-gru", action="store_true", help="ablation: remove the time module")
    p.add_argument("--no-pair", action="store_true", help="ablation: remove history pair features")
    args = p.parse_args()
    train(
        args.graphs, args.out, epochs=args.epochs, patience=args.patience, context=args.context, seed=args.seed,
        hop_weight=args.hop_weight,
        model_kwargs={"use_gru": not args.no_gru, "use_pair": not args.no_pair},
    )


if __name__ == "__main__":
    main()
