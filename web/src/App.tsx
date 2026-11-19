import { useEffect } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AppShell, TopBar } from "@/components/Chrome"
import { TooltipProvider } from "@/components/ui/tooltip"
import Console from "@/pages/Console"
import Landing from "@/pages/Landing"
import { Events, Method, Reports, Results } from "@/pages/Pages"

/* Hash routes keep the old deep links working (#/console?net=62&stage=2&reveal=1)
   and need no server-side fallback from FastAPI's static mount. */

const TITLES: Record<string, string> = {
  "/": "LATERALIS · attack-path forecasting",
  "/console": "console · LATERALIS",
  "/events": "events · LATERALIS",
  "/reports": "reports · LATERALIS",
  "/results": "results · LATERALIS",
  "/method": "method · LATERALIS",
}

function Frame() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = TITLES[pathname] ?? TITLES["/"]
  }, [pathname])

  if (pathname === "/") return <><TopBar /><Landing /></>
  return (
    <AppShell>
      <Routes>
        <Route path="/console" element={<Console />} />
        <Route path="/events" element={<Events />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/results" element={<Results />} />
        <Route path="/method" element={<Method />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <TooltipProvider>
      <HashRouter>
        <Frame />
      </HashRouter>
    </TooltipProvider>
  )
}
