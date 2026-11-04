"""FastAPI backend for the web dashboard (web/).

Serves the static frontend at / and JSON under /api:
  GET /api/summary                  evaluation results, training curve, dataset sizes
  GET /api/networks                 the held-out test networks
  GET /api/network/{id}             machines with layout positions, attack length
  GET /api/forecast/{id}/{stage}    full forecast after `stage` attack hops

Run:
    .venv/bin/python -m attackpath.api.server        # http://127.0.0.1:8000
"""

from __future__ import annotations

import json
import math
import os
import threading
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from attackpath.graph.builder import load_graphs, split_graphs
from attackpath.inference import forecast_all, normal_traffic
from attackpath.models.tgnn import load_model

ROOT = Path(__file__).resolve().parents[3]
MODEL = Path(os.environ.get("ATTACKPATH_MODEL", ROOT / "checkpoints" / "tgnn.pt"))
GRAPHS = ROOT / "data" / "processed" / "synthetic.pt"
NODES = ROOT / "data" / "synthetic" / "nodes.parquet"
EVAL = ROOT / "results" / "eval_synthetic.json"
WEB = ROOT / "web"
DEMO_NETWORK = int(os.environ.get("ATTACKPATH_DEMO_NETWORK", 62))

CRITICAL_ROLES = {"domain_controller", "database"}
ROLE_LABEL = {
    "workstation": "Workstation",
    "file_server": "File server",
    "mail_server": "Mail server",
    "app_server": "App server",
    "web_server": "Web server",
    "print_server": "Print server",
    "domain_controller": "Domain controller",
    "database": "Database",
}
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


@lru_cache(maxsize=1)
def store() -> dict:
    model, ckpt = load_model(MODEL)
    graphs = load_graphs(GRAPHS)
    tr, va, te = split_graphs(graphs, seed=0)
    nodes = pd.read_parquet(NODES)
    roles = {int(gid): dict(zip(df["node"], df["role"])) for gid, df in nodes.groupby("graph_id")}
    return {
        "model": model,
        "ckpt": ckpt,
        "test": {g.graph_id: g for g in te},
        "roles": roles,
        "split": {"train": len(tr), "val": len(va), "test": len(te)},
    }


def _graph(gid: int):
    g = store()["test"].get(gid)
    if g is None:
        raise HTTPException(404, f"network {gid} is not in the test set")
    return g


@lru_cache(maxsize=64)
def forecasts(gid: int):
    s = store()
    return forecast_all(s["model"], s["ckpt"], _graph(gid), k=5)


def role_group(role: str) -> str:
    if role in CRITICAL_ROLES:
        return "critical"
    return "workstation" if role == "workstation" else "server"


def layout(g, roles: dict[str, str]) -> list[tuple[float, float]]:
    """Concentric rings: critical assets inside, servers in the middle, workstations outside."""
    rings = {"critical": [], "server": [], "workstation": []}
    for i, c in enumerate(g.computers):
        rings[role_group(roles[c])].append(i)
    radius = {"critical": 0.24, "server": 0.6, "workstation": 1.0}
    offset = {"critical": math.pi / 4, "server": math.pi / 9, "workstation": 0.0}
    pos = [(0.0, 0.0)] * g.num_computers
    for name, members in rings.items():
        n = len(members)
        for k, i in enumerate(members):
            if n == 1 and name == "critical":
                pos[i] = (0.0, 0.0)
                continue
            a = 2 * math.pi * k / max(n, 1) - math.pi / 2 + offset[name]
            pos[i] = (round(radius[name] * math.cos(a), 4), round(radius[name] * math.sin(a), 4))
    return pos


def clock(hour: int) -> dict:
    """Window index -> readable time. Window t covers [t, t+1) hours; the model has read up to the end of it."""
    end = hour + 1
    day, hh = divmod(end, 24)
    return {"day": day + 1, "weekday": DAYS[day % 7], "hour": hh, "label": f"Day {day + 1} · {DAYS[day % 7]} {hh:02d}:00"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    # warm up the model and the demo network in the background so the first click is instant
    def warm():
        try:
            store()
            if DEMO_NETWORK in store()["test"]:
                forecasts(DEMO_NETWORK)
        except Exception as e:  # missing data/model: the API reports it per request
            print(f"[warmup] skipped: {e}")

    threading.Thread(target=warm, daemon=True).start()
    yield


app = FastAPI(title="Lateralis API", lifespan=lifespan)


@app.get("/api/summary")
def summary() -> dict:
    s = store()
    ev = json.loads(EVAL.read_text()) if EVAL.exists() else None
    return {
        "evaluation": ev,
        "history": s["ckpt"].get("history", []),
        "temperatures": s["ckpt"].get("temperatures", {}),
        "split": s["split"],
        "model": s["ckpt"].get("config", {}),
        "params": sum(p.numel() for p in s["model"].parameters()),
    }


@app.get("/api/networks")
def networks() -> dict:
    s = store()
    out = []
    for gid, g in sorted(s["test"].items()):
        out.append({
            "id": gid,
            "machines": g.num_computers,
            "users": g.num_users,
            "hops": len(g.attack_path) - 1,
        })
    default = DEMO_NETWORK if DEMO_NETWORK in s["test"] else out[0]["id"]
    return {"networks": out, "default": default}


@app.get("/api/network/{gid}")
def network(gid: int) -> dict:
    g = _graph(gid)
    roles = store()["roles"][gid]
    pos = layout(g, roles)
    nodes = [
        {
            "i": i,
            "name": c,
            "role": roles[c],
            "label": ROLE_LABEL.get(roles[c], roles[c]),
            "group": role_group(roles[c]),
            "x": pos[i][0],
            "y": pos[i][1],
        }
        for i, c in enumerate(g.computers)
    ]
    return {
        "id": gid,
        "nodes": nodes,
        "users": g.num_users,
        "hops": len(g.attack_path) - 1,
        "stages": [clock(w - 1) for w in g.attack_hop_windows],
    }


@app.get("/api/forecast/{gid}/{stage}")
def forecast(gid: int, stage: int) -> dict:
    g = _graph(gid)
    fs = forecasts(gid)
    if not 0 <= stage < len(fs):
        raise HTTPException(404, f"stage must be between 0 and {len(fs) - 1}")
    f = fs[stage]
    names = g.computers
    normal = normal_traffic(g, f.hour)
    nz = normal.nonzero().tolist()
    p_next = f.P[f.current]
    return {
        "id": gid,
        "stage": stage,
        "time": clock(f.hour),
        "footholds": f.footholds,
        "current": f.current,
        "confidence": round(f.confidence, 4),
        "risk": round(min(1.0, sum(p.prob for p in f.paths)), 4),
        "p_next": [round(float(x), 5) for x in p_next.tolist()],
        "next_hops": [
            {"node": n.node, "prob": round(n.prob, 4), "uncertainty": round(n.uncertainty, 4)} for n in f.next_hops
        ],
        "paths": [{"nodes": p.nodes, "prob": round(p.prob, 5)} for p in f.paths],
        "actions": [
            {
                "kind": a.kind,
                "nodes": list(a.nodes),
                "label": a.describe(names),
                "risk_drop": round(a.risk_drop, 4),
                "blocked": round(a.blocked, 4),
                "utility": round(a.utility, 4),
            }
            for a in f.actions[:6]
        ],
        "normal_edges": [[u, v, float(normal[u, v])] for u, v in nz],
        "truth": {"next": f.true_next, "remaining": f.true_remaining},
    }


# static frontend last, so /api routes win
if WEB.exists():
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))


if __name__ == "__main__":
    main()
