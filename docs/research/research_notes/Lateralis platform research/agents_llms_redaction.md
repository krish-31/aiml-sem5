# Lateralis: Agent Frameworks, Free LLM APIs, Redaction, Prompt-Injection Defence and Observability

Research date: 2026-11-21. Method: WebSearch + WebFetch only (no Firecrawl/Apollo). Free tiers and rate limits change often. Every number below carries the date it was checked; treat anything not taken from an official page as "verify in console before relying on it".

---

## 1. Which agent framework and multi-agent pattern? (LangGraph, CrewAI, MS Agent Framework/AutoGen, PydanticAI, OpenAI Agents SDK, smolagents, LlamaIndex, Google ADK, Agno)

### Takeaway
LangGraph (MIT) is the safest primary choice for Lateralis. Its interrupt/resume flow is first-class: a person can approve, edit or reject a tool call, and state is checkpointed to SQLite or Postgres. That fits the response agent's mandatory approvals and a supervisor-plus-specialists graph. PydanticAI (MIT) is the strongest lighter-weight alternative, with native `requires_approval`, 30+ providers, AG-UI streaming, and MCP client and server support. Microsoft Agent Framework 1.0 (MIT, GA since April 2026) is a credible third option.

### Cited Findings
**Comparison as of 29 Oct 2026, from a vendor article.** Pydantic wrote it and ranks itself first, so read it as biased. — [Pydantic, "Best Python AI Agent Frameworks in 2026" (2026-11-02)](https://pydantic.dev/articles/best-python-ai-agent-frameworks)
- **LangGraph**
  - Licence: MIT.
  - HITL: interrupts let a person approve, edit or reject a tool call.
  - Persistence: built-in checkpointing to Postgres, SQLite or in-memory stores.
  - Models: about 90 chat-model integrations.
  - MCP: client support, marked beta.
  - UI: LangSmith Agent Server; AG-UI not mentioned.
  - Source: [Pydantic](https://pydantic.dev/articles/best-python-ai-agent-frameworks)
- **Pydantic AI**
  - Licence: MIT.
  - HITL: `requires_approval=True` ends the run with the pending call; a later run, in any process, resumes with the decision.
  - Durability: nine engines, including Temporal, DBOS, Prefect and Restate.
  - Models: 30+ providers via a `provider:model` string.
  - MCP: client and server.
  - Streaming: AG-UI and the Vercel AI Data Stream Protocol.
  - Source: [Pydantic](https://pydantic.dev/articles/best-python-ai-agent-frameworks)
- **OpenAI Agents SDK**
  - Licence: MIT.
  - HITL: tools take `needs_approval`, and paused state serializes to JSON.
  - Providers: built around the OpenAI Responses API. Other providers go through LiteLLM and Any-LLM adapters, which the docs call "best-effort and beta".
  - Tracing: on by default, and it uploads to OpenAI's dashboard. Lateralis would have to turn this off.
  - Source: [Pydantic](https://pydantic.dev/articles/best-python-ai-agent-frameworks)
- **Google ADK**
  - Licence: Apache 2.0.
  - HITL: tool confirmation is marked experimental.
  - Models: Gemini first; others via LiteLLM, Ollama and vLLM.
  - MCP: client and server.
  - Workflow: ADK 2.0 added a graph-based runtime.
  - Source: [Pydantic](https://pydantic.dev/articles/best-python-ai-agent-frameworks)
- **Microsoft Agent Framework**
  - Licence: MIT; successor to AutoGen and Semantic Kernel.
  - HITL: tools can pause for approval.
  - Persistence: workflow checkpoints and a Durable Task extension.
  - Models: OpenAI, Anthropic, Bedrock, Gemini, Ollama and others.
  - UI: AG-UI and A2A.
  - Source: [Pydantic](https://pydantic.dev/articles/best-python-ai-agent-frameworks)
- **CrewAI**
  - Licence: MIT.
  - HITL: `@human_feedback` in open-source Flows; webhook HITL is enterprise-only.
  - Persistence: `@persist`, SQLite by default.
  - Models: six native providers, others via LiteLLM.
  - Tracing: goes to the paid AMP platform; OpenTelemetry only through integrations.
  - Source: [Pydantic](https://pydantic.dev/articles/best-python-ai-agent-frameworks)
- **Agno**
  - Licence: Apache 2.0.
  - HITL: tool approval via `continue_run`.
  - Persistence: AgentOS durable jobs on Postgres.
  - Models: 30+ providers.
  - Interfaces: MCP client and server, AG-UI.
  - Caveat: some management features are in paid plans only.
  - Source: [Pydantic](https://pydantic.dev/articles/best-python-ai-agent-frameworks)

**LangGraph interrupt mechanics** — [LangGraph docs: interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- `interrupt(value)` pauses a node and saves state through the checkpointer. Resume with `Command(resume=...)` on the same `thread_id`.
- On resume, the node re-runs from its start, so side effects before the interrupt must be idempotent.
- Approve/reject pattern: the approval node calls `interrupt()`, then routes with `Command(goto=...)`.
- Interrupts can sit inside tools and accept edited arguments in the resume payload.
- `response_schema` on `interrupt()` requires `langgraph>=1.2.12`.
- A checkpointer is required, and a durable one (e.g. `SqliteSaver`) is recommended in production.

**Microsoft Agent Framework 1.0**
- Went GA on 3 Apr 2026 for .NET and Python. Microsoft says all patterns support streaming, checkpointing, human-in-the-loop approvals and pause/resume. — [Microsoft devblog](https://devblogs.microsoft.com/agent-framework/microsoft-agent-framework-version-1-0/); [Visual Studio Magazine](https://visualstudiomagazine.com/articles/2026/04/06/microsoft-ships-production-ready-agent-framework-1-0-for-net-and-python.aspx)
- A secondary source says AutoGen and Semantic Kernel are now in maintenance mode. Not confirmed on Microsoft's own pages. — [Techstrong](https://techstrong.ai/?p=46596)

**Other secondary comparisons**
- Several 2026 comparison blogs single out LangGraph as the strongest for HITL and durable interrupt/resume. Version numbers conflict across these sources, and some look auto-generated. — [Agent Report, Jul 2026](https://the-agent-report.com/2026/07/ai-agent-frameworks-comparison-2026-langgraph-crewai-autogen/); [BetterClaw (Nov update)](https://www.betterclaw.io/blog/ai-agent-frameworks)

### Inferences
- **Recommendation: LangGraph as the orchestrator.**
  - It provides a supervisor graph routing to four sub-graphs: triage, response, red-team, copilot.
  - Use `SqliteSaver` locally and Postgres later.
  - Put `interrupt()` before every SOAR action and every Caldera operation launch.
  - The node-replay semantics push you to keep side effects after the approval point, which is exactly what you want for SOAR.
- **Alternative: PydanticAI**, if the team prefers typed, less graph-heavy code. `requires_approval` plus AG-UI streaming maps directly onto the React UI. Either framework can call free providers through LiteLLM or OpenAI-compatible endpoints.
- **Avoid OpenAI Agents SDK as primary.** Non-OpenAI providers are "best-effort/beta", and tracing goes to OpenAI by default.
- **Avoid CrewAI for the response agent.** Webhook HITL is enterprise-only.
- **Multi-agent pattern: supervisor/router plus specialised agents, not a free-form group chat.**
  - The red-team and response agents should never be reachable from the copilot without an explicit, approved hand-off.
  - Give each agent its own tool allow-list (see Section 5).
- **Streaming to React:** LangGraph `stream()` events over SSE/WebSocket from FastAPI. PydanticAI or Agno give AG-UI out of the box.

### Gaps
- smolagents and LlamaIndex agents: no 2026 primary comparison data found. The Pydantic article explicitly excludes them.
- No exact current release numbers verified for any framework, apart from the LangGraph `>=1.2.12` reference.
- LangGraph MCP adapter being "beta" comes from the Pydantic article only; not cross-checked.

---

## 2. Model Context Protocol (MCP): spec status, SDK, security MCP servers, risks

### Takeaway
The current spec is **2026-07-28**, the fifth release, with a stateless core. HTTP+SSE is deprecated in favour of Streamable HTTP. Lateralis can expose its own tools (graph query, events, ATT&CK mapping, SOAR, Caldera) as an in-house MCP server. Community security MCP servers exist (ATT&CK, Wazuh, Caldera, Atomic Red Team), but they are third-party code. Tool poisoning and injection via tool output are now catalogued by OWASP. Vendor or wrap these servers rather than install them blindly.

### Cited Findings
**Spec 2026-07-28**
- Released 28 Jul 2026; release candidate 29 Jun 2026; previous revision 2025-11-25.
- Protocol layer is now stateless and the initialize handshake is removed.
- A new mandatory `server/discover` method.
- HTTP+SSE transport deprecated in favour of Streamable HTTP.
- New feature-lifecycle and deprecation policy.
- SEP-2468 adds an OAuth issuer check against mix-up attacks.
- MCP Apps extension graduated.
- Sources: [MCP blog: 2026-07-28 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/); [RC post](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/); [changelog](https://modelcontextprotocol.io/specification/latest/changelog)

**Existing security MCP servers (all third-party, community code)**
- **ATT&CK**
  - montimage `mitre-mcp`: MIT, stdio or HTTP, caches ATT&CK data locally. — [PyPI mitre-mcp](https://pypi.org/project/mitre-mcp); [README](https://raw.githubusercontent.com/montimage/mitre-mcp/HEAD/README.md)
  - lidless-labs `mitre-mcp`: combines ATT&CK queries with Wazuh, TheHive, Cortex and MISP integrations, including mapping Wazuh alerts to techniques. — [Glama listing](https://glama.ai/mcp/servers/lidless-labs/mitre-mcp)
- **Wazuh**
  - gbrigandi `mcp-server-wazuh`: Rust, Docker image. — [mcpservers.org](https://mcpservers.org/th/servers/gbrigandi/mcp-server-wazuh)
  - lidless-labs `wazuh-mcp`: npm. — [Glama](https://glama.ai/mcp/servers/lidless-labs/wazuh-mcp)
- **Caldera**
  - `caldera-mcp` (cowboy-samurai): PyPI, needs Caldera v5.x and Python 3.12+; tools for health, agents and abilities. — [PyPI caldera-mcp](https://pypi.org/project/caldera-mcp/)
  - A "Caldera MCP plugin" that generates abilities with an LLM and plans operations, seen only on a Gitee mirror; upstream not confirmed. — [Gitee mirror](https://gitee.com/mirrors_mitre/MCP)
  - A strictly read-only Caldera server. — [pkgstats @modular-intelligence/caldera](https://www.pkgstats.com/pkg:@modular-intelligence/caldera)
- **Atomic Red Team**: an MCP server covering 1,500+ tests. — [Red Canary blog](https://redcanary.com/blog/testing-and-validation/ai-security-testing/)

**Risks**
- The OWASP MCP Top 10 (beta, living document) includes MCP03 Tool Poisoning and MCP06 Prompt Injection via Contextual Payloads. — [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/)
- Tool descriptions are free-text with no length limits or schema validation. By mid-2026, assigned CVEs showed tool poisoning being exploited in practice. — [CSA research note, Jul 2026](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/07/CSA%5Fresearch%5Fnote%5Fmcp%5Ftool%5Fpoisoning%5Fai%5Fagent%5Fexfiltration%5F20260702-csa-styled.pdf)
- A 2026 study of seven MCP clients found most had significant issues from insufficient static validation and parameter checks. — [arXiv 2603.22489](https://arxiv.org/html/2603.22489v1)
- Attacks hit every layer: registry, description, response, arguments, config, client library. This is a practitioner report, secondary. — [dev.to State of MCP Security 2026](https://dev.to/luckypipewrench/the-state-of-mcp-security-2026-incidents-attack-patterns-and-defense-coverage-2h45)

### Inferences
- **Recommendation: write one first-party Lateralis MCP server** with the official Python SDK, or FastMCP, over stdio or Streamable HTTP. Expose separate, narrowly-scoped tool sets per agent:
  - Read-only analyst tools: graph query, event fetch, ATT&CK lookup, report draft.
  - Response tools: create SOAR action proposals only. Execution goes through an approval endpoint, not the LLM.
  - Red-team tools: bound to the Docker lab network and Caldera only.
- MCP is optional inside a single Python process: LangGraph and PydanticAI tools can be plain functions. MCP's value is reuse, e.g. Claude Desktop or IDE clients and future external agents, plus a clean trust boundary.
- If you reuse community servers (ATT&CK data is low risk), pin versions, review the code, and treat their tool descriptions as untrusted.
- Prefer loading ATT&CK STIX data locally over a live-SOC-integration server.

### Gaps
- Official MCP Python SDK version number not checked.
- No BloodHound MCP server found in this pass.
- No official MITRE Caldera MCP server confirmed.

---

## 3. Free-tier hosted LLM APIs (late 2026): models, limits, context, data policy, tool calling; primary + fallback

### Takeaway
As of 21 Nov 2026, the landscape has shrunk:
- **GitHub Models is retired** (30 Jul 2026).
- **Cerebras is now a 30-day $5 trial that needs a payment method.**
- **Mistral's free status is unclear.** Its Experiment plan historically trained on data.
- **Together has no free tier.**

The best zero-cost, no-card options for tool-calling agents on redacted data are:
1. **Groq**: gpt-oss-120b / qwen3.8-27b; no training by default; self-serve zero data retention (ZDR).
2. **OpenRouter `:free`**: opt out of training providers; 50 requests/day without credits.
3. **Cloudflare Workers AI**: 10k Neurons/day.
4. **SambaNova**: 20 requests/day.
5. **Google Gemini free tier**: large context, but **free-tier prompts are used for product improvement and may be read by human reviewers**. Use it only for non-customer data (e.g. the red-team lab or synthetic data), or for redacted data with that risk accepted.

### Cited Findings
**Groq** (checked 2026-11-21)
- Rate-limit page rows, which it labels as the Developer plan's base limits:
  - openai/gpt-oss-120b and gpt-oss-20b: 30 RPM / 1K RPD / 8K TPM / 200K TPD.
  - qwen/qwen3.8-27b: 30 RPM / 1K RPD / 8K TPM / 200K TPD.
  - meta-llama/llama-prompt-guard-2-22m and -86m (prompt-injection classifiers): 30 RPM / 14.4K RPD / 15K TPM / 500K TPD.
  - The free-plan tab could not be extracted. — [Groq rate limits](https://console.groq.com/docs/rate-limits)
- A third-party tracker (19 Nov 2026) lists the same 30 RPM / 1,000 RPD / 8K TPM / 200K TPD as free-tier figures, no card required. — [plugsky](https://plugsky.com/free-llm-api)
- Data: Groq docs say ZDR can be self-enabled by any customer in Data Controls. By default inference data is not retained, though some logs are kept up to 30 days. Groq's pages reportedly disagree on the default. — [Groq "Your data"](https://console.groq.com/docs/your-data); [standardcompute summary](https://standardcompute.com/providers/groq)
- The Services Agreement reportedly bars training on inputs and outputs without explicit permission. This is a secondary quote. — [developersdigest](https://www.developersdigest.tech/models/data-retention/groq)

**OpenRouter `:free` models** (checked 2026-11-21)
- Limits: 20 RPM, and 50 requests/day if fewer than 10 credits have ever been purchased. 1,000/day after buying at least 10 credits. Buying credits costs money, so the zero-cost ceiling is 50/day. — [OpenRouter limits](https://openrouter.ai/docs/api-reference/limits)
- Each upstream provider has its own data policy. Account settings can block routing to providers that may train on data, with separate toggles for paid and free models, and requests can be restricted by data policy. — [OpenRouter privacy/logging](https://openrouter.ai/docs/guides/privacy/logging)
- OpenRouter's own blog lists itself as "no training". It does not address upstream free-model providers. — [OpenRouter blog (updated 2026-09-24)](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)

**Google Gemini API free tier** (checked 2026-11-21)
- Unpaid Services: "Google uses the content you submit… to improve and develop Google products… and machine learning technologies"; "human reviewers may read, annotate, and process your API input and output"; "Do not submit sensitive, confidential, or personal information to the Unpaid Services."
- Paid services are not used for improvement.
- In the EEA, Switzerland and the UK, paid-style terms apply to all usage. Terms effective 23 Mar 2026.
- Source: [Gemini API Additional Terms](https://aistudio.google.com/docs/terms)
- Per-model free limits are now shown only in the console. Some projects "need verification", and Omni Flash / Genie 4 are not on the free tier. — [AI Studio rate limits](https://aistudio.google.com/docs/rate-limits)
- A tracker lists free models gemini-3.8-flash, 3.6-flash, 2.5-flash and 2.5-flash-lite with 1M context. From 16 Nov 2026 the $300 GCP credit no longer covers Gemini for new accounts. — [plugsky](https://plugsky.com/free-llm-api)

**Cerebras** (checked 2026-11-21)
- The official page now says "Free Trial": gpt-oss-120b at 5 RPM, 30K uncached TPM, 1M TPD; qwen-3.8-27b at 300 RPM, 150K uncached TPM. — [Cerebras rate limits](https://inference-docs.cerebras.ai/support/rate-limits)
- The tracker reports it is now a $5, 30-day trial that **requires a verified payment method**, with 65K free context vs 131K paid. — [plugsky](https://plugsky.com/free-llm-api)
- This contradicts older listings showing a permanent free tier with 30 RPM / 14.4K RPD. — [OpenRouter blog](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)

**Mistral La Plateforme**
- Experiment-plan requests may be used for training (opt-out available). Sign-up requires phone verification. Limits appear only in the console; third-party figures are about 1 req/s and about 1B tokens/month. — [Mistral help: Experiment plan](https://help.mistral.ai/en/articles/450104-how-can-i-try-the-api-for-free-with-the-experiment-plan); [Mistral help: training](https://help.mistral.ai/en/articles/323757-do-you-use-my-user-data-to-train-your-artificial-intelligence-models)
- One tracker moved Mistral to "no free API" on 19 Nov 2026 because official pages conflict. — [plugsky](https://plugsky.com/free-llm-api)

**GitHub Models**
- Fully retired 30 Jul 2026: playground, inference API and BYOK all removed. — [GitHub changelog](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/); [Simon Willison](https://simonwillison.net/2026/aug/9/github-models-is-now-retired)

**Cloudflare Workers AI**
- 10,000 Neurons/day free; text-gen default 300 RPM. Some models now need the $5/mo Workers Paid plan. gpt-oss-120b (128K context) and Llama 3.3 70B (24K free context). No card required. — [plugsky](https://plugsky.com/free-llm-api) (secondary; not verified on Cloudflare's pages)

**SambaNova**
- 20 RPM, 20 RPD and 200K TPD per model, no payment method needed. Models include gpt-oss-120b, Llama-3.3-70B, DeepSeek-V3.1 and gemma-4-31B-it. — [plugsky](https://plugsky.com/free-llm-api)
- Another source calls it a $5 trial that needs a card. — [OpenRouter blog](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/) (**conflict**)

**Together AI**
- No free tier. — [plugsky](https://plugsky.com/free-llm-api)

**NVIDIA NIM (build.nvidia.com)**
- Free prototype tier; limits shown in the console only. Training/data use per API Trial terms §3.3. "Prototyping, not production." — [plugsky](https://plugsky.com/free-llm-api)

**Cohere**
- Trial keys: 20 RPM and 1,000 calls per month; evaluation only. — [plugsky](https://plugsky.com/free-llm-api)

**Hugging Face Inference**
- Listed as having community rate limits; no concrete figures found. — [OpenRouter blog](https://openrouter.ai/blog/tutorials/free-llm-apis-compared/)

**LiteLLM Router** (MIT) — [LiteLLM routing docs](https://docs.litellm.ai/docs/routing)
- Fallbacks plus `context_window_fallbacks` and content-policy fallbacks.
- `num_retries` with exponential back-off on 429s.
- Per-deployment cooldown after 429s or more than 50% failures in a minute.
- Per-deployment `rpm`/`tpm`, plus `rpd`/`tpd` with `enforce_model_rate_limits`.
- `order` priority (lower is higher priority).
- Strategies: simple-shuffle (default), latency-based, least-busy, usage-based.

### Inferences
- **Recommended routing, all zero-cost and no card, via LiteLLM Router:**
  - **order 1: Groq `openai/gpt-oss-120b`**
    - Tool calling, fast. Set `rpm=30, rpd=1000, tpd=200000`.
    - Enable ZDR in Groq Data Controls.
    - The 8K TPM cap is the real bottleneck for agent loops with big tool outputs, so keep tool results summarised and small.
  - **order 1b: Groq `qwen/qwen3.8-27b`.** Same limits, separate per-model bucket. That roughly doubles the daily budget.
  - **order 2: OpenRouter `:free` tool-capable models**, with the "no training providers" toggle on for free models. Only 50 requests/day.
  - **order 3: Cloudflare Workers AI gpt-oss-120b**, 10k Neurons/day.
  - **order 4: SambaNova**, 20 requests/day.
  - **Last resort: local Ollama** (Section 7).
  - **Gemini free tier:** route only data classed "non-customer" (red-team lab telemetry, synthetic demos, docs Q&A). Its terms allow human review and training.
- **Use `context_window_fallbacks`** to send long-context jobs (big incident reports) to a 128K+ model.
- **Daily budget estimate:** Groq at about 2×1K requests plus OpenRouter at 50 plus SambaNova at 20 gives roughly 2,000 LLM calls/day. That is enough for a demo or college SOC lab, not for continuous triage of every alert. Triage should be gated: only high-score anomalies from the temporal-GNN go to the LLM.
- **Groq's hosted Llama Prompt Guard 2** (14.4K RPD) can serve as a cheap, free first-pass injection classifier on log fields.

### Gaps
- Groq's actual "Free plan" tab values could not be extracted; the official table is labelled Developer plan.
- Official Cloudflare, SambaNova and NVIDIA limit pages were not fetched (secondary tracker only).
- Hugging Face figures were not found.
- Per-model tool-calling support on each free endpoint was not verified provider by provider. gpt-oss and Qwen families generally support function calling, but verify on each endpoint.
- Mistral's current free status is unresolved.

---

## 4. Redaction / reversible pseudonymization (Presidio, alternatives), de-tokenization, quality impact

### Takeaway
Use **Microsoft Presidio** (analyzer + anonymizer) with **custom PatternRecognizers** for LANL-style hostnames and users (`C\d+`, `U\d+@DOM\d+`), IPs, domains and emails. Pair them with a **custom instance-counter operator** that emits stable typed tokens (`HOST_17`, `USER_4`), backed by a per-tenant mapping table stored locally. De-tokenize LLM output with a regex replace over the mapping.

Presidio's built-in reversible `encrypt` operator emits ciphertext, which is long and meaningless to the LLM. It suits storage, not prompts.

Research shows typed, entity-unique placeholders hurt LLM quality much less than generic tags. Retrieval-style tasks suffer most.

### Cited Findings
**Presidio**
- Encrypt is Presidio's only built-in reversible operator. Hash, mask, redact and replace are irreversible. Reversal goes through `DeanonymizeEngine` with a `decrypt` operator and the stored anonymizer results. — [Presidio tutorial 12: encryption](https://microsoft.github.io/presidio/tutorial/12_encryption); [tessl Presidio deanonymization docs](https://tessl.io/registry/tessl/pypi-presidio-anonymizer/2.2.0/files/docs/deanonymization.md)
- Deanonymization fails if stored results lack accurate positions. — [DeepWiki Presidio deanonymization](https://deepwiki.com/microsoft/presidio/3.2.2-deanonymization) (auto-generated secondary)
- The official pseudonymization sample defines `InstanceCounterAnonymizer(Operator)`:
  - It assigns per-entity-type indices via an `entity_mapping` dict in `params`.
  - It is registered with `AnonymizerEngine.add_anonymizer`.
  - It has a matching deanonymizer, and a replacement format like `<{entity_type}_{index}>`.
  - Custom operators live only for the engine instance's lifetime.
  - Sources: [Presidio pseudonymization sample](https://microsoft.github.io/presidio/samples/python/pseudonymization); [DeepWiki custom anonymizers](https://deepwiki.com/microsoft/presidio/7.3-custom-anonymizers); [tau-eval Presidio module](https://tau-eval.readthedocs.io/en/latest/_modules/tau_eval/models/presidio.html)
- Custom recognizers can be rule-based (`PatternRecognizer`), ML-based, or both. — [Presidio custom anonymization tutorial](https://microsoft.github.io/presidio/tutorial/11_custom_anonymization)
- LangChain's experimental `PresidioReversibleAnonymizer` offers `add_recognizer`, `anonymize` and `deanonymize`, with an internal mapping, aimed at the LLM use case. — [LangChain reversible anonymization guide](https://python.langchain.com/docs/guides/privacy/presidio_data_anonymization/reversible)
- Don't use encryption when you need true anonymization, because the key becomes a liability. Examples hardcode keys. — [dev.to anonymization strategies](https://dev.to/bspann/anonymization-strategies-4l91)

**Impact on LLM quality**
- arXiv 2609.11335 ("On the Impact of Anonymization on the Performance of LLMs") uses category-unique placeholders across five models. The largest absolute drops hit the strongest baselines; TruthfulQA sometimes improves. A secondary write-up reports RGB retrieval falling from 0.80 to 0.34 and MUSR from 0.73 to 0.70. — [arXiv 2609.11335](https://arxiv.org/pdf/2609.11335); [ppc.land write-up](https://ppc.land/anonymizing-prompts-cuts-openais-gpt-4o-mini-retrieval-score-by-60/) (secondary figures; unverified against the paper)
- Generic tags like a single `<NAME>` make distinct entities harder for the model to tell apart. — [arXiv 2411.05978](https://arxiv.org/html/2411.05978v1)
- A pseudonymization framework for cloud LLMs keeps over 95% of baseline on several tasks and about 85% on WMT14 de-en. — [arXiv 2502.15233](https://arxiv.org/pdf/2502.15233)
- In ACL PrivateNLP 2025, simple anonymize-and-restore beat more complex pseudonymization for Llama 3.3 70B. — [ACL PrivateNLP 2025](https://preview.aclanthology.org/moar-dois/2025.privatenlp-main.3.pdf)
- A benchmark and engine for reversible pseudonymization tests whether placeholders survive the round trip. — [arXiv 2610.34012](https://arxiv.org/pdf/2610.34012)

### Inferences
- **Design**
  - A `RedactionGateway` sits in front of LiteLLM, either as a LiteLLM pre-call/post-call hook or a FastAPI middleware.
  - It runs Presidio with regex-first recognizers. On the LANL dataset, the regexes alone catch `C\d+`, `U\d+@DOM\d+`, IPv4/IPv6, FQDNs, emails and SIDs.
  - Add spaCy NER only for free-text fields.
- **Token mapping**
  - Store the mapping (`HOST_17` ↔ `C1234`) in a local SQLite table keyed by tenant + incident, so tokens stay stable across agent turns.
  - Do not rely on in-memory operator state, which is lost with the engine.
- **De-tokenization**
  - Regex `\b(HOST|USER|IP|DOMAIN|EMAIL)_\d+\b` over the model's output and tool-call arguments.
  - Unknown tokens (the model hallucinated `HOST_99`) must be rejected, not passed to SOAR.
- **Tool calls stay on the machine.** Tools receive tokenized arguments and de-tokenize internally. Tool results are re-tokenized before going back to the LLM.
- **Preserve useful structure.** Keep the type in the token and optionally coarse attributes (e.g. `HOST_17[dc]`, `IP_3[internal]`), so the model can still reason about lateral movement. This follows the "unique typed placeholder" finding.
- **Alternatives.** scrubadub and pure regex work but are less extensible. Presidio is MIT-licensed and actively maintained (licence from training knowledge; verify on GitHub).

### Gaps
- Presidio's current release version and licence were not verified on GitHub in this pass.
- No security-log-specific study of pseudonymization's impact on LLM reasoning was found. All the studies above use general NLP benchmarks.

---

## 5. Prompt injection when agents read attacker-controlled log fields; mitigations

### Takeaway
Log fields (process command lines, user-agents, hostnames, file names) are attacker-controlled, so the analyst agent is an indirect-prompt-injection target by design. OWASP ranks prompt injection LLM01 (2025), and the OWASP Agentic Top 10 (2026) adds goal hijack (ASI01).

Mitigation has to be architectural:
- tool allow-lists per agent;
- read-only tools for triage;
- human approval before any state change;
- a quarantined (dual-LLM / CaMeL-style) summariser for raw log text;
- a classifier such as Llama Prompt Guard 2.

### Cited Findings
- **OWASP LLM Top 10 2025** ranks prompt injection first (LLM01). The **OWASP Top 10 for Agentic Applications (2026)** includes ASI01 goal hijack. — [OWASP MCP Top 10 page / OWASP GenAI references](https://owasp.org/www-project-mcp-top-10/) (via search summary; the LLM Top 10 page itself was not fetched)
- **Dual-LLM pattern (Willison):** a privileged LLM holds tools; a quarantined LLM reads untrusted content with no tools. The quarantined model still sees malicious text. — [Simon Willison on CaMeL](https://simonwillison.net/2025/apr/11/camel/); [arXiv 2503.18813](https://arxiv.org/abs/2503.18813)
- **CaMeL (Google DeepMind)**
  - Converts the user request into a restricted Python program run by an interpreter that tracks data provenance and capabilities, so injected data cannot alter control flow. — [InfoQ](https://www.infoq.com/news/2025/04/deepmind-camel-promt-injection)
  - Reportedly eliminates nearly all AgentDojo injection attacks at comparable task performance. — [arXiv 2505.02077](https://arxiv.org/pdf/2505.02077)
  - Main limitation: users must define security policies. — [InfoQ](https://www.infoq.com/news/2025/04/deepmind-camel-promt-injection)
  - A multi-agent extension exists. — [arXiv 2610.05640](https://arxiv.org/pdf/2610.05640)
- **Prompt Guard on Groq:** Groq hosts `meta-llama/llama-prompt-guard-2-22m/86m` at 14.4K RPD. — [Groq rate limits](https://console.groq.com/docs/rate-limits)
- **MCP-specific risks:** tool poisoning (MCP03) and contextual-payload injection (MCP06). — [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/)

### Inferences
Concrete controls for Lateralis:
1. **Per-agent tool allow-lists, enforced in code, not in the prompt.**
   - Triage: read-only tools.
   - Response: `propose_action` only. Execution happens in a non-LLM approval service after a human clicks Approve (LangGraph `interrupt()`).
   - Red-team: Caldera only, network-bound to the Docker lab; operations need approval and a lab-scope check.
   - Copilot: read-only, with no hand-off to red-team or response.
2. **Wrap untrusted fields as data.** Use explicit delimiters or JSON fields with `untrusted=true`. Truncate and normalise long strings, and strip zero-width and control characters.
3. **Quarantined summariser.** A tool-less LLM call turns raw log blobs into structured fields (enum or regex-validated) before the privileged agent sees them. This is the dual-LLM pattern.
4. **Classifier pass.** Run Prompt Guard 2 (Groq free, or local) on free-text fields and flag high scores on the alert.
5. **Output validation.** Validate tool arguments against Pydantic schemas and allow-listed entity tokens. Reject unknown tokens and out-of-scope targets.
6. **Audit trail.** Log every tool call and approval to the observability backend (Section 6).

Redaction also helps a little: attacker-supplied hostnames become tokens. But injected instructions in command lines still pass through, so redaction is not an injection defence.

### Gaps
- The OWASP LLM Top 10 2025 and Agentic Top 10 2026 pages were not fetched directly. The rankings come via search summaries.
- No benchmark of injection success against free models (gpt-oss, Qwen) on security-log inputs was found.

---

## 6. Observability / tracing (Langfuse, Arize Phoenix, OpenLLMetry/OTel GenAI semconv, LangSmith); laptop footprint

### Takeaway
**Langfuse** is MIT except its `ee` folders. It is the most complete free self-hosted option, but v3/v4 needs Postgres, ClickHouse, Redis and S3-compatible storage. Documented minimums total well over 16 GB if followed literally, so it is heavy for this laptop.

**Arize Phoenix** runs as a single container. It is OTel/OpenInference-native, with instrumentors for LangGraph, PydanticAI, OpenAI Agents and LiteLLM. It is licensed under **Elastic License 2.0**: source-available, free to self-host, but not OSI open source, and it bars offering it as a managed service.

OTel GenAI semantic conventions are still **Development** status.

**Recommendation:** Phoenix for the laptop, with OTel instrumentation so you can switch to Langfuse later.

### Cited Findings
**Langfuse**
- Licence and setup: "MIT licensed, except for the `ee` folders"; quick start is `git clone` then `docker compose up`; telemetry off via `TELEMETRY_ENABLED=false`. — [Langfuse GitHub](https://github.com/langfuse/langfuse)
- Some features need a licence key when self-hosted, e.g. per-project data retention needs Enterprise. — [Langfuse self-hosting docs](https://langfuse.com/docs/deployment/v3/overview)
- Documented minimums:

  | Component | Minimum |
  |---|---|
  | ClickHouse | 2 CPU / 8 GiB |
  | Redis | 1 CPU / 1.5 GiB |
  | Web | 2 CPU / 4 GiB |
  | Worker | 2 CPU / 4 GiB |
  | Postgres | 2 CPU / 4 GiB |

  — [Langfuse ClickHouse guide](https://langfuse.com/resources/engineering/clickhouse-for-self-hosted-langfuse); [production checklist](https://langfuse.com/resources/engineering/self-hosted-langfuse-production-checklist)
- Versions: v4 requires ClickHouse 25.12 or later (26.4 recommended); Redis 7+ with `noeviction`. — [Langfuse ClickHouse guide](https://langfuse.com/resources/engineering/clickhouse-for-self-hosted-langfuse)

**Arize Phoenix**
- Licence: ELv2.
- Deployment: Docker, Docker Compose or Helm images.
- Built on OpenTelemetry, with OpenInference instrumentors: `openinference-instrumentation-langchain` (LangGraph), `-pydantic-ai`, `-openai-agents`, `-litellm`.
- Source: [Phoenix GitHub](https://github.com/Arize-ai/phoenix)

**OTel GenAI semantic conventions**
- Status is Development. Instrumentations on v1.36.0 or earlier should not change their default emitted version.
- Agent spans spec exists, also in Development.
- Opt in to the latest experimental conventions with `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`.
- Sources: [OTel GenAI spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/); [agent spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/index.md); [Datadog OTel instrumentation](https://docs.datadoghq.com/llm_observability/instrumentation/otel_instrumentation/?tab=python)
- Secondary sources say gen_ai definitions moved to the `semantic-conventions-genai` repo in v1.42.0 (12 Jun 2026). — [Dash0 explainer](https://www.dash0.com/knowledge/opentelemetry-genai-semantic-conventions-explained)

**OpenLLMetry (Traceloop)** emits OTel GenAI-style spans. — [OpenLLMetry issue tracker reference](https://github.com/traceloop/openllmetry/issues/3460) (licence and footprint not checked)

**Other framework tracing defaults**
- OpenAI Agents SDK tracing uploads to OpenAI by default.
- CrewAI tracing goes to AMP.
- Source: [Pydantic comparison](https://pydantic.dev/articles/best-python-ai-agent-frameworks)

### Inferences
- **Laptop (16 GB):** run **Phoenix** as one container next to FastAPI, Neo4j/graph store and the React UI. Instrument with OpenInference/OTel so traces are portable.
- **Langfuse:** its full stack (ClickHouse + Postgres + Redis + MinIO + web + worker) would compete with the platform for RAM. It can run below the documented minimums for a demo, but that is not recommended alongside an Ollama model.
- **If true OSI open source is required**, Langfuse (MIT core) is the pick. Run it on a second machine or a free-tier VM later.
- **LangSmith:** self-hosting is an enterprise/paid offering per general knowledge. Not verified in this pass; treat it as not zero-cost.
- **Redaction placement:** traces must be captured **after** redaction (tokenized prompts) or stored only locally. Never point tracing at a SaaS endpoint with raw customer data. Phoenix and Langfuse both stay local.

### Gaps
- Langfuse latest version number not captured.
- No measured idle RAM for Langfuse or Phoenix on a laptop; the documented minimums are production guidance.
- LangSmith self-host pricing not verified.
- OpenLLMetry licence not fetched.

---

## 7. Local fallback: Ollama with small tool-calling models (Qwen3, Llama 3.x) on CPU, 16 GB RAM

### Takeaway
It works as an emergency or offline fallback, not as the main agent brain. Qwen3-8B Q4 on a CPU-only 16 GB laptop runs at roughly **5–15 tokens/s**: 5.1 tok/s measured on an i7-1185G7, versus an 8–15 estimate. Qwen3-4B Q4 is roughly 12–20 tok/s. Prompt processing of large tool outputs adds substantial latency. No CPU tool-calling benchmark was found.

### Cited Findings
- Qwen3 8B Q4_K_M on 16 GB RAM, CPU only: about 8–15 tok/s (an estimate, not a measurement). — [bestllmfor.com CPU guide](https://bestllmfor.com/guide/llm-local-cpu-sans-gpu/)
- Measured: a Dell Latitude with i7-1185G7 and 32 GB ran Qwen3-VL 8B via Ollama at about 5.14 tok/s. — [It's FOSS CPU-only test](https://itsfoss.com/testing-local-llms-without-gpu)
- Qwen3 4B at 4-bit on an 8 GB laptop: about 15–18 tok/s; another guide gives 12–20 tok/s. — [MindStudio](https://www.mindstudio.ai/blog/run-qwen-llama-cpp-low-ram-laptop/); [PromptQuorum](https://www.promptquorum.com/local-llms/fastest-local-llms-low-end-pcs)
- CPU inference is bound by memory bandwidth, not core count, so DDR5 beats DDR4. Below about 5 tok/s chat feels frustrating; above about 15 tok/s it matches reading speed. — [InsiderLLM CPU-only guide](https://insiderllm.com/guides/cpu-only-llms-what-actually-works/)
- No benchmark measures tool-calling latency on CPU. Run `ollama run qwen3:8b --verbose` on the target laptop. — (search summary; derived from the sources above)

### Inferences
- **Fallback model:** use `qwen3:4b` or `qwen3:8b` (Q4) via Ollama, registered in LiteLLM as the last `order`.
  - An 8B Q4 model uses about 5–6 GB of RAM, alongside the platform stack, Phoenix and the browser. That is tight but feasible; avoid also running Langfuse.
- **Use local for:**
  - redaction-free paths (the data never leaves the machine);
  - the copilot when quotas are exhausted;
  - the quarantined summariser in the dual-LLM pattern, since it needs no tools.
- **Do not use local for:** multi-step triage loops with large tool outputs, which will take minutes per step.
- **Local Prompt Guard 2 (22M/86M):** a tiny classifier that runs comfortably on CPU, giving an offline injection filter. This is an inference from model size; not benchmarked here.

### Gaps
- No measured tok/s for the user's exact CPU.
- No tool-calling accuracy data for Qwen3-4B/8B at Q4 on agentic benchmarks was found in this pass.
