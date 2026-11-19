import { useLayoutEffect, useMemo, useRef, useState } from "react"
import gsap from "gsap"
import type { Forecast, Network, NetNode } from "@/lib/api"
import { pct } from "@/lib/api"

/* The network as concentric rings (critical inside, servers, workstations outside),
   the attack so far, the forecast paths, the most likely next hop and the recommended cut.
   A stage change draws the new forecast paths in (one 500 ms swap the visitor's click makes). */

const radius = (n: NetNode) => (n.group === "critical" ? 0.045 : n.group === "server" ? 0.031 : 0.02)

export type HoverInfo = { node: NetNode; held: boolean; p: number; x: number; y: number } | null

interface Props {
  net: Network
  fc: Forecast
  k?: number
  reveal?: boolean
  labels?: boolean
  className?: string
  onHover?: (info: HoverInfo) => void
}

export function NetMap({ net, fc, k = 3, reveal = false, labels = true, className, onHover }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [ax, setAx] = useState(1)

  // stretch the rings into ellipses so a wide panel is filled; nodes stay round
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (height > 0) setAx(Math.max(1, Math.min(1.7, (width / height) * 0.86)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const g = useMemo(() => {
    const nodes = net.nodes.map((n) => ({ ...n, x: n.x * ax }))
    const held = new Set(fc.footholds)
    const top = new Set(fc.next_hops.slice(0, 3).map((h) => h.node))
    const shown = fc.paths.slice(0, k)
    const onPath = new Set(shown.flatMap((p) => p.nodes))
    const truth = reveal ? fc.truth.remaining : []
    const seg = (a: number, b: number, extra = 0.012) => {
      const A = nodes[a], B = nodes[b]
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1
      const pa = radius(A) + 0.006, pb = radius(B) + extra
      return `M${(A.x + (dx * pa) / L).toFixed(4)},${(A.y + (dy * pa) / L).toFixed(4)}L${(B.x - (dx * pb) / L).toFixed(4)},${(B.y - (dy * pb) / L).toFixed(4)}`
    }
    const pairs = (list: number[]) => list.slice(1).map((v, i) => [list[i], v] as const)
    return { nodes, held, top, shown, onPath, truth, seg, pairs }
  }, [net, fc, k, reveal, ax])

  // draw the forecast paths and the newest attack hop in
  useLayoutEffect(() => {
    const root = svg.current
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const ctx = gsap.context(() => {
      root.querySelectorAll<SVGPathElement>(".draw").forEach((p, i) => {
        const len = p.getTotalLength()
        gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, {
          strokeDashoffset: 0, duration: 0.5, delay: 0.04 * i, ease: "power2.out",
          onComplete: () => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = "" },
        })
      })
      gsap.from(root.querySelectorAll(".halo, .halo-ring"), { scale: 0.4, opacity: 0, transformOrigin: "center", transformBox: "fill-box", duration: 0.45, ease: "power2.out", stagger: 0.01 })
      gsap.from(root.querySelectorAll(".next-mark, .defense"), { opacity: 0, duration: 0.4, delay: 0.25, ease: "power1.out" })
    }, root)
    return () => ctx.revert()
  }, [fc, k])

  const { nodes, held, top, shown, onPath, truth, seg, pairs } = g
  const P = fc.p_next
  const best = fc.actions[0]
  const cur = nodes[fc.current]
  const nx = fc.next_hops[0] ? nodes[fc.next_hops[0].node] : null
  const haloR = (n: NetNode) => radius(n) + 0.01 + 0.07 * Math.sqrt(P[n.i])
  const lastHop = fc.footholds.length > 1 ? fc.footholds.length - 2 : -1

  const move = (e: React.MouseEvent) => {
    if (!onHover) return
    const el = (e.target as Element).closest<SVGGElement>("[data-i]")
    if (!el) return onHover(null)
    const i = Number(el.dataset.i)
    onHover({ node: net.nodes[i], held: held.has(i), p: P[i], x: e.clientX, y: e.clientY })
  }

  return (
    <div ref={box} className={className ?? "relative h-full w-full"}>
      <svg
        ref={svg}
        className="netmap"
        viewBox={`${(-1.1 * ax).toFixed(3)} -1.2 ${(2.2 * ax).toFixed(3)} 2.32`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Network ${net.id}: ${net.nodes.length} machines, attacker on ${net.nodes[fc.current].name}, ${shown.length} forecast paths`}
        onMouseMove={move}
        onMouseLeave={() => onHover?.(null)}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          {[["m-pred", "var(--predict)"], ["m-attack", "var(--attack)"]].map(([id, c]) => (
            <marker key={id} id={id} viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth=".055" markerHeight=".055" orient="auto">
              <path d="M0,0L10,5L0,10z" style={{ fill: c }} />
            </marker>
          ))}
        </defs>

        {([[0.24, "Critical"], [0.6, "Servers"], [1.0, "Workstations"]] as const).map(([r, t]) => (
          <g key={t}>
            <ellipse rx={r * ax} ry={r} className="ring-guide" />
            {labels && <text className="ring-label" x="0" y={-r - (r === 1 ? 0.05 : 0.02)} textAnchor="middle">{t}</text>}
          </g>
        ))}

        <path className="e-normal" d={fc.normal_edges.map(([u, v]) => seg(u, v, 0.004)).join("")} />

        {nodes.filter((n) => !held.has(n.i) && P[n.i] > 0.02).map((n) => (
          <g key={`h${n.i}`}>
            <circle className="halo" cx={n.x} cy={n.y} r={haloR(n)} />
            {top.has(n.i) && <circle className="halo-ring" cx={n.x} cy={n.y} r={haloR(n)} />}
          </g>
        ))}

        {truth.length > 1 && <path className="e-truth" d={pairs(truth).map(([a, b]) => seg(a, b)).join("")} />}

        {shown.map((p, r) => ({ p, r })).reverse().map(({ p, r }) => (
          <path
            key={`p${r}-${p.nodes.join("-")}`}
            className="e-pred draw"
            style={{ strokeWidth: 0.016 - r * 0.003, opacity: 1 - r * 0.2 }}
            markerEnd="url(#m-pred)"
            d={pairs(p.nodes).map(([a, b]) => seg(a, b, 0.02)).join("")}
          />
        ))}

        {best?.kind === "block" && <path className="e-block defense" d={seg(best.nodes[0], best.nodes[1], 0.006)} />}
        {best?.kind === "isolate" && (
          <circle className="iso-ring defense" cx={nodes[best.nodes[0]].x} cy={nodes[best.nodes[0]].y} r={radius(nodes[best.nodes[0]]) + 0.035} />
        )}

        {pairs(fc.footholds).map(([a, b], i) => (
          <path key={`a${a}-${b}`} className={`e-attack ${i === lastHop ? "draw" : ""}`} markerEnd="url(#m-attack)" d={seg(a, b, 0.02)} />
        ))}

        {nodes.map((n) => {
          const cls = held.has(n.i) ? "n-held" : `n-${n.group === "workstation" ? "ws" : n.group}`
          const rr = radius(n)
          return (
            <g key={n.i} className="node" data-i={n.i}>
              {n.group === "critical"
                ? <polygon className={`${cls} stroke`} points={`${n.x},${n.y - rr} ${n.x + rr},${n.y} ${n.x},${n.y + rr} ${n.x - rr},${n.y}`} />
                : <circle className={`${cls} stroke`} cx={n.x} cy={n.y} r={rr} />}
              <circle cx={n.x} cy={n.y} r={rr + 0.02} fill="transparent" />
            </g>
          )
        })}

        <circle className="pulse" cx={cur.x} cy={cur.y} r={radius(cur)} />

        {labels && nodes
          .filter((n) => held.has(n.i) || n.group === "critical" || top.has(n.i) || onPath.has(n.i) || truth.includes(n.i))
          .map((n) => (
            <text key={`l${n.i}`} className={`n-label ${held.has(n.i) ? "attack" : n.group === "critical" || top.has(n.i) ? "strong" : ""}`}
              x={n.x} y={n.y + radius(n) + 0.042} textAnchor="middle">{n.name}</text>
          ))}

        {nx && (
          <g className="next-mark">
            <circle className="next-ring" cx={nx.x} cy={nx.y} r={radius(nx) + 0.05} />
            <rect className="next-tag" x={nx.x - 0.13} y={nx.y - radius(nx) - 0.13} width=".26" height=".066" rx=".012" />
            <text className="next-text" x={nx.x} y={nx.y - radius(nx) - 0.083} textAnchor="middle">NEXT {pct(fc.next_hops[0].prob)}</text>
          </g>
        )}
      </svg>
    </div>
  )
}

/* A floating tooltip for node hover. */
export function NodeTip({ info }: { info: HoverInfo }) {
  if (!info) return null
  const left = Math.min(info.x + 16, window.innerWidth - 240)
  const top = Math.min(info.y + 16, window.innerHeight - 80)
  return (
    <div role="tooltip" className="pointer-events-none fixed z-50 rounded-md border border-line bg-surface-2 px-3 py-2 text-[13px] shadow-lg" style={{ left, top }}>
      <b className="mono">{info.node.name}</b> <span className="text-dim">· {info.node.label}</span>
      {info.held
        ? <div className="mt-1 font-medium text-attack">Compromised</div>
        : <div className="mono mt-1 text-predict">P(next hop) = {info.p.toFixed(3)}</div>}
    </div>
  )
}
