# Presenting Lateralis (8–9 min)

Two pages, both open with a double-click (no install, no server):

- `demo/index.html`: the **website** (what Lateralis is, how it works, download and setup). Plain
  language, no metrics, for a first-time audience.
- `demo/simulation.html`: the **simulation** (attack replay, event stream, results, pipeline).
  Linked from the website ("Watch a simulated attack") and back again with **← HOME**.

Or serve the folder: `python -m http.server 8080` → http://localhost:8080/demo/
Press **F** in the simulation for fullscreen.

The website's 3D network loads three.js and GSAP from cdnjs, so it needs internet. Offline (or on a
phone, or with reduced motion on) it shows a still picture of the same network instead.

## Controls

| Key | Action |
|---|---|
| `Enter` | skip boot / jack in |
| `1`–`5` | Lobby · War Room · Event Stream · Model Intel · Pipeline |
| `Space` | play / pause the attack replay |
| `→` / `←` | next / previous hop |
| `D` | deploy the recommended countermeasure |
| `R` | reveal ground truth |
| `0` | rewind |
| `` ` `` | hacker terminal (`help`, `scan`, `forecast`, `paths`, `defend`, `stats`) |
| `F` | fullscreen |

Open `simulation.html#skip` to jump straight past the boot screen.

## What every part of the simulation means

**The one line to keep coming back to:** hackers don't go straight for the important server. They break
into one PC and hop machine to machine with stolen passwords. Lateralis reads the logins, forecasts the
next hop and recommends one fix that blocks it.

### Top bar (every screen)

| Item | Meaning |
|---|---|
| ← HOME | back to the website |
| 01–05 tabs | the five screens (keys `1`–`5`) |
| TGNN-CORE ONLINE | the temporal graph neural network is loaded |
| THREAT meter | 8 bars, GUARDED → ELEVATED → SEVERE → CRITICAL: how close the attacker is to the critical servers; it follows the War Room |
| Clock | live time, IST |
| `` ` `` terminal | console with `help`, `scan`, `forecast`, `paths`, `defend`, `stats` |
| Bottom ticker | headline facts: 263-day breach dwell time in India, model scores, MITRE T1021 / T1078 / T1550 |

### 1. Lobby: what the project is

| Element | Meaning |
|---|---|
| Headline and paragraph | the network as a graph that changes every hour: machines and users are nodes, logins are edges |
| Six KPI tiles | the headline results from the real test run (explained under Model Intel) |
| Active Operations | the 45 held-out networks the model never trained on |
| Agent Roster | the pipeline modules: graph builder, temporal GNN, calibrator, pathfinder, defender |
| System Log | the modules starting up |

### 2. War Room: the replay of NET-062

The map: green dots are workstations, cyan are servers, purple diamonds are the critical domain
controller (it holds every password) and database, red is compromised, orange halos and lines are the
forecast, a thick cyan line with an X is a blocked connection. The real attack is
C2 → C111 → C57 → C67 (the domain controller).

| Panel | Meaning |
|---|---|
| Breach Risk gauge | chance the attacker reaches the domain controller or database from where they are now; also shows where the attacker is, hops so far (of 3) and model confidence |
| Next-Hop Forecast | the five machines most likely to be hit next, with probabilities. "Calibrated · T=1.01": when it says 30%, it is right about 30% of the time |
| Top Attack Paths | the five most likely full routes to the critical servers. Each probability becomes a distance (−log p), so the shortest path is the most likely one; Yen's algorithm finds the top five |
| Countermeasure | the one recommended fix, with the risk it removes and the share of normal traffic it blocks (under 1%). Below it, the heavier containment option: isolate the whole PC, more risk removed, 4–8% of normal traffic blocked |
| Live Telemetry | incoming logins and each module's output as the attack moves |

Risk on the gauge: 41% at C2, 68% at C111, 87% at C57. With the countermeasure deployed at C57 it falls
to 37%, and once the hop bounces off the shield (ATTACK CONTAINED) it reads 12%.

### 3. Event Stream: why ordinary tools miss it

| Column | Meaning |
|---|---|
| Unexpected (single-event) | how strange that one login looks on its own |
| Forecast rank | where the destination sat in the model's next-hop forecast |
| Severity | Lateralis's flag |
| Truth | whether the login was really the attack (shown after REVEAL ATTACK) |

The point: the attack logins score as normal on their own, because they use real stolen passwords on
everyday routes. They are flagged because they leave a compromised machine and land where the model
predicted. All three attack logins are flagged.

### 4. Model Intel: the real numbers (`results/eval_synthetic.json`)

| Tile | Value | Plain meaning |
|---|---|---|
| Link forecast AUC | 0.970 | tells real future logins from ones that won't happen 97% of the time (0.5 = coin flip) |
| Next hop in top-5 | 70% | the real next machine is in the top five guesses (random: 9%) |
| Top-1 lift vs random | ~12.7× | the single best guess against random guessing |
| Caught before target | 73% | attacks flagged before reaching a critical server (rule-based: 56%) |
| Risk cut by containment | 51% | isolating the compromised PC removes about half the risk |
| Normal traffic blocked | 0.27% | what the recommended next cut costs in normal work |

Charts: next-hop accuracy over 196 predictions on 45 unseen networks (GNN vs rule-based vs random; the
GNN wins every metric); the training run (145,666 parameters, early stop at epoch 19); the head-to-head
table; the defense trade-off (next cut is cheap, containment is strong: contain first, then cut); and
calibration error, 0.095 for the GNN vs 0.198 for rules.

### 5. Pipeline: how it works (click a stage)

1. **Ingest**: login logs (time, user, source, destination), LANL 2015 format.
2. **Graph**: hourly snapshots; the network becomes a movie, not a photo.
3. **Embed**: two graph attention (GAT) layers; each machine weighs its important neighbours.
4. **Remember**: a GRU carries each machine's state across hours and notices new movement.
5. **Predict**: score every candidate login; a softmax over the compromised machine's neighbours gives the next hop.
6. **Calibrate**: temperature scaling keeps the percentages honest.
7. **Rank**: Yen's algorithm on −log p for the top-5 full routes.
8. **Defend**: simulate each action (isolate, revoke, block); score = risk removed − λ × normal traffic blocked; recommend the best.

### Hard questions

- **Why a graph neural network?** Attacks are about connections between machines, and the network
  changes every hour: GAT handles the connections, the GRU handles time.
- **Why not rules or anomaly detection?** The attacker uses valid stolen passwords, so each login looks
  normal (Event Stream), and the GNN beats the rule-based baseline on every metric.
- **Is the data real?** Synthetic networks in the real LANL 2015 log format; retraining on LANL and
  DARPA OpTC is next.
- **Weak spot?** Guessing the whole path exactly is hard (in the top five about 17% of the time), which
  is why Lateralis acts on the next hop (70%) and cuts there.

## Script

**Start on the website (1 min).** Open `index.html`. Point at the 3D network in the hero: the intruder
moves laptop → server → server, the domain controller lights up as the next target, and a shield blocks
the last step (move the mouse over it to turn the network). Scroll once: the alerts window, setup in 3
steps, the statement that lights up word by word, the assistants, the install window (switch the
Windows / macOS tabs, press a Copy button), the questions. Then click **Watch a simulated attack**.

**0. Boot (15 s).** Let the boot log run, press Enter.
> "This is Lateralis: it forecasts where a hacker moves next inside a company network, and cuts them off."

**1. Lobby (45 s).** Point at the headline and the KPI tiles.
> "Attackers don't hit the database in one step. They land on one PC and hop machine to machine using
> stolen passwords. In India a breach takes ~263 days to find. Each login looks normal on its own,
> so I model the network as a graph that changes every hour and forecast the next hop."

Point at the agent roster: "The system is a pipeline of modules: graph builder, temporal GNN, calibrator, pathfinder, defender."

**2. War Room (3 min).** This is the wow moment. Press `2`.
1. "Network 62, from the test set; the model never trained on it. Red is the infected PC, C2. Purple diamonds are the domain controller and database."
2. "Orange halos are the model's next-hop probabilities; orange lines are the most likely full routes to the crown jewels." Point at the right panel (risk gauge, ranked hops, paths).
3. Press `Space`. The attacker hops C2 → C111 → C57; the risk gauge climbs, the feed on the left streams logins and model output. Let it reach the DC → red alarm: **"DOMAIN CONTROLLER COMPROMISED"**.
4. "That's without defense. Now rewind." Press `0`, then `→` twice (attacker at C57), press `R` (truth: the real next hop is in the top 2), then `D` to deploy the countermeasure.
5. Press `Space`: the hop bounces off the shield → **"ATTACK CONTAINED"**, risk drops to 12%. "The simulator picked the cut that removes the most risk while blocking less than 1% of normal traffic."

**3. Event Stream (45 s).** Press `3`, click **Reveal attack**.
> "Judged one by one, attack logins look normal: low 'unexpected' scores. They're flagged HIGH because they leave a compromised machine and land where the model predicted. All 3 attack logins flagged."

**4. Model Intel (1 min).** Press `4`.
> "45 unseen networks, 196 predictions. Next hop is in the top 5 70% of the time vs 9% random, about 13× random at top-1, and better than the rule-based baseline on every metric. Calibration error is half the baseline's, so the probabilities can be trusted. 73% of attacks are flagged before reaching the target."

**5. Pipeline (45 s).** Press `5` and let it auto-cycle, or click stages.
> "Logs → hourly graphs → graph attention → GRU memory → link decoder → temperature calibration → Yen's top-k paths → defense simulator."

**6. Close (30 s).** "Next: retrain on the real LANL 2015 enterprise dataset and DARPA OpTC, then add LLM agents for triage and reports." (See ROADMAP.md.)

## If asked "is this live?"

Answer straight: the War Room is a **replay** of the NET-062 incident. The network, the logins and the
attack path are the real test-set data; the forecast numbers on screen are scripted to illustrate the
model's behaviour on that incident. Every number on **Model Intel** comes from the real evaluation run
(`results/eval_synthetic.json`, `results/train_log.txt`), and the full pipeline runs with
`python -m attackpath.api.server` (see DEMO.md).

## Rebuild

```bash
python demo/build_demo.py     # re-bakes demo/simulation.html from demo/lobby.template.html + results/
```
