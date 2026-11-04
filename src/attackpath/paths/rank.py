"""Rank the most likely complete attack paths to critical assets.

The model gives P(next machine = v | attacker on u) for every pair. Treat that as a
map where each road costs −log P. The cheapest routes are then the most likely ones,
and Yen's k-shortest-paths algorithm (NetworkX `shortest_simple_paths`) lists them in order.

The attacker may continue from any machine they already hold, so all footholds are
joined to one virtual start node at zero cost.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from itertools import islice

import networkx as nx
import torch

START, END = "__start__", "__end__"


@dataclass
class RankedPath:
    nodes: list[int]  # machine indices, first = foothold, last = critical asset
    prob: float  # product of hop probabilities

    @property
    def hops(self) -> int:
        return len(self.nodes) - 1


def build_attack_graph(P: torch.Tensor, footholds: list[int], targets: list[int], per_node: int = 8, min_prob: float = 1e-4) -> nx.DiGraph:
    """Keep each machine's `per_node` most likely next hops; critical assets end the path."""
    G = nx.DiGraph()
    tset, fset = set(targets), set(footholds)
    for u in range(P.shape[0]):
        if u in tset:
            G.add_edge(u, END, weight=0.0)
            continue
        row = P[u]
        k = min(per_node, int((row > 0).sum()))
        if k == 0:
            continue
        vals, idx = row.topk(k)
        for p, v in zip(vals.tolist(), idx.tolist()):
            if p >= min_prob and v not in fset:  # no need to "reach" a machine already held
                G.add_edge(u, v, weight=-math.log(p))
    for f in footholds:
        if f in G or f in tset:
            G.add_edge(START, f, weight=0.0)
    return G


def top_k_paths(
    P: torch.Tensor,
    footholds: list[int],
    targets: list[int],
    k: int = 5,
    max_hops: int = 6,
    per_node: int = 8,
    max_tries: int = 300,
) -> list[RankedPath]:
    """The k most likely simple paths from any foothold to any critical asset (≤ max_hops hops)."""
    G = build_attack_graph(P, footholds, targets, per_node)
    if START not in G or END not in G:
        return []
    out: list[RankedPath] = []
    try:
        for path in islice(nx.shortest_simple_paths(G, START, END, weight="weight"), max_tries):
            nodes = path[1:-1]
            if len(nodes) - 1 > max_hops or len(nodes) < 2:
                continue
            prob = math.prod(float(P[a, b]) for a, b in zip(nodes[:-1], nodes[1:]))
            out.append(RankedPath(nodes, prob))
            if len(out) == k:
                break
    except nx.NetworkXNoPath:
        pass
    return out


def path_risk(paths: list[RankedPath]) -> float:
    """Total risk = sum of the probabilities of the ranked paths."""
    return sum(p.prob for p in paths)
