import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import EVAL from "../../../results/eval_synthetic.json"
import { SNAP, offlineForecast, offlineNetwork } from "@/lib/offline"
import { Closing, I, PRIMARY } from "@/components/Chrome"
import { NetMap } from "@/components/NetMap"
import {
  getForecast, getNetwork, getNetworks, netName, pct, rankOf, sameList, sleep,
  type Forecast, type Network, type NetworkListItem,
} from "@/lib/api"

gsap.registerPlugin(ScrollTrigger)

const ev = EVAL
const h = (n: number) => ({ ["--h" as string]: n })

/* =================================================================== page */
export default function Landing() {
  return (
    <main id="main">
      <Hero />
      <ConsoleFrame />
      <Steps />
      <Pipeline />
      <Results />
      <PriorWork />
      <Questions />
      <Closing />
    </main>
  )
}

/* ------------------------------------------------- shared: the demo data */
/* Live: the model's forecasts from the API. Offline: the recorded network and attack from
   dataset/ (src/data/snapshot.json), with no forecast numbers, since those only come from the model. */
interface Demo { net: Network; fcs: Forecast[]; list: NetworkListItem[]; offline: boolean }

function offlineDemo(): Demo {
  const net = offlineNetwork()
  return { net, fcs: Array.from({ length: net.hops }, (_, k) => offlineForecast(k)), list: SNAP.networks, offline: true }
}

let demoP: Promise<Demo> | null = null
function loadDemo(): Promise<Demo> {
  if (!demoP) {
    demoP = (async () => {
      try {
        const { networks, default: gid } = await getNetworks()
        const net = await getNetwork(gid)
        const fcs = await Promise.all(Array.from({ length: net.hops }, (_, s) => getForecast(gid, s)))
        return { net, fcs, list: networks, offline: false }
      } catch {
        return offlineDemo()
      }
    })()
  }
  return demoP
}
function useDemo() {
  const [d, setD] = useState<Demo | null>(null)
  useEffect(() => { loadDemo().then(setD) }, [])
  return { d }
}

/* ===================================================================== hero */
type Line = { id: number; t: string; k: string; tone: string; v: React.ReactNode }

function Hero() {
  return (
    <section className="screen ground-lit" style={{ ...h(1), paddingTop: "calc(var(--nav) + var(--hgap))", paddingBottom: "calc(var(--hpadb) + var(--bar))" }}>
      <div className="wrap grid12 h-full max-lg:flex max-lg:flex-col max-lg:gap-8">
        <div className="col-span-5 flex flex-col">
          <p className="mb-4 flex items-center gap-2 text-[14px] text-dim">
            <span className="live-dot" /> Tested on {ev.n_test_networks} networks the model never saw
          </p>
          <h1>Attack-path forecasting for security teams</h1>
          <p className="lead mt-6 max-w-[42ch]">
            Lateralis reads login logs hour by hour, predicts the machine an intruder moves to next, ranks the routes to your critical servers and names the one cut that blocks them.
          </p>
          <div className="btn-row mt-8">
            <Link to="/console" className="btn btn--primary">{PRIMARY}<I.arrow /></Link>
            <Link to="/results" className="btn">See the results</Link>
          </div>
        </div>
        <div className="col-span-6 col-start-7 min-h-[300px] max-lg:flex-1">
          <Intercept />
        </div>
      </div>
    </section>
  )
}

/* The hero's one timed loop: a held-out attack replayed stage by stage. */
function Intercept() {
  const { d } = useDemo()
  const [stage, setStage] = useState(0)
  const [lines, setLines] = useState<Line[]>([])
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => {
    if (!d) return
    let alive = true
    let id = 0
    const { net, fcs } = d
    const nm = (i: number) => net.nodes[i].name
    const K = net.hops
    const wait = async (ms: number) => {
      const end = Date.now() + ms
      while (alive && (Date.now() < end || pausedRef.current)) await sleep(100)
    }
    const add = (t: string, k: string, tone: string, v: React.ReactNode) =>
      alive && setLines((ls) => [...ls, { id: ++id, t, k, tone, v }].slice(-7))
    const truth = fcs[0].truth.remaining
    const firstHit = fcs.findIndex((f) => f.paths.some((p) => sameList(p.nodes, f.truth.remaining)))
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    // offline: replay the recorded attack (real hops, times and users), no forecast
    if (d.offline) {
      ;(async () => {
        while (alive) {
          setLines([])
          add("--:--", "SYS", "text-dim", <>recorded attack on <b>{netName(net.id)}</b> · model offline</>)
          for (let s = 0; s < K && alive; s++) {
            setStage(s)
            const h = SNAP.hops[s]
            await wait(600)
            if (s === 0) add(h.time.slice(11, 16), "ALERT", "text-attack", <>initial access on <b>{nm(h.src)}</b> · {net.nodes[h.src].label.toLowerCase()}</>)
            await wait(900)
            add(h.time.slice(11, 16), "HOP", "text-predict", <><b>{nm(h.src)} → {nm(h.dst)}</b> · user {h.user} · {net.nodes[h.dst].label.toLowerCase()}</>)
            await wait(reduced ? 600 : 2000)
          }
          const t = net.nodes[SNAP.path[SNAP.path.length - 1]]
          add("", "TARGET", "text-attack", <><b>{t.name}</b> reached · {t.label.toLowerCase()}</>)
          await wait(4200)
        }
      })()
      return () => { alive = false }
    }

    ;(async () => {
      while (alive) {
        setLines([])
        add("--:--", "SYS", "text-dim", <>replaying a held-out attack on <b>{netName(net.id)}</b></>)
        for (let s = 0; s < K && alive; s++) {
          const fc = fcs[s]
          const t = fc.as_of.iso.slice(11, 16)
          setStage(s)
          await wait(500)
          if (s === 0) add(t, "ALERT", "text-attack", <>initial access on <b>{nm(fc.current)}</b></>)
          else {
            const r = rankOf(fcs[s - 1], fc.current)
            add(t, "HOP", r <= 3 ? "text-defend" : "text-predict", <><b>{nm(fc.footholds[s - 1])} → {nm(fc.current)}</b> · forecast rank #{r}</>)
          }
          await wait(800)
          add("", "FCAST", "text-predict", fc.next_hops.slice(0, 3).map((x) => `${nm(x.node)} ${pct(x.prob)}`).join(" · "))
          await wait(800)
          const a = fc.actions[0]
          if (a) add("", "CUT", "text-cyan", <>{a.kind === "isolate" ? `isolate ${nm(a.nodes[0])}` : `revoke ${nm(a.nodes[0])} → ${nm(a.nodes[1])}`} · risk −{pct(a.risk_drop)}</>)
          await wait(reduced ? 600 : 1900)
        }
        if (!alive) return
        const last = fcs[K - 1]
        const target = truth[truth.length - 1]
        const r = rankOf(last, target)
        add("", "HOP", r <= 3 ? "text-defend" : "text-predict", <><b>{nm(last.current)} → {nm(target)}</b> · forecast rank #{r}</>)
        await wait(700)
        add("", "VERDICT", "text-defend", firstHit >= 0
          ? `true path was in the top 5, ${K - firstHit} hop${K - firstHit > 1 ? "s" : ""} before the target`
          : "true path never entered the top 5")
        await wait(4200)
      }
    })()
    return () => { alive = false }
  }, [d])

  // a new log line slides in (inside the looping visual only)
  useLayoutEffect(() => {
    const el = logRef.current?.lastElementChild
    if (el && !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      gsap.fromTo(el, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" })
  }, [lines])

  const fc = d?.fcs[stage]
  const cut = fc?.actions[0]
  const nm = (i: number) => d!.net.nodes[i].name

  return (
    <div className="card relative flex h-full flex-col overflow-hidden ground-dots" style={{ backgroundColor: "var(--p-surface)" }}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3 text-[13px]">
        <span className="mono text-dim">{d ? `${netName(d.net.id)} · ${d.net.nodes.length} hosts · unseen in training` : "connecting to the model"}</span>
        <span className="mono flex items-center gap-2 text-dim">
          {d?.offline && <span className="rounded-[3px] border border-line px-1.5 text-[11.5px]">recorded</span>}
          {d ? `stage ${stage + 1}/${d.net.hops}` : "--"}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        {d && fc ? <NetMap net={d.net} fc={fc} k={2} reveal={d.offline} className="absolute inset-0" />
          : <div className="grid h-full place-items-center"><span className="spin" /></div>}
        {d?.offline && (
          <div className="absolute bottom-4 left-4 w-[300px] max-w-[calc(100%-2rem)] rounded-md border border-line bg-surface-2 p-4 max-sm:hidden">
            <div className="label flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-attack" />Recorded attack route</div>
            <div className="mono mt-2 flex flex-wrap items-center gap-1 text-[13px]">
              {SNAP.path.map((v, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className={i === SNAP.path.length - 1 ? "text-critical" : i <= stage ? "text-attack" : "text-dim"}>{d.net.nodes[v].name}</span>
                  {i < SNAP.path.length - 1 && <span className="text-faint">→</span>}
                </span>
              ))}
            </div>
            <div className="mt-2 text-[13px] text-dim">Target: {d.net.nodes[SNAP.path[SNAP.path.length - 1]].label.toLowerCase()}</div>
          </div>
        )}
        {cut && (
          <div className="absolute bottom-4 left-4 w-[300px] max-w-[calc(100%-2rem)] rounded-md border border-line bg-surface-2 p-4 max-sm:hidden">
            <div className="label flex items-center gap-2"><I.shield width={14} height={14} className="text-defend" />Recommended cut</div>
            <div className="mono mt-2 text-[14px]">{cut.kind === "isolate" ? `Isolate ${nm(cut.nodes[0])}` : `Revoke ${nm(cut.nodes[0])} → ${nm(cut.nodes[1])}`}</div>
            <div className="mt-3 flex justify-between text-[13px] text-dim"><span>Path risk removed</span><span className="mono text-ink">{pct(cut.risk_drop)}</span></div>
            <div className="meter defend mt-2"><i style={{ width: pct(cut.risk_drop) }} /></div>
          </div>
        )}
      </div>
      <div ref={logRef} className="mono h-[168px] overflow-hidden border-t border-line bg-background/60 px-4 py-3 text-[12.5px] leading-[1.75] max-sm:h-[120px]" aria-live="off">
        {lines.map((l) => (
          <div key={l.id} className="flex gap-3 whitespace-nowrap">
            <span className="w-10 shrink-0 text-faint">{l.t}</span>
            <span className={`w-16 shrink-0 font-medium ${l.tone}`}>{l.k}</span>
            <span className="truncate text-dim [&_b]:font-medium [&_b]:text-ink">{l.v}</span>
          </div>
        ))}
      </div>
      {d && (
        <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play the replay" : "Pause the replay"}
          className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-ink text-background transition-transform active:scale-95">
          {paused ? <I.play width={14} height={14} /> : <I.pause width={14} height={14} />}
        </button>
      )}
    </div>
  )
}

/* ============================================================ app frame */
function ConsoleFrame() {
  const { d } = useDemo()
  const s = d ? (d.offline ? d.net.hops - 1 : Math.min(2, d.net.hops - 1)) : 0
  const fc = d?.fcs[s]
  const nm = (i: number) => d!.net.nodes[i].name
  return (
    <section className="screen" id="console" style={h(1)}>
      <div className="wrap flex h-full flex-col">
        <div className="section-head">
          <h2>The analyst console</h2>
          <p>Pick a test network, step through the attack and read the forecast beside the map: next move, likely paths and the response. <Link className="link" to="/console">Open the console</Link></p>
        </div>
        <div className="card flex min-h-[420px] flex-1 overflow-hidden" role="img" aria-label="The Lateralis console: test networks beside the open network's forecast">
          {/* list pane: held-out networks */}
          <div className="hidden w-[280px] shrink-0 flex-col border-r border-line md:flex">
            <div className="label border-b border-line px-4 py-3">Test networks</div>
            <div className="min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(#000_75%,transparent)]">
              {(d?.list ?? []).slice(0, 14).map((n) => (
                <div key={n.id} className={`flex items-center justify-between border-b border-line px-4 py-3 ${n.id === d?.net.id ? "bg-surface-2" : ""}`}>
                  <div>
                    <div className="mono text-[13px] text-ink">{netName(n.id)}</div>
                    <div className="text-[12.5px] text-dim">{n.machines} machines · {n.users} users</div>
                  </div>
                  <span className={`sev ${n.id === d?.net.id ? "high" : "ok"}`}>{n.id === d?.net.id ? "active" : `${n.hops} hops`}</span>
                </div>
              ))}
            </div>
          </div>
          {/* open pane: map + intel */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 text-[13px]">
              <span className="mono">{d ? netName(d.net.id) : "--"}<span className="text-dim"> · stage {s + 1}/{d?.net.hops ?? "-"} · {fc?.as_of.label ?? ""}</span></span>
              <span className="seg max-sm:hidden" aria-hidden="true"><button type="button" tabIndex={-1}>Top 1</button><button type="button" tabIndex={-1} aria-pressed="true">Top 3</button><button type="button" tabIndex={-1}>Top 5</button></span>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="relative min-w-0 flex-1">{d && fc && <NetMap net={d.net} fc={fc} k={3} reveal={d.offline} className="absolute inset-0" />}</div>
              {d?.offline ? (
                <div className="hidden w-[300px] shrink-0 flex-col gap-4 border-l border-line p-4 lg:flex">
                  <div className="label">Recorded attack</div>
                  {SNAP.hops.map((x) => (
                    <div key={x.hop} className="border-b border-line pb-3">
                      <div className="mono flex justify-between text-[12.5px] text-dim"><span>Hop {x.hop}</span><span>{x.time.slice(5, 16)}</span></div>
                      <div className="mono mt-1 text-[13.5px]"><span className="text-attack">{nm(x.src)}</span> → <span className={x.hop === SNAP.hops.length ? "text-critical" : "text-ink"}>{nm(x.dst)}</span></div>
                      <div className="text-[12.5px] text-dim">user {x.user} · {d.net.nodes[x.dst].label.toLowerCase()}</div>
                    </div>
                  ))}
                  <p className="mt-auto text-[13px] leading-[1.55] text-dim">Forecasts, paths and the recommended cut load from the model. Start it with <span className="mono text-ink">python -m attackpath.api.server</span>.</p>
                </div>
              ) : (
              <div className="hidden w-[300px] shrink-0 flex-col gap-4 border-l border-line p-4 lg:flex">
                <div>
                  <div className="label mb-3">Next move forecast</div>
                  {fc?.next_hops.slice(0, 4).map((x, r) => (
                    <div key={x.node} className="mb-3">
                      <div className="flex justify-between text-[13px]"><span className="mono">{String(r + 1).padStart(2, "0")} {nm(x.node)}</span><span className="mono text-predict">{pct(x.prob)}</span></div>
                      <div className="meter cost mt-1.5"><i style={{ width: pct(x.prob / fc.next_hops[0].prob) }} /></div>
                    </div>
                  ))}
                </div>
                {fc?.actions[0] && (
                  <div className="rounded-md border border-line bg-surface-2 p-4">
                    <div className="label">Recommended next cut</div>
                    <div className="mono mt-2 text-[14px]">{fc.actions[0].kind === "isolate" ? `Isolate ${nm(fc.actions[0].nodes[0])}` : `Revoke ${nm(fc.actions[0].nodes[0])} → ${nm(fc.actions[0].nodes[1])}`}</div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px] text-dim">
                      <div>Risk removed<div className="mono text-[16px] text-defend">{pct(fc.actions[0].risk_drop)}</div></div>
                      <div>Traffic blocked<div className="mono text-[16px] text-ink">{pct(fc.actions[0].blocked, 1)}</div></div>
                    </div>
                  </div>
                )}
                <div className="mt-auto grid grid-cols-2 gap-3 text-[12.5px] text-dim">
                  <div>Path risk<div className="mono text-[16px] text-attack">{fc ? pct(fc.risk) : "--"}</div></div>
                  <div>Confidence<div className="mono text-[16px] text-ink">{fc ? pct(fc.confidence) : "--"}</div></div>
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ================================================================ steps */
function Steps() {
  const nh = ev.next_hop
  const route = SNAP.path.map((i) => SNAP.nodes[i])
  const c = ev.containment
  const hours = Array.from({ length: 24 }, (_, i) => i)
  return (
    <section className="screen ground-surface" id="steps" style={h(1)}>
      <div className="wrap flex h-full flex-col">
        <div className="section-head">
          <h2>Four steps in one pipeline</h2>
          <p>Earlier systems cover one or two of these. Lateralis runs all four on every hour of logs.</p>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StepCard n="01" title="Learns the order of logins" body="Hourly graph snapshots feed a recurrent memory, so a login at 02:00 reads differently from one at 14:00.">
            <div className="flex h-full flex-col">
              <div className="label mb-3 flex justify-between"><span>{netName(SNAP.id)} logins by hour</span><span className="mono text-attack">attack {SNAP.hops[0].time.slice(11, 16)}</span></div>
              <div className="flex flex-1 items-end gap-[3px]">
                {hours.map((x) => {
                  const max = Math.max(...SNAP.hourly, 1)
                  const attackHour = SNAP.hops.some((hp) => Number(hp.time.slice(11, 13)) === x)
                  return <span key={x} title={`${String(x).padStart(2, "0")}:00 · ${SNAP.hourly[x]} logins`} className="flex-1 rounded-[2px]"
                    style={{ height: `${Math.max(4, (100 * SNAP.hourly[x]) / max)}%`, background: attackHour ? "var(--attack)" : "var(--p-surface-3)" }} />
                })}
              </div>
              <div className="mono mt-2 flex justify-between text-[11px] text-faint"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
            </div>
          </StepCard>
          <StepCard n="02" title="Forecasts the next machine" body={`The true next hop is in the top five ${pct(nh.tgnn.top5)} of the time on unseen networks.`}>
            <div className="flex h-full flex-col justify-center gap-4">
              {(["top1", "top3", "top5"] as const).map((k) => (
                <div key={k}>
                  <div className="mono flex justify-between text-[12.5px]"><span className="text-dim">Top {k.slice(3)}</span><span className="text-cyan">{pct(nh.tgnn[k])}</span></div>
                  <div className="meter mt-1.5"><i style={{ width: pct(nh.tgnn[k]) }} /></div>
                  <div className="meter mt-1 !h-[3px]"><i style={{ width: pct(nh.heuristic[k]), background: "var(--p-muted)" }} /></div>
                </div>
              ))}
              <div className="flex gap-4 text-[12px] text-dim">
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px] bg-cyan" />Temporal GNN</span>
                <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: "var(--p-muted)" }} />Rule-based</span>
              </div>
            </div>
          </StepCard>
          <StepCard n="03" title="Ranks routes to critical servers" body="Yen's algorithm ranks the top-k paths, each move weighted by its forecast probability.">
            <div className="flex h-full flex-col justify-center">
              <div className="label mb-4">{netName(SNAP.id)} · recorded route</div>
              <ol className="m-0 list-none p-0">
                {route.map((n, i) => (
                  <li key={i} className="relative flex items-center gap-3 pb-3 last:pb-0">
                    {i < route.length - 1 && <span className="absolute top-3 left-[5px] h-full w-px bg-line" />}
                    <span className={`relative h-[11px] w-[11px] shrink-0 ${n.group === "critical" ? "rotate-45 bg-critical" : i === 0 ? "rounded-full bg-attack" : "rounded-full bg-server"}`} />
                    <span className="mono text-[13px] text-ink">{n.name}</span>
                    <span className="truncate text-[12px] text-dim">{n.label.toLowerCase()}</span>
                  </li>
                ))}
              </ol>
            </div>
          </StepCard>
          <StepCard n="04" title="Recommends the cut that blocks them" body={`Containing the attacker removes ${pct(c?.mean_risk_drop ?? 0)} of path risk on average and blocks ${pct(c?.mean_normal_blocked ?? 0, 1)} of normal logins.`}>
            <div className="flex h-full flex-col justify-center gap-4 text-[12.5px] text-dim">
              <div className="flex items-center gap-2 text-[13px] font-medium text-defend"><I.shield width={15} height={15} />Recommended cut, on average</div>
              {([["Path risk removed", c?.mean_risk_drop ?? 0, "defend", 0], ["Normal traffic blocked", c?.mean_normal_blocked ?? 0, "cost", 1], ["Cuts the real path", c?.cuts_true_path ?? 0, "", 0]] as const).map(([k, v, tone, dp]) => (
                <div key={k}>
                  <div className="flex justify-between"><span>{k}</span><span className="mono text-ink">{pct(v, dp)}</span></div>
                  <div className={`meter mt-1.5 ${tone}`}><i style={{ width: pct(v) }} /></div>
                </div>
              ))}
            </div>
          </StepCard>
        </div>
      </div>
    </section>
  )
}

function StepCard({ n, title, body, children }: { n: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="card flex min-h-[380px] flex-col overflow-hidden" style={{ backgroundColor: "var(--p-bg)" }}>
      <div className="min-h-[200px] flex-1 border-b border-line bg-surface p-5">{children}</div>
      <div className="p-5">
        <span className="mono text-[13px] text-cyan">{n}</span>
        <h4 className="mt-2 min-h-[52px]">{title}</h4>
        <p className="mt-2 min-h-[70px] text-[15px] leading-[1.55] text-dim">{body}</p>
      </div>
    </div>
  )
}

/* ============================================ pipeline: the scroll moment */
const STAGES = [
  ["Hourly graph", "Users and machines as nodes, logins as edges, one snapshot an hour."],
  ["Graph attention", "Two GAT layers, four heads, hidden size 64, read each snapshot."],
  ["GRU memory", "Carries every node's state from one hour to the next."],
  ["Two calibrated heads", "Next-hour links and the attacker's next hop, temperature-scaled."],
  ["Paths and response", "Yen's top-k routes and a simulator that scores every cut."],
] as const

function Pipeline() {
  const sec = useRef<HTMLElement>(null)
  const [lit, setLit] = useState(STAGES.length - 1)

  useLayoutEffect(() => {
    const el = sec.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.innerWidth < 1024) return
    setLit(0)
    const st = ScrollTrigger.create({
      trigger: el, start: "top top", end: "bottom bottom",
      onUpdate: (self) => setLit(Math.min(STAGES.length - 1, Math.floor(self.progress * STAGES.length))),
    })
    return () => st.kill()
  }, [])

  useLayoutEffect(() => {
    const el = sec.current
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const flow = el.querySelector(`[data-flow="${lit}"]`)
    if (flow) gsap.fromTo(flow, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power2.out", transformOrigin: "left center" })
  }, [lit])

  return (
    <section ref={sec} className="screen" id="pipeline" data-moment="pipeline" style={{ ...h(2), ["--hm" as string]: 1, paddingTop: 0, paddingBottom: 0 }}>
      <div className="sticky top-0 flex h-[100svh] flex-col max-lg:static max-lg:h-auto" style={{ paddingTop: "var(--padt)", paddingBottom: "var(--padb)" }}>
        <div className="wrap">
          <div className="section-head">
            <h2>How the model reads a network</h2>
            <p>A temporal graph neural network turns hours of logins into probabilities; path search and a defense simulator turn those into a decision.</p>
          </div>
          <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-5">
            {STAGES.map(([t, body], i) => {
              const on = i <= lit
              return (
                <li key={t} className="relative">
                  <div className="card h-full p-5 transition-colors duration-300"
                    style={{ borderColor: i === lit ? "var(--p-accent)" : undefined, backgroundColor: on ? "var(--p-surface)" : "transparent" }}>
                    <span className={`mono text-[13px] ${on ? "text-cyan" : "text-faint"}`}>{String(i + 1).padStart(2, "0")}</span>
                    <h4 className="mt-3">{t}</h4>
                    <p className="mt-2 text-[15px] leading-[1.55] text-dim">{body}</p>
                  </div>
                  {i < STAGES.length - 1 && (
                    <span className="absolute top-1/2 -right-3 hidden h-px w-3 bg-line md:block">
                      {i < lit && <span data-flow={i + 1} className="block h-full w-full bg-cyan" />}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
          <div className="mt-12 grid grid-cols-2 gap-6 border-t border-line pt-8 md:grid-cols-4">
            {[
              ["300", "synthetic networks, 7 days of logins each"],
              ["210 / 45 / 45", "train, validation and test split by network"],
              ["0.16%", "of events belong to an attack"],
              [ev.link.calibrated.auc.toFixed(3), "AUC for next-hour links"],
            ].map(([v, k]) => (
              <div key={k}>
                <div className="mono text-[28px] tracking-[-0.02em] text-ink">{v}</div>
                <div className="mt-1 text-[14px] text-dim">{k}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ============================================================== results */
function Results() {
  const nh = ev.next_hop, td = ev.time_to_detection
  const rows: [string, number, number, number | null][] = [
    ["Next hop in top 1", nh.tgnn.top1, nh.heuristic.top1, nh.random.top1],
    ["Next hop in top 3", nh.tgnn.top3, nh.heuristic.top3, nh.random.top3],
    ["Next hop in top 5", nh.tgnn.top5, nh.heuristic.top5, nh.random.top5],
    ["Caught before the target", td.tgnn.detected_before_target, td.heuristic.detected_before_target, null],
  ]
  return (
    <section className="screen ground-surface" id="results" style={h(1)}>
      <div className="wrap">
        <div className="section-head">
          <h2>Results on {ev.n_test_networks} unseen networks</h2>
          <p>{ev.n_predictions} forecasts on networks held out from training, against a rule-based baseline and random guessing. <Link className="link" to="/results">See every metric</Link></p>
        </div>
        <div className="flex flex-wrap gap-6 pb-6 text-[13px] text-dim">
          {[["var(--p-accent)", "Temporal GNN"], ["var(--p-muted)", "Rule-based"], ["var(--p-surface-3)", "Random"]].map(([c, t]) => (
            <span key={t} className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />{t}</span>
          ))}
        </div>
        <div className="space-y-7">
          {rows.map(([label, a, b, c]) => (
            <div key={label} className="grid grid-cols-12 items-center gap-6 max-md:gap-2">
              <div className="col-span-12 text-[15px] md:col-span-3">{label}</div>
              <div className="col-span-12 space-y-1.5 md:col-span-9">
                {([[a, "var(--p-accent)"], [b, "var(--p-muted)"], [c, "var(--p-surface-3)"]] as const).map(([v, col], i) => v == null ? null : (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-3 flex-1 overflow-hidden rounded-[2px]"><div className="h-full rounded-[2px]" style={{ width: pct(v), background: col }} /></div>
                    <span className={`mono w-12 text-right text-[13px] ${i === 0 ? "text-ink" : "text-dim"}`}>{pct(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* =========================================================== prior work */
const PRIOR: [string, string, string[]][] = [
  ["Bowman et al.", "RAID 2020", ["n", "n", "n", "n", "n"]],
  ["Euler", "NDSS 2022", ["y", "h", "n", "n", "n"]],
  ["DyMHAG", "IEEE Access 2025", ["y", "h", "n", "n", "n"]],
  ["Physics-informed GNN", "JCP 2025", ["n", "n", "y", "n", "n"]],
  ["SPGNN-API", "IEEE TIFS 2024", ["n", "n", "y", "n", "y"]],
  ["CybORG", "arXiv 2021", ["n", "n", "n", "n", "h"]],
]
const COLS = ["Learns event order", "Next-step forecast", "Full path ranking", "Calibrated confidence", "Defense action"]
function Mark({ v }: { v: string }) {
  if (v === "y") return <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-defend/15 text-defend" title="yes"><I.check width={13} height={13} /></span>
  if (v === "h") return <span className="mono text-[13px] text-predict" title="partly">partly</span>
  return <span className="text-faint" title="no">–</span>
}
function PriorWork() {
  return (
    <section className="screen" id="prior-work" style={h(1)}>
      <div className="wrap">
        <div className="section-head">
          <h2>Prior work covers one or two steps</h2>
          <p>Six published approaches compared on the five things an analyst needs from a forecast.</p>
        </div>
        <div className="card overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead><tr><th>Approach</th>{COLS.map((c) => <th key={c} className="!text-center">{c}</th>)}</tr></thead>
            <tbody>
              {PRIOR.map(([n, v, m]) => (
                <tr key={n}><td><span className="text-ink">{n}</span><small>{v}</small></td>{m.map((x, i) => <td key={i} className="text-center"><span className="inline-flex justify-center"><Mark v={x} /></span></td>)}</tr>
              ))}
              <tr className="bg-cyan/[.06]"><td><span className="font-medium text-ink">Lateralis</span><small>this project</small></td>{COLS.map((c) => <td key={c} className="text-center"><span className="inline-flex justify-center"><Mark v="y" /></span></td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/* ============================================================ questions */
const FAQ: [string, string][] = [
  ["What data is the model trained on?", "300 synthetic company networks with seven days of normal logins and one 3 to 6 hop attack each. The attacker steals credentials and prefers admin machines. LANL, CICIDS2017 and UNSW-NB15 come next."],
  ["How is a forecast checked?", "Every number comes from networks held out of training. A prediction for hour t+1 only uses logs up to hour t, so the model never sees the future."],
  ["Why is full-path accuracy lower than next-hop accuracy?", "A full path needs three to six correct guesses in a row. Catching the attacker before the target is the measure that matters to an analyst."],
  ["What does calibrated mean here?", "Temperature scaling makes a 30% forecast come true about 30% of the time, so analysts can weigh the numbers directly."],
]
function Questions() {
  return (
    <section className="screen ground-surface" id="questions" style={h(1)}>
      <div className="wrap grid12 max-lg:flex max-lg:flex-col max-lg:gap-8">
        <h2 className="col-span-5">Questions about the model</h2>
        <dl className="col-span-6 col-start-7 m-0">
          {FAQ.map(([q, a]) => (
            <div key={q} className="border-b border-line py-6 first:pt-0">
              <dt className="text-[18px] font-medium tracking-[-0.01em]">{q}</dt>
              <dd className="m-0 mt-2 text-[16px] leading-[1.65] text-dim">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
