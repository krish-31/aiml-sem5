/* Lateralis: single-page frontend (no build step, no external libraries). */
"use strict";

/* ------------------------------------------------------------------ utils */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x, d = 0) => `${(100 * x).toFixed(d)}%`;
const icon = (id, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const netName = (id) => `NET-${String(id).padStart(3, "0")}`;
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const cache = new Map();
function api(path) {
  if (!cache.has(path)) {
    const p = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}

/* ------------------------------------------------------------------ theme */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("lateralis-theme", t); } catch (e) { /* storage blocked: theme still applies */ }
}
$("#theme-toggle").addEventListener("click", () =>
  setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));

api("/api/summary").catch(() => {
  $(".status-dot").classList.add("off");
  $(".status-text").textContent = "Model offline";
});

/* ---------------------------------------------------------------- tooltip */
const tip = $("#tooltip");
function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let left = x + 16, top = y + 16;
  if (left + r.width > innerWidth - 8) left = x - r.width - 16;
  if (top + r.height > innerHeight - 8) top = y - r.height - 16;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
const hideTip = () => { tip.hidden = true; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function statTiles(ev) {
  const nh = ev.next_hop, td = ev.time_to_detection, d = ev.defense || {};
  const tiles = [
    ["predict", "Next hop in top 5", pct(nh.tgnn.top5), `random guess: ${pct(nh.random.top5)}`],
    ["attack", "Caught before target", pct(td.tgnn.detected_before_target), `rule-based: ${pct(td.heuristic.detected_before_target)}`],
    ["", "Next-hour link AUC", ev.link.calibrated.auc.toFixed(3), "target in synopsis: 0.90"],
    ["defend", "Risk cut by response", d.mean_risk_drop != null ? pct(d.mean_risk_drop) : "n/a",
      d.mean_normal_blocked != null ? `blocks ${pct(d.mean_normal_blocked, 1)} of normal traffic` : ""],
  ];
  return tiles.map(([c, k, v, n], i) => `
    <div class="card stat ${c} fade-in d${i}"><div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div></div>`).join("");
}

function footer() {
  return `<footer class="footer">
    <span><b style="color:var(--text)">Lateralis</b> · Temporal Graph Learning for Cyber Attack-Path Forecasting and Adaptive Defense · Krrish Agarwal · IS353IA · 2026–27</span>
    <a href="https://github.com/krish-31/aiml-sem5" target="_blank" rel="noopener">${icon("github")} krish-31/aiml-sem5</a>
  </footer>`;
}

/* ================================================================ landing */
function sectionHead(n, label, title, text) {
  return `<div class="section-head">
    <div class="idx"><b>${n}</b> / ${label}</div>
    <div><h2>${title}</h2>${text ? `<p>${text}</p>` : ""}</div>
  </div>`;
}

const PRIOR = [
  ["Bowman et al.", "RAID 2020", ["n", "n", "n", "n", "n"]],
  ["Euler", "NDSS 2022", ["y", "h", "n", "n", "n"]],
  ["DyMHAG", "IEEE Access 2025", ["y", "h", "n", "n", "n"]],
  ["Physics-informed GNN", "JCP 2025", ["n", "n", "y", "n", "n"]],
  ["SPGNN-API", "IEEE TIFS 2024", ["n", "n", "y", "n", "y"]],
  ["CybORG", "arXiv 2021", ["n", "n", "n", "n", "h"]],
];

function versusTable() {
  const mark = (v) => v === "y" ? `<span class="mark y">${icon("check")}</span>`
    : v === "h" ? `<span class="mark h" title="partly">~</span>` : `<span class="mark n" title="no">&ndash;</span>`;
  const cols = ["Learns event order", "Next-step forecast", "Full path ranking", "Calibrated confidence", "Defense action"];
  return `<div class="card versus"><table class="vs">
    <thead><tr><th>Approach</th>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>
      ${PRIOR.map(([n, v, m]) => `<tr><td><b>${n}</b><small>${v}</small></td>${m.map((x) => `<td>${mark(x)}</td>`).join("")}</tr>`).join("")}
      <tr class="us"><td><b>Lateralis</b><small>this project</small></td>${cols.map(() => `<td>${mark("y")}</td>`).join("")}</tr>
    </tbody></table></div>`;
}

function pageLanding(view) {
  view.innerHTML = `
  <div class="page">
    <section class="hero">
      <div class="fade-in">
        <span class="eyebrow">Lateralis / attack-path forecasting</span>
        <h1>Intruders move <em>sideways.</em><br/>We see where they're <em class="p">heading.</em></h1>
        <p class="lede">Attackers hop from machine to machine toward critical servers. <b>Lateralis</b> forecasts the
          next hop, ranks the likely paths and recommends the action that cuts them off.</p>
        <div class="cta">
          <a class="btn primary" href="#/console">Open the console ${icon("arrow")}</a>
          <a class="btn ghost" href="#/results">See results</a>
        </div>
      </div>
      <div class="card intercept fade-in d2" id="ix">
        <div class="ix-head"><span id="ix-title">Intercept / connecting</span><span class="rec">Replay</span></div>
        <div class="ix-graph"><div class="ix-stage" id="ix-stage">Loading model</div><div id="ix-svg" style="position:absolute;inset:0"></div><div class="scan"></div></div>
        <div class="ix-log" id="ix-log"><div class="ix-line"><span class="t">--:--</span><span class="k k-sys">SYS</span><span class="v">waiting for model <span class="cursor"></span></span></div></div>
      </div>
    </section>

    <section class="proof" id="proof">${'<div><div class="k">Loading</div><div class="n faint">--</div></div>'.repeat(4)}</section>

    ${sectionHead("01", "Research gap", "One system for <em>all four</em> steps.",
      "Prior work covers one or two of these. Lateralis joins them in one pipeline.")}
    ${versusTable()}

    ${footer()}
  </div>`;

  api("/api/summary").then((s) => {
    const ev = s.evaluation, p = $("#proof");
    if (!ev || !p) return;
    const nh = ev.next_hop, td = ev.time_to_detection, d = ev.defense || {};
    p.innerHTML = [
      ["Next hop in top 5", pct(nh.tgnn.top5), `rule-based <b>${pct(nh.heuristic.top5)}</b> · random <b>${pct(nh.random.top5)}</b>`],
      ["Caught before target", pct(td.tgnn.detected_before_target), `rule-based <b>${pct(td.heuristic.detected_before_target)}</b>`],
      ["Next-hour link AUC", ev.link.calibrated.auc.toFixed(3), "synopsis target <b>0.90</b>"],
      ["Risk cut by response", pct(d.mean_risk_drop || 0), `blocks <b>${pct(d.mean_normal_blocked || 0, 1)}</b> of normal traffic`],
    ].map(([k, n, sub]) => `<div><div class="k">${k}</div><div class="n">${n}</div><div class="s">${sub}</div></div>`).join("");
  }).catch(() => {});

  startIntercept();
  cleanup = () => { IX.run += 1; };
}

/* ------------------------------------------------- live intercept replay */
const IX = { run: 0 };

async function startIntercept() {
  const run = ++IX.run;
  const alive = () => run === IX.run && $("#ix-log");
  const log = (t, k, cls, v) => {
    const el = $("#ix-log");
    if (!el) return;
    const line = document.createElement("div");
    line.className = "ix-line";
    line.innerHTML = `<span class="t">${t}</span><span class="k ${cls}">${k}</span><span class="v">${v}</span>`;
    el.appendChild(line);
    while (el.children.length > 9) el.firstChild.remove();
  };
  let net, fcs;
  try {
    const { default: gid } = await api("/api/networks");
    net = await api(`/api/network/${gid}`);
    fcs = await Promise.all(Array.from({ length: net.hops }, (_, s) => api(`/api/forecast/${gid}/${s}`)));
  } catch (e) {
    if (alive()) {
      $("#ix-log").innerHTML = "";
      log("--:--", "SYS", "k-sys", "model offline. start <b>python -m attackpath.api.server</b>");
      $("#ix-stage").textContent = "Offline";
    }
    return;
  }
  if (!alive()) return;
  const nm = (i) => net.nodes[i].name;
  const lbl = (i) => net.nodes[i].label.toLowerCase();
  const rankOf = (fc, v) => 1 + fc.p_next.filter((p) => p > fc.p_next[v]).length;
  const truth = fcs[0].truth.remaining;
  const K = net.hops;
  $("#ix-title").textContent = `Intercept / ${netName(net.id)} / ${net.nodes.length} hosts / unseen in training`;
  const firstHit = fcs.findIndex((f) => f.paths.some((p) => sameList(p.nodes, f.truth.remaining)));

  while (alive()) {
    $("#ix-log").innerHTML = "";
    log("--:--", "SYS", "k-sys", `replaying held-out attack on <b>${netName(net.id)}</b>`);
    for (let s = 0; s < K && alive(); s++) {
      const fc = fcs[s];
      const t = `D${fc.time.day} ${String(fc.time.hour).padStart(2, "0")}:00`;
      $("#ix-svg").innerHTML = graphSVG(net, fc, 2, false);
      $("#ix-stage").textContent = `Stage ${s + 1}/${K} · ${fc.time.label}`;
      await sleep(500);
      if (!alive()) return;
      if (s === 0) log(t, "ALERT", "k-alert", `initial access on <b>${nm(fc.current)}</b> · ${lbl(fc.current)}`);
      else {
        const r = rankOf(fcs[s - 1], fc.current);
        log(t, "HOP", r <= 3 ? "k-ok" : "k-obs", `<b>${nm(fc.footholds[s - 1])} → ${nm(fc.current)}</b> · forecast rank #${r}`);
      }
      await sleep(750); if (!alive()) return;
      log("", "FCAST", "k-fcast", fc.next_hops.slice(0, 3).map((h) => `<b>${nm(h.node)}</b> ${pct(h.prob)}`).join(" · "));
      await sleep(750); if (!alive()) return;
      if (fc.paths[0]) log("", "PATH", "k-path", `${fc.paths[0].nodes.map(nm).join(" → ")} · p=${fc.paths[0].prob.toFixed(3)}`);
      await sleep(750); if (!alive()) return;
      const a = fc.actions[0];
      if (a) log("", "ACTION", "k-act", `${a.kind === "isolate" ? `isolate <b>${nm(a.nodes[0])}</b>` : `revoke <b>${nm(a.nodes[0])} → ${nm(a.nodes[1])}</b>`} · risk -${pct(a.risk_drop)} · cost ${pct(a.blocked, 1)}`);
      await sleep(2000);
    }
    if (!alive()) return;
    const last = fcs[K - 1];
    const target = truth[truth.length - 1];
    const r = rankOf(last, target);
    log("", "HOP", r <= 3 ? "k-ok" : "k-obs", `<b>${nm(last.current)} → ${nm(target)}</b> · forecast rank #${r}`);
    await sleep(700); if (!alive()) return;
    log("", "TARGET", "k-alert", `<b>${nm(target)}</b> reached · ${lbl(target)}`);
    await sleep(700); if (!alive()) return;
    log("", "VERDICT", "k-ok", firstHit >= 0
      ? `true path was in the top-5 forecast ${K - firstHit} hop${K - firstHit > 1 ? "s" : ""} before the target`
      : "true path never entered the top-5 forecast");
    await sleep(5200);
  }
}

/* ================================================================ console */
const C = { gid: null, stage: 0, reveal: false, k: 3, playing: false, timer: null, token: 0, net: null, fc: null };

function pageConsole(view) {
  view.innerHTML = `
  <div class="console">
    <aside class="panel controls">
      <div>
        <div class="ctl-title">Scenario</div>
        <select class="select" id="net-select" aria-label="Test network"><option>Loading networks</option></select>
        <dl class="kv" id="net-meta"></dl>
      </div>
      <div>
        <div class="ctl-title">Playback</div>
        <div class="player">
          <button class="icon-btn" id="prev" type="button" aria-label="Previous hop">${icon("prev")}</button>
          <button class="icon-btn play" id="play" type="button">${icon("play")}<span>Play</span></button>
          <button class="icon-btn" id="next" type="button" aria-label="Next hop">${icon("next")}</button>
        </div>
        <div class="stage-label" id="stage-label"></div>
      </div>
      <div>
        <div class="ctl-title">View</div>
        <label class="switch-row"><span>Reveal true path</span>
          <button class="switch" id="reveal" type="button" role="switch" aria-checked="${C.reveal}"></button></label>
        <div style="margin-top:16px">
          <div class="muted" style="font-size:13px;margin-bottom:8px">Forecast paths on graph</div>
          <div class="seg" id="kseg">${[1, 3, 5].map((k) => `<button type="button" data-k="${k}" aria-pressed="${k === C.k}">Top ${k}</button>`).join("")}</div>
        </div>
      </div>
      <div>
        <div class="ctl-title">Legend</div>
        <div class="legend">
          <span><i class="sw line" style="background:var(--attack)"></i>Attack so far</span>
          <span><i class="sw dash" style="border-color:var(--predict)"></i>Forecast path</span>
          <span><i class="sw dash" style="border-color:var(--truth);border-top-style:dotted"></i>True path (revealed)</span>
          <span><i class="sw ring"></i>Recommended response</span>
          <span><i class="sw dot" style="background:var(--attack)"></i>Compromised</span>
          <span><i class="sw dia" style="background:var(--critical)"></i>Critical asset</span>
          <span><i class="sw dot" style="background:var(--server)"></i>Server</span>
          <span><i class="sw dot" style="background:var(--ws)"></i>Workstation</span>
        </div>
      </div>
    </aside>

    <section class="panel stage">
      <div class="stage-head">
        <div><h2 id="stage-title">Loading network</h2><div class="sub" id="stage-sub">&nbsp;</div></div>
        <div class="clock" id="clock">--</div>
      </div>
      <div class="graph-wrap">
        <div class="graph" id="graph"></div>
        <div class="loading" id="loading"><div><div class="spin"></div>Replaying logs and forecasting</div></div>
      </div>
      <div class="timeline" id="timeline"></div>
    </section>

    <aside class="intel" id="intel"></aside>
  </div>`;

  $("#net-select").addEventListener("change", (e) => { C.gid = Number(e.target.value); C.stage = 0; stopPlay(); load(); });
  $("#prev").addEventListener("click", () => { stopPlay(); go(C.stage - 1); });
  $("#next").addEventListener("click", () => { stopPlay(); go(C.stage + 1); });
  $("#play").addEventListener("click", togglePlay);
  $("#reveal").addEventListener("click", () => { C.reveal = !C.reveal; draw(); });
  $$("#kseg button").forEach((b) => b.addEventListener("click", () => { C.k = Number(b.dataset.k); draw(); }));
  $("#timeline").addEventListener("click", (e) => {
    const b = e.target.closest("[data-stage]");
    if (b) { stopPlay(); go(Number(b.dataset.stage)); }
  });
  const graph = $("#graph");
  graph.addEventListener("mousemove", onGraphHover);
  graph.addEventListener("mouseleave", hideTip);

  const onKey = (e) => {
    if (e.target.closest("select, input, textarea")) return;
    if (e.key === "ArrowRight") { stopPlay(); go(C.stage + 1); }
    if (e.key === "ArrowLeft") { stopPlay(); go(C.stage - 1); }
  };
  document.addEventListener("keydown", onKey);
  cleanup = () => { document.removeEventListener("keydown", onKey); stopPlay(); };

  api("/api/networks").then(({ networks, default: def }) => {
    if (C.gid == null || !networks.some((n) => n.id === C.gid)) C.gid = def;
    const sel = $("#net-select");
    if (!sel) return;
    sel.innerHTML = networks.map((n) =>
      `<option value="${n.id}" ${n.id === C.gid ? "selected" : ""}>${netName(n.id)} · ${n.machines} machines · ${n.hops}-hop attack</option>`).join("");
    load();
  }).catch(() => {
    $("#graph").innerHTML = `<div class="empty" style="padding-top:80px">Cannot reach the API. Start it with <span class="mono">python -m attackpath.api.server</span>.</div>`;
  });
}

function go(stage) {
  if (!C.net) return;
  const s = Math.max(0, Math.min(C.net.hops - 1, stage));
  if (s === C.stage) return;
  C.stage = s;
  load();
}

function togglePlay() {
  if (C.playing) return stopPlay();
  if (!C.net) return;
  if (C.stage >= C.net.hops - 1) { C.stage = 0; load(); }
  C.playing = true;
  C.timer = setInterval(() => {
    if (!C.net || C.stage >= C.net.hops - 1) return stopPlay();
    C.stage += 1;
    load();
  }, 2600);
  syncPlay();
}

function stopPlay() {
  C.playing = false;
  clearInterval(C.timer);
  C.timer = null;
  syncPlay();
}

function syncPlay() {
  const b = $("#play");
  if (!b) return;
  b.classList.toggle("on", C.playing);
  b.innerHTML = C.playing ? `${icon("pause")}<span>Pause</span>` : `${icon("play")}<span>Play</span>`;
}

async function load() {
  const token = ++C.token;
  const loading = $("#loading");
  const slow = setTimeout(() => loading && loading.classList.add("on"), 180);
  try {
    const [net, fc] = await Promise.all([api(`/api/network/${C.gid}`), api(`/api/forecast/${C.gid}/${C.stage}`)]);
    if (token !== C.token || !$("#graph")) return;
    C.net = net;
    C.fc = fc;
    draw();
    if (C.stage + 1 < net.hops) api(`/api/forecast/${C.gid}/${C.stage + 1}`).catch(() => {});
  } catch (e) {
    if ($("#graph")) $("#graph").innerHTML = `<div class="empty" style="padding-top:80px">Could not load this forecast (${esc(e.message)}).</div>`;
  } finally {
    clearTimeout(slow);
    if (token === C.token && loading) loading.classList.remove("on");
  }
}

function draw() {
  const { net, fc } = C;
  if (!net || !fc || !$("#graph")) return;
  const nm = (i) => net.nodes[i].name;
  $("#stage-title").textContent = `${netName(net.id)}  ·  ${net.nodes.length} machines, ${net.users} users`;
  $("#stage-sub").textContent = C.stage === 0
    ? "Initial access detected. Forecasting the first lateral move."
    : `${C.stage} hop${C.stage > 1 ? "s" : ""} observed. Attacker currently on ${nm(fc.current)}.`;
  $("#clock").innerHTML = `logs read to <b>${esc(fc.time.label)}</b>`;
  $("#net-meta").innerHTML = `
    <dt>Machines</dt><dd>${net.nodes.length}</dd>
    <dt>Critical assets</dt><dd>${net.nodes.filter((n) => n.group === "critical").length}</dd>
    <dt>Attack length</dt><dd>${net.hops} hops</dd>
    <dt>Split</dt><dd>test (unseen)</dd>`;
  $("#stage-label").innerHTML = `Stage <b>${C.stage + 1}</b> of ${net.hops} · ${C.stage === 0 ? "entry only" : `${C.stage} hop${C.stage > 1 ? "s" : ""} seen`}`;
  $("#prev").disabled = C.stage === 0;
  $("#next").disabled = C.stage >= net.hops - 1;
  $("#reveal").setAttribute("aria-checked", String(C.reveal));
  $$("#kseg button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.k) === C.k)));
  $("#graph").innerHTML = graphSVG(net, fc);
  $("#timeline").innerHTML = timelineHTML(net, fc);
  $("#intel").innerHTML = intelHTML(net, fc);
  syncPlay();
}

/* ------------------------------------------------------------ graph svg */
const radius = (n) => (n.group === "critical" ? 0.045 : n.group === "server" ? 0.031 : 0.02);

function graphSVG(net, fc, k = C.k, reveal = C.reveal) {
  const nodes = net.nodes;
  const held = new Set(fc.footholds);
  const P = fc.p_next;
  const top = new Set(fc.next_hops.slice(0, 3).map((h) => h.node));
  const shown = fc.paths.slice(0, k);
  const onPath = new Set(shown.flatMap((p) => p.nodes));
  const truth = reveal ? fc.truth.remaining : [];
  const xy = (i) => [nodes[i].x, nodes[i].y];
  const seg = (a, b, extra = 0.012) => {
    const [x1, y1] = xy(a), [x2, y2] = xy(b);
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const pa = radius(nodes[a]) + 0.006, pb = radius(nodes[b]) + extra;
    return `M${(x1 + (dx * pa) / L).toFixed(4)},${(y1 + (dy * pa) / L).toFixed(4)}L${(x2 - (dx * pb) / L).toFixed(4)},${(y2 - (dy * pb) / L).toFixed(4)}`;
  };
  const pairs = (list) => list.slice(1).map((v, i) => [list[i], v]);
  const marker = (id, color) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth=".055" markerHeight=".055" orient="auto"><path d="M0,0L10,5L0,10z" style="fill:${color}"/></marker>`;

  const normal = fc.normal_edges.map(([u, v]) => seg(u, v, 0.004)).join("");
  const truthPath = truth.length > 1 ? `<path class="e-truth" d="${pairs(truth).map(([a, b]) => seg(a, b)).join("")}"/>` : "";
  const predicted = shown.map((p, r) => ({ p, r })).reverse().map(({ p, r }) =>
    `<path class="e-pred" style="stroke-width:${(0.016 - r * 0.003).toFixed(4)};opacity:${(1 - r * 0.17).toFixed(2)}" marker-end="url(#m-pred)" d="${pairs(p.nodes).map(([a, b]) => seg(a, b, 0.02)).join("")}"/>`).join("");
  const attack = fc.footholds.length > 1
    ? pairs(fc.footholds).map(([a, b]) => `<path class="e-attack" marker-end="url(#m-attack)" d="${seg(a, b, 0.02)}"/>`).join("")
    : "";
  let defense = "";
  const best = fc.actions[0];
  if (best && best.kind === "block") defense = `<path class="e-block" d="${seg(best.nodes[0], best.nodes[1], 0.006)}"/>`;
  if (best && best.kind === "isolate") {
    const [x, y] = xy(best.nodes[0]);
    defense = `<circle class="iso-ring" cx="${x}" cy="${y}" r="${(radius(nodes[best.nodes[0]]) + 0.035).toFixed(3)}"/>`;
  }
  const haloR = (n) => (radius(n) + 0.01 + 0.07 * Math.sqrt(P[n.i])).toFixed(4);
  const halos = nodes.filter((n) => !held.has(n.i) && P[n.i] > 0.02).map((n) =>
    `<circle class="halo" cx="${n.x}" cy="${n.y}" r="${haloR(n)}"/>` +
    (top.has(n.i) ? `<circle class="halo-ring" cx="${n.x}" cy="${n.y}" r="${haloR(n)}"/>` : "")).join("");
  const shapes = nodes.map((n) => {
    const cls = held.has(n.i) ? "n-held" : `n-${n.group === "workstation" ? "ws" : n.group}`;
    const rr = radius(n);
    const shape = n.group === "critical"
      ? `<polygon class="${cls} stroke" points="${n.x},${n.y - rr} ${n.x + rr},${n.y} ${n.x},${n.y + rr} ${n.x - rr},${n.y}"/>`
      : `<circle class="${cls} stroke" cx="${n.x}" cy="${n.y}" r="${rr}"/>`;
    return `<g class="node" data-i="${n.i}">${shape}<circle cx="${n.x}" cy="${n.y}" r="${rr + 0.02}" fill="transparent"/></g>`;
  }).join("");
  const cur = nodes[fc.current];
  const pulse = `<circle class="pulse" cx="${cur.x}" cy="${cur.y}" r="${radius(cur)}"/>`;
  const labels = nodes.filter((n) => held.has(n.i) || n.group === "critical" || top.has(n.i) || onPath.has(n.i) || truth.includes(n.i))
    .map((n) => {
      const cls = held.has(n.i) ? "attack" : n.group === "critical" || top.has(n.i) ? "strong" : "";
      return `<text class="n-label ${cls}" x="${n.x}" y="${(n.y + radius(n) + 0.042).toFixed(3)}" text-anchor="middle">${esc(n.name)}</text>`;
    }).join("");
  const rings = [[0.24, "CRITICAL"], [0.6, "SERVERS"], [1.0, "WORKSTATIONS"]].map(([r, t]) =>
    `<circle r="${r}" class="ring-guide"/><text class="ring-label" x="0" y="${-r - (r === 1 ? 0.05 : 0.02)}" text-anchor="middle">${t}</text>`).join("");

  return `<svg viewBox="-1.17 -1.13 2.34 2.3" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Network graph with forecast attack paths">
    <defs>
      ${marker("m-pred", "var(--predict)")}${marker("m-attack", "var(--attack)")}
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".01" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    ${rings}
    <path class="e-normal" d="${normal}"/>
    ${halos}${truthPath}${predicted}${defense}${attack}${shapes}${pulse}${labels}
  </svg>`;
}

function onGraphHover(e) {
  const g = e.target.closest(".node");
  if (!g || !C.net || !C.fc) return hideTip();
  const i = Number(g.dataset.i);
  const n = C.net.nodes[i];
  const held = C.fc.footholds.includes(i);
  const p = C.fc.p_next[i];
  showTip(`<b>${esc(n.name)}</b> <span class="tt-role">· ${esc(n.label)}</span>` +
    (held ? `<div class="tt-held">Compromised</div>` : `<div class="tt-p">P(next hop) = ${p.toFixed(3)}</div>`), e.clientX, e.clientY);
}

/* -------------------------------------------------------------- timeline */
function timelineHTML(net, fc) {
  const full = fc.footholds.concat(fc.truth.remaining.slice(1));
  const K = net.hops;
  return Array.from({ length: K + 1 }, (_, i) => {
    const known = i <= C.stage || C.reveal;
    const name = known ? net.nodes[full[i]].name : "? ? ?";
    const cls = [i <= C.stage ? "done" : "", i === C.stage ? "now" : "", i === K ? "target" : ""].join(" ");
    const t1 = i === 0 ? "ENTRY" : i === K ? "TARGET" : `HOP ${i}`;
    const clickable = i < K;
    return `<button type="button" class="tl-step ${cls}" ${clickable ? `data-stage="${i}"` : "disabled"} aria-label="${t1}">
      <span class="tl-dot"></span><span class="t1">${t1}</span><span class="t2">${esc(name)}</span></button>`;
  }).join("");
}

/* ----------------------------------------------------------------- intel */
function intelHTML(net, fc) {
  const nm = (i) => net.nodes[i].name;
  const cur = net.nodes[fc.current];
  const maxP = Math.max(...fc.next_hops.map((h) => h.prob), 0.01);
  const rows = fc.next_hops.map((h, r) => {
    const hit = C.reveal && h.node === fc.truth.next;
    return `<div class="row ${hit ? "hit" : ""}">
      <span class="rk">${String(r + 1).padStart(2, "0")}</span>
      <span class="nm"><b>${esc(nm(h.node))}</b> ${hit ? `<span class="badge ok">${icon("check")}actual</span>` : ""}<small>${esc(net.nodes[h.node].label)} · uncertainty ${h.uncertainty.toFixed(2)}</small></span>
      <span class="bar"><i style="width:${((100 * h.prob) / maxP).toFixed(1)}%"></i></span>
      <span class="pv">${pct(h.prob)}</span></div>`;
  }).join("");
  const held = new Set(fc.footholds);
  const paths = fc.paths.length ? fc.paths.map((p, r) => {
    const hit = C.reveal && sameList(p.nodes, fc.truth.remaining);
    const route = p.nodes.map((i) => {
      const n = net.nodes[i];
      const cls = held.has(i) ? "held" : n.group === "critical" ? "crit" : "";
      return `<span class="hop ${cls}">${esc(n.name)}</span>`;
    }).join(icon("next"));
    return `<div class="path ${hit ? "hit" : ""}" style="${r >= C.k ? "opacity:.6" : ""}">
      <div class="path-top"><span>Path ${r + 1} · ${p.nodes.length - 1} hop${p.nodes.length > 2 ? "s" : ""}</span>
        <span>${hit ? `<span class="badge ok">${icon("check")}matches real path</span> ` : ""}<span class="p">P = ${p.prob.toFixed(3)}</span></span></div>
      <div class="route">${route}</div></div>`;
  }).join("") : `<div class="empty">No route to a critical asset.</div>`;

  const best = fc.actions[0];
  const actText = (a) => (a.kind === "isolate"
    ? `Isolate <span class="mono">${esc(nm(a.nodes[0]))}</span>`
    : `Revoke access <span class="mono">${esc(nm(a.nodes[0]))}</span> to <span class="mono">${esc(nm(a.nodes[1]))}</span>`);
  const defense = best ? `
    <div class="defense">
      <div class="tag">${icon("shield")}Recommended response</div>
      <div class="act">${actText(best)}</div>
      <div class="dmeters">
        <div><div class="k">Path risk removed</div><div class="v">${pct(best.risk_drop)}</div><div class="meter"><i style="width:${pct(best.risk_drop)}"></i></div></div>
        <div><div class="k">Normal traffic blocked</div><div class="v">${pct(best.blocked, 1)}</div><div class="meter cost"><i style="width:${pct(Math.min(1, best.blocked))}"></i></div></div>
      </div>
      ${fc.actions.length > 1 ? `<div class="alts">
        <div class="alt head"><span>Alternatives</span><span>Risk</span><span>Cost</span></div>
        ${fc.actions.slice(1, 5).map((a) => `<div class="alt"><span>${actText(a)}</span><span>${pct(a.risk_drop)}</span><span>${pct(a.blocked, 1)}</span></div>`).join("")}
      </div>` : ""}
    </div>` : `<div class="card empty">No response needed: no path to a critical asset.</div>`;

  return `
    <div class="kpis">
      <div class="card kpi"><div class="k">Footholds</div><div class="v">${fc.footholds.length}</div><div class="s">compromised</div></div>
      <div class="card kpi"><div class="k">Attacker on</div><div class="v mono">${esc(cur.name)}</div><div class="s">${esc(cur.label)}</div></div>
      <div class="card kpi"><div class="k">Path risk</div><div class="v">${pct(fc.risk)}</div><div class="meter attack"><i style="width:${pct(fc.risk)}"></i></div></div>
      <div class="card kpi"><div class="k">Confidence</div><div class="v">${pct(fc.confidence)}</div><div class="meter"><i style="width:${pct(fc.confidence)}"></i></div></div>
    </div>
    <div class="card block">
      <div class="block-head"><h3>Next move forecast</h3><span>calibrated probability</span></div>
      <div class="rows">${rows}</div>
    </div>
    ${defense}
    <div class="card block">
      <div class="block-head"><h3>Likely attack paths</h3><span>to critical assets</span></div>
      <div class="paths">${paths}</div>
    </div>`;
}

/* ================================================================ results */
function groupedBars({ cats, series, h = 230, max = 1, fmt = (v) => pct(v) }) {
  const W = 560, padL = 40, padB = 28, padT = 18, iw = W - padL - 8, ih = h - padB - padT;
  const gw = iw / cats.length;
  const gap = 6;
  const bw = Math.min(34, (gw - 28 - gap * (series.length - 1)) / series.length);
  const y = (v) => padT + ih - (ih * v) / max;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) =>
    `<line class="gridl" x1="${padL}" x2="${W - 8}" y1="${y(t * max)}" y2="${y(t * max)}"/><text x="${padL - 8}" y="${y(t * max) + 4}" text-anchor="end">${fmt(t * max)}</text>`).join("");
  const bars = cats.map((c, ci) => {
    const x0 = padL + ci * gw + (gw - (bw * series.length + gap * (series.length - 1))) / 2;
    return series.map((s, si) => {
      const v = s.values[ci];
      if (v == null) return "";
      const x = x0 + si * (bw + gap);
      return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(1, padT + ih - y(v))}" rx="4" style="fill:${s.color}"/>
        <text class="val" x="${x + bw / 2}" y="${y(v) - 5}" text-anchor="middle">${fmt(v)}</text>`;
    }).join("") + `<text x="${padL + ci * gw + gw / 2}" y="${h - 8}" text-anchor="middle">${esc(c)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${h}" role="img">${grid}<line class="axis" x1="${padL}" x2="${W - 8}" y1="${padT + ih}" y2="${padT + ih}"/>${bars}</svg>`;
}

const legend = (items) => `<div class="chart-legend">${items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("")}</div>`;

function pageResults(view) {
  view.innerHTML = `<div class="page">
    <div class="page-head fade-in">
      <div><span class="eyebrow">Results</span><h1>How well does it forecast?</h1>
        <p>Measured on networks the model never saw in training, against a rule-based baseline and random guessing.</p></div>
      <span class="pill" id="res-pill">${icon("lock")} held-out test set</span>
    </div>
    <div id="res"><div class="stats">${'<div class="card stat"><div class="k">Loading</div><div class="v faint">--</div></div>'.repeat(4)}</div></div>
    ${footer()}
  </div>`;
  api("/api/summary").then((s) => {
    const ev = s.evaluation, el = $("#res");
    if (!el) return;
    if (!ev) { el.innerHTML = `<div class="card note">No evaluation yet. Run <b>python -m attackpath.eval.evaluate</b>.</div>`; return; }
    $("#res-pill").innerHTML = `${icon("lock")} ${ev.n_test_networks} unseen networks · ${ev.n_predictions} predictions`;
    const nh = ev.next_hop, ph = ev.path_hit_rate, td = ev.time_to_detection, d = ev.defense || {};
    const OURS = "var(--accent)", RULE = "var(--faint)", RAND = "var(--surface-3)";
    const methods = [["tgnn", "Temporal GNN (ours)"], ["tgnn_uncalibrated", "Temporal GNN, no calibration"], ["heuristic", "Rule-based baseline"], ["random", "Random guess"]];
    const bestOf = (key, low) => (low ? Math.min : Math.max)(...methods.filter(([m]) => m !== "random").map(([m]) => nh[m][key]));
    const cell = (r, k, low) => `<td class="num ${r[k] === bestOf(k, low) ? "best" : ""}">${r[k].toFixed(3)}</td>`;
    el.innerHTML = `
      <div class="stats">${statTiles(ev)}</div>
      <div class="grid-2">
        <div class="card chart-card fade-in">
          <h3>Next-hop accuracy</h3><div class="sub">Is the attacker's real next machine in the top k guesses?</div>
          <div class="chart">${groupedBars({ cats: ["Top 1", "Top 3", "Top 5"], series: [
            { color: OURS, values: [nh.tgnn.top1, nh.tgnn.top3, nh.tgnn.top5] },
            { color: RULE, values: [nh.heuristic.top1, nh.heuristic.top3, nh.heuristic.top5] },
            { color: RAND, values: [nh.random.top1, nh.random.top3, nh.random.top5] }] })}</div>
          ${legend([[OURS, "Temporal GNN"], [RULE, "Rule-based"], [RAND, "Random"]])}
        </div>
        <div class="card chart-card fade-in d1">
          <h3>Attack paths</h3><div class="sub">Caught before the target, and exact full-path matches.</div>
          <div class="chart">${groupedBars({ cats: ["Caught before target", "Full path in top 5", "Full path in top 1"], series: [
            { color: OURS, values: [td.tgnn.detected_before_target, ph.tgnn.top5, ph.tgnn.top1] },
            { color: RULE, values: [td.heuristic.detected_before_target, ph.heuristic.top5, ph.heuristic.top1] },
            { color: RAND, values: [null, ph.random.top5, ph.random.top1] }] })}</div>
          ${legend([[OURS, "Temporal GNN"], [RULE, "Rule-based"], [RAND, "Random"]])}
        </div>
      </div>
      <div class="card fade-in" style="margin-top:14px;overflow-x:auto">
        <table class="table">
          <thead><tr><th>Next hop</th><th class="num">Top 1</th><th class="num">Top 3</th><th class="num">Top 5</th><th class="num">MRR</th><th class="num">ECE</th></tr></thead>
          <tbody>${methods.map(([m, label]) => {
            const r = nh[m];
            return `<tr class="${m === "tgnn" ? "ours" : ""}"><td>${label}</td>${cell(r, "top1")}${cell(r, "top3")}${cell(r, "top5")}${cell(r, "mrr")}<td class="num">${r.ece.toFixed(3)}</td></tr>`;
          }).join("")}</tbody>
        </table>
      </div>
      <div class="card note fade-in" style="margin-top:14px">
        <b>Reference</b>
        <span class="mono">Link forecast: AUC ${ev.link.calibrated.auc.toFixed(3)} · AP ${ev.link.calibrated.ap.toFixed(3)} · ECE ${ev.link.calibrated.ece.toFixed(3)}</span>
        <span class="mono">Defense: risk cut ${pct(d.mean_risk_drop || 0)} · normal traffic blocked ${pct(d.mean_normal_blocked || 0, 1)} · cuts real path ${pct(d.cuts_true_path || 0)}</span>
        <span class="mono">Model: ${(s.params || 0).toLocaleString()} parameters · split ${s.split.train}/${s.split.val}/${s.split.test} networks · temperature ${(s.temperatures.hop || 1).toFixed(2)}</span>
        <span>Synthetic data only so far. Full-path accuracy is low because a path needs 3–6 correct guesses in a row; "caught before target" is the more useful measure. LANL, CICIDS2017 and UNSW-NB15 come next.</span>
      </div>`;
  }).catch(() => {
    const el = $("#res");
    if (el) el.innerHTML = `<div class="card note">Cannot reach the API. Start it with <b>python -m attackpath.api.server</b>.</div>`;
  });
}

/* ================================================================= method */
function pageMethod(view) {
  view.innerHTML = `<div class="page">
    <div class="page-head fade-in">
      <div><span class="eyebrow">Method</span><h1>How it works</h1>
        <p>A temporal graph neural network reads the network hour by hour; path search and a defense simulator turn
          its probabilities into a decision.</p></div>
    </div>

    <section class="card arch fade-in">
      <div class="arch-box in"><span class="lbl">Input</span><h4>Hourly graph</h4><p>Users and machines as nodes, logins as edges.</p></div>
      <div class="arch-box enc"><span class="lbl">Encoder</span><h4>2 x GAT</h4><p>Graph attention, 4 heads, hidden size 64.</p></div>
      <div class="arch-box mem"><span class="lbl">Memory</span><h4>GRU</h4><p>Carries each node's state across hours.</p></div>
      <div class="arch-box head"><span class="lbl">Heads</span><h4>Link + next hop</h4><p>Calibrated with temperature scaling.</p></div>
      <div class="arch-box out"><span class="lbl">Decision</span><h4>Paths + response</h4><p>Yen's top-k paths, defense simulator.</p></div>
    </section>

    <div class="grid-3">
      <div class="card prose fade-in">
        <h3>Data</h3>
        <p><b>300 synthetic networks</b> with 7 days of normal logins and one 3–6 hop attack each. The attacker
          steals credentials and prefers admin machines. Attacks are <b>0.16%</b> of events.</p>
      </div>
      <div class="card prose fade-in d1">
        <h3>Training</h3>
        <p>Split <b>210 / 45 / 45</b> by network. Predictions for hour <code>t+1</code> use only hours up to
          <code>t</code>. Cross-entropy with negative sampling, Adam, early stopping.</p>
      </div>
      <div class="card prose fade-in d2">
        <h3>Paths and defense</h3>
        <p>Each move costs <code>-log p</code>; Yen's algorithm ranks the top-k routes. The simulator picks the action with
          the best <code>risk removed - traffic blocked</code>.</p>
      </div>
    </div>

    <div class="card prose fade-in" style="margin-top:14px">
      <div class="chips">${["Python 3.11", "PyTorch", "PyTorch Geometric", "NetworkX", "scikit-learn", "FastAPI"].map((c) => `<span class="chip">${c}</span>`).join("")}</div>
    </div>
    ${footer()}
  </div>`;
}

/* ----------------------------------------------------------------- router */
const ROUTES = { "": pageLanding, console: pageConsole, results: pageResults, method: pageMethod };
let cleanup = null;

function route() {
  const key = location.hash.replace(/^#\/?/, "").split(/[?/]/)[0];
  const page = Object.prototype.hasOwnProperty.call(ROUTES, key) ? key : "";
  $$("[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === page));
  if (cleanup) { cleanup(); cleanup = null; }
  hideTip();
  const view = $("#view");
  view.innerHTML = "";
  window.scrollTo(0, 0);
  ROUTES[page](view);
}

window.addEventListener("hashchange", route);
route();
