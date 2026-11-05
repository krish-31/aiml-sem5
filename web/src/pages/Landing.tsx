import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import EVAL from "../../../results/eval_synthetic.json"
import { Brand, I } from "@/components/Chrome"
import { NetMap } from "@/components/NetMap"
import { SNAP, offlineForecast, offlineNetwork } from "@/lib/offline"
import {
  getForecast, getNetwork, getNetworks, netName, pct, rankOf, sameList, sleep,
  type Forecast, type Network, type NetworkListItem,
} from "@/lib/api"

gsap.registerPlugin(ScrollTrigger)

const ev = EVAL
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/* =================================================================== page */
export default function Landing() {
  const root = useRef<HTMLElement>(null)

  // generic scroll reveals: anything marked data-reveal rises in once
  useLayoutEffect(() => {
    if (!root.current || reduced()) return
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, { y: 28, opacity: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 86%", once: true } })
      })
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <main id="main" ref={root}>
      <Hero />
      <Ticker />
      <KillChain />
      <ConsolePreview />
      <Results />
      <Pipeline />
      <PriorWork />
      <ManPage />
      <Close />
    </main>
  )
}

/* ------------------------------------------------- shared: the demo data */
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
  return d
}

function SectionHead({ n, kicker, title, children }: { n: string; kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-12 grid gap-6 lg:grid-cols-12" data-reveal>
      <div className="lg:col-span-7">
        <div className="label mb-4 flex items-center gap-3"><span className="text-phos">[{n}]</span><span>{kicker}</span><span className="h-px flex-1 bg-line" /></div>
        <h2 className="glitch">{title}</h2>
      </div>
      {children && <p className="lead self-end lg:col-span-5">{children}</p>}
    </div>
  )
}

/* ===================================================================== hero */
const BOOT = [
  ["booting lateralis", "ok"],
  ["loading temporal gnn · gat ×2 + gru", "ok"],
  ["calibrating heads · temperature 1.01", "ok"],
  [`attaching to ${netName(SNAP.id)} · ${SNAP.nodes.length} hosts`, "ok"],
] as const

function Hero() {
  const d = useDemo()
  const boot = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const [stage, setStage] = useState(0)

  // boot lines type out, then the headline flickers on
  useLayoutEffect(() => {
    if (!boot.current || reduced()) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline()
      gsap.utils.toArray<HTMLElement>("[data-boot]").forEach((line) => {
        const full = line.dataset.boot!
        const o = { n: 0 }
        line.textContent = ""
        tl.to(o, { n: full.length, duration: full.length * 0.012, ease: "none", onUpdate: () => { line.textContent = full.slice(0, Math.round(o.n)) } })
        tl.fromTo(line.nextElementSibling, { opacity: 0 }, { opacity: 1, duration: 0.01 })
      })
      tl.from(title.current!.children, { opacity: 0, duration: 0.05, stagger: { each: 0.08, repeat: 2, yoyo: true } }, "-=0.1")
      tl.from("[data-hero-fade]", { opacity: 0, y: 14, duration: 0.6, ease: "power2.out", stagger: 0.08 }, "-=0.2")
    }, boot)
    return () => ctx.revert()
  }, [])

  const fc = d?.fcs[stage]
  return (
    <section className="relative min-h-[100svh] overflow-hidden border-b border-line" style={{ paddingTop: "var(--nav)" }}>
      {/* full-bleed map on the right half */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-full opacity-90 lg:w-[62%]" aria-hidden="true">
        <div className="absolute inset-0 [background:radial-gradient(60%_60%_at_60%_50%,var(--p-accent-soft),transparent_70%)]" />
        {d && fc && <NetMap net={d.net} fc={fc} k={2} reveal={d.offline} labels={false} className="absolute inset-[6%_2%_14%_2%]" />}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--p-bg)_0%,transparent_35%)] max-lg:bg-[linear-gradient(0deg,var(--p-bg)_30%,transparent_80%)]" />
      </div>
      {/* HUD grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[.35] [background-image:linear-gradient(var(--p-line)_1px,transparent_1px),linear-gradient(90deg,var(--p-line)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(70%_70%_at_50%_40%,#000,transparent)]" aria-hidden="true" />

      <div ref={boot} className="wrap relative grid min-h-[calc(100svh-var(--nav))] items-center gap-10 py-14 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="mb-8 space-y-1 text-[12.5px] text-dim">
            {BOOT.map(([l, s]) => (
              <div key={l} className="flex gap-2"><span className="text-phos">&gt;</span><span data-boot={l}>{l}</span><span className="text-faint">…</span><span className="text-phos">[{s}]</span></div>
            ))}
          </div>
          <h1 ref={title} className="glitch leading-[.82]">
            <span className="block">Predict</span>
            <span className="block">the next</span>
            <span className="block">hop<span className="text-predict">.</span></span>
          </h1>
          <p data-hero-fade className="lead mt-8 max-w-[52ch] text-[17px]">
            Lateralis reads company login logs hour by hour, forecasts the machine an intruder moves to next, ranks every route to your critical servers and names the one cut that blocks them.
          </p>
          <div data-hero-fade className="btn-row mt-9">
            <Link to="/console" className="btn btn--primary">Open the console<I.arrow /></Link>
            <Link to="/results" className="btn">See the results</Link>
          </div>
          <div data-hero-fade className="mt-10 grid max-w-[560px] grid-cols-3 border border-line">
            {[[pct(ev.next_hop.tgnn.top5), "next hop in top 5"], [pct(ev.time_to_detection.tgnn.detected_before_target), "caught before target"], [String(ev.n_test_networks), "unseen networks"]].map(([v, k]) => (
              <div key={k} className="border-r border-line px-4 py-3 last:border-r-0">
                <div className="display glow text-[40px] leading-none text-bright">{v}</div>
                <div className="mt-1 text-[11.5px] uppercase tracking-[.1em] text-dim">{k}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5 lg:self-end">
          <Intercept d={d} onStage={setStage} />
        </div>
      </div>
      <div className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 text-[11px] uppercase tracking-[.2em] text-faint lg:block">scroll ▾</div>
    </section>
  )
}

type Line = { id: number; t: string; k: string; tone: string; v: React.ReactNode }

/* The hero's live log: the model's forecast replay, or the recorded attack when the API is down. */
function Intercept({ d, onStage }: { d: Demo | null; onStage: (s: number) => void }) {
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
      alive && setLines((ls) => [...ls, { id: ++id, t, k, tone, v }].slice(-8))

    ;(async () => {
      while (alive) {
        setLines([])
        if (d.offline) {
          add("--:--", "SYS", "text-dim", <>recorded attack · {netName(net.id)} · model offline</>)
          for (let s = 0; s < K && alive; s++) {
            onStage(s)
            const h = SNAP.hops[s]
            await wait(700)
            if (s === 0) add(h.time.slice(11, 16), "ALERT", "text-attack", <>initial access <b>{nm(h.src)}</b></>)
            await wait(900)
            add(h.time.slice(11, 16), "HOP", "text-predict", <><b>{nm(h.src)}→{nm(h.dst)}</b> user {h.user}</>)
            await wait(1900)
          }
          const t = net.nodes[SNAP.path[SNAP.path.length - 1]]
          add("", "TARGET", "text-attack", <><b>{t.name}</b> {t.label.toLowerCase()} reached</>)
          await wait(4000)
          continue
        }
        const truth = fcs[0].truth.remaining
        const firstHit = fcs.findIndex((f) => f.paths.some((p) => sameList(p.nodes, f.truth.remaining)))
        add("--:--", "SYS", "text-dim", <>replaying held-out attack · {netName(net.id)}</>)
        for (let s = 0; s < K && alive; s++) {
          const fc = fcs[s]
          const t = fc.as_of.iso.slice(11, 16)
          onStage(s)
          await wait(500)
          if (s === 0) add(t, "ALERT", "text-attack", <>initial access <b>{nm(fc.current)}</b></>)
          else {
            const r = rankOf(fcs[s - 1], fc.current)
            add(t, "HOP", r <= 3 ? "text-phos" : "text-predict", <><b>{nm(fc.footholds[s - 1])}→{nm(fc.current)}</b> rank #{r}</>)
          }
          await wait(800)
          add("", "FCAST", "text-predict", fc.next_hops.slice(0, 3).map((x) => `${nm(x.node)} ${pct(x.prob)}`).join("  "))
          await wait(800)
          const a = fc.actions[0]
          if (a) add("", "CUT", "text-defend", <>{a.kind === "isolate" ? `isolate ${nm(a.nodes[0])}` : `revoke ${nm(a.nodes[0])}→${nm(a.nodes[1])}`} −{pct(a.risk_drop)}</>)
          await wait(1800)
        }
        if (!alive) return
        const last = fcs[K - 1]
        const target = truth[truth.length - 1]
        const r = rankOf(last, target)
        add("", "HOP", r <= 3 ? "text-phos" : "text-predict", <><b>{nm(last.current)}→{nm(target)}</b> rank #{r}</>)
        await wait(700)
        add("", "VERDICT", "text-phos", firstHit >= 0 ? `true path in top 5, ${K - firstHit} hop${K - firstHit > 1 ? "s" : ""} early` : "true path missed")
        await wait(4000)
      }
    })()
    return () => { alive = false }
  }, [d, onStage])

  useLayoutEffect(() => {
    const el = logRef.current?.lastElementChild
    if (el && !reduced()) gsap.fromTo(el, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.25, ease: "power2.out" })
  }, [lines])

  return (
    <div className="term brackets" data-hero-fade>
      <div className="term-bar">
        <span className="term-dots"><i /><i /><i /></span>
        <b>live intercept</b>
        <span className="ml-auto">{d?.offline ? "recorded" : "model"}</span>
        <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play the replay" : "Pause the replay"} className="grid h-5 w-5 place-items-center text-dim hover:text-bright">
          {paused ? <I.play width={12} height={12} /> : <I.pause width={12} height={12} />}
        </button>
      </div>
      <div ref={logRef} className="h-[228px] overflow-hidden px-4 py-3 text-[12.5px] leading-[1.8]" aria-live="off">
        {lines.map((l) => (
          <div key={l.id} className="flex gap-3 whitespace-nowrap">
            <span className="w-10 shrink-0 text-faint">{l.t}</span>
            <span className={`w-16 shrink-0 font-medium ${l.tone}`}>{l.k}</span>
            <span className="truncate text-dim [&_b]:font-medium [&_b]:text-bright">{l.v}</span>
          </div>
        ))}
        <span className="caret" />
      </div>
    </div>
  )
}

/* =================================================================== ticker */
function Ticker() {
  const items = [
    `NEXT HOP TOP-5 ${pct(ev.next_hop.tgnn.top5)}`,
    `CAUGHT BEFORE TARGET ${pct(ev.time_to_detection.tgnn.detected_before_target)}`,
    `LINK AUC ${ev.link.calibrated.auc.toFixed(3)}`,
    `${ev.n_test_networks} UNSEEN NETWORKS`,
    `${ev.n_predictions} FORECASTS`,
    `CONTAINMENT RISK CUT ${pct(ev.containment?.mean_risk_drop ?? 0)}`,
    `RULE-BASED TOP-5 ${pct(ev.next_hop.heuristic.top5)}`,
    "0.16% ATTACK EVENTS",
  ]
  const row = [...items, ...items]
  return (
    <div className="ticker-wrap overflow-hidden border-b border-line bg-surface py-3" aria-label="Key results">
      <div className="ticker">
        {row.map((t, i) => (
          <span key={i} className="display flex items-center gap-4 whitespace-nowrap text-[28px] leading-none text-ink">
            <span className="text-phos">▮</span>{t}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ============================================ kill chain: pinned horizontal */
function KillChain() {
  const sec = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const nh = ev.next_hop
  const c = ev.containment
  const route = SNAP.path.map((i) => SNAP.nodes[i])
  const max = Math.max(...SNAP.hourly, 1)

  useLayoutEffect(() => {
    if (!sec.current || !track.current || reduced()) return
    const mm = gsap.matchMedia()
    mm.add("(min-width: 1024px)", () => {
      const t = track.current!
      const dist = () => t.scrollWidth - window.innerWidth + 80
      gsap.to(t, {
        x: () => -dist(), ease: "none",
        scrollTrigger: { trigger: sec.current, start: "top top", end: () => `+=${dist()}`, scrub: 0.6, pin: true, invalidateOnRefresh: true },
      })
    })
    return () => mm.revert()
  }, [])

  const panels: { n: string; title: string; body: string; viz: React.ReactNode }[] = [
    {
      n: "01", title: "Learns the order of logins",
      body: "Hourly graph snapshots feed a recurrent memory, so a login at 02:00 reads differently from one at 14:00.",
      viz: (
        <div className="flex h-full flex-col">
          <div className="label mb-3 flex justify-between"><span>{netName(SNAP.id)} · logins by hour</span><span className="text-attack">attack {SNAP.hops[0].time.slice(11, 16)}</span></div>
          <div className="flex flex-1 items-end gap-[4px]">
            {SNAP.hourly.map((v, x) => {
              const hit = SNAP.hops.some((hp) => Number(hp.time.slice(11, 13)) === x)
              return <span key={x} title={`${String(x).padStart(2, "0")}:00 · ${v} logins`} className="flex-1" style={{ height: `${Math.max(4, (100 * v) / max)}%`, background: hit ? "var(--attack)" : "var(--p-faint)", boxShadow: hit ? "0 0 10px var(--attack)" : undefined }} />
            })}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-faint"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
        </div>
      ),
    },
    {
      n: "02", title: "Forecasts the next machine",
      body: `The true next hop is in the top five ${pct(nh.tgnn.top5)} of the time on networks it never saw.`,
      viz: (
        <div className="flex h-full flex-col justify-center gap-5 text-[13px]">
          {(["top1", "top3", "top5"] as const).map((k) => (
            <div key={k}>
              <div className="mb-1.5 flex justify-between"><span className="text-dim">TOP-{k.slice(3)}</span><span className="text-bright">{pct(nh.tgnn[k])} <span className="text-faint">vs {pct(nh.heuristic[k])}</span></span></div>
              <AsciiBar v={nh.tgnn[k]} />
              <AsciiBar v={nh.heuristic[k]} dim />
            </div>
          ))}
        </div>
      ),
    },
    {
      n: "03", title: "Ranks routes to critical servers",
      body: "Yen's algorithm ranks the top-k paths, every move weighted by its forecast probability.",
      viz: (
        <div className="flex h-full flex-col justify-center gap-3 text-[14px]">
          <div className="label">{netName(SNAP.id)} · recorded route</div>
          {route.map((n, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-6 text-faint">{String(i).padStart(2, "0")}</span>
              <span className={`border px-2 py-0.5 ${i === 0 ? "border-attack text-attack" : n.group === "critical" ? "border-critical text-critical shadow-[0_0_12px_-2px_var(--critical)]" : "border-line-strong text-bright"}`}>{n.name}</span>
              <span className="text-dim">{n.label.toLowerCase()}</span>
              {i < route.length - 1 && <span className="ml-auto text-faint">──►</span>}
            </div>
          ))}
        </div>
      ),
    },
    {
      n: "04", title: "Recommends the cut that blocks them",
      body: `Containing the attacker removes ${pct(c?.mean_risk_drop ?? 0)} of path risk on average while blocking ${pct(c?.mean_normal_blocked ?? 0, 1)} of normal logins.`,
      viz: (
        <div className="flex h-full flex-col justify-center gap-5 text-[13px]">
          <div className="flex items-center gap-2 text-defend"><I.shield width={16} height={16} />RECOMMENDED CUT · MEAN OF {ev.n_predictions}</div>
          {([["risk removed", c?.mean_risk_drop ?? 0], ["normal traffic blocked", c?.mean_normal_blocked ?? 0], ["cuts the real path", c?.cuts_true_path ?? 0]] as const).map(([k, v]) => (
            <div key={k}>
              <div className="mb-1.5 flex justify-between"><span className="text-dim uppercase">{k}</span><span className="text-bright">{pct(v, v < 0.1 ? 1 : 0)}</span></div>
              <AsciiBar v={v} tone={k === "risk removed" ? "text-defend" : k.startsWith("normal") ? "text-predict" : "text-phos"} />
            </div>
          ))}
        </div>
      ),
    },
  ]

  return (
    <section ref={sec} className="relative overflow-hidden border-b border-line lg:h-[100svh]" id="steps">
      <div className="flex h-full flex-col justify-center py-20 lg:py-0" style={{ paddingTop: "max(var(--nav), 0px)" }}>
        <div ref={track} className="flex gap-6 px-[var(--gut)] max-lg:flex-col lg:w-max lg:items-stretch">
          <div className="flex w-full shrink-0 flex-col justify-center lg:w-[520px]">
            <div className="label mb-4 flex items-center gap-3"><span className="text-phos">[01]</span>the kill chain, forecast</div>
            <h2 className="glitch">Four steps.<br />One pipeline.</h2>
            <p className="lead mt-6 max-w-[40ch]">Earlier systems cover one or two of these. Lateralis runs all four on every hour of logs.</p>
            <div className="mt-8 hidden text-[12px] uppercase tracking-[.16em] text-faint lg:block">keep scrolling ──►</div>
          </div>
          {panels.map((p) => (
            <article key={p.n} className="term flex w-full shrink-0 flex-col lg:h-[560px] lg:w-[min(560px,42vw)]">
              <div className="term-bar"><span className="term-dots"><i /><i /><i /></span><b>step_{p.n}</b><span className="ml-auto">pid {1000 + Number(p.n) * 37}</span></div>
              <div className="min-h-[240px] flex-1 border-b border-line p-6">{p.viz}</div>
              <div className="p-6">
                <div className="display text-[44px] leading-none text-phos glow">{p.n}</div>
                <h3 className="mt-3 text-[20px]">{p.title}</h3>
                <p className="mt-2 text-[14px] leading-[1.65] text-dim">{p.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function AsciiBar({ v, dim = false, tone = "text-phos" }: { v: number; dim?: boolean; tone?: string }) {
  const n = 28
  const full = Math.round(v * n)
  return (
    <div className={`overflow-hidden whitespace-nowrap text-[13px] leading-[1.3] tracking-[-.04em] ${dim ? "text-faint" : `${tone} glow-sm`}`} aria-hidden="true">
      {"█".repeat(full)}<span className="text-surface-3">{"░".repeat(n - full)}</span>
    </div>
  )
}

/* ========================================================= console preview */
function ConsolePreview() {
  const d = useDemo()
  const s = d ? d.net.hops - 1 : 0
  const fc = d?.fcs[s]
  const nm = (i: number) => d!.net.nodes[i].name
  return (
    <section className="border-b border-line py-28" id="console">
      <div className="wrap">
        <SectionHead n="02" kicker="analyst console" title={<>The console<span className="text-phos">_</span></>}>
          Pick a held-out network, step through the attack and read the forecast beside the map. <Link className="link" to="/console">Open the console</Link>
        </SectionHead>
        <div className="term brackets" data-reveal>
          <div className="term-bar"><span className="term-dots"><i /><i /><i /></span><b>console</b> · {d ? netName(d.net.id) : "--"} · stage {s + 1}/{d?.net.hops ?? "-"}<span className="ml-auto max-sm:hidden">{fc?.as_of.label}</span></div>
          <div className="grid h-[560px] lg:grid-cols-[260px_minmax(0,1fr)_300px] max-lg:h-[460px]">
            <div className="hidden overflow-hidden border-r border-line lg:block">
              <div className="label border-b border-line px-4 py-2.5">test networks · {d?.list.length ?? 45}</div>
              <div className="[mask-image:linear-gradient(#000_70%,transparent)]">
                {(d?.list ?? []).slice(0, 12).map((n) => (
                  <div key={n.id} className={`flex items-center justify-between border-b border-line px-4 py-2.5 text-[12.5px] ${n.id === d?.net.id ? "bg-[var(--p-accent-soft)] text-phos" : "text-dim"}`}>
                    <span>{n.id === d?.net.id ? "> " : "  "}{netName(n.id)}</span><span className="text-faint">{n.machines}h · {n.hops}hop</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              {d && fc && <NetMap net={d.net} fc={fc} k={3} reveal={d.offline} className="absolute inset-0" />}
            </div>
            <div className="hidden flex-col gap-4 border-l border-line p-4 text-[12.5px] lg:flex">
              {d?.offline ? (
                <>
                  <div className="label">recorded attack</div>
                  {SNAP.hops.map((x) => (
                    <div key={x.hop} className="border-b border-dashed border-line pb-3">
                      <div className="flex justify-between text-faint"><span>HOP {x.hop}</span><span>{x.time.slice(11, 19)}</span></div>
                      <div className="mt-1 text-[14px]"><span className="text-attack">{nm(x.src)}</span> ──► <span className={x.hop === SNAP.hops.length ? "text-critical" : "text-bright"}>{nm(x.dst)}</span></div>
                      <div className="text-dim">user {x.user} · {d.net.nodes[x.dst].label.toLowerCase()}</div>
                    </div>
                  ))}
                  <div className="mt-auto text-dim">forecasts load from the model:<div className="mt-1 text-bright">$ python -m attackpath.api.server</div></div>
                </>
              ) : fc && (
                <>
                  <div className="label">next move</div>
                  {fc.next_hops.slice(0, 4).map((x) => (
                    <div key={x.node}><div className="flex justify-between"><span className="text-bright">{nm(x.node)}</span><span className="text-predict">{pct(x.prob)}</span></div><div className="meter cost mt-1"><i style={{ width: pct(x.prob / fc.next_hops[0].prob) }} /></div></div>
                  ))}
                  {fc.actions[0] && (
                    <div className="mt-2 border border-defend/40 bg-[var(--defend-soft)] p-3">
                      <div className="label !text-defend">recommended cut</div>
                      <div className="mt-1 text-[14px] text-bright">{fc.actions[0].kind === "isolate" ? `isolate ${nm(fc.actions[0].nodes[0])}` : `revoke ${nm(fc.actions[0].nodes[0])}→${nm(fc.actions[0].nodes[1])}`}</div>
                      <div className="mt-1 text-dim">risk −{pct(fc.actions[0].risk_drop)} · blocks {pct(fc.actions[0].blocked, 1)}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ================================================================= results */
function CountUp({ to, fmt }: { to: number; fmt: (v: number) => string }) {
  const el = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (!el.current || reduced()) return
    const o = { v: 0 }
    const tw = gsap.to(o, {
      v: to, duration: 1.2, ease: "power2.out",
      scrollTrigger: { trigger: el.current, start: "top 90%", once: true },
      onUpdate: () => { if (el.current) el.current.textContent = fmt(o.v) },
    })
    return () => { tw.scrollTrigger?.kill(); tw.kill() }
  }, [to, fmt])
  return <span ref={el}>{fmt(to)}</span>
}

const fmtPct = (v: number) => pct(v)
function Results() {
  const nh = ev.next_hop, td = ev.time_to_detection
  const rows: [string, number, number, number | null][] = [
    ["next hop · top 1", nh.tgnn.top1, nh.heuristic.top1, nh.random.top1],
    ["next hop · top 3", nh.tgnn.top3, nh.heuristic.top3, nh.random.top3],
    ["next hop · top 5", nh.tgnn.top5, nh.heuristic.top5, nh.random.top5],
    ["caught before target", td.tgnn.detected_before_target, td.heuristic.detected_before_target, null],
  ]
  return (
    <section className="border-b border-line bg-surface py-28" id="results">
      <div className="wrap">
        <SectionHead n="03" kicker="held-out evaluation" title={<>Results on {ev.n_test_networks}<br />unseen networks</>}>
          {ev.n_predictions} forecasts on networks held out of training, against a rule-based baseline and random guessing. <Link className="link" to="/results">See every metric</Link>
        </SectionHead>
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="term lg:col-span-8" data-reveal>
            <div className="term-bar"><span className="term-dots"><i /><i /><i /></span><b>eval_synthetic.json</b><span className="ml-auto">tgnn · rule · random</span></div>
            <div className="space-y-6 p-6 text-[13px]">
              {rows.map(([label, a, b, c]) => (
                <div key={label}>
                  <div className="mb-2 uppercase tracking-[.08em] text-bright">{label}</div>
                  {([["TGNN", a, "text-phos"], ["RULE", b, "text-dim"], ["RAND", c, "text-faint"]] as const).map(([k, v, tone]) => v == null ? null : (
                    <div key={k} className="grid grid-cols-[48px_1fr_56px] items-center gap-3">
                      <span className="text-faint">{k}</span>
                      <AsciiBar v={v} dim={k !== "TGNN"} />
                      <span className={`text-right ${tone}`}><CountUp to={v} fmt={fmtPct} /></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-px border border-line bg-line lg:col-span-4" data-reveal>
            {[
              [ev.link.calibrated.auc, (v: number) => v.toFixed(3), "AUC · next-hour links"],
              [ev.next_hop.tgnn.mrr, (v: number) => v.toFixed(3), "MRR · next hop"],
              [ev.containment?.mean_risk_drop ?? 0, fmtPct, "risk cut · containment"],
              [ev.next_hop.tgnn.ece, (v: number) => v.toFixed(3), "ECE · calibration error"],
            ].map(([v, f, k]) => (
              <div key={k as string} className="bg-surface p-6">
                <div className="display glow text-[64px] leading-none text-bright"><CountUp to={v as number} fmt={f as (v: number) => string} /></div>
                <div className="mt-2 text-[12px] uppercase tracking-[.12em] text-dim">{k as string}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ===================================================== pipeline: draws in */
const STAGES = [
  ["INPUT", "hourly graph", "users + machines as nodes, logins as edges"],
  ["ENCODER", "gat × 2", "graph attention, 4 heads, hidden 64"],
  ["MEMORY", "gru", "node state carried hour to hour"],
  ["HEADS", "link + next hop", "temperature-scaled probabilities"],
  ["DECISION", "paths + cut", "yen top-k routes, defense simulator"],
] as const

function Pipeline() {
  const sec = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    if (!sec.current || reduced()) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: "[data-pipe]", start: "top 75%", end: "bottom 60%", scrub: 0.8 } })
      gsap.utils.toArray<HTMLElement>("[data-node]").forEach((n, i) => {
        tl.from(n, { opacity: 0.15, y: 16, duration: 0.4 }, i * 0.5)
        const wire = sec.current!.querySelector(`[data-wire="${i}"]`)
        if (wire) tl.from(wire, { scaleX: 0, transformOrigin: "left center", duration: 0.4 }, i * 0.5 + 0.25)
      })
    }, sec)
    return () => ctx.revert()
  }, [])
  return (
    <section ref={sec} className="border-b border-line py-28" id="pipeline">
      <div className="wrap">
        <SectionHead n="04" kicker="architecture" title={<>How the model<br />reads a network</>}>
          A temporal graph neural network turns hours of logins into probabilities; path search and a defense simulator turn those into a decision.
        </SectionHead>
        <div data-pipe className="flex flex-col items-stretch gap-0 lg:flex-row lg:items-center">
          {STAGES.map(([k, t, body], i) => (
            <div key={k} className="contents">
              <div data-node className="term flex-1 p-5">
                <div className="flex items-center justify-between text-[11.5px] tracking-[.14em] text-faint"><span>{k}</span><span>0{i + 1}</span></div>
                <div className="display glow mt-3 text-[34px] leading-none text-bright">{t}</div>
                <p className="mt-2 text-[13px] leading-[1.55] text-dim">{body}</p>
              </div>
              {i < STAGES.length - 1 && (
                <div className="flex shrink-0 items-center justify-center max-lg:h-8 lg:w-10">
                  <span data-wire={i} className="block bg-phos shadow-[0_0_8px_var(--p-accent)] max-lg:h-full max-lg:w-px lg:h-px lg:w-full" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-10 grid grid-cols-2 border border-line md:grid-cols-4" data-reveal>
          {[["300", "synthetic networks"], ["210/45/45", "train · val · test"], ["7 days", "of logins each"], ["0.16%", "events are attacks"]].map(([v, k]) => (
            <div key={k} className="border-line p-5 [&:not(:last-child)]:border-r max-md:[&:nth-child(2)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b">
              <div className="display glow text-[44px] leading-none text-bright">{v}</div>
              <div className="mt-1 text-[12px] uppercase tracking-[.12em] text-dim">{k}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ============================================================== prior work */
const PRIOR: [string, string, string[]][] = [
  ["Bowman et al.", "RAID 2020", ["n", "n", "n", "n", "n"]],
  ["Euler", "NDSS 2022", ["y", "h", "n", "n", "n"]],
  ["DyMHAG", "IEEE Access 2025", ["y", "h", "n", "n", "n"]],
  ["Physics-informed GNN", "JCP 2025", ["n", "n", "y", "n", "n"]],
  ["SPGNN-API", "IEEE TIFS 2024", ["n", "n", "y", "n", "y"]],
  ["CybORG", "arXiv 2021", ["n", "n", "n", "n", "h"]],
]
const COLS = ["event order", "next-step", "path ranking", "calibrated", "defense"]
const mark = (v: string) => v === "y" ? <span className="text-phos glow-sm">[x]</span> : v === "h" ? <span className="text-predict">[~]</span> : <span className="text-faint">[ ]</span>

function PriorWork() {
  return (
    <section className="border-b border-line bg-surface py-28" id="prior-work">
      <div className="wrap">
        <SectionHead n="05" kicker="research gap" title={<>Prior work covers<br />one or two steps</>}>
          Six published approaches compared on the five things an analyst needs from a forecast.
        </SectionHead>
        <div className="term overflow-x-auto" data-reveal>
          <div className="term-bar"><span className="term-dots"><i /><i /><i /></span><b>diff prior_work lateralis</b></div>
          <table className="table min-w-[760px] text-[13.5px]">
            <thead><tr><th>approach</th>{COLS.map((c) => <th key={c} className="!text-center">{c}</th>)}</tr></thead>
            <tbody>
              {PRIOR.map(([n, v, m]) => (
                <tr key={n}><td><span className="text-bright">{n}</span><small>{v}</small></td>{m.map((x, i) => <td key={i} className="text-center">{mark(x)}</td>)}</tr>
              ))}
              <tr className="bg-[var(--p-accent-soft)]"><td><span className="text-phos glow-sm">&gt; Lateralis</span><small>this project</small></td>{COLS.map((c) => <td key={c} className="text-center">{mark("y")}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

/* ================================================================ man page */
const FAQ: [string, string][] = [
  ["TRAINING DATA", "300 synthetic company networks, each with seven days of normal logins and one attack of 3 to 6 hops. The attacker steals credentials and prefers admin machines. LANL, CICIDS2017 and UNSW-NB15 come next."],
  ["EVALUATION", "Every number comes from networks held out of training. A forecast for hour t+1 uses only logs up to hour t, so the model never sees the future."],
  ["PATH ACCURACY", "A full path needs three to six correct guesses in a row, so catching the attacker before the target is the more useful measure."],
  ["CALIBRATION", "Temperature scaling makes a 30% forecast come true about 30% of the time, so analysts can weigh the numbers directly."],
]
function ManPage() {
  return (
    <section className="border-b border-line py-28" id="questions">
      <div className="wrap">
        <div className="term mx-auto max-w-[920px]" data-reveal>
          <div className="term-bar"><span className="term-dots"><i /><i /><i /></span><b>man lateralis</b></div>
          <div className="p-8 text-[14.5px] leading-[1.75] max-sm:p-5">
            <div className="flex justify-between text-dim"><span>LATERALIS(1)</span><span className="max-sm:hidden">Security Forecasting Manual</span><span>LATERALIS(1)</span></div>
            <div className="mt-6 font-medium text-bright">NAME</div>
            <div className="pl-8 text-dim max-sm:pl-4">lateralis · forecast an intruder's next hop and the cut that blocks it</div>
            <div className="mt-5 font-medium text-bright">SYNOPSIS</div>
            <div className="pl-8 text-dim max-sm:pl-4"><span className="text-phos">python -m attackpath.api.server</span> [--port 8000]</div>
            {FAQ.map(([h, a]) => (
              <div key={h}>
                <div className="mt-5 font-medium text-bright">{h}</div>
                <div className="pl-8 text-dim max-sm:pl-4">{a}</div>
              </div>
            ))}
            <div className="mt-6 text-faint">Lateralis 1.0 · IS353IA 2026–27 · Krrish Agarwal <span className="caret ml-1" /></div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* =================================================================== close */
function Close() {
  return (
    <footer className="relative overflow-hidden pt-28 pb-10" id="contact">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(var(--p-line)_1px,transparent_1px),linear-gradient(90deg,var(--p-line)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(transparent,#000)]" aria-hidden="true" />
      <div className="wrap relative">
        <div data-reveal>
          <div className="text-[13px] text-faint">soc@lateralis:~$</div>
          <Link to="/console" className="display glow group mt-2 flex flex-wrap items-baseline gap-x-4 text-[clamp(52px,10vw,168px)] leading-[.9] text-bright no-underline">
            <span className="text-phos">$</span>./open-console<span className="caret !w-[.5em]" />
          </Link>
          <div className="btn-row mt-10">
            <Link to="/console" className="btn btn--primary">Open the console<I.arrow /></Link>
            <Link to="/method" className="btn">Read the method</Link>
          </div>
        </div>
        <div className="mt-24 grid gap-8 border-t border-line pt-8 text-[13px] md:grid-cols-12">
          <div className="md:col-span-5">
            <Brand size={34} />
            <p className="mt-3 max-w-[44ch] text-dim">Temporal graph learning for cyber attack-path forecasting and adaptive defense. AI &amp; ML course project, IS353IA, 2026–27.</p>
          </div>
          {[["product", [["/console", "console"], ["/events", "event log"], ["/reports", "reports"]]], ["research", [["/results", "results"], ["/method", "method"]]]].map(([h, ls]) => (
            <div key={h as string} className="md:col-span-2">
              <div className="label mb-3">{h as string}</div>
              <ul className="m-0 list-none space-y-2 p-0">{(ls as string[][]).map(([to, l]) => <li key={to}><Link className="navlink !normal-case !tracking-normal" to={to}>./{l}</Link></li>)}</ul>
            </div>
          ))}
          <div className="md:col-span-3">
            <div className="label mb-3">source</div>
            <a className="navlink inline-flex items-center gap-2 !normal-case !tracking-normal" href="https://github.com/krish-31/aiml-sem5" target="_blank" rel="noopener noreferrer"><I.github width={14} height={14} />krish-31/aiml-sem5</a>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[12px] text-faint md:col-span-12">
            <span>LATERALIS · {new Date().getFullYear()} · Krrish Agarwal</span><span>synthetic attack data generated by this project · EOF</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
