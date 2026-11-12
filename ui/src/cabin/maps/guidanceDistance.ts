import type { Telemetry } from '../../shared/host'
import { bearingOf } from './camera'
import { guidanceOf, type Maneuver } from './guidance'
import { approachLine, type Point, progressOf, type RouteNode, routeSpans, SNAP_NONE, type Spans } from './route'

/** Only guidance uses physical metres. The store's route distances and trip telemetry stay in game units. */
interface GuidanceRoute {
  nodes: readonly RouteNode[]
  distances: readonly number[]
  paths: ReadonlyMap<number, Point[]>
  shifts: ReadonlyMap<number, number>
  maneuvers: readonly Maneuver[]
}

export interface GuidanceState {
  route: GuidanceRoute | null
  routeNext: number
  telemetry: Pick<Telemetry, 'x' | 'z' | 'heading' | 'navigationDistance' | 'localScale'> | null
}

export interface GuidanceDistances {
  /** Physical metres remaining from each node to the end of the drawn route. */
  distances: readonly number[]
  /** Physical metres remaining from the truck, in the same frame as `distances`. */
  distanceLeft: number
}

interface Geometry {
  spans: Spans
  distances: number[]
  /** Metres from each polyline point to the end of its span. */
  remaining: number[][]
}

interface CachedRoute {
  geometry: Geometry | null
  scaled?: { scale: number; distances: number[] }
  sample?: { telemetry: GuidanceState['telemetry']; next: number; value: GuidanceDistances | null }
}

// Route objects are replaced on rerouting and when junction paths/road shifts arrive. Never cache by ID:
// geometry can change while the game's route ID stays the same. Weak keys let disposed routes go away.
const routes = new WeakMap<GuidanceRoute, CachedRoute>()

function geometryOf(route: GuidanceRoute): Geometry | null {
  if (
    route.nodes.length < 2 ||
    !route.nodes.every((node) => [...node.position, ...node.forward].every(Number.isFinite))
  )
    return null
  const spans = routeSpans(route.nodes, route.paths, route.shifts)
  if (!spans.every((line) => line.length >= 2 && line.every((point) => point.every(Number.isFinite)))) return null
  const remaining = spans.map((line) => {
    const lengths = new Array<number>(line.length).fill(0)
    for (let i = line.length - 2; i >= 0; i--)
      lengths[i] = lengths[i + 1] + Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1])
    return lengths
  })
  const distances = new Array<number>(route.nodes.length).fill(0)
  for (let i = spans.length - 1; i >= 0; i--) distances[i] = distances[i + 1] + remaining[i][0]
  return Number.isFinite(distances[0]) && distances[0] > 0 ? { spans, distances, remaining } : null
}

function onGeometry(geometry: Geometry, next: number, telemetry: NonNullable<GuidanceState['telemetry']>) {
  if (![telemetry.x, telemetry.z, telemetry.heading].every(Number.isFinite)) return null
  const truck: Point = [telemetry.x, telemetry.z]
  const bearing = (bearingOf(telemetry.heading) * Math.PI) / 180
  const facing: Point = [Math.sin(bearing), -Math.cos(bearing)]
  const progress = progressOf(geometry.spans, next, truck, facing)
  if (!progress) return null
  const approach = approachLine(geometry.spans, progress, truck, facing)
  let distanceLeft: number
  if (approach) {
    distanceLeft = geometry.distances[0]
    for (let i = 1; i < approach.length; i++)
      distanceLeft += Math.hypot(approach[i][0] - approach[i - 1][0], approach[i][1] - approach[i - 1][1])
  } else {
    // Match the map's existing snap limit; an unrelated road must not become a nearby turn at "now".
    if (progress.distance > SNAP_NONE) return null
    const { span, index, at } = progress
    const end = geometry.spans[span][index + 1]
    distanceLeft =
      geometry.distances[span + 1] + geometry.remaining[span][index + 1] + Math.hypot(end[0] - at[0], end[1] - at[1])
  }
  // The SDK still reports active navigation at the final node. Keep "arrive now" until it ends,
  // rather than treating an exact geometric zero as the no-navigation sentinel used by guidanceOf.
  return { distances: geometry.distances, distanceLeft: Math.max(Number.EPSILON, distanceLeft) }
}

/** Shared by the turn card, lane selection and layout visibility, independent of a mounted map. */
export function guidanceDistancesOf({ route, routeNext, telemetry }: GuidanceState): GuidanceDistances | null {
  if (
    !route ||
    !telemetry ||
    !Number.isFinite(telemetry.navigationDistance) ||
    telemetry.navigationDistance <= 0 ||
    !Number.isInteger(routeNext) ||
    routeNext < 0
  )
    return null
  let cached = routes.get(route)
  if (!cached) {
    cached = { geometry: geometryOf(route) }
    routes.set(route, cached)
  }
  if (cached.sample?.telemetry === telemetry && cached.sample.next === routeNext) return cached.sample.value
  let value = cached.geometry && onGeometry(cached.geometry, routeNext, telemetry)
  if (!value) {
    // An approximation only while geometry cannot be used. Never change the trip's game distances.
    const scale = telemetry.localScale
    if (
      Number.isFinite(scale) &&
      scale > 0 &&
      route.distances.length > 0 &&
      route.distances.length === route.nodes.length &&
      route.distances.every((distance) => Number.isFinite(distance) && distance >= 0)
    ) {
      if (cached.scaled?.scale !== scale)
        cached.scaled = { scale, distances: route.distances.map((distance) => distance / scale) }
      const distanceLeft = telemetry.navigationDistance / scale
      if (Number.isFinite(distanceLeft) && cached.scaled.distances.every(Number.isFinite))
        value = { distances: cached.scaled.distances, distanceLeft }
    }
  }
  cached.sample = { telemetry, next: routeNext, value }
  return value
}

/** The same eligibility check is used by both card variants and their surrounding layout. */
export function guidanceFor(state: GuidanceState) {
  const distances = guidanceDistancesOf(state)
  return state.route && distances
    ? guidanceOf(distances.distances, state.route.maneuvers, state.routeNext, distances.distanceLeft)
    : null
}
