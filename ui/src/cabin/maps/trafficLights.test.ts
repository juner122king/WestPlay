import { describe, expect, it } from 'vitest'
import type { SemaphoreInfo, Telemetry } from '../../shared/host'
import { useLive } from '../state/store'
import {
  nearestTrafficLightAhead,
  syncTrafficLights,
  trafficLightStateClass,
  type TrafficLightPool,
} from './trafficLights'

const baseTelemetry: Telemetry = {
  x: 0,
  y: 0,
  z: 0,
  // 0 heading in turns: north (-z direction)
  heading: 0,
  pitch: 0,
  roll: 0,
  speed: 10,
  engineRpm: 1200,
  gear: 6,
  displayedGear: 6,
  cruiseControlSpeed: 60,
  fuel: 300,
  fuelRange: 800,
  navigationDistance: 1000,
  navigationTime: 120,
  navigationSpeedLimit: 80,
  gameTime: 500,
  multiplayerTimeOffset: 0,
  localScale: 19,
  dashboardBacklight: 1,
  electricEnabled: true,
  engineEnabled: true,
  parkingBrake: false,
  lowBeam: false,
  highBeam: false,
  leftBlinker: false,
  rightBlinker: false,
  paused: false,
}

describe('nearestTrafficLightAhead', () => {
  it('detects a traffic light ahead in north direction (-z)', () => {
    const semaphores: SemaphoreInfo[] = [
      { x: 5, y: 0, z: -50, heading: 0.5, state: 2, countdown: 12.5, duration: 30 },
      { x: 5, y: 0, z: -150, heading: 0.5, state: 0, countdown: 25.0, duration: 40 },
    ]
    const nearest = nearestTrafficLightAhead(semaphores, baseTelemetry)
    expect(nearest).not.toBeNull()
    expect(nearest?.semaphore.countdown).toBe(12.5)
    expect(nearest?.distance).toBeCloseTo(50, 1)
  })

  it('ignores traffic lights behind or too far to the side', () => {
    const semaphores: SemaphoreInfo[] = [
      // Behind (+z when heading north)
      { x: 0, y: 0, z: 50, heading: 0, state: 2, countdown: 10, duration: 30 },
      // Too far lateral (> 35m)
      { x: 100, y: 0, z: -50, heading: 0, state: 0, countdown: 20, duration: 30 },
      // Inactive / off (state 4)
      { x: 2, y: 0, z: -40, heading: 0, state: 4, countdown: 0, duration: 0 },
    ]
    const nearest = nearestTrafficLightAhead(semaphores, baseTelemetry)
    expect(nearest).toBeNull()
  })

  it('works when truck is heading east (0.75 turns, +x)', () => {
    // East: heading = 0.75
    const eastTelemetry: Telemetry = {
      ...baseTelemetry,
      heading: 0.75,
    }
    const semaphores: SemaphoreInfo[] = [
      // 80m ahead east (+x), 4m right (+z)
      { x: 80, y: 0, z: 4, heading: 0.25, state: 0, countdown: 18, duration: 30 },
      // 200m ahead east (+x)
      { x: 200, y: 0, z: 0, heading: 0.25, state: 2, countdown: 5, duration: 30 },
    ]
    const nearest = nearestTrafficLightAhead(semaphores, eastTelemetry)
    expect(nearest).not.toBeNull()
    expect(nearest?.semaphore.countdown).toBe(18)
    expect(nearest?.distance).toBeCloseTo(80, 1)
  })

  it('maps Prism3D semaphore states to correct CSS classes', () => {
    // 0: Yellow, 1: Red, 2: Red+Amber, 3: Green
    expect(trafficLightStateClass(0)).toBe('traffic-yellow')
    expect(trafficLightStateClass(1)).toBe('traffic-red')
    expect(trafficLightStateClass(2)).toBe('traffic-red-amber')
    expect(trafficLightStateClass(3)).toBe('traffic-green')
    expect(trafficLightStateClass(4)).toBe('traffic-off')
  })

  it('syncTrafficLights activates only the single nearest marker and removes all others', () => {
    // Construct mock pool without needing real DOM
    const markers: any[] = []
    const elements: any[] = []
    for (let i = 0; i < 4; i++) {
      const el = { isConnected: false }
      const marker = {
        getElement: () => el,
        addTo: () => {
          el.isConnected = true
        },
        remove: () => {
          el.isConnected = false
        },
        setLngLat: () => {},
      }
      markers.push(marker)
      elements.push({
        badge: { className: '' },
        timerBox: { style: { display: '' } },
        timer: { textContent: '' },
        housing: {},
      })
    }
    const pool = { markers, elements } as unknown as TrafficLightPool

    // Mock map
    const mockMap: any = {
      getZoom: () => 16,
      getContainer: () => ({ clientWidth: 1000, clientHeight: 1000 }),
      project: () => ({ x: 500, y: 500 }),
    }

    // Set state with 3 semaphores (state 1 = Red)
    useLive.setState({
      telemetry: baseTelemetry,
      semaphores: [
        { x: 2, y: 0, z: -30, heading: 0.5, state: 1, countdown: 14.2, duration: 30 },
        { x: 5, y: 0, z: -80, heading: 0.5, state: 3, countdown: 20.0, duration: 30 },
        { x: 3, y: 0, z: -120, heading: 0.5, state: 0, countdown: 3.0, duration: 30 },
      ],
    })

    syncTrafficLights(mockMap, pool)

    // Exactly 1 marker should be connected (the nearest one at z = -30, Red light)
    expect(pool.markers[0].getElement().isConnected).toBe(true)
    expect(pool.elements[0].timer.textContent).toBe('15')
    expect(pool.elements[0].badge.className).toContain('traffic-red')

    // Markers 1..3 must NOT be connected
    for (let i = 1; i < pool.markers.length; i++) {
      expect(pool.markers[i].getElement().isConnected).toBe(false)
    }
  })
})
