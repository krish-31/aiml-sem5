"""Try defensive actions on a copy of the attack graph and recommend the best one.

Actions:
  isolate(v)    cut machine v off the network (all its connections)
  block(u, v)   remove the access that lets someone on u log on to v (privilege removal)

For each action the attacker's move probabilities are re-normalized (blocked moves are
gone, so they spread over the moves that remain), the top paths are ranked again, and

    utility = (risk before − risk after) / risk before − penalty × share of normal traffic blocked

Nothing touches a real system; this only edits the graph.
"""

from __future__ import annotations

from dataclasses import dataclass

import torch

from attackpath.paths.rank import RankedPath, path_risk, top_k_paths


@dataclass
class Action:
    kind: str  # "isolate" | "block"
    nodes: tuple[int, ...]
    risk_after: float
    risk_drop: float  # fraction of risk removed
    blocked: float  # fraction of normal traffic blocked
    utility: float

    def describe(self, names: list[str]) -> str:
        if self.kind == "isolate":
            return f"Isolate {names[self.nodes[0]]}"
        return f"Remove access {names[self.nodes[0]]} → {names[self.nodes[1]]}"


def _renormalize(P: torch.Tensor) -> torch.Tensor:
    s = P.sum(dim=1, keepdim=True)
    return torch.where(s > 0, P / s.clamp_min(1e-12), P)


def apply_action(P: torch.Tensor, kind: str, nodes: tuple[int, ...]) -> torch.Tensor:
    Q = P.clone()
    if kind == "isolate":
        (v,) = nodes
        Q[v, :] = 0
        Q[:, v] = 0
    else:
        u, v = nodes
        Q[u, v] = 0
    return _renormalize(Q)


def blocked_share(normal: torch.Tensor, kind: str, nodes: tuple[int, ...]) -> float:
    """Share of recent normal machine-to-machine traffic the action would stop."""
    total = float(normal.sum())
    if total == 0:
        return 0.0
    if kind == "isolate":
        (v,) = nodes
        hit = float(normal[v, :].sum() + normal[:, v].sum() - normal[v, v])
    else:
        hit = float(normal[nodes[0], nodes[1]])
    return hit / total


def recommend(
    P: torch.Tensor,
    footholds: list[int],
    targets: list[int],
    normal: torch.Tensor,
    k: int = 10,
    penalty: float = 1.0,
) -> tuple[list[RankedPath], list[Action]]:
    """Returns (baseline top-k paths, candidate actions sorted best first)."""
    base = top_k_paths(P, footholds, targets, k=k)
    base_risk = path_risk(base)
    if base_risk == 0:
        return base, []

    tset = set(targets)
    candidates: set[tuple[str, tuple[int, ...]]] = set()
    for p in base:
        for v in p.nodes:
            if v not in tset:  # taking the crown jewels offline is not an option
                candidates.add(("isolate", (v,)))
        for a, b in zip(p.nodes[:-1], p.nodes[1:]):
            candidates.add(("block", (a, b)))

    actions = []
    for kind, nodes in candidates:
        Q = apply_action(P, kind, nodes)
        fh = [f for f in footholds if not (kind == "isolate" and f == nodes[0])]
        risk = path_risk(top_k_paths(Q, fh, targets, k=k)) if fh else 0.0
        drop = (base_risk - risk) / base_risk
        blk = blocked_share(normal, kind, nodes)
        actions.append(Action(kind, nodes, risk, drop, blk, drop - penalty * blk))
    actions.sort(key=lambda a: (-a.utility, a.blocked))
    return base, actions


def split_actions(
    actions: list[Action], footholds: list[int], current: int, P: torch.Tensor, targets: list[int]
) -> tuple[Action | None, list[Action]]:
    """Separate routine containment from the recommended next cut.

    Containment = isolating a machine already known to be compromised (first aid, always worth doing).
    Next cut = any other action, with actions on the likely routes from the attacker's *current*
    machine ranked first, so the advice targets where the attacker is heading now rather than an
    old foothold.
    """
    contain = next((a for a in actions if a.kind == "isolate" and a.nodes[0] in footholds), None)
    rest = [a for a in actions if not (a.kind == "isolate" and a.nodes[0] in footholds)]
    ahead = top_k_paths(P, [current], targets, k=10)
    edges = {(a, b) for p in ahead for a, b in zip(p.nodes[:-1], p.nodes[1:])}
    nodes = {v for p in ahead for v in p.nodes[1:]} - set(footholds) - set(targets)

    def on_route(a: Action) -> bool:
        return tuple(a.nodes) in edges if a.kind == "block" else a.nodes[0] in nodes

    return contain, [a for a in rest if on_route(a)] + [a for a in rest if not on_route(a)]
