# Open-Source Security Tooling Stack for Lateralis (self-hosted Docker Compose bundle)

Research date: 2026-11-21. Method: WebSearch/WebFetch only (no Firecrawl/Apollo). About 20 tool calls; many facts verified live this session. Items marked **[TK]** come from the researcher's training knowledge (cutoff mid-2026) with the canonical official URL. They were NOT re-fetched this session, and the writer should treat them as "very likely but verify the licence file before shipping".

Recommended stack at a glance (opinionated):

| Layer | Recommended (laptop demo) | Recommended (customer/prod) | Avoid / caution |
|---|---|---|---|
| Collection | Vector (or Fluent Bit) tailing Samba JSON audit + sshd/journald + Zeek | Wazuh agents/manager for Windows Security log + Sysmon; Zeek sensor; Vector as normaliser | Logstash (Elastic licence family, JVM-heavy); Velociraptor as a *collector* (it is DFIR, not streaming) |
| Schema | OCSF (Authentication 3002, Network Activity 4001) internally, with an ECS mapping table for Wazuh/Elastic sources | same | OSSEM as a schema of record (use it as a *data dictionary/reference* only) |
| Event store | DuckDB + Parquet (embedded, MIT) | ClickHouse (Apache-2.0) or OpenSearch (Apache-2.0) if customers want search UI | Elasticsearch default distro (SSPL/ELv2/AGPL tri-licence; check before embedding) |
| Graph | NetworkX/PyG in-process for the T-GNN, plus Postgres + Apache AGE for persisted queryable graph | Neo4j Community (GPLv3, run as a separate container, not linked) or AGE | Kuzu (archived Oct 2025); Memgraph CE (BSL, not OSI open source) |
| AD attack paths | BloodHound CE + RustHound-CE / bloodhound-ce-python against Samba AD (feasibility to be tested) | BloodHound CE + SharpHound | Legacy BloodHound 4.x and bloodhound-python (legacy branch) |
| SOAR | Shuffle (AGPL-3.0) or Tracecat (AGPL-3.0) | Tracecat (AI-native, cases, approvals) or StackStorm (Apache-2.0, has an "inquiry" approval primitive) | n8n (Sustainable Use Licence, not OSI; restricts redistribution in a commercial product); TheHive 5 (proprietary freemium) |
| Detection content | ATT&CK STIX (attack-stix-data + mitreattack-python), Sigma + pySigma | same | — |
| Red team | Caldera (Apache-2.0, now under the `apache/` GitHub org) + Atomic Red Team (Linux atomics) + Samba AD DC container + SSH/web/DB containers | GOAD/Ludus on a dedicated Proxmox/VM host for Windows-realistic telemetry | DetectionLab (unmaintained since 2023); Stratus Red Team (cloud-only, irrelevant to on-prem AD) |
| Threat intel | Skip; at most a MISP *feed import* job | MISP (AGPL) optional profile | OpenCTI (heavy: ES/OpenSearch + Redis + RabbitMQ + MinIO) |

---

## 1. Collection & normalisation: which tools produce the auth/lateral-movement events, and which is lightest?

### Takeaway
No single collector covers everything. Windows auth events (4624/4625/4648/4768/4769) come from the Windows Security log, collected with a Wazuh agent (or Winlogbeat/NXLog/OTel). In a pure-Linux Docker lab, the equivalents come from **Samba AD DC JSON audit logs**, which emit Windows-style `eventId`/`logonType` fields, plus **sshd/journald** and **Zeek** (kerberos/ntlm/smb/ssh/rdp logs). The lightest laptop pipeline is **Vector (or Fluent Bit) to OCSF to DuckDB/Parquet**. Wazuh is the best "real enterprise" collector but needs 6–8 GB RAM on its own.

### Cited Findings
**Wazuh (GPLv2 [TK])**
- Wazuh 4.12 Docker prerequisites: host with at least **6 GB RAM**, 4 cores, 50 GB disk — [Wazuh 4.12 docs](https://documentation.wazuh.com/4.12/deployment-options/docker/prerequisites.html)
- Wazuh **5.0-beta** single-node Docker: at least **8 GB RAM**, 4 cores, 50 GB — [Wazuh 5.0-beta docs](https://documentation.wazuh.com/5.0-beta/deployment-options/docker/wazuh-container.html)
- Community/mailing-list guidance (Jan 2026): documented figures are installation minimums, not stability guarantees. All-in-one stacks need much more disk/memory headroom because of OpenSearch disk watermarks and JVM behaviour — [Wazuh Google Group](https://groups.google.com/g/wazuh/c/afBxk9gpHZI)
- A third-party Feb 2026 guide recommends 8 GB minimum / 16 GB recommended for Wazuh in Docker — [OneUptime](https://oneuptime.com/blog/post/2026-02-08-how-to-run-wazuh-in-docker-for-siem/view)
- Wazuh bundles its own OpenSearch fork (wazuh-indexer) and ships rules decoding Windows Security events, including 4624/4625/4648/4768/4769, plus Sysmon events. Its alerts are JSON with `data.win.system.eventID`. It has a REST API (port 55000) **[TK]** — [Wazuh docs](https://documentation.wazuh.com/current/)

**Zeek (BSD-3 [TK])**
- When Zeek sees SMB traffic it may write `dce_rpc.log`, `kerberos.log`, `ntlm.log`, `smb_cmd.log`, `smb_files.log`, `smb_mapping.log`, `pe.log`, and `notice.log` in addition to `conn.log` — [Zeek docs: SMB logs](https://docs.zeek.org/en/master/logs/smb.html)
- BZAR (ATT&CK-based Zeek analytics) raises `notice.log` entries on SMB/DCE-RPC lateral-movement patterns. Zeek's docs warn that "it is no easy feat to differentiate among normal, suspicious, and malicious SMB activity" — [Zeek docs: SMB logs](https://docs.zeek.org/en/master/logs/smb.html)
- `ssh.log` records inbound/outbound direction and `auth_success`/`auth_attempts`. The docs discuss internal-to-internal SSH as lateral movement — [Zeek docs: SSH logs](https://docs.zeek.org/en/lts/logs/ssh.html)
- Zeek also has `rdp.log` (cookie/username, security protocol) **[TK]** — [Zeek log docs](https://docs.zeek.org/en/master/logs/index.html)
- Zeek is network-only. It sees Kerberos AS/TGS exchanges (client principal, service, success/error) **without** needing host agents. That makes it the best Docker-lab source for a Kerberos/SMB "who-talked-to-whom-as-whom" graph.

**Suricata (GPLv2 [TK])**
- Signature IDS with EVE JSON output. It has Kerberos/SMB/SSH/RDP app-layer parsers but is alert-centric. It adds little over Zeek for building an auth graph; use it only if you want ET Open signature alerts as extra node features **[TK]** — [Suricata docs](https://docs.suricata.io/)

**Sysmon (Windows) / Sysmon for Linux**
- Sysmon for Linux is eBPF-based. Events go to **syslog in the same XML schema as Windows Sysmon**. Licence: **MIT**, with the eBPF programs under **GPL-2**. The latest release note found is 1.4 (Azure Linux 3.0 support, page updated 8 Jul 2025) — [SysmonForLinux GitHub](https://github.com/Sysinternals/SysmonForLinux); [Sysinternals blog](https://techcommunity.microsoft.com/blog/sysinternals-blog/-/4431366)
- Sysmon for Linux gives process create (EID 1), network connect (EID 3), and file events. It does **not** give authentication events, so pair it with auth logs. Sysmon (Windows) is freeware but not open source (Sysinternals EULA) **[TK]** — [Sysmon docs](https://learn.microsoft.com/sysinternals/downloads/sysmon)
- Inside Docker containers, eBPF Sysmon must run on the host or a privileged container, which is awkward on Docker Desktop for Windows/macOS (inference).

**Velociraptor**
- 0.74 (Feb 2025) added a full eBPF plugin based on Aqua's tracee — [Velociraptor 0.74 release notes](https://docs.velociraptor.app/blog/2025/2025-02-23-release-notes-0.74)
- Rapid7 owns and stewards Velociraptor. A CVE published 5 Oct 2026 (CVE-2026-78413) covers privilege escalation via the `Windows.Sysinternals.SysmonLogForward` artifact on Linux deployments — [OpenCVE](https://app.opencve.io/cve/CVE-2026-78413)
- Licence AGPL-3.0 **[TK]** — [Velociraptor GitHub](https://github.com/Velocidex/velociraptor). This session found no 2026 release announcement.

**osquery (Apache-2.0/GPLv2 dual [TK])**
- SQL-over-endpoint. The `last`/`logged_in_users`/`process_events`/`socket_events` tables can feed auth/connection events, but it is pull/scheduled rather than a log pipeline. Good for host *state* features (local admins, listening ports) on graph nodes **[TK]** — [osquery](https://osquery.io/)

**auditd**
- Linux kernel audit. `USER_LOGIN`, `USER_AUTH`, and `USER_START` records from PAM/sshd plus `execve` give SSH logon and process telemetry **[TK]**. auditd does not work inside unprivileged containers (one kernel audit subsystem per host), so in Docker prefer sshd logs via journald/rsyslog (inference).

**Shippers / normalisers**
- **Vector** (Datadog-backed, MPL-2.0 **[TK]**): Rust, single static binary, typically tens of MB RAM. It has VRL (a transform language) suited to OCSF/ECS remapping, and sinks to ClickHouse, Kafka, files/Parquet, HTTP — [vector.dev](https://vector.dev/)
- **Fluent Bit** (CNCF, Apache-2.0 **[TK]**): C, roughly 1–10 MB footprint, the lightest. It parses less expressively than Vector — [fluentbit.io](https://fluentbit.io/)
- **OpenTelemetry Collector** (CNCF, Apache-2.0 **[TK]**): logs are GA. Its `windowseventlog` receiver can collect 4624 etc. and `filelog` handles Linux. Good if customers already run OTel — [OTel collector-contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib)
- **Logstash**: JVM, roughly 1 GB heap by default. Distributed under Elastic's licence family (see §2). Not recommended for a lightweight bundle **[TK]**.

**Schemas**
- OCSF joined the Linux Foundation on 19 Nov 2024 — [Linux Foundation press release](https://www.linuxfoundation.org/press/open-cybersecurity-schema-framework-ocsf-joins-the-linux-foundation-to-optimize-critical-security-data?hsLang=en)
- OCSF **Authentication** is class UID **3002** in the Identity & Access Management category — [Tenzir OCSF 1.4.0 reference](https://docs.tenzir.com/reference/ocsf/1-4-0/classes/authentication)
- A third-party guide lists OCSF v1.5.0 (Apr 2025) and claims later versions up to v1.9.0 (Aug 2026). That is unverified; check against the official changelog — [nhimg.org guide](https://nhimg.org/ocsf-guide); [OCSF CHANGELOG](https://raw.githubusercontent.com/ocsf/ocsf-schema/main/CHANGELOG.md)
- The Authentication class covers Windows logon events and IdP/directory sign-ins, with fields such as `user`, `is_mfa`, `auth_protocol_id`, `logon_type_id`, `src_endpoint`, `dst_endpoint`, `service` — [nhimg.org guide](https://nhimg.org/ocsf-guide) (secondary); [schema.ocsf.io](https://schema.ocsf.io/)
- ECS is Apache-2.0 and native to Elastic/Wazuh/OpenSearch dashboards. Elastic contributed ECS to OpenTelemetry semantic conventions (2023) **[TK]** — [ECS](https://www.elastic.co/guide/en/ecs/current/index.html)
- OSSEM (Open Source Security Events Metadata) is a community data dictionary plus "detection data model" that maps Windows events to entities and relationships. It is useful as a reference for mapping 4624/4768 to graph edges, but it is not a runtime schema **[TK]** — [OSSEM GitHub](https://github.com/OTRF/OSSEM)

**Windows event to graph-edge mapping (for the T-GNN)**
- 4624 = successful logon (logonType 3 network, 10 RDP, 2 interactive); 4625 = failed; 4648 = explicit-credential logon; 4768 = Kerberos TGT request; 4769 = service ticket (TGS) request; 4776 = NTLM validation **[TK]** — [Microsoft: Advanced security audit events](https://learn.microsoft.com/windows/security/threat-protection/auditing/advanced-security-audit-policy-settings)

### Inferences
- Lateralis's internal canonical record should be a slim OCSF subset (3002 Authentication + 4001 Network Activity), with `time`, `src_endpoint.ip/hostname`, `dst_endpoint`, `user.name/domain`, `auth_protocol` (Kerberos/NTLM/SSH-key/password), `logon_type`, `status`. This maps cleanly to the LANL-style (src_user, src_host, dst_host, auth_type, logon_type, success) tuples typical of temporal-GNN lateral-movement papers.
- Laptop demo: Zeek (~200–500 MB) + Vector (<100 MB) + Samba/sshd logs is about 1 GB total. Wazuh alone is 6–8 GB, so put it behind a `--profile wazuh` compose profile, not the default.
- Ship **adapters**, not a SIEM: ingest from customer Wazuh API/alerts JSON, Windows Event Forwarding/OTel, Zeek, and Elastic/OpenSearch indices. Most enterprises already have a collector, and Lateralis should sit downstream of it.

### Gaps
- Exact current RAM footprint of Vector/Fluent Bit/Zeek under lab load was not measured or sourced this session (figures above are typical/[TK]).
- Latest Wazuh 4.x (4.14?) Docker requirements page was not found; 5.0 GA status as of Nov 2026 is unconfirmed (only 5.0-beta docs seen).
- No official 2026 Velociraptor version/licence confirmation was fetched.

---

## 2. Storage & graph: options and licence gotchas

### Takeaway
For a temporal GNN, the training/inference graph should live **in-process** (NetworkX/PyTorch Geometric temporal snapshots built from DuckDB/Parquet event windows). A persisted, queryable graph is a secondary concern. **Postgres + Apache AGE** (Apache-2.0) is the safest licence choice. **Neo4j Community** (GPLv3) is fine as a separate container but has no clustering/RBAC. **Kuzu is archived** (Oct 2025), and **Memgraph CE is BSL** (source-available, not OSI open source).

### Cited Findings
- **Kuzu**: Kùzu Inc. abandoned the MIT-licensed embedded graph DB. The GitHub repo was **archived 10 Oct 2025**, with **v0.11.3 as the final release** — [The Register](https://www.theregister.com/2025/10/14/kuzudb_abandoned/); [PuppyGraph](https://www.puppygraph.com/blog/what-is-kuzudb)
- Kuzu forks: **RyuGraph** (Predictable Labs) — [GitHub](https://github.com/predictable-labs/ryugraph); **Ladybug**, described as the most established community fork (v0.17.1, Jun 2026) — [PuppyGraph](https://www.puppygraph.com/blog/what-is-kuzudb); [OneUptime "Kuzu was archived" Aug 2026](https://oneuptime.com/blog/post/2026-08-12-kuzu-archived-pin-0-11-3-fork-or-migrate/view)
- Conflict: ArcadeDB/PuppyGraph claim Apple acquired Kùzu Inc. in Oct 2025. The Register article does not mention this, so it is unconfirmed — [ArcadeDB blog](https://arcadedb.com/blog/from-kuzudb-to-arcadedb-migration-guide/)
- **Apache AGE**: v1.6.0 (PG17 build) released Sep 2025; **v1.7.0 on 21 Jan 2026** (row-level security, id indexes); EDB packages 1.7.0.1 (Mar 2026) supporting **PostgreSQL 17 and 18** — [AGE release notes](https://age.apache.org/release-notes); [EDB release notes](https://www.enterprisedb.com/docs/pg_extensions/apache_age/rel_notes/apache_age_1.7.0.1_rel_notes/)
- AGE health: ASF board minutes (late 2025) describe "reduced velocity", with contribution volume low but rising. No board report was submitted in Feb 2026. The project had 19 committers / 13 PMC members — [ASF board minutes: AGE](https://whimsy-vm9.apache.org/board/minutes/AGE.html)
- AGE 1.6.0 added NetworkX support to its Python driver — [AGE release notes](https://age.apache.org/release-notes)
- **Memgraph**: the Community Edition is governed by the **Business Source License**; the Enterprise Edition uses the Memgraph Enterprise License — [Memgraph legal](https://memgraph.com/legal). VentureBeat describes the BSL as "source-available" rather than open source — [VentureBeat](https://venturebeat.com/business/graph-database-company-memgraph-raises-9-34m/). Memgraph's pricing page still calls CE "open source", which conflicts — [Memgraph pricing](https://memgraph.com/pricing)
- **Neo4j Community**: GPLv3. Single instance, no clustering, no fine-grained RBAC, no online backup, one user database (Enterprise is commercial). The Community Docker image is `neo4j:5-community` **[TK]** — [Neo4j licensing](https://neo4j.com/licensing/). Memgraph (a vendor, so biased) states Neo4j CE does not support replication — [DEV/Memgraph](https://dev.to/memgraph/get-a-feature-rich-open-source-community-edition-graph-database-ready-for-production-5fej)
- **Elasticsearch**: Elastic added **AGPLv3** as a third licence option (alongside SSPL and ELv2) in Aug/Sep 2024. Client libraries remain Apache-2.0 — [Elastic licensing FAQ](https://www.elastic.co/de/pricing/faq/licensing); [The New Stack](https://thenewstack.io/whats-behind-elastics-unexpected-return-to-open-source/)
- **OpenSearch**: fork of ES 7.10 (last Apache-2.0 ES). Apache-2.0. Governed by the OpenSearch Software Foundation (Linux Foundation) since Sep 2024 — [Instaclustr](https://www.instaclustr.com/education/opensearch/opensearch-vs-elasticsearch-similarities-and-6-key-differences/)
- **ClickHouse** (Apache-2.0), **DuckDB** (MIT), **NetworkX** (BSD-3) **[TK]** — [ClickHouse GitHub](https://github.com/ClickHouse/ClickHouse); [DuckDB](https://duckdb.org/); [NetworkX](https://networkx.org/)

### Inferences
- Recommended: DuckDB/Parquet as the event lake for the pip/laptop install (zero extra containers). ClickHouse for customer scale (columnar, Vector has a native sink, about 1–2 GB RAM baseline [TK]). Graph snapshots are computed in Python. Persist the "current graph" in Postgres+AGE, which also gives you the app DB, so one container does two jobs.
- Neo4j Community is acceptable *only* as an unmodified separate container talking over Bolt (GPLv3 obligations then generally don't reach the Lateralis code). BloodHound CE already ships its own Neo4j, so if BloodHound is included, Neo4j is "free" in the bundle. Still, don't build Lateralis's core on Neo4j CE if customers will want HA.
- Avoid building on Kuzu or its forks for a product unless a fork shows sustained releases. The fork landscape is fragmented.
- Elasticsearch AGPL is now usable, but AGPL network-service obligations plus the tri-licence complexity make OpenSearch the cleaner default.

### Gaps
- Live RAM baselines for Neo4j/AGE/ClickHouse were not sourced this session.
- Whether Memgraph's BSL change date converts CE to Apache-2.0 per release was not verified.

---

## 3. BloodHound CE and AD attack-path tooling

### Takeaway
BloodHound CE models **static** AD privilege/ACL/session relationships ("who *can* reach Domain Admin"). Lateralis's temporal GNN models **observed, time-ordered** authentication behaviour ("who *is* moving where, and what's next"). They complement each other: BloodHound edges (AdminTo, HasSession, GenericAll, MemberOf) make excellent static edge features/priors for the T-GNN. Linux collectors (RustHound-CE, bloodhound-ce-python) speak LDAP/Kerberos and *should* work against Samba AD, but this session found no source confirming Samba compatibility. That needs a lab test.

### Cited Findings
- BloodHound CE's Docker Compose example runs **PostgreSQL (app state) + Neo4j (graph)** — [BloodHound docker-compose README (mirror)](https://github.com/Mazars-Tech/BloodHound/blob/main/examples/docker-compose/README.md)
- Official install path: the BloodHound CLI (wraps Docker Compose). The default compose binds to 127.0.0.1 — [BloodHound CE quickstart](https://bloodhound.specterops.io/get-started/quickstart/community-edition-quickstart)
- Licence: Apache-2.0 **[TK]**, seen only in a third-party gist header this session — [SpecterOps/BloodHound GitHub](https://github.com/SpecterOps/BloodHound); [CE announcement](https://posts.specterops.io/bloodhound-community-edition-a-new-era-d64689806e90)
- **RustHound-CE**: cross-platform Rust collector (Linux/Windows/macOS) whose output loads into BloodHound CE. Supports Kerberos ccache auth on Linux — [RustHound-CE GitHub](https://github.com/g0h4n/RustHound-CE)
- **bloodhound-ce-python** (`pip install bloodhound-ce`) is CE-compatible. The legacy `bloodhound-python` only supports BloodHound 4.2/4.3 — [Kali tools: bloodhound-ce-python](https://www.kali.org/tools/bloodhound-ce-python/); [dirkjanm/BloodHound.py](https://github.com/dirkjanm/BloodHound.py)
- A single third-party benchmark: RustHound about 3.2 s vs BloodHound.py about 9.7 s on roughly 3,500 objects — [RustHound-CE stats](https://docs.rs/crate/rusthound-ce/2.4.6/source/STATS.md)
- SharpHound is the Windows-native collector (C#). Guidance is to use SharpHound where possible and RustHound as a fallback — [x7331 notes](https://x7331.gitbook.io/boxes/tl-dr/active-directory/ad-tools/bloodhound)
- An undated, unofficial note warns of Neo4j 5 performance regressions and recommends 4.4.x for BloodHound — [c1ph3rx13 wiki](https://c1ph3rx13.github.io/RedTeam/Windows/Active%20Directory/BloodHound)

### Inferences
- Against Samba AD, LDAP-derived data (users, groups, GPOs, ACLs, trusts) should collect. **Session** and **local admin** collection rely on SMB/RPC calls to Windows member hosts (NetSessionEnum, SAMR), so Linux members will yield little. Expect a BloodHound graph that is mostly group/ACL edges.
- Integration: BloodHound CE has a REST API with signed-request API tokens and Cypher search. Lateralis can pull edges via API or read its Neo4j, then fuse them as static edge types alongside temporal auth edges.
- Positioning: "BloodHound tells you the paths that exist; Lateralis forecasts which path an intruder is taking now."

### Gaps
- No source confirming RustHound-CE/bloodhound-ce-python working against Samba 4 AD (needs a lab test).
- BloodHound CE minimum runtime RAM and the current Neo4j version pin were not retrieved.
- 2026 release cadence/stars for BloodHound CE were not checked.

---

## 4. SOAR / case management with approval steps

### Takeaway
For a genuinely open-source, AI-agent-friendly SOAR with human approval: **Tracecat** (AGPL-3.0, AI-native, case management) or **Shuffle** (AGPL-3.0 [TK], mature, OpenAPI-app model). **StackStorm** (Apache-2.0) has the most explicit approval primitive (`core.ask` "inquiries") but is aging. **TheHive 5** is no longer open source. **n8n** is fair-code and unsuitable to redistribute inside a commercial bundle.

### Cited Findings
- **TheHive 5**: StrangeBee moved to a freemium model with a free **Community licence** ("personal, educational and basic commercial use") — [StrangeBee blog](https://blog.strangebee.com/thehive-turns-5-and-adopts-a-model-shaped-for-the-future). The Community licence is on-prem only — [StrangeBee docs](https://docs.strangebee.com/thehive/installation/licenses/about-licenses/)
- From 5.3, an install without a licence falls back to **read-only**. A third-party guide says new installs get a 14-day Platinum trial, then go read-only until licensed — [StrangeBee docs: request community licence](https://docs.strangebee.com/thehive/installation/licenses/request-a-community-license/); [tech-insider.org](https://tech-insider.org/sv/thehive-incidenthanteringsplattform-installation-2026/)
- TheHive 3 and 4 are no longer maintained or distributed (StrangeBee, July 2025). The last open-source (AGPL) TheHive release was 4.1.24 (Sep 2022). Repo archival dates conflict (25 Jul 2025 per Wiz vs 5 Dec 2025 per the NHI guide) — [Wiz](https://www.wiz.io/academy/thehive-overview); [NHI guide](https://nhimg.org/thehive-and-cortex-guide)
- **Cortex** (analyzers/responders) remains **AGPL**, with no licence key needed — [NHI guide](https://nhimg.org/thehive-and-cortex-guide)
- **Tracecat**: AGPL-3.0 main repo — [TracecatHQ/tracecat](https://github.com/TracecatHQ/tracecat). About 3.7k stars and active development as of mid-2026 — [BrightCoding, Sep 2026](https://blog.brightcoding.dev/2026/09/10/tracecathqtracecat-open-source-security-automation-for-ai-agents-and-teams). An aggregator reports release 1.0.0-beta.50 (29 Jun 2026), enterprise features in a separate non-OSS package, and a Helm chart under PolyForm Shield. All single-sourced; verify — [ecosyste.ms](https://awesome.ecosyste.ms/projects/github.com%2FTracecatHQ%2Ftracecat)
- Tracecat positions itself as an OSS alternative to Tines/Splunk SOAR, launched 2024 — [Help Net Security](https://www.helpnetsecurity.com/2024/04/30/tracecat-open-source-automation-platform-soar/)
- **Shuffle**: OpenAPI-based, 11,000+ endpoints, 200+ prebuilt apps. Vendor support is not included in the OSS licence — [AIMultiple](https://aimultiple.com/de/open-source-soar). Licence AGPL-3.0 **[TK]** (not confirmed this session) — [Shuffle GitHub](https://github.com/Shuffle/Shuffle). Shuffle has a "User input" trigger/action for human approval via email/SMS/UI **[TK]**.
- **n8n**: Sustainable Use License (fair-code, created 2022), **not OSI open source**. Use is limited to internal business or non-commercial purposes; anything else needs a commercial agreement. `.ee.` files fall under the n8n Enterprise License — [n8n docs: SUL](https://docs.n8n.io/n8n-community-license/sustainable-use-license); [n8n licence page](https://docs.n8n.io/n8n-community-license)
- **StackStorm**: Linux Foundation project, Apache-2.0. Has Inquiries (`core.ask`) to pause a workflow for human response, plus a REST API and ChatOps **[TK]** — [StackStorm docs: Inquiries](https://docs.stackstorm.com/inquiries.html)

### Inferences
- Lateralis's response agent should **not** depend on any SOAR's internals. Expose a Lateralis "playbook action" interface (propose → human approve in Lateralis UI → execute via SOAR webhook/API), and ship adapters for Shuffle, Tracecat, and generic webhooks. Approval lives in Lateralis, so the audit trail is in one place.
- Bundle Shuffle or Tracecat only in an optional `--profile soar`. Each pulls in Postgres/OpenSearch/Temporal-style dependencies and several GB of RAM. A built-in minimal executor (SSH/WinRM/firewall API calls) is enough for the laptop demo.
- AGPL is fine for running unmodified as a separate service. If Lateralis forks and modifies Tracecat/Shuffle and offers it over a network, source disclosure applies.

### Gaps
- Shuffle's licence and current release cadence were not confirmed live. Tracecat's 2026 RAM footprint and its exact approval/"human-in-the-loop" API were not fetched.
- Whether n8n's SUL permits bundling an unmodified n8n in a commercially sold on-prem product was not answered authoritatively (likely not without a commercial agreement).

---

## 5. Detection content: ATT&CK, Sigma, Atomic Red Team

### Takeaway
Use **ATT&CK STIX 2.1** from `mitre-attack/attack-stix-data` via `mitreattack-python` for technique metadata, **Sigma rules + pySigma** (convert to the backend query language, or evaluate in Python against OCSF/ECS-mapped events) for labelling, and **Atomic Red Team** test GUIDs as ground-truth generators. All are free, with clear licences [TK].

### Cited Findings (mostly [TK]; canonical sources listed)
- ATT&CK content is distributed as STIX 2.1 bundles in `mitre-attack/attack-stix-data`, and `mitreattack-python` provides query helpers (techniques by tactic, data components, mitigations). ATT&CK terms of use allow free use with attribution **[TK]** — [attack-stix-data](https://github.com/mitre-attack/attack-stix-data); [mitreattack-python](https://github.com/mitre-attack/mitreattack-python)
- Relevant techniques: T1021 Remote Services (.001 RDP, .002 SMB/Admin Shares, .004 SSH, .006 WinRM); T1550 Use Alternate Authentication Material (.002 Pass-the-Hash, .003 Pass-the-Ticket); T1078 Valid Accounts (.002 Domain, .003 Local); T1003 OS Credential Dumping (.001 LSASS, .003 NTDS, .006 DCSync); T1558 Steal/Forge Kerberos Tickets (.003 Kerberoasting) **[TK]** — [ATT&CK Lateral Movement tactic TA0008](https://attack.mitre.org/tactics/TA0008/)
- Sigma rule content is licensed under the Detection Rule License (DRL) 1.1 (attribution required); pySigma is LGPL-2.1 with backends (Elasticsearch/OpenSearch, Splunk, etc.) and processing pipelines for field mapping **[TK]** — [SigmaHQ/sigma](https://github.com/SigmaHQ/sigma); [pySigma](https://github.com/SigmaHQ/pySigma)
- Atomic Red Team (Red Canary, MIT) has YAML atomics per technique with Linux/macOS/Windows executors. `Invoke-AtomicRedTeam` is the PowerShell runner (PowerShell 7 runs on Linux). Caldera's `atomic` plugin imports atomics as abilities **[TK]** — [atomic-red-team](https://github.com/redcanaryco/atomic-red-team); [Invoke-AtomicRedTeam](https://github.com/redcanaryco/invoke-atomicredteam)
- Linux-runnable lateral-movement atomics exist for T1021.004 (SSH) and T1078.003, and T1003.008 (/etc/shadow) for credential access. Most T1550.* and T1003.001 atomics are Windows-only **[TK]** — [atomics index](https://github.com/redcanaryco/atomic-red-team/tree/master/atomics)

### Inferences
- Label pipeline: each lab run records (atomic GUID / Caldera operation ID → ATT&CK technique → start/end timestamps → hosts). Join to OCSF events by time window and host to produce supervised labels for evaluation. That is more defensible than heuristic labelling.
- Sigma is best used as a *baseline comparator* ("rule-based detection fired at t=X; Lateralis forecast at t=X−Δ"), which gives a strong demo/evaluation story.

### Gaps
- No current (2026) ATT&CK version number (v17/v18?) or Sigma release was verified this session.

---

## 6. Red-team emulation lab: what is feasible in pure Docker on 16 GB RAM?

### Takeaway
Feasible on 16 GB: **Samba AD DC container + 2–4 Linux "workstations/servers" (SSH, Samba file share/SMB, web, Postgres/MySQL) + Zeek sensor + Caldera server with Sandcat agents + Vector**, about 4–6 GB total. Attack chains would be: SSH key/password reuse, Kerberos (kinit/TGT/TGS via Samba KDC), SMB share access/psexec-like via impacket, DCSync against Samba with impacket `secretsdump`, Kerberoasting with impacket `GetUserSPNs`. You **cannot** get genuine Windows 4624/4648/4769 or Sysmon telemetry without Windows VMs. Samba's JSON audit log provides **Windows-style eventId/logonType** for auth, password-change, and group-change events, which partially bridges the gap. GOAD/Ludus/DetectionLab are VM-based and won't fit alongside the platform on 16 GB.

### Cited Findings
**Caldera**
- Caldera now lives under the **`apache/` GitHub org**, licensed **Apache-2.0**, with source tarballs named `apache-caldera-x.x.x-incubating-src.tar.gz` and a `DISCLAIMER-WIP` file, which suggests Apache Incubator status (not stated explicitly). 7.5k stars — [apache/caldera](https://github.com/apache/caldera)
- Docker: `docker run -p 8888:8888 ghcr.io/apache/caldera:latest`, or build with `--build-arg VARIANT=full|slim` (slim fetches emu/atomic plugin files on demand). **Recommended 8 GB+ RAM, 2+ CPUs** — [apache/caldera](https://github.com/apache/caldera)
- 17 default plugins: Access, Atomic, Builder, Caldera for OT, Compass, Debrief, Emu, Fieldmanual, GameBoard, Human, Magma (Vue UI), Manx, Response, Sandcat (default agent), SSL, Stockpile, Training — [apache/caldera](https://github.com/apache/caldera)
- Latest release seen: 5.3.0 (24/25 Apr 2025); later docs mention v5.4.0+. No 2026 release announcement was found — [Qiita](https://qiita.com/shiracamus/items/658ea3e5b28fa5ae3245); [gitpedia mirror](https://gitpedia.pages.dev/wiki/apache/caldera); [Caldera v5 announcement](https://medium.com/@mitrecaldera/announcing-mitre-caldera-v5-06798b928adf)
- Sandcat is a Go agent with Linux/macOS/Windows builds and a one-line curl deploy from the Caldera server **[TK]**. Caldera's "8 GB+" recommendation is generous. In practice the server is a Python aiohttp app (likely 0.5–1 GB) (inference).

**DetectionLab** — **unmaintained**: "no longer being actively maintained or developed" (since 2023-01-01). Uses default Vagrant creds — [cybersectools: DetectionLab](https://cybersectools.com/tools/detection-lab). A community fork, **DetectionLabRevamped**, updates to Windows Server 2022/Win 11/Ubuntu 24.04 (VMware 17.6) — [hasamba/DetectionLabRevamped](https://github.com/hasamba/DetectionLabRevamped)

**GOAD / Ludus**
- GOAD (Orange Cyberdefense) is an offensive AD lab of Windows VMs, deployable on VirtualBox/VMware/Proxmox/Ludus (`./goad.sh -p ludus`) — [GOAD docs: Ludus provider](https://orange-cyberdefense.github.io/GOAD/providers/ludus); [GOAD Linux install](https://orange-cyberdefense.github.io/GOAD/installation/linux)
- Ludus requires a **dedicated Debian 12 host** and "will completely take over the machine". It should not be used for other tasks such as Docker — [Ludus GOAD guide](https://docs.ludus.cloud/docs/environment-guides/goad)
- DreadGOAD fork: multi-provider (VirtualBox, VMware, Proxmox, AWS, Azure, Ludus) — [DreadGOAD mirror](https://mymirror.duckdns.org/dreadnode/DreadGOAD)
- Elastic Security Labs documented automating GOAD for detection-engineering labs — [Elastic Security Labs](https://www.elastic.co/security-labs/automating-goad-and-live-malware-labs)
- GOAD full (5 Windows VMs) needs roughly 24 GB+ RAM; GOAD-Light (3 VMs) is around 16–20 GB **[TK]**. Neither fits beside the platform on a 16 GB laptop (inference).

**Infection Monkey** (Akamai/Guardicore) is still listed by Akamai as a free open-source breach-and-attack-simulation tool (pages current in 2026). No deprecation evidence found, but GitHub release activity was not checked — [Akamai Infection Monkey](https://www.akamai.com/products/akamai-guardicore-segmentation/infection-monkey). It propagates via SSH/SMB/exploits and is a reasonable "self-propagating worm" scenario. Licence GPLv3 **[TK]**.

**Stratus Red Team** (DataDog, Apache-2.0) covers cloud (AWS/Azure/GCP/K8s) attack techniques only, so it is not relevant to the on-prem AD lab **[TK]** — [Stratus Red Team](https://github.com/DataDog/stratus-red-team)

**Samba AD telemetry** (key finding)
- Enable with `log level = 1 auth_audit:3 auth_json_audit:3` in `[global]`. JSON requires Samba built with jansson. Level 2 = auth failures, 3 = successes, 4 = authorization, 5 = anonymous — [Samba wiki: Setting up Audit Logging](https://wiki.samba.org/index.php/Setting_up_Audit_Logging)
- **The KDC on a Samba DC logs Kerberos authentication events; a Samba domain member cannot** — [Samba wiki: Setting up Audit Logging](https://wiki.samba.org/index.php/Setting_up_Audit_Logging)
- JSON Authentication events include `eventId` (a Windows event ID), `logonType` (2 Interactive / 3 Network / 8 NetworkCleartext), `serviceDescription` (e.g. LDAP, SMB2, NETLOGON), `authDescription` (simple bind, bare-NTLM, interactive, network, KDC "Unknown Pre-authentication"...), `passwordType` (HMAC-SHA256, NTLMv2, arcfour-hmac-md5), `status` (NT_STATUS_OK / WRONG_PASSWORD / NO_SUCH_USER...), `remoteAddress`, `clientAccount`, `clientDomain`, `workstation`, `becameAccount`, `becameSid`, `logonId`, `duration` — [Samba wiki: Interpreting JSON Audit Logs](https://wiki.samba.org/index.php/Interpreting_JSON_Audit_Logs)
- `passwordChange` events carry eventId **4723/4724**. `groupChange` events carry **4728/4729/4732/4733/4746/4747/4751/4752/4756/4757/4761/4762**. `dsdbChange` logs LDAP directory modifications — [Samba wiki: Interpreting JSON Audit Logs](https://wiki.samba.org/index.php/Interpreting_JSON_Audit_Logs)
- Known issue: one user reported that after upgrading to Samba 4.15.2, auth_json_audit stopped logging authentication (only authorization) — [samba mailing list 2021-11](https://lists.samba.org/archive/samba/2021-November/238734.html)
- For network-level Kerberos/SMB visibility independent of host logs, Zeek's kerberos/ntlm/smb logs apply (see §1) — [Zeek SMB logs](https://docs.zeek.org/en/master/logs/smb.html)

### Inferences
- Proposed 16 GB lab (`--profile lab`), with estimates (not measured):
  - `dc1`: Samba 4 AD DC (e.g., an Alpine/Debian Samba image), roughly 300–500 MB
  - `ws1`,`ws2`: Debian + sshd + `realmd`/`sssd`/winbind domain-joined + Sandcat, about 100–200 MB each
  - `fs1`: Samba member file server (SMB shares)
  - `web1`: vulnerable web app (e.g., DVWA), `db1`: Postgres/MySQL with reused creds
  - `attacker`: Kali-slim/impacket + Caldera server (about 1 GB)
  - `zeek`: sensor on the lab bridge network (needs `network_mode` / a mirror; on Docker you can run Zeek in the same network namespace as a router container or capture on the bridge from a privileged container)
  - `vector`: tails Samba JSON audit, sshd/auth.log, Zeek JSON, and writes OCSF to Parquet
  - Total is about 4–6 GB, leaving room for the Lateralis API + T-GNN + LLM (the LLM should be remote/API or a small quantised model).
- Attack chain using Linux tooling (impacket, kinit, smbclient, ssh, crackmapexec/NetExec): password spray against DC (4625-style failures) → valid-account SSH to ws1 (T1078/T1021.004) → harvest keytab/ccache or creds → Kerberoast (T1558.003) → SMB to fs1 (T1021.002) → DCSync against Samba (T1003.006) → pass-the-hash/ticket to other hosts (T1550.002/.003, via impacket). Each step emits Samba JSON auth (with eventId/logonType), Zeek kerberos/ntlm/smb/ssh, and sshd logs.
- Realism caveat: Samba JSON uses Windows-like event IDs, but it does not reproduce the full Windows schema (no 4648, no distinct 4768 vs 4769 split, no 4672 special privileges). It was not confirmed whether Kerberos TGS requests produce separate events. Present the lab as a "Linux/Samba AD lab", and pair it with public Windows datasets (LANL, OTRF Security-Datasets/Mordor) for Windows-native evaluation.
- For Windows realism, document an *optional* "GOAD on a separate Proxmox/Ludus box" path, and do not bundle it.

### Gaps
- No ready-made, maintained "Docker AD lateral-movement lab" project was found in this session's searches. SecGen status was not checked.
- Samba Kerberos TGS-level audit events and the exact `serviceDescription` string for KDC events (likely "Kerberos KDC") were not confirmed.
- Whether Caldera's Sandcat-on-Linux plus Samba gives usable "lateral movement" abilities out of the box (vs custom abilities) was not verified.
- Actual container RAM numbers are estimates. Measure with `docker stats` during a lab run.

---

## 7. Threat intel: MISP / OpenCTI

### Takeaway
Overkill for the core product and the laptop demo. Lateralis's value is internal lateral movement, where external IOCs add little. At most, offer an optional MISP/OpenCTI *connector* (pull IOCs to tag IPs/hashes as node features), not a bundled instance.

### Cited Findings ([TK] — not re-fetched)
- MISP: AGPL-3.0, PHP/MySQL/Redis, official Docker images (`misp-docker`), REST API and PyMISP **[TK]** — [MISP](https://www.misp-project.org/); [misp-docker](https://github.com/MISP/misp-docker)
- OpenCTI (Filigran): Community Edition Apache-2.0, plus a separately licensed Enterprise Edition. Its stack needs Elasticsearch/OpenSearch, Redis, RabbitMQ, MinIO, and workers. Filigran recommends ≥16 GB RAM for a full deployment **[TK]** — [OpenCTI docs](https://docs.opencti.io/latest/deployment/installation/)

### Inferences
- OpenCTI alone could consume the whole 16 GB laptop, so exclude it. MISP is lighter (about 2–4 GB) but still optional; a STIX/TAXII or MISP-feed importer job is enough.

### Gaps
- Current 2026 OpenCTI/MISP RAM guidance and licence-edition boundaries were not verified this session.

---

## 8. Packaging: Compose profiles, health checks, how comparable OSS security products ship

### Takeaway
Follow the pattern used by Wazuh (single-node vs multi-node compose dirs + cert generator container), BloodHound CE (CLI wrapping Compose, localhost-bound by default), Caldera (full/slim image variants), and TheHive/Shuffle (one compose with Postgres/OpenSearch). For Lateralis: **one `docker-compose.yml` with profiles** (`core` default; `lab`, `wazuh`, `soar`, `bloodhound`, `ti` opt-in), healthchecks with `depends_on: condition: service_healthy`, localhost binding by default, and a `.env` with generated secrets.

### Cited Findings
- BloodHound CE: the recommended install is a CLI that wraps Docker Compose. The default compose binds to 127.0.0.1, and exposing it requires an explicit change — [BloodHound CE quickstart](https://bloodhound.specterops.io/get-started/quickstart/community-edition-quickstart)
- Caldera ships `full` vs `slim` image variants. The slim variant downloads plugin payloads on demand. Prebuilt image on GHCR — [apache/caldera](https://github.com/apache/caldera)
- Wazuh documents single-node Docker deployment with explicit host prerequisites (6–8 GB) — [Wazuh 5.0-beta Docker](https://documentation.wazuh.com/5.0-beta/deployment-options/docker/wazuh-container.html)
- Docker Compose `profiles:` (services only start when their profile is enabled via `--profile` or `COMPOSE_PROFILES`), `healthcheck:`, and `depends_on.condition: service_healthy` are standard Compose spec features **[TK]** — [Compose profiles docs](https://docs.docker.com/compose/how-tos/profiles/); [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)

### Inferences
- Suggested profiles and rough RAM:
  - `core` (default): lateralis-api (FastAPI) + worker (T-GNN inference) + Postgres/AGE + DuckDB volume + Vector + UI, about 2–3 GB
  - `lab`: Samba DC + Linux hosts + Zeek + Caldera + attacker, about 4–6 GB
  - `bloodhound`: BloodHound CE (+ its Neo4j/Postgres), about 2–3 GB
  - `soar`: Shuffle or Tracecat, about 2–4 GB
  - `wazuh`: Wazuh single-node, about 6–8 GB (mutually exclusive with `lab` on 16 GB)
  - `ti`: MISP, about 2–4 GB
- `core` + `lab` fits on 16 GB. `core` + `lab` + `bloodhound` is likely tight but feasible. Adding `wazuh` is not feasible.
- The pip package should run `core` without Docker (DuckDB + NetworkX + optional SQLite), so data scientists can run the forecaster on exported logs.
- Licence hygiene: keep AGPL/GPL components (Shuffle, Tracecat, Neo4j CE, Wazuh, Velociraptor, MISP) as unmodified, separately pulled images. Don't vendor their code into Lateralis. Ship a `THIRD_PARTY_LICENSES` file. This keeps Lateralis's own licence choice (e.g., Apache-2.0 or a source-available licence) unconstrained.

### Gaps
- No primary-source survey of how 2025–2026 OSS security products structure their compose files was done (inferences draw on known patterns).
- Docker Desktop on Windows (WSL2) memory caps (the `.wslconfig` default is 50% of host RAM, about 8 GB on a 16 GB laptop **[TK]**) materially affect the "16 GB" budget and should be documented for demo users.
