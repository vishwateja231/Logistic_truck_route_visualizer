import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as L from "leaflet"

// ── Types ─────────────────────────────────────────────────────────────────────
type Stop = { id: string; label: string; sub: string; lat: number; lng: number }
type CargoItem = { stopId: string; items: string[]; kg: number; pri: string }
type RouteConfig = {
  id: string; name: string; color: string; vehicle: string; driver: string
  stops: Stop[]; legCoords: [number, number][][]; cargo: CargoItem[]
}
type RouteData = { coords: [number, number][]; dists: number[]; total: number; legKm: number[]; totalKm: number }
type LogEntry = { id: number; ts: number; msg: string; type: "info" | "ok" | "warn" }
type SidebarTab = "LIVE" | "ROUTES" | "LOGS"
type Toast = { id: number; msg: string; type: "info" | "ok" | "warn" }
type FleetTruck = {
  id: string; color: string
  pos: { lat: number; lng: number; bearing: number } | null
  progress: number; name: string; vehicle: string; driver: string
  rd: RouteData | undefined
}

// ── Module-level counters ─────────────────────────────────────────────────────
let _tid = 0

// ── Weather data ──────────────────────────────────────────────────────────────
const ROUTE_WEATHER: Record<string, { icon: string; temp: string; cond: string }> = {
  "RT-4471": { icon: "⛅", temp: "18°C", cond: "Partly Cloudy" },
  "RT-2290": { icon: "🌧", temp: "14°C", cond: "Light Rain" },
  "RT-6650": { icon: "☀", temp: "22°C", cond: "Clear" },
  "CUSTOM":  { icon: "⛅", temp: "—",   cond: "Unknown" },
}

// ── Preset route configs ──────────────────────────────────────────────────────
const ROUTE_CONFIGS: RouteConfig[] = [
  {
    id: "RT-4471", name: "East Bay Corridor", color: "#00cfff", vehicle: "TK-09", driver: "M. Santos",
    stops: [
      { id: "O",  label: "Origin", sub: "Depot 04 · Fremont Yard",   lat: 37.5197, lng: -121.9863 },
      { id: "D1", label: "D1",     sub: "Northgate Retail",           lat: 37.5648, lng: -122.0353 },
      { id: "D2", label: "D2",     sub: "Harbor Distribution",        lat: 37.6688, lng: -122.0808 },
      { id: "D3", label: "D3",     sub: "Summit Logistics Park",      lat: 37.8044, lng: -122.2712 },
    ],
    legCoords: [
      [[37.5197,-121.9863],[37.5218,-121.9888],[37.5242,-121.9918],[37.5268,-121.9952],[37.5295,-121.9990],[37.5322,-122.0025],[37.5355,-122.0063],[37.5388,-122.0100],[37.5422,-122.0148],[37.5458,-122.0198],[37.5495,-122.0248],[37.5532,-122.0295],[37.5580,-122.0325],[37.5648,-122.0353]],
      [[37.5648,-122.0353],[37.5695,-122.0383],[37.5740,-122.0412],[37.5788,-122.0443],[37.5838,-122.0476],[37.5890,-122.0510],[37.5942,-122.0542],[37.5995,-122.0572],[37.6055,-122.0605],[37.6118,-122.0638],[37.6185,-122.0665],[37.6258,-122.0698],[37.6340,-122.0725],[37.6420,-122.0748],[37.6510,-122.0772],[37.6600,-122.0790],[37.6688,-122.0808]],
      [[37.6688,-122.0808],[37.6750,-122.0872],[37.6822,-122.0958],[37.6895,-122.1062],[37.6968,-122.1195],[37.7042,-122.1345],[37.7118,-122.1498],[37.7200,-122.1645],[37.7292,-122.1798],[37.7390,-122.1952],[37.7495,-122.2100],[37.7602,-122.2255],[37.7712,-122.2408],[37.7828,-122.2560],[37.7938,-122.2638],[37.8044,-122.2712]],
    ],
    cargo: [
      { stopId: "D1", items: ["Retail fixtures×12", "Display units×4"],  kg: 820,  pri: "STD" },
      { stopId: "D2", items: ["Container×1", "Pallets×6"],                kg: 2400, pri: "EXP" },
      { stopId: "D3", items: ["Equipment crates×8", "Machinery×2"],       kg: 1650, pri: "STD" },
    ],
  },
  {
    id: "RT-2290", name: "SF Mission Run", color: "#ffad1f", vehicle: "TK-14", driver: "J. Reyes",
    stops: [
      { id: "O",  label: "Origin", sub: "Mission Depot · SF",          lat: 37.7590, lng: -122.4148 },
      { id: "D1", label: "D1",     sub: "Hayes Valley Kitchen",         lat: 37.7780, lng: -122.4150 },
      { id: "D2", label: "D2",     sub: "Financial District Café",      lat: 37.7946, lng: -122.4058 },
      { id: "D3", label: "D3",     sub: "North Beach Deli",             lat: 37.8025, lng: -122.4088 },
    ],
    legCoords: [
      [[37.7590,-122.4148],[37.7620,-122.4150],[37.7650,-122.4151],[37.7685,-122.4151],[37.7718,-122.4150],[37.7750,-122.4150],[37.7780,-122.4150]],
      [[37.7780,-122.4150],[37.7810,-122.4125],[37.7838,-122.4098],[37.7868,-122.4075],[37.7900,-122.4060],[37.7924,-122.4055],[37.7946,-122.4058]],
      [[37.7946,-122.4058],[37.7963,-122.4065],[37.7980,-122.4072],[37.7998,-122.4078],[37.8010,-122.4083],[37.8025,-122.4088]],
    ],
    cargo: [
      { stopId: "D1", items: ["Produce crates×8", "Dairy pallets×3"],   kg: 420,  pri: "EXP" },
      { stopId: "D2", items: ["Beverage cases×20", "Bakery goods×6"],    kg: 680,  pri: "STD" },
      { stopId: "D3", items: ["Deli provisions×12", "Frozen goods×4"],   kg: 340,  pri: "EXP" },
    ],
  },
  {
    id: "RT-6650", name: "Silicon Valley Express", color: "#b060ff", vehicle: "TK-22", driver: "A. Patel",
    stops: [
      { id: "O",  label: "Origin", sub: "Palo Alto Tech Hub",           lat: 37.4419, lng: -122.1430 },
      { id: "D1", label: "D1",     sub: "Mountain View Campus",         lat: 37.3861, lng: -122.0839 },
      { id: "D2", label: "D2",     sub: "Sunnyvale Warehouse",          lat: 37.3688, lng: -122.0363 },
      { id: "D3", label: "D3",     sub: "Santa Clara Data Center",      lat: 37.3541, lng: -121.9552 },
    ],
    legCoords: [
      [[37.4419,-122.1430],[37.4310,-122.1330],[37.4200,-122.1215],[37.4090,-122.1100],[37.3975,-122.0975],[37.3861,-122.0839]],
      [[37.3861,-122.0839],[37.3820,-122.0710],[37.3775,-122.0580],[37.3735,-122.0475],[37.3688,-122.0363]],
      [[37.3688,-122.0363],[37.3658,-122.0195],[37.3622,-122.0035],[37.3595,-121.9868],[37.3568,-121.9710],[37.3541,-121.9552]],
    ],
    cargo: [
      { stopId: "D1", items: ["Server racks×4", "Network gear×8"],      kg: 1200, pri: "EXP" },
      { stopId: "D2", items: ["Workstations×12", "Monitors×24"],         kg: 850,  pri: "STD" },
      { stopId: "D3", items: ["Cable bundles×50", "UPS units×6"],        kg: 640,  pri: "STD" },
    ],
  },
]

// ── Geo utilities ─────────────────────────────────────────────────────────────
function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function bearingDeg(a: [number, number], b: [number, number]) {
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const x = Math.sin(dLng) * Math.cos(lat2)
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
}

function buildDists(coords: [number, number][]) {
  let total = 0
  const dists: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1], coords[i])
    dists.push(total)
  }
  return { dists, total }
}

function interpolateOnRoute(
  coords: [number, number][],
  dists: number[],
  total: number,
  progress: number,
): { lat: number; lng: number; bearing: number } {
  if (coords.length === 0) return { lat: 0, lng: 0, bearing: 0 }
  if (progress <= 0) return { lat: coords[0][0], lng: coords[0][1], bearing: 0 }
  if (progress >= 1) {
    const last = coords[coords.length - 1]
    const prev = coords[coords.length - 2] ?? last
    return { lat: last[0], lng: last[1], bearing: bearingDeg(prev, last) }
  }
  const target = progress * total
  for (let i = 1; i < coords.length; i++) {
    if (dists[i] >= target) {
      const t = (target - dists[i - 1]) / (dists[i] - dists[i - 1])
      return {
        lat: coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        lng: coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
        bearing: bearingDeg(coords[i - 1], coords[i]),
      }
    }
  }
  const last = coords[coords.length - 1]
  return { lat: last[0], lng: last[1], bearing: 0 }
}

function sliceRoute(
  coords: [number, number][],
  dists: number[],
  total: number,
  progress: number,
): [number, number][] {
  if (coords.length < 2 || progress <= 0) return [coords[0] ?? [0, 0]]
  if (progress >= 1) return coords
  const target = progress * total
  for (let i = 1; i < coords.length; i++) {
    if (dists[i] >= target) {
      const t = (target - dists[i - 1]) / (dists[i] - dists[i - 1])
      const interp: [number, number] = [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
      ]
      return [...coords.slice(0, i), interp]
    }
  }
  return coords
}

function getTrailCoords(
  coords: [number, number][],
  dists: number[],
  total: number,
  progress: number,
  trailKm = 2.8,
): [number, number][] {
  if (coords.length < 2 || progress <= 0) return []
  const curDist = progress * total
  const trailStart = Math.max(0, curDist - trailKm)
  const result: [number, number][] = []
  for (let i = 0; i < coords.length; i++) {
    if (dists[i] < trailStart) {
      if (i < coords.length - 1 && dists[i + 1] > trailStart) {
        const t = (trailStart - dists[i]) / (dists[i + 1] - dists[i])
        result.push([
          coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
          coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
        ])
      }
      continue
    }
    if (dists[i] > curDist) {
      if (i > 0) {
        const t = (curDist - dists[i - 1]) / (dists[i] - dists[i - 1])
        result.push([
          coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
          coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
        ])
      }
      break
    }
    result.push(coords[i])
  }
  return result
}

// ── Route data builders ───────────────────────────────────────────────────────
function buildRouteData(config: RouteConfig): RouteData {
  const coords: [number, number][] = [
    ...config.legCoords[0],
    ...config.legCoords.slice(1).flatMap(leg => leg.slice(1)),
  ]
  const { dists, total } = buildDists(coords)
  const legKm = config.legCoords.map(leg => buildDists(leg).total)
  return { coords, dists, total, legKm, totalKm: legKm.reduce((a, b) => a + b, 0) }
}

const PRESET_ROUTE_DATAS: Record<string, RouteData> = Object.fromEntries(
  ROUTE_CONFIGS.map(cfg => [cfg.id, buildRouteData(cfg)]),
)

// ── OSRM fetch ────────────────────────────────────────────────────────────────
async function fetchOSRM(waypoints: [number, number][]): Promise<RouteData | null> {
  const coordStr = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";")
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
  const ctrl = new AbortController()
  const tid = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(tid)
    if (!res.ok) return null
    const json = await res.json()
    if (json.code !== "Ok") return null
    const route = json.routes[0]
    const geoCoords: [number, number][] = (route.geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => [lat, lng],
    )
    const legKm = (route.legs as Array<{ distance: number }>).map(l => l.distance / 1000)
    const { dists, total } = buildDists(geoCoords)
    return { coords: geoCoords, dists, total, legKm, totalKm: legKm.reduce((a, b) => a + b, 0) }
  } catch {
    clearTimeout(tid)
    return null
  }
}

function buildStraightRoute(waypoints: [number, number][]): RouteData {
  const legKm: number[] = []
  for (let i = 0; i < waypoints.length - 1; i++) legKm.push(haversineKm(waypoints[i], waypoints[i + 1]))
  const { dists, total } = buildDists(waypoints)
  return { coords: waypoints, dists, total, legKm, totalKm: legKm.reduce((a, b) => a + b, 0) }
}

function buildCustomStops(waypoints: [number, number][]): Stop[] {
  return waypoints.map((wp, i) => ({
    id: i === 0 ? "O" : `W${i}`,
    label: i === 0 ? "Origin" : `WP${i}`,
    sub: `Custom waypoint ${i + 1}`,
    lat: wp[0],
    lng: wp[1],
  }))
}

// ── Misc utils ────────────────────────────────────────────────────────────────
const fmt = (n: number, d = 1) => n.toFixed(d)
let _lid = 0
const mkLog = (msg: string, type: LogEntry["type"] = "info"): LogEntry => ({ id: ++_lid, ts: Date.now(), msg, type })
function fmtWallTime(minutesFromNow: number) {
  const d = new Date(Date.now() + minutesFromNow * 60_000)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
const SPEED_KMH = 46

function loadLS(): Record<string, unknown> {
  try {
    return (JSON.parse(localStorage.getItem("fleet-ops-v2") ?? "null") as Record<string, unknown>) ?? {}
  } catch {
    return {}
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const ls = useRef(loadLS())

  const [dark, setDark]           = useState(true)
  const [activeRouteId, setActiveRouteId] = useState<string>(() => {
    const saved = ls.current.activeRouteId as string
    if (saved && saved !== "CUSTOM" && ROUTE_CONFIGS.find(r => r.id === saved)) return saved
    return "RT-4471"
  })
  const [running, setRunning]     = useState(true)
  const [progress, setProgress]   = useState<number>(() => (ls.current.progress as number) ?? 0)
  const [rate, setRate]           = useState<number>(() => (ls.current.rate as number) ?? 1)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => (ls.current.sidebarTab as SidebarTab) ?? "LIVE")
  const [customWaypoints, setCustomWaypoints] = useState<[number, number][]>(
    () => (ls.current.customWaypoints as [number, number][]) ?? [],
  )
  const [builderMode, setBuilderMode]     = useState(false)
  const [customRouteData, setCustomRouteData] = useState<RouteData | null>(null)
  const [customStops, setCustomStops]     = useState<Stop[]>([])
  const [simCount, setSimCount]           = useState(0)
  const [loadingCustom, setLoadingCustom] = useState(false)
  const [osrmData, setOsrmData]           = useState<Record<string, RouteData>>({})
  const [loadingOsrm, setLoadingOsrm]     = useState(false)
  const osrmFetched = useRef<Set<string>>(new Set())
  const [log, setLog]   = useState<LogEntry[]>(() => [mkLog("Fleet Ops initialized · Ready", "ok")])
  const [utcTime, setUtcTime]             = useState("")
  const [speedJitter, setSpeedJitter]     = useState(0)
  const [rpmVal, setRpmVal]               = useState(0)
  const [engineTemp, setEngineTemp]       = useState(89)
  const [mapFull, setMapFull]             = useState(false)

  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([])

  // Fleet state
  const [fleetMode, setFleetMode]             = useState(false)
  const [selectedFleetId, setSelectedFleetId] = useState("RT-4471")
  const fleetProgressRef = useRef<Record<string, number>>({ "RT-4471": 0, "RT-2290": 0, "RT-6650": 0 })
  const [fleetTick, setFleetTick]             = useState(0)

  // Speed history
  const speedHistory = useRef<number[]>([])

  const addLog = (msg: string, type: LogEntry["type"] = "info") =>
    setLog(prev => [mkLog(msg, type), ...prev].slice(0, 60))

  const pushToast = useCallback((msg: string, type: Toast["type"]) => {
    const id = ++_tid
    setToasts(prev => [...prev.slice(-2), { id, msg, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4200)
  }, [])

  // Derived active route
  const activeConfig = ROUTE_CONFIGS.find(r => r.id === activeRouteId) ?? ROUTE_CONFIGS[0]
  const routeData    = activeRouteId === "CUSTOM"
    ? customRouteData
    : (osrmData[activeRouteId] ?? PRESET_ROUTE_DATAS[activeRouteId] ?? null)
  const activeStops  = activeRouteId === "CUSTOM" ? customStops : activeConfig.stops
  const activeCargo  = activeRouteId === "CUSTOM" ? ([] as CargoItem[]) : activeConfig.cargo
  const routeColor   = activeRouteId === "CUSTOM" ? "#aaaaaa" : activeConfig.color
  const mapKey       = activeRouteId === "CUSTOM" ? `custom-${simCount}` : activeRouteId

  // Fetch OSRM road route for a preset route (once per route id)
  useEffect(() => {
    if (activeRouteId === "CUSTOM") return
    if (osrmFetched.current.has(activeRouteId)) return
    osrmFetched.current.add(activeRouteId)
    const cfg = ROUTE_CONFIGS.find(r => r.id === activeRouteId)
    if (!cfg) return
    const waypoints: [number, number][] = cfg.stops.map(s => [s.lat, s.lng])
    setLoadingOsrm(true)
    fetchOSRM(waypoints).then(rd => {
      if (rd) setOsrmData(prev => ({ ...prev, [activeRouteId]: rd }))
      setLoadingOsrm(false)
    })
  }, [activeRouteId])

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("fleet-ops-v2", JSON.stringify({ activeRouteId, customWaypoints, rate, sidebarTab, progress }))
    } catch { /* ignore */ }
  }, [activeRouteId, customWaypoints, rate, sidebarTab, progress])

  // UTC clock
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setUtcTime(
        `${String(n.getUTCHours()).padStart(2, "0")}:${String(n.getUTCMinutes()).padStart(2, "0")}:${String(n.getUTCSeconds()).padStart(2, "0")} UTC`,
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Jitter + speed history
  useEffect(() => {
    const id = setInterval(() => {
      if (running) {
        const newJitter = Math.round((Math.random() - 0.5) * 8)
        setSpeedJitter(newJitter)
        setRpmVal(Math.round(1380 + SPEED_KMH * 22 + (Math.random() - 0.5) * 120))
        setEngineTemp(Math.round(88 + Math.random() * 5))
        speedHistory.current = [...speedHistory.current, Math.max(0, SPEED_KMH + newJitter)].slice(-44)
      } else {
        setSpeedJitter(0)
        setRpmVal(0)
        speedHistory.current = [...speedHistory.current, 0].slice(-44)
      }
    }, 1100)
    return () => clearInterval(id)
  }, [running])

  // Animation loop
  useEffect(() => {
    if (!running || progress >= 1 || !routeData) return
    let raf = 0, last = performance.now()
    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const dKm = ((SPEED_KMH * rate * dt) / 3600) * 60
      setProgress(p => Math.min(1, p + dKm / routeData.totalKm))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [running, rate, progress, routeData])

  // Derived telemetry
  const legKm   = routeData?.legKm   ?? [1]
  const totalKm = routeData?.totalKm ?? 1
  const kmCovered = progress * totalKm

  let acc = 0, currentLeg = 0
  for (let i = 0; i < legKm.length; i++) {
    if (kmCovered <= acc + legKm[i] || i === legKm.length - 1) { currentLeg = i; break }
    acc += legKm[i]
  }
  const legStartKm = legKm.slice(0, currentLeg).reduce((a, b) => a + b, 0)
  const intoLeg    = kmCovered - legStartKm
  const arrived    = progress >= 1
  const numStops   = Math.max(1, activeStops.length - 1)
  const completed  = arrived
    ? numStops
    : activeStops.slice(1).filter((_, i) =>
        kmCovered >= legKm.slice(0, i + 1).reduce((a, b) => a + b, 0) - 0.001,
      ).length

  const fallbackStop: Stop = { id: "D1", label: "D1", sub: "—", lat: 0, lng: 0 }
  const toStop       = activeStops[currentLeg + 1] ?? activeStops[activeStops.length - 1] ?? fallbackStop
  const kmRemaining  = totalKm - kmCovered
  const distToNext   = legKm[currentLeg] - intoLeg
  const etaNextMin   = arrived ? 0 : (distToNext / SPEED_KMH) * 60
  const etaTripMin   = arrived ? 0 : (kmRemaining / SPEED_KMH) * 60
  const liveSpeed    = arrived || !running ? 0 : SPEED_KMH
  const displaySpeed = liveSpeed > 0 ? Math.max(0, liveSpeed + speedJitter) : 0
  const fuel         = Math.max(60, 78 - (kmCovered / totalKm) * 14)
  const clockSec     = Math.floor((kmCovered / SPEED_KMH) * 3600)
  const elapsed      = `${String(Math.floor(clockSec / 3600)).padStart(2, "0")}:${String(Math.floor((clockSec % 3600) / 60)).padStart(2, "0")}:${String(clockSec % 60).padStart(2, "0")}`

  // Approaching computation
  const approaching = !arrived && distToNext < 0.6 && intoLeg > 0.1

  // ETA countdown
  const etaCountdown = useMemo(() => {
    if (arrived || !routeData || distToNext <= 0) return "–"
    const secs = Math.round((distToNext / (SPEED_KMH * rate)) * 3600)
    const m = Math.floor(secs / 60), s = secs % 60
    return `T−${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }, [arrived, routeData, distToNext, rate])

  const truckPos = useMemo(
    () =>
      routeData
        ? interpolateOnRoute(routeData.coords, routeData.dists, routeData.total, arrived ? 1 : progress)
        : { lat: activeStops[0]?.lat ?? 0, lng: activeStops[0]?.lng ?? 0, bearing: 0 },
    [routeData, progress, arrived, activeStops],
  )

  // Delivery log refs
  const prevCompleted  = useRef(0)
  const arrivedLogged  = useRef(false)
  const approachingRef = useRef<string | null>(null)

  useEffect(() => {
    if (completed > prevCompleted.current && completed > 0 && completed < activeStops.length) {
      const s = activeStops[completed]
      if (s) {
        addLog(`Delivery confirmed · ${s.label} · ${s.sub}`, "ok")
        pushToast(`Delivery confirmed · ${s.label} · ${s.sub}`, "ok")
      }
      prevCompleted.current = completed
      approachingRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed])

  useEffect(() => {
    if (arrived && !arrivedLogged.current) {
      arrivedLogged.current = true
      addLog(`All deliveries confirmed · Route ${activeRouteId} complete`, "ok")
      pushToast(`All deliveries confirmed · Route ${activeRouteId} complete`, "ok")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived])

  useEffect(() => {
    if (!arrived && intoLeg > 0.1 && distToNext < 0.6) {
      const key = toStop.id
      if (approachingRef.current !== key) {
        approachingRef.current = key
        addLog(`Approaching ${toStop.label} · ${toStop.sub}`, "warn")
        pushToast(`Approaching ${toStop.label} · ${toStop.sub}`, "warn")
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distToNext, toStop.id, arrived, intoLeg])

  // Traffic incident alerts
  useEffect(() => {
    if (!running || arrived) return
    const INCIDENTS = [
      "Traffic congestion detected · I-880 SB · +4 min delay",
      "Road construction zone · Mission Blvd · Speed 25 km/h",
      "Signal outage · Franklin St intersection",
      "Merging traffic · CA-92 westbound · Caution",
      "Weather advisory: light drizzle · Visibility reduced",
      "Accident cleared · HOV lane closed · Use right lanes",
      "Weigh station checkpoint · Mandatory stop ahead",
    ]
    const id = setInterval(() => {
      if (Math.random() < 0.55) {
        const msg = INCIDENTS[Math.floor(Math.random() * INCIDENTS.length)]
        addLog(msg, "warn")
        pushToast(msg, "warn")
      }
    }, 55000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, arrived])

  // Reset route
  const reset = useCallback(() => {
    setProgress(0)
    setRunning(true)
    prevCompleted.current = 0
    arrivedLogged.current = false
    approachingRef.current = null
    addLog(`Route ${activeRouteId} restarted`, "info")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRouteId])

  // Switch to preset route
  const selectRoute = useCallback((routeId: string) => {
    const cfg = ROUTE_CONFIGS.find(r => r.id === routeId)
    if (!cfg) return
    prevCompleted.current = 0
    arrivedLogged.current = false
    approachingRef.current = null
    setActiveRouteId(routeId)
    setProgress(0)
    setRunning(true)
    addLog(`Route ${routeId} · ${cfg.name} activated`, "ok")
    addLog(`${cfg.vehicle} · ${cfg.driver} · Departing ${cfg.stops[0].sub}`, "ok")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Simulate custom route
  const simulateCustom = useCallback(async () => {
    if (customWaypoints.length < 2) return
    setLoadingCustom(true)
    addLog("Requesting street routing via OSRM…", "info")
    let rd = await fetchOSRM(customWaypoints)
    if (rd) {
      addLog("Street routing via OSRM", "ok")
    } else {
      rd = buildStraightRoute(customWaypoints)
      addLog("Using direct path (no street routing)", "warn")
    }
    const stops = buildCustomStops(customWaypoints)
    setCustomStops(stops)
    setCustomRouteData(rd)
    prevCompleted.current = 0
    arrivedLogged.current = false
    approachingRef.current = null
    setActiveRouteId("CUSTOM")
    setSimCount(c => c + 1)
    setProgress(0)
    setRunning(true)
    setBuilderMode(false)
    setLoadingCustom(false)
    setSidebarTab("LIVE")
    addLog(`Custom route loaded · ${rd.totalKm.toFixed(1)} km · ${customWaypoints.length} waypoints`, "ok")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customWaypoints])

  const onMapClick = useCallback((lat: number, lng: number) => {
    setCustomWaypoints(prev => [...prev, [lat, lng]])
  }, [])

  // Fleet callbacks
  const enterFleetMode = useCallback(() => {
    fleetProgressRef.current = { "RT-4471": 0, "RT-2290": 0, "RT-6650": 0 }
    setFleetTick(0)
    setRunning(false)
    setFleetMode(true)
    addLog("Fleet dispatch initiated · 3 vehicles active", "info")
    pushToast("Fleet dispatch initiated · 3 vehicles active", "ok")
    ROUTE_CONFIGS.forEach(cfg => {
      if (!osrmFetched.current.has(cfg.id)) {
        osrmFetched.current.add(cfg.id)
        fetchOSRM(cfg.stops.map(s => [s.lat, s.lng] as [number, number])).then(rd => {
          if (rd) setOsrmData(prev => ({ ...prev, [cfg.id]: rd }))
        })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToast])

  const exitFleetMode = useCallback(() => {
    setFleetMode(false)
    setRunning(true)
    addLog("Fleet mode ended · Resuming single-vehicle mode", "info")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fleet animation loop
  useEffect(() => {
    if (!fleetMode) return
    let frameCount = 0
    let last = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      ROUTE_CONFIGS.forEach(cfg => {
        const rd = osrmData[cfg.id] ?? PRESET_ROUTE_DATAS[cfg.id]
        if (!rd) return
        const dKm = ((SPEED_KMH * rate * dt) / 3600) * 60
        fleetProgressRef.current[cfg.id] = Math.min(1, (fleetProgressRef.current[cfg.id] ?? 0) + dKm / rd.totalKm)
      })
      frameCount++
      if (frameCount % 3 === 0) setFleetTick(t => t + 1)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetMode, rate, osrmData])

  // Fleet trucks computed
  const fleetTrucks: FleetTruck[] = useMemo(() => {
    if (!fleetMode) return []
    return ROUTE_CONFIGS.map(cfg => {
      const rd = osrmData[cfg.id] ?? PRESET_ROUTE_DATAS[cfg.id]
      const p = fleetProgressRef.current[cfg.id] ?? 0
      const pos = rd ? interpolateOnRoute(rd.coords, rd.dists, rd.total, p) : null
      return { id: cfg.id, color: cfg.color, pos, progress: p, name: cfg.name, vehicle: cfg.vehicle, driver: cfg.driver, rd }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetMode, fleetTick, osrmData])

  const fleetRoutes = fleetMode ? ROUTE_CONFIGS.map(cfg => ({
    id: cfg.id, color: cfg.color,
    coords: (osrmData[cfg.id] ?? PRESET_ROUTE_DATAS[cfg.id])?.coords ?? null,
  })) : []

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.code === "Space") { e.preventDefault(); if (!arrived) setRunning(r => !r) }
      else if (e.key.toLowerCase() === "r") reset()
      else if (e.key.toLowerCase() === "f") setMapFull(m => !m)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [arrived, reset])

  const totalCargoKg = activeCargo.reduce((s, c) => s + c.kg, 0)
  const remainingKg  = totalCargoKg - activeCargo.slice(0, completed).reduce((s, c) => s + c.kg, 0)

  const outerStyle: React.CSSProperties = mapFull
    ? { position: "fixed", inset: 0, zIndex: 100, background: "var(--bg)", display: "flex", flexDirection: "column", "--route": routeColor } as React.CSSProperties
    : { background: "var(--bg)", minHeight: "100vh", display: "flex", flexDirection: "column", "--route": routeColor } as React.CSSProperties

  return (
    <div
      className={dark ? "" : "theme-light"}
      style={outerStyle}
    >
      {/* HUD top bar */}
      {!mapFull && (
        <header
          className="shrink-0 border-b flex items-center justify-between px-5 gap-3"
          style={{ borderColor: "var(--border-strong)", background: "var(--panel)", height: 50 }}
        >
          <div className="flex items-center gap-5">
            <span
              className="font-display font-800 uppercase text-sm"
              style={{ color: "var(--route)", letterSpacing: "0.22em", fontWeight: 800 }}
            >
              ◈ FLEET&nbsp;OPS
            </span>
            <div
              className="hidden sm:flex items-center gap-4 divide-x"
              style={{ "--tw-divide-color": "var(--border-strong)" } as React.CSSProperties}
            >
              <HudTag label="ROUTE"  value={activeRouteId === "CUSTOM" ? "CUSTOM" : activeRouteId} />
              <HudTag label="NAME"   value={activeRouteId === "CUSTOM" ? "Custom Route" : activeConfig.name} className="pl-4" />
              {fleetMode ? (
                <HudTag label="FLEET MODE" value="3 ACTIVE · TK-09, TK-14, TK-22" color="var(--route)" className="pl-4" />
              ) : (
                <>
                  <HudTag label="VEH"    value={activeRouteId === "CUSTOM" ? "—" : activeConfig.vehicle} className="pl-4" />
                  <HudTag label="DRIVER" value={activeRouteId === "CUSTOM" ? "—" : activeConfig.driver} className="pl-4" />
                  <HudTag label="LOAD"   value={activeRouteId === "CUSTOM" ? "—" : `${remainingKg.toLocaleString()} kg`} className="pl-4" />
                </>
              )}
              {(() => {
                const wx = ROUTE_WEATHER[activeRouteId] ?? ROUTE_WEATHER["CUSTOM"]
                return <HudTag label={wx.icon} value={wx.temp} className="pl-4 hidden md:flex" />
              })()}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <StatusBadge arrived={arrived} running={running} loading={loadingCustom} />
            <span
              className="hidden md:block font-mono text-[10px] tabular-nums"
              style={{ color: "var(--muted)" }}
            >
              {utcTime}
            </span>
            <button
              onClick={() => setDark(d => !d)}
              className="h-8 w-8 grid place-items-center rounded border transition-opacity hover:opacity-60"
              style={{ borderColor: "var(--border-strong)", background: "var(--panel-2)", color: "var(--muted)" }}
              aria-label="Toggle theme"
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>
      )}

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Map + timeline column */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ minHeight: 340 }}>
          <div className="flex-1 relative">
            <LeafletMap
              key={mapKey}
              routeData={routeData}
              stops={activeStops}
              progress={arrived ? 1 : progress}
              completed={completed}
              currentLeg={currentLeg}
              arrived={arrived}
              truckPos={truckPos}
              loading={loadingCustom || loadingOsrm}
              color={routeColor}
              builderMode={builderMode}
              customWaypoints={customWaypoints}
              onMapClick={onMapClick}
              numDeliveries={numStops}
              approaching={approaching}
              fleetTrucks={fleetTrucks}
              fleetRoutes={fleetRoutes}
              mapFull={mapFull}
              onToggleFullscreen={() => setMapFull(m => !m)}
            />
            {/* Toast container */}
            <div style={{ position: "absolute", top: 12, right: 60, zIndex: 9999, display: "flex", flexDirection: "column", gap: 6, width: 280, pointerEvents: "none" }}>
              {toasts.map(t => {
                const lc = t.type === "ok" ? "#39ff8a" : t.type === "warn" ? "#ffad1f" : "#00cfff"
                const prefix = t.type === "ok" ? "●" : t.type === "warn" ? "▲" : "◆"
                return (
                  <div key={t.id} style={{
                    padding: "10px 14px",
                    borderRadius: 6,
                    background: "var(--panel)",
                    border: "1px solid var(--border-strong)",
                    borderLeft: `3px solid ${lc}`,
                    fontFamily: "JetBrains Mono,monospace",
                    fontSize: 10,
                    color: "var(--fg)",
                    animation: "slideIn 0.25s ease-out",
                    lineHeight: "1.5",
                  }}>
                    <span style={{ color: lc, marginRight: 6 }}>{prefix}</span>
                    {t.msg}
                  </div>
                )
              })}
            </div>
          </div>
          {!mapFull && (
            <TimelineStrip stops={activeStops} currentLeg={currentLeg} arrived={arrived} completed={completed} />
          )}
        </div>

        {/* Right sidebar — hidden in fullscreen */}
        {!mapFull && (
          <div
            className="border-t lg:border-t-0 lg:border-l shrink-0 flex flex-col"
            style={{ borderColor: "var(--border-strong)", background: "var(--panel)", width: 344 }}
          >
            {/* Tab bar */}
            <div
              className="shrink-0 flex border-b"
              style={{ borderColor: "var(--border-strong)", background: "var(--panel)" }}
            >
              {(["LIVE", "ROUTES", "LOGS"] as SidebarTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setSidebarTab(tab)}
                  className="flex-1 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors"
                  style={{
                    color: sidebarTab === tab ? "var(--route)" : "var(--muted)",
                    borderBottom: sidebarTab === tab ? `2px solid var(--route)` : "2px solid transparent",
                    background: "transparent",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {sidebarTab === "LIVE" && (
                <>
                  <TelemetrySection
                    toStop={toStop}
                    arrived={arrived}
                    kmCovered={kmCovered}
                    kmRemaining={kmRemaining}
                    completed={completed}
                    numStops={numStops}
                    etaNextMin={etaNextMin}
                    etaTripMin={etaTripMin}
                    progress={progress}
                    elapsed={elapsed}
                    displaySpeed={displaySpeed}
                    truckPos={truckPos}
                    vehicle={activeRouteId === "CUSTOM" ? "CUSTOM" : activeConfig.vehicle}
                    currentLeg={currentLeg}
                    color={routeColor}
                    speedHistorySnap={speedHistory.current}
                    etaCountdown={etaCountdown}
                    distToNext={distToNext}
                  />
                  <Divider />
                  <VehicleSection
                    running={running}
                    arrived={arrived}
                    displaySpeed={displaySpeed}
                    rpm={rpmVal}
                    temp={engineTemp}
                    fuel={fuel}
                  />
                  <Divider />
                  <CargoSection
                    cargo={activeCargo}
                    stops={activeStops}
                    completed={completed}
                    arrived={arrived}
                    currentLeg={currentLeg}
                  />
                </>
              )}
              {sidebarTab === "ROUTES" && (
                <RoutesTab
                  routes={ROUTE_CONFIGS}
                  routeDatas={PRESET_ROUTE_DATAS}
                  activeRouteId={activeRouteId}
                  customWaypoints={customWaypoints}
                  builderMode={builderMode}
                  loadingCustom={loadingCustom}
                  onSelectRoute={selectRoute}
                  onSetBuilderMode={setBuilderMode}
                  onUndo={() => setCustomWaypoints(prev => prev.slice(0, -1))}
                  onClear={() => setCustomWaypoints([])}
                  onSimulate={simulateCustom}
                  fleetMode={fleetMode}
                  onEnterFleet={enterFleetMode}
                  onExitFleet={exitFleetMode}
                  fleetTrucks={fleetTrucks}
                  selectedFleetId={selectedFleetId}
                  onSelectFleetId={setSelectedFleetId}
                />
              )}
              {sidebarTab === "LOGS" && (
                <div className="px-4 py-4">
                  <TransmissionLog entries={log} fullHeight />
                </div>
              )}
            </div>

            <Divider />

            {/* Controls always visible */}
            <ControlsPanel
              running={running}
              arrived={arrived}
              rate={rate}
              onPlay={() => setRunning(r => !r)}
              onReset={reset}
              onRate={setRate}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Fleet leg label helper ────────────────────────────────────────────────────
function getFleetLegLabel(rd: RouteData | undefined, progress: number, cfg: RouteConfig): string {
  if (!rd) return "—"
  const kmCovered = progress * rd.totalKm
  let acc = 0, leg = 0
  for (let i = 0; i < rd.legKm.length; i++) {
    if (kmCovered <= acc + rd.legKm[i] || i === rd.legKm.length - 1) { leg = i; break }
    acc += rd.legKm[i]
  }
  const from = cfg.stops[leg]
  const to = cfg.stops[leg + 1] ?? cfg.stops[cfg.stops.length - 1]
  return `${from?.id ?? "—"} → ${to?.id ?? "—"}`
}

// ── Routes tab ────────────────────────────────────────────────────────────────
function RoutesTab({
  routes, routeDatas, activeRouteId, customWaypoints, builderMode, loadingCustom,
  onSelectRoute, onSetBuilderMode, onUndo, onClear, onSimulate,
  fleetMode, onEnterFleet, onExitFleet, fleetTrucks, selectedFleetId, onSelectFleetId,
}: {
  routes: RouteConfig[]
  routeDatas: Record<string, RouteData>
  activeRouteId: string
  customWaypoints: [number, number][]
  builderMode: boolean
  loadingCustom: boolean
  onSelectRoute: (id: string) => void
  onSetBuilderMode: (b: boolean) => void
  onUndo: () => void
  onClear: () => void
  onSimulate: () => void
  fleetMode: boolean
  onEnterFleet: () => void
  onExitFleet: () => void
  fleetTrucks: FleetTruck[]
  selectedFleetId: string
  onSelectFleetId: (id: string) => void
}) {
  return (
    <div className="px-4 py-4">
      {/* SINGLE / FLEET toggle */}
      <div className="flex gap-1.5 mb-4">
        <button
          onClick={onExitFleet}
          className="flex-1 py-1.5 rounded border font-mono text-[9px] uppercase tracking-widest transition-colors"
          style={{
            borderColor: !fleetMode ? "var(--route)" : "var(--border-strong)",
            color: !fleetMode ? "var(--route)" : "var(--muted)",
            background: !fleetMode ? "color-mix(in srgb, var(--route) 10%, transparent)" : "transparent",
          }}
        >SINGLE</button>
        <button
          onClick={onEnterFleet}
          className="flex-1 py-1.5 rounded border font-mono text-[9px] uppercase tracking-widest transition-colors"
          style={{
            borderColor: fleetMode ? "var(--route)" : "var(--border-strong)",
            color: fleetMode ? "var(--route)" : "var(--muted)",
            background: fleetMode ? "color-mix(in srgb, var(--route) 10%, transparent)" : "transparent",
          }}
        >FLEET</button>
      </div>

      {/* Fleet status */}
      {fleetMode && (
        <div>
          <SectionLabel label="FLEET STATUS" />
          <div className="mt-2 space-y-2">
            {fleetTrucks.map(truck => {
              const cfg = ROUTE_CONFIGS.find(r => r.id === truck.id)!
              const isSelected = selectedFleetId === truck.id
              const legLabel = getFleetLegLabel(truck.rd, truck.progress, cfg)
              const pct = Math.round(truck.progress * 100)
              return (
                <div
                  key={truck.id}
                  onClick={() => onSelectFleetId(truck.id)}
                  className="rounded border px-3 py-2.5 cursor-pointer"
                  style={{
                    borderColor: isSelected ? truck.color : "var(--border-strong)",
                    borderLeft: `3px solid ${truck.color}`,
                    background: isSelected
                      ? `color-mix(in srgb, ${truck.color} 8%, var(--panel-2))`
                      : "var(--panel-2)",
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] font-600" style={{ color: truck.color }}>{truck.vehicle}</span>
                    {isSelected && (
                      <span className="font-mono text-[8px] px-1.5 py-0.5 rounded"
                        style={{ background: `color-mix(in srgb, ${truck.color} 20%, transparent)`, color: truck.color }}>
                        ● ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[9px] mb-1.5" style={{ color: "var(--muted)" }}>
                    {truck.driver} · {legLabel}
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden mb-1" style={{ background: "var(--border-strong)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: truck.color, transition: "width 0.3s linear" }} />
                  </div>
                  <div className="flex justify-between font-mono text-[9px]" style={{ color: "var(--muted)" }}>
                    <span>{pct}% complete</span>
                    <span style={{ color: "var(--fg)" }}>{SPEED_KMH} km/h</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="my-4 border-t" style={{ borderColor: "var(--border-strong)" }} />
        </div>
      )}

      {/* Preset routes — only in single mode */}
      {!fleetMode && (
        <>
          <SectionLabel label="PRESET ROUTES" />
          <div className="mt-2 space-y-2">
            {routes.map(r => {
              const rd = routeDatas[r.id]
              const isActive = activeRouteId === r.id
              return (
                <div
                  key={r.id}
                  className="rounded border px-3 py-2.5"
                  style={{
                    borderColor: isActive ? r.color : "var(--border-strong)",
                    background: isActive
                      ? `color-mix(in srgb, ${r.color} 8%, var(--panel-2))`
                      : "var(--panel-2)",
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: r.color }} />
                      <span className="font-mono text-[10px] font-600 shrink-0" style={{ color: r.color }}>
                        {r.id}
                      </span>
                      <span className="font-mono text-[10px] truncate" style={{ color: "var(--fg)" }}>
                        {r.name}
                      </span>
                    </div>
                    {isActive && (
                      <span
                        className="font-mono text-[8px] px-1.5 py-0.5 rounded shrink-0 ml-1"
                        style={{
                          background: `color-mix(in srgb, ${r.color} 20%, transparent)`,
                          color: r.color,
                        }}
                      >
                        ● ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[9px] mb-2" style={{ color: "var(--muted)" }}>
                    {r.vehicle} · {r.driver} · {rd ? rd.totalKm.toFixed(1) : "—"} km
                  </div>
                  <button
                    onClick={() => onSelectRoute(r.id)}
                    className="font-mono text-[9px] rounded border px-2 py-1 transition-opacity hover:opacity-70"
                    style={{
                      borderColor: r.color,
                      color: r.color,
                      background: `color-mix(in srgb, ${r.color} 10%, transparent)`,
                    }}
                  >
                    {isActive ? "▶ Replay" : "▶ Simulate"}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="my-4 border-t" style={{ borderColor: "var(--border-strong)" }} />

          <SectionLabel label="CUSTOM ROUTE BUILDER" />
          <div className="mt-1.5 font-mono text-[9px]" style={{ color: "var(--muted)" }}>
            Place waypoints by clicking on the map.
          </div>
          <div
            className="mt-1.5 font-mono text-[10px] font-600"
            style={{ color: customWaypoints.length > 0 ? "var(--fg)" : "var(--muted)" }}
          >
            {customWaypoints.length} waypoint{customWaypoints.length !== 1 ? "s" : ""} placed
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button
              onClick={() => onSetBuilderMode(!builderMode)}
              className="font-mono text-[9px] rounded border px-2 py-1 transition-opacity hover:opacity-70"
              style={{
                borderColor: builderMode ? "var(--route)" : "var(--border-strong)",
                color: builderMode ? "var(--route)" : "var(--muted)",
                background: builderMode ? "color-mix(in srgb, var(--route) 12%, transparent)" : "transparent",
              }}
            >
              {builderMode ? "Exit Builder" : "Open Builder"}
            </button>
            <button
              onClick={onUndo}
              disabled={customWaypoints.length === 0}
              className="font-mono text-[9px] rounded border px-2 py-1 transition-opacity hover:opacity-70 disabled:opacity-35"
              style={{ borderColor: "var(--border-strong)", color: "var(--muted)" }}
            >
              Undo
            </button>
            <button
              onClick={onClear}
              disabled={customWaypoints.length === 0}
              className="font-mono text-[9px] rounded border px-2 py-1 transition-opacity hover:opacity-70 disabled:opacity-35"
              style={{ borderColor: "var(--border-strong)", color: "var(--muted)" }}
            >
              Clear
            </button>
            <button
              onClick={onSimulate}
              disabled={customWaypoints.length < 2 || loadingCustom}
              className="font-mono text-[9px] rounded border px-2 py-1 transition-opacity hover:opacity-70 disabled:opacity-35"
              style={{
                borderColor: "var(--next)",
                color: "var(--next)",
                background: "color-mix(in srgb, var(--next) 10%, transparent)",
              }}
            >
              {loadingCustom ? "Routing…" : "Simulate ▶"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Fleet truck icon ──────────────────────────────────────────────────────────
function makeFleetTruckIcon(color: string, bearing: number): L.DivIcon {
  const html = `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
    <div style="transform:rotate(${bearing}deg);transform-origin:center;width:28px;height:28px;display:flex;align-items:center;justify-content:center;">
      <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="14" r="12" fill="${color}" opacity="0.9"/>
        <polygon points="14,4 20,22 14,18 8,22" fill="rgba(255,255,255,0.9)"/>
      </svg>
    </div>
  </div>`
  return L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] })
}

// ── Leaflet map ───────────────────────────────────────────────────────────────
function LeafletMap({
  routeData, stops, progress, completed, currentLeg, arrived, truckPos, loading,
  color, builderMode, customWaypoints, onMapClick, numDeliveries,
  approaching, fleetTrucks, fleetRoutes, mapFull, onToggleFullscreen,
}: {
  routeData: RouteData | null
  stops: Stop[]
  progress: number
  completed: number
  currentLeg: number
  arrived: boolean
  truckPos: { lat: number; lng: number; bearing: number }
  loading: boolean
  color: string
  builderMode: boolean
  customWaypoints: [number, number][]
  onMapClick: (lat: number, lng: number) => void
  numDeliveries: number
  approaching?: boolean
  fleetTrucks?: FleetTruck[]
  fleetRoutes?: { id: string; color: string; coords: [number, number][] | null }[]
  mapFull?: boolean
  onToggleFullscreen?: () => void
}) {
  const containerRef    = useRef<HTMLDivElement>(null)
  const mapRef          = useRef<L.Map | null>(null)
  const truckMarkerRef  = useRef<L.Marker | null>(null)
  const donePolyRef     = useRef<L.Polyline | null>(null)
  const trailPolyRef    = useRef<L.Polyline | null>(null)
  const pendingPolyRef  = useRef<L.Polyline | null>(null)
  const stopRefs        = useRef<L.Marker[]>([])
  const builderMarkersRef = useRef<L.Marker[]>([])
  const routeInited     = useRef(false)
  const [mapReady, setMapReady]       = useState(false)
  const [followTruck, setFollowTruck] = useState(true)
  const fleetPolyRefs   = useRef<Map<string, L.Polyline>>(new Map())
  const fleetMarkerRefs = useRef<Map<string, L.Marker>>(new Map())
  const geofenceRefs    = useRef<(L.Circle | null)[]>([])

  // Init map once
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, { zoomControl: false, attributionControl: true })
    const tl = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        subdomains: "abc",
        attribution:
          '© <a href="https://openstreetmap.org/copyright" style="color:#3d5a72">OpenStreetMap</a> contributors',
      },
    ).addTo(map)
    tl.on("add", () => {
      const pane = map.getPane("tilePane")
      if (pane) pane.style.filter = "invert(100%) hue-rotate(180deg) brightness(0.75) saturate(0.4) contrast(1.05)"
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      routeInited.current = false
      setMapReady(false)
    }
  }, [])

  // Draw route + stops once routeData arrives
  useEffect(() => {
    const map = mapRef.current
    if (!map || !routeData || routeInited.current) return
    routeInited.current = true
    map.fitBounds(L.latLngBounds(routeData.coords), { padding: [48, 48] })
    setMapReady(true)

    // pending route — dim dashed
    pendingPolyRef.current = L.polyline(routeData.coords, {
      color: "#1a3555", weight: 3, dashArray: "5 9", opacity: 0.8,
    }).addTo(map)

    // full completed path — solid route color
    donePolyRef.current = L.polyline([], { color, weight: 4, opacity: 0.85 }).addTo(map)

    // hot trail near truck — wider glow on top
    trailPolyRef.current = L.polyline([], {
      color, weight: 7, opacity: 1, className: "trail-glow",
    }).addTo(map)

    stops.forEach((s, i) => {
      const m = L.marker([s.lat, s.lng], {
        icon: makeStopIcon(s.id, i === 0, false, i === 1),
        zIndexOffset: 500,
      }).addTo(map)
      stopRefs.current.push(m)
    })

    const originStop = stops[0]
    if (originStop) {
      truckMarkerRef.current = L.marker([originStop.lat, originStop.lng], {
        icon: makeTruckIcon(0),
        zIndexOffset: 1000,
      }).addTo(map)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeData])

  // Update truck + polylines on progress change
  useEffect(() => {
    if (!routeData || !truckMarkerRef.current || !donePolyRef.current || !trailPolyRef.current) return
    truckMarkerRef.current.setLatLng([truckPos.lat, truckPos.lng])
    truckMarkerRef.current.setIcon(makeTruckIcon(truckPos.bearing))
    const { coords, dists, total } = routeData
    donePolyRef.current.setLatLngs(sliceRoute(coords, dists, total, progress))
    trailPolyRef.current.setLatLngs(getTrailCoords(coords, dists, total, progress))
  }, [progress, truckPos, routeData])

  // Update stop marker states
  useEffect(() => {
    stopRefs.current.forEach((m, i) => {
      if (i === 0) return
      const s = stops[i]
      if (!s) return
      m.setIcon(makeStopIcon(s.id, false, i <= completed, !arrived && i === currentLeg + 1))
    })
  }, [completed, arrived, currentLeg, stops])

  // Follow truck
  useEffect(() => {
    const map = mapRef.current
    if (!map || !followTruck || !mapReady) return
    const inner = map.getBounds().pad(-0.18)
    if (!inner.contains([truckPos.lat, truckPos.lng])) {
      map.panTo([truckPos.lat, truckPos.lng], { animate: true, duration: 1.0 })
    }
  }, [truckPos, followTruck, mapReady])

  // Builder mode: click listener + cursor
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (builderMode) {
      map.getContainer().style.cursor = "crosshair"
      const handler = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng)
      map.on("click", handler)
      return () => {
        map.off("click", handler)
        if (mapRef.current) mapRef.current.getContainer().style.cursor = ""
      }
    } else {
      map.getContainer().style.cursor = ""
    }
  }, [builderMode, onMapClick])

  // Builder waypoint markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    builderMarkersRef.current.forEach(m => m.remove())
    builderMarkersRef.current = []
    customWaypoints.forEach((wp, i) => {
      const m = L.marker([wp[0], wp[1]], {
        icon: makeWaypointIcon(i + 1),
        zIndexOffset: 2000,
      }).addTo(map)
      builderMarkersRef.current.push(m)
    })
  }, [customWaypoints])

  // Geofence circles
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    geofenceRefs.current.forEach(c => c?.remove())
    geofenceRefs.current = []
    stops.forEach((s, i) => {
      if (i === 0) { geofenceRefs.current.push(null); return }
      const isDone = i <= completed
      const isNext = !arrived && i === currentLeg + 1
      const circleColor = isDone ? "#39ff8a" : isNext ? "#ffad1f" : "#334455"
      const fillOp = isDone ? 0.04 : isNext ? 0.08 : 0
      const op = isDone ? 0.25 : isNext ? 0.5 : 0.2
      const circle = L.circle([s.lat, s.lng], {
        radius: 380, color: circleColor, weight: 1, dashArray: "3 5", fillOpacity: fillOp, opacity: op,
      }).addTo(map)
      geofenceRefs.current.push(circle)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, currentLeg, completed, arrived])

  // Approaching geofence highlight
  useEffect(() => {
    const nextIdx = currentLeg + 1
    const circle = geofenceRefs.current[nextIdx]
    if (!circle) return
    if (approaching) {
      circle.setStyle({ fillOpacity: 0.15, opacity: 0.9, color: "#ffad1f" })
    } else {
      circle.setStyle({ fillOpacity: 0.08, opacity: 0.5, color: "#ffad1f" })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approaching, currentLeg])

  // Fleet routes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!fleetRoutes || fleetRoutes.length === 0) {
      fleetPolyRefs.current.forEach(p => p.remove())
      fleetPolyRefs.current.clear()
      return
    }
    const newIds = new Set(fleetRoutes.map(r => r.id))
    fleetPolyRefs.current.forEach((poly, id) => {
      if (!newIds.has(id)) { poly.remove(); fleetPolyRefs.current.delete(id) }
    })
    fleetRoutes.forEach(route => {
      if (!route.coords || route.coords.length === 0) return
      const existing = fleetPolyRefs.current.get(route.id)
      if (existing) {
        existing.setLatLngs(route.coords)
      } else {
        const poly = L.polyline(route.coords as L.LatLngExpression[], { color: route.color, weight: 2, opacity: 0.45 }).addTo(map)
        fleetPolyRefs.current.set(route.id, poly)
      }
    })
  }, [fleetRoutes])

  // Fleet truck markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!fleetTrucks || fleetTrucks.length === 0) {
      fleetMarkerRefs.current.forEach(m => m.remove())
      fleetMarkerRefs.current.clear()
      return
    }
    const newIds = new Set(fleetTrucks.map(t => t.id))
    fleetMarkerRefs.current.forEach((marker, id) => {
      if (!newIds.has(id)) { marker.remove(); fleetMarkerRefs.current.delete(id) }
    })
    fleetTrucks.forEach(truck => {
      if (!truck.pos) return
      const existing = fleetMarkerRefs.current.get(truck.id)
      if (existing) {
        existing.setLatLng([truck.pos.lat, truck.pos.lng])
        existing.setIcon(makeFleetTruckIcon(truck.color, truck.pos.bearing))
      } else {
        const marker = L.marker([truck.pos.lat, truck.pos.lng], {
          icon: makeFleetTruckIcon(truck.color, truck.pos.bearing),
          zIndexOffset: 650,
        }).addTo(map)
        fleetMarkerRefs.current.set(truck.id, marker)
      }
    })
  }, [fleetTrucks])

  const fitRoute = () => {
    if (mapRef.current && routeData) {
      mapRef.current.fitBounds(L.latLngBounds(routeData.coords), { padding: [48, 48], animate: true })
    } else if (mapRef.current && customWaypoints.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(customWaypoints), { padding: [48, 48], animate: true })
    }
  }

  return (
    <div className="relative w-full h-full" style={{ minHeight: 280 }}>
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: 280 }} />

      {/* Map legend */}
      <div
        className="absolute top-3 left-3 z-[999] rounded border px-3 py-2.5 flex flex-col gap-1.5"
        style={{
          borderColor: "var(--border-strong)",
          background: "color-mix(in srgb, var(--panel) 90%, transparent)",
          backdropFilter: "blur(4px)",
        }}
      >
        <LegendRow color="var(--origin)" label="Origin / arrived" type="circle" />
        <LegendRow color="var(--next)"   label="Next stop"        type="diamond" />
        <LegendRow color={color}          label="Active trail"     type="line" />
        <LegendRow color="#1d9e58"        label="Route done"       type="line" />
        {builderMode && <LegendRow color="#ffffff" label="Waypoint" type="circle" />}
      </div>

      {/* Map controls */}
      <div className="absolute top-3 right-3 z-[999] flex flex-col gap-1.5">
        <MapBtn
          title={followTruck ? "Following truck" : "Follow truck"}
          active={followTruck}
          onClick={() => setFollowTruck(f => !f)}
        >
          <TargetIcon active={followTruck} />
        </MapBtn>
        <MapBtn title="Fit route" onClick={fitRoute}><FitIcon /></MapBtn>
        <MapBtn title="Zoom in"  onClick={() => mapRef.current?.zoomIn()}>+</MapBtn>
        <MapBtn title="Zoom out" onClick={() => mapRef.current?.zoomOut()}>−</MapBtn>
        <MapBtn title={mapFull ? "Exit fullscreen" : "Fullscreen"} onClick={onToggleFullscreen ?? (() => {})}><FullscreenIcon /></MapBtn>
      </div>

      {/* Builder mode indicator */}
      {builderMode && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[999] rounded border px-3 py-1.5"
          style={{
            borderColor: "var(--route)",
            background: "color-mix(in srgb, var(--panel) 88%, transparent)",
            backdropFilter: "blur(4px)",
          }}
        >
          <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--route)" }}>
            Builder mode · click to place waypoints
          </span>
        </div>
      )}

      {/* Arrived banner */}
      {arrived && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center z-[999] pointer-events-none">
          <div
            className="flex items-center gap-2.5 rounded border px-5 py-3"
            style={{
              borderColor: "var(--done)",
              background: "color-mix(in srgb, var(--panel) 88%, transparent)",
              backdropFilter: "blur(6px)",
              animation: "arrived-glow 2s ease-in-out infinite",
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--done)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12l5 5L20 6" />
            </svg>
            <span
              className="font-display font-700 tracking-wider text-sm uppercase"
              style={{ color: "var(--fg)", fontWeight: 700 }}
            >
              Route complete · All {numDeliveries} deliveries made
            </span>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div
          className="absolute inset-0 z-[999] flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="flex items-center gap-3 rounded border px-4 py-3"
            style={{ borderColor: "var(--border-strong)", background: "var(--panel)" }}
          >
            <span
              className="h-4 w-4 rounded-full border-2 border-transparent animate-spin"
              style={{ borderTopColor: "var(--route)", borderRightColor: "var(--route)" }}
            />
            <span
              className="font-mono text-[11px] uppercase tracking-widest"
              style={{ color: "var(--muted)" }}
            >
              Fetching street route…
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Map button ────────────────────────────────────────────────────────────────
function MapBtn({
  children, onClick, title, active,
}: {
  children: React.ReactNode; onClick: () => void; title?: string; active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-8 w-8 grid place-items-center rounded border font-mono text-base transition-opacity hover:opacity-80"
      style={{
        borderColor: active ? "var(--route)" : "var(--border-strong)",
        background: active
          ? "color-mix(in srgb, var(--route) 15%, var(--panel))"
          : "color-mix(in srgb, var(--panel) 92%, transparent)",
        color: active ? "var(--route)" : "var(--muted)",
        backdropFilter: "blur(4px)",
      }}
    >
      {children}
    </button>
  )
}

// ── Leaflet icon factories ────────────────────────────────────────────────────
function makeStopIcon(id: string, isOrigin: boolean, isDone: boolean, isNext: boolean): L.DivIcon {
  const c = isDone ? "#39ff8a" : isNext ? "#ffad1f" : isOrigin ? "#39ff8a" : "#1a3050"
  const sz = 28
  const inner = isOrigin
    ? `<svg width="${sz}" height="${sz}" viewBox="-14 -14 28 28" xmlns="http://www.w3.org/2000/svg">
        <circle r="11" fill="rgba(57,255,138,0.12)" stroke="${c}" stroke-width="1.5"/>
        <circle r="4.5" fill="${c}"/>
      </svg>`
    : `<svg width="${sz}" height="${sz}" viewBox="-14 -14 28 28" xmlns="http://www.w3.org/2000/svg">
        ${isNext ? `<circle r="13" fill="none" stroke="${c}" stroke-width="1" opacity="0.4"/>` : ""}
        <path d="M0 -10 L10 0 L0 10 L-10 0 Z" fill="${isDone ? c : "rgba(5,12,21,0.92)"}" stroke="${c}" stroke-width="1.8"/>
        ${isDone
          ? `<path d="M-4 0 l3 3 l5.5 -6" fill="none" stroke="#020609" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
          : `<text x="0" y="4" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="8" font-weight="700" fill="${c}">${id}</text>`}
      </svg>`
  return L.divIcon({ html: inner, className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] })
}

function makeTruckIcon(bearing: number): L.DivIcon {
  const html = `
    <div style="width:48px;height:48px;position:relative;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(0,207,255,0.28) 0%,transparent 70%);"></div>
      <div style="transform:rotate(${bearing}deg);transform-origin:center;display:flex;align-items:center;justify-content:center;position:relative;">
        <svg width="42" height="30" viewBox="-22 -15 44 30" xmlns="http://www.w3.org/2000/svg" overflow="visible">
          <defs>
            <filter id="tf" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <path d="M8 -5 L44 -19 L44 19 L8 5 Z" fill="rgba(200,232,255,0.15)"/>
          <rect x="-20" y="-9" width="23" height="16" rx="2.5" fill="#e0f0ff" opacity="0.94" filter="url(#tf)"/>
          <line x1="-14" y1="-9" x2="-14" y2="7" stroke="rgba(5,12,21,0.45)" stroke-width="1.2"/>
          <line x1="-8" y1="-9" x2="-8" y2="7" stroke="rgba(5,12,21,0.45)" stroke-width="1.2"/>
          <rect x="3" y="-8" width="15" height="15" rx="3" fill="#e0f0ff" filter="url(#tf)"/>
          <rect x="6" y="-6" width="9" height="6" rx="1.2" fill="#00cfff" opacity="0.9"/>
          <rect x="-20" y="-7" width="3" height="5" rx="0.8" fill="#ffad1f" opacity="0.95"/>
          <circle cx="-11" cy="9" r="3.8" fill="#020609" stroke="#e0f0ff" stroke-width="1.8"/>
          <circle cx="9" cy="9" r="3.8" fill="#020609" stroke="#e0f0ff" stroke-width="1.8"/>
          <circle cx="-11" cy="9" r="1.5" fill="#1a2a3a"/>
          <circle cx="9" cy="9" r="1.5" fill="#1a2a3a"/>
        </svg>
      </div>
    </div>`
  return L.divIcon({ html, className: "", iconSize: [48, 48], iconAnchor: [24, 24] })
}

function makeWaypointIcon(n: number): L.DivIcon {
  const html = `<div style="width:26px;height:26px;border-radius:50%;background:#ffffff;border:2.5px solid #333333;display:flex;align-items:center;justify-content:center;font-family:JetBrains Mono,monospace;font-size:10px;font-weight:700;color:#111111;">${n}</div>`
  return L.divIcon({ html, className: "", iconSize: [26, 26], iconAnchor: [13, 13] })
}

// ── Speed sparkline ───────────────────────────────────────────────────────────
function SpeedSparkline({ history, color }: { history: number[]; color: string }) {
  if (history.length < 2) return null
  const W = 200, H = 32
  const max = Math.max(...history, 80)
  const pts = history.map((v, i) => `${(i / (history.length - 1)) * W},${H - (v / max) * H}`).join(" ")
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <line x1={W} y1="0" x2={W} y2={H} stroke={color} strokeWidth="0.5" opacity="0.3" />
    </svg>
  )
}

// ── Telemetry section ─────────────────────────────────────────────────────────
function TelemetrySection({
  toStop, arrived, kmCovered, kmRemaining, completed, numStops,
  etaNextMin, etaTripMin, progress, elapsed, displaySpeed, truckPos,
  vehicle, currentLeg, color, speedHistorySnap, etaCountdown, distToNext,
}: {
  toStop: Stop; arrived: boolean; kmCovered: number; kmRemaining: number
  completed: number; numStops: number; etaNextMin: number; etaTripMin: number
  progress: number; elapsed: string; displaySpeed: number
  truckPos: { lat: number; lng: number; bearing: number }
  vehicle: string; currentLeg: number; color: string
  speedHistorySnap: number[]
  etaCountdown: string
  distToNext: number
}) {
  return (
    <div className="px-4 py-4">
      <SectionLabel label="TELEMETRY" tag={vehicle} tagColor="var(--route)" />

      <div className="mt-2.5 mb-3">
        <div
          className="font-mono text-[9px] uppercase tracking-widest mb-0.5"
          style={{ color: "var(--muted)" }}
        >
          Active segment
        </div>
        <div
          className="font-display font-700 text-[15px] leading-snug"
          style={{ color: arrived ? "var(--done)" : "var(--fg)", fontWeight: 700 }}
        >
          {arrived ? "ROUTE COMPLETE" : `→ ${toStop.label} · ${toStop.sub}`}
        </div>
      </div>

      <div
        className="rounded border px-3 py-2 mb-3"
        style={{ borderColor: "var(--border-strong)", background: "var(--panel-2)" }}
      >
        <div
          className="font-mono text-[9px] uppercase tracking-widest mb-1"
          style={{ color: "var(--muted)" }}
        >
          GPS · WGS-84
        </div>
        <div className="font-mono text-[10.5px] flex justify-between tabular-nums">
          <span style={{ color: "var(--route)" }}>{truckPos.lat.toFixed(5)}°&thinsp;N</span>
          <span style={{ color: "var(--muted)" }}>·</span>
          <span style={{ color: "var(--route)" }}>{Math.abs(truckPos.lng).toFixed(5)}°&thinsp;W</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <SpeedGauge speed={displaySpeed} color={color} />
        <div className="flex flex-col gap-1.5 flex-1">
          <DataCell label="Bearing" value={`${Math.round(truckPos.bearing)}°`} small />
          <DataCell label="Elapsed" value={elapsed} small />
          <DataCell label="Leg"     value={arrived ? "—" : `${currentLeg + 1} of ${numStops}`} small />
        </div>
      </div>

      {/* Speed sparkline */}
      <div className="mb-3">
        <div className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>Speed history (44s)</div>
        <SpeedSparkline history={speedHistorySnap} color={color} />
      </div>

      <div className="mb-3">
        <div
          className="flex justify-between font-mono text-[9px] uppercase tracking-widest mb-1.5"
          style={{ color: "var(--muted)" }}
        >
          <span>Trip progress</span>
          <span style={{ color: "var(--fg)" }}>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--panel-2)" }}>
          <div
            className="h-full rounded-full relative overflow-hidden"
            style={{ width: `${progress * 100}%`, background: "var(--route)", transition: "width 0.12s linear" }}
          >
            {!arrived && (
              <div
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
                  animation: "progress-scan 1.8s linear infinite",
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ETA Countdown */}
      <div className="mb-3">
        <div className="rounded border px-2.5 py-1.5"
          style={{
            borderColor: distToNext < 0.6 && !arrived ? "color-mix(in srgb, var(--next) 40%, var(--border-strong))" : "var(--border-strong)",
            background: "var(--panel-2)"
          }}>
          <div className="font-mono text-[8.5px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>ETA Next</div>
          <div className="font-mono font-700 mt-0.5 tabular-nums"
            style={{
              fontSize: 18,
              color: distToNext < 0.6 && !arrived ? "var(--next)" : "var(--fg)",
              fontWeight: 700,
              animation: distToNext < 0.6 && !arrived ? "blip 1s ease-in-out infinite" : "none",
            }}>
            {etaCountdown}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DataCell label="Covered"   value={fmt(kmCovered)}  unit="km" />
        <DataCell label="Remaining" value={fmt(kmRemaining)} unit="km" />
        <DataCell label="Next stop" value={arrived ? "—" : toStop.label} color="var(--next)" />
        <DataCell label="Completed" value={`${completed} / ${numStops}`} />
        <DataCell label="ETA next"  value={arrived ? "—" : fmtWallTime(etaNextMin)} color={arrived ? undefined : "var(--fg)"} />
        <DataCell label="ETA final" value={arrived ? "—" : fmtWallTime(etaTripMin)} color={arrived ? undefined : "var(--fg)"} />
      </div>
    </div>
  )
}

// ── Speed gauge ───────────────────────────────────────────────────────────────
function SpeedGauge({ speed, color }: { speed: number; color: string }) {
  const max = 80
  const pct = Math.min(1, speed / max)
  const r = 44, cx = 56, cy = 58, sw = 7
  const arcLen = Math.PI * r
  const dashLen = pct * arcLen
  const gapLen  = arcLen - dashLen

  const pt = (t: number) => ({
    x: cx + r * Math.cos(Math.PI * (1 - t)),
    y: cy - r * Math.sin(Math.PI * (1 - t)),
  })
  const ptIn = (t: number, offset: number) => ({
    x: cx + (r - offset) * Math.cos(Math.PI * (1 - t)),
    y: cy - (r - offset) * Math.sin(Math.PI * (1 - t)),
  })

  return (
    <svg width="112" height="68" viewBox="0 0 112 68">
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`}
        fill="none" stroke="var(--border-strong)" strokeWidth={sw} strokeLinecap="round"
      />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${dashLen} ${gapLen}`}
        style={{
          filter: speed > 0 ? `drop-shadow(0 0 5px ${color})` : "none",
          transition: "stroke-dasharray 0.35s ease",
        }}
      />
      {[0, 0.5, 1].map((t, i) => {
        const a = pt(t), b = ptIn(t, 9)
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border-strong)" strokeWidth="1.5" />
            <text
              x={ptIn(t, 18).x}
              y={ptIn(t, 18).y + 3}
              textAnchor="middle"
              fontFamily="JetBrains Mono,monospace"
              fontSize="7"
              fill="var(--muted)"
            >
              {Math.round(t * max)}
            </text>
          </g>
        )
      })}
      <text x={cx} y={cy - 11} textAnchor="middle" fontFamily="JetBrains Mono,monospace" fontSize="21" fontWeight="700" fill="var(--fg)">
        {speed}
      </text>
      <text x={cx} y={cy + 1} textAnchor="middle" fontFamily="JetBrains Mono,monospace" fontSize="7.5" fill="var(--muted)" letterSpacing="1.5">
        KM/H
      </text>
    </svg>
  )
}

// ── Vehicle systems section ───────────────────────────────────────────────────
function VehicleSection({
  running, arrived, displaySpeed, rpm, temp, fuel,
}: {
  running: boolean; arrived: boolean; displaySpeed: number
  rpm: number; temp: number; fuel: number
}) {
  const statusText  = !running || arrived ? "IDLE" : temp > 92 ? "WARM" : "NOMINAL"
  const statusColor = !running || arrived ? "var(--muted)" : temp > 92 ? "var(--next)" : "var(--done)"
  const fuelColor   = fuel < 65 ? "var(--next)" : "var(--done)"
  void displaySpeed

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel label="VEHICLE SYSTEMS" />
        <span className="font-mono text-[9px] flex items-center gap-1.5" style={{ color: statusColor }}>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: statusColor, animation: running && !arrived ? "blip 1.4s ease-in-out infinite" : "none" }}
          />
          {statusText}
        </span>
      </div>

      <div className="mb-2.5">
        <div
          className="flex justify-between font-mono text-[9px] uppercase tracking-widest mb-1"
          style={{ color: "var(--muted)" }}
        >
          <span>Fuel level</span>
          <span style={{ color: fuelColor }}>{Math.round(fuel)}%</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden flex gap-0.5" style={{ background: "var(--panel-2)" }}>
          {Array.from({ length: 12 }).map((_, i) => {
            const filled = fuel >= ((i + 1) / 12) * 100 - 100 / 12
            return (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  background: filled ? fuelColor : "var(--border-strong)",
                  opacity: filled ? 1 : 0.4,
                  boxShadow: filled ? `0 0 4px ${fuelColor}40` : "none",
                  transition: "background 0.4s",
                }}
              />
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <DataCell
          label="Engine RPM"
          value={running && !arrived ? rpm.toLocaleString() : "—"}
          color={running && !arrived ? "var(--fg)" : "var(--muted)"}
        />
        <DataCell
          label="Eng. temp"
          value={running && !arrived ? `${temp}°C` : "—"}
          color={temp > 92 ? "var(--next)" : "var(--fg)"}
        />
        <DataCell label="Axle load" value="8.4 t" color="var(--fg)" />
      </div>
    </div>
  )
}

// ── Cargo manifest section ────────────────────────────────────────────────────
function CargoSection({
  cargo, stops, completed, arrived, currentLeg,
}: {
  cargo: CargoItem[]; stops: Stop[]; completed: number; arrived: boolean; currentLeg: number
}) {
  if (cargo.length === 0) {
    return (
      <div className="px-4 py-3.5">
        <SectionLabel label="CARGO MANIFEST" />
        <div className="mt-3 font-mono text-[9px] text-center py-4" style={{ color: "var(--muted)" }}>
          No cargo data for this route
        </div>
      </div>
    )
  }

  const totalKg = cargo.reduce((s, c) => s + c.kg, 0)
  const delivKg = cargo.slice(0, completed).reduce((s, c) => s + c.kg, 0)

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel label="CARGO MANIFEST" />
        <span className="font-mono text-[9px]" style={{ color: "var(--muted)" }}>
          {totalKg.toLocaleString()} kg total
        </span>
      </div>

      <div className="space-y-1.5">
        {cargo.map((c, i) => {
          const stopIdx = i + 1
          const isDone  = stopIdx <= completed
          const isNext  = !arrived && stopIdx === currentLeg + 1
          const dotC    = isDone ? "var(--done)" : isNext ? "var(--next)" : "var(--pending)"
          const stop    = stops.find(s => s.id === c.stopId)

          return (
            <div
              key={c.stopId}
              className="rounded border px-2.5 py-2"
              style={{
                borderColor: isNext
                  ? "color-mix(in srgb, var(--next) 40%, var(--border-strong))"
                  : "var(--border-strong)",
                background: isNext ? "color-mix(in srgb, var(--next) 6%, var(--panel-2))" : "var(--panel-2)",
              }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 rounded-sm rotate-45 shrink-0" style={{ background: dotC }} />
                  <span className="font-mono text-[10px] font-600 shrink-0" style={{ color: dotC }}>{c.stopId}</span>
                  <span className="font-mono text-[10px] truncate" style={{ color: "var(--fg)" }}>
                    {stop?.sub ?? c.stopId}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <span
                    className="font-mono text-[8px] rounded px-1 py-0.5"
                    style={{
                      background: c.pri === "EXP"
                        ? "color-mix(in srgb, var(--next) 18%, transparent)"
                        : "var(--border-strong)",
                      color: c.pri === "EXP" ? "var(--next)" : "var(--muted)",
                    }}
                  >
                    {c.pri}
                  </span>
                  <span className="font-mono text-[9px]" style={{ color: "var(--muted)" }}>
                    {c.kg.toLocaleString()} kg
                  </span>
                </div>
              </div>
              {(isNext || isDone) && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {c.items.map(item => (
                    <span
                      key={item}
                      className="font-mono text-[8.5px] rounded px-1.5 py-0.5"
                      style={{
                        background: "var(--border-strong)",
                        color: isDone ? "var(--muted)" : "var(--fg)",
                      }}
                    >
                      {isDone ? <s>{item}</s> : item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-2.5">
        <div
          className="flex justify-between font-mono text-[9px] uppercase tracking-widest mb-1"
          style={{ color: "var(--muted)" }}
        >
          <span>Delivered</span>
          <span style={{ color: "var(--done)" }}>
            {delivKg.toLocaleString()} / {totalKg.toLocaleString()} kg
          </span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--panel-2)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${(delivKg / totalKg) * 100}%`,
              background: "var(--done)",
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Transmission log ──────────────────────────────────────────────────────────
function TransmissionLog({ entries, fullHeight }: { entries: LogEntry[]; fullHeight?: boolean }) {
  const tc: Record<LogEntry["type"], string> = { info: "var(--muted)", ok: "var(--done)", warn: "var(--next)" }
  return (
    <div>
      <SectionLabel label="DISPATCH LOG" tag={`${entries.length}`} />
      <div
        className="mt-2 space-y-0.5"
        style={{ maxHeight: fullHeight ? 420 : 118, overflowY: "auto" }}
      >
        {entries.map(e => {
          const d = new Date(e.ts)
          const ts = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`
          return (
            <div key={e.id} className="flex gap-2 font-mono text-[9.5px] leading-relaxed">
              <span className="shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>{ts}</span>
              <span style={{ color: tc[e.type] }}>{e.type === "ok" ? "✓" : e.type === "warn" ? "!" : "·"}</span>
              <span style={{ color: e.type === "ok" ? "var(--fg)" : tc[e.type] }}>{e.msg}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Controls panel ────────────────────────────────────────────────────────────
function ControlsPanel({
  running, arrived, rate, onPlay, onReset, onRate,
}: {
  running: boolean; arrived: boolean; rate: number
  onPlay: () => void; onReset: () => void; onRate: (r: number) => void
}) {
  return (
    <div className="px-4 py-4">
      <SectionLabel label="CONTROLS" />
      <div className="mt-3 flex gap-2">
        <button
          onClick={onPlay}
          disabled={arrived}
          className="flex-1 flex items-center justify-center gap-2 rounded border py-2.5 font-display text-sm uppercase tracking-wider transition-opacity disabled:opacity-35 hover:opacity-75"
          style={{
            borderColor: "var(--route)",
            background: "color-mix(in srgb, var(--route) 13%, transparent)",
            color: "var(--route)",
            fontWeight: 700,
            letterSpacing: "0.09em",
          }}
        >
          {running && !arrived ? <PauseIcon /> : <PlayIcon />}
          {arrived ? "Completed" : running ? "Pause" : "Resume"}
        </button>
        <button
          onClick={onReset}
          className="h-10 w-10 grid place-items-center rounded border transition-opacity hover:opacity-70"
          style={{ borderColor: "var(--border-strong)", background: "var(--panel-2)", color: "var(--muted)" }}
          aria-label="Reset route"
        >
          <ResetIcon />
        </button>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-widest mr-1" style={{ color: "var(--muted)" }}>
          Rate
        </span>
        {[0.5, 1, 2, 4].map(r => (
          <button
            key={r}
            onClick={() => onRate(r)}
            className="flex-1 py-1.5 rounded border font-mono text-xs transition-colors"
            style={{
              borderColor: rate === r ? "var(--route)" : "var(--border-strong)",
              background: rate === r ? "color-mix(in srgb, var(--route) 12%, transparent)" : "transparent",
              color: rate === r ? "var(--route)" : "var(--muted)",
            }}
          >
            {r}×
          </button>
        ))}
      </div>
      <div
        className="mt-2.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest"
        style={{ color: "var(--muted)" }}
      >
        <kbd className="rounded border px-1.5 py-0.5" style={{ borderColor: "var(--border-strong)" }}>Space</kbd>
        play/pause
        <kbd className="ml-1 rounded border px-1.5 py-0.5" style={{ borderColor: "var(--border-strong)" }}>R</kbd>
        reset
        <kbd className="ml-1 rounded border px-1.5 py-0.5" style={{ borderColor: "var(--border-strong)" }}>F</kbd>
        fullscreen
      </div>
    </div>
  )
}

// ── Timeline strip ────────────────────────────────────────────────────────────
function TimelineStrip({
  stops, currentLeg, arrived, completed,
}: {
  stops: Stop[]; currentLeg: number; arrived: boolean; completed: number
}) {
  if (stops.length === 0) return null
  return (
    <div
      className="border-t shrink-0 flex items-center px-5 py-3"
      style={{ borderColor: "var(--border-strong)", background: "var(--panel)", height: 60 }}
    >
      {stops.map((s, i) => {
        const passed = arrived ? true : i <= completed
        const isAct  = !arrived && i === currentLeg
        const isNext = !arrived && i === currentLeg + 1
        const c = passed ? "var(--done)" : isAct ? "var(--route)" : isNext ? "var(--next)" : "var(--pending)"
        return (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className="h-3 w-3 rotate-45 border"
                style={{ borderColor: c, background: passed || isAct ? c : "var(--panel)" }}
              />
              <div className="font-mono text-[9px]" style={{ color: c }}>
                {s.id === "O" ? "ORG" : s.id}
              </div>
            </div>
            {i < stops.length - 1 && (
              <div
                className="flex-1 h-px mx-2"
                style={{
                  background:
                    i < currentLeg || arrived
                      ? "var(--done)"
                      : i === currentLeg
                        ? "linear-gradient(90deg, var(--route), var(--border-strong))"
                        : "var(--border-strong)",
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Small reusable atoms ──────────────────────────────────────────────────────
function Divider() {
  return <div className="border-t" style={{ borderColor: "var(--border-strong)" }} />
}

function SectionLabel({ label, tag, tagColor }: { label: string; tag?: string; tagColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      {tag && (
        <span className="font-mono text-[9px]" style={{ color: tagColor ?? "var(--muted)" }}>{tag}</span>
      )}
    </div>
  )
}

function DataCell({
  label, value, unit, color, small,
}: {
  label: string; value: string; unit?: string; color?: string; small?: boolean
}) {
  return (
    <div className="rounded border px-2.5 py-1.5" style={{ borderColor: "var(--border-strong)", background: "var(--panel-2)" }}>
      <div className="font-mono text-[8.5px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div
        className="font-mono font-600 mt-0.5 leading-none tabular-nums"
        style={{ color: color ?? "var(--fg)", fontWeight: 600, fontSize: small ? 11 : 13 }}
      >
        {value}
        {unit && <span className="ml-1 text-[8.5px]" style={{ color: "var(--muted)" }}>{unit}</span>}
      </div>
    </div>
  )
}

function HudTag({
  label, value, color, className = "",
}: {
  label: string; value: string; color?: string; className?: string
}) {
  return (
    <div className={`font-mono text-[10px] flex items-center gap-1.5 ${className}`}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span style={{ color: color ?? "var(--fg)" }}>{value}</span>
    </div>
  )
}

function StatusBadge({ arrived, running, loading }: { arrived: boolean; running: boolean; loading: boolean }) {
  const { t, c } = loading
    ? { t: "SYNCING",    c: "var(--muted)" }
    : arrived
      ? { t: "DELIVERED",  c: "var(--done)" }
      : running
        ? { t: "IN TRANSIT", c: "var(--route)" }
        : { t: "PAUSED",     c: "var(--next)" }
  return (
    <div className="flex items-center gap-1.5 font-mono text-[10px]">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: c, animation: arrived || loading ? "none" : "blip 1.4s ease-in-out infinite" }}
      />
      <span style={{ color: c }}>{t}</span>
    </div>
  )
}

function LegendRow({ color, label, type }: { color: string; label: string; type: "circle" | "diamond" | "line" }) {
  return (
    <div
      className="flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-widest"
      style={{ color: "var(--muted)" }}
    >
      {type === "circle"  && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />}
      {type === "diamond" && <span className="h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: color }} />}
      {type === "line"    && <span className="h-0.5 w-5 shrink-0 rounded-full" style={{ background: color }} />}
      {label}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const ico = {
  width: 16, height: 16, fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
}
function PlayIcon()  { return <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 5v14l12-7z"/></svg> }
function PauseIcon() { return <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg> }
function ResetIcon() { return <svg viewBox="0 0 24 24" {...ico}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/></svg> }
function SunIcon()   { return <svg viewBox="0 0 24 24" {...ico}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg> }
function MoonIcon()  { return <svg viewBox="0 0 24 24" {...ico}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg> }
function TargetIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round">
      <circle cx="12" cy="12" r="8"/>
      <circle cx="12" cy="12" r="3"/>
      <line x1="12" y1="2" x2="12" y2="6"/>
      <line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="6" y2="12"/>
      <line x1="18" y1="12" x2="22" y2="12"/>
    </svg>
  )
}
function FitIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/>
    </svg>
  )
}
function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4h4M4 4v4M16 4h-4M16 4v4M4 16v-4M4 16h4M16 16h-4M16 16v-4"/>
    </svg>
  )
}
