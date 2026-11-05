import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import gsap from "gsap"
import { I } from "@/components/Chrome"
import { NetMap, NodeTip, type HoverInfo } from "@/components/NetMap"
import { Switch } from "@/components/ui/switch"
import { OFFLINE_HOPS, SNAP, offlineForecast, offlineList, offlineNetwork } from "@/lib/offline"
import {
  getEvents, getForecast, getNetwork, getNetworks, netName, pct, reportUrl, ROLE_SHORT, sameList,
  type Action, type EventLog, type Forecast, type LogEvent, type Network, type NetworkListItem,
} from "@/lib/api"

/* The analyst console: the map, the stage player, the forecast beside it and the live event feed. */

const readMin = () => { try { return localStorage.getItem("lateralis-feed-min") === "1" } catch { return false } }

export default function Console() {
  const [q, setQ] = useSearchParams()
  const [list, setList] = useState<NetworkListItem[] | null>(null)
  const [gid, setGid] = useState<number | null>(q.has("net") ? Number(q.get("net")) : null)
  const [stage, setStage] = useState(q.has("stage") ? Math.max(0, Number(q.get("stage")) - 1) : 0)
  const [reveal, setReveal] = useState(q.get("reveal") === "1")
  const [k, setK] = useState(3)
  const [playing, setPlaying] = useState(false)
  const [net, setNet] = useState<Network | null>(null)
  const [fc, setFc] = useState<Forecast | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [tip, setTip] = useState<HoverInfo>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    getNetworks().then(({ networks, default: def }) => {
      setList(networks)
      setGid((g) => (g != null && networks.some((n) => n.id === g) ? g : def))
    }, () => {
      // API down: open the recorded demo network from dataset/
      setOffline(true)
      setList(offlineList())
      setGid(SNAP.id)
    })
  }, [])

  // load the network and this stage's forecast
  useEffect(() => {
    if (gid == null) return
    if (offline) {
      const s = Math.min(stage, OFFLINE_HOPS - 1)
      setNet(offlineNetwork()); setFc(offlineForecast(s)); setErr(null)
      return
    }
    let live = true
    const slow = setTimeout(() => live && setLoading(true), 180)
    Promise.all([getNetwork(gid), getForecast(gid, Math.max(0, stage))]).then(([n, f]) => {
      if (!live) return
      setNet(n); setFc(f); setErr(null)
      if (stage + 1 < n.hops) getForecast(gid, stage + 1).catch(() => {})
    }, (e: Error) => live && setErr(e.message)).finally(() => { clearTimeout(slow); if (live) setLoading(false) })
    return () => { live = false; clearTimeout(slow) }
  }, [gid, stage, offline])

  // keep the URL a shareable deep link
  useEffect(() => {
    if (gid == null) return
    setQ({ net: String(gid), stage: String(stage + 1), ...(reveal ? { reveal: "1" } : {}) }, { replace: true })
  }, [gid, stage, reveal, setQ])

  const hops = net?.hops ?? 1
  const go = useCallback((s: number) => setStage(Math.max(0, Math.min(hops - 1, s))), [hops])
  const stop = () => setPlaying(false)

  // play: one hop every 2.6 s
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setStage((s) => {
      if (s >= hops - 1) { setPlaying(false); return s }
      return s + 1
    }), 2600)
    return () => clearInterval(t)
  }, [playing, hops])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest("select, input, textarea")) return
      if (e.key === "ArrowRight") { stop(); go(stage + 1) }
      if (e.key === "ArrowLeft") { stop(); go(stage - 1) }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [go, stage])

  const togglePlay = () => {
    if (playing) return stop()
    if (stage >= hops - 1) setStage(0)
    setPlaying(true)
  }

  const nm = (i: number) => net!.nodes[i].name
  const ready = net && fc && net.id === gid

  return (
    <main id="main" className="flex flex-col" style={{ paddingTop: "var(--nav)", minHeight: "100svh" }}>
      <div className="grid flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] xl:[height:calc(100svh-var(--nav))]">
        {/* ----------------------------------------------------------- stage */}
        <section className="flex min-h-0 flex-col border-line xl:border-r" aria-label="Attack map">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 lg:px-6">
            <select className="select" aria-label="Test network" value={gid ?? ""} onChange={(e) => { stop(); setGid(Number(e.target.value)); setStage(0) }}>
              {!list && <option>Loading networks</option>}
              {list?.map((n) => <option key={n.id} value={n.id}>{netName(n.id)} · {n.machines} machines · {n.hops}-hop attack</option>)}
            </select>
            <div className="flex items-center gap-1.5">
              <button className="icon-btn" type="button" aria-label="Previous hop" disabled={stage === 0} onClick={() => { stop(); go(stage - 1) }}><I.prev /></button>
              <button className={`btn btn--sm ${playing ? "" : "btn--primary"} !h-9 min-w-[92px]`} type="button" onClick={togglePlay}>
                {playing ? <><I.pause width={14} height={14} />Pause</> : <><I.play width={14} height={14} />Play</>}
              </button>
              <button className="icon-btn" type="button" aria-label="Next hop" disabled={stage >= hops - 1} onClick={() => { stop(); go(stage + 1) }}><I.next /></button>
            </div>
            <span className="text-[14px] text-dim">
              Stage <b className="mono font-medium text-ink">{stage + 1}</b>/{hops} · {stage === 0 ? "initial access" : ready ? <>attacker on <b className="mono font-medium text-attack">{nm(fc.current)}</b></> : "…"}
            </span>
            <span className="flex-1" />
            <label className="flex items-center gap-2.5 text-[13px] text-dim">
              Reveal true path <Switch checked={reveal} onCheckedChange={setReveal} aria-label="Reveal the true attack path" />
            </label>
            {gid != null && !offline && <a className="btn btn--sm !h-9" href={reportUrl(gid, stage)} target="_blank" rel="noopener noreferrer"><I.file width={15} height={15} />Report PDF</a>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 lg:px-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <b className="mono text-[15px] font-medium">{net ? netName(net.id) : "Loading"}</b>
              {net && <span className="text-[13px] text-dim">{net.nodes.length} machines · {net.users} users · {net.nodes.filter((n) => n.group === "critical").length} critical</span>}
              {fc && <span className="mono text-[13px] text-dim">as of <b className="font-medium text-ink">{fc.as_of.label}</b></span>}
            </div>
            <div className="seg" aria-label="Forecast paths shown">
              {[1, 3, 5].map((v) => <button key={v} type="button" aria-pressed={k === v} onClick={() => setK(v)}>Top {v}</button>)}
            </div>
          </div>

          <div className="relative min-h-[420px] flex-1">
            {ready && <NetMap net={net} fc={fc} k={k} reveal={reveal} onHover={setTip} className="absolute inset-0" />}
            {(loading || (!ready && !err)) && (
              <div className="absolute inset-0 grid place-items-center bg-background/40 text-[13px] text-dim">
                <span className="flex items-center gap-3"><span className="spin" />Replaying logs and forecasting</span>
              </div>
            )}
            {err && <div className="absolute inset-0 grid place-items-center p-6 text-center text-dim">{err === "api" ? <>Cannot reach the API. Start it with <span className="mono text-ink">&nbsp;python -m attackpath.api.server</span></> : `Could not load this forecast (${err}).`}</div>}
          </div>

          <Legend />
          {ready && <Timeline net={net} fc={fc} stage={stage} reveal={reveal} onPick={(s) => { stop(); go(s) }} />}
        </section>

        {/* ------------------------------------------------------------ side */}
        <aside className="flex min-h-0 flex-col" aria-label="Forecast">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
            {ready && offline ? <OfflineIntel net={net} stage={stage} />
              : ready ? <Intel net={net} fc={fc} reveal={reveal} k={k} /> : <div className="text-dim">Waiting for the forecast</div>}
          </div>
          {ready && !offline && <Feed net={net} fc={fc} gid={net.id} stage={stage} reveal={reveal} />}
        </aside>
      </div>
      <NodeTip info={tip} />
    </main>
  )
}

/* ------------------------------------------------------------------ legend */
function Legend() {
  const items: [React.ReactNode, string][] = [
    [<i className="h-[3px] w-4 rounded bg-attack" />, "Attack so far"],
    [<i className="h-2.5 w-2.5 rounded-full bg-attack" />, "Compromised"],
    [<i className="h-[3px] w-4 rounded bg-predict" />, "Forecast path"],
    [<i className="h-2.5 w-2.5 rotate-45 bg-critical" />, "Critical asset"],
    [<i className="h-2.5 w-2.5 rounded-full bg-server" />, "Server"],
    [<i className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--ws)" }} />, "Workstation"],
    [<i className="h-3 w-3 rounded-full border border-dashed border-defend" />, "Recommended cut"],
    [<i className="w-4 border-t-2 border-dotted" style={{ borderColor: "var(--truth)" }} />, "True path"],
  ]
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-[12.5px] text-dim lg:px-6" aria-label="Legend">
      {items.map(([sw, t]) => <span key={t} className="flex items-center gap-2">{sw}{t}</span>)}
    </div>
  )
}

/* ---------------------------------------------------------------- timeline */
function Timeline({ net, fc, stage, reveal, onPick }: { net: Network; fc: Forecast; stage: number; reveal: boolean; onPick: (s: number) => void }) {
  const full = fc.footholds.concat(fc.truth.remaining.slice(1))
  const K = net.hops
  const nm = (i: number) => net.nodes[i].name
  const nextGuess = fc.next_hops[0]
  const best = fc.paths[0]
  const targetGuess = best ? best.nodes[best.nodes.length - 1] : null
  return (
    <div className="grid border-t border-line" style={{ gridTemplateColumns: `repeat(${K + 1}, minmax(0, 1fr))` }}>
      {Array.from({ length: K + 1 }, (_, i) => {
        const known = i <= stage || reveal
        let name = "? ? ?", guess = ""
        if (known) name = nm(full[i])
        else if (i === stage + 1 && nextGuess) { name = nm(nextGuess.node); guess = `forecast ${pct(nextGuess.prob)}` }
        else if (i === K && targetGuess != null) { name = nm(targetGuess); guess = "likely target" }
        const done = i <= stage, now = i === stage
        const t1 = i === 0 ? "Entry" : i === K ? "Target" : `Hop ${i}`
        return (
          <button key={i} type="button" disabled={i >= K} onClick={() => onPick(i)} aria-label={`${t1}: ${name}`}
            className={`relative border-r border-line px-3 py-3 text-left transition-colors last:border-r-0 enabled:cursor-pointer enabled:hover:bg-surface-2 lg:px-4 ${now ? "bg-surface-2" : ""}`}>
            <span className={`absolute inset-x-0 top-0 h-[2px] ${now ? "bg-attack" : done ? "bg-attack/40" : "bg-transparent"}`} />
            <span className="flex items-center gap-2 text-[12px] text-dim">
              <span className={`h-2 w-2 rounded-full ${done ? "bg-attack" : i === K ? "bg-critical" : "border border-line-strong bg-transparent"}`} style={{ borderColor: "var(--p-line-strong)" }} />
              {t1}{guess && <em className="not-italic text-predict max-md:hidden">· {guess}</em>}
            </span>
            <span className={`mono mt-1 block truncate text-[13px] ${known ? (done ? "text-ink" : "text-dim") : guess ? "text-predict" : "text-faint"}`}>{name}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------- intel */
function actText(net: Network, a: Action) {
  const nm = (i: number) => net.nodes[i].name
  return a.kind === "isolate"
    ? <>Isolate <span className="mono">{nm(a.nodes[0])}</span></>
    : <>Revoke <span className="mono">{nm(a.nodes[0])}</span> → <span className="mono">{nm(a.nodes[1])}</span></>
}

function Intel({ net, fc, reveal, k }: { net: Network; fc: Forecast; reveal: boolean; k: number }) {
  const nm = (i: number) => net.nodes[i].name
  const cur = net.nodes[fc.current]
  const maxP = Math.max(...fc.next_hops.map((x) => x.prob), 0.01)
  const best = fc.actions[0]
  const held = new Set(fc.footholds)
  const root = useRef<HTMLDivElement>(null)

  // KPI digits settle on a stage change (a click swap, 400 ms)
  useLayoutEffect(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const ctx = gsap.context(() => gsap.from("[data-swap]", { opacity: 0, y: 4, duration: 0.4, ease: "power2.out", stagger: 0.03 }), root)
    return () => ctx.revert()
  }, [fc])

  return (
    <div ref={root} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi k="Footholds" v={String(fc.footholds.length)} s="compromised machines" />
        <Kpi k="Attacker on" v={cur.name} s={cur.label} tone="text-attack" />
        <Kpi k="Path risk" v={pct(fc.risk)} meter={fc.risk} meterTone="attack" />
        <Kpi k="Confidence" v={pct(fc.confidence)} meter={fc.confidence} />
      </div>

      <Block title="Next move forecast" sub="calibrated probability">
        {fc.next_hops.slice(0, 5).map((x, r) => {
          const hit = reveal && x.node === fc.truth.next
          return (
            <div key={x.node} className={`grid grid-cols-[22px_1fr_70px_44px] items-center gap-3 rounded-sm py-2 ${hit ? "bg-defend/10" : ""}`}>
              <span className="mono text-[12px] text-faint">{String(r + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="mono text-[13px] text-ink">{nm(x.node)}</span>
                {hit && <span className="sev ok ml-2">actual</span>}
                <span className="block truncate text-[12px] text-dim">{net.nodes[x.node].label} · uncertainty {x.uncertainty.toFixed(2)}</span>
              </span>
              <span className="meter cost"><i style={{ width: pct(x.prob / maxP) }} /></span>
              <span data-swap className="mono text-right text-[13px] text-predict">{pct(x.prob)}</span>
            </div>
          )
        })}
      </Block>

      {best ? (
        <div className="rounded-lg border p-4" style={{ borderColor: "color-mix(in oklab, var(--defend) 40%, transparent)", background: "var(--defend-soft)" }}>
          <div className="flex items-center gap-2 text-[13px] font-medium text-defend"><I.shield width={15} height={15} />Recommended next cut</div>
          <div data-swap className="mt-2 text-[17px] text-ink">{actText(net, best)}</div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div><div className="label">Path risk removed</div><div data-swap className="mono mt-1 text-[20px] text-ink">{pct(best.risk_drop)}</div><div className="meter defend mt-2"><i style={{ width: pct(best.risk_drop) }} /></div></div>
            <div><div className="label">Normal traffic blocked</div><div data-swap className="mono mt-1 text-[20px] text-ink">{pct(best.blocked, 1)}</div><div className="meter cost mt-2"><i style={{ width: pct(Math.min(1, best.blocked)) }} /></div></div>
          </div>
          {fc.containment && (
            <p className="mt-4 text-[13px] text-dim">Also contain {actText(net, fc.containment)} (already compromised): removes {pct(fc.containment.risk_drop)} of risk, blocks {pct(fc.containment.blocked, 1)}.</p>
          )}
          {fc.actions.length > 1 && (
            <table className="mt-4 w-full text-[12.5px]">
              <thead><tr className="text-left text-dim"><th className="pb-1 font-medium">Alternatives</th><th className="pb-1 text-right font-medium">Risk</th><th className="pb-1 text-right font-medium">Cost</th></tr></thead>
              <tbody>
                {fc.actions.slice(1, 5).map((a, i) => (
                  <tr key={i} className="border-t border-line"><td className="py-1.5 text-ink">{actText(net, a)}</td><td className="mono py-1.5 text-right">{pct(a.risk_drop)}</td><td className="mono py-1.5 text-right text-dim">{pct(a.blocked, 1)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : <div className="panel p-4 text-dim">No response needed: no path to a critical asset.</div>}

      <Block title="Likely attack paths" sub="to critical assets">
        {fc.paths.length ? fc.paths.map((p, r) => {
          const hit = reveal && sameList(p.nodes, fc.truth.remaining)
          return (
            <div key={r} className={`border-b border-line py-3 last:border-b-0 ${r >= k ? "opacity-55" : ""}`}>
              <div className="flex justify-between text-[12px] text-dim">
                <span>Path {r + 1} · {p.nodes.length - 1} hop{p.nodes.length > 2 ? "s" : ""}</span>
                <span className="flex items-center gap-2">{hit && <span className="sev ok">matches real path</span>}<span className="mono text-predict">P = {p.prob.toFixed(3)}</span></span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {p.nodes.map((v, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className={`mono rounded-[3px] border px-1.5 py-0.5 text-[12px] ${held.has(v) ? "border-attack/50 text-attack" : net.nodes[v].group === "critical" ? "border-critical/50 text-critical" : "border-line text-ink"}`}>{nm(v)}</span>
                    {i < p.nodes.length - 1 && <I.next width={12} height={12} className="text-faint" />}
                  </span>
                ))}
              </div>
            </div>
          )
        }) : <div className="text-dim">No route to a critical asset.</div>}
      </Block>
    </div>
  )
}

function OfflineIntel({ net, stage }: { net: Network; stage: number }) {
  const nm = (i: number) => net.nodes[i].name
  const target = net.nodes[SNAP.path[SNAP.path.length - 1]]
  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4" style={{ borderColor: "color-mix(in oklab, var(--predict) 40%, transparent)", background: "var(--predict-soft)" }}>
        <div className="text-[14px] font-medium text-predict">Model offline</div>
        <p className="mt-1.5 text-[13.5px] leading-[1.6] text-dim">
          Showing the recorded attack on {netName(net.id)} from the dataset. Forecasts, attack paths and the recommended cut appear when the API runs:
          <span className="mono mt-2 block text-ink">python -m attackpath.api.server</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Kpi k="Footholds" v={String(stage + 1)} s="compromised machines" />
        <Kpi k="Attacker on" v={nm(SNAP.path[stage])} s={net.nodes[SNAP.path[stage]].label} tone="text-attack" />
        <Kpi k="Target" v={target.name} s={target.label} tone="text-critical" />
        <Kpi k="Attack hops" v={String(SNAP.hops.length)} s={`over ${SNAP.hops[0].time.slice(11, 16)} to ${SNAP.hops[SNAP.hops.length - 1].time.slice(11, 16)}`} />
      </div>
      <Block title="Recorded attack" sub={SNAP.day}>
        {SNAP.hops.map((h) => (
          <div key={h.hop} className={`grid grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-line py-2.5 last:border-b-0 ${h.hop > stage + 1 ? "opacity-45" : ""}`}>
            <span className="mono text-[12px] text-dim">Hop {h.hop}</span>
            <span className="mono text-[13px]"><span className="text-attack">{nm(h.src)}</span> → <span className={h.hop === SNAP.hops.length ? "text-critical" : "text-ink"}>{nm(h.dst)}</span><span className="block text-[12px] text-dim">user {h.user} · {net.nodes[h.dst].label.toLowerCase()}</span></span>
            <span className="mono text-[12px] text-dim">{h.time.slice(11, 19)}</span>
          </div>
        ))}
      </Block>
    </div>
  )
}

function Kpi({ k, v, s, meter, meterTone, tone }: { k: string; v: string; s?: string; meter?: number; meterTone?: string; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="label">{k}</div>
      <div data-swap className={`mono mt-1.5 truncate text-[22px] tracking-[-0.02em] ${tone ?? "text-ink"}`}>{v}</div>
      {s && <div className="truncate text-[12px] text-dim">{s}</div>}
      {meter != null && <div className={`meter mt-2.5 ${meterTone ?? ""}`}><i style={{ width: pct(meter) }} /></div>}
    </div>
  )
}

function Block({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between"><h3 className="!text-[15px] !tracking-[-0.01em]">{title}</h3><span className="text-[12px] text-dim">{sub}</span></div>
      {children}
    </div>
  )
}

/* --------------------------------------------------------- live event feed */
function stageCutoff(evData: EventLog, fc: Forecast, stage: number) {
  const hop: Record<number, number> = {}
  for (const e of evData.events) if (e.attack && e.step != null) hop[e.step] = Math.min(hop[e.step] ?? Infinity, e.time)
  return fc.as_of ? fc.as_of.seconds : Math.max((fc.hour + 1) * 3600 - 1, hop[stage] ?? -1)
}

type FeedRow = { key: string; e?: LogEvent; sys?: boolean; note?: string }

function Feed({ net, fc, gid, stage, reveal }: { net: Network; fc: Forecast; gid: number; stage: number; reveal: boolean }) {
  const [data, setData] = useState<EventLog | null>(null)
  const [filter, setFilter] = useState<"all" | "flagged">("all")
  const [min, setMin] = useState(readMin)
  const [upto, setUpto] = useState(-1)
  const [streamed, setStreamed] = useState<LogEvent[]>([])
  const [status, setStatus] = useState("connecting")
  const [unread, setUnread] = useState(0)
  const body = useRef<HTMLDivElement>(null)
  const last = useRef<{ gid: number; stage: number; upto: number } | null>(null)
  const nm = (i: number) => net.nodes[i].name

  useEffect(() => { setStatus("loading events"); getEvents(gid).then((d) => setData(d), () => setStatus("offline")) }, [gid])
  useEffect(() => { try { localStorage.setItem("lateralis-feed-min", min ? "1" : "0") } catch { /* storage blocked */ } if (!min) setUnread(0) }, [min])

  const visible = useCallback((list: LogEvent[]) => (filter === "flagged" ? list.filter((e) => e.severity === "high" || e.severity === "medium") : list), [filter])

  // stream the events that happened since the last stage shown; jump instantly otherwise
  useEffect(() => {
    if (!data) return
    const cutoff = stageCutoff(data, fc, stage)
    const prev = last.current
    const forward = prev && prev.gid === gid && cutoff >= prev.upto && stage > prev.stage
    last.current = { gid, stage, upto: cutoff }
    if (!forward) {
      setUpto(cutoff); setStreamed([]); setStatus("live")
      return
    }
    const add = data.events.filter((e) => e.time > prev.upto && e.time <= cutoff)
    const shown = add.slice(-40)
    let i = 0, live = true
    setStatus("streaming")
    const step = () => {
      if (!live) return
      if (i >= shown.length) { setUpto(cutoff); setStreamed([]); setStatus("live"); return }
      const e = shown[i++]
      setStreamed((s) => [...s, e])
      if (min) setUnread((u) => u + 1)
      setTimeout(step, shown.length > 20 ? 30 : 90)
    }
    step()
    return () => { live = false; setUpto(cutoff); setStreamed([]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, gid, stage])

  const rows: FeedRow[] = useMemo(() => {
    if (!data) return []
    const base = visible(data.events.filter((e) => e.time <= upto)).slice(-160)
    const out: FeedRow[] = [{ key: "head", note: `replaying ${netName(gid)} · ${data.events.length} events in window` }]
    base.forEach((e, i) => out.push({ key: `b${i}-${e.time}`, e }))
    visible(streamed).forEach((e, i) => out.push({ key: `s${i}-${e.time}`, e }))
    if (!streamed.length) out.push({ key: "sys", sys: true })
    return out
  }, [data, upto, streamed, visible, gid])

  useLayoutEffect(() => { const b = body.current; if (b) b.scrollTop = b.scrollHeight }, [rows, min])

  const top = fc.next_hops[0]
  const a = fc.actions[0]
  const act = a ? (a.kind === "isolate" ? `isolate ${nm(a.nodes[0])}` : `revoke ${nm(a.nodes[0])} → ${nm(a.nodes[1])}`) : "none"

  return (
    <div className={`flex flex-col border-t border-line bg-[#05080e] text-[#cbd5e1] ${min ? "" : "h-[340px] max-xl:h-[380px]"}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 text-[12.5px]">
        <span className="flex items-center gap-2 font-medium text-[#e6ebf2]">
          <span className={`live-dot ${status === "offline" ? "off" : ""}`} />Live event feed
          <Link to="/events" className="ml-1 font-normal text-[#93a1b5] underline-offset-2 hover:text-[#e6ebf2] hover:underline">full log</Link>
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-flex rounded-md border border-white/10 p-0.5">
            {(["all", "flagged"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={`h-6 rounded-[3px] px-2 text-[12px] ${filter === f ? "bg-[#e6ebf2] text-[#070b12]" : "text-[#93a1b5] hover:text-[#e6ebf2]"}`}>{f === "all" ? "All" : "Flagged"}</button>
            ))}
          </span>
          <span className={`mono text-[11.5px] ${status === "live" || status === "streaming" ? "text-[#34c38f]" : "text-[#93a1b5]"}`}>{status}</span>
          {min && unread > 0 && <span className="mono rounded bg-[#f0a93b] px-1.5 text-[11px] text-[#070b12]">{unread} new</span>}
          <button type="button" onClick={() => setMin((m) => !m)} aria-expanded={!min} title={min ? "Expand the event feed" : "Minimize the event feed"}
            className="grid h-6 w-6 place-items-center rounded text-[#93a1b5] hover:bg-white/10 hover:text-[#e6ebf2]">
            <I.prev width={14} height={14} style={{ transform: min ? "rotate(90deg)" : "rotate(-90deg)" }} />
          </button>
        </span>
      </div>
      {!min && (
        <div ref={body} className="mono min-h-0 flex-1 overflow-y-auto px-4 py-2 text-[11.5px] leading-[1.7]" aria-live="polite">
          {rows.map((r) => {
            if (r.note) return <div key={r.key} className="text-[#5d6b80]">-- {r.note} --</div>
            if (r.sys) return (
              <div key={r.key} className="mt-1 border-l-2 border-[#22d3ee] bg-[#22d3ee]/[.06] py-1 pl-2">
                <span className="text-[#5d6b80]">{fc.as_of.iso.replace("T", " ").slice(5, 19)} </span>
                <span className="font-medium text-[#22d3ee]">MODEL </span>
                stage {fc.stage + 1}: attacker on <b className="text-[#e6ebf2]">{nm(fc.current)}</b> · next hop <b className="text-[#f0a93b]">{top ? nm(top.node) : "-"}</b> {top ? pct(top.prob) : ""} · path risk {pct(fc.risk)} · {fc.containment ? `contain ${nm(fc.containment.nodes[0])} · ` : ""}next cut <b className="text-[#34c38f]">{act}</b>
                <span className="caret ml-1" />
              </div>
            )
            return <FeedLine key={r.key} e={r.e!} reveal={reveal} />
          })}
        </div>
      )}
    </div>
  )
}

function FeedLine({ e, reveal }: { e: LogEvent; reveal: boolean }) {
  const flagged = e.severity === "high" || e.severity === "medium"
  const flag = e.severity === "high" ? `HIGH #${e.forecast_rank}` : e.severity === "medium" ? (e.forecast_rank ? `MED #${e.forecast_rank}` : "MED unexp.") : e.remote ? "ok" : ""
  const tone = e.severity === "high" ? "text-[#f2555a]" : e.severity === "medium" ? "text-[#f0a93b]" : e.remote ? "text-[#cbd5e1]" : "text-[#5d6b80]"
  return (
    <div className={`flex gap-2 whitespace-nowrap ${tone} ${flagged ? "bg-white/[.03]" : ""}`}>
      <span className="text-[#5d6b80]">{e.label.slice(-8)}</span>
      <span className="w-11 shrink-0 text-[#93a1b5]">{e.remote ? "AUTH" : "LOGON"}</span>
      <span className="w-16 shrink-0 truncate">{e.user}</span>
      <span className="truncate">{e.remote ? `${e.src} → ${e.dst}` : e.dst}</span>
      <span className="truncate text-[#5d6b80] max-sm:hidden">{e.remote ? `${ROLE_SHORT[e.src_role] ?? e.src_role} → ${ROLE_SHORT[e.dst_role] ?? e.dst_role}` : "local logon"}{e.from_compromised && <b className="ml-1 text-[#f2555a]">from compromised</b>}</span>
      <span className="ml-auto shrink-0 font-medium">{flag}</span>
      {reveal && e.attack && <span className="shrink-0 rounded bg-[#f2555a] px-1 text-white">ATTACK hop {e.step}</span>}
    </div>
  )
}
