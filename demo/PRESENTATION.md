# Presenting Lateralis (8–9 min)

Two pages, both open with a double-click (no install, no server):

- `demo/index.html`: the **website** (what Lateralis is, how it works, download and setup). Plain
  language, no metrics, for a first-time audience.
- `demo/simulation.html`: the **simulation** (attack replay, event stream, results, pipeline).
  Linked from the website ("Try the simulation") and back again with **← HOME**.

Or serve the folder: `python -m http.server 8080` → http://localhost:8080/demo/
Press **F** in the simulation for fullscreen.

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

## Script

**Start on the website (1 min).** Open `index.html`. Scroll once through it: the hero animation (intruder
hops, gets blocked), "The problem", "How it works" in three steps, the four AI assistants, and the
install section (switch Windows/macOS tabs, show a Copy button). Then click **Try the simulation**.

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
