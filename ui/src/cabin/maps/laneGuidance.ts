import type { LaneHint } from '../../shared/host'

export const LANE_ENTER_METRES = 1000
export const LANE_EXIT_METRES = 1200
const DIRECTIONS = new Set(['straight', 'left', 'right', 'slight-left', 'slight-right', 'u-turn'])

/** Old hosts omit advice; malformed or trivial advice must not become a misleading lane row. */
export function validLaneHints(value: unknown, nodeCount: number): LaneHint[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((hint): hint is LaneHint => {
      if (!hint || ![hint.node, hint.start, hint.end].every(Number.isInteger)) return false
      if (hint.start < 0 || hint.start >= hint.node || hint.end !== hint.node + 1 || hint.end >= nodeCount) return false
      if (!Array.isArray(hint.lanes) || hint.lanes.length < 2 || hint.lanes.length > 8) return false
      if (
        !hint.lanes.every(
          (lane: LaneHint['lanes'][number]) =>
            lane &&
            typeof lane.recommended === 'boolean' &&
            Array.isArray(lane.directions) &&
            lane.directions.length <= DIRECTIONS.size &&
            lane.directions.every((direction) => DIRECTIONS.has(direction)) &&
            (!lane.recommended || lane.directions.length > 0),
        )
      )
        return false
      return (
        hint.lanes.some((lane: LaneHint['lanes'][number]) => lane.recommended) &&
        hint.lanes.some((lane: LaneHint['lanes'][number]) => !lane.recommended)
      )
    })
    .sort((a, b) => a.node - b.node)
}

/** Select by verified approach and physical distance, not proximity to a neighbouring road. */
export function laneHintOf(
  hints: readonly LaneHint[],
  distances: readonly number[],
  next: number,
  distanceLeft: number,
  previous: LaneHint | null = null,
): LaneHint | null {
  if (!Number.isFinite(distanceLeft) || distanceLeft <= 0) return null
  const segment = Math.max(0, next - 1)
  for (const hint of hints) {
    if (segment < hint.start || segment >= hint.end) continue
    const remaining = distances[hint.node]
    if (!Number.isFinite(remaining)) continue
    const distance = Math.max(0, distanceLeft - remaining)
    if (distance <= (hint === previous ? LANE_EXIT_METRES : LANE_ENTER_METRES)) return hint
    // The nearest decision takes precedence, even if a later decision has unusual distances.
    return null
  }
  return null
}
