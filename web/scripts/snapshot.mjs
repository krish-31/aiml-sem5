// Builds src/data/snapshot.json: the demo network (NET-062) from the committed dataset/ CSVs,
// so the site shows the real network and its recorded attack when the API is offline.
// No forecast is stored: probabilities only come from the running model.
//   node scripts/snapshot.mjs
import fs from "node:fs"
import path from "node:path"

const GID = 62
const root = path.resolve(import.meta.dirname, "..", "..", "dataset")
const out = path.resolve(import.meta.dirname, "..", "src", "data", "snapshot.json")

const rows = (f) => {
  const [head, ...lines] = fs.readFileSync(path.join(root, f), "utf8").trim().split(/\r?\n/)
  const keys = head.split(",")
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v])))
}

const CRITICAL = new Set(["domain_controller", "database"])
const LABEL = {
  workstation: "Workstation", file_server: "File server", mail_server: "Mail server", app_server: "App server",
  web_server: "Web server", print_server: "Print server", domain_controller: "Domain controller", database: "Database",
}
const group = (r) => (CRITICAL.has(r) ? "critical" : r === "workstation" ? "workstation" : "server")

const all = rows("nodes.csv").filter((r) => Number(r.graph_id) === GID)
const comps = all.filter((r) => r.kind === "computer")
const users = all.filter((r) => r.kind === "user").length

// the same concentric layout as the API (src/attackpath/api/server.py: layout)
const R = { critical: 0.24, server: 0.6, workstation: 1.0 }
const OFF = { critical: Math.PI / 4, server: Math.PI / 9, workstation: 0 }
const rings = { critical: [], server: [], workstation: [] }
comps.forEach((c, i) => rings[group(c.role)].push(i))
const pos = comps.map(() => [0, 0])
for (const [name, members] of Object.entries(rings)) {
  members.forEach((i, k) => {
    if (members.length === 1 && name === "critical") return
    const a = (2 * Math.PI * k) / Math.max(members.length, 1) - Math.PI / 2 + OFF[name]
    pos[i] = [+(R[name] * Math.cos(a)).toFixed(4), +(R[name] * Math.sin(a)).toFixed(4)]
  })
}
const index = Object.fromEntries(comps.map((c, i) => [c.node, i]))
const nodes = comps.map((c, i) => ({ i, name: c.node, role: c.role, label: LABEL[c.role] ?? c.role, group: group(c.role), x: pos[i][0], y: pos[i][1] }))

const hops = rows("attack_hops.csv").filter((r) => Number(r.graph_id) === GID).sort((a, b) => a.hop - b.hop)
const pathIdx = [index[hops[0].src], ...hops.map((h) => index[h.dst])]

const seen = new Set()
const edges = []
const events = rows("events_NET-062.csv")
// logins in each hour of the attack day (the day of the first hop)
const day = hops[0].timestamp.slice(0, 10)
const hourly = Array.from({ length: 24 }, () => 0)
for (const e of events) if (e.timestamp.startsWith(day)) hourly[Number(e.timestamp.slice(11, 13))] += 1
for (const e of events) {
  if (e.src === e.dst || e.is_attack === "True") continue
  const k = `${e.src}>${e.dst}`
  if (seen.has(k) || !(e.src in index) || !(e.dst in index)) continue
  seen.add(k)
  edges.push([index[e.src], index[e.dst], 1])
}

const networks = rows("networks.csv").filter((r) => r.split === "test").map((r) => ({
  id: Number(r.graph_id),
  machines: Number(r.workstations) + Number(r.servers) + Number(r.critical_assets),
  users: Number(r.users),
  hops: Number(r.attack_hops),
}))

const snap = {
  id: GID,
  networks,
  users,
  nodes,
  normal_edges: edges,
  path: pathIdx,
  day,
  hourly,
  hops: hops.map((h) => ({ hop: Number(h.hop), time: h.timestamp, seconds: Number(h.time_seconds), user: h.user, src: index[h.src], dst: index[h.dst] })),
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(snap))
console.log(`wrote ${out}: ${nodes.length} machines, ${edges.length} login routes, ${hops.length} attack hops`)
