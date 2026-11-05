import { useEffect } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"
import { Nav } from "@/components/Chrome"
import { TooltipProvider } from "@/components/ui/tooltip"
import Console from "@/pages/Console"
import Landing from "@/pages/Landing"
import { Events, Method, Reports, Results } from "@/pages/Pages"

/* Hash routes keep the old deep links working (#/console?net=62&stage=2&reveal=1)
   and need no server-side fallback from FastAPI's static mount. */

const TITLES: Record<string, string> = {
  "/": "Lateralis · Attack-path forecasting for security teams",
  "/console": "Console · Lateralis",
  "/events": "Event log · Lateralis",
  "/reports": "Reports · Lateralis",
  "/results": "Results · Lateralis",
  "/method": "Method · Lateralis",
}

function Frame() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = TITLES[pathname] ?? TITLES["/"]
    document.documentElement.dataset.page = pathname === "/" ? "landing" : "app"
  }, [pathname])
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/console" element={<Console />} />
        <Route path="/events" element={<Events />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/results" element={<Results />} />
        <Route path="/method" element={<Method />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
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
