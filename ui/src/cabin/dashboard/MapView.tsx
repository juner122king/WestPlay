import { useShallow } from 'zustand/react/shallow'
import { formatGameTime, formatTripDistance, formatTripTime } from '../../shared/format'
import { cabClock } from '../../shared/host'
import { hvtMapMessage } from '../maps/blockedMap'
import { useMapBrowsing } from '../maps/liveMap'
import { GuidanceCard } from '../maps/GuidanceCard'
import { DashboardMapControls, MapControls } from '../maps/MapControls'
import { MapSearch } from '../maps/MapSearch'
import { nextStop } from '../maps/nextStop'
import { useMapData } from '../maps/mapData'
import { MapCacheNotice } from '../maps/MapCacheNotice'
import { RoadMap } from '../maps/RoadMap'
import { SpeedDisplay } from '../maps/SpeedDisplay'
import { useClockStyle } from '../state/hooks'
import { useLive } from '../state/store'
import { useText } from '../state/text'
import './map.css'

/**
 * The map tile (Dashboard and the Maps app): the live map following the truck (with the game's GPS route),
 * the trip's arrival, time and distance left while there's a route, the road's speed limit and the live
 * speed; in the Maps app, turn-by-turn over the map (the Dashboard has its own widget for it). Without map
 * data it shows a drawn stand-in map (dark or daytime, following the appearance) tilted like CarPlay's
 * driving view. `interactive` (the Maps app): the player can move the map, with its buttons; on the
 * Dashboard, it only zooms (its buttons fading while unused).
 * On a map WestPlay doesn't allow (by HVT), it says so instead, in the game's language.
 */
export function MapView({ interactive = false }: { interactive?: boolean }) {
  const overview = useMapBrowsing((state) => state.routeOverview) && interactive
  const data = useMapData()
  const hvtMap = useLive((state) => state.hvtMap)
  const chosen = useLive((state) => state.chosenLanguage)

  if (hvtMap) {
    return (
      <div className="map-tile map-blocked">
        <svg className="map-blocked-glyph" viewBox="0 0 24 24" aria-hidden>
          <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5Z" />
          <path d="M9 4v13.5M15 6.5V20M3 3l18 18" />
        </svg>
        <p>{hvtMapMessage(chosen ?? hvtMap.language)}</p>
      </div>
    )
  }

  // Layered so the Dashboard's map grows and shrinks by transforms alone (dashboard.css): the tile and its clip
  // stand still, the window (the map's right edge, its zoom pair) slides, the content (the map, centred in what
  // shows of it) slides against it, and the speed capsule moves with the window’s right edge; its shadow in two
  // parts, the left one still, the rest sliding. In the Maps app, all of them simply the tile.
  return (
    <div className={`map-tile${interactive ? ' map-navigation' : ''}${overview ? ' route-overview' : ''}`}>
      <div className="map-shadow map-shadow-left" aria-hidden />
      <div className="map-shadow-clip" aria-hidden>
        <div className="map-shadow map-shadow-moving" />
      </div>
      <div className="map-clip">
        <div className="map-window">
          <div className="map-content">
            {data ? (
              <RoadMap data={data} interactive={interactive} />
            ) : (
              data === null && (
                <>
                  <div className="map-plane map-dark" />
                  <div className="map-plane map-light" />
                  <div className="puck" aria-hidden>
                    <svg viewBox="0 0 24 24" width="22" height="22">
                      <path d="M12 3 19 20l-7-4-7 4Z" fill="#fff" />
                    </svg>
                  </div>
                </>
              )
            )}
            <div className="map-shade" />
            <TripPill concealed={overview} />
          </div>
          <div className="map-speed-layer" aria-hidden={overview}>
            <SpeedDisplay />
          </div>
          {interactive && (
            <div className="map-guidance-layer" aria-hidden={overview}>
              <GuidanceCard variant="banner" />
            </div>
          )}
          {data && interactive && <MapControls />}
          {data && !interactive && <DashboardMapControls />}
          {data && interactive && <MapSearch />}
          <MapCacheNotice />
        </div>
      </div>
    </div>
  )
}

/**
 * The trip, while the game's GPS has a route: when the truck arrives (on the game's clock), the time and
 * the distance left, as the game itself counts them (its time scale and its map's scale, so the same as
 * its own GPS shows). With a stop of the player's ahead, the time to it first ("30 min | 3 h 5 min"), the
 * next one's only, the one after once it's reached (owner 2026-10-21).
 */
function TripPill({ concealed }: { concealed: boolean }) {
  const text = useText()
  const clock = useClockStyle()
  const trip = useLive(
    useShallow((state) => {
      const telemetry = state.telemetry
      if (!telemetry || telemetry.navigationDistance <= 0) return null
      const minutes = telemetry.navigationTime / 60
      const stop = state.route
        ? nextStop(
            state.routeStops,
            state.route.distances,
            state.routeNext,
            telemetry.navigationDistance,
            telemetry.navigationTime,
          )
        : null
      const total = formatTripTime(minutes, text)
      return [
        formatGameTime(Math.round(cabClock(telemetry, state.clockShift) + minutes), clock),
        stop ? `${formatTripTime(stop.minutes, text)} | ${total}` : total,
        formatTripDistance(telemetry.navigationDistance, text.decimal, state.mph),
      ]
    }),
  )
  if (!trip) return null
  const [arrival, time, distance] = trip
  return (
    <div className="eta-pill glass" aria-hidden={concealed}>
      <div className="eta-arrival">
        <b>{arrival}</b> <span>{text.arrival}</span>
      </div>
      <div className="eta-remaining">
        <span>{time}</span>
        <span className="dot">·</span>
        <span>{distance}</span>
      </div>
    </div>
  )
}
