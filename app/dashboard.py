"""Attack-path forecasting dashboard.

Replays an attack on an unseen test network hop by hop and shows what the model
predicts at each moment: the attacker's next move, the most likely complete paths
to critical assets, and the recommended defensive action.

Run:
    .venv/bin/streamlit run app/dashboard.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import networkx as nx
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from attackpath.graph.builder import load_graphs, split_graphs
from attackpath.inference import Forecast, forecast_all, normal_traffic
from attackpath.models.tgnn import load_model

ROOT = Path(__file__).resolve().parents[1]
MODEL = Path(os.environ.get("ATTACKPATH_MODEL", ROOT / "checkpoints" / "tgnn.pt"))
GRAPHS = ROOT / "data" / "processed" / "synthetic.pt"
NODES = ROOT / "data" / "synthetic" / "nodes.parquet"
EVAL = ROOT / "results" / "eval_synthetic.json"
DEMO_NETWORK = int(os.environ.get("ATTACKPATH_DEMO_NETWORK", 62))  # a clear example from the test set

ROLE_COLOR = {
    "workstation": "#9aa5b1",
    "file_server": "#4c78a8",
    "mail_server": "#4c78a8",
    "app_server": "#4c78a8",
    "web_server": "#4c78a8",
    "print_server": "#4c78a8",
    "domain_controller": "#7b3fa0",
    "database": "#7b3fa0",
}
COMPROMISED, PREDICTED, DEFENSE, TRUTH = "#d62728", "#ff7f0e", "#2ca02c", "#222222"
PRETTY_ROLE = {
    "workstation": "Workstation", "file_server": "File server", "mail_server": "Mail server",
    "app_server": "App server", "web_server": "Web server", "print_server": "Print server",
    "domain_controller": "Domain controller", "database": "Database",
}

st.set_page_config(page_title="Attack-Path Forecaster", page_icon="🛡️", layout="wide")


# ----------------------------------------------------------------------------- data


@st.cache_resource(show_spinner="Loading model and test networks…")
def load_everything():
    model, ckpt = load_model(MODEL)
    _, _, test = split_graphs(load_graphs(GRAPHS), seed=0)
    nodes = pd.read_parquet(NODES)
    roles = {gid: dict(zip(df["node"], df["role"])) for gid, df in nodes.groupby("graph_id")}
    return model, ckpt, {g.graph_id: g for g in test}, roles


@st.cache_resource(show_spinner="Replaying logs and forecasting…")
def get_forecasts(gid: int) -> list[Forecast]:
    model, ckpt, graphs, _ = load_everything()
    return forecast_all(model, ckpt, graphs[gid], k=5)


@st.cache_resource
def layout(gid: int) -> dict[int, tuple[float, float]]:
    """Critical assets in the middle, servers around them, workstations on the outside."""
    _, _, graphs, roles = load_everything()
    g = graphs[gid]
    r = roles[gid]
    crit = [i for i, c in enumerate(g.computers) if r[c] in ("domain_controller", "database")]
    srv = [i for i, c in enumerate(g.computers) if r[c] not in ("domain_controller", "database", "workstation")]
    ws = [i for i, c in enumerate(g.computers) if r[c] == "workstation"]
    pos = nx.shell_layout(nx.empty_graph(g.num_computers), nlist=[crit, srv, ws], scale=1.0)
    return {i: tuple(p) for i, p in pos.items()}


# ---------------------------------------------------------------------------- figure


def _line(x0, y0, x1, y1, color, width, dash=None, opacity=1.0, name=None, hover=None, legend=False):
    return go.Scatter(
        x=[x0, x1], y=[y0, y1], mode="lines", line=dict(color=color, width=width, dash=dash), opacity=opacity,
        hoverinfo="text" if hover else "skip", text=hover, name=name, showlegend=legend,
    )


def network_figure(gid: int, f: Forecast, show_truth: bool, n_paths: int) -> go.Figure:
    _, _, graphs, roles = load_everything()
    g = graphs[gid]
    names, role = g.computers, roles[gid]
    pos = layout(gid)
    fig = go.Figure()

    # recent normal traffic, faint
    normal = normal_traffic(g, f.hour)
    xs, ys = [], []
    for u, v in (normal > 0).nonzero().tolist():
        xs += [pos[u][0], pos[v][0], None]
        ys += [pos[u][1], pos[v][1], None]
    fig.add_trace(go.Scatter(x=xs, y=ys, mode="lines", line=dict(color="#c9d1d9", width=0.6),
                             hoverinfo="skip", name="Normal traffic (last 24h)"))

    # ground truth: where the attacker will really go
    if show_truth:
        rem = f.true_remaining
        for i, (a, b) in enumerate(zip(rem[:-1], rem[1:])):
            fig.add_trace(_line(*pos[a], *pos[b], TRUTH, 2, "dot", name="True future path", legend=i == 0))

    # predicted paths (thicker = more likely)
    for rank, p in enumerate(f.paths[:n_paths]):
        w = 7 - rank * 1.2
        for i, (a, b) in enumerate(zip(p.nodes[:-1], p.nodes[1:])):
            fig.add_trace(_line(
                *pos[a], *pos[b], PREDICTED, max(w, 1.5), opacity=0.9 - rank * 0.13,
                name="Predicted attack paths", legend=rank == 0 and i == 0,
                hover=f"Path #{rank + 1} · P = {p.prob:.3f}",
            ))

    # attack so far
    obs = f.footholds
    for i, (a, b) in enumerate(zip(obs[:-1], obs[1:])):
        fig.add_trace(_line(*pos[a], *pos[b], COMPROMISED, 4, name="Attack so far", legend=i == 0))

    # recommended action
    if f.actions:
        a = f.actions[0]
        if a.kind == "block":
            u, v = a.nodes
            fig.add_trace(_line(*pos[u], *pos[v], DEFENSE, 6, "dash", name="Recommended: remove access", legend=True))
        else:
            v = a.nodes[0]
            fig.add_trace(go.Scatter(x=[pos[v][0]], y=[pos[v][1]], mode="markers",
                                     marker=dict(size=34, color="rgba(0,0,0,0)", line=dict(color=DEFENSE, width=4)),
                                     name="Recommended: isolate", hoverinfo="skip"))

    # nodes
    P_next = f.P[f.current]
    held = set(obs)
    crit = set(i for i, c in enumerate(names) if role[c] in ("domain_controller", "database"))
    xs, ys, colors, sizes, symbols, text, hover = [], [], [], [], [], [], []
    for i, c in enumerate(names):
        xs.append(pos[i][0])
        ys.append(pos[i][1])
        colors.append(COMPROMISED if i in held else ROLE_COLOR.get(role[c], "#999"))
        p = float(P_next[i])
        sizes.append(26 if i in crit else 14 + 40 * math.sqrt(p) if i not in held else 20)
        symbols.append("diamond" if i in crit else "circle")
        text.append(c if (i in held or i in crit or p > 0.05) else "")
        hover.append(f"<b>{c}</b> · {PRETTY_ROLE.get(role[c], role[c])}"
                     + ("<br><b>compromised</b>" if i in held else f"<br>P(next hop) = {p:.3f}"))
    fig.add_trace(go.Scatter(
        x=xs, y=ys, mode="markers+text", text=text, textposition="top center", textfont=dict(size=11),
        marker=dict(color=colors, size=sizes, symbol=symbols, line=dict(color="white", width=1.5)),
        hovertext=hover, hoverinfo="text", showlegend=False,
    ))
    # legend entries for node colours
    for label, color, sym in (("Compromised", COMPROMISED, "circle"), ("Critical asset", "#7b3fa0", "diamond"),
                              ("Server", "#4c78a8", "circle"), ("Workstation", "#9aa5b1", "circle")):
        fig.add_trace(go.Scatter(x=[None], y=[None], mode="markers", marker=dict(color=color, size=10, symbol=sym), name=label))

    fig.update_layout(
        height=640, margin=dict(l=0, r=0, t=10, b=0), plot_bgcolor="white", paper_bgcolor="white",
        xaxis=dict(visible=False), yaxis=dict(visible=False, scaleanchor="x"),
        legend=dict(orientation="h", yanchor="bottom", y=-0.08, x=0, font=dict(size=11)),
        hoverlabel=dict(bgcolor="white"),
    )
    return fig


# ------------------------------------------------------------------------------- UI


def page_live():
    model, ckpt, graphs, roles = load_everything()
    st.sidebar.header("Scenario")
    options = {
        gid: f"Network #{gid} · {g.num_computers} machines · {len(g.attack_path) - 1}-hop attack"
        for gid, g in sorted(graphs.items())
    }
    ids = list(options)
    default = ids.index(DEMO_NETWORK) if DEMO_NETWORK in ids else 0
    gid = st.sidebar.selectbox("Test network (never seen in training)", ids, index=default, format_func=options.get)
    g = graphs[gid]
    names, role = g.computers, roles[gid]
    K = len(g.attack_path) - 1
    stage = st.sidebar.slider("Attack progress (hops observed)", 0, K - 1, 0,
                              help="0 = only the first infected machine is known")
    show_truth = st.sidebar.toggle("Reveal where the attacker really goes", value=False)
    n_paths = st.sidebar.radio("Paths to show", [1, 3, 5], index=1, horizontal=True)

    f = get_forecasts(gid)[stage]
    day, hour = divmod(f.hour + 1, 24)
    st.sidebar.caption(f"Model has read logs up to **day {day + 1}, {hour:02d}:00**.")

    risk = sum(p.prob for p in f.paths)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Compromised machines", len(f.footholds), help=" → ".join(names[i] for i in f.footholds))
    c2.metric(f"Attacker is on ({PRETTY_ROLE.get(role[names[f.current]], '')})", names[f.current])
    c3.metric("Risk to critical assets", f"{min(risk, 1):.0%}", help="Sum of the top-5 path probabilities")
    c4.metric("Forecast confidence", f"{f.confidence:.0%}", help="1 − normalized entropy of the next-move distribution")

    left, right = st.columns([11, 9], gap="medium")
    with left:
        st.plotly_chart(network_figure(gid, f, show_truth, n_paths), use_container_width=True)

    with right:
        st.subheader("Predicted next move")
        rows = []
        for n in f.next_hops:
            rows.append({
                "Machine": names[n.node],
                "Type": PRETTY_ROLE.get(role[names[n.node]], ""),
                "Probability": n.prob,
                "Uncertainty": n.uncertainty,
                **({"Actual?": "✅" if n.node == f.true_next else ""} if show_truth else {}),
            })
        st.dataframe(
            pd.DataFrame(rows), hide_index=True, use_container_width=True,
            column_config={
                "Probability": st.column_config.ProgressColumn(format="%.2f", min_value=0, max_value=1),
                "Uncertainty": st.column_config.NumberColumn(format="%.2f", width="small", help="Binary entropy: 0 sure … 1 coin flip"),
            },
        )

        st.subheader("Most likely paths to critical assets")
        truth = f.true_remaining
        for i, p in enumerate(f.paths[:5]):
            hit = show_truth and p.nodes == truth
            route = " → ".join(names[j] for j in p.nodes)
            st.markdown(f"**#{i + 1}** &nbsp; `{route}` &nbsp; P = **{p.prob:.3f}** {'✅ matches real path' if hit else ''}")
        if show_truth:
            st.caption("Real remaining path: " + " → ".join(names[j] for j in truth))

        st.subheader("Recommended defense")
        if f.actions:
            best = f.actions[0]
            st.success(f"**{best.describe(names)}**  \nCuts path risk by **{best.risk_drop:.0%}** while blocking "
                       f"**{best.blocked:.1%}** of normal traffic.")
            alt = pd.DataFrame([
                {"Other options": a.describe(names), "Risk cut": 100 * a.risk_drop, "Traffic blocked": 100 * a.blocked}
                for a in f.actions[1:6]
            ])
            st.dataframe(alt, hide_index=True, use_container_width=True, column_config={
                "Risk cut": st.column_config.NumberColumn(format="%.0f%%"),
                "Traffic blocked": st.column_config.NumberColumn(format="%.1f%%"),
            })
        else:
            st.info("No path to a critical asset found.")


def page_results():
    _, ckpt, _, _ = load_everything()
    st.header("How well does it work?")
    st.caption("All numbers are on 45 synthetic networks the model never saw during training.")
    if not EVAL.exists():
        st.warning("Run `python -m attackpath.eval.evaluate` to produce results.")
        return
    r = json.loads(EVAL.read_text())
    nh, ph, td = r["next_hop"], r["path_hit_rate"], r["time_to_detection"]
    tiles = [
        ("Link forecast AUC", f"{r['link']['calibrated']['auc']:.3f}", "synopsis target ≥ 0.90"),
        ("Next hop in top 5", f"{nh['tgnn']['top5']:.0%}",
         f"rule-based {nh['heuristic']['top5']:.0%} · random {nh['random']['top5']:.0%}"),
        ("Caught before target", f"{td['tgnn']['detected_before_target']:.0%}",
         f"rule-based {td['heuristic']['detected_before_target']:.0%}"),
    ]
    if "defense" in r:
        tiles.append(("Defense risk cut", f"{r['defense']['mean_risk_drop']:.0%}",
                      f"blocks {r['defense']['mean_normal_blocked']:.1%} of normal traffic"))
    for col, (label, value, note) in zip(st.columns(len(tiles)), tiles):
        col.metric(label, value)
        col.caption(note)

    names = {"tgnn": "Temporal GNN (ours)", "tgnn_uncalibrated": "Temporal GNN, no calibration",
             "heuristic": "Rule-based baseline", "random": "Random guess"}
    st.subheader("Next-hop forecasting")
    st.dataframe(pd.DataFrame([
        {"Method": names[k], "Top-1": v["top1"], "Top-3": v["top3"], "Top-5": v["top5"], "MRR": v["mrr"], "Calibration error (ECE)": v["ece"]}
        for k, v in nh.items()
    ]).style.format(precision=3), hide_index=True, use_container_width=True)

    a, b = st.columns(2)
    with a:
        st.subheader("Full remaining path in top-k")
        st.dataframe(pd.DataFrame([{"Method": names[k], **{kk.replace("top", "Top-"): vv for kk, vv in v.items()}} for k, v in ph.items()])
                     .style.format(precision=3), hide_index=True, use_container_width=True)
    with b:
        st.subheader("Time to detection")
        st.dataframe(pd.DataFrame([
            {"Method": names[k], "Caught before target": v["detected_before_target"], "Avg hops of warning": v["mean_hops_of_warning"]}
            for k, v in td.items()
        ]).style.format(precision=2), hide_index=True, use_container_width=True)

    st.subheader("Link forecasting (all traffic, next hour)")
    st.dataframe(pd.DataFrame([{"": k.title(), **{m.upper(): v for m, v in d.items()}} for k, d in r["link"].items()])
                 .style.format(precision=3), hide_index=True, use_container_width=True)

    hist = pd.DataFrame(ckpt.get("history", []))
    if len(hist):
        st.subheader("Training curve")
        st.line_chart(hist.set_index("epoch")[["val_link_auc", "val_hop_top1", "val_hop_top3"]])


def page_how():
    st.header("How it works")
    st.graphviz_chart("""
    digraph {
      rankdir=LR; node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=11];
      a [label="1. Login logs", fillcolor="#dbe9f6"]; b [label="2. Clean +\\nhourly windows", fillcolor="#dbe9f6"];
      c [label="3. Temporal graph\\n(users, machines)", fillcolor="#dbe9f6"]; d [label="4. Temporal GNN\\nGAT + GRU", fillcolor="#fde7c8"];
      e [label="5. Calibration\\n(temperature)", fillcolor="#fde7c8"]; f [label="6. Top-k paths\\n(Yen's algorithm)", fillcolor="#dff0d8"];
      g [label="7. Defense\\nsimulator", fillcolor="#dff0d8"]; h [label="8. Dashboard", fillcolor="#dff0d8"];
      a -> b -> c -> d -> e -> f -> g -> h;
    }""")
    st.markdown("""
**The idea.** Attackers rarely hit their target in one step. They break into one machine, steal credentials,
and hop from machine to machine. This system watches the network as a graph that changes every hour and
forecasts the attacker's next hop before it happens.

1. **Graph per hour.** Users and computers are nodes; logins and connections are edges.
2. **Temporal GNN.** Two graph-attention layers read each hour's graph; a GRU carries each node's memory from
   hour to hour. Two small heads score (a) which connections appear next hour and (b) where an attacker on a
   given machine moves next.
3. **Calibration.** Temperature scaling on validation data so that "60%" really means 60%.
4. **Path ranking.** Each possible move gets cost −log P; Yen's k-shortest-paths finds the most likely
   complete routes from the attacker's footholds to the domain controller or databases.
5. **Defense simulator.** Tries isolating machines or removing access, re-ranks the paths, and recommends the
   action with the best *risk cut − normal traffic blocked*.

**Data.** 300 synthetic company networks (7 days of normal logins + one 3–6 hop attack each), split
210 / 45 / 45 by network. Next: the real LANL authentication logs, CICIDS2017 and UNSW-NB15.
""")


st.title("🛡️ Attack-Path Forecaster")
st.caption("Temporal graph learning for cyber attack-path forecasting and adaptive defense · Krrish Agarwal · IS353IA")
if not MODEL.exists() or not GRAPHS.exists():
    st.error("Model or data missing. Run the generator, builder and trainer first (see README).")
    st.stop()
tab1, tab2, tab3 = st.tabs(["Live forecast", "Results", "How it works"])
with tab1:
    page_live()
with tab2:
    page_results()
with tab3:
    page_how()
