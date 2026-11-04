import pandas as pd
import pytest
import torch

from attackpath.data.synthetic import SyntheticConfig, generate
from attackpath.graph.builder import (
    C2C,
    C2C_REV,
    COMPUTER_FEATURES,
    U2C,
    USER_FEATURES,
    build_from_tables,
    build_one,
    load_graphs,
    negative_sample,
    save_graphs,
    split_graphs,
    time_split,
)


@pytest.fixture(scope="module")
def built():
    cfg = SyntheticConfig(n_graphs=4, days=4, seed=3)
    events, nodes, attacks = generate(cfg, verbose=False)
    return events, nodes, attacks, build_from_tables(events, nodes, attacks, verbose=False)


def test_shapes(built):
    events, nodes, _, graphs = built
    assert len(graphs) == 4
    for g in graphs:
        assert g.num_windows == 4 * 24
        assert g.x_computer.shape == (g.num_windows, g.num_computers, len(COMPUTER_FEATURES))
        assert g.x_user.shape == (g.num_windows, g.num_users, len(USER_FEATURES))
        assert torch.isfinite(g.x_computer).all() and (g.x_computer[..., :7] >= 0).all()
        assert g.critical.sum() >= 2  # domain controller + at least one database


def test_edge_counts_match_events(built):
    events, _, _, graphs = built
    for g in graphs:
        ev = events[events.graph_id == g.graph_id]
        assert g.c2c.count.sum().item() == (ev.src != ev.dst).sum()
        assert g.u2c.count.sum().item() == len(ev)
        assert (g.c2c.src != g.c2c.dst).all()
        assert torch.all(g.c2c.t[1:] >= g.c2c.t[:-1])


def test_window_slicing(built):
    *_, graphs = built
    g = graphs[0]
    total = sum(g.c2c.at(t)[0].shape[1] for t in range(g.num_windows))
    assert total == len(g.c2c.t)
    t = int(g.c2c.t[len(g.c2c.t) // 2])
    ei, _, _ = g.c2c.at(t)
    mask = g.c2c.t == t
    assert torch.equal(ei[0], g.c2c.src[mask]) and torch.equal(ei[1], g.c2c.dst[mask])


def test_attack_hops_appear_as_attack_edges(built):
    *_, attacks, graphs = built
    for g in graphs:
        path = g.attack_path
        assert len(g.attack_hop_windows) == len(path) - 1
        for (a, b), t in zip(zip(path[:-1], path[1:]), g.attack_hop_windows):
            ei, _, atk = g.c2c.at(t)
            hit = (ei[0] == a) & (ei[1] == b)
            assert hit.any() and atk[hit].all(), "attack hop must be an attack-labeled edge in its window"
        assert g.critical[path[-1]]


def test_snapshot_is_valid_heterodata(built):
    *_, graphs = built
    g = graphs[1]
    d = g.snapshot(g.attack_hop_windows[0])
    d.validate(raise_on_error=True)
    assert d[C2C].attack.any()
    assert torch.equal(d[C2C_REV].edge_index, d[C2C].edge_index.flip(0))
    assert d[U2C].edge_index[0].max() < g.num_users


def test_novelty_feature_fires_for_new_connections():
    # A->B in window 0, A->B again in window 1, C->B (new) in window 1
    ev = pd.DataFrame(
        {"time": [10, 3700, 3800], "user": ["u", "u", "v"], "src": ["A", "A", "C"], "dst": ["B", "B", "B"],
         "is_attack": [False, False, True], "attack_step": [0, 0, 1]}
    )
    g = build_one(ev, computers=["A", "B", "C"], users=["u", "v"], critical={"B"}, t0=0)
    novel = COMPUTER_FEATURES.index("log_novel_in")
    assert g.x_computer[1, 1, novel] == pytest.approx(torch.log1p(torch.tensor(1.0)).item())
    assert g.x_computer[1, 0, novel] == 0
    assert g.c2c.attack.tolist() == [False, False, True]


def test_save_load_roundtrip(built, tmp_path):
    *_, graphs = built
    save_graphs(graphs, tmp_path / "g.pt")
    loaded = load_graphs(tmp_path / "g.pt")
    assert len(loaded) == len(graphs)
    a, b = graphs[2], loaded[2]
    assert a.computers == b.computers and a.attack_path == b.attack_path
    assert torch.equal(a.x_computer, b.x_computer) and torch.equal(a.c2c.ptr, b.c2c.ptr)


def test_splits_and_negatives(built):
    *_, graphs = built
    tr, va, te = split_graphs(graphs * 5, seed=0)
    assert len(tr) + len(va) + len(te) == 20
    a, b, c = time_split(100)
    assert (a.stop, b.stop, c.stop) == (70, 85, 100)

    pos = torch.tensor([[0, 1, 2], [1, 2, 0]])
    neg = negative_sample(pos, num_nodes=10, ratio=3, generator=torch.Generator().manual_seed(0))
    assert neg.shape == (2, 9)
    assert (neg[0] != neg[1]).all()
    assert not ({tuple(x) for x in neg.T.tolist()} & {tuple(x) for x in pos.T.tolist()})
