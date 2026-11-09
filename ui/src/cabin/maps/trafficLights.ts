import maplibregl from 'maplibre-gl'
import type { SemaphoreInfo, Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import { toLngLat } from './projection'

const MIN_ZOOM = 13.5
const MAX_MARKERS = 32

export interface TrafficLightElements {
  badge: HTMLDivElement
  timerBox: HTMLDivElement
  timer: HTMLSpanElement
  housing: HTMLDivElement
}

export interface TrafficLightPool {
  markers: maplibregl.Marker[]
  elements: TrafficLightElements[]
}

/**
 * Creates a reusable pool of MapLibre DOM markers for traffic lights and countdown timers.
 */
export function createTrafficLightPool(): TrafficLightPool {
  const markers: maplibregl.Marker[] = []
  const elements: TrafficLightElements[] = []

  for (let i = 0; i < MAX_MARKERS; i++) {
    const badge = document.createElement('div')
    badge.className = 'traffic-light-badge'

    // Left: timer box (rounded pill with colored border matching current signal)
    const timerBox = document.createElement('div')
    timerBox.className = 'traffic-light-timer-box'

    const timer = document.createElement('span')
    timer.className = 'traffic-light-timer'
    timerBox.appendChild(timer)

    // Right: 3-hole vertical traffic light housing (red, yellow, green)
    const housing = document.createElement('div')
    housing.className = 'traffic-light-housing'

    const lampRed = document.createElement('span')
    lampRed.className = 'traffic-lamp lamp-red'

    const lampYellow = document.createElement('span')
    lampYellow.className = 'traffic-lamp lamp-yellow'

    const lampGreen = document.createElement('span')
    lampGreen.className = 'traffic-lamp lamp-green'

    housing.appendChild(lampRed)
    housing.appendChild(lampYellow)
    housing.appendChild(lampGreen)

    badge.appendChild(timerBox)
    badge.appendChild(housing)

    const marker = new maplibregl.Marker({
      element: badge,
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport',
    })

    markers.push(marker)
    elements.push({ badge, timerBox, timer, housing })
  }

  return { markers, elements }
}

/**
 * Maps SCS Prism3D traffic semaphore actor state to UI CSS class:
 * In SCS Prism3D:
 * - 0: Yellow / Amber
 * - 1: Red
 * - 2: Red + Amber
 * - 3: Green
 * - 4+: Off / Inactive
 */
export function trafficLightStateClass(state: number): string {
  switch (state) {
    case 3:
      return 'traffic-green'
    case 0:
      return 'traffic-yellow'
    case 1:
      return 'traffic-red'
    case 2:
      return 'traffic-red-amber'
    default:
      return 'traffic-off'
  }
}

/**
 * Synchronizes traffic light markers on the map with the latest telemetry and game semaphores.
 * Strictly adheres to in-cabin navigation standards: displays only the single nearest traffic light
 * ahead in the vehicle's travel corridor at any given time.
 */
export function syncTrafficLights(map: maplibregl.Map, pool: TrafficLightPool) {
  const { semaphores, telemetry } = useLive.getState()
  const zoom = map.getZoom()

  if (zoom < MIN_ZOOM || semaphores.length === 0 || !telemetry) {
    removeUnused(pool, 0)
    return
  }

  // Find the single upcoming traffic light ahead on the current driving corridor
  const nearest = nearestTrafficLightAhead(semaphores, telemetry)
  if (!nearest) {
    removeUnused(pool, 0)
    return
  }

  const s = nearest.semaphore
  if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) {
    removeUnused(pool, 0)
    return
  }

  const lngLat = toLngLat(s.x, s.z)
  const pos = map.project(lngLat)
  const container = map.getContainer()
  const width = container.clientWidth
  const height = container.clientHeight

  // Cull if completely outside the viewport margin
  if (pos.x < -50 || pos.x > width + 50 || pos.y < -50 || pos.y > height + 50) {
    removeUnused(pool, 0)
    return
  }

  const { badge, timerBox, timer } = pool.elements[0]
  const marker = pool.markers[0]

  const stateClass = trafficLightStateClass(s.state)
  badge.className = `traffic-light-badge ${stateClass}`
  const seconds = Math.max(0, Math.ceil(s.countdown))
  if (seconds > 0) {
    timerBox.style.display = 'flex'
    timer.textContent = `${seconds}`
  } else {
    timerBox.style.display = 'none'
    timer.textContent = ''
  }

  marker.setLngLat(lngLat)
  if (!marker.getElement().isConnected) {
    marker.addTo(map)
  }

  // Ensure all other markers (1..MAX_MARKERS-1) are completely hidden/removed
  removeUnused(pool, 1)
}

function removeUnused(pool: TrafficLightPool, startIndex: number) {
  for (let i = startIndex; i < pool.markers.length; i++) {
    const marker = pool.markers[i]
    if (marker.getElement().isConnected) {
      marker.remove()
    }
  }
}

export interface NearestTrafficLight {
  semaphore: SemaphoreInfo
  distance: number
}

/**
 * Finds the nearest traffic light ahead in the truck's travel corridor.
 * Returns null if no traffic light is within the corridor (3m - 350m ahead, < 35m lateral).
 */
export function nearestTrafficLightAhead(
  semaphores: readonly SemaphoreInfo[],
  telemetry: Telemetry | null,
): NearestTrafficLight | null {
  if (!telemetry || semaphores.length === 0) return null
  const { x: tx, z: tz, heading } = telemetry

  // heading is in turns (0..1, 0 is north: -z)
  const rad = heading * 2 * Math.PI
  const fx = -Math.sin(rad)
  const fz = -Math.cos(rad)

  let closest: NearestTrafficLight | null = null

  for (const s of semaphores) {
    if (s.state > 3) continue
    const dx = s.x - tx
    const dz = s.z - tz
    const forward = dx * fx + dz * fz

    // In front: -5m (at stop line/overhead gantry) to 350m
    if (forward < -5 || forward > 350) continue
    const lateral = Math.abs(dx * (-fz) + dz * fx)
    // Lateral corridor within 45 meters
    if (lateral > 45) continue

    if (!closest || forward < closest.distance) {
      closest = { semaphore: s, distance: forward }
    }
  }

  return closest
}
