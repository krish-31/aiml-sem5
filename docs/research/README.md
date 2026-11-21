# Platform research

Research for growing Lateralis from a synthetic-data prototype into a self-hosted security
platform with LLM agents, trained and evaluated on real data. Checked as of November 2026.

**Start here:** [Lateralis platform research](reports/Lateralis%20platform%20research.md), the
synthesized report. It ends with a recommended architecture, open decisions and risks.

| File | What it covers |
|---|---|
| [reports/Lateralis platform research.md](reports/Lateralis%20platform%20research.md) | Synthesized report and recommendations |
| [DECISIONS.md](DECISIONS.md) | Confirmed decisions and proposed defaults |
| [datasets.md](research_notes/Lateralis%20platform%20research/datasets.md) | Real lateral-movement datasets: LANL 2015/2017, DARPA OpTC and TC, CIC, UNSW, NetFlow, LMDG and others |
| [methods_and_evaluation.md](research_notes/Lateralis%20platform%20research/methods_and_evaluation.md) | Graph and temporal-GNN baselines, published results, evaluation pitfalls and protocol |
| [open_source_stack.md](research_notes/Lateralis%20platform%20research/open_source_stack.md) | Log collection, schemas, graph stores, SOAR, ATT&CK/Sigma, Docker attack lab, packaging |
| [agents_llms_redaction.md](research_notes/Lateralis%20platform%20research/agents_llms_redaction.md) | Agent frameworks, MCP, free-tier LLM APIs, redaction, prompt injection, observability |
| [agent_evaluation.md](research_notes/Lateralis%20platform%20research/agent_evaluation.md) | Benchmarks and methods for evaluating security LLM agents |
| [competitive_landscape.md](research_notes/Lateralis%20platform%20research/competitive_landscape.md) | Attack-path and agentic SOC products, open-source delivery models, India context |

Each notes file separates cited findings from inferences and lists gaps. Items marked as
unverified in the notes should be re-checked before they are quoted.
