# Roadmap: from scratch to end product

The project is built as a chain of stages. Each stage reads the previous stage's
output from disk, so every stage can be built, tested and rerun on its own.

```
 logs ─► [1] data ─► [2] clean ─► [3] graph ─► [4] model ─► [5] calibrate
                                                                 │
 dashboard ◄─ [8] app ◄─ [7] defense sim ◄─ [6] path ranking ◄───┘
```

The golden rule: **build the whole chain end to end on small synthetic data
first**, then swap in the big real datasets. That way a working demo exists
early, and every later step is an improvement, not a rescue.

---

## Milestone 0: Project setup (week 1)
- Folder structure, `pyproject.toml`, virtual env (`uv`, Python 3.11).
- Git repo + GitHub.
- **Done when:** `pytest` runs and passes.

## Milestone 1: Synthetic attack graphs (weeks 1–2) ← *we are here*
`src/attackpath/data/synthetic.py`
- Generate a few hundred small fake company networks: workstations, servers,
  a domain controller and database servers (the critical assets), plus users and admins.
- Simulate several days of normal logins (office hours, weekends, rare benign oddities).
- Inject one attack per network: 3–6 hops from a random entry workstation to a
  critical asset, stealing credentials along the way.
- Output uses the same shape as the LANL logs (`time, user, src, dst`), so
  everything downstream works on both.
- **Output:** `data/synthetic/{events,nodes,attacks}.parquet`
- **Done when:** every network has a valid labeled attack path.

## Milestone 2: Real datasets (weeks 4–5)
`src/attackpath/data/lanl.py`, `cicids.py`, `unsw.py`
- **LANL:** download `auth.txt.gz` + `redteam.txt.gz`. The full file has 1.65 B rows,
  which won't fit in 8 GB of RAM, so stream it in chunks and keep only the window
  around the red-team activity (plus the hosts involved). Save as Parquet.
- **CICIDS2017 / UNSW-NB15:** load the CSVs and map each flow to `time, src_ip, dst_ip, label`
  (machine-only graph; these have no users).
- Cleaning: drop duplicates and broken rows, unify timestamps, map names to integer IDs,
  label attack edges.
- **Done when:** all datasets share one common event format.

## Milestone 3: Temporal graph builder (week 6)
`src/attackpath/graph/builder.py`
- Cut events into 1-hour windows → one graph snapshot per window.
- Heterogeneous nodes (user, computer, …) and edge types (user→computer
  "authenticates", computer→computer "connects").
- Node features: type, degree, activity counts, "first time seen" flags.
- Time-based split 70/15/15 (never random, so the model never sees the future).
- Negative sampling: for each real edge, sample fake edges that did *not* happen.
- **Output:** a list of PyTorch Geometric `HeteroData` snapshots.

## Milestone 4: Temporal GNN (weeks 8–10)
`src/attackpath/models/tgnn.py`, `train.py`
- **Encoder:** 2 GAT layers, 4 heads, hidden size 64, separate weights per node/edge type.
- **Memory:** GRU carries each node's embedding from window t to t+1.
- **Decoder:** 2-layer MLP on (node A, node B) → probability the edge appears at t+1.
- Loss: binary cross-entropy with negative sampling. Adam, lr 0.001, dropout 0.2,
  early stopping, batch 1,024 edges, up to 50 epochs.
- Train locally on synthetic data; train on LANL in Colab (T4 GPU).
- Track runs in Weights & Biases.
- **Target:** AUC-ROC ≥ 0.90 on the LANL test split.

## Milestone 5: Calibration + uncertainty (week 10)
`src/attackpath/models/calibrate.py`
- Temperature scaling fitted on the validation set.
- Uncertainty = entropy of the calibrated probability.
- **Target:** expected calibration error < 0.05.

## Milestone 6: Attack-path ranking (week 11)
`src/attackpath/paths/rank.py`
- Edge cost = −log(p). Run Yen's k-shortest paths (NetworkX) from the compromised
  node(s) to the critical assets.
- Path score = product of its edge probabilities.
- **Target:** top-5 path hit rate ≥ 70% on synthetic test graphs, plus time-to-detection.

## Milestone 7: Defense simulator (week 12)
`src/attackpath/defense/simulator.py`
- Candidate actions: isolate a node, or remove a user's privilege edge.
- For each action, delete those edges, re-rank paths, and compute
  `utility = drop in total path risk − penalty × normal connections blocked`.
- Recommend the highest-utility action.
- **Target:** ≥ 30% risk cut while blocking < 10% of normal traffic.

## Milestone 8: Dashboard (week 13)
`src/attackpath/api/` (FastAPI) + `app/dashboard.py` (Streamlit)
- Replay logs in time order (it's a research prototype, not live).
- Show the graph, the compromised node, the top-k predicted paths with probabilities
  and uncertainty, and the recommended action with its risk reduction.
- Store results in SQLite; package with Docker.

## Milestone 9: Evaluation (weeks 14–16)
`src/attackpath/eval/`
- Baselines: (1) logistic regression on node embeddings, (2) GAT on single snapshots,
  (3) Euler-style GCN + GRU.
- Ablations: remove the GRU, remove calibration.
- 5-fold walk-forward validation, 3 seeds each, report mean ± std.
- Fairness check: false-positive rate for admins vs normal users.
- Metrics: AUC, AP, precision/recall/F1, top-k hit (k=1,3,5), time-to-detection,
  ECE, Brier score, latency, memory.

## Milestone 10: Write-up (weeks 17–18)
- Final report, conference paper draft, presentation + live demo.

---

## Folder layout (grows as milestones land)
```
aiml/
├── ROADMAP.md            this file
├── pyproject.toml        dependencies
├── src/attackpath/
│   ├── data/             M1–M2: synthetic + dataset loaders
│   ├── graph/            M3: snapshot builder
│   ├── models/           M4–M5: temporal GNN, training, calibration
│   ├── paths/            M6: Yen's k-shortest ranking
│   ├── defense/          M7: simulator
│   ├── eval/             M9: metrics, baselines
│   └── api/              M8: FastAPI backend
├── app/                  M8: Streamlit dashboard
├── notebooks/            exploration, Colab training
├── tests/
└── data/                 (git-ignored) raw/, processed/, synthetic/
```
