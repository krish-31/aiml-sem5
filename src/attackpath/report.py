"""PDF incident forecast report.

One report describes one network at one stage of an attack: what is compromised, where the
attacker is likely to go next, the most likely paths to critical assets, the recommended
response, flagged log events and how reliable the model is. Built with ReportLab.
"""

from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path

from reportlab.graphics.shapes import Circle, Drawing, Line, Polygon, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_DIR = Path(__file__).parent / "assets" / "fonts"


def _register_fonts() -> None:
    """Embed IBM Plex in the PDF so it renders the same in every viewer."""
    if "Plex" in pdfmetrics.getRegisteredFontNames():
        return
    for name, file in (("Plex", "IBMPlexSans-400.ttf"), ("Plex-SemiBold", "IBMPlexSans-600.ttf"),
                       ("Plex-Bold", "IBMPlexSans-700.ttf"), ("PlexMono", "IBMPlexMono-400.ttf")):
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    addMapping("Plex", 0, 0, "Plex")
    addMapping("Plex", 1, 0, "Plex-Bold")
    addMapping("Plex", 0, 1, "Plex")
    addMapping("Plex", 1, 1, "Plex-Bold")


INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#475569")
FAINT = colors.HexColor("#94a3b8")
LINE = colors.HexColor("#e2e8f0")
PANEL = colors.HexColor("#f6f8fb")
ACCENT = colors.HexColor("#2557d6")
ATTACK = colors.HexColor("#d93a3f")
PREDICT = colors.HexColor("#c27a0e")
DEFEND = colors.HexColor("#138a63")
CRITICAL = colors.HexColor("#6d4fd6")
SERVER = colors.HexColor("#2f6fe0")
WS = colors.HexColor("#a3adbd")

ROLE = {
    "workstation": "Workstation", "file_server": "File server", "mail_server": "Mail server",
    "app_server": "App server", "web_server": "Web server", "print_server": "Print server",
    "domain_controller": "Domain controller", "database": "Database",
}


def _styles():
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Plex-Bold", fontSize=20, leading=24, textColor=INK, spaceAfter=2),
        "sub": ParagraphStyle("sub", parent=base["Normal"], fontName="Plex", fontSize=9.5, leading=13, textColor=MUTED),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Plex-Bold", fontSize=12, leading=15, textColor=INK, spaceBefore=12, spaceAfter=6),
        "body": ParagraphStyle("body", parent=base["Normal"], fontName="Plex", fontSize=9, leading=12.5, textColor=MUTED, alignment=TA_LEFT),
        "cell": ParagraphStyle("cell", parent=base["Normal"], fontName="Plex", fontSize=8.5, leading=11, textColor=INK),
        "mono": ParagraphStyle("mono", parent=base["Normal"], fontName="PlexMono", fontSize=8.5, leading=11, textColor=INK),
        "kpi_k": ParagraphStyle("kpi_k", fontName="Plex", fontSize=7.5, leading=9, textColor=MUTED),
        "kpi_v": ParagraphStyle("kpi_v", fontName="Plex-Bold", fontSize=16, leading=19, textColor=INK),
        "act": ParagraphStyle("act", fontName="Plex-Bold", fontSize=13, leading=16, textColor=INK),
    }


def _table(data, widths, header=True, zebra=True, align_right=()):
    t = Table(data, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    style = [
        ("FONT", (0, 0), (-1, -1), "Plex", 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
    ]
    if header:
        style += [
            ("FONT", (0, 0), (-1, 0), "Plex-Bold", 7.5),
            ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
            ("LINEBELOW", (0, 0), (-1, 0), 0.8, FAINT),
        ]
    if zebra:
        for i in range(1 if header else 0, len(data)):
            if i % 2 == 0:
                style.append(("BACKGROUND", (0, i), (-1, i), PANEL))
    for c in align_right:
        style.append(("ALIGN", (c, 0), (c, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def _network_drawing(nodes, fc, width=170 * mm, height=92 * mm) -> Drawing:
    """Concentric map: critical assets centre, servers middle, workstations outside."""
    d = Drawing(width, height)
    cx, cy, R = width * 0.36, height / 2, height * 0.46
    pos = {n["i"]: (cx + n["x"] * R, cy - n["y"] * R) for n in nodes}
    for r in (0.24, 0.6, 1.0):
        d.add(Circle(cx, cy, r * R, strokeColor=LINE, strokeDashArray=[2, 2], fillColor=None, strokeWidth=0.6))
    for u, v, _ in fc["normal_edges"]:
        (x1, y1), (x2, y2) = pos[u], pos[v]
        d.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor("#e7ebf1"), strokeWidth=0.35))
    for rank, p in reversed(list(enumerate(fc["paths"][:3]))):
        for a, b in zip(p["nodes"][:-1], p["nodes"][1:]):
            (x1, y1), (x2, y2) = pos[a], pos[b]
            d.add(Line(x1, y1, x2, y2, strokeColor=PREDICT, strokeWidth=2.4 - rank * 0.6, strokeDashArray=[4, 2]))
    fh = fc["footholds"]
    for a, b in zip(fh[:-1], fh[1:]):
        (x1, y1), (x2, y2) = pos[a], pos[b]
        d.add(Line(x1, y1, x2, y2, strokeColor=ATTACK, strokeWidth=2.6))
    held = set(fh)
    top = {h["node"] for h in fc["next_hops"][:3]}
    on_path = {i for p in fc["paths"][:3] for i in p["nodes"]}
    for n in nodes:
        x, y = pos[n["i"]]
        col = ATTACK if n["i"] in held else CRITICAL if n["group"] == "critical" else SERVER if n["group"] == "server" else WS
        if n["group"] == "critical":
            s = 5
            d.add(Polygon([x, y + s, x + s, y, x, y - s, x - s, y], fillColor=col, strokeColor=colors.white, strokeWidth=0.6))
        else:
            d.add(Circle(x, y, 3.4 if n["group"] == "server" else 2.2, fillColor=col, strokeColor=colors.white, strokeWidth=0.5))
        if n["i"] in held or n["i"] in top or n["i"] in on_path or n["group"] == "critical":
            d.add(String(x, y - 9, n["name"], fontName="Plex-Bold" if n["i"] in held else "Plex",
                         fontSize=6, fillColor=ATTACK if n["i"] in held else INK, textAnchor="middle"))
    if fc["actions"] and fc["actions"][0]["kind"] == "isolate":
        x, y = pos[fc["actions"][0]["nodes"][0]]
        d.add(Circle(x, y, 8, strokeColor=DEFEND, strokeWidth=1.4, strokeDashArray=[2, 1.5], fillColor=None))
    elif fc["actions"]:
        a, b = fc["actions"][0]["nodes"]
        (x1, y1), (x2, y2) = pos[a], pos[b]
        d.add(Line(x1, y1, x2, y2, strokeColor=DEFEND, strokeWidth=3, strokeDashArray=[3, 2]))
    # legend
    lx, ly = width * 0.76, height - 14
    for label, kind, col in (("Attack so far", "line", ATTACK), ("Forecast path", "dash", PREDICT),
                             ("Recommended response", "ring", DEFEND), ("Compromised", "dot", ATTACK),
                             ("Critical asset", "dia", CRITICAL), ("Server", "dot", SERVER), ("Workstation", "dot", WS)):
        if kind == "line":
            d.add(Line(lx, ly + 3, lx + 14, ly + 3, strokeColor=col, strokeWidth=2.4))
        elif kind == "dash":
            d.add(Line(lx, ly + 3, lx + 14, ly + 3, strokeColor=col, strokeWidth=2, strokeDashArray=[3, 2]))
        elif kind == "ring":
            d.add(Circle(lx + 7, ly + 3, 4, strokeColor=col, strokeWidth=1.2, strokeDashArray=[2, 1.5], fillColor=None))
        elif kind == "dia":
            d.add(Polygon([lx + 7, ly + 7, lx + 11, ly + 3, lx + 7, ly - 1, lx + 3, ly + 3], fillColor=col, strokeColor=None))
        else:
            d.add(Circle(lx + 7, ly + 3, 3, fillColor=col, strokeColor=None))
        d.add(String(lx + 20, ly, label, fontName="Plex", fontSize=7.5, fillColor=MUTED))
        ly -= 14
    return d


def _page(canvas, doc, meta):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(INK)
    canvas.rect(0, h - 14 * mm, w, 14 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Plex-Bold", 11)
    canvas.drawString(16 * mm, h - 9 * mm, "Lateralis")
    canvas.setFont("Plex", 8)
    canvas.setFillColor(colors.HexColor("#cbd5e1"))
    canvas.drawString(36 * mm, h - 9 * mm, "Incident forecast report")
    canvas.drawRightString(w - 16 * mm, h - 9 * mm, "Synthetic data · academic demonstration")
    canvas.setFillColor(FAINT)
    canvas.setFont("Plex", 7.5)
    canvas.drawString(16 * mm, 10 * mm, f"{meta['network']} · generated {meta['generated']}")
    canvas.drawRightString(w - 16 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_report(net: dict, fc: dict, events: dict | None, evaluation: dict | None, include_truth: bool = True) -> bytes:
    """Render the report as PDF bytes. `net` and `fc` are the API's network and forecast payloads."""
    _register_fonts()
    S = _styles()
    nodes = net["nodes"]
    name = lambda i: nodes[i]["name"]  # noqa: E731
    role = lambda i: ROLE.get(nodes[i]["role"], nodes[i]["role"])  # noqa: E731
    network = f"NET-{net['id']:03d}"
    stage, K = fc["stage"], net["hops"]
    meta = {"network": network, "generated": datetime.now().strftime("%d %b %Y, %H:%M")}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=22 * mm,
                            bottomMargin=18 * mm, title=f"Lateralis report {network}", author="Lateralis")
    story = []

    # title
    story += [
        Paragraph(f"Incident forecast: {network}", S["h1"]),
        Paragraph(
            f"Logs analysed up to <b>{fc['time']['label']}</b> · stage {stage + 1} of {K} "
            f"({'initial access only' if stage == 0 else f'{stage} hop' + ('s' if stage > 1 else '') + ' observed'}) · "
            f"{len(nodes)} machines, {net['users']} users", S["sub"]),
        Spacer(1, 8),
    ]

    # KPIs
    kpis = [
        ("Compromised machines", str(len(fc["footholds"]))),
        ("Attacker is on", f"{name(fc['current'])}"),
        ("Risk to critical assets", f"{fc['risk']:.0%}"),
        ("Forecast confidence", f"{fc['confidence']:.0%}"),
    ]
    kt = Table([[[Paragraph(k, S["kpi_k"]), Paragraph(v, S["kpi_v"])] for k, v in kpis]], colWidths=[44.5 * mm] * 4)
    kt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                            ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE), ("TOPPADDING", (0, 0), (-1, -1), 7),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 9)]))
    story.append(kt)

    # recommendation
    if fc["actions"]:
        a = fc["actions"][0]
        what = (f"Isolate {name(a['nodes'][0])} ({role(a['nodes'][0]).lower()})" if a["kind"] == "isolate"
                else f"Revoke access from {name(a['nodes'][0])} to {name(a['nodes'][1])}")
        rec = Table([[Paragraph("RECOMMENDED RESPONSE", ParagraphStyle("t", fontName="Plex-Bold", fontSize=7.5, textColor=DEFEND))],
                     [Paragraph(what, S["act"])],
                     [Paragraph(f"Removes <b>{a['risk_drop']:.0%}</b> of the forecast path risk while blocking "
                                f"<b>{a['blocked']:.1%}</b> of normal machine-to-machine traffic from the last 24 hours. "
                                "Chosen by the defense simulator as the action with the best risk removed minus traffic blocked.",
                                S["body"])]],
                    colWidths=[178 * mm])
        rec.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eef8f3")),
                                 ("LINEBEFORE", (0, 0), (0, -1), 3, DEFEND), ("LEFTPADDING", (0, 0), (-1, -1), 10),
                                 ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        story += [Spacer(1, 10), rec]

    # network map
    story += [Paragraph("Network view", S["h2"]), _network_drawing(nodes, fc)]

    # next hop + paths
    nh = [["#", "Machine", "Type", "Probability", "Uncertainty"]] + [
        [str(r + 1), name(h["node"]), role(h["node"]), f"{h['prob']:.1%}", f"{h['uncertainty']:.2f}"]
        for r, h in enumerate(fc["next_hops"])]
    story.append(KeepTogether([Paragraph("Forecast: attacker's next move", S["h2"]),
                               Paragraph(f"Calibrated probability that the attacker on <b>{name(fc['current'])}</b> moves to each machine next. "
                                         "Uncertainty is the binary entropy of that probability (0 sure, 1 coin flip).", S["body"]),
                               Spacer(1, 4), _table(nh, [10 * mm, 34 * mm, 50 * mm, 42 * mm, 42 * mm], align_right=(3, 4))]))
    pt = [["#", "Route", "Hops", "Probability"]] + [
        [str(r + 1), Paragraph(" → ".join(name(i) for i in p["nodes"]), S["mono"]), str(len(p["nodes"]) - 1), f"{p['prob']:.3f}"]
        for r, p in enumerate(fc["paths"])]
    story.append(KeepTogether([Paragraph("Most likely paths to critical assets", S["h2"]),
                               Paragraph("Ranked with Yen's k-shortest paths on move costs of −log p. A path's probability is the product of its hops.", S["body"]),
                               Spacer(1, 4), _table(pt, [10 * mm, 116 * mm, 20 * mm, 32 * mm], align_right=(2, 3))]))
    if len(fc["actions"]) > 1:
        def act_label(a):
            return (f"Isolate {name(a['nodes'][0])}" if a["kind"] == "isolate"
                    else f"Revoke {name(a['nodes'][0])} → {name(a['nodes'][1])}")
        at = [["Alternative response", "Risk removed", "Traffic blocked", "Utility"]] + [
            [act_label(a), f"{a['risk_drop']:.0%}", f"{a['blocked']:.1%}", f"{a['utility']:.2f}"] for a in fc["actions"][1:6]]
        story.append(KeepTogether([Paragraph("Other responses considered", S["h2"]),
                                   _table(at, [88 * mm, 30 * mm, 30 * mm, 30 * mm], align_right=(1, 2, 3))]))

    # flagged events
    if events:
        # only events the analyst could have seen at this stage: logs up to the forecast hour,
        # plus the hops already observed (which may fall a few minutes into the next hour)
        hop_time = {}
        for e in events["events"]:
            if e["attack"]:
                hop_time[e["step"]] = min(hop_time.get(e["step"], e["time"]), e["time"])
        cutoff = max((fc["hour"] + 1) * 3600 - 1, hop_time.get(stage, -1))
        flagged = [e for e in events["events"] if e["severity"] in ("high", "medium") and e["time"] <= cutoff]
        flagged.sort(key=lambda e: (e["severity"] != "high", -e["time"]))
        if flagged:
            et = [["Time", "User", "Connection", "Flag", "Forecast rank", "Unexpected"]] + [
                [e["label"], e["user"], f"{e['src']} → {e['dst']}", e["severity"].upper(),
                 "-" if e["forecast_rank"] is None else f"#{e['forecast_rank']}",
                 "-" if e["unexpected"] is None else f"{e['unexpected']:.2f}"]
                for e in flagged[:12]]
            t = _table(et, [26 * mm, 18 * mm, 46 * mm, 22 * mm, 32 * mm, 34 * mm], align_right=(4, 5))
            for i, e in enumerate(flagged[:12], start=1):
                t.setStyle(TableStyle([("TEXTCOLOR", (3, i), (3, i), ATTACK if e["severity"] == "high" else PREDICT),
                                       ("FONT", (3, i), (3, i), "Plex-Bold", 8)]))
            story.append(KeepTogether([Paragraph("Flagged log events", S["h2"]),
                                       Paragraph("Logins from compromised machines, checked against the forecast made before they happened. "
                                                 "HIGH: destination was in the top-3 forecast. MEDIUM: any other login from a compromised "
                                                 "machine, or a very unexpected connection.", S["body"]),
                                       Spacer(1, 4), t]))

    # model reliability
    if evaluation:
        nhm, td, lk = evaluation["next_hop"], evaluation["time_to_detection"], evaluation["link"]["calibrated"]
        mt = [["Measure (45 unseen test networks)", "Temporal GNN", "Rule-based", "Random"],
              ["Next hop in top 5", f"{nhm['tgnn']['top5']:.0%}", f"{nhm['heuristic']['top5']:.0%}", f"{nhm['random']['top5']:.0%}"],
              ["Next hop in top 1", f"{nhm['tgnn']['top1']:.0%}", f"{nhm['heuristic']['top1']:.0%}", f"{nhm['random']['top1']:.0%}"],
              ["Attack caught before target", f"{td['tgnn']['detected_before_target']:.0%}", f"{td['heuristic']['detected_before_target']:.0%}", "-"],
              ["Calibration error (ECE)", f"{nhm['tgnn']['ece']:.3f}", f"{nhm['heuristic']['ece']:.3f}", "-"],
              ["Next-hour link AUC", f"{lk['auc']:.3f}", "-", "-"]]
        story.append(KeepTogether([Paragraph("How reliable is this forecast?", S["h2"]),
                                   _table(mt, [80 * mm, 34 * mm, 32 * mm, 32 * mm], align_right=(1, 2, 3))]))

    # ground truth appendix
    if include_truth:
        truth = fc["truth"]["remaining"]
        in_top = any(p["nodes"] == truth for p in fc["paths"])
        nxt = fc["truth"]["next"]
        rank = 1 + sum(p > fc["p_next"][nxt] for p in fc["p_next"]) if nxt is not None else None
        story.append(KeepTogether([
            Paragraph("Appendix: ground truth (evaluation only)", S["h2"]),
            Paragraph("Synthetic networks record where the attacker really went. A real deployment would not have this section.", S["body"]),
            Spacer(1, 4),
            _table([["Item", "Value"],
                    ["Real remaining path", Paragraph(" → ".join(name(i) for i in truth), S["mono"])],
                    ["Real next machine", f"{name(nxt)} (forecast rank #{rank})" if nxt is not None else "-"],
                    ["Real path among top-5 forecast paths", "Yes" if in_top else "No"]],
                   [70 * mm, 108 * mm], zebra=False)]))

    doc.build(story, onFirstPage=lambda c, d: _page(c, d, meta), onLaterPages=lambda c, d: _page(c, d, meta))
    return buf.getvalue()


def report_filename(gid: int, stage: int) -> str:
    return f"lateralis-report-NET-{gid:03d}-stage-{stage + 1}.pdf"

