import { create } from 'zustand'
import type { LaneHint } from '../../shared/host'
import { formatTripDistance } from '../../shared/format'
import { useLive } from '../state/store'
import { useText } from '../state/text'
import { laneHintOf } from './laneGuidance'
import { NOW_WITHIN } from './guidance'

// Advance hysteresis on telemetry/store updates, not by reading or writing refs during React render.
const useAdvice = create<{ hint: LaneHint | null }>()(() => ({ hint: null }))
let routeId: number | null = null
const syncAdvice = () => {
  const { route, routeNext, telemetry } = useLive.getState()
  const previous = routeId === route?.id ? useAdvice.getState().hint : null
  routeId = route?.id ?? null
  const hint = route
    ? laneHintOf(route.laneHints ?? [], route.distances, routeNext, telemetry?.navigationDistance ?? 0, previous)
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
    if (!hint || !state.route) return ''
    const metres = Math.max(0, (state.telemetry?.navigationDistance ?? 0) - state.route.distances[hint.node])
    return metres < NOW_WITHIN ? text.now : formatTripDistance(metres, text.decimal, state.mph)
  })
  return { hint, distance }
}
