/**
 * Turn-by-turn: the host identifies maneuvers from the game's junctions. Callers supply physical
 * distances from guidanceDistance.ts, so a nearby turn has the same countdown in town and on a highway.
 * Trip totals keep their separate, scaled game units.
 */

export type TurnKind =
  | 'straight'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'u-turn'
  | 'keep-left'
  | 'keep-right'
  | 'exit-left'
  | 'exit-right'
  | 'roundabout'

/** A turn of the route, at the junction entered at its node `node`: how far it turns (degrees, right
 * positive), and a roundabout's exit. */
export interface Maneuver {
  node: number
  turn: TurnKind
  angle: number
  exit: number | null
}

/** What to do next: a turn, or arrive. */
export type Step = { kind: 'turn'; maneuver: Maneuver } | { kind: 'arrive' }

export interface Guidance {
  step: Step
  /** How far to it, physical metres. */
  distance: number
  /** What comes right after it, when it's that close behind (the game's "…and then"). */
  then: Step | null
}

/** A second step this close behind the first (physical metres) is shown with it. */
export const THEN_WITHIN = 400

const ARRIVE: Step = { kind: 'arrive' }

/**
 * The guidance along a route (`distances`: each node's physical distance left to the destination; `maneuvers` in
 * route order) for a truck before its node `next`, with `distanceLeft` to go; `null` without a route. A
 * turn stays next until the truck is through its junction (it's "now" while inside).
 */
export function guidanceOf(
  distances: readonly number[],
  maneuvers: readonly Maneuver[],
  next: number,
  distanceLeft: number,
): Guidance | null {
  if (!Number.isFinite(distanceLeft) || distanceLeft <= 0 || distances.length === 0) return null
  const ahead = maneuvers.filter((maneuver) => maneuver.node >= next - 1)
  const to = (maneuver: Maneuver) => Math.max(0, distanceLeft - (distances[maneuver.node] ?? 0))
  const [first, second] = ahead
  if (!first) return { step: ARRIVE, distance: distanceLeft, then: null }
  const distance = to(first)
  const after: [Step, number] = second ? [{ kind: 'turn', maneuver: second }, to(second)] : [ARRIVE, distanceLeft]
  return {
    step: { kind: 'turn', maneuver: first },
    distance,
    then: after[1] - distance <= THEN_WITHIN ? after[0] : null,
  }
}

/** Within this, metres, a step is "now". */
export const NOW_WITHIN = 30
