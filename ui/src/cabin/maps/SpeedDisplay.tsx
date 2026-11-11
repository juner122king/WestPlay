import { useShallow } from 'zustand/react/shallow'
import { roadSpeed } from '../../shared/format'
import { useLive } from '../state/store'
import { useText } from '../state/text'

/** CabPlay-style sign + speed capsule. Sign region follows the game, never the selected unit. */
export function SpeedDisplay() {
  const text = useText()
  const { speed, limit, mph, american, available } = useLive(
    useShallow((state) => ({
      speed: state.telemetry ? roadSpeed(state.telemetry.speed, state.mph) : 0,
      limit: state.telemetry ? roadSpeed(state.telemetry.navigationSpeedLimit, state.mph) : 0,
      available: state.telemetry !== null,
      mph: state.mph,
      american: state.truckersmpGame === 'ats',
    })),
  )
  if (!available) return null
  return (
    <SpeedDisplayView speed={speed} limit={limit} mph={mph} american={american} limitLabel={text.speedLimit(limit)} />
  )
}

export function SpeedDisplayView({
  speed,
  limit,
  mph,
  american,
  limitLabel,
}: {
  speed: number
  limit: number
  mph: boolean
  american: boolean
  limitLabel: string
}) {
  return (
    <div className={`speed-stack${american ? ' american' : ''}`}>
      {limit > 0 && (
        <div className="speed-limit" aria-label={limitLabel}>
          {american && (
            <span className="speed-limit-heading" aria-hidden="true">
              SPEED
              <br />
              LIMIT
            </span>
          )}
          <span>{limit}</span>
        </div>
      )}
      <div className="speed-reading">
        <span className={`speed-badge${limit > 0 && speed > limit ? ' over' : ''}`}>{speed}</span>
        <span className="speed-unit">{mph ? 'mph' : 'km/h'}</span>
      </div>
    </div>
  )
}
