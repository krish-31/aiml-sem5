"""Temporal graph neural network: graph attention per hour + GRU memory across hours.

    snapshot t ──► 2× heterogeneous GAT ──► GRU (memory from t-1) ──► node state h_t
                                                                         │
                         ┌───────────────────────────────────────────────┤
                         ▼                                               ▼
        link head: will u→v appear in hour t+1?      hop head: attacker on u, where next?
        (sigmoid, trained on all traffic)            (softmax over machines, trained on attack hops)

Both heads also see a few "pair" facts from the history so far (has u ever connected
to v, how many users log on to both), the same kind of signal Euler-style models use.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GATConv, HeteroConv

from attackpath.graph.builder import C2C, C2C_REV, COMPUTER_FEATURES, U2C, U2C_REV, USER_FEATURES, TemporalGraph

PAIR_FEATURES = [
    "seen_u_to_v",  # u has connected to v before
    "seen_v_to_u",
    "log_shared_users",  # users who log on to both: their stolen passwords would work on v
    "log_past_u_to_v",
    "cred_value_u",  # strongest account seen on u (how many machines it reaches), i.e. what can be dumped there
    "cred_value_v",  # same for v: attackers go where powerful credentials are (BloodHound-style)
    "log_users_v",  # how many different accounts log on to v
    "log_sources_v",  # how many machines connect to v
]


class History:
    """Running totals of everything observed so far in one network."""

    def __init__(self, g: TemporalGraph, upto: int = 0):
        """Start with all edges from windows < upto."""
        self.g = g
        self.c2c = torch.zeros(g.num_computers, g.num_computers)
        self.u2c = torch.zeros(g.num_users, g.num_computers)
        m = g.c2c.t < upto
        self.c2c.index_put_((g.c2c.src[m], g.c2c.dst[m]), g.c2c.count[m], accumulate=True)
        m = g.u2c.t < upto
        self.u2c.index_put_((g.u2c.src[m], g.u2c.dst[m]), g.u2c.count[m], accumulate=True)

    def add(self, t: int) -> None:
        ei, cnt, _ = self.g.c2c.at(t)
        self.c2c.index_put_((ei[0], ei[1]), cnt, accumulate=True)
        ei, cnt, _ = self.g.u2c.at(t)
        self.u2c.index_put_((ei[0], ei[1]), cnt, accumulate=True)

    def pair_features(self) -> torch.Tensor:
        """[Nc, Nc, len(PAIR_FEATURES)]"""
        n = self.c2c.shape[0]
        seen = (self.c2c > 0).float()
        ua = (self.u2c > 0).float()  # [Nu, Nc] user has logged on to machine
        shared = ua.T @ ua  # users who have logged on to both machines (stealable creds that reach v)
        reach = torch.log1p(ua.sum(1))  # [Nu] how many machines each account reaches
        cred = (ua * reach[:, None]).max(0).values  # [Nc] strongest account seen on each machine
        users_v = torch.log1p(ua.sum(0))
        sources_v = torch.log1p(seen.sum(0))
        col = lambda x: x[None, :].expand(n, n)
        return torch.stack(
            [seen, seen.T, torch.log1p(shared), torch.log1p(self.c2c),
             cred[:, None].expand(n, n), col(cred), col(users_v), col(sources_v)],
            dim=-1,
        )


class PairMLP(nn.Module):
    """Two-layer MLP scoring a (u, v) pair from both node states and pair features."""

    def __init__(self, hidden: int, n_pair: int, dropout: float):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(3 * hidden + n_pair, hidden), nn.ReLU(), nn.Dropout(dropout), nn.Linear(hidden, 1)
        )

    def forward(self, hu: torch.Tensor, hv: torch.Tensor, pf: torch.Tensor) -> torch.Tensor:
        return self.net(torch.cat([hu, hv, hu * hv, pf], dim=-1)).squeeze(-1)


class TemporalGNN(nn.Module):
    def __init__(
        self,
        hidden: int = 64,
        heads: int = 4,
        layers: int = 2,
        dropout: float = 0.2,
        use_gru: bool = True,
        use_pair: bool = True,
    ):
        super().__init__()
        self.config = dict(hidden=hidden, heads=heads, layers=layers, dropout=dropout, use_gru=use_gru, use_pair=use_pair)
        self.use_gru, self.use_pair, self.dropout = use_gru, use_pair, dropout
        self.lin = nn.ModuleDict(
            {"computer": nn.Linear(len(COMPUTER_FEATURES), hidden), "user": nn.Linear(len(USER_FEATURES), hidden)}
        )
        self.convs = nn.ModuleList(
            HeteroConv(
                {
                    et: GATConv((hidden, hidden), hidden // heads, heads=heads, edge_dim=1, add_self_loops=False)
                    for et in (C2C, C2C_REV, U2C, U2C_REV)
                },
                aggr="sum",
            )
            for _ in range(layers)
        )
        self.norms = nn.ModuleList(
            nn.ModuleDict({"computer": nn.LayerNorm(hidden), "user": nn.LayerNorm(hidden)}) for _ in range(layers)
        )
        self.gru = nn.ModuleDict({"computer": nn.GRUCell(hidden, hidden), "user": nn.GRUCell(hidden, hidden)})
        n_pair = len(PAIR_FEATURES) if use_pair else 0
        self.link_head = PairMLP(hidden, n_pair, dropout)
        self.hop_head = PairMLP(hidden, n_pair, dropout)
        self.hidden = hidden

    # ------------------------------------------------------------------ encoding
    def init_state(self, g: TemporalGraph) -> dict[str, torch.Tensor]:
        return {"computer": torch.zeros(g.num_computers, self.hidden), "user": torch.zeros(g.num_users, self.hidden)}

    def encode(self, snap) -> dict[str, torch.Tensor]:
        x = {k: F.relu(self.lin[k](snap[k].x)) for k in ("computer", "user")}
        for conv, norm in zip(self.convs, self.norms):
            out = conv(x, snap.edge_index_dict, edge_attr_dict=snap.edge_attr_dict)
            x = {k: norm[k](x[k] + F.elu(out[k])) for k in x}  # residual keeps quiet nodes' own info
            x = {k: F.dropout(v, self.dropout, self.training) for k, v in x.items()}
        return x

    def step(self, snap, state: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
        """Read one hourly snapshot and update every node's memory."""
        z = self.encode(snap)
        if not self.use_gru:  # ablation: no memory of earlier hours
            return z
        return {k: self.gru[k](z[k], state[k]) for k in z}

    # ------------------------------------------------------------------- heads
    def _pf(self, pf: torch.Tensor) -> torch.Tensor:
        return pf if self.use_pair else pf[..., :0]

    def link_logits(self, h: torch.Tensor, pairs: torch.Tensor, pf_all: torch.Tensor) -> torch.Tensor:
        """Logit that edge pairs[:, i] appears in the next hour."""
        u, v = pairs
        return self.link_head(h[u], h[v], self._pf(pf_all[u, v]))

    def hop_logits(self, h: torch.Tensor, u: int, pf_all: torch.Tensor, exclude: list[int] | None = None) -> torch.Tensor:
        """Logits over every machine for the attacker's next hop from u (excluded machines get -inf)."""
        n = h.shape[0]
        out = self.hop_head(h[u].expand(n, -1), h, self._pf(pf_all[u]))
        mask = torch.zeros(n, dtype=torch.bool)
        mask[u] = True
        if exclude:
            mask[exclude] = True
        return out.masked_fill(mask, float("-inf"))


def run_until(model: TemporalGNN, g: TemporalGraph, start: int, end: int):
    """Process windows start..end (inclusive). Returns (computer state, pair features) after `end`."""
    hist = History(g, upto=start)
    state = model.init_state(g)
    for t in range(start, end + 1):
        state = model.step(g.snapshot(t), state)
        hist.add(t)
    return state["computer"], hist.pair_features()


def save_model(model: TemporalGNN, path, **extra) -> None:
    torch.save({"config": model.config, "state_dict": model.state_dict(), **extra}, path)


def load_model(path) -> tuple[TemporalGNN, dict]:
    ckpt = torch.load(path, weights_only=True)
    model = TemporalGNN(**ckpt["config"])
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt
