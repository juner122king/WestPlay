import { create } from 'zustand'
import type { LaneHint } from '../../shared/host'
import { formatTripDistance } from '../../shared/format'
import { useLive } from '../state/store'
import { useText } from '../state/text'
import { laneHintOf } from './laneGuidance'
import { NOW_WITHIN } from './guidance'
import { guidanceDistancesOf } from './guidanceDistance'

// Advance hysteresis on telemetry/store updates, not by reading or writing refs during React render.
const useAdvice = create<{ hint: LaneHint | null }>()(() => ({ hint: null }))
let routeId: number | null = null
const syncAdvice = () => {
  const state = useLive.getState()
  const { route, routeNext } = state
  const distances = guidanceDistancesOf(state)
  const previous = routeId === route?.id ? useAdvice.getState().hint : null
  routeId = route?.id ?? null
  const hint =
    route && distances
      ? laneHintOf(route.laneHints ?? [], distances.distances, routeNext, distances.distanceLeft, previous)
      : null
  if (hint !== useAdvice.getState().hint) useAdvice.setState({ hint })
}
syncAdvice()
const stop = useLive.subscribe(syncAdvice)
import.meta.hot?.dispose(stop)

export function useLaneHint() {
  const hint = useAdvice((state) => state.hint)
  const text = useText()
  const distance = useLive((state) => {
    if (!hint) return ''
    const distances = guidanceDistancesOf(state)
    const remaining = distances?.distances[hint.node]
    if (!distances || remaining === undefined || !Number.isFinite(remaining)) return ''
    const metres = Math.max(0, distances.distanceLeft - remaining)
    return metres < NOW_WITHIN ? text.now : formatTripDistance(metres, text.decimal, state.mph)
  })
  return { hint, distance }
}
