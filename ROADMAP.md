# Roadmap: from prototype to self-hosted platform

Lateralis forecasts an attacker's next lateral-movement hop, ranks the likely attack paths to
critical assets and recommends the cheapest effective defense. This roadmap takes it from a
synthetic-data prototype to a self-hosted security platform with four LLM agents, trained and
evaluated on real data.

The evidence behind every choice is in the
[platform research report](docs/research/reports/Lateralis%20platform%20research.md); confirmed
choices are logged in [DECISIONS.md](docs/research/DECISIONS.md).

## Principles

1. **Evaluation before features.** The real-data pipeline and the evaluation protocol come
   first. Every later model, agent and platform feature is measured against them.
2. **Honest numbers.** Use the fair protocol from Larroche (2026): event-level metrics, no
   NTLM-only filtering, no downsampling of benign users, no tuning on red-team events. Expect
   modest absolute numbers. Report them with confidence intervals and against re-evaluated
   baselines, never against inflated published figures.
3. **Two headline tasks.** Report next-hop **forecasting** (Hits@k, MRR, lead time) and
   **detection** (event-level AP, AUC) side by side, plus **calibration** (ECE, Brier, NLL).
4. **Self-supervised on real data.** Train on normal traffic. LANL's red-team labels (one
   intrusion) are for evaluation only.
5. **Each stage reads the previous stage's output from disk**, so stages can be rebuilt,
   tested and rerun on their own.
6. **Zero cost.** Free datasets, free Colab, free-tier LLM APIs, open-source components.

## Phases at a glance

```
 P0 prototype (done)
   │
 P1 real-data pipeline ─► P2 evaluation harness ─► P3 model on LANL ─► P4 OpTC
                                   │                      │
                                   │                      └─► P5 paths + defense on real data
                                   └─► P6 Docker attack lab ─► P7 lab campaigns + IncidentBench
                                                                     │
 P8 platform core ─► P9 LLM layer ─► P10 agents ─► P11 agent evaluation ─► P12 packaging ─► P13 write-up
```

P6 and P7 can run in parallel with P3 to P5. P8 can start once P3 has a trained model.

---

## Phase 0: Synthetic prototype ✅ (done)

Built and working on synthetic data only:

- Synthetic company networks with one injected 3–6 hop attack each (`data/synthetic.py`)
- Hourly heterogeneous graph snapshots (`graph/builder.py`)
- GAT + GRU temporal GNN with an MLP link decoder (`models/tgnn.py`, `models/train.py`)
- Temperature-scaling calibration
- Top-k attack paths with Yen's algorithm on −log p (`paths/rank.py`)
- Defense simulator: isolate a node or remove a privilege, utility = risk cut − traffic cost (`defense/simulator.py`)
- Evaluation against rule-based and random baselines (`eval/`)
- FastAPI backend, React web app (overview, console, event log, reports, results), PDF reports

The synthetic generator stays as a fast smoke test for every later stage.

---

## Phase 1: Real-data pipeline

**Goal:** stream the LANL 2015 dataset into a common event format on a 16 GB laptop.

- **Data location.** All datasets live in `C:\lateralis-data` (outside OneDrive). Code reads the
  path from the `LATERALIS_DATA` environment variable; nothing large goes in the repo.
  ```
  C:\lateralis-data\
    raw\lanl\        auth, proc, flows, dns, redteam (.txt.gz, as downloaded)
    raw\optc\        FLOW-START subset only (Phase 4)
    processed\       day-partitioned Parquet
    snapshots\       aggregated graph snapshots
    lab\             telemetry from the Docker lab (Phase 6+)
  ```
- **Common event schema** (`data/schema.py`): a slim subset of OCSF Authentication (3002) and
  Network Activity (4001). LANL, OpTC, lab telemetry and customer logs all map onto it.
- **LANL loaders** (`data/lanl.py`): stream each `.txt.gz` in chunks (polars or pandas), never
  load a file whole.
  - `auth`: keep remote LogOn events (src ≠ dst), keep machine and built-in accounts, keep
    failures, no NTLM-only filter, no benign downsampling.
  - `redteam`: join to auth events as labels.
  - `flows`: computer → computer network edges (second edge type).
  - `proc`: process starts per computer, aggregated as node features.
  - `dns`: computer → resolved computer lookups, as node features or a third edge type.
- **Aggregation**: `(snapshot, user, src, dst, count, features)` at 1 hour, with 30 min and
  15 min variants for ablations.
- **Dev subset**: days 1–30 (contains every red-team event) for fast iteration.
- **Sanity checks**: count red-team events in the raw file and after filtering (the research
  expects about 702 under the Larroche policy; confirm, don't assume), node counts, time span,
  peak RAM per stage.

**Done when:** `python -m attackpath.data.lanl` turns the raw files into Parquet and snapshots
within 16 GB RAM, the counts are logged in `results/data_stats_lanl.json`, and tests cover the
parsers on small fixtures.

---

## Phase 2: Evaluation harness

**Goal:** a fixed, reusable protocol that every model and baseline plugs into, built before
the model is retrained.

- **Splits** (`eval/protocol.py`):
  - LANL: train on the first 41 hours, test on the rest of the 58 days (including benign days
    31–58).
  - Validation carved from inside the training window (last 5% of training snapshots plus 5%
    masked edges, as in Euler). Never tune on red-team events.
  - A clearly labelled "14-day NTLM" variant only for comparison with published Euler, Argus
    and CyberGFM numbers.
- **Task A, detection**: event-level AUC, **AP (primary)**, FPR at TPR 0.9 and 0.99,
  precision@k, alerts per day at the chosen operating point.
- **Task B, forecasting**: for each red-team hop u→v at time t, rank candidate destinations.
  Hits@1/5/10, filtered MRR (1-vs-all, plus historical and random negatives as in TGB), lead
  time in snapshots.
- **Calibration**: ECE (15 equal-mass bins), Brier, NLL, reliability diagrams, before and after
  temperature scaling, also on a later period.
- **Heuristic baselines** (`eval/baselines/`): random, EdgeBank (∞ and time-window),
  recency/frequency, degree, historical-destination.
- **Reporting rules**: ≥5 seeds, mean ± std, bootstrap 95% CIs over red-team events, wall-clock
  and peak RAM, a preprocessing and label table per dataset.

**Done when:** `python -m attackpath.eval.run --dataset lanl --model edgebank` produces both
tasks' metrics with CIs, and all heuristic baselines have results in `results/`.

---

## Phase 3: Lateralis model on LANL

**Goal:** retrain the temporal GNN on real data and compare it fairly.

- Scale the graph builder to aggregated LANL snapshots (heterogeneous user + computer graph;
  flows, proc and dns as extra edge types and node features).
- Train on free Colab (T4), checkpointing across sessions. Track runs locally (or W&B free).
- Temperature scaling fitted on the validation split.
- **Learned baselines**: Euler and Argus (Argus with `--loss bce`), TGN, TGAT, GraphMixer and
  DyGFormer via DyGLib, static GAT. Same tuning budget for all. Euler has no licence: run it
  for comparison, never copy its code into this repo.
- **Ablations**: no GRU, homogeneous computer-only graph, no extra edge types (auth only),
  no edge features, snapshot 15 min / 1 h / 6 h, no temperature scaling, decoder type,
  negative-sampling strategy.

**Done when:** a results table on the full Larroche protocol (both tasks plus calibration)
covers Lateralis, all baselines and the ablations, with CIs.

---

## Phase 4: DARPA OpTC (cross-environment check)

**Goal:** test whether the results hold in a second, different environment.

- Download only the evaluation-day files needed; never the full ~1 TB.
- Reuse Larroche's open preprocessing and labels (`cl-anssi/LMDEval`): internal FLOW-START
  events, deduplicated, each host's IPs merged into one node.
- Train 17–22 Sep, test 23–25 Sep. Report lateral-movement-only and all-malicious separately.
- Machine-only graph: the user layer drops out, so this doubles as a homogeneous-graph test.

**Done when:** the Phase 3 results table has an OpTC column for Lateralis and the baselines.

---

## Phase 5: Attack paths and defense on real data

**Goal:** turn calibrated forecasts into ranked paths and recommended defenses, and measure them.

- Yen's top-k paths on calibrated −log p; top-k path hit rate (k = 1, 5, 10) against the true
  red-team route.
- **Forecast-weighted choke points**: rank candidate controls (isolate host, remove privilege,
  block edge) by cut in forecast path risk × remediation cost.
- Compare against random and degree-based isolation: risk removed, true route blocked, normal
  traffic blocked.
- Optional later: BloodHound CE edges (AdminTo, HasSession, MemberOf) as static features.

**Done when:** path and defense metrics are in the results table for LANL and the lab.

---

## Phase 6: Docker attack lab

**Goal:** a small fake company in Docker that produces real telemetry from emulated attacks.

- Compose profile `lab`:
  - `dc1`: Samba 4 AD domain controller with JSON audit logging (`auth_json_audit:3`)
  - two domain-joined Debian workstations with sshd
  - a Samba file server, a vulnerable web app, a database with reused credentials
  - attacker container (impacket, NetExec) and Caldera (`ghcr.io/apache/caldera`, Sandcat agents)
  - Zeek sensor on the lab network (kerberos, ntlm, smb, dce_rpc, ssh logs)
  - Vector normalizing everything into the Phase 1 schema, written to `C:\lateralis-data\lab`
- Attack chain: password spray → SSH with valid accounts (T1078, T1021.004) → Kerberoasting
  (T1558.003) → SMB to file server (T1021.002) → DCSync (T1003.006) → pass-the-hash/ticket
  (T1550.002/.003).
- Ground truth exported from Caldera operation reports.
- Measure real RAM with `docker stats` (research estimate 4–6 GB, unverified).
- Validate the event mix early: Samba does not produce Windows 4648, 4672 or the 4768/4769
  split. Present it as a "Linux/Samba AD lab"; LANL stays the Windows-native evaluation.

**Done when:** `docker compose --profile lab up` runs the full attack chain end to end and the
telemetry plus ground truth land in the common schema.

---

## Phase 7: Lab campaigns and IncidentBench

**Goal:** multi-campaign ground truth for the GNN and a benchmark for the agents, from the same runs.

- Run 10–20 Caldera / Atomic Red Team adversary profiles across 3–4 lab topologies, varying
  seeds, start hosts and benign background noise.
- **GNN**: train and evaluate forecasting on lab campaigns (many independent next hops, unlike
  LANL's single intrusion). Hold out whole adversary profiles and at least one topology.
- **Purple-team metric**: fraction of red-team hops the GNN ranked in its top-k beforehand,
  and the lead time.
- **Lateralis-IncidentBench** (ExCyTIn-Bench recipe): auto-generate single-hop lookups,
  multi-hop alert → entity → alert questions, full incident reconstructions (techniques,
  hosts, path, order) and rubric-judged reports, with gold answers from Caldera ground truth.

**Done when:** lab campaign results are in the GNN results table and IncidentBench has a
versioned task set with a held-out split.

---

## Phase 8: Platform core

**Goal:** the self-hosted product a company would run.

- Ingest adapters into the common schema: Vector, Zeek, Wazuh API, OpenTelemetry, plus the
  LANL / OpTC / lab loaders.
- Event store: DuckDB + Parquet. App database and persisted graph: Postgres + Apache AGE.
- Model worker: scheduled scoring of new snapshots, forecasts, paths and recommendations.
- FastAPI local API: HMAC-signed API tokens (BloodHound CE pattern), bound to 127.0.0.1 by
  default, OpenAPI docs.
- React UI: existing pages moved onto real data, plus a **demo section** that replays a LANL
  window and recorded lab incidents.

**Done when:** a company could point the ingest at its logs, call the API with a token, and
see forecasts, paths and recommendations in the UI; the demo section works offline.

---

## Phase 9: LLM layer

**Goal:** safe, zero-cost LLM access for the agents.

- **RedactionGateway**: Microsoft Presidio with regex-first recognizers (hosts, users, IPs,
  domains, emails, SIDs), stable typed tokens (`HOST_17[dc]`, `IP_3[internal]`), mapping stored
  in local SQLite, de-tokenization of outputs, rejection of any unknown token.
- **Router**: LiteLLM, Groq (gpt-oss-120b, qwen3) → OpenRouter free models → Cloudflare Workers
  AI → SambaNova → local Ollama. Per-provider rate limits and retries. Gemini free tier only for
  lab, synthetic and docs data, never customer logs.
- **Prompt-injection defenses**: untrusted log fields wrapped and sanitized; a tool-less
  quarantined summariser (local Ollama) turns raw log text into schema-validated fields; Llama
  Prompt Guard 2 classifier pass; Pydantic validation of every tool argument.
- **MCP server** (first-party): platform tools exposed with a separate tool set per agent.
- **Tracing**: Arize Phoenix locally, capturing traces only after redaction.
- Budget control: only high-score forecasts trigger LLM calls (about 2,000 free calls a day).

**Done when:** an outbound-prompt leakage audit finds no raw identifiers, and the router fails
over cleanly when a provider returns 429s.

---

## Phase 10: Agents

**Goal:** four agents, grounded in the forecast, with safety enforced in code.

- **LangGraph supervisor** routing to four sub-graphs (no group chat). Tool allow-lists enforced
  in code; state checkpointed to SQLite.
- **Analyst / triage**: read-only tools (graph query, event fetch, ATT&CK lookup, forecast and
  path lookup, report draft). Every conclusion cites a forecast, path or event.
- **Response**: can only call `propose_action`. LangGraph `interrupt()` pauses for a human
  Approve / Edit / Reject in the UI; a non-LLM executor runs the approved action (built-in
  executor; Shuffle as an optional profile).
- **Red-team**: only Caldera tools, network-bound to the lab, scope check plus approval before
  every operation, kill switch.
- **Chat copilot**: read-only over graph, forecasts and reports; no path to the response or
  red-team agents.
- Immutable audit log of every tool call and approval.

**Done when:** each agent runs end to end on a lab incident from the UI, and the response and
red-team agents cannot act without approval.

---

## Phase 11: Agent evaluation

**Goal:** defensible numbers for each agent, run at zero cost.

- **Harness**: Inspect AI for all tasks; promptfoo for injection regression tests; RAGAS or
  DeepEval for the copilot.
- **Triage**: IncidentBench technique F1, host-set Jaccard, path-edge F1, order (Kendall τ),
  tool-call precision/recall. Ablations: no tools, no reflection, **with vs without the GNN
  forecast**. External anchors: ExCyTIn-Bench subset (if downloadable), AttackSeqBench sample,
  CyberSecEval 4 threat-intel subset.
- **Response**: action F1 against a gold minimal action set, over-response rate, harmful-action
  rate, live lab replay (hosts compromised after first alert, time to containment).
  **Execution without approval: target 0.**
- **Red-team**: critical assets reached, hosts compromised, techniques executed, pass^k over 3
  runs, vs Caldera's built-in planners. **Scope violations: target 0.**
- **Copilot**: 100–150 golden questions including unanswerable ones; faithfulness, citation
  accuracy, abstention.
- **Safety, all agents**: AgentDojo-style injected log fields, attack success rate, pseudonym
  leakage.
- **Pseudonymization A/B** (local model): raw vs consistent typed tokens vs naive masking on
  ≥50 incidents.
- **Rigour**: judge from a different model family, both orderings, Cohen's κ against 30–50
  human labels, k = 3–5 repeats, Wilson or bootstrap CIs, McNemar for paired comparisons;
  tokens, latency and retries logged on every call.

**Done when:** an agent results table with CIs exists for all four agents plus the A/B study.

---

## Phase 12: Packaging and delivery

**Goal:** a company can download and run Lateralis.

- One `docker-compose.yml` with profiles: `core` (default: API, model worker, Postgres/AGE,
  DuckDB volume, Vector, UI), `lab`, `bloodhound`, `soar`, `wazuh` (not together with `lab` on
  16 GB).
- Health checks, `depends_on: service_healthy`, localhost binding, secrets generated into `.env`.
- AGPL/GPL components only as unmodified upstream images; `THIRD_PARTY_LICENSES` file.
- pip package (`attackpath`) for API-only or library use.
- Install guide, API reference, demo guide, `.wslconfig` note for Docker Desktop memory.

**Done when:** a clean machine goes from `git clone` to a working demo with documented commands.

---

## Phase 13: Write-up

- Final report and conference-style paper: forecasting + detection + calibration on LANL,
  OpTC and the lab; agent results; pseudonymization A/B.
- Cite the LANL dataset as required: A. D. Kent, "Comprehensive, Multi-Source Cybersecurity
  Events," Los Alamos National Laboratory, 2015, DOI 10.17021/1179829.
- Presentation and live demo.

---

## Manual steps (things only you can do)

| When | Step |
|---|---|
| Before Phase 1 | Request LANL 2015 at https://csr.lanl.gov/data/cyber1/ (email + intended use), then download all five files into `C:\lateralis-data\raw\lanl\` |
| Before Phase 3 | Make sure you can open Google Colab with your Google account |
| Before Phase 4 | Download the OpTC evaluation-day files from the dataset's Google Drive (exact files listed when we get there) |
| Before Phase 6 | Start Docker Desktop; if the lab doesn't fit, raise WSL2 memory in `%UserProfile%\.wslconfig` |
| Before Phase 9 | Create free accounts and API keys (no card): Groq (turn on zero data retention), OpenRouter (turn on "block providers that train on data"); optionally Cloudflare Workers AI. Keys go in a local `.env`, never in git |

## Risks to watch

- LANL's ground truth is one intrusion (about 702 events), so its forecasting CIs will be wide.
  The lab campaigns are the mitigation.
- Lateralis may also score near-zero AP under the fair protocol. Lead with ranking and
  calibration, and compare against re-evaluated baselines.
- Free-tier LLM limits and terms change often. Verify in each console before Phase 9.
- Samba telemetry is less realistic than Windows. Keep LANL as the Windows-native evaluation.
- All RAM figures for the stack and lab are estimates until measured.

## Folder layout (target)

```
aiml/
├── ROADMAP.md
├── docs/research/            research report, notes, decisions
├── src/attackpath/
│   ├── data/                 P1, P4: schema, LANL, OpTC, lab, synthetic loaders
│   ├── graph/                P1, P3: snapshot builder
│   ├── models/               P3: temporal GNN, training, calibration
│   ├── eval/                 P2, P3, P11: protocol, metrics, baselines
│   ├── paths/                P5: Yen's top-k
│   ├── defense/              P5: choke points, simulator
│   ├── llm/                  P9: redaction gateway, router, guards
│   ├── agents/               P10: supervisor and four agents
│   ├── mcp/                  P9: first-party MCP server
│   └── api/                  P8: FastAPI local API
├── lab/                      P6: Docker attack lab
├── deploy/                   P12: compose profiles, env templates
├── web/                      P8: React UI and demo section
├── tests/
└── (data lives in C:\lateralis-data, outside the repo)
```
