/* Typed client for the FastAPI backend (src/attackpath/api/server.py). Responses are cached per path. */

export type Group = "critical" | "server" | "workstation"

export interface NetNode {
  i: number
  name: string
  role: string
  label: string
  group: Group
  x: number
  y: number
}

export interface Moment {
  seconds: number
  iso: string
  label: string
}

export interface Network {
  id: number
  nodes: NetNode[]
  users: number
  hops: number
  stages: Moment[]
}

export interface NetworkListItem {
  id: number
  machines: number
  users: number
  hops: number
}

export interface Action {
  kind: "isolate" | "block"
  nodes: number[]
  label: string
  risk_drop: number
  blocked: number
  utility: number
}

export interface Forecast {
  id: number
  stage: number
  hour: number
  as_of: Moment
  footholds: number[]
  current: number
  confidence: number
  risk: number
  p_next: number[]
  next_hops: { node: number; prob: number; uncertainty: number }[]
  paths: { nodes: number[]; prob: number }[]
  containment: Action | null
  actions: Action[]
  normal_edges: [number, number, number][]
  truth: { next: number | null; remaining: number[] }
}

export type Severity = "high" | "medium" | "low" | "info"

export interface LogEvent {
  time: number
  label: string
  user: string
  src: string
  dst: string
  src_role: string
  dst_role: string
  remote: boolean
  severity: Severity
  forecast_rank: number | null
  unexpected: number | null
  attack: boolean
  step: number | null
  from_compromised: boolean
  novel: boolean
}

export interface EventLog {
  events: LogEvent[]
  summary: {
    events: number
    remote: number
    high: number
    medium: number
    attack_events: number
    attack_flagged: number
    normal_flagged: number
  }
}

export interface Summary {
  evaluation: Evaluation | null
  history: unknown[]
  temperatures: { link?: number; hop?: number }
  split: { train: number; val: number; test: number }
  model: Record<string, unknown>
  params: number
}

type TopK = { top1: number; top3: number; top5: number }
export interface Evaluation {
  n_test_networks: number
  n_predictions: number
  link: { calibrated: { auc: number; ap: number; ece: number } }
  next_hop: Record<"tgnn" | "tgnn_uncalibrated" | "heuristic" | "random", TopK & { mrr: number; ece: number }>
  path_hit_rate: Record<"tgnn" | "heuristic" | "random", TopK>
  time_to_detection: Record<"tgnn" | "heuristic", { detected_before_target: number; mean_hops_of_warning: number }>
  defense: { mean_risk_drop: number; mean_normal_blocked: number; cuts_true_path: number }
  containment?: { mean_risk_drop: number; mean_normal_blocked: number; cuts_true_path: number }
}

const cache = new Map<string, Promise<unknown>>()

export function api<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined
  if (!p) {
    p = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${path}`)
      return r.json() as Promise<T>
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p
}

export const getNetworks = () => api<{ networks: NetworkListItem[]; default: number }>("/api/networks")
export const getNetwork = (id: number) => api<Network>(`/api/network/${id}`)
export const getForecast = (id: number, stage: number) => api<Forecast>(`/api/forecast/${id}/${stage}`)
export const getEvents = (id: number) => api<EventLog>(`/api/events/${id}`)
export const getSummary = () => api<Summary>("/api/summary")
export const reportUrl = (id: number, stage: number, truth = true, download = false) =>
  `/api/report/${id}/${stage}?truth=${truth ? 1 : 0}${download ? "&download=1" : ""}`

/* ------------------------------------------------------------ formatting */
export const pct = (x: number, d = 0) => `${(100 * x).toFixed(d)}%`
export const netName = (id: number) => `NET-${String(id).padStart(3, "0")}`
export const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export const ROLE_SHORT: Record<string, string> = {
  workstation: "workstation", file_server: "file server", mail_server: "mail server", app_server: "app server",
  web_server: "web server", print_server: "print server", domain_controller: "domain controller", database: "database",
}
export const ROLE_NAME: Record<string, string> = {
  workstation: "Workstation", file_server: "File server", mail_server: "Mail server", app_server: "App server",
  web_server: "Web server", print_server: "Print server", domain_controller: "Domain controller", database: "Database",
}

export const rankOf = (fc: Forecast, v: number) => 1 + fc.p_next.filter((p) => p > fc.p_next[v]).length
