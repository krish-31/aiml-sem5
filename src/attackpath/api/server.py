"""FastAPI backend for the web dashboard (web/).

Serves the static frontend at / and JSON under /api:
  GET /api/summary                  evaluation results, training curve, dataset sizes
  GET /api/networks                 the held-out test networks
  GET /api/network/{id}             machines with layout positions, attack length
  GET /api/forecast/{id}/{stage}    full forecast after `stage` attack hops
  GET /api/events/{id}              login events around the attack, with path-aware flags
  GET /api/report/{id}/{stage}      PDF incident forecast report (?truth=0 hides the ground truth)

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
from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles

from attackpath.defense.simulator import split_actions
from attackpath.eventlog import build_event_log
from attackpath.graph.builder import load_graphs, split_graphs
from attackpath.inference import forecast_all, normal_traffic
from attackpath.models.tgnn import load_model
from attackpath.replaytime import stamp
from attackpath.report import build_report, report_filename

ROOT = Path(__file__).resolve().parents[3]
MODEL = Path(os.environ.get("ATTACKPATH_MODEL", ROOT / "checkpoints" / "tgnn.pt"))
GRAPHS = ROOT / "data" / "processed" / "synthetic.pt"
NODES = ROOT / "data" / "synthetic" / "nodes.parquet"
EVENTS = ROOT / "data" / "synthetic" / "events.parquet"
EVAL = ROOT / "results" / "eval_synthetic.json"
WEB = ROOT / "web" / "dist"  # React build: cd web && npm install && npm run build
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
    """Window index -> calendar time. Window t covers [t, t+1) hours; the model has read up to the end of it."""
    end = hour + 1
    day, hh = divmod(end, 24)
    when = stamp(end * 3600)
    return {
        "day": day + 1,
        "weekday": DAYS[day % 7],
        "hour": hh,
        "iso": when.isoformat(),
        "label": when.strftime("%a %d %b %Y · %H:%M"),
    }


@lru_cache(maxsize=64)
def hop_times(gid: int) -> tuple[int, ...]:
    """Second at which each attack hop was first observed (hop 1, hop 2, ...)."""
    ev = pd.read_parquet(EVENTS, columns=["graph_id", "time", "attack_step", "is_attack"],
                         filters=[("graph_id", "==", gid), ("is_attack", "==", True)])
    return tuple(int(t) for t in ev.groupby("attack_step")["time"].min().sort_index())


def as_of(g, gid: int, stage: int) -> dict:
    """The exact moment the analyst is at for a stage: the end of the last hour of logs the model read,
    or the moment the latest hop was observed if that came later (hops can fall a few minutes into the hour)."""
    seconds = g.attack_hop_windows[stage] * 3600
    hops = hop_times(gid)
    if stage > 0 and len(hops) >= stage:
        seconds = max(seconds, hops[stage - 1])
    when = stamp(seconds)
    return {"seconds": int(seconds), "iso": when.isoformat(), "label": when.strftime("%a %d %b %Y · %H:%M:%S")}


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
        "stages": [as_of(g, gid, k) for k in range(len(g.attack_hop_windows))],
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
    targets = [i for i, c in enumerate(g.critical.tolist()) if c]
    contain, next_cuts = split_actions(f.actions, f.footholds, f.current, f.P, targets)

    def act(a):
        return {
            "kind": a.kind,
            "nodes": list(a.nodes),
            "label": a.describe(names),
            "risk_drop": round(a.risk_drop, 4),
            "blocked": round(a.blocked, 4),
            "utility": round(a.utility, 4),
        }
    return {
        "id": gid,
        "stage": stage,
        "hour": f.hour,
        "time": clock(f.hour),
        "as_of": as_of(g, gid, stage),
        "footholds": f.footholds,
        "current": f.current,
        "confidence": round(f.confidence, 4),
        "risk": round(min(1.0, sum(p.prob for p in f.paths)), 4),
        "p_next": [round(float(x), 5) for x in p_next.tolist()],
        "next_hops": [
            {"node": n.node, "prob": round(n.prob, 4), "uncertainty": round(n.uncertainty, 4)} for n in f.next_hops
        ],
        "paths": [{"nodes": p.nodes, "prob": round(p.prob, 5)} for p in f.paths],
        # Isolating a machine already known to be compromised is routine first aid, so it is reported
        # separately as "containment"; the recommendation is the best cut on the attacker's routes from here.
        "containment": act(contain) if contain else None,
        "actions": [act(a) for a in next_cuts][:6],
        "normal_edges": [[u, v, float(normal[u, v])] for u, v in nz],
        "truth": {"next": f.true_next, "remaining": f.true_remaining},
    }


@lru_cache(maxsize=16)
def event_log(gid: int) -> dict:
    g = _graph(gid)
    s = store()
    events = pd.read_parquet(EVENTS, filters=[("graph_id", "==", gid)])
    return build_event_log(
        s["model"], g, events, s["roles"][gid], forecasts(gid),
        temperature=s["ckpt"].get("temperatures", {}).get("link", 1.0), context=s["ckpt"].get("context", 24),
    )


@app.get("/api/events/{gid}")
def events(gid: int) -> dict:
    return event_log(gid)


@app.get("/api/report/{gid}/{stage}")
def report(gid: int, stage: int, truth: bool = True, download: bool = False) -> Response:
    fc = forecast(gid, stage)  # validates gid and stage
    ev = json.loads(EVAL.read_text()) if EVAL.exists() else None
    pdf = build_report(network(gid), fc, event_log(gid), ev, include_truth=truth)
    disposition = "attachment" if download else "inline"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'{disposition}; filename="{report_filename(gid, stage)}"'})


# static frontend last, so /api routes win
if WEB.exists():
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))


if __name__ == "__main__":
    main()
