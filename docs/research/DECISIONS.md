# Decisions log

Product and research decisions for growing Lateralis into a self-hosted security platform.
Background and evidence for each item: [the platform research report](reports/Lateralis%20platform%20research.md).

## Confirmed (2026-11-21)

| # | Topic | Decision |
|---|---|---|
| 1 | Product core | Grow Lateralis. The temporal-GNN attack-path engine stays the core; the platform is built around it. |
| 2 | Agents | All four: analyst/triage, response (human approval before any action), red-team (Docker lab only), chat copilot. |
| 3 | LLM backend | Free-tier hosted LLM APIs only. No paid usage. |
| 4 | LLM privacy | Pseudonymize hostnames, usernames, IPs and similar identifiers with reversible tokens before any data leaves the machine. |
| 5 | Delivery | Self-hosted: Docker Compose bundle plus a local API. Demo section runs locally. No hosted SaaS. |
| 6 | Attack lab | Pure Docker lab (Linux containers, Samba AD domain controller), no Windows VMs. |
| 7 | Data and evaluation | Real datasets and rigorous evaluation are required. No deadline pressure. |
| 8 | "Real data" scope | LANL 2015 and DARPA OpTC, **plus** emulated-attack telemetry from the Docker lab, all count as real data for training and evaluation. |
| 9 | Headline results | Report **both** next-hop forecasting (Hits@k, MRR) and detection (event-level AP, AUC) as headline results. |
| 10 | Disk budget | Not a constraint. LMDG (253 GB+) is available as an optional third dataset. |
| 11 | Lateralis licence | Apache-2.0 (no preference stated; chosen for adoption and simplicity). |
| 12 | Research write-up | Markdown in the repo under `docs/research/`. |

## Proposed defaults (not yet confirmed)

These follow the report's recommendations and stay open until reviewed.

| # | Topic | Proposed default | Alternative |
|---|---|---|---|
| A | Graph type on LANL | Heterogeneous user + computer graph, with a computer-only ablation | Computer → computer only, as in Euler |
| B | Agent framework | LangGraph (`interrupt()` for approvals) | PydanticAI |
| C | Gemini free tier | Only for lab, synthetic and docs data, never customer logs | Exclude entirely |
| D | Observability | Arize Phoenix locally (Elastic License 2.0) | Langfuse (MIT core, much heavier) |
| E | SOAR in the bundle | Built-in action executor, with Shuffle as an optional profile | Shuffle or Tracecat required |
| F | Local LLM role | Ollama as tool-less log summariser and offline copilot fallback | No local model |
| G | Market framing | Generic, with an India section (DPDP Act, CERT-In) | India-first |
| H | Defense recommender scope | Recommend, then execute through the response agent after human approval | Recommend only |
