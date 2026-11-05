import { useEffect, useState, type ReactNode, type SVGProps } from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { getSummary } from "@/lib/api"

/* ----------------------------------------------------------------- icons */
type IP = SVGProps<SVGSVGElement>
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const
export const I = {
  arrow: (p: IP) => <svg {...base} className="m-arrow" {...p}><path d="M5 12h13M13 6.5 18.5 12 13 17.5" /></svg>,
  play: (p: IP) => <svg {...base} {...p}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></svg>,
  pause: (p: IP) => <svg {...base} {...p}><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" /></svg>,
  prev: (p: IP) => <svg {...base} strokeWidth={2} {...p}><path d="M15 5.5 8.5 12l6.5 6.5" /></svg>,
  next: (p: IP) => <svg {...base} strokeWidth={2} {...p}><path d="M9 5.5 15.5 12 9 18.5" /></svg>,
  check: (p: IP) => <svg {...base} strokeWidth={2.2} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  shield: (p: IP) => <svg {...base} {...p}><path d="M12 2.5 4 5.8v5.7c0 5 3.4 9 8 10.5 4.6-1.5 8-5.5 8-10.5V5.8z" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></svg>,
  sun: (p: IP) => <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>,
  moon: (p: IP) => <svg {...base} {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>,
  menu: (p: IP) => <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  close: (p: IP) => <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  file: (p: IP) => <svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>,
  download: (p: IP) => <svg {...base} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>,
  github: (p: IP) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path fill="currentColor" d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.6-.2.6-.5v-1.7c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1 2.8.8.1-.6.3-1 .6-1.3-2.1-.2-4.3-1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.7 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.2 4.5-4.3 4.7.3.3.6.9.6 1.8v2.6c0 .3.1.6.6.5A9.5 9.5 0 0 0 12 2.5z" /></svg>
  ),
}

/* ----------------------------------------------------------------- theme */
type Theme = "dark" | "light"
export function useTheme(): [Theme, () => void] {
  const [t, setT] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) || "dark")
  useEffect(() => {
    document.documentElement.dataset.theme = t
    try { localStorage.setItem("lateralis-theme", t) } catch { /* storage blocked: the theme still applies */ }
  }, [t])
  return [t, () => setT((x) => (x === "dark" ? "light" : "dark"))]
}

/* ----------------------------------------------------------------- mark */
export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 text-ink no-underline" aria-label="Lateralis home">
      <span className="grid h-8 w-8 place-items-center rounded-md bg-cyan text-[15px] font-semibold text-[var(--p-accent-ink)]" style={{ fontFamily: "var(--font-display)" }}>L</span>
      <span className="text-[20px] font-medium tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>Lateralis</span>
    </Link>
  )
}

export const PRIMARY = "Open the live console"
const NAV = [
  ["/events", "Events"],
  ["/reports", "Reports"],
  ["/results", "Results"],
  ["/method", "Method"],
] as const

function useApiStatus() {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => { getSummary().then(() => setOk(true), () => setOk(false)) }, [])
  return ok
}

/* ------------------------------------------------------------------- nav */
export function Nav() {
  const [theme, toggle] = useTheme()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const ok = useApiStatus()
  useEffect(() => setOpen(false), [loc.pathname])

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-background" style={{ height: "var(--nav)" }}>
      <div className="wrap flex h-full items-center justify-between gap-6">
        <a href="#main" className="absolute h-px w-px overflow-hidden [clip-path:inset(50%)] focus:static focus:h-auto focus:w-auto focus:[clip-path:none]">Skip to content</a>
        <Brand />
        <nav aria-label="Main" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 lg:flex">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} className="navlink" aria-current={loc.pathname === to ? "page" : undefined}>{label}</NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-[13px] text-dim xl:flex" title={ok === false ? "Start it with python -m attackpath.api.server" : "Model loaded"}>
            <span className={`live-dot ${ok === false ? "off" : ""}`} />
            {ok === false ? "Model offline" : "Model online"}
          </span>
          <button type="button" className="icon-btn" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            {theme === "dark" ? <I.sun /> : <I.moon />}
          </button>
          <Link to="/console" className="btn btn--primary hidden sm:inline-flex">{PRIMARY}<I.arrow /></Link>
          <button type="button" className="btn grid w-11 place-items-center !p-0 lg:hidden" aria-label="Open the menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <I.menu width={18} height={18} />
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background" onClick={() => setOpen(false)}>
          <div className="wrap flex items-center justify-between border-b border-line" style={{ height: "var(--nav)" }}>
            <Brand />
            <button type="button" className="icon-btn" aria-label="Close the menu"><I.close /></button>
          </div>
          <nav aria-label="Main (mobile)" className="wrap flex flex-col pt-4">
            {[["/", "Overview"], ...NAV, ["/console", "Console"]].map(([to, label]) => (
              <Link key={to} to={to} className="flex h-14 items-center border-b border-line text-[18px] text-ink no-underline">{label}</Link>
            ))}
          </nav>
          <div className="wrap mt-auto pb-8">
            <Link to="/console" className="btn btn--primary w-full">{PRIMARY}<I.arrow /></Link>
          </div>
        </div>
      )}
    </header>
  )
}

/* ------------------------------------------------- closing (landing only) */
export function Closing() {
  const year = new Date().getFullYear()
  return (
    <footer className="closing ground-lit" id="contact" style={{ ["--h" as string]: 1 }}>
      <div className="wrap flex h-full flex-col justify-between gap-12">
        <div>
          <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-[640px]">
              <h2>Watch a forecast on a held-out network</h2>
              <p className="lead mt-5">Step through a real attack hop by hop and see the next move, the likely paths and the cut that blocks them.</p>
            </div>
            <Link to="/console" className="btn btn--primary">{PRIMARY}<I.arrow /></Link>
          </div>
          <div aria-hidden="true" className="mt-12 select-none whitespace-nowrap leading-[.8] text-ink"
            style={{ fontFamily: "var(--font-display)", fontWeight: 500, letterSpacing: "-0.055em", fontSize: "min(25.4vw, 362px, 30svh)" }}>
            Lateralis
          </div>
        </div>
        <SiteLinks year={year} />
      </div>
    </footer>
  )
}

function SiteLinks({ year }: { year: number }) {
  const cols: [string, [string, string][]][] = [
    ["Product", [["/console", "Console"], ["/events", "Event log"], ["/reports", "Reports"]]],
    ["Research", [["/results", "Results"], ["/method", "Method"]]],
  ]
  return (
    <div className="grid12 border-t border-line pt-8">
      <div className="col-span-12 text-[14px] text-dim md:col-span-6">
        Temporal graph learning for cyber attack-path forecasting and adaptive defense. AI &amp; ML course project, IS353IA, 2026–27.
      </div>
      {cols.map(([h, links]) => (
        <div key={h} className="col-span-6 md:col-span-2">
          <div className="label mb-3">{h}</div>
          <ul className="m-0 list-none space-y-2 p-0">
            {links.map(([to, l]) => <li key={to}><Link className="navlink !text-[14px]" to={to}>{l}</Link></li>)}
          </ul>
        </div>
      ))}
      <div className="col-span-12 md:col-span-2">
        <div className="label mb-3">Source</div>
        <a className="navlink inline-flex items-center gap-2 !text-[14px]" href="https://github.com/krish-31/aiml-sem5" target="_blank" rel="noopener noreferrer">
          <I.github width={15} height={15} /> GitHub
        </a>
      </div>
      <div className="col-span-12 mt-4 flex flex-wrap justify-between gap-2 text-[13px] text-dim">
        <span>Lateralis · {year} · Krrish Agarwal</span>
        <span>Synthetic attack data generated by this project</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------- app pages: page frame */
export function AppPage({ title, intro, aside, children }: { title: string; intro?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="wrap pb-24" style={{ paddingTop: "calc(var(--nav) + 48px)" }}>
      <div className="mb-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-[720px]">
          <h1 style={{ fontSize: "var(--t-h2)", lineHeight: 1.06 }}>{title}</h1>
          {intro && <p className="lead mt-4">{intro}</p>}
        </div>
        {aside}
      </div>
      {children}
      <div className="mt-20 flex flex-wrap justify-between gap-3 border-t border-line pt-6 text-[13px] text-dim">
        <span>Lateralis · temporal graph learning for attack-path forecasting · Krrish Agarwal · IS353IA</span>
        <a className="navlink inline-flex items-center gap-2 !text-[13px]" href="https://github.com/krish-31/aiml-sem5" target="_blank" rel="noopener noreferrer"><I.github width={14} height={14} /> krish-31/aiml-sem5</a>
      </div>
    </div>
  )
}

export function Offline({ what = "this view" }: { what?: string }) {
  return (
    <div className="panel p-8 text-dim">
      Cannot reach the API for {what}. Start it with <span className="mono text-ink">python -m attackpath.api.server</span>.
    </div>
  )
}
