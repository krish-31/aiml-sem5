# Demo guide (for the professor meeting)

## Before the meeting (one time, ~30 min total)
```bash
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -e ".[dev,ml,app]"
.venv/bin/python -m attackpath.data.synthetic --n-graphs 300      # ~10 s
.venv/bin/python -m attackpath.graph.builder                      # ~15 s
.venv/bin/python -m attackpath.models.train                       # ~15–25 min on a laptop CPU
.venv/bin/python -m attackpath.eval.evaluate                      # ~2 min
```
Then start the web app and leave it open:
```bash
.venv/bin/python -m attackpath.api.server
```
Open http://127.0.0.1:8000. It opens on the **Overview** page; the sun/moon button switches dark and light mode.
Open the **Live console** once before the meeting so the demo network is warmed up.
(The older Streamlit dashboard still works as a backup: `.venv/bin/streamlit run app/dashboard.py`.)

---

## The 5-minute demo

### 1. The problem (30 s, Overview page)
> "Attackers don't hit the database in one step. They break into one PC, steal passwords, and hop
> machine to machine. In India a breach takes about 263 days to find. Most tools judge each login on its own.
> I want to **forecast the next hop** and **block it before it happens**."

Scroll to "Observe. Forecast. Defend." and the 8-stage pipeline: logs → hourly graph → temporal GNN →
calibration → top-k paths → defense → console.

### 2. Live forecast (2.5 min, Live console page)
1. Pick a network. Say: *"This company is from the test set; the model has never seen it."*
2. **Slider at 0.** *"We only know one PC is infected (red). The model reads the logs up to now and gives
   each machine a probability of being the next hop (bigger dot = more likely). The orange lines are the most
   likely complete routes to the domain controller or database (purple diamonds)."*
3. Point at **Recommended defense**: *"The simulator tried isolating machines and removing access, and
   picked the action that cuts the most risk while blocking the least normal traffic."*
4. **Press the next arrow (or Play, or the → key).** The attacker moves (red trail), the forecast updates, and the risk usually rises
   as they get closer.
5. **Turn on "Reveal true path".** The dotted line is the truth. Rows marked ACTUAL and
   paths marked "matches real path" show where the model was right. The timeline at the bottom fills in too.

**Good networks to show** (all from the test set):
- **#62** (default, 3 hops): the true next hop is in the top 3 at every step. At 1 hop observed, the model's
  #1 guess (C57) is exactly right and the real path is in the top 5.
- **#184** (6 hops): a longer attack. The true next hop is in the top 3 for 5 of 6 hops.

### 3. Results (1 min, Results page)
45 unseen test networks, 196 next-hop predictions:

| | Temporal GNN | Rule-based | Random |
|---|---|---|---|
| Next hop in top 1 / 3 / 5 | **24% / 50% / 70%** | 18% / 48% / 66% | 2% / 6% / 9% |
| Calibration error (ECE, lower is better) | **0.095** | 0.198 | n/a |
| True full path in top 5 | **17%** | 14% | 0% |
| Attack caught before target | **73%** | 56% | n/a |

- **Link forecast** (all traffic, next hour): AUC **0.970**, ECE 0.007 (synopsis target AUC ≥ 0.90).
- **Defense**: the recommended action cuts path risk by **51%** on average while blocking **5.9%** of
  normal traffic, and it cuts the attacker's real remaining path **60%** of the time.

Say it honestly: *"Next-hop is about 10× better than random and beats the rule-based baseline on every
metric. The synthetic attacker still makes partly random choices, so 100% isn't possible; even a linear model
on the same clues tops out around 70% top-5."*

**Gaps vs the synopsis targets (and the plan):** exact full-path top-5 is 17% (target 70%), because a path needs
3–6 correct guesses in a row. Next steps: score paths with the GNN at every step instead of reusing one
snapshot, and add time-to-detection as the main path metric. Temperature scaling barely changed things
(T ≈ 1.01): the model is already well calibrated.

### 4. What's next (30 s)
> "Everything runs end to end on synthetic data. Next I plug in the real LANL authentication logs (1.6 B events,
> red-team labels), then CICIDS2017 and UNSW-NB15, add the three baselines from the synopsis and the ablation study."

---

## Likely questions

**Why synthetic data?** Public logs label single attack events but never the full path an attacker took.
To measure path forecasting you need ground-truth paths, so I generate them. The attacker is goal-driven
(it prefers machines where admins log on, i.e. credential dumping, MITRE ATT&CK T1003), which matches how real
lateral movement works. Real datasets come next.

**Isn't the attack obvious from the logs?** I checked for shortcuts. In the first version, normal users only
ever logged on from their own desk, so "logged on from elsewhere" gave away every attack. I fixed that: normal
users also roam (8% of normal logins come from another machine), and attacks are only 0.16% of events.

**Why does it often say "isolate the infected PC"?** Because that is usually the right call: it removes all
paths at small cost. Later in the attack, when the attacker holds several machines, the recommendation shifts
to blocking specific access paths.

**What's the GNN actually learning?** Each hour, graph attention combines a machine's own activity with its
neighbours'; the GRU remembers earlier hours; the hop head scores "attacker on u → v next" using both machines'
states plus history facts (have they talked before, how many users log on to both, i.e. which stolen passwords
would work).

**Why is exact full-path accuracy lower than next-hop accuracy?** A 4-hop path needs four correct guesses in a
row among ~50 machines, so errors multiply. That's why I also report time-to-detection: how many hops before the
target the true path enters the top 5.

**How is this different from Euler / DyMHAG / SPGNN-API?** Those detect odd edges or predict threats or find
static paths. This joins next-hop forecasting, calibrated probabilities, full path ranking and a defense
simulator in one pipeline, evaluated with path hit rate and time-to-detection.
