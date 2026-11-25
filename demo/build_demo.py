"""Bake the simulation page: demo/simulation.html (one self-contained file, no backend).

Reads the committed NET-062 snapshot, its event log, the evaluation results and the
training log, and injects them into demo/lobby.template.html.

    python demo/build_demo.py
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / "demo"

snap = json.loads((ROOT / "web/src/data/snapshot.json").read_text(encoding="utf-8"))
ev = json.loads((ROOT / "results/eval_synthetic.json").read_text(encoding="utf-8"))

train = []
for line in (ROOT / "results/train_log.txt").read_text(encoding="utf-8").splitlines():
    m = re.match(r"epoch\s+(\d+) \| train link ([\d.]+) hop ([\d.]+) \| val link AUC ([\d.]+) hop top1 ([\d.]+) top3 ([\d.]+) \| val loss ([\d.]+)", line)
    if m:
        e, tl, th, auc, t1, t3, vl = m.groups()
        train.append({"ep": int(e), "tl": float(tl), "th": float(th), "auc": float(auc), "t1": float(t1), "t3": float(t3), "vl": float(vl)})

events = []
with open(ROOT / "dataset/events_NET-062.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        ts = r["timestamp"]
        if ts.startswith("2026-10-31") and "13:40:00" <= ts[11:] <= "17:30:00":
            events.append({"t": ts[11:], "user": r["user"], "src": r["src"], "dst": r["dst"],
                           "attack": r["is_attack"] == "True", "step": int(r["attack_step"])})

data = {
    "net": {k: snap[k] for k in ("id", "users", "nodes", "normal_edges", "path", "hops", "hourly", "day")},
    "networks": snap["networks"],
    "events": events,
    "eval": ev,
    "train": train,
}

tpl = (HERE / "lobby.template.html").read_text(encoding="utf-8")
out = tpl.replace("/*__DATA__*/null", json.dumps(data, separators=(",", ":")))
(HERE / "simulation.html").write_text(out, encoding="utf-8")
print(f"wrote demo/simulation.html  ({len(out) // 1024} KB, {len(events)} events, {len(train)} epochs)")
