import { useEffect, useState, type ReactNode, type SVGProps } from "react"
import { Link, NavLink, useLocation } from "react-router-dom"
import { getSummary } from "@/lib/api"

/* ----------------------------------------------------------------- icons */
type IP = SVGProps<SVGSVGElement>
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "square", strokeLinejoin: "miter", "aria-hidden": true } as const
export const I = {
  arrow: (p: IP) => <svg {...base} className="m-arrow" {...p}><path d="M5 12h13M13 6.5 18.5 12 13 17.5" /></svg>,
  play: (p: IP) => <svg {...base} {...p}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></svg>,
  pause: (p: IP) => <svg {...base} {...p}><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" /></svg>,
  prev: (p: IP) => <svg {...base} strokeWidth={2} {...p}><path d="M15 5.5 8.5 12l6.5 6.5" /></svg>,
  next: (p: IP) => <svg {...base} strokeWidth={2} {...p}><path d="M9 5.5 15.5 12 9 18.5" /></svg>,
  check: (p: IP) => <svg {...base} strokeWidth={2.2} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  shield: (p: IP) => <svg {...base} {...p}><path d="M12 2.5 4 5.8v5.7c0 5 3.4 9 8 10.5 4.6-1.5 8-5.5 8-10.5V5.8z" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></svg>,
  menu: (p: IP) => <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  close: (p: IP) => <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  file: (p: IP) => <svg {...base} {...p}><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></svg>,
  download: (p: IP) => <svg {...base} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>,
  github: (p: IP) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path fill="currentColor" d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.6-.2.6-.5v-1.7c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1 2.8.8.1-.6.3-1 .6-1.3-2.1-.2-4.3-1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.7 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.2 4.5-4.3 4.7.3.3.6.9.6 1.8v2.6c0 .3.1.6.6.5A9.5 9.5 0 0 0 12 2.5z" /></svg>
  ),
}

/* ---------------------------------------------------- phosphor (theme) */
type Phosphor = "green" | "amber"
export function usePhosphor(): [Phosphor, () => void] {
  const [p, setP] = useState<Phosphor>(() => (document.documentElement.dataset.phosphor as Phosphor) || "green")
  useEffect(() => {
    document.documentElement.dataset.phosphor = p
    try { localStorage.setItem("lateralis-phosphor", p) } catch { /* storage blocked */ }
  }, [p])
  return [p, () => setP((x) => (x === "green" ? "amber" : "green"))]
}
export const useTheme = usePhosphor

function PhosphorToggle({ wide = false }: { wide?: boolean }) {
  const [p, toggle] = usePhosphor()
  return (
    <button type="button" onClick={toggle} aria-label={`Switch to ${p === "green" ? "amber" : "green"} phosphor`}
      className={`flex h-[34px] items-center gap-2 border border-line px-2.5 text-[11.5px] uppercase tracking-[.12em] text-dim transition-colors hover:border-line-strong hover:text-bright ${wide ? "w-full justify-between" : ""}`}>
      {wide && <span>Phosphor</span>}
      <span className="flex items-center gap-1.5">
        <i className={`h-2.5 w-2.5 ${p === "green" ? "bg-[#39ff14] shadow-[0_0_6px_#39ff14]" : "bg-[#1c3a1a]"}`} />
        <i className={`h-2.5 w-2.5 ${p === "amber" ? "bg-[#ffb000] shadow-[0_0_6px_#ffb000]" : "bg-[#3a2a0c]"}`} />
      </span>
    </button>
  )
}

function useApiStatus() {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => { getSummary().then(() => setOk(true), () => setOk(false)) }, [])
  return ok
}

function useClock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i) }, [])
  return t.toTimeString().slice(0, 8)
}

/* ----------------------------------------------------------------- brand */
export function Brand({ to = "/", size = 30 }: { to?: string; size?: number }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 text-bright no-underline" aria-label="Lateralis home">
      <span className="grid h-7 w-7 place-items-center border border-phos text-phos shadow-[0_0_10px_-2px_var(--p-accent)]">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 18 10 6l4 8 2-4 4 8" /></svg>
      </span>
      <span className="display glow leading-none" style={{ fontSize: size }}>LATERALIS</span>
    </Link>
  )
}

export const PRIMARY = "Open the live console"

const LINKS = [
  ["/console", "Console", "01"],
  ["/events", "Events", "02"],
  ["/reports", "Reports", "03"],
  ["/results", "Results", "04"],
  ["/method", "Method", "05"],
] as const

/* ------------------------------------------------- landing: top bar */
export function TopBar() {
  const [open, setOpen] = useState(false)
  const ok = useApiStatus()
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-[color-mix(in_oklab,var(--p-bg)_82%,transparent)] backdrop-blur-sm" style={{ height: "var(--nav)" }}>
      <div className="wrap flex h-full items-center justify-between gap-6">
        <Brand />
        <nav aria-label="Main" className="hidden items-center gap-8 lg:flex">
          {LINKS.slice(1).map(([to, label]) => <NavLink key={to} to={to} className="navlink">{label}</NavLink>)}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-[11.5px] uppercase tracking-[.12em] text-dim xl:flex">
            <span className={`live-dot ${ok === false ? "off" : ""}`} />{ok === false ? "model offline" : "model online"}
          </span>
          <PhosphorToggle />
          <Link to="/console" className="btn btn--primary btn--sm hidden sm:inline-flex">Console<I.arrow /></Link>
          <button type="button" className="icon-btn lg:hidden" aria-label="Open the menu" onClick={() => setOpen(true)}><I.menu /></button>
        </div>
      </div>
      {open && <MobileMenu onClose={() => setOpen(false)} />}
    </header>
  )
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" onClick={onClose}>
      <div className="wrap flex items-center justify-between border-b border-line" style={{ height: 56 }}>
        <Brand />
        <button type="button" className="icon-btn" aria-label="Close the menu"><I.close /></button>
      </div>
      <nav aria-label="Main (mobile)" className="wrap flex flex-col pt-6">
        {[["/", "Overview", "00"], ...LINKS].map(([to, label, n]) => (
          <Link key={to} to={to} className="flex h-14 items-center gap-4 border-b border-line text-[20px] text-ink no-underline">
            <span className="text-[13px] text-faint">{n}</span><span className="display text-[30px] glow">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}

/* ------------------------------------------------- app pages: sidebar shell */
export function AppShell({ children }: { children: ReactNode }) {
  const ok = useApiStatus()
  const clock = useClock()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  return (
    <div className="app-shell min-h-[100svh] lg:pl-[var(--side)] [--nav:56px] lg:[--nav:0px]">
      {/* sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--side)] flex-col border-r border-line-strong bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-line px-5"><Brand size={28} /></div>
        <div className="border-b border-line px-5 py-3 text-[11.5px] text-faint">
          <div>soc@lateralis:~$</div>
          <div className="mt-0.5 truncate text-dim">./forecast --live</div>
        </div>
        <nav aria-label="App" className="flex flex-col py-3">
          <SideLink to="/" n="00" label="Overview" />
          {LINKS.map(([to, label, n]) => <SideLink key={to} to={to} n={n} label={label} />)}
        </nav>
        <div className="mt-auto space-y-3 border-t border-line p-5 text-[11.5px] uppercase tracking-[.12em]">
          <div className="flex items-center justify-between text-dim">
            <span className="flex items-center gap-2"><span className={`live-dot ${ok === false ? "off" : ""}`} />{ok === false ? "offline" : "online"}</span>
            <span className="mono tabular-nums text-faint">{clock}</span>
          </div>
          <PhosphorToggle wide />
          <a className="flex items-center gap-2 text-faint no-underline hover:text-bright" href="https://github.com/krish-31/aiml-sem5" target="_blank" rel="noopener noreferrer">
            <I.github width={14} height={14} /> source
          </a>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-background px-4 lg:hidden">
        <Brand size={26} />
        <div className="flex items-center gap-2">
          <PhosphorToggle />
          <button type="button" className="icon-btn" aria-label="Open the menu" onClick={() => setOpen(true)}><I.menu /></button>
        </div>
      </header>
      {open && <MobileMenu onClose={() => setOpen(false)} />}

      {children}
    </div>
  )
}

function SideLink({ to, n, label }: { to: string; n: string; label: string }) {
  return (
    <NavLink to={to} end className={({ isActive }) =>
      `group flex items-center gap-3 border-l-2 px-5 py-2.5 text-[13px] uppercase tracking-[.12em] no-underline transition-colors ${isActive
        ? "border-phos bg-[var(--p-accent-soft)] text-phos [text-shadow:var(--glow-sm)]"
        : "border-transparent text-dim hover:border-line-strong hover:bg-surface-2 hover:text-bright"}`}>
      <span className="text-[11px] text-faint group-hover:text-dim">{n}</span>
      {label}
    </NavLink>
  )
}

/* ------------------------------------------------- app pages: page frame */
export function AppPage({ title, intro, aside, children }: { title: string; intro?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  const loc = useLocation()
  return (
    <main id="main" className="px-[var(--gut)] pb-20" style={{ paddingTop: "calc(var(--nav) + 40px)" }}>
      <div className="mx-auto max-w-[1360px]">
        <div className="mb-8 flex flex-col justify-between gap-6 border-b border-line pb-8 lg:flex-row lg:items-end">
          <div className="max-w-[820px]">
            <div className="mb-3 text-[12.5px] text-faint">soc@lateralis:~$ <span className="text-dim">lateralis {loc.pathname.slice(1)}</span></div>
            <h1 className="glitch" style={{ fontSize: "clamp(44px, 5vw, 72px)" }}>{title}</h1>
            {intro && <p className="lead mt-4 max-w-[70ch]">{intro}</p>}
          </div>
          {aside}
        </div>
        {children}
        <div className="mt-16 flex flex-wrap justify-between gap-3 border-t border-line pt-5 text-[12px] text-faint">
          <span>LATERALIS · temporal graph learning for attack-path forecasting · Krrish Agarwal · IS353IA</span>
          <span>EOF</span>
        </div>
      </div>
    </main>
  )
}

export function Offline({ what = "this view" }: { what?: string }) {
  return (
    <div className="term">
      <div className="term-bar"><span className="term-dots"><i /><i /><i /></span><b>error</b> · connection refused</div>
      <div className="p-6 text-[14px] leading-[1.7] text-dim">
        <div><span className="text-attack">ERR</span> cannot reach the API for {what}.</div>
        <div className="mt-2">start it with: <span className="text-bright">python -m attackpath.api.server</span><span className="caret ml-1" /></div>
      </div>
    </div>
  )
}
