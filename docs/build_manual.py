"""Build docs/Lateralis_Manual.pdf: user manual, tech stack, dataset and next steps.

Run (after the pipeline and with screenshots in docs/img):
    .venv/bin/python docs/build_manual.py
"""

from __future__ import annotations

import importlib.metadata as md
import json
import platform
import subprocess
import tempfile
from datetime import date
from pathlib import Path

import pandas as pd
from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    CondPageBreak, Image, KeepTogether, ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate,
    Spacer, Table, TableStyle,
)

from attackpath.report import _register_fonts

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "docs" / "img"
OUT = ROOT / "docs" / "Lateralis_Manual.pdf"

INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#475569")
FAINT = colors.HexColor("#94a3b8")
LINE = colors.HexColor("#e2e8f0")
PANEL = colors.HexColor("#f6f8fb")
ACCENT = colors.HexColor("#2557d6")
NAVY = colors.HexColor("#0b1220")
ATTACK = colors.HexColor("#d93a3f")
PREDICT = colors.HexColor("#c27a0e")
DEFEND = colors.HexColor("#138a63")
W = A4[0] - 32 * mm  # text width

_register_fonts()
S = {
    "h1": ParagraphStyle("h1", fontName="Plex-Bold", fontSize=19, leading=23, textColor=INK, spaceBefore=4, spaceAfter=8),
    "h2": ParagraphStyle("h2", fontName="Plex-Bold", fontSize=13, leading=16, textColor=INK, spaceBefore=12, spaceAfter=5),
    "h3": ParagraphStyle("h3", fontName="Plex-SemiBold", fontSize=10.5, leading=13, textColor=INK, spaceBefore=8, spaceAfter=3),
    "body": ParagraphStyle("body", fontName="Plex", fontSize=9.5, leading=14, textColor=MUTED, spaceAfter=5),
    "small": ParagraphStyle("small", fontName="Plex", fontSize=8, leading=11, textColor=FAINT),
    "cap": ParagraphStyle("cap", fontName="Plex", fontSize=8, leading=11, textColor=FAINT, spaceBefore=3, spaceAfter=8),
    "cell": ParagraphStyle("cell", fontName="Plex", fontSize=8.5, leading=11.5, textColor=INK),
    "cellm": ParagraphStyle("cellm", fontName="PlexMono", fontSize=8, leading=11, textColor=INK),
    "code": ParagraphStyle("code", fontName="PlexMono", fontSize=8.3, leading=12, textColor=colors.HexColor("#dbe4f0"),
                           backColor=NAVY, borderPadding=(6, 8, 6, 8), spaceBefore=12, spaceAfter=12),
    "eyebrow": ParagraphStyle("eb", fontName="PlexMono", fontSize=8, leading=10, textColor=ACCENT, spaceAfter=2),
}


def P(text, style="body"):
    return Paragraph(text, S[style])


def code(*lines):
    return Paragraph("<br/>".join(l.replace(" ", "&nbsp;") for l in lines), S["code"])


def bullets(items, style="body"):
    return ListFlowable([ListItem(P(t, style), leftIndent=12, value="•", bulletFontName="Plex") for t in items],
                        bulletType="bullet", start="•", leftIndent=12, bulletFontName="Plex", bulletFontSize=9, bulletColor=FAINT)


def table(rows, widths, header=True, mono_cols=(), align_right=()):
    data = []
    for r, row in enumerate(rows):
        cells = []
        for c, v in enumerate(row):
            if isinstance(v, str):
                st = "cellm" if (c in mono_cols and r > 0) else "cell"
                v = Paragraph(v if not (header and r == 0) else f"<b>{v}</b>", S[st])
            cells.append(v)
        data.append(cells)
    t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 4),
             ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE)]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), PANEL), ("LINEBELOW", (0, 0), (-1, 0), 0.8, FAINT)]
    for c in align_right:
        style.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def shot(name, caption, width=W):
    """Screenshot as a compact JPEG (keeps the PDF small)."""
    src = IMG / f"{name}.png"
    if not src.exists():
        return P(f"[missing screenshot: {name}]", "small")
    jpg = Path(tempfile.gettempdir()) / f"lateralis-{name}.jpg"
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "78", "--resampleWidth", "1800",
                    str(src), "--out", str(jpg)], check=True, capture_output=True)
    im = Image(str(jpg))
    ratio = im.imageHeight / im.imageWidth
    im.drawWidth, im.drawHeight = width, width * ratio
    frame = Table([[im]], colWidths=[width])
    frame.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return KeepTogether([frame, P(caption, "cap")])


def callout(title, text, color=ACCENT):
    t = Table([[P(f"<font color='{color.hexval()}'><b>{title}</b></font>", "cell")], [P(text, "body")]], colWidths=[W])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PANEL), ("LINEBEFORE", (0, 0), (0, -1), 3, color),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 4),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return t


def pipeline_drawing():
    stages = [("1", "Logs", "auth events"), ("2", "Clean", "hourly windows"), ("3", "Graph", "users, machines"),
              ("4", "Temporal GNN", "GAT + GRU"), ("5", "Calibrate", "temperature"), ("6", "Rank paths", "Yen's top-k"),
              ("7", "Simulate", "next cut"), ("8", "Web app", "FastAPI + JS")]
    fills = [colors.HexColor("#e8f0fe")] * 3 + [colors.HexColor("#fdf3e1")] * 2 + [colors.HexColor("#e6f6ef")] * 3
    d = Drawing(W, 66)
    bw, gap = (W - 7 * 7) / 8, 7
    for i, ((n, a, b), f) in enumerate(zip(stages, fills)):
        x = i * (bw + gap)
        d.add(Rect(x, 8, bw, 50, rx=5, ry=5, fillColor=f, strokeColor=LINE, strokeWidth=0.6))
        d.add(String(x + 6, 46, n, fontName="PlexMono", fontSize=7, fillColor=FAINT))
        d.add(String(x + bw / 2, 30, a, fontName="Plex-Bold", fontSize=7.6, fillColor=INK, textAnchor="middle"))
        d.add(String(x + bw / 2, 18, b, fontName="Plex", fontSize=6.4, fillColor=MUTED, textAnchor="middle"))
        if i < 7:
            ax = x + bw + 1
            d.add(Polygon([ax, 36, ax + gap - 2, 33, ax, 30], fillColor=FAINT, strokeColor=None))
    return d


def architecture_drawing():
    d = Drawing(W, 170)

    def box(x, y, w, h, title, lines, fill):
        d.add(Rect(x, y, w, h, rx=6, ry=6, fillColor=fill, strokeColor=LINE, strokeWidth=0.8))
        d.add(String(x + 8, y + h - 14, title, fontName="Plex-Bold", fontSize=8.5, fillColor=INK))
        for k, ln in enumerate(lines):
            d.add(String(x + 8, y + h - 27 - k * 11, ln, fontName="Plex", fontSize=7, fillColor=MUTED))

    def arrow(x1, y1, x2, y2, label=""):
        d.add(Line(x1, y1, x2, y2, strokeColor=FAINT, strokeWidth=1))
        d.add(Polygon([x2, y2, x2 - 5, y2 + 3, x2 - 5, y2 - 3], fillColor=FAINT, strokeColor=None))
        if label:
            d.add(String((x1 + x2) / 2, y1 + 4, label, fontName="PlexMono", fontSize=6.3, fillColor=FAINT, textAnchor="middle"))

    col = (W - 40) / 3
    box(0, 20, col, 130, "Browser (frontend)", ["HTML + CSS + vanilla JavaScript", "Hash router: 4 pages + 2 linked",
        "SVG network map, live feed", "Dark / light theme", "No build step, works offline"], colors.HexColor("#e8f0fe"))
    box(col + 20, 20, col, 130, "FastAPI server (backend)", ["/api/summary  /api/networks", "/api/network/{id}",
        "/api/forecast/{id}/{stage}", "/api/events/{id}", "/api/report/{id}/{stage} (PDF)", "Serves web/ as static files"],
        colors.HexColor("#fdf3e1"))
    box(2 * col + 40, 20, col, 130, "ML core (Python package)", ["Temporal GNN (PyTorch + PyG)", "Path ranking (NetworkX Yen)",
        "Defense simulator", "Event flagging", "PDF reports (ReportLab)", "Data: Parquet files"], colors.HexColor("#e6f6ef"))
    arrow(col, 95, col + 20, 95, "JSON")
    arrow(2 * col + 20, 95, 2 * col + 40, 95, "calls")
    return d


def main() -> None:
    ev = json.loads((ROOT / "results" / "eval_synthetic.json").read_text())
    nets = pd.read_csv(ROOT / "dataset" / "networks.csv")
    hops = pd.read_csv(ROOT / "dataset" / "attack_hops.csv")
    v = lambda p: md.version(p)  # noqa: E731
    nh, td, lk = ev["next_hop"], ev["time_to_detection"], ev["link"]["calibrated"]
    dfn, con = ev["defense"], ev["containment"]

    story = []

    # ---------------------------------------------------------------- cover
    story += [
        Spacer(1, 40 * mm),
        P("IS353IA · ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING · LAB PART B", "eyebrow"),
        Paragraph("Lateralis", ParagraphStyle("t", fontName="Plex-Bold", fontSize=38, leading=44, textColor=INK)),
        Paragraph("User manual and technical overview",
                  ParagraphStyle("st", fontName="Plex", fontSize=16, leading=22, textColor=MUTED, spaceAfter=18)),
        P("Temporal Graph Learning for Cyber Attack-Path Forecasting and Adaptive Defense"),
        Spacer(1, 8),
        table([["Student", "Krrish Agarwal"], ["Academic year", "2026–27"], ["Repository", "github.com/krish-31/aiml-sem5"],
               ["Document date", date.today().strftime("%d %B %Y")]], [40 * mm, W - 40 * mm], header=False),
        Spacer(1, 16),
        callout("In one sentence",
                "Lateralis watches a company network as a graph that changes every hour, forecasts the attacker's next hop "
                "after a break-in, ranks the likely routes to critical servers and recommends the cut that blocks them."),
        Spacer(1, 14),
        P("<b>Contents</b>", "h3"),
        table([[n, t] for n, t in [
            ("1", "What Lateralis does"), ("2", "Quick start: install and run"), ("3", "How to use the app"),
            ("4", "5-minute presentation script"), ("5", "System architecture"), ("6", "Technology stack"),
            ("7", "The model"), ("8", "The dataset"), ("9", "Results"), ("10", "Limitations"), ("11", "Next steps"),
            ("A", "Project structure and commands")]], [12 * mm, W - 12 * mm], header=False),
        PageBreak(),
    ]

    # ---------------------------------------------------------------- 1
    story += [
        P("1. What Lateralis does", "h1"),
        P("Serious attacks are rarely a single event. An attacker lands on one workstation, steals the passwords of people "
          "who log in there, and hops machine to machine (lateral movement) until they reach a domain controller or database. "
          "Most detection tools judge each login on its own and raise the alarm late. Lateralis instead:"),
        bullets([
            "<b>Observes</b> login logs as one graph per hour: users and machines are nodes, logins are edges.",
            "<b>Forecasts</b> the attacker's next hop with a temporal graph neural network, as calibrated probabilities.",
            "<b>Ranks</b> the most likely complete routes from the compromised machines to critical assets.",
            "<b>Recommends</b> a response: routine <i>containment</i> of the known compromised machine, plus the "
            "<i>next cut</i>, the access removal that best blocks the route ahead for the least disruption.",
            "<b>Explains</b> itself: a live event feed, a full event log with flags, and a one-click PDF incident report.",
        ]),
        pipeline_drawing(),
        P("Figure 1. The eight-stage pipeline, from raw logs to the web app.", "cap"),
        P("All results in this document come from 300 synthetic company networks (Section 8). Real datasets are the next "
          "milestone (Section 11)."),
    ]

    # ---------------------------------------------------------------- 2
    story += [
        P("2. Quick start: install and run", "h1"),
        P("Requirements: macOS, Linux or Windows with Python 3.11 and <font name='PlexMono'>uv</font>; about 2 GB of disk. "
          "No GPU is needed for the demo. Training takes about 15–25 minutes on a laptop CPU."),
        P("2.1 One-time setup", "h3"),
        code("git clone https://github.com/krish-31/aiml-sem5 && cd aiml-sem5",
             "uv venv --python 3.11 .venv",
             'uv pip install --python .venv/bin/python -e ".[dev,ml,app]"'),
        P("2.2 Build data and model (skip if data/ and checkpoints/ already exist)", "h3"),
        code(".venv/bin/python -m attackpath.data.synthetic --n-graphs 300   # 10 s",
             ".venv/bin/python -m attackpath.graph.builder                   # 15 s",
             ".venv/bin/python -m attackpath.models.train                    # 15-25 min",
             ".venv/bin/python -m attackpath.eval.evaluate                   # 2 min"),
        P("2.3 Start the app", "h3"),
        code(".venv/bin/python -m attackpath.api.server"),
        P("Open <b>http://127.0.0.1:8000</b> in a browser. The first visit to the console takes a few seconds while the "
          "model replays the demo network; after that every step is instant. Everything runs locally: no internet is "
          "needed, fonts are bundled."),
        callout("Before presenting", "Start the server 5 minutes early, open the Live console once to warm it up, and use "
                "full-screen (F11 or Ctrl+Cmd+F). A 1920×1080 or 1280×720 screen both work.", DEFEND),
    ]

    # ---------------------------------------------------------------- 3
    story += [
        PageBreak(),
        P("3. How to use the app", "h1"),
        P("The menu has four pages: <b>01 Overview</b>, <b>02 Live console</b>, <b>03 Results</b> and <b>04 Method</b>. "
          "The button at the top right switches between dark and light themes and remembers your choice. Two further "
          "views open from inside the console: the full <b>Event log</b> and <b>Reports</b>."),
        P("3.1 Overview", "h2"),
        P("The landing page. Its right-hand panel is not an animation: it replays a real attack on NET-062, a network the "
          "model never saw in training, and prints the model's live output as an intercept log (ALERT, FCAST = forecast, "
          "PATH, ACTION, HOP = what the attacker actually did and the rank the model had given it). Below it are the four "
          "headline results and the research-gap table comparing Lateralis with prior work."),
        shot("overview", "Figure 2. Overview page with the live intercept replay."),
        PageBreak(),
        P("3.2 Live console", "h2"),
        P("The main demo screen. It replays an attack on a held-out network one hop at a time and shows what the model "
          "forecasts at each moment."),
        shot("console-stage2", "Figure 3. Live console at stage 2 of NET-062 with the true path revealed. The attacker moved "
             "C2 → C111; the model forecasts C57 next (16%, marked NEXT) and recommends revoking C111 → C67."),
        P("Toolbar (top)", "h3"),
        table([
            ["Control", "What it does"],
            ["Network selector", "Pick one of the 45 test networks (never seen in training). NET-062 is the default demo."],
            ["Back · Play · Next", "Step back, play automatically (one hop every 2.6 s) or step forward. The left and right arrow keys also work."],
            ["Stage label", "Which stage you are on and where the attacker is now."],
            ["Reveal true path", "Shows where the attacker really went (dotted line, ACTUAL badges, timeline filled in)."],
            ["Report PDF", "Opens the incident report for the current stage in a new tab."],
            ["as of …", "The exact moment the screen describes: the last hour of logs read, or the observed hop."],
            ["Top 1 / 3 / 5", "How many forecast paths to draw on the map."],
        ], [38 * mm, W - 38 * mm]),
        P("Map (centre)", "h3"),
        P("Critical assets (purple diamonds) sit in the middle ring, servers (blue) in the second ring, workstations (grey) "
          "outside. Red lines are the attack so far, amber dashed lines the forecast paths, the green dashed line the "
          "recommended cut, and the amber <b>NEXT p%</b> tag marks the single most likely next machine. Hover any machine "
          "to see its next-hop probability. The legend sits in its own strip under the map so it never covers the network."),
        P("Timeline (bottom)", "h3"),
        P("Entry → hops → target. Red steps have happened. Amber steps are forecasts: the most likely next machine with its "
          "probability, and the likely target. Click any step to jump to it."),
        P("Side panel (right)", "h3"),
        table([
            ["Panel", "Meaning"],
            ["Footholds", "How many machines the attacker controls."],
            ["Attacker on", "The machine the attacker is on now."],
            ["Path risk", "Combined probability of the top routes to a critical asset."],
            ["Confidence", "How focused the next-move forecast is (100% = one clear answer)."],
            ["Next move forecast", "Top 3 machines the attacker is likely to move to next, with calibrated probabilities. "
             "Uncertainty is the entropy of that single yes/no guess (0 = sure, 1 = coin flip)."],
            ["Recommended next cut", "The action that removes the most risk on the attacker's routes from where they are now, "
             "for the least normal traffic blocked. The line below it shows routine containment (isolate the known "
             "compromised machine) with its own numbers."],
            ["Live event feed", "A tail of the authentication log with real timestamps. HIGH #2 = a login from a compromised "
             "machine to the 2nd-ranked forecast destination; MED = any other login from a compromised machine or a very "
             "unexpected one. MODEL lines show each new forecast. All/Flagged filters, a minimize button with a "
             "new-events counter, and a 'full log' link."],
        ], [38 * mm, W - 38 * mm]),
        callout("Deep links", "You can open the console at a given moment, e.g. "
                "<font name='PlexMono'>#/console?net=62&amp;stage=2&amp;reveal=1</font> (stage is 1-based)."),
        CondPageBreak(110 * mm),
        P("3.3 Event log (from the feed's 'full log' link)", "h2"),
        P("Every machine-to-machine login around the attack with search, All / Flagged / High filters and a Reveal attack "
          "switch. Columns: time, user, connection, signals (from compromised, new route), forecast rank, 'unexpected' score "
          "from the model's link head, and the flag."),
        shot("event-log", "Figure 4. Event log for NET-062: the attacker's three logins are all flagged HIGH."),
        CondPageBreak(60 * mm),
        P("3.4 Reports and the PDF incident report", "h2"),
        P("The console's <b>Report PDF</b> button (or the Reports view at <font name='PlexMono'>#/reports</font>) produces a "
          "two-to-three page PDF for any network and stage: summary, recommended next cut and containment, network diagram, "
          "next-move forecast, top paths, other responses, flagged events known at that moment (never later ones), model "
          "reliability, and an optional ground-truth appendix."),
    ]
    rp1, rp2 = IMG / "report-page-1.png", IMG / "report-page-2.png"
    if rp1.exists() and rp2.exists():
        half = (W - 8) / 2
        imgs = []
        for pth in (rp1, rp2):
            im = Image(str(pth))
            r = im.imageHeight / im.imageWidth
            im.drawWidth, im.drawHeight = half, half * r
            imgs.append(im)
        t = Table([imgs], colWidths=[half + 4, half + 4])
        t.setStyle(TableStyle([("BOX", (0, 0), (0, 0), 0.6, LINE), ("BOX", (1, 0), (1, 0), 0.6, LINE)]))
        story += [KeepTogether([t, P("Figure 5. Pages 1 and 2 of a generated incident report (NET-062, stage 2).", "cap")])]
    story += [
        CondPageBreak(120 * mm),
        P("3.5 Results and Method", "h2"),
        P("<b>Results</b> shows the headline numbers, next-hop accuracy and attack-path charts against a rule-based baseline "
          "and random guessing, the full table and a reference card. <b>Method</b> summarises the architecture, data, "
          "training, path ranking and defense simulation."),
        shot("results", "Figure 6. Results page."),
    ]

    # ---------------------------------------------------------------- 4
    story += [
        P("4. 5-minute presentation script", "h1"),
        table([
            ["Time", "Where", "What to say / do"],
            ["0:00", "Overview", "\"Attackers move sideways. India's average breach takes 263 days to contain. Tools judge "
             "logins one by one; I forecast the next hop instead.\" Point at the live replay."],
            ["0:45", "Overview", "Point at the research-gap table: prior work covers one or two of the five abilities; "
             "Lateralis covers all five."],
            ["1:15", "Console, stage 1", "\"C2 is infected. The model gives C8 55%, marked NEXT. Containment: isolate C2. "
             "Next cut: revoke C2 → C8 for 0.7% of traffic.\""],
            ["2:00", "Console, Play", "Watch the feed: the attacker's login C2 → C111 appears flagged HIGH #2, then the MODEL "
             "line updates the forecast."],
            ["2:45", "Reveal", "Turn on Reveal true path: C57 is marked ACTUAL (the #1 guess at stage 2). The timeline fills in."],
            ["3:15", "Report PDF", "Open the report for the stage: everything an incident team needs on two pages."],
            ["3:45", "Results", "70% next hop in top 5 (random 9%), 73% of attacks caught before the target, link AUC 0.970."],
            ["4:30", "Wrap up", "Honest limits (synthetic data, full-path accuracy) and next steps: LANL, baselines, ablations."],
        ], [14 * mm, 28 * mm, W - 42 * mm]),
    ]

    # ---------------------------------------------------------------- 5
    story += [
        PageBreak(),
        P("5. System architecture", "h1"),
        P("Three layers. The browser renders everything itself from JSON; the FastAPI server holds the trained model in "
          "memory and answers requests; the Python package contains all machine learning, simulation and reporting code."),
        architecture_drawing(),
        P("Figure 7. Frontend, backend and ML core.", "cap"),
        P("API endpoints", "h3"),
        table([
            ["Endpoint", "Returns"],
            ["GET /api/summary", "Evaluation results, training history, data split, model size"],
            ["GET /api/networks", "The 45 held-out test networks and the default demo network"],
            ["GET /api/network/{id}", "Machines with roles and map positions, attack length, exact time of each stage"],
            ["GET /api/forecast/{id}/{stage}", "Footholds, next-hop probabilities, top paths, containment, next cuts, recent traffic, ground truth"],
            ["GET /api/events/{id}", "Login events around the attack with unexpectedness, forecast rank and flag"],
            ["GET /api/report/{id}/{stage}", "PDF incident report (?truth=0 hides the appendix, ?download=1 saves it)"],
        ], [55 * mm, W - 55 * mm], mono_cols=(0,)),
        P("Request flow for one console step", "h3"),
        bullets([
            "The browser asks for <font name='PlexMono'>/api/forecast/62/1</font>.",
            "The server replays NET-062's hourly snapshots through the GNN up to the stage's moment (cached after the first call).",
            "It turns the hop scores into calibrated move probabilities, ranks paths with Yen's algorithm, and runs the defense "
            "simulator over candidate actions.",
            "The browser draws the SVG map, side panel and timeline, and streams the new events into the feed.",
        ]),
    ]

    # ---------------------------------------------------------------- 6
    story += [
        P("6. Technology stack", "h1"),
        P("6.1 Backend and machine learning", "h2"),
        table([
            ["Technology", "Version", "Used for"],
            ["Python", platform.python_version(), "Everything server-side"],
            ["PyTorch", v("torch"), "Tensors, training loop, GRU memory, MLP heads"],
            ["PyTorch Geometric", v("torch-geometric"), "Heterogeneous graph attention (GATConv, HeteroConv), HeteroData snapshots"],
            ["NetworkX", v("networkx"), "Yen's k-shortest simple paths for attack-path ranking"],
            ["pandas + PyArrow", f"{v('pandas')} / {v('pyarrow')}", "Event tables, Parquet storage, feature aggregation"],
            ["NumPy", v("numpy"), "Synthetic data generation, metrics"],
            ["scikit-learn", v("scikit-learn"), "ROC-AUC and average precision"],
            ["FastAPI", v("fastapi"), "REST API and static file serving"],
            ["Uvicorn", v("uvicorn"), "ASGI web server"],
            ["ReportLab", v("reportlab"), "PDF incident reports and this manual"],
            ["pytest + httpx", v("pytest"), "25 automated tests (data, graphs, paths, defense, API, timing)"],
        ], [36 * mm, 26 * mm, W - 62 * mm]),
        P("6.2 Frontend", "h2"),
        table([
            ["Technology", "Used for"],
            ["HTML5 + CSS3", "Layout with CSS grid and flexbox; theme tokens as CSS custom properties (dark and light)"],
            ["Vanilla JavaScript (ES2020)", "Single-page app with a hash router; no framework and no build step"],
            ["Inline SVG", "Network map, charts, icons and the overview replay, all drawn in code"],
            ["IBM Plex Sans / Mono", "Typography, self-hosted (SIL Open Font License), so the app works offline"],
            ["localStorage", "Remembers theme and whether the event feed is minimized"],
        ], [48 * mm, W - 48 * mm]),
        P("6.3 Tooling", "h2"),
        table([
            ["Tool", "Used for"],
            ["uv", "Virtual environment and fast dependency installs"],
            ["Git + GitHub", "Version control (github.com/krish-31/aiml-sem5)"],
            ["Headless Google Chrome", "Screenshots in this manual (scripts/screenshots.sh)"],
            ["Claude (Anthropic)", "AI assistant used to help write code and documentation, as disclosed in the synopsis"],
        ], [48 * mm, W - 48 * mm]),
        callout("Change from the synopsis", "The synopsis planned a Streamlit front end. It was replaced with a custom "
                "HTML/JavaScript front end on FastAPI for a faster, more presentable interface; a Streamlit version is kept "
                "in app/dashboard.py as a backup.", PREDICT),
    ]

    # ---------------------------------------------------------------- 7
    story += [
        PageBreak(),
        P("7. The model", "h1"),
        table([
            ["Part", "Design"],
            ["Input", "One heterogeneous graph per hour: computer and user nodes; 'connects' (computer → computer) and "
             "'logs on' (user → computer) edges plus reverse edges. 10 computer features and 8 user features "
             "(activity counts, distinct partners, first-time connections, critical flag, time of day, weekend)."],
            ["Encoder", "2 heterogeneous graph-attention layers (GAT), 4 heads, hidden size 64, residual connections, LayerNorm."],
            ["Memory", "One GRU cell per node type carries each node's state from hour to hour."],
            ["Link head", "2-layer MLP on two node states plus history features: will u → v appear next hour?"],
            ["Next-hop head", "2-layer MLP scored over every machine, softmax: where does the attacker on u go next?"],
            ["History features", "Seen before, shared users (whose stolen passwords would work), past contact counts, "
             "credential value (the most powerful account seen on a machine), in-degree."],
            ["Training", "Binary cross-entropy with negative sampling (link) + cross-entropy (next hop, weight 2); Adam, lr 0.001, "
             "dropout 0.2, gradient clipping, early stopping (patience 6). 145,666 parameters; about 15 minutes on a laptop CPU."],
            ["Calibration", "Temperature scaling on the validation set (T ≈ 1.01: the model was already well calibrated)."],
            ["Path ranking", "Move cost −log p; Yen's k-shortest simple paths from the footholds to critical assets; "
             "path probability = product of hop probabilities."],
            ["Defense simulator", "For each candidate action (isolate a machine, revoke one access) re-normalise the move "
             "probabilities, re-rank the paths, utility = risk removed − traffic blocked. Containment of known compromised "
             "machines is reported separately; the next cut prefers actions on routes from the attacker's current machine."],
            ["Event flags", "HIGH: login from a compromised machine to a top-3 forecast destination. MEDIUM: other logins from "
             "compromised machines, or unexpectedness ≥ 0.95 from the link head."],
        ], [32 * mm, W - 32 * mm]),
        P("No information from the future is used: a forecast for hour t + 1 uses only hours up to t, and every screen, feed "
          "and report is cut off at the exact moment of its stage (checked by an automated test)."),
    ]

    # ---------------------------------------------------------------- 8
    att_share = ev and nets["attack_events"].sum() / nets["login_events"].sum()
    story += [
        P("8. The dataset", "h1"),
        P("Public logs (LANL, CICIDS2017, UNSW-NB15) label single attack events but never the complete route an attacker took. "
          "To measure path forecasting, Lateralis generates synthetic company networks with labelled attack paths "
          "(<font name='PlexMono'>src/attackpath/data/synthetic.py</font>, seed 42)."),
        table([
            ["Property", "Value"],
            ["Networks", f"{len(nets)} (train {sum(nets.split == 'train')} / validation {sum(nets.split == 'val')} / test {sum(nets.split == 'test')}, split by network)"],
            ["Machines per network", f"{(nets.workstations + nets.servers + nets.critical_assets).min()}–{(nets.workstations + nets.servers + nets.critical_assets).max()} "
             f"(workstations {nets.workstations.min()}–{nets.workstations.max()}, servers {nets.servers.min()}–{nets.servers.max()}, "
             f"critical assets {nets.critical_assets.min()}–{nets.critical_assets.max()})"],
            ["Time span", "7 days per network, hourly snapshots (168 per network)"],
            ["Login events", f"{nets.login_events.sum():,} in total, of which {nets.attack_events.sum():,} attack events ({att_share:.2%})"],
            ["Attack hops", f"{len(hops):,} hops; 3–6 per attack; targets: {(nets.target_role == 'database').sum()} databases, "
             f"{(nets.target_role == 'domain_controller').sum()} domain controllers"],
            ["Normal behaviour", "Office-hour peaks, quieter weekends, hot-desking (6%), admins on jump hosts (30%), rare unusual logins (1%), "
             "service accounts linking app servers to databases"],
            ["Attacker behaviour", "Credential theft at each machine, preference for machines where admins log in and for servers "
             "(MITRE ATT&amp;CK T1003), retries on the same hop"],
        ], [36 * mm, W - 36 * mm]),
        P("Files (folder <font name='PlexMono'>dataset/</font>)", "h3"),
        table([
            ["File", "Contents"],
            ["networks.csv", "One row per network: size, split, entry, target, full attack path, start and end time"],
            ["nodes.csv", "32,552 machines and users with role and critical-asset flag"],
            ["attack_hops.csv", "1,337 attack hops: timestamp, stolen account, from, to"],
            ["events_NET-062.csv", "All 5,709 login events of the demo network"],
            ["events_all.csv.gz", "All 1.4 million login events (12.5 MB, kept out of Git)"],
            ["README.md", "Data dictionary and how the data is generated"],
        ], [40 * mm, W - 40 * mm], mono_cols=(0,)),
    ]
    sample = hops[hops.network == "NET-062"][["hop", "timestamp", "user", "src", "dst"]].astype(str).values.tolist()
    row62 = nets[nets.network == "NET-062"].iloc[0]
    story += [
        P("Sample: the NET-062 attack", "h3"),
        P(f"Entry {row62.entry_machine}, target {row62.target_machine} ({row62.target_role.replace('_', ' ')}), path "
          f"<font name='PlexMono'>{row62.attack_path}</font>, test split."),
        table([["Hop", "Timestamp", "Account", "From", "To"]] + sample, [14 * mm, 44 * mm, 24 * mm, 24 * mm, 24 * mm],
              mono_cols=(1, 2, 3, 4)),
    ]

    # ---------------------------------------------------------------- 9
    story += [
        CondPageBreak(130 * mm),
        P("9. Results", "h1"),
        P(f"Measured on the {ev['n_test_networks']} held-out test networks ({ev['n_predictions']} next-hop predictions), "
          "under identical conditions for every method."),
        table([
            ["Measure", "Temporal GNN", "Rule-based", "Random"],
            ["Next hop in top 1", f"{nh['tgnn']['top1']:.0%}", f"{nh['heuristic']['top1']:.0%}", f"{nh['random']['top1']:.0%}"],
            ["Next hop in top 3", f"{nh['tgnn']['top3']:.0%}", f"{nh['heuristic']['top3']:.0%}", f"{nh['random']['top3']:.0%}"],
            ["Next hop in top 5", f"{nh['tgnn']['top5']:.0%}", f"{nh['heuristic']['top5']:.0%}", f"{nh['random']['top5']:.0%}"],
            ["Calibration error (ECE, lower is better)", f"{nh['tgnn']['ece']:.3f}", f"{nh['heuristic']['ece']:.3f}", "–"],
            ["Attack caught before target", f"{td['tgnn']['detected_before_target']:.0%}", f"{td['heuristic']['detected_before_target']:.0%}", "–"],
            ["Full remaining path in top 5", f"{ev['path_hit_rate']['tgnn']['top5']:.0%}", f"{ev['path_hit_rate']['heuristic']['top5']:.0%}",
             f"{ev['path_hit_rate']['random']['top5']:.0%}"],
            ["Next-hour link forecast AUC", f"{lk['auc']:.3f}", "–", "–"],
        ], [W - 90 * mm, 30 * mm, 30 * mm, 30 * mm], align_right=(1, 2, 3)),
        Spacer(1, 6),
        table([
            ["Response", "Risk removed", "Normal traffic blocked", "Blocks the real route"],
            ["Next cut (recommended)", f"{dfn['mean_risk_drop']:.0%}", f"{dfn['mean_normal_blocked']:.1%}", f"{dfn['cuts_true_path']:.0%}"],
            ["Containment (isolate compromised machine)", f"{con['mean_risk_drop']:.0%}", f"{con['mean_normal_blocked']:.1%}", f"{con['cuts_true_path']:.0%}"],
        ], [W - 96 * mm, 28 * mm, 36 * mm, 32 * mm], align_right=(1, 2, 3)),
        P("Event flags: every attack login on the test networks is flagged (a third as HIGH), against 3% of other logins.", "small"),
        Spacer(1, 4),
        P("How to read these numbers", "h3"),
        bullets([
            "Next-hop forecasting is about 8× better than random and beats the rule-based baseline on every measure. A linear "
            "model on the same features reaches similar top-5 accuracy, so the remaining error mostly comes from randomness in "
            "the synthetic attacker.",
            "Exact full-path accuracy is low because a path needs 3–6 correct guesses in a row; 'caught before target' is the "
            "more useful path measure for defenders.",
            "The next cut is a precise, low-disruption action; containment is the stronger blunt one. Used together: contain, then cut.",
        ]),
    ]

    # ---------------------------------------------------------------- 10
    story += [
        P("10. Limitations", "h1"),
        bullets([
            "All results are on synthetic data; behaviour on real enterprise logs is not yet measured.",
            "Full-path top-5 accuracy (17%) is far below the synopsis target of 70%.",
            "The replay assumes the initial compromise is detected and that each hop is seen when it happens.",
            "The defense simulator changes only the model's graph, never real systems; costs are measured on 24 hours of traffic.",
            "Only one model run (seed 0) so far; the synopsis plans three seeds and walk-forward validation.",
        ]),
    ]

    # ---------------------------------------------------------------- 11
    story += [
        P("11. Next steps", "h1"),
        table([
            ["Phase", "Step", "Detail"],
            ["Phase 1", "Real data: LANL", "Stream the 1.6 billion LANL authentication events in chunks, keep the window around "
             "the red-team activity, map to the same event format, split by time 70/15/15."],
            ["Phase 2", "CICIDS2017 and UNSW-NB15", "Machine-only flow graphs to test generalisation to a second kind of data."],
            ["Phase 3", "Baselines from the synopsis", "Logistic regression on node embeddings, single-snapshot GAT, Euler-style GCN + GRU."],
            ["Phase 4", "Ablations and rigour", "Remove the GRU and the calibration step one at a time; 3 seeds; 5-fold walk-forward validation; "
             "fairness check of false positives for admins vs normal users."],
            ["Phase 5", "Better path forecasts", "Multi-step rollout (re-run the model on predicted hops) and path-level training to lift "
             "full-path accuracy toward the target."],
            ["Phase 6", "Product", "Stream live logs into the API, alerting, Docker packaging, role-based access."],
            ["Phase 7", "Write-up", "Final report and a conference paper draft (IEEE / Springer, Scopus-indexed)."],
        ], [22 * mm, 40 * mm, W - 62 * mm]),
    ]

    # ---------------------------------------------------------------- appendix
    story += [
        CondPageBreak(90 * mm),
        P("A. Project structure and commands", "h1"),
        code("src/attackpath/",
             "  data/synthetic.py      synthetic networks and attacks",
             "  graph/builder.py       hourly heterogeneous snapshots",
             "  models/tgnn.py         temporal GNN (GAT + GRU, two heads)",
             "  models/train.py        training + temperature scaling",
             "  paths/rank.py          Yen's k-shortest attack paths",
             "  defense/simulator.py   containment and next-cut search",
             "  eventlog.py            path-aware event flags",
             "  report.py              PDF incident reports",
             "  eval/evaluate.py       test-set metrics and baselines",
             "  api/server.py          FastAPI backend",
             "web/                     frontend (index.html, styles.css, app.js, fonts/)",
             "dataset/                 exported CSV files",
             "docs/                    this manual and its build script",
             "tests/                   25 automated tests"),
        code(".venv/bin/python -m pytest -q             # run all tests",
             ".venv/bin/python scripts/export_dataset.py # re-export the CSV dataset",
             "sh scripts/screenshots.sh                  # re-capture screenshots (server running)",
             ".venv/bin/python docs/build_manual.py      # rebuild this PDF"),
    ]

    def page(canvas, doc):
        canvas.saveState()
        w, h = A4
        if doc.page > 1:
            canvas.setFont("Plex-Bold", 8.5)
            canvas.setFillColor(INK)
            canvas.drawString(16 * mm, h - 11 * mm, "Lateralis")
            canvas.setFont("Plex", 8)
            canvas.setFillColor(FAINT)
            canvas.drawString(31 * mm, h - 11 * mm, "User manual and technical overview")
            canvas.setStrokeColor(LINE)
            canvas.line(16 * mm, h - 13.5 * mm, w - 16 * mm, h - 13.5 * mm)
            canvas.drawRightString(w - 16 * mm, 10 * mm, f"Page {doc.page}")
            canvas.drawString(16 * mm, 10 * mm, "Krrish Agarwal · IS353IA · 2026–27")
        else:
            canvas.setFillColor(NAVY)
            canvas.rect(0, h - 26 * mm, w, 26 * mm, stroke=0, fill=1)
            canvas.setFillColor(colors.HexColor("#6c9cff"))
            canvas.roundRect(16 * mm, h - 18.5 * mm, 11 * mm, 11 * mm, 2.2 * mm, stroke=0, fill=1)
            cx, top = 21.5 * mm, h - 9.8 * mm
            path = canvas.beginPath()
            path.moveTo(cx, top); path.lineTo(cx + 3.3 * mm, top - 1.2 * mm); path.lineTo(cx + 3.3 * mm, top - 4.2 * mm)
            path.curveTo(cx + 3.3 * mm, top - 6.4 * mm, cx + 1.6 * mm, top - 7.4 * mm, cx, top - 8 * mm)
            path.curveTo(cx - 1.6 * mm, top - 7.4 * mm, cx - 3.3 * mm, top - 6.4 * mm, cx - 3.3 * mm, top - 4.2 * mm)
            path.lineTo(cx - 3.3 * mm, top - 1.2 * mm); path.close()
            canvas.setFillColor(NAVY)
            canvas.drawPath(path, stroke=0, fill=1)
            canvas.setFillColor(colors.white)
            canvas.setFont("Plex-Bold", 13)
            canvas.drawString(30 * mm, h - 14.5 * mm, "Lateralis")
            canvas.setFont("Plex", 8)
            canvas.setFillColor(colors.HexColor("#94a3b8"))
            canvas.drawString(52 * mm, h - 14.5 * mm, "PATH FORECASTING")
        canvas.restoreState()

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=19 * mm,
                            bottomMargin=16 * mm, title="Lateralis: user manual and technical overview",
                            author="Krrish Agarwal", subject="IS353IA project")
    doc.build(story, onFirstPage=page, onLaterPages=page)
    print(f"saved {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
