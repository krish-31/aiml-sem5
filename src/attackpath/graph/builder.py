"""Turn login events into a sequence of hourly graph snapshots.

Input: events in the common format shared by every dataset

    graph_id, time (seconds), user, src (computer), dst (computer), is_attack, attack_step

Output: one `TemporalGraph` per network. It holds everything compactly (edges carry
a window index, node features are a [T, N, F] tensor) and builds a PyTorch
Geometric `HeteroData` snapshot for any window on demand.

Node types:  computer, user
Edge types:  computer -connects-> computer   (src != dst)
             user     -logs_on->  computer   (user authenticates to dst)
             plus a reverse edge type for each, so information flows both ways

Run:
    python -m attackpath.graph.builder --in data/synthetic --out data/processed/synthetic.pt
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch_geometric.data import HeteroData

HOUR = 3_600

COMPUTER_FEATURES = [
    "log_out_events",  # connections started from this machine (to other machines)
    "log_in_events",  # logons received (including local logons)
    "log_out_partners",  # distinct machines it connected to
    "log_in_partners",  # distinct machines that connected to it
    "log_in_users",  # distinct users who logged on to it
    "log_novel_in",  # incoming connections from a machine never seen connecting here before
    "is_critical",  # chosen by hand per dataset (domain controllers, databases)
    "hour_sin",
    "hour_cos",
    "is_weekend",
]
USER_FEATURES = [
    "log_events",
    "log_dst",  # distinct machines logged on to
    "log_src",  # distinct machines logged on from
    "log_novel_dst",  # logons to a machine this user never used before
    "log_novel_src",  # logons from a machine this user never used before
    "hour_sin",
    "hour_cos",
    "is_weekend",
]

C2C = ("computer", "connects", "computer")
C2C_REV = ("computer", "rev_connects", "computer")
U2C = ("user", "logs_on", "computer")
U2C_REV = ("computer", "rev_logs_on", "user")


@dataclass
class EdgeStream:
    """All edges of one type across all windows, sorted by window."""

    t: torch.Tensor  # [E] window index
    src: torch.Tensor  # [E]
    dst: torch.Tensor  # [E]
    count: torch.Tensor  # [E] events aggregated into this edge
    attack: torch.Tensor  # [E] bool, any attack event on this edge in this window
    ptr: torch.Tensor  # [T + 1] edges of window t are ptr[t]:ptr[t + 1]

    def at(self, t: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """(edge_index [2, e], count [e], attack [e]) for window t."""
        a, b = int(self.ptr[t]), int(self.ptr[t + 1])
        return torch.stack([self.src[a:b], self.dst[a:b]]), self.count[a:b], self.attack[a:b]


@dataclass
class TemporalGraph:
    graph_id: int
    window: int  # seconds per snapshot
    t0: int  # time of window 0
    computers: list[str]
    users: list[str]
    critical: torch.Tensor  # [Nc] bool
    x_computer: torch.Tensor  # [T, Nc, Fc]
    x_user: torch.Tensor  # [T, Nu, Fu]
    c2c: EdgeStream
    u2c: EdgeStream
    # ground truth (synthetic data only): attack path as computer indices + the window of each hop
    attack_path: list[int] | None = None
    attack_hop_windows: list[int] | None = None
    meta: dict = field(default_factory=dict)

    @property
    def num_windows(self) -> int:
        return self.x_computer.shape[0]

    @property
    def num_computers(self) -> int:
        return len(self.computers)

    @property
    def num_users(self) -> int:
        return len(self.users)

    def snapshot(self, t: int) -> HeteroData:
        """The graph of everything that happened during window t."""
        d = HeteroData()
        d["computer"].x = self.x_computer[t]
        d["user"].x = self.x_user[t]
        for stream, fwd, rev in ((self.c2c, C2C, C2C_REV), (self.u2c, U2C, U2C_REV)):
            ei, cnt, atk = stream.at(t)
            w = torch.log1p(cnt).unsqueeze(-1)
            d[fwd].edge_index, d[fwd].edge_attr, d[fwd].attack = ei, w, atk
            d[rev].edge_index, d[rev].edge_attr = ei.flip(0), w
        d.t = t
        return d

    def __repr__(self) -> str:
        return (
            f"TemporalGraph(id={self.graph_id}, windows={self.num_windows}, computers={self.num_computers}, "
            f"users={self.num_users}, c2c_edges={len(self.c2c.t)}, u2c_edges={len(self.u2c.t)}, "
            f"attack_hops={len(self.attack_path) - 1 if self.attack_path else 0})"
        )


# ---------------------------------------------------------------------------- building


def _novel(df: pd.DataFrame, keys: list[str]) -> np.ndarray:
    """True for events in the first window where this key combination ever appears."""
    first = df.groupby(keys)["w"].transform("min")
    return (df["w"] == first).to_numpy()


def _dense(T: int, N: int, cols: list[pd.Series]) -> np.ndarray:
    """Scatter per-(window, node) values into a [T, N, len(cols)] array."""
    out = np.zeros((T, N, len(cols)), dtype=np.float32)
    for f, s in enumerate(cols):
        if len(s):
            w = s.index.get_level_values(0).to_numpy()
            n = s.index.get_level_values(1).to_numpy()
            out[w, n, f] = s.to_numpy(dtype=np.float32)
    return out


def _time_features(T: int, t0: int, window: int) -> np.ndarray:
    start = t0 + np.arange(T) * window
    hour = (start % 86_400) / HOUR
    day = start // 86_400
    return np.stack(
        [np.sin(2 * np.pi * hour / 24), np.cos(2 * np.pi * hour / 24), (day % 7 >= 5).astype(float)], axis=1
    ).astype(np.float32)


def _edge_stream(df: pd.DataFrame, a: str, b: str, T: int) -> EdgeStream:
    g = (
        df.groupby(["w", a, b], sort=True)
        .agg(count=("is_attack", "size"), attack=("is_attack", "any"))
        .reset_index()
    )
    t = torch.from_numpy(g["w"].to_numpy(np.int64))
    return EdgeStream(
        t=t,
        src=torch.from_numpy(g[a].to_numpy(np.int64)),
        dst=torch.from_numpy(g[b].to_numpy(np.int64)),
        count=torch.from_numpy(g["count"].to_numpy(np.float32)),
        attack=torch.from_numpy(g["attack"].to_numpy(bool)),
        ptr=torch.searchsorted(t, torch.arange(T + 1)),
    )


def build_one(
    events: pd.DataFrame,
    computers: list[str],
    users: list[str],
    critical: set[str],
    graph_id: int = 0,
    window: int = HOUR,
    t0: int | None = None,
    num_windows: int | None = None,
    attack_path: list[str] | None = None,
) -> TemporalGraph:
    """Build the temporal graph of one network from its events."""
    c_idx = {c: i for i, c in enumerate(computers)}
    u_idx = {u: i for i, u in enumerate(users)}
    t0 = int(events["time"].min()) if t0 is None else t0
    e = pd.DataFrame(
        {
            "w": ((events["time"].to_numpy() - t0) // window).astype(np.int64),
            "u": events["user"].map(u_idx).to_numpy(),
            "s": events["src"].map(c_idx).to_numpy(),
            "d": events["dst"].map(c_idx).to_numpy(),
            "is_attack": events["is_attack"].to_numpy(bool) if "is_attack" in events else False,
            "step": events["attack_step"].to_numpy() if "attack_step" in events else 0,
        }
    )
    if e[["u", "s", "d"]].isna().any().any():
        raise ValueError(f"graph {graph_id}: events reference unknown users or computers")
    T = int(e["w"].max()) + 1 if num_windows is None else num_windows
    e = e[e["w"] < T]

    e["novel_sd"] = _novel(e, ["s", "d"])
    e["novel_ud"] = _novel(e, ["u", "d"])
    e["novel_us"] = _novel(e, ["u", "s"])
    remote = e[e["s"] != e["d"]]

    lg = np.log1p
    xc = _dense(
        T,
        len(computers),
        [
            lg(remote.groupby(["w", "s"]).size()),
            lg(e.groupby(["w", "d"]).size()),
            lg(remote.groupby(["w", "s"])["d"].nunique()),
            lg(remote.groupby(["w", "d"])["s"].nunique()),
            lg(e.groupby(["w", "d"])["u"].nunique()),
            lg(remote[remote["novel_sd"]].groupby(["w", "d"]).size()),
        ],
    )
    xu = _dense(
        T,
        len(users),
        [
            lg(e.groupby(["w", "u"]).size()),
            lg(e.groupby(["w", "u"])["d"].nunique()),
            lg(e.groupby(["w", "u"])["s"].nunique()),
            lg(e[e["novel_ud"]].groupby(["w", "u"]).size()),
            lg(e[e["novel_us"]].groupby(["w", "u"]).size()),
        ],
    )
    crit = np.array([c in critical for c in computers], dtype=np.float32)
    tf = _time_features(T, t0, window)
    xc = np.concatenate(
        [xc, np.broadcast_to(crit[None, :, None], (T, len(computers), 1)),
         np.broadcast_to(tf[:, None, :], (T, len(computers), 3))], axis=2
    )
    xu = np.concatenate([xu, np.broadcast_to(tf[:, None, :], (T, len(users), 3))], axis=2)

    hop_windows = None
    if attack_path is not None:
        hops = e[e["is_attack"]].groupby("step")["w"].min().sort_index()
        hop_windows = hops.astype(int).tolist()

    return TemporalGraph(
        graph_id=graph_id,
        window=window,
        t0=t0,
        computers=list(computers),
        users=list(users),
        critical=torch.from_numpy(crit.astype(bool)),
        x_computer=torch.from_numpy(np.ascontiguousarray(xc)),
        x_user=torch.from_numpy(np.ascontiguousarray(xu)),
        c2c=_edge_stream(remote, "s", "d", T),
        u2c=_edge_stream(e, "u", "d", T),
        attack_path=[c_idx[c] for c in attack_path] if attack_path is not None else None,
        attack_hop_windows=hop_windows,
    )


def build_from_tables(
    events: pd.DataFrame,
    nodes: pd.DataFrame,
    attacks: pd.DataFrame | None = None,
    window: int = HOUR,
    verbose: bool = True,
) -> list[TemporalGraph]:
    """Build one TemporalGraph per graph_id from the synthetic-style tables."""
    paths = {} if attacks is None else dict(zip(attacks["graph_id"], attacks["path"]))
    # all synthetic networks start at time 0 and share the same number of windows
    t0 = 0
    T = int(events["time"].max() // window) + 1
    node_groups = dict(tuple(nodes.groupby("graph_id")))
    graphs = []
    for i, (gid, ev) in enumerate(events.groupby("graph_id", sort=True)):
        nd = node_groups[gid]
        comp = nd[nd["kind"] == "computer"]
        path = paths.get(gid)
        graphs.append(
            build_one(
                ev,
                computers=comp["node"].tolist(),
                users=nd.loc[nd["kind"] == "user", "node"].tolist(),
                critical=set(comp.loc[comp["is_critical"], "node"]),
                graph_id=int(gid),
                window=window,
                t0=t0,
                num_windows=T,
                attack_path=list(path) if path is not None else None,
            )
        )
        if verbose and (i + 1) % 50 == 0:
            print(f"  built {i + 1} graphs")
    return graphs


# ------------------------------------------------------------------------ split + sampling


def split_graphs(
    graphs: list[TemporalGraph], fractions=(0.7, 0.15, 0.15), seed: int = 0
) -> tuple[list[TemporalGraph], list[TemporalGraph], list[TemporalGraph]]:
    """Split by network: each synthetic company lands in exactly one of train / val / test.

    (Real single-network datasets like LANL are split by time instead; see `time_split`.)
    """
    order = np.random.default_rng(seed).permutation(len(graphs))
    n_tr = round(fractions[0] * len(graphs))
    n_va = round(fractions[1] * len(graphs))
    pick = lambda idx: [graphs[i] for i in sorted(idx)]
    return pick(order[:n_tr]), pick(order[n_tr : n_tr + n_va]), pick(order[n_tr + n_va :])


def time_split(num_windows: int, fractions=(0.7, 0.15, 0.15)) -> tuple[range, range, range]:
    """Consecutive window ranges for train / val / test, so the model never sees the future."""
    a = round(fractions[0] * num_windows)
    b = a + round(fractions[1] * num_windows)
    return range(0, a), range(a, b), range(b, num_windows)


def negative_sample(
    pos: torch.Tensor, num_nodes: int, ratio: int = 1, generator: torch.Generator | None = None
) -> torch.Tensor:
    """Random computer pairs (no self-loops) that are not edges in `pos` [2, E]. Returns [2, ~ratio*E]."""
    n_want = max(1, ratio * pos.shape[1])
    if num_nodes < 2:
        return pos.new_empty((2, 0))
    taken = set((pos[0] * num_nodes + pos[1]).tolist())
    src = torch.randint(0, num_nodes, (n_want * 2,), generator=generator)
    dst = torch.randint(0, num_nodes - 1, (n_want * 2,), generator=generator)
    dst = dst + (dst >= src).long()  # skip self-loops without bias
    key = (src * num_nodes + dst).tolist()
    keep = [i for i, k in enumerate(key) if k not in taken][:n_want]
    return torch.stack([src[keep], dst[keep]])


# --------------------------------------------------------------------------------- I/O


def save_graphs(graphs: list[TemporalGraph], path: str | Path) -> None:
    """Save as plain dicts of tensors/lists (no pickled classes, loads with weights_only=True)."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    torch.save([asdict(g) for g in graphs], path)


def load_graphs(path: str | Path) -> list[TemporalGraph]:
    raw = torch.load(path, weights_only=True)
    return [
        TemporalGraph(**{**d, "c2c": EdgeStream(**d["c2c"]), "u2c": EdgeStream(**d["u2c"])}) for d in raw
    ]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--in", dest="src", default="data/synthetic")
    p.add_argument("--out", default="data/processed/synthetic.pt")
    p.add_argument("--window", type=int, default=HOUR, help="seconds per snapshot")
    args = p.parse_args()

    src = Path(args.src)
    events = pd.read_parquet(src / "events.parquet")
    nodes = pd.read_parquet(src / "nodes.parquet")
    attacks = pd.read_parquet(src / "attacks.parquet") if (src / "attacks.parquet").exists() else None
    print(f"Building temporal graphs from {src} ({len(events):,} events, window={args.window}s)")
    graphs = build_from_tables(events, nodes, attacks, window=args.window)
    save_graphs(graphs, args.out)
    size = Path(args.out).stat().st_size / 1e6
    print(f"saved {len(graphs)} graphs -> {args.out} ({size:.0f} MB)")
    print("example:", graphs[0])
    print("snapshot:", graphs[0].snapshot(graphs[0].attack_hop_windows[0] if graphs[0].attack_hop_windows else 0))


if __name__ == "__main__":
    main()
