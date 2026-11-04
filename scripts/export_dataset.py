"""Export the synthetic dataset as CSV files you can open in Excel or show in a presentation.

Writes to dataset/:
  networks.csv        one row per synthetic company network (size, split, attack summary)
  nodes.csv           every machine and user, with role and whether it is a critical asset
  attack_hops.csv     every attack hop (when, who, from, to)
  events_NET-062.csv  all login events of the demo network
  events_all.csv.gz   all 1.4 million login events (compressed)

Timestamps use the same calendar mapping as the app (day 1 = Monday of last week).

Run:
    .venv/bin/python scripts/export_dataset.py
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from attackpath.graph.builder import load_graphs, split_graphs
from attackpath.replaytime import replay_base

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "synthetic"
OUT = ROOT / "dataset"
DEMO = 62


def main() -> None:
    OUT.mkdir(exist_ok=True)
    events = pd.read_parquet(SRC / "events.parquet")
    nodes = pd.read_parquet(SRC / "nodes.parquet")
    attacks = pd.read_parquet(SRC / "attacks.parquet")
    base = pd.Timestamp(replay_base())
    stamp = lambda s: (base + pd.to_timedelta(s, unit="s")).dt.strftime("%Y-%m-%d %H:%M:%S")  # noqa: E731

    tr, va, te = split_graphs(load_graphs(ROOT / "data" / "processed" / "synthetic.pt"), seed=0)
    split = {g.graph_id: name for name, gs in (("train", tr), ("val", va), ("test", te)) for g in gs}

    # networks
    comp = nodes[nodes["kind"] == "computer"]
    per = pd.DataFrame({
        "workstations": comp[comp["role"] == "workstation"].groupby("graph_id").size(),
        "servers": comp[(comp["role"] != "workstation") & ~comp["is_critical"]].groupby("graph_id").size(),
        "critical_assets": comp[comp["is_critical"]].groupby("graph_id").size(),
        "users": nodes[nodes["kind"] == "user"].groupby("graph_id").size(),
        "login_events": events.groupby("graph_id").size(),
        "attack_events": events[events["is_attack"]].groupby("graph_id").size(),
    })
    nets = attacks.set_index("graph_id")
    per["network"] = [f"NET-{g:03d}" for g in per.index]
    per["split"] = [split.get(g, "") for g in per.index]
    per["attack_hops"] = nets["n_steps"]
    per["entry_machine"] = nets["entry"]
    per["target_machine"] = nets["target"]
    per["target_role"] = nets["target_role"]
    per["attack_path"] = nets["path"].map(lambda p: " -> ".join(p))
    per["attack_start"] = stamp(nets["start_time"])
    per["attack_end"] = stamp(nets["end_time"])
    cols = ["network", "split", "workstations", "servers", "critical_assets", "users", "login_events",
            "attack_events", "attack_hops", "entry_machine", "target_machine", "target_role", "attack_path",
            "attack_start", "attack_end"]
    per.reset_index().rename(columns={"index": "graph_id"})[["graph_id"] + cols].to_csv(OUT / "networks.csv", index=False)

    # nodes
    n = nodes.copy()
    n.insert(1, "network", n["graph_id"].map(lambda g: f"NET-{g:03d}"))
    n.to_csv(OUT / "nodes.csv", index=False)

    # attack hops (first event of each hop)
    hops = (events[events["is_attack"]].sort_values("time").groupby(["graph_id", "attack_step"]).first().reset_index())
    hops.insert(1, "network", hops["graph_id"].map(lambda g: f"NET-{g:03d}"))
    hops.insert(3, "timestamp", stamp(hops["time"]))
    hops = hops.rename(columns={"attack_step": "hop", "time": "time_seconds"})
    hops[["graph_id", "network", "hop", "timestamp", "time_seconds", "user", "src", "dst"]].to_csv(OUT / "attack_hops.csv", index=False)

    # events
    ev = events.copy()
    ev.insert(1, "timestamp", stamp(ev["time"]))
    ev = ev.rename(columns={"time": "time_seconds"})
    ev[ev["graph_id"] == DEMO].to_csv(OUT / f"events_NET-{DEMO:03d}.csv", index=False)
    ev.to_csv(OUT / "events_all.csv.gz", index=False, compression="gzip")

    for f in sorted(OUT.iterdir()):
        print(f"{f.name:24s} {f.stat().st_size / 1e6:7.2f} MB")


if __name__ == "__main__":
    main()
