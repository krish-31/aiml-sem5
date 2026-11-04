"""Synthetic enterprise networks with labeled multi-step attacks.

Public logs (LANL, CICIDS2017, UNSW-NB15) mark single attack events but never the
complete path an attacker took. This module creates small fake company networks,
simulates days of normal logins, and injects one attack that hops from an entry
workstation to a critical asset. That gives ground-truth paths for training and
for measuring top-k path hit rate.

Events use the same shape as the LANL auth logs, so the rest of the pipeline
treats both alike:

    time (seconds from start), user, src (computer), dst (computer)

Run:
    python -m attackpath.data.synthetic --n-graphs 300 --out data/synthetic
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

DAY = 86_400
HOUR = 3_600
MINUTE = 60

SERVER_ROLES = ["file_server", "mail_server", "app_server", "web_server", "print_server"]
CRITICAL_ROLES = ["domain_controller", "database"]


@dataclass
class SyntheticConfig:
    n_graphs: int = 300
    days: int = 7
    min_workstations: int = 25
    max_workstations: int = 70
    min_servers: int = 4
    max_servers: int = 10
    n_databases: tuple[int, int] = (1, 2)
    admin_frac: float = 0.08  # share of users who are admins
    lateral_ws_links: int = 3  # workstations each workstation can reach via local-admin reuse
    user_events_per_day: float = 14.0  # weekday mean, regular user
    admin_events_per_day: float = 30.0
    weekend_factor: float = 0.15
    benign_novel_frac: float = 0.01  # rare harmless logins to unusual machines (noise)
    # normal users don't always sit at their own desk; without this, "logged in from a
    # machine that isn't yours" would give away every attack hop
    roam_frac: float = 0.06  # regular user logs in from another workstation
    admin_hop_frac: float = 0.30  # admin works from one of their servers (jump host)
    attack_min_steps: int = 3
    attack_max_steps: int = 6
    attack_gap_mean_min: float = 45.0  # mean minutes between attack hops
    attack_warmup_days: float = 2.0  # attacks start after this much normal history
    # attackers are goal-driven (credential dumping, MITRE ATT&CK T1003): they prefer machines
    # where admins log on, and servers, over random workstations. 1.0 = purely random walk.
    attack_admin_bias: float = 6.0
    attack_server_bias: float = 2.0
    seed: int = 42

    def __post_init__(self) -> None:
        if self.days < self.attack_warmup_days + 2:
            raise ValueError(
                f"days={self.days} is too short: need at least {self.attack_warmup_days:g} warmup days "
                "plus 1 day for the attack and 1 day of follow-up"
            )


@dataclass
class Network:
    """One fake company: machines, users and who normally logs in where."""

    computers: dict[str, str]  # name -> role
    users: dict[str, str]  # name -> "regular" | "admin" | "service"
    home: dict[str, str]  # user -> home workstation (or host machine for service accounts)
    access: dict[str, list[str]]  # user -> machines they normally log in to
    lateral: dict[str, list[str]] = field(default_factory=dict)  # ws -> ws reachable by cred reuse

    @property
    def critical(self) -> list[str]:
        return [c for c, r in self.computers.items() if r in CRITICAL_ROLES]

    @property
    def workstations(self) -> list[str]:
        return [c for c, r in self.computers.items() if r == "workstation"]

    def users_with_access(self, machine: str) -> list[str]:
        return [u for u, acc in self.access.items() if machine in acc]


# --------------------------------------------------------------------------- network


def build_network(rng: np.random.Generator, cfg: SyntheticConfig) -> Network:
    n_ws = int(rng.integers(cfg.min_workstations, cfg.max_workstations + 1))
    n_srv = int(rng.integers(cfg.min_servers, cfg.max_servers + 1))
    n_db = int(rng.integers(cfg.n_databases[0], cfg.n_databases[1] + 1))

    computers: dict[str, str] = {}
    names = iter(f"C{i}" for i in rng.permutation(n_ws + n_srv + 1 + n_db + 50))
    ws = [next(names) for _ in range(n_ws)]
    for c in ws:
        computers[c] = "workstation"
    servers = [next(names) for _ in range(n_srv)]
    for i, c in enumerate(servers):
        # guarantee at least one app server so databases are reachable
        computers[c] = "app_server" if i == 0 else str(rng.choice(SERVER_ROLES))
    dc = next(names)
    computers[dc] = "domain_controller"
    dbs = [next(names) for _ in range(n_db)]
    for c in dbs:
        computers[c] = "database"
    app_servers = [c for c in servers if computers[c] == "app_server"]

    users: dict[str, str] = {}
    home: dict[str, str] = {}
    access: dict[str, list[str]] = {}
    unames = iter(f"U{i}" for i in rng.permutation(n_ws + 10))
    n_admins = max(2, round(cfg.admin_frac * n_ws))
    admin_ws = set(rng.choice(ws, size=n_admins, replace=False).tolist())

    for w in ws:
        u = next(unames)
        home[u] = w
        if w in admin_ws:
            users[u] = "admin"
            k = int(rng.integers(max(1, len(servers) // 2), len(servers) + 1))
            srv = rng.choice(servers, size=k, replace=False).tolist()
            crit = [dc] + rng.choice(dbs, size=int(rng.integers(1, len(dbs) + 1)), replace=False).tolist()
            access[u] = [w] + srv + crit
        else:
            users[u] = "regular"
            k = int(rng.integers(1, min(3, len(servers)) + 1))
            access[u] = [w] + rng.choice(servers, size=k, replace=False).tolist()

    # service accounts: app servers talking to databases around the clock
    for a in app_servers:
        u = next(unames)
        users[u] = "service"
        home[u] = a
        access[u] = [a] + rng.choice(dbs, size=int(rng.integers(1, len(dbs) + 1)), replace=False).tolist()

    # workstation -> workstation reachability via shared local-admin passwords
    lateral = {
        w: rng.choice([x for x in ws if x != w], size=min(cfg.lateral_ws_links, n_ws - 1), replace=False).tolist()
        for w in ws
    }
    return Network(computers, users, home, access, lateral)


# --------------------------------------------------------------------- normal traffic


def _diurnal_times(rng: np.random.Generator, day: int, n: int) -> np.ndarray:
    """Login times clustered around office hours (peak ~10:00 and ~15:00)."""
    peak = rng.choice([10.0, 15.0], size=n)
    hours = np.clip(rng.normal(peak, 2.2), 0, 23.999)
    return (day * DAY + hours * HOUR).astype(np.int64)


def simulate_normal(rng: np.random.Generator, net: Network, cfg: SyntheticConfig) -> pd.DataFrame:
    rows: list[np.ndarray] = []
    users_l, src_l, dst_l = [], [], []
    all_servers = [c for c, r in net.computers.items() if r != "workstation"]
    all_ws = net.workstations

    for day in range(cfg.days):
        weekend = day % 7 in (5, 6)
        for u, kind in net.users.items():
            h, acc = net.home[u], net.access[u]
            if kind == "service":
                # every ~30 min, all day: app server -> database
                t = np.arange(day * DAY, (day + 1) * DAY, 30 * MINUTE) + rng.integers(0, 300)
                dsts = rng.choice(acc[1:], size=len(t))
                rows.append(t)
                users_l += [u] * len(t)
                src_l += [h] * len(t)
                dst_l += dsts.tolist()
                continue

            lam = cfg.admin_events_per_day if kind == "admin" else cfg.user_events_per_day
            if weekend:
                lam *= cfg.weekend_factor
            n = int(rng.poisson(lam))
            if n == 0:
                continue
            t = _diurnal_times(rng, day, n)
            # 40% local logons to own workstation, the rest to machines they normally use
            p = np.full(len(acc), 0.6 / max(1, len(acc) - 1))
            p[0] = 0.4 if len(acc) > 1 else 1.0
            dsts = rng.choice(acc, size=n, p=p / p.sum()).tolist()
            srcs = [h] * n
            # rare benign novelty: a user touches a server they don't usually use
            for i in np.flatnonzero(rng.random(n) < cfg.benign_novel_frac):
                dsts[i] = str(rng.choice(all_servers))
            # benign "login from somewhere else": hot-desking users, admins on jump hosts
            if kind == "admin":
                hosts = [m for m in acc[1:] if net.computers[m] not in CRITICAL_ROLES]
                frac = cfg.admin_hop_frac
            else:
                hosts = [w for w in all_ws if w != h]
                frac = cfg.roam_frac
            for i in np.flatnonzero(rng.random(n) < frac) if hosts else []:
                srcs[i] = str(rng.choice(hosts))
                if srcs[i] == dsts[i]:
                    dsts[i] = srcs[i] if kind == "regular" else str(rng.choice(acc))
            rows.append(t)
            users_l += [u] * n
            src_l += srcs
            dst_l += dsts

    return pd.DataFrame(
        {
            "time": np.concatenate(rows) if rows else np.array([], dtype=np.int64),
            "user": users_l,
            "src": src_l,
            "dst": dst_l,
        }
    )


# ---------------------------------------------------------------------------- attack


def _hop_options(net: Network, machine: str) -> list[str]:
    """Machines an attacker could reach next from `machine` with stealable credentials."""
    opts: set[str] = set(net.lateral.get(machine, []))
    for u in net.users_with_access(machine):  # creds of anyone who logs in here
        opts.update(net.access[u])
    opts.discard(machine)
    return sorted(opts)


def _attractiveness(net: Network, machine: str, cfg: SyntheticConfig) -> float:
    """How much an attacker wants this machine: admin credentials to steal, or a server."""
    w = 1.0
    if any(net.users[u] == "admin" for u in net.users_with_access(machine)):
        w *= cfg.attack_admin_bias
    if net.computers[machine] != "workstation":
        w *= cfg.attack_server_bias
    return w


def _sample_path(rng: np.random.Generator, net: Network, cfg: SyntheticConfig, entry: str) -> list[str] | None:
    """Randomized depth-first search for a simple path of 3–6 hops ending at a critical asset.

    Critical assets may only appear as the final node, so the attacker never passes
    through one on the way to another.
    """
    target_len = int(rng.integers(cfg.attack_min_steps, cfg.attack_max_steps + 1))
    critical = set(net.critical)
    weight = {c: _attractiveness(net, c, cfg) for c in net.computers}

    def dfs(path: list[str]) -> list[str] | None:
        hops = len(path) - 1
        nbrs = [n for n in _hop_options(net, path[-1]) if n not in path]
        # goal-driven attacker: try valuable machines first (weighted random order, Gumbel trick)
        keys = [np.log(weight[n]) + rng.gumbel() for n in nbrs]
        nbrs = [n for _, n in sorted(zip(keys, nbrs), reverse=True)]
        if hops == target_len - 1:
            ends = [n for n in nbrs if n in critical]
            return path + [ends[0]] if ends else None
        for n in nbrs:
            if n in critical:
                continue
            found = dfs(path + [n])
            if found:
                return found
        return None

    return dfs([entry])


def _pick_user(rng: np.random.Generator, net: Network, creds: list[str], dst: str) -> str:
    """Use a stolen credential that legitimately reaches `dst`; else reuse any stolen one."""
    valid = [u for u in creds if dst in net.access[u]]
    return str(rng.choice(valid)) if valid else str(rng.choice(creds))


def inject_attack(
    rng: np.random.Generator, net: Network, cfg: SyntheticConfig
) -> tuple[pd.DataFrame, dict] | None:
    for _ in range(50):  # some entry points can't reach a critical asset at the chosen length
        entry = str(rng.choice(net.workstations))
        path = _sample_path(rng, net, cfg, entry)
        if path:
            break
    else:
        return None

    victim = next(u for u, h in net.home.items() if h == entry and net.users[u] != "service")
    creds = [victim]
    start = int(rng.integers(cfg.attack_warmup_days * DAY, (cfg.days - 1) * DAY))
    t = start
    times, users, srcs, dsts, steps = [], [], [], [], []

    for step, (a, b) in enumerate(zip(path[:-1], path[1:]), start=1):
        # credential dumping on the current machine: grab creds of its usual users
        creds = sorted(set(creds) | {u for u in net.users_with_access(a) if net.users[u] != "service"})
        u = _pick_user(rng, net, creds, b)
        n_tries = 1 + int(rng.poisson(0.7))  # failed attempts / retries on the same hop
        for k in range(n_tries):
            times.append(t + k * int(rng.integers(5, 120)))
            users.append(u)
            srcs.append(a)
            dsts.append(b)
            steps.append(step)
        gap = rng.exponential(cfg.attack_gap_mean_min) * MINUTE
        t += int(np.clip(gap, 2 * MINUTE, 6 * HOUR))

    events = pd.DataFrame({"time": times, "user": users, "src": srcs, "dst": dsts, "attack_step": steps})
    info = {
        "entry": entry,
        "target": path[-1],
        "target_role": net.computers[path[-1]],
        "path": path,
        "n_steps": len(path) - 1,
        "victim_user": victim,
        "start_time": start,
        "end_time": int(max(times)),
    }
    return events, info


# ---------------------------------------------------------------------------- driver


def generate_one(graph_id: int, cfg: SyntheticConfig) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    rng = np.random.default_rng([cfg.seed, graph_id])
    while True:
        net = build_network(rng, cfg)
        result = inject_attack(rng, net, cfg)
        if result:
            break
    atk_events, info = result

    normal = simulate_normal(rng, net, cfg)
    normal["attack_step"] = 0
    events = pd.concat([normal, atk_events], ignore_index=True)
    events["is_attack"] = events["attack_step"] > 0
    events = events.sort_values("time", kind="stable").reset_index(drop=True)
    events.insert(0, "graph_id", graph_id)

    crit = set(net.critical)
    nodes = pd.DataFrame(
        [{"node": c, "kind": "computer", "role": r, "is_critical": c in crit} for c, r in net.computers.items()]
        + [{"node": u, "kind": "user", "role": k, "is_critical": False} for u, k in net.users.items()]
    )
    nodes.insert(0, "graph_id", graph_id)
    info = {"graph_id": graph_id, **info}
    return events, nodes, info


def generate(cfg: SyntheticConfig, out_dir: str | Path | None = None, verbose: bool = True):
    all_events, all_nodes, all_attacks = [], [], []
    for gid in range(cfg.n_graphs):
        e, n, a = generate_one(gid, cfg)
        all_events.append(e)
        all_nodes.append(n)
        all_attacks.append(a)
        if verbose and (gid + 1) % 50 == 0:
            print(f"  generated {gid + 1}/{cfg.n_graphs} graphs")

    events = pd.concat(all_events, ignore_index=True)
    nodes = pd.concat(all_nodes, ignore_index=True)
    attacks = pd.DataFrame(all_attacks)

    if out_dir is not None:
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        events.to_parquet(out / "events.parquet", index=False)
        nodes.to_parquet(out / "nodes.parquet", index=False)
        attacks.to_parquet(out / "attacks.parquet", index=False)
        (out / "config.json").write_text(json.dumps(asdict(cfg), indent=2))
    return events, nodes, attacks


def summarize(events: pd.DataFrame, nodes: pd.DataFrame, attacks: pd.DataFrame) -> str:
    n_atk = int(events["is_attack"].sum())
    comp = nodes[nodes["kind"] == "computer"].groupby("graph_id").size()
    lines = [
        f"graphs:          {attacks.shape[0]}",
        f"events:          {len(events):,}  (attack: {n_atk:,} = {n_atk / len(events):.3%})",
        f"computers/graph: {comp.min()}–{comp.max()} (mean {comp.mean():.0f})",
        f"attack hops:     {attacks['n_steps'].value_counts().sort_index().to_dict()}",
        f"attack targets:  {attacks['target_role'].value_counts().to_dict()}",
    ]
    return "\n".join(lines)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--n-graphs", type=int, default=SyntheticConfig.n_graphs)
    p.add_argument("--days", type=int, default=SyntheticConfig.days)
    p.add_argument("--seed", type=int, default=SyntheticConfig.seed)
    p.add_argument("--out", default="data/synthetic")
    args = p.parse_args()

    cfg = SyntheticConfig(n_graphs=args.n_graphs, days=args.days, seed=args.seed)
    print(f"Generating {cfg.n_graphs} synthetic networks ({cfg.days} days each) -> {args.out}")
    events, nodes, attacks = generate(cfg, args.out)
    print(summarize(events, nodes, attacks))


if __name__ == "__main__":
    main()
