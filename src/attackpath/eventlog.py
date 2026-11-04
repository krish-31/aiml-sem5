"""Event log with path-aware flags.

Each machine-to-machine login is checked two ways:

1. Unexpectedness (link head of the temporal GNN):
       1 − P(this connection appears this hour | everything seen before this hour)
   On its own this is a weak attack signal: attackers reuse stolen passwords on routes people
   use every day, so their logins often look ordinary. That is the point of the project.

2. Forecast match (hop head): once a machine is known to be compromised, every login from it
   is compared with the forecast made before that hour. A login to one of the top-3 forecast
   machines is flagged high; any other login from a compromised machine is flagged medium.

On the 45 test networks this flags every attack login (a third of them high) while flagging
3% of the other machine-to-machine logins in the window shown.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass

import numpy as np
import pandas as pd
import torch

from attackpath.graph.builder import TemporalGraph
from attackpath.inference import Forecast, prediction_hours
from attackpath.models.tgnn import History, TemporalGNN

UNEXPECTED = 0.95  # unexpectedness above this is flagged medium even without a compromise
TOP_FORECAST = 3  # a login to one of these forecast machines is flagged high


@dataclass
class EventWindow:
    start: int  # first hour shown
    end: int  # last hour shown (inclusive)


def event_window(g: TemporalGraph, before: int = 24, after: int = 3) -> EventWindow:
    """Hours around the attack: a day of normal activity before it, a few hours after."""
    first, last = g.attack_hop_windows[0], g.attack_hop_windows[-1]
    return EventWindow(max(0, first - before), min(g.num_windows - 1, last + after))


@torch.no_grad()
def edge_scores(model: TemporalGNN, g: TemporalGraph, win: EventWindow, temperature: float = 1.0, context: int = 24):
    """{(hour, src_idx, dst_idx): anomaly score} for every machine-to-machine edge in the window."""
    start = max(0, win.start - 1 - context)
    hist = History(g, upto=start)
    state = model.init_state(g)
    out: dict[tuple[int, int, int], float] = {}
    for t in range(start, win.end):
        state = model.step(g.snapshot(t), state)
        hist.add(t)
        if t + 1 < win.start:
            continue
        pairs, _, _ = g.c2c.at(t + 1)
        if pairs.shape[1] == 0:
            continue
        p = torch.sigmoid(model.link_logits(state["computer"], pairs, hist.pair_features()) / temperature)
        for (u, v), pv in zip(pairs.T.tolist(), p.tolist()):
            out[(t + 1, u, v)] = 1.0 - pv
    return out


def severity(remote: bool, unexpected: float | None, from_compromised: bool, forecast_rank: int | None) -> str:
    if not remote:
        return "info"
    if from_compromised and forecast_rank is not None and forecast_rank <= TOP_FORECAST:
        return "high"
    if from_compromised or (unexpected is not None and unexpected >= UNEXPECTED):
        return "medium"
    return "low"


def build_event_log(
    model: TemporalGNN,
    g: TemporalGraph,
    events: pd.DataFrame,
    roles: dict[str, str],
    forecasts: list[Forecast],
    temperature: float = 1.0,
    context: int = 24,
) -> dict:
    """Events of one network around its attack, oldest first, each with its flags."""
    win = event_window(g)
    hour = (events["time"] // 3600).astype(int)
    ev = events.assign(hour=hour).sort_values("time", kind="stable")
    # first time each src→dst pair was ever seen (over the whole history, not just the window)
    ev["novel"] = ~ev.duplicated(["src", "dst"])
    ev = ev[(ev["hour"] >= win.start) & (ev["hour"] <= win.end)]

    c_idx = {c: i for i, c in enumerate(g.computers)}
    scores = edge_scores(model, g, win, temperature, context)
    detected_from = prediction_hours(g)[0]  # hour the initial compromise is known
    # time of each attack hop (first event of each step), to know which machines are compromised when
    atk = events[events["is_attack"]]
    hop_times = sorted(atk.groupby("attack_step")["time"].min().tolist())
    rows = []
    for r in ev.itertuples(index=False):
        remote = r.src != r.dst
        u, v = c_idx[r.src], c_idx[r.dst]
        unexpected = scores.get((int(r.hour), u, v)) if remote else None
        # forecast for the attack stage at this moment: hops completed strictly before this event
        f = None
        if r.hour >= detected_from:
            k = bisect.bisect_left(hop_times, int(r.time))
            f = forecasts[min(k, len(forecasts) - 1)]
        from_comp = bool(f is not None and u in f.footholds and remote)
        rank = prob = None
        if from_comp:
            row = f.P[u]
            prob = float(row[v])
            rank = int((row > row[v]).sum()) + 1
        day, sec = divmod(int(r.time), 86_400)
        rows.append({
            "time": int(r.time),
            "label": f"D{day + 1} {sec // 3600:02d}:{(sec % 3600) // 60:02d}",
            "hour": int(r.hour),
            "user": r.user,
            "src": r.src,
            "dst": r.dst,
            "src_role": roles.get(r.src, ""),
            "dst_role": roles.get(r.dst, ""),
            "remote": bool(remote),
            "novel": bool(r.novel) and bool(remote),
            "unexpected": None if unexpected is None else round(float(unexpected), 4),
            "from_compromised": from_comp,
            "forecast_rank": rank,
            "forecast_prob": None if prob is None else round(prob, 4),
            "severity": severity(bool(remote), unexpected, from_comp, rank),
            "attack": bool(r.is_attack),
            "step": int(r.attack_step),
        })

    flagged = [r for r in rows if r["severity"] in ("high", "medium")]
    return {
        "window": {"start": win.start, "end": win.end},
        "events": rows,
        "summary": {
            "events": len(rows),
            "remote": sum(r["remote"] for r in rows),
            "high": sum(r["severity"] == "high" for r in rows),
            "medium": sum(r["severity"] == "medium" for r in rows),
            "attack_events": sum(r["attack"] for r in rows),
            "attack_flagged": sum(r["attack"] for r in flagged),
            "normal_flagged": sum(not r["attack"] for r in flagged),
        },
    }
