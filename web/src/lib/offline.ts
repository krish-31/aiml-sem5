/* Offline mode: the demo network and its recorded attack from dataset/ (src/data/snapshot.json,
   built by scripts/snapshot.mjs). It carries no forecast numbers: those only come from the model. */
import SNAP from "@/data/snapshot.json"
import type { Forecast, Network, NetworkListItem } from "@/lib/api"

export { SNAP }

const stamp = (k: number) => {
  const h = SNAP.hops[Math.max(0, k - 1)]
  return { seconds: h.seconds, iso: h.time.replace(" ", "T"), label: h.time }
}

export const OFFLINE_HOPS = SNAP.path.length - 1

export function offlineNetwork(): Network {
  return {
    id: SNAP.id,
    nodes: SNAP.nodes as Network["nodes"],
    users: SNAP.users,
    hops: OFFLINE_HOPS,
    stages: Array.from({ length: OFFLINE_HOPS }, (_, k) => stamp(k)),
  }
}

export function offlineForecast(k: number): Forecast {
  return {
    id: SNAP.id, stage: k, hour: 0, as_of: stamp(k),
    footholds: SNAP.path.slice(0, k + 1), current: SNAP.path[k], confidence: 0, risk: 0,
    p_next: SNAP.nodes.map(() => 0), next_hops: [], paths: [], containment: null, actions: [],
    normal_edges: SNAP.normal_edges as [number, number, number][],
    truth: { next: SNAP.path[k + 1] ?? null, remaining: SNAP.path.slice(k) },
  }
}

export const offlineList = (): NetworkListItem[] => SNAP.networks.filter((n) => n.id === SNAP.id)
