# Real, Labeled Datasets for Lateralis (Temporal GNN Lateral-Movement / Attack-Path Forecasting)

Research date: 2026-11-21. Method: WebSearch/WebFetch only (no Firecrawl/Apollo). Where a PDF could not be read by WebFetch, its text was extracted locally from the downloaded arXiv/author PDF and quoted.

---

## Q1. Per-dataset catalogue: contents, size, labels, path reconstructability, access, licence

### Takeaway
Only two public datasets are standard benchmarks for graph-based lateral-movement (LM) detection: **LANL 2015 "Comprehensive, Multi-Source Cyber-Security Events"** (real enterprise, user+computer auth logs, red-team labels) and **DARPA OpTC** (synthetic 1,000-host enterprise, ~1 TB, *no event-level labels*). LANL 2015 matches Lateralis's existing `(time, user, src, dst)` format almost exactly. Flow-based NIDS datasets (CICIDS2017, CSE-CIC-IDS2018, UNSW-NB15, NetFlow v2/v3) are free and labeled per-flow but are machine-only, and their attacks are mostly DoS/brute-force/scan, not multi-hop LM. LMDG (2025) is the newest purpose-built Windows/AD LM dataset with multi-hop attacks.

### Cited Findings

#### LANL 2015 — Comprehensive, Multi-Source Cyber-Security Events
- 58 consecutive days of de-identified events from LANL's internal corporate network; 1,648,275,307 events, 12,425 users, 17,684 computers, 62,974 processes; ~12 GB compressed total — [LANL cyber1](https://csr.lanl.gov/data/cyber1/)
- Files (compressed): auth.txt.gz 7.2 GB, proc.txt.gz 2.2 GB, flows.txt.gz 1.1 GB, dns.txt.gz 177 MB, redteam.txt.gz 4.8 KB — [LANL cyber1](https://csr.lanl.gov/data/cyber1/)
- auth.txt uncompressed is 69 GB ("the full 69 GB auth.txt file is split into chunks, which each hold 10,000 seconds (approximately 3 hours) of logs") — [Euler, King & Huang, ACM TOPS 2023](https://isaiahjking.com/papers/EulerACM.pdf)
- auth.txt fields: time, source user@domain, destination user@domain, source computer, destination computer, authentication type, logon type, authentication orientation, success/failure; time is in seconds starting at epoch 1 (real dates withheld); "?" for missing; failures only included for users who had at least one success — [LANL cyber1](https://csr.lanl.gov/data/cyber1/)
- redteam.txt: lines of `time, user@domain, source computer, destination computer`, "specific events taken from the authentication data that present known redteam compromise events" — [LANL cyber1](https://csr.lanl.gov/data/cyber1/)
- ~1.05 billion authentication events; only 0.0000713% of events flagged malicious — [Kushwaha et al., Deloitte, arXiv 2208.13524](https://arxiv.org/pdf/2208.13524)
- Red-team activity ends on day 30 — [Larroche 2026, arXiv 2607.29390](https://arxiv.org/pdf/2607.29390)
- All labeled malicious authentications belong to one single simulated intrusion; "almost all of them come from the same source host (C17693)"; the official description warns labels are only a subset of red-team-related events — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- After Larroche's recommended preprocessing (all remote LogOn events, test = everything after first 41 h): 16,159 nodes, 369,569,626 events, 702 malicious events — [Larroche 2026, Table 4](https://arxiv.org/pdf/2607.29390)
- Access: submit e-mail + intended use on the web form; licence CC0 1.0; cite A. D. Kent, doi:10.17021/1179829 — [LANL cyber1](https://csr.lanl.gov/data/cyber1/)
- Path reconstructability: redteam.txt gives `(time, user, src, dst)` tuples, so a time-ordered chain/tree of compromised hosts can be rebuilt (centred on C17693) — inferred from the file format at [LANL cyber1](https://csr.lanl.gov/data/cyber1/) and the single-source observation in [Larroche 2026](https://arxiv.org/pdf/2607.29390)

#### LANL 2017/2018 — Unified Host and Network Data Set
- About 90 days; NetFlow from many internal routers (CSV, 11 fields: Time, Duration, SrcDevice, DstDevice, Protocol, SrcPort, DstPort, SrcPackets, DstPackets, SrcBytes, DstBytes) plus Windows host event logs (JSON, one record per line) including auth events 4624, 4625, 4768, 4769, process 4688/4689, system 4608/4609; one file per day (`netflow_day-XX.bz2`, `wls_day-XX.bz2`) — [LANL 2017](https://csr.lanl.gov/data/2017/)
- Netflow covers 89 days because day 1 is missing; flows are Cisco NetFlow v9 from core routers; host logs from "the majority of LANL's computers that run the Microsoft Windows operating system" — [Turcotte, Kent & Hash, arXiv 1708.07518](https://ar5iv.arxiv.org/html/1708.07518)
- **No red-team / malicious labels** are mentioned on the dataset page or in the paper — [LANL 2017](https://csr.lanl.gov/data/2017/); [arXiv 1708.07518](https://ar5iv.arxiv.org/html/1708.07518)
- Access: e-mail + intended-use form; CC0 1.0; cite Turcotte, Kent & Hash, *Data Science for Cyber-Security*, World Scientific 2018 — [LANL 2017](https://csr.lanl.gov/data/2017/)

#### DARPA OpTC (Operationally Transparent Cyber)
- About 1 TB of compressed JSON (eCAR format); testbed scaled to 1,000 hosts but data collected from 500 hosts because of storage limits; benign period then red-team malware injection over "two weeks"; ground truth is `OpTCRedTeamGroundTruth.pdf` written by the red team (Provatek); data is on Google Drive (`ecar`, `ecar-bro`, `bro` folders with `benign`/`evaluation`/`short` subfolders); released "Distribution A: Approved for public release: distribution unlimited", as-is — [FiveDirections/OpTC-data](https://github.com/FiveDirections/OpTC-data)
- Euler paper: "1.1TB data set contains 17.4 billion events", 4 benign days + 3 attack-campaign days; Euler uses only FLOW objects with START action → 1,114 nodes, 7,773,514 events, 21,872 anomalous edges, 7 days — [Euler TOPS 2023, §9.1/Table 8](https://isaiahjking.com/papers/EulerACM.pdf)
- Red-team days are 23, 24, 25 Sep 2019; IEEE DataPort says clients varied from 500 to 1,000 — [arXiv 2103.03080 via search](https://arxiv.org/pdf/2103.03080.pdf); [IEEE DataPort](https://ieee-dataport.org/open-access/operationally-transparent-cyber-optc)
- Larroche: first six days (17–22 Sep) benign, last three days (23–25 Sep) one attack scenario each; "network logs only record flows between internal and external hosts", so LM must be taken from FLOW-START events in host logs; system logs exist only for 500 workstations (no servers); each host has 3 IPv4 interfaces (142.20.56.0/21, 10.20.0.0/16, 10.50.0.0/16) + link-local IPv6 → six addresses per host — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- **No event-level labels**: only a high-level red-team report with indicators (hostnames, IPs, PIDs) — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Labeling choices give wildly different malicious counts: host-based ≈25,000 flows; process-based (Majorczyk et al.) 563 (15 LM-related); Larroche hybrid/manual 1,359 (249 LM-related); after dedup 897 nodes, 36,227,823 events, 1,354 malicious (244 LM) — [Larroche 2026, Tables 3–4](https://arxiv.org/pdf/2607.29390)
- Larroche releases preprocessing + labels code at github.com/cl-anssi/LMDEval — [Larroche 2026](https://arxiv.org/pdf/2607.29390)

#### DARPA Transparent Computing (E3 / E5)
- E5 ran May 2019, "the last of five planned engagement exercises"; TA1 performers cadets, clearscope, fivedirections, marple, theia, trace (each on three host platforms); Avro binary in CDM schema (converter to JSON provided); ground truth `tc_ground_truth_report_e5_update.pdf`; data hosted on Google Drive by Five Directions; DARPA released "in the public domain", as-is — [darpa-i2o/Transparent-Computing](https://github.com/darpa-i2o/Transparent-Computing)
- Orthrus (USENIX Security 2025) evaluates on six DARPA TC datasets with node-level ground truth it open-sources, criticising neighbourhood-style labeling that over-counts attack nodes — [Orthrus, USENIX Sec 2025](https://www.usenix.org/conference/usenixsecurity25/presentation/jiang-baoxiang)
- TC data is single-host whole-system provenance (process/file/socket), not enterprise user→computer auth — inferred from the CDM/performer description at [darpa-i2o/Transparent-Computing](https://github.com/darpa-i2o/Transparent-Computing)

#### CICIDS2017
- 5 days, Mon 3 Jul – Fri 7 Jul 2017 (Monday benign only); attacks: FTP/SSH-Patator, DoS (slowloris, Slowhttptest, Hulk, GoldenEye), Heartbleed, web attacks, infiltration (Dropbox download, Meta exploit, portscan from Vista), Botnet ARES, port scan, DDoS LOIT — [UNB CIC IDS2017](https://www.unb.ca/cic/datasets/ids-2017.html)
- Topology: 4 attacker machines, 12 victim machines, 1 DC/DNS; formats: full PCAPs, labeled flows, MachineLearningCSV (80+ CICFlowMeter features); PCAP sizes Mon 11.0 GB, Tue 11 GB, Wed 13 GB, Thu 7.8 GB, Fri 8.3 GB (~51 GB total, my sum); "publicly available for researchers", cite Sharafaldin et al. ICISSP 2018; no explicit licence — [UNB CIC IDS2017](https://www.unb.ca/cic/datasets/ids-2017.html)

#### CSE-CIC-IDS2018
- Attack sessions 14 Feb – 2 Mar 2018; attacker infrastructure 50 machines; victim org 5 departments, 420 machines + 30 servers; 7 scenarios incl. "Infiltration from inside" (malicious doc → backdoor → internal scan → exploit other machines), which is the only LM-like scenario; per-machine PCAPs, Windows/Ubuntu event logs, and CSVs of 80+ CICFlowMeter-V3 features — [UNB CIC IDS2018](https://www.unb.ca/cic/datasets/ids-2018.html)
- Access: `aws s3 sync --no-sign-request --region <region> "s3://cse-cic-ids2018/" dest-dir` (no AWS credentials, **not requester-pays**); redistribution allowed with citation + link to registry.opendata.aws/cse-cic-ids2018 — [UNB CIC IDS2018](https://www.unb.ca/cic/datasets/ids-2018.html)

#### UNSW-NB15
- 2,540,044 records across four CSV files (UNSW-NB15_1…_4) plus ground-truth file and train/test partition; free for academic research; cite Moustafa & Slay 2016 — [UNSW project page](https://research.unsw.edu.au/projects/unsw-nb15-data-set)
- Feature count reported as 42 (excluding labels) by one review, conflicting with the commonly quoted 49 — [arXiv 2506.02438](https://arxiv.org/pdf/2506.02438)

#### NetFlow NIDS datasets (UQ, Sarhan/Layeghy/Portmann)
- v3 (53 features incl. temporal): NF-UNSW-NB15-v3 2,365,424 flows (5.4% attack); NF-ToN-IoT-v3 27,520,260 (38.98%); NF-BoT-IoT-v3 16,993,808 (99.7%); NF-CSE-CIC-IDS2018-v3 20,115,529 (12.93%) — [UQ NIDS datasets](https://staff.itee.uq.edu.au/marius/NIDS_datasets/)
- v2 (43 features): NF-UNSW-NB15-v2 2,390,275 (3.98%); NF-ToN-IoT-v2 16,940,496 (63.99%); NF-BoT-IoT-v2 37,763,497 (99.64%); NF-CSE-CIC-IDS2018-v2 18,893,708 (11.95%); NF-UQ-NIDS-v2 75,987,976 (66.88%) — [UQ NIDS datasets](https://staff.itee.uq.edu.au/marius/NIDS_datasets/)
- Free CSV download via rdm.uq.edu.au; page lists no file sizes or licence; v3 citation is Luay et al., arXiv:2503.04404 (2025) — [UQ NIDS datasets](https://staff.itee.uq.edu.au/marius/NIDS_datasets/)

#### OTRF Security-Datasets (formerly Mordor)
- Project of "malicious and benign datasets, from different platforms"; repo folders `datasets`, `docs`, `scripts`; documentation at securitydatasets.com; licence shown inconsistently (GPL-3.0 heading vs MIT sidebar) — [OTRF/Security-Datasets](https://github.com/OTRF/Security-Datasets)
- A related (non-OTRF) APT29-inspired lab dataset on Zenodo (2 Windows clients, 1 Windows server, 1 Linux host, 1 router; APT29 Day 1 steps 1–10) is ~31.7 MB of JSON Windows events — [Zenodo 5547862](https://zenodo.org/record/5547862)

#### LMDG (Lateral Movement Dataset Generator), 2025
- 25 days (10 Oct – 3 Nov 2024; attacks 23 Oct – 1 Nov); 25 VMs, 22 user accounts; 944 GB uncompressed (900.93 GB PCAP + 43.38 GB system logs); 253 GB compressed without router data, 527 GB with; 35 multi-stage LM attacks, <1% malicious events; techniques Pass-the-Hash, AS-REP roasting, Pass-the-Ticket, delegation abuse, password spray, Silver/Golden Ticket; attacks up to **7 hops**; labels via Process Tree Labeling (Windows events 4688, 5156 + PCAP); code/data at github.com/WASPLab/LMTrace; no dataset licence stated — [LMDG, arXiv 2508.02942](https://arxiv.org/html/2508.02942v1)

#### Splunk BOTS (v1/v2/v3)
- BOTSv3 ~320 MB pre-indexed Splunk archive, CC0; needs a Splunk Enterprise instance (free trial works); Q&A by e-mail; BOTSv2 16.4 GB full / 3.2 GB attack-only; BOTSv1 6.1 GB pre-indexed or 11.3 GB JSON (~120 GB uncompressed) — [splunk/botsv3](https://github.com/splunk/botsv3); [Splunk blog](https://www.splunk.com/en_us/blog/security/botsv3-dataset-released.html) (v1/v2 sizes from search snippets of [botsv1](https://github.com/splunk/botsv1), [botsv2](https://github.com/splunk/botsv2), not opened directly)

#### ATLASv2 (2024)
- Replicates 10 ATLAS attack scenarios with Sysmon + Carbon Black Cloud logging; 4 benign days + 1 attack day; two Windows 7 32-bit VMs; malicious events labeled by EventRecordID; attacks share common steps so poor for multi-class supervision; public at bitbucket.org/sts-lab/atlasv2 — [ATLASv2, arXiv 2401.01341](https://arxiv.org/pdf/2401.01341)

#### Newer (2023–2026) APT / LM datasets found
- **Unraveled (2023)**: semi-synthetic APT dataset on a real cloud-hosted network; ~6 weeks in 2021, 27+ machines; recon/foothold/lateral-movement stages labeled with MITRE technique and stage; host logs (filebeat, Windows events) — [COMIDDS Unraveled](https://fkie-cad.github.io/COMIDDS/content/datasets/unraveled); [XJTLU record](https://scholar.xjtlu.edu.cn/en/publications/unraveled-a-semi-synthetic-dataset-for-advanced-persistent-threat/)
- **CICAPT-IIoT2024**: provenance-based APT dataset, 20+ techniques in 8 tactics (APT29-inspired), CSV labeled nodes/edges (Process, Artifact), LM via SSH remote services (T1021) — [arXiv 2407.11278](https://arxiv.org/html/2407.11278v1); [UNB CIC IIoT 2024](https://www.unb.ca/cic/datasets/iiot-dataset-2024.html)
- **DAPT 2020**: network-traffic APT dataset with recon, foothold, lateral movement, exfiltration phases — [DAPT MLHat2020](https://sailik1991.github.io/files/DAPT_at_MLHat2020.pdf)
- **S-DAPT-2026**: synthetic stage-aware APT dataset (Jan 2026) — [arXiv 2601.06690](https://arxiv.org/html/2601.06690v1)
- **Pivoting** (real network flows, only legitimate pivoting labeled, no malicious LM) and **PicoDomain** (synthetic, six hosts) — both judged unsuitable as large-scale LM benchmarks — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- **Hopper (USENIX Sec 2021)** evaluated on "a 15-month enterprise dataset consisting of over 780 million internal logins" with 300+ attack scenarios incl. one red-team attack — [arXiv 2105.13442](https://arxiv.org/abs/2105.13442)

### Inferences
- Comparison summary (derived from the cited rows above):

| Dataset | Real/synthetic | User→computer auth? | LM labels | Multi-hop path recoverable? | Size (compressed) | Access / cost |
|---|---|---|---|---|---|---|
| LANL 2015 | Real enterprise | **Yes** (src/dst user + src/dst computer) | redteam.txt (subset, one intrusion) | Yes, from (time,user,src,dst) | ~12 GB (auth 7.2 GB; 69 GB raw) | Free, e-mail form, CC0 |
| LANL 2017 | Real enterprise | Yes (4624/4768/4769 in wls) | **None** | No | not stated | Free, e-mail form, CC0 |
| OpTC | Synthetic 500/1000 hosts | Partial (host logs; FLOW-START hosts) | None at event level; red-team PDF; Larroche/Majorczyk derived labels | Yes, manually from red-team report | ~1 TB | Free, Google Drive, public release |
| DARPA TC E3/E5 | Synthetic, per-host provenance | No (process/file/socket) | Ground-truth reports; Orthrus/Kairos node labels | Within-host only | not stated | Free, Google Drive, public domain |
| CICIDS2017 | Synthetic lab, 12 victims | No (flows) | Per-flow by schedule (known errors) | Only infiltration day, weak | ~51 GB PCAP | Free download |
| CSE-CIC-IDS2018 | Synthetic AWS, 450 hosts | Event logs per machine exist | Per-flow by schedule | Only "infiltration" scenario | not stated | Free S3, no-sign-request |
| UNSW-NB15 / NF-* | Synthetic lab | No (flows) | Per-flow | No | CSVs | Free |
| LMDG | Synthetic AD, 25 VMs | Windows logs (4688/5156; 4624 not stated) | Process-tree labels, 35 attacks | **Yes, up to 7 hops** | 253–527 GB | Free GitHub, no licence stated |
| BOTS v1–v3 | Synthetic CTF | Windows logs incl. | CTF Q&A, not per-event | Narrative only | 0.3–16 GB | Free, CC0, needs Splunk |
| ATLASv2 | 2 Win7 VMs | No | EventRecordID | Within 2 hosts | small | Free Bitbucket |

- For Lateralis's "predict next hop" objective, LANL 2015 is the only dataset that is simultaneously real, heterogeneous user+computer, already in the project's format, small enough to stream, and with explicit (src,dst) red-team hops.

### Gaps
- Exact line count of redteam.txt: the oft-quoted "749" was **not found in any primary source**. It is consistent with 0.0000713% × ~1.05 B auth events ≈ 749 ([arXiv 2208.13524](https://arxiv.org/pdf/2208.13524)), and Larroche's filtered set has 702 malicious remote-LogOn events ([arXiv 2607.29390](https://arxiv.org/pdf/2607.29390)). Count it yourself after download (`zcat redteam.txt.gz | wc -l`). The number of compromised users/hosts in it was also not found in a citable source.
- LANL 2017 total size and host/user counts: not stated on the page or in the paper text that was reachable.
- CSE-CIC-IDS2018 total S3 size, UNSW-NB15 PCAP size (the "100 GB" figure): not confirmed.
- DARPA TC E3 size/hosting: not confirmed (only the E5 repo was read); the Kairos repo points to `DARPA/README.md` and `supplementary-material.pdf` for links, which were not read.
- OTRF dataset inventory (which compound datasets contain LM, sizes): not confirmed from the reachable page.
- Hopper's dataset is not described as public in the abstract; I assume it is private enterprise data (not verified).
- LMDG licence and whether 4624 auth events are included: not stated.

---

## Q2. Which datasets include user→computer authentication structure (heterogeneous user/computer graph) vs machine-only flows?

### Takeaway
LANL 2015 auth.txt is the clear fit (users and computers are explicit, distinct entities in every row). LANL 2017 Windows logs also carry 4624/4768/4769 auth events but have no labels. OpTC, CIC, UNSW and NetFlow datasets are effectively machine-to-machine.

### Cited Findings
- LANL 2015 auth rows contain source user@domain, destination user@domain, source computer and destination computer — [LANL cyber1](https://csr.lanl.gov/data/cyber1/)
- Entity IDs start with U (users) or C (computers), with special non-anonymised names such as TGT and DC; Euler adds a one-hot user/computer/admin type feature — but Euler itself builds a computer→computer graph — [Euler TOPS 2023](https://isaiahjking.com/papers/EulerACM.pdf)
- LANL 2017 host logs include auth event IDs 4624, 4625, 4768, 4769 — [LANL 2017](https://csr.lanl.gov/data/2017/)
- OpTC LM graphs are built from FLOW-START events between internal IPs mapped to hosts — [Larroche 2026](https://arxiv.org/pdf/2607.29390); [Euler TOPS 2023](https://isaiahjking.com/papers/EulerACM.pdf)
- CSE-CIC-IDS2018 ships per-machine Windows/Ubuntu event logs alongside flows — [UNB CIC IDS2018](https://www.unb.ca/cic/datasets/ids-2018.html)
- NetFlow v2/v3 and CICIDS2017 CSVs are flow records (IP/port/bytes features) — [UQ NIDS datasets](https://staff.itee.uq.edu.au/marius/NIDS_datasets/); [UNB CIC IDS2017](https://www.unb.ca/cic/datasets/ids-2017.html)

### Inferences
- For a heterogeneous graph on LANL 2015: node types {user, computer}; edges user→src_computer ("logs on from") and src_computer→dst_computer ("authenticates to", with user as edge attribute) or a user-mediated 3-node pattern. Lateralis's current synthetic schema (time, user, src, dst) is a strict subset of auth.txt, so only a loader change is needed.
- OpTC eCAR may contain principal/user fields on process/flow objects, which could give a weak user layer, but this was not verified.
- CSE-CIC-IDS2018's per-machine Windows event logs could in principle yield a user layer for the infiltration scenario, but no paper using them that way was found.

### Gaps
- Whether OpTC eCAR FLOW/PROCESS objects reliably carry a user principal: not verified.
- Whether LMDG's Windows logs include 4624/4769 (only 4688/5156 named): not verified.

---

## Q3. Practicality on a 16 GB-RAM, no-GPU Windows laptop + free Colab; standard windowing/subsetting

### Takeaway
LANL 2015 is feasible if streamed: auth.txt.gz is 7.2 GB compressed / 69 GB raw, but filtering to remote LogOn events and the first ~30 days (red-team window) or to the Larroche/Euler test protocol shrinks it to a few hundred million rows that can be pre-aggregated per snapshot. OpTC (~1 TB) is impractical to download whole. Use only the FLOW-START subset, ideally via the LMDEval preprocessing. Published systems ran on very large servers, so laptop-scale work must aggregate edges per snapshot.

### Cited Findings
- Euler splits auth.txt into 10,000-second (~3 h) chunks and loads snapshots in parallel; experiments ran on 2× Xeon E5-2683 v3 (28 threads each) with **512 GB RAM** — [Euler TOPS 2023](https://isaiahjking.com/papers/EulerACM.pdf)
- Euler LANL snapshot length δ = 1800 s (30 min) ("smaller time windows always lead to better results"); edge weights = sigmoid of standardized per-window authentication counts; one edge per (src,dst,snapshot) — [Euler TOPS 2023](https://isaiahjking.com/papers/EulerACM.pdf)
- Euler/Argus keep "Remote NTLM LogOn events only"; Pikachu keeps remote LogOn events only and removes computer/built-in accounts — [Larroche 2026, Table 1](https://arxiv.org/pdf/2607.29390)
- Larroche keeps all remote LogOn events: 369,569,626 events and 16,159 nodes in the evaluation set — [Larroche 2026, Table 4](https://arxiv.org/pdf/2607.29390)
- Euler on OpTC keeps only FLOW-START events: 7,773,514 events across 1,114 nodes from a 1.1 TB / 17.4 B-event dataset — [Euler TOPS 2023](https://isaiahjking.com/papers/EulerACM.pdf); Larroche's deduplicated internal-only OpTC: 36,227,823 events, 897 nodes — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Snapshot lengths studied: 360, 900, 1800, 3600 s; OpTC is typically windowed at 6 min (360 s) — [Larroche 2026, Fig. 3](https://arxiv.org/pdf/2607.29390); [Entente, arXiv 2503.14284](https://arxiv.org/pdf/2503.14284)
- Red-team activity ends on day 30, so days 31–58 are benign-only (useful for FPR estimation) — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- MLTracer discards the last 28 days and Argus the last 44 days (Argus tests on the rest of the first 14 days) — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- NF-UNSW-NB15-v3 is only 2.37 M flows, versus 20.1 M for NF-CSE-CIC-IDS2018-v3 — [UQ NIDS datasets](https://staff.itee.uq.edu.au/marius/NIDS_datasets/)

### Inferences
- Recommended LANL pipeline for 16 GB RAM: stream `auth.txt.gz` with polars `scan_csv`/pandas `chunksize` (never load whole); filter `auth_orientation == LogOn`, `src_computer != dst_computer`, success; write Parquet partitioned by day; aggregate to (snapshot, user, src, dst, count) at 1 h (Lateralis's current setting) and optionally 30 min to match Euler. Expect roughly 10^8 to 4×10^8 raw rows before aggregation (bounded by Larroche's 369.6 M). Aggregated hourly edge lists should fit on the laptop. Do the one-time filtering on Colab's disk if laptop disk is short.
- A "dev subset" that keeps the full red-team window: days 1–30 only (all red-team events are there), or days 1–14 as in Argus, for fast iteration; then report final numbers on the full Larroche protocol.
- OpTC: do not download the full 1 TB. Pull only the `ecar` evaluation-day files you need, stream-parse JSON lines keeping `object==FLOW && action==START`, or reuse cl-anssi/LMDEval output. The ~36 M-edge result is comparable in scale to a LANL subset.
- 1,114 to 16,159 nodes with one-hot features is fine on CPU for GAT+GRU at hourly snapshots. The bottleneck is per-snapshot edge count, which the snapshot aggregation reduces.

### Gaps
- No primary source found for exact row counts of LANL auth.txt after each filter step (only Larroche's final 369.6 M figure and the ~1.05 B total).
- Free Colab limits (T4, ~12 GB RAM, ~100 GB disk) were taken from the brief, not re-verified here.
- Exact sizes of individual OpTC evaluation-day files: not found.

---

## Q4. Known pitfalls: label noise, CICIDS2017 errors and fixes, temporal leakage, class imbalance

### Takeaway
LANL labels are a sparse, single-intrusion subset, so they should be used for unsupervised or self-supervised evaluation only. OpTC has no official event labels, and the common "all flows from compromised hosts" labeling inflates results. CICIDS2017/2018 have documented feature-extraction and labeling errors (Engelen et al. 2021), and corrected variants exist. Preprocessing choices (NTLM-only filtering, user subsampling, edge merging) change reported AP by orders of magnitude.

### Cited Findings
- LANL labels are only a subset of red-team events, and all belong to one intrusion. Supervised training on part of them (as MLTracer does) "leads to unrealistic detection performance", so LANL "should thus only be used to evaluate unsupervised learning methods (or detectors trained in a supervised manner on another dataset)" — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Filtering to NTLM only inflates metrics because LANL's LMs happen to use NTLM. Downsampling benign users unrealistically lowers FPR. Some malicious LANL auths involve local accounts, so dropping local/built-in/computer accounts is unjustified — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Jbeil trains on the first 85% (~49 days), even though no malicious events occur after day 30. A replication study concluded Jbeil was probably not evaluated on the original LANL labels — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- GL-GV "does not enforce a strict temporal separation" between train and test (temporal leakage) — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Edge-level metrics after merging events per snapshot change test-set size and imbalance with snapshot length. Fair comparison requires **event-level** metrics on identical test events — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Re-evaluated under fair protocol on LANL: Euler AUC 97.97 (reported 99.12), AP 0.02 (reported 5.23); Argus AUC 98.44 (99.83), AP 0.09 (32.27); Pikachu AUC 78.28 (94). On OpTC LM-only, AUCs fall to ~43–53 (near random) versus 88.8–99.7 reported — [Larroche 2026, Tables 5–6](https://arxiv.org/pdf/2607.29390)
- OpTC host-based labeling "falsely labels all legitimate traffic coming from the compromised hosts as malicious" and folds in reconnaissance. Process-based labeling misses LM flows (WMI via svchost.exe; hosts without logs) — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Euler's OpTC rule: if the source IP was in a red-team event earlier that day, mark the flow anomalous (host stays compromised for that day) — [Euler TOPS 2023](https://isaiahjking.com/papers/EulerACM.pdf)
- Extreme imbalance on LANL: 0.0000713% malicious — [arXiv 2208.13524](https://arxiv.org/pdf/2208.13524)
- CICIDS2017: Engelen, Rimmer & Joosen manually analysed the raw PCAPs and CICFlowMeter and regenerated/relabeled the dataset (IEEE SPW 2021, DOI 10.1109/SPW53761.2021.00009). Issues persist in CSE-CIC-IDS2018 — [KU Leuven LIRIAS](https://lirias.kuleuven.be/retrieve/713070); [dblp](https://dblp.uni-trier.de/rec/conf/sp/EngelenRJ21.html)
- Further work: Lanvin et al. on CICIDS2017 errors and their effect on detection — [HAL 03775466](https://hal.archives-ouvertes.fr/hal-03775466); LycoS-IDS2017 corrected version — [SciTePress 2022](https://www.scitepress.org/Papers/2022/107740/107740.pdf); Engelen-group labeling/benchmark code (CNS 2022) — [GintsEngelen/CNS2022_Code](https://www.github.com/GintsEngelen/CNS2022_Code); a 2026 paper evaluates detectors on "Corrected CIC-IDS2017" — [arXiv 2611.00713](https://arxiv.org/pdf/2611.00713)
- NetFlow datasets have unrealistic attack ratios, e.g. NF-BoT-IoT-v3 99.7% attack and NF-ToN-IoT-v2 63.99% — [UQ NIDS datasets](https://staff.itee.uq.edu.au/marius/NIDS_datasets/)
- ATLASv2: a 2025 study (Liu, Inam, Goyal, Riddle, Westfall, Bates) argues some background activity is synthetic and malicious activity conspicuous, inflating metrics (seen in search snippet only) — [STS lab](https://sts.cs.illinois.edu/papers/paper/WhatWeTalkAboutWhenW20250512.html)
- Orthrus criticises neighbourhood-style ground truth on DARPA TC that labels benign nodes sharing dependencies with attacks, causing overestimation — [Orthrus, USENIX Sec 2025](https://www.usenix.org/conference/usenixsecurity25/presentation/jiang-baoxiang)
- LMDG notes prior generators' labeling flaws: LADEMU labels all benign process events in the attack window as malicious — [LMDG](https://arxiv.org/html/2508.02942v1)

### Inferences
- For Lateralis: report AP/PR-AUC and precision@k alongside ROC-AUC (AUC near 98% coexists with AP of 0.02% on LANL). Evaluate at event level. Never train on red-team labels from the same intrusion. Freeze the split before any tuning.
- If a CIC dataset is used at all, use a corrected release (Engelen/DistriNet or LycoS) and state which one.

### Gaps
- A direct download URL for the Engelen corrected CICIDS2017/2018 was not confirmed (the EuroS&P 2022 poster said a corrected 2018 version was in preparation).

---

## Q5. Standard published splits per dataset

### Takeaway
LANL: the de facto split is "train on the first ~41 h (before the first red-team event), test on the rest", now recommended by Larroche (2026) on the full 58 days with all remote LogOn events. OpTC: benign 17–22 Sep for training, 23–25 Sep (attack days) for testing, using FLOW-START internal flows.

### Cited Findings
- LANL splits in the literature (Larroche Table 1): GL-GV train 40 benign days / test 18 days; MLTracer train first 12 days / test next 18; Pikachu train first 40 h / test rest; Euler train first 41 h / test rest; Argus train first 41 h / test rest of first 14 days; Jbeil train first 85% / test last 15% — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Euler: training set = all snapshots before the first anomalous edge; last 5% of training snapshots for classifier tuning; 5% of edges per snapshot masked for validation; δ = 30 min — [Euler TOPS 2023](https://isaiahjking.com/papers/EulerACM.pdf)
- Larroche recommendation for LANL: include all remote LogOn events; no temporal overlap; "training on the first 41 hours and testing on the rest of the dataset" (including benign days 31–58) — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- OpTC splits (Larroche Table 2): Pikachu train first 3 days / test rest (40.56 M flow-start events, 621 nodes incl. external IPs); Euler train first 4 days / test rest (7.773 M, 1,114 internal nodes); Argus train first 5 days / test rest (10.1 M, 814 nodes) — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Larroche recommendation for OpTC: internal flows only from FLOW-START, drop external/broadcast/multicast, dedupe two-ended flows, merge each host's 6 IPs into one node, keep link-local IPv6; test on 23–25 Sep — [Larroche 2026](https://arxiv.org/pdf/2607.29390)
- Entente reproduces OpTC as 6-minute windows, first 5 days train, remaining 3 days test — [Entente, arXiv 2503.14284](https://arxiv.org/pdf/2503.14284)
- Euler's NDSS'22 conference version was extended in ACM TOPS 26(3) Article 35, June 2023 (i.e., "Euler NDSS 2023" in the brief is NDSS 2022 + TOPS 2023) — [Euler search summary / TOPS DOI 10.1145/3588771](https://isaiahjking.com/papers/EulerACM.pdf)

### Inferences
- **Recommendation: primary dataset = LANL 2015 auth.txt + redteam.txt.** Use Larroche's protocol (train ≤ 41 h, test hours 41 to day 58, all remote LogOn events, event-level AUC/AP) so results compare directly with the re-evaluated Euler/Argus/Pikachu numbers. Add a secondary "Euler-compatible" result (30-min snapshots, NTLM-only) clearly labeled as such. Preprocessing: stream, filter LogOn + src≠dst, map U*/C* to user/computer node types, bucket into 1 h (and 30 min) snapshots, join redteam.txt on (time,user,src,dst) to label events. Rebuild the red-team hop sequence from redteam.txt as ground-truth "attack paths" for next-hop / top-k path evaluation. Critical assets can be approximated by DC/TGT-named nodes and high in-degree servers.
- **Secondary (cross-environment) = DARPA OpTC**, FLOW-START subset with cl-anssi/LMDEval preprocessing and its LM-specific labels (244 LM events), reporting LM-only and all-malicious metrics. It is machine-only, so the user layer is dropped or approximated.
- **Optional cross-domain = LMDG (2025)** if disk allows (253 GB compressed without router PCAP; system logs alone are 43 GB raw). It is the only public dataset with labeled multi-hop (up to 7) AD LM attacks across 35 attacks, which suits path-ranking evaluation. A lighter alternative is **CSE-CIC-IDS2018 "Infiltration" days / NF-CSE-CIC-IDS2018-v3** (free S3, no-sign-request) for a flow-only robustness check, used only with a corrected label set and with the caveat that it is not true multi-hop LM.
- Avoid as primary: LANL 2017 (no labels), CICIDS2017/UNSW-NB15/NF-* (machine-only, attack mix dominated by DoS/scan, known label errors), DARPA TC E3/E5 and ATLASv2 (single-host provenance, not enterprise auth graphs), and BOTS (CTF Q&A rather than per-event labels; requires Splunk).

### Gaps
- No published split was found for LMDG, CSE-CIC-IDS2018 infiltration-as-LM, or Unraveled in a graph-LM context.
- Kairos/Orthrus splits for DARPA TC were not retrieved (out of scope for auth-graph LM, but relevant if a provenance branch is added).
