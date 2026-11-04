import pandas as pd
import pytest

from attackpath.data.synthetic import DAY, SyntheticConfig, generate


@pytest.fixture(scope="module")
def data():
    cfg = SyntheticConfig(n_graphs=8, days=5, seed=7)
    return cfg, *generate(cfg, verbose=False)


def test_every_graph_has_one_attack(data):
    cfg, events, nodes, attacks = data
    assert sorted(attacks["graph_id"]) == list(range(cfg.n_graphs))
    assert events.groupby("graph_id")["is_attack"].any().all()


def test_attack_paths_are_valid(data):
    cfg, events, nodes, attacks = data
    crit = set(zip(nodes.loc[nodes.is_critical, "graph_id"], nodes.loc[nodes.is_critical, "node"]))
    for a in attacks.itertuples():
        path = list(a.path)
        assert cfg.attack_min_steps <= len(path) - 1 <= cfg.attack_max_steps
        assert len(set(path)) == len(path), "path must not revisit a machine"
        assert (a.graph_id, path[-1]) in crit, "path must end at a critical asset"
        assert not any((a.graph_id, n) in crit for n in path[:-1]), "only the last node is critical"


def test_attack_events_follow_the_path_in_order(data):
    _, events, _, attacks = data
    for a in attacks.itertuples():
        atk = events[(events.graph_id == a.graph_id) & events.is_attack]
        hops = atk.drop_duplicates("attack_step").sort_values("attack_step")
        assert list(hops.src) == list(a.path[:-1])
        assert list(hops.dst) == list(a.path[1:])
        assert hops.time.is_monotonic_increasing
        assert a.start_time >= SyntheticConfig.attack_warmup_days * DAY


def test_events_reference_known_nodes_and_are_sorted(data):
    _, events, nodes, _ = data
    known = set(zip(nodes.graph_id, nodes.node))
    for col in ("user", "src", "dst"):
        assert set(zip(events.graph_id, events[col])) <= known
    assert events.groupby("graph_id")["time"].apply(lambda t: t.is_monotonic_increasing).all()


def test_reproducible():
    cfg = SyntheticConfig(n_graphs=2, days=4, seed=1)
    e1, *_ = generate(cfg, verbose=False)
    e2, *_ = generate(cfg, verbose=False)
    pd.testing.assert_frame_equal(e1, e2)


def test_rejects_too_few_days():
    with pytest.raises(ValueError, match="too short"):
        SyntheticConfig(days=3)
