# Graph / Temporal-Graph Methods for Lateral Movement, Attack-Path Prediction and Provenance IDS: Baselines and Evaluation Protocol (as of Nov 2026)

Scope note: research done with WebSearch/WebFetch only (no Firecrawl/Apollo). Numbers are copied from the cited pages. Where a figure came from a secondary source, a leaderboard or a search-engine summary rather than the paper itself, that is flagged. PDFs often could not be parsed by the fetch tool, so some per-dataset tables (MAGIC, Flash, Orthrus, Velox) are missing and listed under Gaps.

---

## Q1. Per-method landscape: problem setting, datasets, metrics, reported numbers, code/licence

### Takeaway
The lateral-movement (LM) graph literature (Euler, Argus, Jbeil, PIKACHU, LMTracker, LMDetect, CyberGFM) almost entirely frames LM as **unsupervised edge or link anomaly detection** on LANL/OpTC and reports near-perfect AUC (97–99.99%). A 2026 re-evaluation under consistent, realistic preprocessing shows **AP collapsing to ~0.0–0.1% on LANL and AUC falling to near chance (43–53%) for LM-only events on OpTC**. Provenance IDSs (Kairos, Orthrus, MAGIC, Flash, ThreaTrace, Velox) are host-level node, edge or time-window detectors on DARPA TC/OpTC and are not directly comparable to a network next-hop predictor.

### Cited Findings

**A. Lateral-movement / authentication-graph detectors**

| Method (venue) | Setting | Datasets | Reported headline numbers | Code / licence |
|---|---|---|---|---|
| **Euler** (King & Huang; NDSS **2022**, extended in ACM TOPS 26(3) **2023**, not "NDSS 2023") | Unsupervised temporal **link prediction / edge anomaly detection**. A model-agnostic GNN stacked on a sequence encoder (RNN) | LANL (58 days), OpTC | ~4% higher AUC and AP than prior work on inductive link detection. About equal to SOTA on transductive prediction. As quoted by Larroche 2026: LANL AUC 99.12, AP 5.23 (%); OpTC AUC 88.8, AP 8.8 | github.com/iHeartGraph/Euler. **No licence detected** by the GitHub API (62 stars, last push Nov 2023) |
| **Argus** (Xu, Shu, Li; IEEE S&P 2024, DOI 10.1109/SP54263.2024.00012) | Unsupervised edge anomaly detection on discrete-time temporal graphs. New encoder/decoder, directly optimises AP (APLoss) | LANL, OpTC | LANL AP 0.3227 vs Euler 0.0448. OpTC AP 0.8074 vs Euler 0.6426. Larroche quotes Argus-reported AUC 99.83 (LANL) and 99.7 (OpTC) | github.com/C0ldstudy/Argus, **MIT**. The README says APLoss is memory-heavy and `--loss bce` avoids OOM at some cost to AP |
| **Jbeil** (Khoury et al.; IEEE S&P 2024) | Inductive temporal-graph **link prediction of LM paths** (TGN-style continuous time) | LANL auth events | Preprint: AUC 99.73%, recall 99.25%. S&P listing: ~99% AUC in inductive and transductive settings | github.com/LMscope/Jbeil, **archived (read-only) since 13 Jan 2024**. Licence not confirmed |
| **PIKACHU** (Paudel & Huang; NOMS 2022) | Unsupervised temporal-walk dynamic graph embedding, then edge anomaly detection | LANL, OpTC | Quoted by Larroche: LANL AUC 94±0.4; OpTC AUC 99±0.03 (AP not reported) | The improved implementation by Bouček & Husák was used by Larroche |
| **Hopper** (Ho et al.; USENIX Security 2021; Dropbox data, not Databricks) | Rule/graph path inference over login graph, then anomaly scoring of **login paths** | Proprietary enterprise logs, 300+ simulated attacks plus 1 real red-team attack | Detects 94.5% (309/327) of attacks at <9 (extended report: "9") false positives/day. Prior SOTA would need ~8x more FPs | No public code found |
| **LMTracker** (Fang et al.; Neurocomputing 2022) | Heterogeneous-graph path embedding, then **unsupervised attack-path detection** | "Two public datasets" (LANL, CERT per LMDetect) | Abstract gives no numbers. As a baseline in LMDetect: LANL P/R/F1/AUC = 65.88/93.88/72.08/95.67; CERT AUC 79.82 | Not found |
| **log2vec** (Liu et al.; CCS 2019) | Heterogeneous graph embedding of log entries, then clustering (insider threat / APT) | Not confirmed; one source suggests self-collected logs | Claims to beat deep-learning and HMM baselines; no numbers retrieved | Not found |
| **LMDetect**, "Lateral Movement Detection via Time-aware Subgraph Classification on Authentication Logs" (Zhou et al., ZJUT; arXiv 2411.10279, Nov 2024) | **Supervised subgraph classification** of auth events (multi-scale attention) | LANL (30 days, 57,816 nodes, 3.9M edges), CERT | LANL P/R/F1/AUC = 98.20/99.89/99.03/99.99. Baselines on LANL: Euler GCN-GRU 50.26/94.82/50.37/99.04; GraphSAGE 96.18/96.53/96.34/99.77. Random 6:2:2 split, 17,000 benign / 400 malicious samples, 10 seeds | No code URL |
| **CyberGFM** (King, Trindade, Bowman, Huang; arXiv 2601.05988, Jan 2026) | Unsupervised link prediction. BERT-style masked-token pretraining on random walks, then fine-tuning | OpTC (976 nodes), UNSW-NB15 (50 nodes), LANL (first 14 days, NTLM only) | AUC/AP: LANL CyberGFM-S 0.9994/0.7600 vs Argus 0.9817/0.2279, Euler 0.9719/0.0627, Pikachu 0.9709/0.1428. OpTC 0.9739/0.8981 vs Argus 0.8885/0.7847, Euler 0.9840/0.6423. UNSW 0.9931/0.9874. **Random 80/10/10 benign split, not temporal**. Best checkpoint chosen by validation AUC | github.com/cybermonic/CyberGFM, **no licence detected**. Trained on a V100 32 GB |
| **GFM-based LM detector** (Larroche; arXiv 2504.13527, Apr 2025) | Uses a pretrained graph foundation model with no domain training | Not retrievable (PDF unparsable) | Abstract claims "state-of-the-art performance without requiring any training on domain-specific data" | Not found |

Sources: Euler [NDSS page](https://ndss-symposium.org/ndss-paper/auto-draft-227), [NSF PAR journal version](https://par.nsf.gov/servlets/purl/10440905), [NSF PAR NDSS version](https://par.nsf.gov/servlets/purl/10344243). Argus [author page](https://c0ldstudy.github.io/posts/GSA), [paper PDF](https://c0ldstudy.github.io/commons/papers/SP2024_paper118.pdf), [GitHub](https://github.com/C0ldstudy/Argus). Jbeil [NSF PAR](https://par.nsf.gov/servlets/purl/10540681), [IEEE CSDL](https://computer.org/csdl/proceedings-article/sp/2024/313000a009/1RjE9NF72De), [GitHub](https://github.com/LMscope/Jbeil). PIKACHU [NSF PAR](https://par.nsf.gov/biblio/10344249). Hopper [USENIX](https://usenix.org/conference/usenixsecurity21/presentation/ho), [arXiv extended](https://arxiv.org/pdf/2105.13442), [PortSwigger](https://portswigger.net/daily-swig/dropbox-researchers-develop-tool-to-detect-lateral-movement-attacks-against-enterprise-networks). LMTracker [Bohrium abstract](https://www.bohrium.com/paper-details/lmtracker-lateral-movement-path-detection-based-on-heterogeneous-graph-embedding/814708225134821377-2492). log2vec [PSU Pure](https://pure.psu.edu/en/publications/log2vec-a-heterogeneous-graph-embedding-based-approach-for-detect/). LMDetect [arXiv HTML](https://arxiv.org/html/2411.10279). CyberGFM [arXiv HTML](https://arxiv.org/html/2601.05988). Larroche GFM [arXiv](https://arxiv.org/abs/2504.13527). Licences from the [GitHub API](https://api.github.com/search/repositories?q=repo:iHeartGraph/Euler+repo:C0ldstudy/Argus+repo:cybermonic/CyberGFM).

- Conflict: Euler's AP on LANL is 5.23% in Euler's own paper (as quoted by [Larroche 2026](https://arxiv.org/html/2607.29390v1)) but 0.0448 in Argus's re-run ([Argus PDF](https://c0ldstudy.github.io/commons/papers/SP2024_paper118.pdf)) and 0.0627 in CyberGFM's re-run ([CyberGFM](https://arxiv.org/html/2601.05988)). Euler's OpTC AP is 8.8% (own paper, via Larroche) versus 0.6426 (Argus) and 0.6423 (CyberGFM). Different preprocessing explains this ([Larroche 2026](https://arxiv.org/html/2607.29390v1)).
- **Independent re-evaluation (Larroche, ANUBIS '26, arXiv 2607.29390, Jul 2026)** of PIKACHU, Euler (GCN-GRU) and Argus (MPNN-GRU), all under one realistic policy ([arXiv HTML](https://arxiv.org/html/2607.29390v1)):
  - LANL, new vs reported: Pikachu AUC 78.28±0.43 vs 94; AP 0.00. Euler AUC 97.97±0.17 vs 99.12; AP 0.02±0.00 vs 5.23. Argus AUC 98.44±0.78 vs 99.83; AP 0.09±0.04 vs 32.27.
  - OpTC, LM-only labels / all-malicious labels vs reported: Pikachu AUC 50.74 / 86.02 vs 99; Euler AUC 52.90±6.82 / 84.31±3.55 vs 88.8; Argus AUC 43.23±3.05 / 79.75±2.19 vs 99.7. AP (LM-only) is 0.00–0.01 for all three; AP (all) is 0.51 / 0.51 / 3.36 vs reported 8.8 (Euler) and 80.74 (Argus).
  - Proposed datasets: LANL has 16,159 nodes, 369,569,626 events and **702 malicious events**. OpTC has 897 nodes, 36,227,823 events and 1,354 malicious events, of which **244 are LM-related**.
  - The ranking holds on LANL (Argus > Euler > Pikachu). On OpTC, Argus no longer wins and Euler ties for first on AUC. Conclusion: "lateral movement detection remains an open problem."

**B. Provenance-based IDS (host-level; DARPA TC E3/E5, OpTC)**

| Method (venue) | Granularity | Datasets | Reported numbers | Code / licence |
|---|---|---|---|---|
| **Kairos** (Cheng et al.; IEEE S&P 2024) | Temporal GNN (TGN-style) edge-reconstruction anomaly; flags **15-min time-window queues**, then a summary attack graph | E3 CADETS/THEIA/ClearScope, E5 CADETS/THEIA/ClearScope, OpTC, Manzoor | Table IV (unadjusted), P/R/AUC: E3-CADETS 0.800/1.000/0.997; E3-THEIA 0.818/1.000/0.995; E5-CADETS 0.438/1.000/0.982; OpTC 0.579/1.000/0.993 (22 TP, 16 FP windows). Vs ThreaTrace (node level): E3-CADETS ThreaTrace 0.90/0.99, Kairos 1.00/0.95. Hardware: 20-core Xeon, 64 GB RAM, **CPU only**; median 2.5–38.3 s per 15-min window | github.com/ProvenanceAnalytics/kairos (licence not confirmed) |
| **ThreaTrace** (Wang et al.; IEEE TIFS 2022) | Node-level GraphSAGE anomaly | DARPA TC, StreamSpot | Via Kairos: E5-THEIA P 0.70, R 0.92. Flagged **>63K FP nodes** on E5-THEIA. Its labels include 2-hop neighbours, which favours it | See PIDSMaker |
| **MAGIC** (Jia et al.; USENIX Security 2024) | Masked graph autoencoder, entity-level | 3 datasets (real + simulated APT) | Entity-level precision 97.26%, recall 99.91% (own paper) | github.com/FDUDSDE/MAGIC, **MIT** |
| **Flash** (Rehman, Ahmadi, Hassan; IEEE S&P 2024) | word2vec semantic encoder + GNN, node-level, embedding reuse for real-time detection | "Real-world datasets" | Abstract claims better accuracy than prior PIDS; per-dataset P/R not retrieved | github.com/DART-Laboratory/Flash-IDS, **no licence detected** |
| **Orthrus** (Jiang et al.; USENIX Security 2025) | Node-level spatio-temporal GNN plus dependency-analysis attack reconstruction; optimises **Quality of Attribution** | 6 DARPA TC datasets, 5 baselines | Cuts the number of nodes needing manual inspection "by several orders of magnitude". Malicious prevalence in its test sets is ~4e-5 to 3.4e-4 | github.com/ubc-provenance/orthrus, **Apache-2.0** |
| **Velox** (Bilot et al., "Sometimes Simpler is Better", USENIX Security 2025) | Simple lightweight neural network, real-time | 7 DARPA datasets | "A simple neural network reaches SOTA detection on **5 of 7** DARPA datasets while being lighter, faster, real-time". A secondary Chinese write-up says 8 of 9; the primary source wins | In PIDSMaker (Apache-2.0) |
| **PIDSMaker** (Bilot, Jiang, Pasquier; arXiv 2601.22983, 2026; KDD 2026 per UBC page) | Unified framework with 8 PIDSs: ThreaTrace, NodLink, MAGIC, Kairos, Flash, R-CAID, Orthrus, Velox | 13 datasets: E3 and E5 (5 each) plus OpTC h201/h501/h051 | 30+ metrics (P/R/F1, AP, AUC-ROC, ADP, discrimination AUC) reported as mean/std over runs. Recommends **≥100 GB RAM** (≥500 GB for the largest datasets) and a 20–40 GB GPU | github.com/ubc-provenance/PIDSMaker, **Apache-2.0** |

Sources: Kairos [ar5iv](https://ar5iv.labs.arxiv.org/html/2308.05034), [arXiv](https://arxiv.org/pdf/2308.05034). MAGIC [USENIX](https://www.usenix.org/conference/usenixsecurity24/presentation/jia), [arXiv](https://arxiv.org/pdf/2310.09831). Flash [DART lab PDF](https://dart-laboratory.github.io/assets/pdf/flash.pdf). Orthrus [USENIX](https://www.usenix.org/conference/usenixsecurity25/presentation/jiang-baoxiang), [UBC page](https://spg.cs.ubc.ca/publication/2025-usenixsec/), [slides](https://www.usenix.org/system/files/sec25_slides_jiang-baoxiang.pdf). Velox/Bilot [USENIX](https://www.usenix.org/conference/usenixsecurity25/presentation/bilot), [secondary write-up](https://www.secrss.com/articles/87588). PIDSMaker [arXiv HTML](https://arxiv.org/html/2601.22983v2), [docs](https://ubc-provenance.github.io/PIDSMaker), [UBC page](https://spg.cs.ubc.ca/publication/2026-kdd/). Licences from the [GitHub API](https://api.github.com/search/repositories?q=repo:FDUDSDE/MAGIC+repo:ubc-provenance/PIDSMaker+repo:ubc-provenance/orthrus+repo:DART-Laboratory/Flash-IDS).

- A third-party leaderboard for E3-CADETS (protocol unstated, probably Orthrus-style node labels) gives TP/FP/FN: MAGIC 63/79,766/5; ThreaTrace 61/252,117/7; OCR-APT 53/83,779/15; ProvAgent 19/1,941/53; Flash 13/2,381/55; **Orthrus 10/0/58**; Kairos 0/9/68. This contradicts Kairos's own table, and the leaderboard maps three entries to one paper ID, so treat it as indicative only ([sota2/wizwand](https://sota2.com/research/sota/attack-detection-on-darpa-e3-cadets)).
- Industrial evaluation (Xiao et al., Tsinghua/Tencent; arXiv 2603.22982, Mar 2026) of MAGIC, Flash, Orthrus, Kairos and NodLink on private data from ~15,000 hosts ([arXiv HTML](https://arxiv.org/html/2603.22982v1)):
  - Average AUC drops 26.77% across hosts and 38.03% across platforms.
  - Real attacks: mining-attack AUC averages 61.06% and information-stealing averages 57.36%.
  - Sandbox FPR: MAGIC 0.4510, Flash 0.0477, Orthrus 0.0001, Kairos 0.1197, NodLink 0.3576.
  - On a host whose activity keeps changing, MAGIC, Flash and NodLink exceed 23% FPR, while Orthrus stays below 1%.

**C. Generic temporal-graph learners (candidate baselines)**
- DyGLib (Yu et al., NeurIPS 2023) puts JODIE, DyRep, TGAT, TGN, CAWN, EdgeBank, TCL, GraphMixer and the new **DyGFormer** behind one interface. It scores link prediction with AP and AUC-ROC (transductive and inductive) over 5 seeds, and DyGFormer is best on most of its 13 datasets ([arXiv](https://arxiv.org/abs/2303.13047v3), [NeurIPS](https://proceedings.neurips.cc/paper_files/paper/2023/hash/d611019afba70d547bd595e8a4158f55-Abstract.html)). Code: github.com/yule-BUAA/DyGLib, **MIT** ([GitHub API](https://api.github.com/search/repositories?q=repo:yule-BUAA/DyGLib)).
- TGN reference code: github.com/twitter-research/tgn, **Apache-2.0**. TGB: github.com/shenyangHuang/TGB, **MIT**, still maintained (last push Jul 2026) ([GitHub API](https://api.github.com/search/repositories?q=repo:twitter-research/tgn+repo:shenyangHuang/TGB)).

### Inferences
- Lateralis's stack (GAT encoder + GRU memory + MLP link decoder on 1-hour snapshots) is architecturally closest to **Euler (GNN + RNN on snapshots) and Argus (MPNN-GRU)**. These are the most natural "same-family" baselines, and both have public code. Argus is MIT; Euler has no stated licence, so it can be used for research comparison but its code should not be redistributed.
- Provenance IDSs work on host system-call graphs, not authentication/flow graphs. They should be **cited as related work, not run as baselines**, unless Lateralis adds a host-level provenance mode. Their hardware needs (PIDSMaker ≥100 GB RAM) also rule them out on the target hardware.
- Supervised LM results (LMDetect 99.99 AUC, Jbeil 99.73 AUC) come from random or node-subset splits of a single red-team intrusion. Larroche argues this is unrealistic, so these numbers should not be presented as targets.

### Gaps
- Per-dataset precision/recall tables for MAGIC, Flash, Orthrus and Velox could not be extracted (the PDFs were unparsable by the fetch tool). The USENIX PDFs need to be read directly.
- Licences for Jbeil and Kairos were not returned by the GitHub API (repo names may differ in case or have changed). Euler, Flash and CyberGFM have no licence detected, which by default means all rights reserved.
- Original LMTracker and log2vec numbers were not retrieved.
- No paper reports GraphMixer, DyGFormer or TGAT results specifically on LANL or OpTC LM detection; this was not found.
- The Larroche GFM detector (2504.13527) numbers were not retrieved.

---

## Q2. Is anyone forecasting the next hop or attack path (vs detecting)? What metrics?

### Takeaway
True **next-hop forecasting** on real enterprise auth/flow graphs is rare. Nearly every graph LM paper scores already-observed edges (detection). The closest precedents are sequence-level next-event prediction (Tiresias, precision up to 0.93), attack-path prediction framed as knowledge-graph link prediction scored with **MRR / Hits@N**, and RL-based attack-path discovery on attack graphs, which usually has no public benchmark. This gap is a defensible novelty claim for Lateralis, as long as it is evaluated with ranking metrics.

### Cited Findings
- **Tiresias** (Shen et al., CCS 2018) predicts the next security event per machine with RNNs. It was trained on 3.4B IPS events from 740k machines over 27 days, reports precision up to 0.93, and finds RNN long-term memory "key", with simpler methods "not up to the task". It also detects precision drops to trigger retraining ([ar5iv](https://ar5iv.labs.arxiv.org/html/1905.10328), [BU PDF](https://seclab.bu.edu/papers/tiresias-ccs2018.pdf)). A third-party reimplementation exists at github.com/Thijsvanede/Tiresias (MIT) ([GitHub](https://github.com/Thijsvanede/Tiresias)).
- **"Predicting Adversary Lateral Movement Patterns with Deep Learning"** (Danneman & Hyde, arXiv 2104.13195, 2021) predicts which host an adversary compromises next. It was trained on simulated enterprise networks and validated on a live red-team event; the abstract gives no metric values ([arXiv](https://arxiv.org/abs/2104.13195)).
- **Text-enhanced GAT attack-path prediction** (MDPI *Electronics* 15(3):552, 2026) frames attack-path prediction as link prediction and evaluates with **MR, MRR and Hits@N**. It reports about +12.3% MRR and +13.2% Hits@5 over baselines (per the ResearchGate version) ([MDPI](https://www.mdpi.com/2079-9292/15/3/552), [ResearchGate](https://www.researchgate.net/publication/400131518_A_Cyber_Attack_Path_Prediction_Approach_Based_on_a_Text-Enhanced_Graph_Attention_Mechanism)).
- **RL-based attack-path work:**
  - ProAPT uses deep Q-learning with an LSTM to project the next APT step, with a 1/0 reward for a correct prediction ([arXiv 2209.07215](https://arxiv.org/pdf/2209.07215)).
  - RL over attack graphs is used to discover exfiltration paths ([arXiv 2201.12416](https://ar5iv.arxiv.org/html/2201.12416)).
  - LM is cast as a POMDP with ATT&CK-based reward machines ([arXiv 2405.15908](https://arxiv.org/html/2405.15908v1)).
  - An NDSS 2026 poster uses DRL for adaptive attack-path discovery ([NDSS poster](https://www.ndss-symposium.org/wp-content/uploads/ndss26-poster-17.pdf)).
- **KillChainGraph** (arXiv 2508.18230) predicts and maps ATT&CK techniques along kill-chain phases, which is technique-level rather than host-level forecasting ([arXiv](https://arxiv.org/html/2508.18230)).
- **CyberGFM** casts LM detection as next-token prediction over random walks, but it still scores observed edges (detection) with AUC/AP ([arXiv](https://arxiv.org/html/2601.05988)).
- **Hopper** reconstructs login *paths* and measures attacks detected plus false positives per day, an operational metric reusable for path-level evaluation ([arXiv](https://arxiv.org/pdf/2105.13442)).
- In temporal-graph ML, link prediction is evaluated as **ranking each true edge against many negatives with MRR** (TGB) ([TGB ar5iv](https://ar5iv.labs.arxiv.org/html/2307.01026)). This is the natural metric for "rank candidate next hops".

### Inferences
- Lateralis should report **two task families**: (a) detection (edge AUC/AP), for comparability with Euler/Argus; and (b) forecasting. For forecasting: given the compromised set at snapshot t, rank all candidate destination hosts for the next red-team edge at t+1, scored with Hits@1/5/10 and MRR (filtered, 1-vs-all candidates), plus **path-level top-k hit rate** (does the true red-team path appear in Yen's top-k?) and **lead time** (snapshots between the first correct top-k forecast and the actual compromise).
- LANL has only 702 malicious auth events from essentially one intrusion, almost all from source host C17693 ([Larroche 2026](https://arxiv.org/html/2607.29390v1)). Forecasting evaluation on LANL therefore has very few independent ground-truth "next hops". Confidence intervals (bootstrap over red-team events) are mandatory, and synthetic multi-campaign data remains necessary for statistical power.

### Gaps
- No peer-reviewed benchmark for next-hop LM forecasting on LANL/OpTC with Hits@k/MRR was found. The Danneman & Hyde metrics were not retrievable from the abstract.
- No paper was found reporting "time-to-detection" or lead time for graph LM detectors on LANL/OpTC.

---

## Q3. Known evaluation pitfalls (LM detectors, provenance IDS, temporal link prediction)

### Takeaway
Three independent critique lines all show headline numbers in this area are inflated:
- Larroche 2026: preprocessing, labelling and filtering differences across LM papers.
- Bilot et al. 2025, PIDSMaker 2026, Moon et al. 2026 and the industrial evaluation: data snooping, test-label checkpoint selection, granularity and neighbourhood credit, single runs, poor transfer for provenance IDS.
- Poursafaei 2022, TGB 2023 and TGB 2.0: easy random negatives and few-negative evaluation, which a memorisation baseline (EdgeBank) exploits.

### Cited Findings
**LM-detector pitfalls (Larroche, ANUBIS '26)** ([arXiv HTML](https://arxiv.org/html/2607.29390v1)):
- **Inconsistent LANL splits and filters.** GL-GV trains on 40 red-team-free days. Euler and Argus train on the first 41 hours (Argus tests only on the rest of the first 14 days). Pikachu trains on the first 40 hours and subsamples users. Jbeil uses the first 85% for a node subset. Several keep only NTLM LogOn events.
- **Unrealistic filtering.** Removing benign users or non-NTLM events cuts false positives; defenders cannot know beforehand which accounts are compromised.
- **Snapshot length changes the test set.** Edge-level metrics shift with snapshot length partly because test-set composition changes. Fair comparison needs **event-level metrics on identical events**.
- **Base-rate fallacy.** Even a low FPR swamps the TPs when positives are rare.
- **OpTC labels are wildly inconsistent.** Host-based labelling gives ≈25,000 malicious flows, process-based 563 (15 LM), and the proposed hybrid 1,359 (249 LM).
- **No supervised training on LANL.** It contains a single intrusion, so train-on-part / test-on-rest is unrealistic.
- **Proposed LANL policy:** all remote LogOn events, keep computer/built-in accounts, no benign downsampling, train on the first 41 hours, test on the rest, original labels.
- **Proposed OpTC policy:** internal flows only, drop broadcast/multicast, deduplicate, merge each host's IPs into one node, train on 17–22 Sep, test on 23–25 Sep, hybrid labels, report LM-only separately.

**Provenance-IDS pitfalls:**
- Bilot et al. (USENIX Sec 2025) re-implemented 8 PIDSs in one framework and found 9 shortcomings, quantified with security-oriented metrics. A simple NN matches SOTA on 5/7 DARPA datasets ([USENIX](https://www.usenix.org/conference/usenixsecurity25/presentation/bilot)).
- PIDSMaker summarises the shortcomings ([arXiv HTML](https://arxiv.org/html/2601.22983v2)):
  - inconsistent preprocessing, splits and labels
  - costly re-implementations that skew results
  - **single-run reporting despite run-to-run variance**
  - **manually tuned thresholds or clustering that assume an attack is present (data snooping)**
  - detection granularity (node/edge/neighbourhood/graph) that inflates metrics
  - baselines not tuned as rigorously as the proposed method
  - "prediction instability"
- Moon, Kim & Pyeon (arXiv 2609.33532, Sep 2026) audited 9 released PIDS implementations ([arXiv](https://arxiv.org/abs/2609.33532)):
  - ThreaTrace's 0.938 precision depends on **neighbourhood credit**: only **7 of its 994 alarms** carry its own attack label.
  - Removing **test-label checkpoint selection** lowers attack-detection precision by 0.16–0.33, although rankings survive.
  - A buffer-reuse bug gave a linear encoder unintended degree-dependent inputs.
  - They propose **STRICT**, six checkable reporting requirements.
- The Kairos authors concede that their own labelling "likely inflates precision and recall", and that ThreaTrace's 2-hop-neighbour labels favour ThreaTrace ([Kairos ar5iv](https://ar5iv.labs.arxiv.org/html/2308.05034)).
- The industrial evaluation finds ([arXiv HTML](https://arxiv.org/html/2603.22982v1)):
  - The benign-training assumption is violated when intruders predate deployment.
  - Transfer is poor across hosts (−26.77% AUC) and platforms (−38.03% AUC).
  - UUID/node-identity choices swing MAGIC's AUC from 52.93% to 81.06%.
  - Node-level alerts do not match analyst investigation units: NodLink flags 27,329 TP nodes for 112 malicious entities.

**Temporal link prediction pitfalls:**
- Poursafaei et al. (NeurIPS 2022 D&B) show that many edges recur, so a pure-memorisation **EdgeBank** baseline (no learning, no tuning) performs surprisingly well. They conclude that standard random negatives are too easy, introduce **historical** and **inductive** negative sampling, and find that method rankings change significantly across negative-sampling settings. EdgeBank ranks 2nd overall under historical negative sampling ([arXiv](https://arxiv.org/abs/2207.10128v2), [NeurIPS PDF](https://proceedings.neurips.cc/paper_files/paper/2022/file/d49042a5d49818711c401d34172f9900-Paper-Datasets_and_Benchmarks.pdf)).
- TGB (Huang et al., NeurIPS 2023) evaluates link prediction as ranking with **MRR against many negatives (historical + random)**. Simple heuristics can outperform SOTA TG methods. EdgeBank test MRR on tgbl-wiki is ~0.575 (transductive) / 0.551 (inductive) for the time-window variant. With fewer negatives, "MRR scores are significantly higher for most methods". Dataset "surprise index" (tgbl-wiki 0.108 vs tgbl-review 0.987) drives whether memorisation works ([TGB ar5iv](https://ar5iv.labs.arxiv.org/html/2307.01026), [NeurIPS slides](https://neurips.cc/media/neurips-2023/Slides/73456.pdf)).
- TGB 2.0 finds 1-vs-all evaluation yields the lowest MRR, consistent with few negatives inflating scores ([arXiv 2406.09639](https://arxiv.org/pdf/2406.09639)).
- DyGLib notes several baseline results are inconsistent with earlier reports because of less rigorous implementations ([arXiv](https://arxiv.org/abs/2303.13047v3)). Le Yu's TGB study shows some baselines improve significantly when re-implemented carefully ([arXiv 2307.12510](https://arxiv.org/abs/2307.12510v2)).
- A 2026 preprint reports that a smoothed-count baseline with a handful of parameters beats EdgeBank on tgbl-wiki. It notes tgbl-wiki was revised (v2), so older numbers are not directly comparable ([arXiv 2609.35364](https://arxiv.org/pdf/2609.35364)).

**General ML-in-security pitfalls:** Arp et al. (USENIX Sec 2022) identify 10 pitfalls (e.g. P1 sampling bias) across 30 top-tier security papers and show they are widespread and lead to unrealistic performance ([arXiv](https://arxiv.org/abs/2010.09470), [USENIX](https://www.usenix.org/conference/usenixsecurity22/presentation/arp)).

**Split leakage in recent LM work:** CyberGFM explicitly rejected a temporal split, using random 80/10/10 over benign events plus all anomalies in test ([arXiv](https://arxiv.org/html/2601.05988)). LMDetect uses a random 6:2:2 split over sampled events ([arXiv](https://arxiv.org/html/2411.10279)). Both mix future and past.

### Inferences
- For Lateralis, the biggest risks are:
  - (1) a random edge split (temporal leakage)
  - (2) fitting the decision threshold or temperature on test labels (data snooping)
  - (3) reporting AUC alone when the positive rate is ~2e-6 (702 / 369.6M on LANL), where AP is the honest metric
  - (4) random negatives for next-hop ranking that EdgeBank-style memorisation trivially beats
  - (5) single-seed runs
- Snapshot length (Lateralis uses 1 h) must be fixed when comparing with Euler/Argus, or metrics must be computed at event level on identical events (Larroche).

### Gaps
- The full list of Bilot et al.'s nine shortcomings and Moon et al.'s six STRICT requirements was not retrievable from the abstract pages.
- The exact names of Arp et al.'s 10 pitfalls beyond P1 were not retrieved. They are widely cited as including data snooping, label inaccuracy, inappropriate baselines, inappropriate performance measures, base-rate fallacy and lab-only evaluation, but this could not be verified in this session.

---

## Q4. Calibration and uncertainty in security ML: precedent for ECE/Brier

### Takeaway
There is precedent for reporting **ECE, Brier score and NLL** in malware detection and flow-based IDS, mostly under dataset shift. **No graph LM or provenance IDS paper retrieved reports calibration**, so temperature-scaled, reliability-diagram reporting would be a genuine contribution for Lateralis. The literature warns that calibration degrades under shift and adversarial evasion, and that it does not change ranking (AUC/AP).

### Cited Findings
- Li et al. (ACSAC 2021), "Can We Leverage Predictive Uncertainty to Detect Dataset Shift and Adversarial Examples in Android Malware Detection?", evaluate ECE alongside Brier score and NLL, propose weighting ECE bins by malware count, and find adversarial evasion can make calibration methods useless (confidently wrong labels). The code is public ([arXiv 2109.09654](https://arxiv.org/pdf/2109.09654), [ACSAC PDF](https://www.acsac.org/2021/program/files/acsac21-5a-5.pdf)).
- "When Calibrated Detectors Meet New Attacks" (2025, IJACSA 17(8)) reports top-label ECE for ML IDS on NSL-KDD and UNSW-NB15:
  - On UNSW-NB15, where attack categories stay the same, ECE stays small (0.025–0.068).
  - When test attacks are novel (NSL-KDD), calibration fails, and recalibrating on training-distribution data does not fix it.
  - Recalibrating on a small labelled sample from the shifted distribution does fix it.
  - Note: the fetch summary flagged its text as partly garbled; verify the numbers ([PDF](https://thesai.org/Downloads/Volume17No8/Paper_12-When_Calibrated_Detectors_Meet_New_Attacks.pdf)).
- Windows PE malware under dataset shift: ensemble uncertainty plus conformal prediction gives a more reliable safeguard against misclassification under extreme shift ([arXiv 2512.18495](https://arxiv.org/html/2512.18495v1)).
- Federated IoT IDS: uncalibrated federated models showed poor calibration, and calibration improved reliability ([Talpini et al. preprint](https://www.boa.unimib.it/retrieve/6c852639-8126-475b-b766-0b1ff683ef3d/Talpini-2026-ICAART%202025-preprint.pdf)).
- Standard post-hoc calibration preserves score ordering and so cannot reduce ranking error ([arXiv 2505.22843](https://arxiv.org/pdf/2505.22843v3.pdf), as summarised by search).

### Inferences
- Lateralis turns probabilities into edge costs (−log p) for Yen's k-shortest paths. Path ranking therefore depends on probabilities being calibrated **across edges**: products of miscalibrated probabilities compound. This is a strong argument to report:
  - ECE (equal-mass bins, ~15 bins)
  - Brier score
  - NLL
  - reliability diagrams, before and after temperature scaling

  Fit temperature on a chronologically held-out validation window and report on the later test window. Add a "shifted" test (a later period, or a different dataset) given the shift findings above.
- Because positives are extremely rare, also report class-conditional calibration or ECE restricted to the top-scored bins (where analyst decisions happen). The Li et al. bin weighting is a precedent.

### Gaps
- No precedent was found for calibration reporting in LANL/OpTC graph LM work or in provenance IDS papers.
- No paper was found that evaluates calibration of path probabilities (products of edge probabilities) in attack-graph settings.

---

## Q5. What is realistically reproducible on a 16 GB RAM, no-GPU laptop plus free Colab T4?

### Takeaway
Realistic baselines are:
- the heuristic baselines (EdgeBank, frequency/recency, degree)
- Euler and Argus (Argus with BCE loss) on the commonly used LANL subset (first 14 days, NTLM, one edge per snapshot and pair)
- the DyGLib models (TGN, TGAT, GraphMixer, DyGFormer, JODIE, DyRep) on that subset or on OpTC (~900 nodes)
- possibly PIKACHU and Kairos-scale CPU workloads

Full-LANL (369.6M events) training, PIDSMaker provenance pipelines (≥100 GB RAM) and CyberGFM LANL pretraining (V100, ~12,000 s) are out of scope or need heavy subsetting.

### Cited Findings
- Full LANL under Larroche's realistic policy has 369,569,626 events and 16,159 nodes. OpTC has 36,227,823 events and 897 nodes ([Larroche 2026](https://arxiv.org/html/2607.29390v1)).
- CyberGFM's LANL subset (first 14 days, NTLM only, Argus features) has 15.6k nodes, 3M edges and 439 anomalies. Its OpTC subset has 976 nodes, 1M edges and 674 anomalies ([CyberGFM](https://arxiv.org/html/2601.05988)).
- CyberGFM compute ([CyberGFM](https://arxiv.org/html/2601.05988)):
  - Ran on a single V100 32 GB with a 2.57M-parameter BERT-tiny model.
  - LANL pretraining took about 12,000 s.
  - Argus took about 8,000 s and Pikachu about 4,000 s on LANL on the same hardware.
- Argus's default APLoss is memory-intensive; `--loss bce` avoids OOM at some AP cost ([GitHub README mirror](https://verifico.duckdns.org/C0ldstudy/Argus), [GitHub](https://github.com/C0ldstudy/Argus)).
- Kairos ran CPU-only on a 20-core Xeon with 64 GB RAM. Median per-15-minute-window processing was 2.5 s (E3-CADETS) to 38.3 s (E5-THEIA) ([Kairos ar5iv](https://ar5iv.labs.arxiv.org/html/2308.05034)).
- PIDSMaker recommends ≥100 GB RAM for the smallest datasets (≥500 GB for the largest) and a 20–40 GB GPU ([PIDSMaker arXiv](https://arxiv.org/html/2601.22983v2)).
- In the industrial evaluation, Flash was fastest at 33.65 s training for a ~10^6 graph on an A100 ([arXiv 2603.22982](https://arxiv.org/html/2603.22982v1)).
- DyGLib provides MIT-licensed unified implementations of JODIE, DyRep, TGAT, TGN, CAWN, EdgeBank, TCL, GraphMixer and DyGFormer ([arXiv](https://arxiv.org/abs/2303.13047v3), [GitHub API](https://api.github.com/search/repositories?q=repo:yule-BUAA/DyGLib)). TGB (MIT) supplies standardised negative samplers and MRR evaluators ([GitHub API](https://api.github.com/search/repositories?q=repo:shenyangHuang/TGB)).

### Inferences
Feasibility tiers. These are judgements, not measured.

| Tier | Baselines | Where |
|---|---|---|
| Laptop CPU, minutes | Random; EdgeBank (unlimited and time-window); frequency/recency count heuristic; popularity/degree (preferential attachment); historical-path heuristic ("next hop = most frequent past destination of the compromised user"); logistic regression on hand features | 16 GB laptop |
| Laptop CPU, hours, or Colab T4 | Euler (GCN-GRU) and Argus (BCE loss) on the 14-day NTLM LANL subset (3M merged edges) and on OpTC (~900 nodes); static GAT/GraphSAGE (no temporal memory) | Colab T4 (~15 GB VRAM) recommended |
| Colab T4, a few hours, batched | DyGLib TGN, TGAT, GraphMixer, DyGFormer, JODIE, DyRep on OpTC and the LANL subset; PIKACHU | Colab; checkpoint across sessions (free Colab sessions time out) |
| Out of scope | CyberGFM pretraining on LANL; full-LANL (369.6M events) end-to-end; PIDSMaker / Kairos / Orthrus / MAGIC / Flash / Velox on DARPA TC | Cite published numbers only |

The full LANL auth file must be streamed and aggregated, for example into per-hour (src, dst, user) counts, rather than loaded into 16 GB RAM. Report the exact filtering used (Larroche's requirement).

### Gaps
- No measured runtimes for Euler, Argus or DyGLib models on a T4 or a 16 GB CPU laptop were found. The feasibility tiers above are inferences from the reported V100/Xeon numbers and graph sizes.
- Free Colab T4 session limits were not verified in this research.

---

## Q6. Recommended evaluation protocol for Lateralis (synthesis)

### Takeaway
Follow Larroche's 2026 realistic preprocessing for LANL and OpTC, chronological splits, and TGB-style ranking evaluation with hard negatives and the EdgeBank baseline. Report AP alongside AUC, operational alert-budget metrics (Hopper style), calibration metrics, ≥5 seeds with standard deviation, and an explicit preprocessing/labelling table. Compare against Euler, Argus, heuristic baselines and DyGLib models, and cite (not run) provenance-IDS numbers.

### Cited Findings
- Realistic LANL/OpTC policies, event-level metrics on identical events, and separate LM-only labels on OpTC ([Larroche 2026](https://arxiv.org/html/2607.29390v1)).
- Ranking evaluation with MRR against historical + random negatives, and EdgeBank as a mandatory baseline ([TGB](https://ar5iv.labs.arxiv.org/html/2307.01026); [Poursafaei 2022](https://arxiv.org/abs/2207.10128v2)).
- Multi-run mean±std: DyGLib uses 5 seeds ([DyGLib](https://arxiv.org/abs/2303.13047v3)), CyberGFM 10 runs ([CyberGFM](https://arxiv.org/html/2601.05988)). Single-run reporting is a flagged shortcoming ([PIDSMaker](https://arxiv.org/html/2601.22983v2)).
- No threshold, checkpoint or temperature selection on test labels ([Moon et al. 2026](https://arxiv.org/abs/2609.33532); [PIDSMaker](https://arxiv.org/html/2601.22983v2)).
- Operational metric precedent: attacks detected at a fixed false-positive budget per day ([Hopper](https://arxiv.org/pdf/2105.13442)). Low-FP / attribution-cost framing ([Orthrus](https://www.usenix.org/conference/usenixsecurity25/presentation/jiang-baoxiang)).
- Calibration metrics precedent: ECE, Brier, NLL ([Li et al. ACSAC 2021](https://arxiv.org/pdf/2109.09654)).
- Cross-host and cross-period shift drastically degrades detectors, so test on a later period and a second dataset ([industrial eval](https://arxiv.org/html/2603.22982v1)).

### Inferences (proposed protocol)
1. **Datasets and preprocessing**
   - (a) Synthetic: multiple campaigns, with seeds and generator config released.
   - (b) LANL under the Larroche policy: all remote LogOn, keep machine/built-in accounts, no downsampling, train on the first 41 h, then validate on the next window (e.g. days 3–7, which are benign before the red team), test on the rest. Plus the "14-day NTLM" variant for comparability with Euler/Argus/CyberGFM numbers, clearly labelled.
   - (c) OpTC under the Larroche policy: train 17–21 Sep, validate 22 Sep, test 23–25 Sep (train/val split of the benign days is my adaptation). Report LM-only and all-malicious separately.
   - CICIDS/UNSW NetFlow is optional and secondary. UNSW-NB15 has only ~50 nodes and 321k anomalies over 2M edges ([CyberGFM](https://arxiv.org/html/2601.05988)), so it is not an LM-realistic graph.
   - Publish a table of filters, merges and labels per dataset.
2. **Splits.** Strictly chronological train / val / test. Temperature, thresholds, early stopping and hyperparameters use validation only. No supervised use of LANL red-team labels in training.
3. **Task A, detection** (comparability): event-level AUC-ROC and **AP (primary)**, FPR at TPR = 0.9/0.99, precision@k, and alerts/day at the operating point vs fraction of red-team events caught. Report TP/FP counts.
4. **Task B, next-hop forecasting** (Lateralis's novelty): for each red-team edge (u→v) at time t, rank all hosts reachable from u (or all hosts) by p(u→·). Report:
   - Hits@1/5/10 and filtered MRR, under (i) 1-vs-all, (ii) TGB-style historical + random negatives
   - path-level top-k hit rate from Yen's k-shortest paths (k = 1, 5, 10)
   - lead time in snapshots
   - bootstrap 95% CIs over red-team events
5. **Calibration.** ECE (15 equal-mass bins), Brier, NLL and reliability diagram, before and after temperature scaling (fitted on val), evaluated on test and on a later or shifted period.
6. **Baselines.**
   - Heuristics: random, EdgeBank (∞ and time-window), recency/frequency count, degree/popularity, historical-destination.
   - Same-family: Euler GCN-GRU, Argus (BCE).
   - Generic TG: TGN, TGAT, GraphMixer, DyGFormer via DyGLib.
   - Static: GAT, no memory.
   - Optional: PIKACHU, CyberGFM numbers cited.
   - Provenance-IDS numbers are cited only, as related work.
   - Tune all baselines with the same budget.
7. **Ablations.**
   - No GRU memory (static GAT)
   - Homogeneous graph (drop user/computer node types)
   - No edge features
   - Snapshot length 15 min / 1 h / 6 h, with event-level metrics on identical events
   - No temperature scaling
   - Decoder: MLP vs dot-product
   - Negative-sampling strategy in training
   - Yen's k, and the cost function (−log p vs 1−p)
   - Simulator defensive-action recommendations vs random / degree-based isolation baselines
8. **Reporting.**
   - ≥5 seeds, mean±std
   - Wall-clock time and peak RAM on the stated hardware
   - Code, configs and preprocessing scripts released
   - An explicit "comparability" note when quoting published numbers measured under different preprocessing (e.g. Argus's reported 32.27 AP vs 0.09 under realistic preprocessing)

### Gaps
- The exact STRICT checklist (Moon et al.) and the Bilot nine-shortcoming list could not be retrieved. Read both papers to align the protocol checklist item by item.
- No community-standard benchmark exists for LM next-hop forecasting, so Task B metrics are proposed by analogy with TGB and the KG link-prediction literature, not taken from an established LM benchmark.
