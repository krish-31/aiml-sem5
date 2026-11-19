import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AppPage, I, Offline } from "@/components/Chrome"
import { Switch } from "@/components/ui/switch"
import EVAL from "../../../results/eval_synthetic.json"
import {
  getEvents, getNetwork, getNetworks, getSummary, netName, pct, reportUrl, ROLE_NAME,
  type EventLog, type Evaluation, type Network, type NetworkListItem, type Summary,
} from "@/lib/api"

/* -------------------------------------------------------- shared: networks */
function useNetworks() {
  const [list, setList] = useState<NetworkListItem[] | null>(null)
  const [def, setDef] = useState<number | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { getNetworks().then((r) => { setList(r.networks); setDef(r.default) }, () => setErr(true)) }, [])
  return { list, def, err }
}

function NetSelect({ list, value, onChange }: { list: NetworkListItem[] | null; value: number | null; onChange: (v: number) => void }) {
  return (
    <select className="select" aria-label="Network" value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
      {!list && <option>Loading</option>}
      {list?.map((n) => <option key={n.id} value={n.id}>{netName(n.id)} · {n.machines} machines · {n.hops}-hop attack</option>)}
    </select>
  )
}

/* =============================================================== events */
export function Events() {
  const { list, def, err } = useNetworks()
  const [gid, setGid] = useState<number | null>(null)
  const [data, setData] = useState<EventLog | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "flagged" | "high">("flagged")
  const [remote, setRemote] = useState(true)
  const [reveal, setReveal] = useState(false)
  const [q, setQ] = useState("")

  useEffect(() => { if (gid == null && def != null) setGid(def) }, [def, gid])
  useEffect(() => {
    if (gid == null) return
    setData(null); setLoadErr(null)
    getEvents(gid).then((d) => setData(d), (e: Error) => setLoadErr(e.message))
  }, [gid])

  const rows = useMemo(() => {
    if (!data) return []
    const s = q.trim().toLowerCase()
    return data.events.filter((e) =>
      (!remote || e.remote) &&
      (filter === "all" || (filter === "high" ? e.severity === "high" : e.severity === "high" || e.severity === "medium")) &&
      (!s || [e.user, e.src, e.dst].some((x) => x.toLowerCase().includes(s))))
  }, [data, q, remote, filter])

  const s = data?.summary
  return (
    <AppPage title="Login events, checked against the forecast"
      intro="Every machine-to-machine login around the attack. Logins from compromised machines are compared with the forecast made before they happened.">
      {err ? <Offline what="the event log" /> : (
        <>
          <div className="card flex flex-wrap items-center gap-3 p-3">
            <NetSelect list={list} value={gid} onChange={setGid} />
            <input className="search" type="search" placeholder="Search user or machine" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
            <div className="seg">
              {([["all", "All"], ["flagged", "Flagged"], ["high", "High"]] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <span className="flex-1" />
            <label className="flex items-center gap-2.5 text-[13px] text-dim">Remote only <Switch checked={remote} onCheckedChange={setRemote} /></label>
            <label className="flex items-center gap-2.5 text-[13px] text-dim">Reveal attack <Switch checked={reveal} onCheckedChange={setReveal} /></label>
          </div>

          {s && (
            <div className="my-5 flex flex-wrap gap-2">
              <span className="chip">{s.events} events</span>
              <span className="chip">{s.remote} machine-to-machine</span>
              <span className="chip"><span className="sev high">high</span>{s.high}</span>
              <span className="chip"><span className="sev medium">medium</span>{s.medium}</span>
              {reveal && <span className="chip !text-defend">{s.attack_flagged} of {s.attack_events} attack logins flagged · {s.normal_flagged} normal logins flagged</span>}
              <span className="chip">showing {Math.min(rows.length, 600)}{rows.length > 600 ? ` of ${rows.length}` : ""}</span>
            </div>
          )}

          <div className="card overflow-x-auto">
            {!data ? <div className="flex items-center gap-3 p-8 text-dim">{loadErr ? `Could not load events (${loadErr}).` : <><span className="spin" />Scoring events with the model</>}</div>
              : !rows.length ? <div className="p-8 text-dim">No events match these filters.</div> : (
                <table className="table min-w-[980px]">
                  <thead><tr><th>Time</th><th>User</th><th>Connection</th><th>Signals</th><th className="r">Forecast</th><th>Unexpected</th><th>Flag</th>{reveal && <th>Truth</th>}</tr></thead>
                  <tbody>
                    {rows.slice(-600).reverse().map((e, i) => (
                      <tr key={`${e.time}-${i}`} style={reveal && e.attack ? { background: "var(--attack-soft)" } : undefined}>
                        <td className="mono text-[13px] text-dim">{e.label}</td>
                        <td className="mono text-[13px]">{e.user}</td>
                        <td><span className="mono text-[13px]">{e.src} → {e.dst}</span><small>{ROLE_NAME[e.src_role] ?? e.src_role} to {ROLE_NAME[e.dst_role] ?? e.dst_role}</small></td>
                        <td className="space-x-1 whitespace-nowrap">
                          {e.from_compromised && <span className="sev high">from compromised</span>}
                          {e.novel && <span className="chip !h-[22px] !text-[12px]">new route</span>}
                          {!e.remote && <span className="chip !h-[22px] !text-[12px]">local logon</span>}
                        </td>
                        <td className="mono r text-[13px]">{e.forecast_rank == null ? <span className="text-faint">-</span> : `#${e.forecast_rank}`}</td>
                        <td>{e.unexpected == null ? <span className="text-faint">-</span> : (
                          <span className="flex items-center gap-2"><span className="meter cost w-16"><i style={{ width: pct(e.unexpected) }} /></span><span className="mono text-[12px] text-dim">{e.unexpected.toFixed(2)}</span></span>
                        )}</td>
                        <td>{e.severity === "high" || e.severity === "medium" ? <span className={`sev ${e.severity}`}>{e.severity}</span> : <span className="text-[13px] text-faint">{e.severity}</span>}</td>
                        {reveal && <td>{e.attack && <span className="sev attack">hop {e.step}</span>}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="panel p-5 text-[14px] leading-[1.65] text-dim">
              <div className="mb-2 font-medium text-ink">How events are flagged</div>
              <span className="sev high">high</span> a login from a compromised machine to one of the top-3 forecast machines.{" "}
              <span className="sev medium">medium</span> any other login from a compromised machine, or a very unexpected connection.
            </div>
            <div className="panel p-5 text-[14px] leading-[1.65] text-dim">
              <div className="mb-2 font-medium text-ink">What unexpected means</div>
              1 − P(connection this hour) from the model's link head. On its own it is a weak signal, because attackers reuse stolen passwords on routes people use every day; the forecast check is what catches them.
            </div>
          </div>
        </>
      )}
    </AppPage>
  )
}

/* ============================================================== reports */
export function Reports() {
  const { list, def, err } = useNetworks()
  const [gid, setGid] = useState<number | null>(null)
  const [net, setNet] = useState<Network | null>(null)
  const [stage, setStage] = useState(0)
  const [truth, setTruth] = useState(true)
  const [preview, setPreview] = useState<string | null>(null)
  const [recent, setRecent] = useState<{ url: string; name: string; when: string }[]>([])

  useEffect(() => { if (gid == null && def != null) setGid(def) }, [def, gid])
  useEffect(() => { if (gid != null) getNetwork(gid).then((n) => { setNet(n); setStage((s) => (s < n.hops ? s : 0)) }, () => {}) }, [gid])

  const generate = () => {
    if (gid == null) return
    const url = reportUrl(gid, stage, truth)
    setPreview(url)
    setRecent((r) => [{ url, name: `${netName(gid)} · stage ${stage + 1}`, when: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...r].slice(0, 5))
  }

  const contents = [
    "Summary: compromised machines, attacker position, risk and confidence",
    "Recommended response with its risk cut and cost",
    "Network diagram of the attack and the forecast paths",
    "Next-move forecast with probabilities and uncertainty",
    "Top attack paths and the other responses considered",
    "Flagged log events known at that moment",
    "Model reliability on held-out networks",
    "Optional ground-truth appendix",
  ]

  return (
    <AppPage title="Incident forecast reports" intro="Generate a PDF for any network and attack stage, ready to share with an incident-response team.">
      {err ? <Offline what="reports" /> : (
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="card p-6">
            <label className="label mb-2 block">Network</label>
            <NetSelect list={list} value={gid} onChange={(v) => { setGid(v); setStage(0) }} />
            <label className="label mt-6 mb-2 block">Attack stage</label>
            <select className="select w-full" aria-label="Attack stage" value={stage} onChange={(e) => setStage(Number(e.target.value))}>
              {net?.stages.map((t, i) => (
                <option key={i} value={i}>Stage {i + 1} · {i === 0 ? "entry" : `${i} hop${i > 1 ? "s" : ""}`} · {t.iso.slice(5, 16).replace("T", " ")}</option>
              ))}
            </select>
            <label className="mt-6 flex items-center justify-between gap-3 text-[14px]">Include the ground-truth appendix <Switch checked={truth} onCheckedChange={setTruth} /></label>
            <div className="btn-row mt-6">
              <button type="button" className="btn btn--primary" onClick={generate} disabled={gid == null}>Generate the report<I.arrow /></button>
              {gid != null && <a className="btn" href={reportUrl(gid, stage, truth, true)} download><I.download width={16} height={16} />Download PDF</a>}
            </div>
            <div className="label mt-8 mb-3">What the report holds</div>
            <ol className="m-0 space-y-2 pl-5 text-[14px] text-dim">{contents.map((c) => <li key={c}>{c}</li>)}</ol>
            {recent.length > 0 && (
              <>
                <div className="label mt-8 mb-2">Generated this session</div>
                {recent.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="flex justify-between border-b border-line py-2 text-[13px] text-ink no-underline last:border-b-0 hover:text-cyan">
                    <span className="mono">{r.name}</span><span className="text-dim">{r.when}</span>
                  </a>
                ))}
              </>
            )}
          </div>
          <div className="card min-h-[640px] overflow-hidden">
            {preview ? <iframe title="Report preview" src={preview} className="h-full min-h-[640px] w-full border-0 bg-white" />
              : (
                <div className="grid h-full min-h-[640px] place-items-center p-8 text-center text-dim ground-dots">
                  <div className="max-w-[320px]">
                    <I.file width={28} height={28} className="mx-auto mb-4 text-faint" />
                    Pick a network and a stage, then generate the report to preview it here.
                  </div>
                </div>
              )}
          </div>
        </div>
      )}
    </AppPage>
  )
}

/* ============================================================== results */
export function Results() {
  const [s, setS] = useState<Summary | null>(null)
  useEffect(() => {
    // the API's summary when it runs; otherwise the committed results/eval_synthetic.json
    getSummary().then(setS, () => setS({ evaluation: EVAL as unknown as Evaluation, history: [], temperatures: {}, split: { train: 210, val: 45, test: 45 }, model: {}, params: 0 }))
  }, [])
  const ev = s?.evaluation

  return (
    <AppPage title="How well does it forecast?" intro="Measured on networks the model never saw in training, against a rule-based baseline and random guessing."
      aside={ev && <span className="chip">{ev.n_test_networks} unseen networks · {ev.n_predictions} predictions</span>}>
      {!s ? <div className="flex items-center gap-3 text-dim"><span className="spin" />Loading results</div>
        : !ev ? <div className="panel p-6 text-dim">No evaluation yet. Run <span className="mono text-ink">python -m attackpath.eval.evaluate</span>.</div> : (
          <ResultsBody s={s} />
        )}
    </AppPage>
  )
}

function ResultsBody({ s }: { s: Summary }) {
  const ev = s.evaluation!
  const nh = ev.next_hop, ph = ev.path_hit_rate, td = ev.time_to_detection, d = ev.defense
  const OURS = "var(--p-accent)", RULE = "var(--p-muted)", RAND = "var(--p-surface-3)"
  const tiles: [string, string, string, string][] = [
    ["Next hop in the top 5", pct(nh.tgnn.top5), `random guess ${pct(nh.random.top5)}`, "text-predict"],
    ["Caught before the target", pct(td.tgnn.detected_before_target), `rule-based ${pct(td.heuristic.detected_before_target)}`, "text-attack"],
    ["Next-hour link AUC", ev.link.calibrated.auc.toFixed(3), "target in the synopsis 0.90", "text-cyan"],
    ["Risk cut with containment", pct(ev.containment?.mean_risk_drop ?? 0), `blocks ${pct(ev.containment?.mean_normal_blocked ?? 0, 1)} of normal traffic`, "text-defend"],
  ]
  const methods = [["tgnn", "Temporal GNN (ours)"], ["tgnn_uncalibrated", "Temporal GNN, no calibration"], ["heuristic", "Rule-based baseline"], ["random", "Random guess"]] as const
  const best = (key: "top1" | "top3" | "top5" | "mrr") => Math.max(...methods.filter(([m]) => m !== "random").map(([m]) => nh[m][key]))

  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([k, v, n, tone]) => (
          <div key={k} className="card p-5">
            <div className="label">{k}</div>
            <div className={`mono mt-2 text-[38px] leading-none tracking-[-0.03em] max-sm:text-[28px] ${tone}`}>{v}</div>
            <div className="mt-2 text-[13px] text-dim">{n}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Next-hop accuracy" sub="Is the attacker's real next machine in the top k guesses?"
          cats={["Top 1", "Top 3", "Top 5"]}
          series={[
            { color: OURS, name: "Temporal GNN", values: [nh.tgnn.top1, nh.tgnn.top3, nh.tgnn.top5] },
            { color: RULE, name: "Rule-based", values: [nh.heuristic.top1, nh.heuristic.top3, nh.heuristic.top5] },
            { color: RAND, name: "Random", values: [nh.random.top1, nh.random.top3, nh.random.top5] },
          ]} />
        <ChartCard title="Attack paths" sub="Caught before the target, and exact full-path matches."
          cats={["Caught before target", "Full path in top 5", "Full path in top 1"]}
          series={[
            { color: OURS, name: "Temporal GNN", values: [td.tgnn.detected_before_target, ph.tgnn.top5, ph.tgnn.top1] },
            { color: RULE, name: "Rule-based", values: [td.heuristic.detected_before_target, ph.heuristic.top5, ph.heuristic.top1] },
            { color: RAND, name: "Random", values: [null, ph.random.top5, ph.random.top1] },
          ]} />
      </div>

      <div className="card mt-6 overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead><tr><th>Next hop</th><th className="r">Top 1</th><th className="r">Top 3</th><th className="r">Top 5</th><th className="r">MRR</th><th className="r">ECE</th></tr></thead>
          <tbody>
            {methods.map(([m, label]) => {
              const r = nh[m]
              const cell = (key: "top1" | "top3" | "top5" | "mrr") => <td className={`mono r ${r[key] === best(key) ? "text-cyan" : ""}`}>{r[key].toFixed(3)}</td>
              return (
                <tr key={m} style={m === "tgnn" ? { background: "var(--p-accent-soft)" } : undefined}>
                  <td className={m === "tgnn" ? "font-medium" : ""}>{label}</td>{cell("top1")}{cell("top3")}{cell("top5")}{cell("mrr")}<td className="mono r">{r.ece.toFixed(3)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="panel mt-6 grid gap-2 p-5 text-[13px] text-dim">
        <div className="font-medium text-ink">Reference</div>
        <span className="mono">Link forecast: AUC {ev.link.calibrated.auc.toFixed(3)} · AP {ev.link.calibrated.ap.toFixed(3)} · ECE {ev.link.calibrated.ece.toFixed(3)}</span>
        <span className="mono">Next cut: risk cut {pct(d.mean_risk_drop)} · traffic blocked {pct(d.mean_normal_blocked, 1)} · cuts real path {pct(d.cuts_true_path)}</span>
        {ev.containment && <span className="mono">Containment: risk cut {pct(ev.containment.mean_risk_drop)} · traffic blocked {pct(ev.containment.mean_normal_blocked, 1)} · cuts real path {pct(ev.containment.cuts_true_path)}</span>}
        <span className="mono">Model: {s.params ? `${s.params.toLocaleString()} parameters · ` : ""}split {s.split.train}/{s.split.val}/{s.split.test} networks · temperature {(s.temperatures.hop ?? (ev as unknown as { temperatures?: { hop?: number } }).temperatures?.hop ?? 1).toFixed(2)}</span>
        <span className="mt-1 text-[14px]">Synthetic data only so far. Full-path accuracy is low because a path needs 3 to 6 correct guesses in a row, so being caught before the target is the more useful measure. LANL, CICIDS2017 and UNSW-NB15 come next.</span>
      </div>
    </>
  )
}

function ChartCard({ title, sub, cats, series }: { title: string; sub: string; cats: string[]; series: { color: string; name: string; values: (number | null)[] }[] }) {
  const W = 560, H = 240, padL = 40, padB = 30, padT = 20, iw = W - padL - 8, ih = H - padB - padT
  const gw = iw / cats.length, gap = 6
  const bw = Math.min(34, (gw - 28 - gap * (series.length - 1)) / series.length)
  const y = (v: number) => padT + ih - ih * v
  return (
    <div className="card p-5">
      <h3 className="!text-[17px] !tracking-[-0.01em]">{title}</h3>
      <div className="mt-1 text-[13px] text-dim">{sub}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="mt-4 w-full" style={{ fontFamily: "var(--font-mono)" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}><line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--p-line)" /><text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--p-faint)">{pct(t)}</text></g>
        ))}
        {cats.map((c, ci) => {
          const x0 = padL + ci * gw + (gw - (bw * series.length + gap * (series.length - 1))) / 2
          return (
            <g key={c}>
              {series.map((s, si) => {
                const v = s.values[ci]
                if (v == null) return null
                const x = x0 + si * (bw + gap)
                return (
                  <g key={si}>
                    <rect x={x} y={y(v)} width={bw} height={Math.max(1, padT + ih - y(v))} rx="3" fill={s.color} />
                    <text x={x + bw / 2} y={y(v) - 5} textAnchor="middle" fontSize="10.5" fill="var(--p-muted)">{pct(v)}</text>
                  </g>
                )
              })}
              <text x={padL + ci * gw + gw / 2} y={H - 8} textAnchor="middle" fontSize="11.5" fill="var(--p-muted)" style={{ fontFamily: "var(--font-text)" }}>{c}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-5 text-[12.5px] text-dim">
        {series.map((s) => <span key={s.name} className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />{s.name}</span>)}
      </div>
    </div>
  )
}

/* =============================================================== method */
export function Method() {
  const arch = [
    ["Input", "Hourly graph", "Users and machines as nodes, logins as edges.", "var(--server)"],
    ["Encoder", "2 × GAT", "Graph attention, 4 heads, hidden size 64.", "var(--p-accent)"],
    ["Memory", "GRU", "Carries each node's state across hours.", "var(--p-accent)"],
    ["Heads", "Link + next hop", "Calibrated with temperature scaling.", "var(--predict)"],
    ["Decision", "Paths + response", "Yen's top-k paths and a defense simulator.", "var(--defend)"],
  ]
  const prose: [string, React.ReactNode][] = [
    ["Data", <><b className="font-medium text-ink">300 synthetic networks</b> with 7 days of normal logins and one 3 to 6 hop attack each. The attacker steals credentials and prefers admin machines. Attacks are <b className="font-medium text-ink">0.16%</b> of events.</>],
    ["Training", <>Split <b className="font-medium text-ink">210 / 45 / 45</b> by network. Predictions for hour <code>t+1</code> use only hours up to <code>t</code>. Cross-entropy with negative sampling, Adam and early stopping.</>],
    ["Paths and defense", <>Each move costs <code>−log p</code>; Yen's algorithm ranks the top-k routes. The simulator picks the action with the best <code>risk removed − traffic blocked</code>.</>],
  ]
  const stack = ["Python 3.11", "PyTorch", "PyTorch Geometric", "NetworkX", "scikit-learn", "FastAPI", "React", "GSAP"]
  return (
    <AppPage title="How it works" intro="A temporal graph neural network reads the network hour by hour; path search and a defense simulator turn its probabilities into a decision.">
      <div className="card grid grid-cols-1 gap-px overflow-hidden bg-line md:grid-cols-5">
        {arch.map(([lbl, t, p, c], i) => (
          <div key={t} className="relative bg-surface p-6">
            <div className="flex items-center gap-2 text-[13px] text-dim"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{lbl}</div>
            <h3 className="mt-4 !text-[20px]">{t}</h3>
            <p className="mt-2 text-[14px] leading-[1.6] text-dim">{p}</p>
            <span className="mono absolute top-6 right-6 text-[12px] text-faint">{String(i + 1).padStart(2, "0")}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {prose.map(([h, body]) => (
          <div key={h} className="card p-6">
            <h3 className="!text-[18px] !tracking-[-0.01em]">{h}</h3>
            <p className="mt-3 text-[15px] leading-[1.65] text-dim [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-[13px] [&_code]:text-ink">{body}</p>
          </div>
        ))}
      </div>
      <div className="card mt-6 flex flex-wrap items-center gap-2 p-5">
        <span className="label mr-2">Built with</span>
        {stack.map((c) => <span key={c} className="chip">{c}</span>)}
        <span className="flex-1" />
        <Link className="link text-[14px]" to="/console">See it run in the console</Link>
      </div>
    </AppPage>
  )
}
