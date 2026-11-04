"""End-to-end forecast for one network at one moment of an attack.

Given that the attacker has made `observed` hops so far, it:
  1. replays the hourly snapshots up to the hour before the next hop (no peeking)
  2. scores every possible move with the hop head → calibrated move probabilities P
  3. ranks the top-k complete paths to critical assets
  4. tests defensive actions and recommends the best one
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import torch

from attackpath.defense.simulator import Action, recommend
from attackpath.graph.builder import TemporalGraph
from attackpath.models.tgnn import History, TemporalGNN
from attackpath.paths.rank import RankedPath, top_k_paths


@dataclass
class NextHop:
    node: int
    prob: float
    uncertainty: float  # binary entropy of this probability, 0 (sure) … 1 (coin flip)


@dataclass
class Forecast:
    graph_id: int
    observed: int  # hops already made by the attacker
    hour: int  # last hour of logs the model has seen
    footholds: list[int]
    current: int
    P: torch.Tensor  # [Nc, Nc] calibrated next-move probabilities
    confidence: float  # 1 − normalized entropy of the next-move distribution from `current`
    next_hops: list[NextHop]
    paths: list[RankedPath]
    actions: list[Action]
    true_next: int | None
    true_remaining: list[int]


def prediction_hours(g: TemporalGraph) -> list[int]:
    """Hour after which hop k+1 is predicted, for k = 0 … K−1 observed hops."""
    return [w - 1 for w in g.attack_hop_windows]


@torch.no_grad()
def states_at(model: TemporalGNN, g: TemporalGraph, hours: list[int], context: int):
    """Replay once and capture (computer state, pair features, recent normal traffic) at each hour."""
    start = max(0, min(hours) - context)
    hist = History(g, upto=start)
    state = model.init_state(g)
    want, out = set(hours), {}
    for t in range(start, max(hours) + 1):
        state = model.step(g.snapshot(t), state)
        hist.add(t)
        if t in want:
            out[t] = (state["computer"].clone(), hist.pair_features(), normal_traffic(g, t))
    return out


def normal_traffic(g: TemporalGraph, t: int, hours: int = 24) -> torch.Tensor:
    """[Nc, Nc] counts of non-attack connections in the last `hours` hours up to t."""
    m = (g.c2c.t > t - hours) & (g.c2c.t <= t) & ~g.c2c.attack
    N = torch.zeros(g.num_computers, g.num_computers)
    N.index_put_((g.c2c.src[m], g.c2c.dst[m]), g.c2c.count[m], accumulate=True)
    return N


@torch.no_grad()
def transition_matrix(model: TemporalGNN, h: torch.Tensor, pf: torch.Tensor, footholds: list[int], temperature: float) -> torch.Tensor:
    n = h.shape[0]
    hu = h.unsqueeze(1).expand(n, n, -1)
    hv = h.unsqueeze(0).expand(n, n, -1)
    logits = model.hop_head(hu.reshape(n * n, -1), hv.reshape(n * n, -1), model._pf(pf).reshape(n * n, -1)).view(n, n)
    mask = torch.eye(n, dtype=torch.bool)
    mask[:, footholds] = True
    return torch.softmax(logits.masked_fill(mask, float("-inf")) / temperature, dim=1)


def _binary_entropy(p: float) -> float:
    if p <= 0 or p >= 1:
        return 0.0
    return -(p * math.log2(p) + (1 - p) * math.log2(1 - p))


def forecast_from_state(
    g: TemporalGraph, observed: int, h, pf, normal, model: TemporalGNN, temperature: float, k: int = 5, defend: bool = True
) -> Forecast:
    path = g.attack_path
    footholds = path[: observed + 1]
    current = path[observed]
    targets = torch.nonzero(g.critical).flatten().tolist()
    P = transition_matrix(model, h, pf, footholds, temperature)
    row = P[current]
    valid = int((row > 0).sum())
    ent = -(row[row > 0] * row[row > 0].log()).sum().item()
    conf = 1 - ent / math.log(valid) if valid > 1 else 1.0
    vals, idx = row.topk(min(k, valid))
    next_hops = [NextHop(int(v), float(p), _binary_entropy(float(p))) for p, v in zip(vals, idx)]
    paths = top_k_paths(P, footholds, targets, k=k)
    actions = recommend(P, footholds, targets, normal, k=10)[1] if defend else []
    return Forecast(
        graph_id=g.graph_id,
        observed=observed,
        hour=g.attack_hop_windows[observed] - 1,
        footholds=footholds,
        current=current,
        P=P,
        confidence=conf,
        next_hops=next_hops,
        paths=paths,
        actions=actions,
        true_next=path[observed + 1] if observed + 1 < len(path) else None,
        true_remaining=path[observed:],
    )


def forecast_all(model: TemporalGNN, ckpt: dict, g: TemporalGraph, k: int = 5, defend: bool = True) -> list[Forecast]:
    """One forecast per stage of the attack (0 … K−1 hops observed)."""
    hours = prediction_hours(g)
    states = states_at(model, g, hours, ckpt.get("context", 24))
    T = ckpt.get("temperatures", {}).get("hop", 1.0)
    return [forecast_from_state(g, m, *states[t], model, T, k=k, defend=defend) for m, t in enumerate(hours)]
