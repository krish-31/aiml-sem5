import math

import pytest
import torch

from attackpath.defense.simulator import apply_action, blocked_share, recommend
from attackpath.paths.rank import path_risk, top_k_paths


def toy():
    """0 = foothold, 3 = critical. Main route 0→1→3 (0.8·0.9), side route 0→2→3 (0.2·0.5)."""
    P = torch.zeros(4, 4)
    P[0, 1], P[0, 2] = 0.8, 0.2
    P[1, 3], P[1, 2] = 0.9, 0.1
    P[2, 3], P[2, 1] = 0.5, 0.5
    return P


def test_top_k_paths_are_ordered_by_probability():
    paths = top_k_paths(toy(), footholds=[0], targets=[3], k=4)
    assert paths[0].nodes == [0, 1, 3] and paths[0].prob == pytest.approx(0.72)
    assert paths[1].nodes == [0, 2, 3] and paths[1].prob == pytest.approx(0.10)
    probs = [p.prob for p in paths]
    assert probs == sorted(probs, reverse=True)
    assert all(len(set(p.nodes)) == len(p.nodes) for p in paths)


def test_max_hops_and_no_path():
    assert all(p.hops <= 1 for p in top_k_paths(toy(), [0], [3], k=5, max_hops=1))
    assert top_k_paths(torch.zeros(4, 4), [0], [3]) == []


def test_any_foothold_can_start_a_path():
    paths = top_k_paths(toy(), footholds=[0, 2], targets=[3], k=3)
    assert [2, 3] in [p.nodes for p in paths]


def test_actions_and_traffic_penalty():
    P = toy()
    Q = apply_action(P, "isolate", (1,))
    assert Q[:, 1].sum() == 0 and Q[1].sum() == 0
    assert Q[0, 2] == pytest.approx(1.0)  # attacker's remaining option takes all the probability
    normal = torch.zeros(4, 4)
    normal[1, 3], normal[0, 2] = 9, 1
    assert blocked_share(normal, "isolate", (1,)) == pytest.approx(0.9)
    assert blocked_share(normal, "block", (0, 2)) == pytest.approx(0.1)


def test_recommend_prefers_cheap_effective_action():
    P = toy()
    normal = torch.zeros(4, 4)
    normal[1, 3] = 100  # node 1 → 3 carries lots of normal traffic
    normal[2, 3] = 1
    base, actions = recommend(P, [0], [3], normal, k=5)
    assert path_risk(base) > 0
    best = actions[0]
    # isolating the foothold kills all risk and blocks almost no normal traffic
    assert best.kind == "isolate" and best.nodes == (0,)
    assert best.risk_drop == pytest.approx(1.0)
    assert all(math.isfinite(a.utility) for a in actions)
