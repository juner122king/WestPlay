import { describe, expect, it } from 'vitest'
import type { LaneHint } from '../../shared/host'
import { formatTripDistance } from '../../shared/format'
import { guidanceFor, guidanceDistancesOf, type GuidanceState } from './guidanceDistance'
import { NOW_WITHIN, type Maneuver } from './guidance'
import { laneHintOf } from './laneGuidance'
import { type Point, SNAP_NONE } from './route'

const turn = (node: number, kind: Maneuver['turn'] = 'right'): Maneuver => ({
  node,
  turn: kind,
  angle: 90,
  exit: null,
})

function routeOf(
  points: Point[] = [
    [0, 0],
    [100, 0],
    [200, 0],
  ],
) {
  return {
    id: 1,
    nodes: points.map((position) => ({ position, forward: [1, 0] as Point })),
    distances: points.map((_, i) => (points.length - 1 - i) * 2000),
    paths: new Map(points.slice(1).map((point, i) => [i, [points[i], point]])),
    shifts: new Map<number, number>(),
    maneuvers: [turn(1)],
  }
}

function stateOf(scale = 20, x = 50): GuidanceState {
  const route = routeOf()
  route.distances = [200 * scale, 100 * scale, 0]
  return {
    route,
    routeNext: 1,
    telemetry: { x, z: 0, heading: 0.75, navigationDistance: (200 - x) * scale, localScale: scale },
  }
}

const laneHint: LaneHint = {
  node: 1,
  start: 0,
  end: 2,
  lanes: [
    { directions: ['straight'], recommended: true },
    { directions: ['right'], recommended: false },
  ],
}

function adviceOf(state: GuidanceState, previous: LaneHint | null = null) {
  const distance = guidanceDistancesOf(state)
  return distance ? laneHintOf([laneHint], distance.distances, state.routeNext, distance.distanceLeft, previous) : null
}

describe('physical guidance distances', () => {
  for (const scale of [1, 3, 15, 19, 20]) {
    for (const metres of [50, 100]) {
      it(`shows ${metres} actual metres to a turn at scale ${scale}`, () => {
        const state = stateOf(scale, 100 - metres)
        const guidance = guidanceFor(state)!
        expect(guidance.step).toEqual({ kind: 'turn', maneuver: turn(1) })
        expect(guidance.distance).toBeCloseTo(metres)
        expect(formatTripDistance(guidance.distance)).toBe(`${metres} m`)
      })
    }
  }

  it('does not jump when only the area scale changes, including across a mixed city/highway route', () => {
    const state = stateOf(3)
    state.route = routeOf([
      [0, 0],
      [100, 0],
      [300, 0],
    ])
    state.route.distances = [4300, 4000, 0] // 100 city metres, then 200 highway metres.
    state.route.maneuvers = [turn(2)]
    state.telemetry = { ...state.telemetry!, navigationDistance: 4150 }
    for (const localScale of [3, 19, 20, 0, NaN]) {
      const changed = { ...state, telemetry: { ...state.telemetry!, localScale } }
      expect(guidanceFor(changed)?.distance).toBeCloseTo(250)
    }
  })

  it('follows a bent junction path instead of measuring its straight-line chord', () => {
    const state = stateOf()
    const route = routeOf([
      [0, 0],
      [100, 100],
      [200, 100],
    ])
    route.paths.set(0, [
      [0, 0],
      [100, 0],
      [100, 100],
    ])
    state.route = route
    state.telemetry = { ...state.telemetry!, x: 50 }
    expect(guidanceFor(state)?.distance).toBeCloseTo(150)
  })

  it('uses the inferred road curve before junction paths are available', () => {
    const state = stateOf()
    state.route = routeOf([
      [0, 0],
      [100, 100],
    ])
    state.route.paths = new Map()
    state.route.nodes[1].forward = [0, 1]
    state.telemetry = { ...state.telemetry!, x: 0 }
    expect(guidanceFor(state)?.distance).toBeGreaterThan(Math.hypot(100, 100))
  })

  it('keeps a looping roundabout approach distinct from its overlapping way back', () => {
    const state = stateOf()
    const route = routeOf([
      [0, 0],
      [100, 0],
      [100, 10],
      [0, 0],
    ])
    route.paths.set(2, [
      [100, 10],
      [100, 0],
      [0, 0],
    ])
    route.maneuvers = [{ ...turn(1, 'roundabout'), exit: 2 }]
    state.route = route
    expect(guidanceFor(state)?.distance).toBeCloseTo(50)
    const returning = { ...state, routeNext: 4, telemetry: { ...state.telemetry!, heading: 0.25 } }
    expect(guidanceFor(returning)?.step).toEqual({ kind: 'arrive' })
    expect(guidanceFor(returning)?.distance).toBeCloseTo(50)
  })

  it('includes the approach before the route start, then counts down smoothly onto the route', () => {
    const state = stateOf(20, -50)
    state.routeNext = 0
    for (const [x, distance] of [
      [-50, 150],
      [-1, 101],
      [0, 100],
      [1, 99],
    ]) {
      const moving = { ...state, telemetry: { ...state.telemetry!, x } }
      expect(guidanceFor(moving)?.distance).toBeCloseTo(distance)
    }
  })

  it('measures from the projected vehicle position within the map snap range', () => {
    const state = stateOf()
    for (const z of [0, 10, SNAP_NONE])
      expect(guidanceFor({ ...state, telemetry: { ...state.telemetry!, z } })?.distance).toBeCloseTo(50)
  })

  it('uses physical metres for now, then and arrival, retaining the host junction progress rules', () => {
    const state = stateOf()
    for (const [x, now] of [
      [70, false],
      [71, true],
      [100, true],
      [110, true],
    ] as const) {
      const guidance = guidanceFor({ ...state, routeNext: x < 100 ? 1 : 2, telemetry: { ...state.telemetry!, x } })!
      expect(guidance.step).toEqual({ kind: 'turn', maneuver: turn(1) })
      expect(guidance.distance < NOW_WITHIN).toBe(now)
    }
    const passed = { ...state, routeNext: 3, telemetry: { ...state.telemetry!, x: 175 } }
    expect(guidanceFor(passed)?.step).toEqual({ kind: 'arrive' })
    expect(guidanceFor(passed)?.distance).toBeCloseTo(25)
    const atEnd = { ...passed, telemetry: { ...passed.telemetry, x: 200 } }
    expect(guidanceFor(atEnd)?.step).toEqual({ kind: 'arrive' })
    expect(guidanceFor(atEnd)?.distance).toBeCloseTo(0)
    expect(guidanceFor({ ...atEnd, telemetry: { ...atEnd.telemetry, navigationDistance: 0 } })).toBeNull()

    for (const [gap, then] of [
      [350, true],
      [400, true],
      [401, false],
    ] as const) {
      const route = routeOf([
        [0, 0],
        [100, 0],
        [100 + gap, 0],
        [1000, 0],
      ])
      route.maneuvers = [turn(1), turn(2, 'left')]
      const guidance = guidanceFor({ ...state, route })!
      expect(guidance.then).toEqual(then ? { kind: 'turn', maneuver: turn(2, 'left') } : null)
    }
  })

  it('preserves unit formatting for nearby turns in both metric and imperial profiles', () => {
    const guidance = guidanceFor(stateOf())!
    expect(formatTripDistance(guidance.distance, ',', false)).toBe('50 m')
    expect(formatTripDistance(guidance.distance, '.', true)).toBe('150 ft')
  })

  it('shares the exact same countdown and thresholds with lane advice', () => {
    const state = stateOf()
    state.route = routeOf([
      [0, 0],
      [1500, 0],
      [3000, 0],
    ])
    for (const localScale of [3, 20]) {
      for (const [distance, eligible] of [
        [1000, true],
        [1001, false],
      ] as const) {
        const near = { ...state, telemetry: { ...state.telemetry!, localScale, x: 1500 - distance } }
        const metrics = guidanceDistancesOf(near)!
        expect(guidanceFor(near)?.distance).toBeCloseTo(distance)
        expect(metrics.distanceLeft - metrics.distances[laneHint.node]).toBeCloseTo(distance)
        expect(adviceOf(near)).toBe(eligible ? laneHint : null)
      }
      for (const [distance, retained] of [
        [1200, true],
        [1201, false],
      ] as const) {
        const near = { ...state, telemetry: { ...state.telemetry!, localScale, x: 1500 - distance } }
        expect(adviceOf(near, laneHint)).toBe(retained ? laneHint : null)
      }
    }
  })
})

describe('guidance geometry lifetime', () => {
  it('shares one sample across consumers and keeps cumulative lengths as the truck moves', () => {
    const state = stateOf()
    const first = guidanceDistancesOf(state)!
    expect(guidanceDistancesOf(state)).toBe(first)
    const moved = guidanceDistancesOf({ ...state, telemetry: { ...state.telemetry!, x: 60 } })!
    expect(moved.distances).toBe(first.distances)
    expect(moved.distanceLeft).toBeCloseTo(first.distanceLeft - 10)
    expect(state.route?.distances).toEqual([4000, 2000, 0])
    expect(state.telemetry?.navigationDistance).toBe(3000)
  })

  it('rebuilds geometry when junction paths arrive under the same route ID', () => {
    const state = stateOf()
    const before = guidanceDistancesOf(state)!
    const paths = new Map(state.route!.paths)
    paths.set(0, [
      [0, 0],
      [50, 0],
      [50, 100],
      [100, 100],
      [100, 0],
    ])
    const updated = { ...state, route: { ...state.route!, paths } }
    const after = guidanceDistancesOf(updated)!
    expect(after.distances).not.toBe(before.distances)
    expect(guidanceFor(updated)?.distance).toBeCloseTo(250)
    expect(guidanceFor(state)?.distance).toBeCloseTo(50)
  })

  it('rebuilds after a reroute, without retaining a distance from the old route', () => {
    const state = stateOf()
    expect(guidanceFor(state)?.distance).toBeCloseTo(50)
    const route = {
      ...routeOf([
        [0, 0],
        [500, 0],
        [1000, 0],
      ]),
      id: 2,
    }
    expect(guidanceFor({ ...state, route })?.distance).toBeCloseTo(450)
  })

  it('rebuilds carriageway shifts and uses them even before detailed paths arrive', () => {
    const state = stateOf()
    const route = { ...routeOf(), paths: new Map<number, Point[]>() }
    const before = guidanceDistancesOf({ ...state, route })!
    const updated = {
      ...route,
      shifts: new Map([
        [0, 10],
        [1, 10],
        [2, 10],
      ]),
    }
    const after = guidanceDistancesOf({ ...state, route: updated, telemetry: { ...state.telemetry!, z: 10 } })!
    expect(after.distances).not.toBe(before.distances)
    expect(after.distanceLeft).toBeCloseTo(before.distanceLeft)
  })
})

describe('scaled fallback and unavailable guidance', () => {
  it('divides the game distance difference by local scale when geometry is missing', () => {
    for (const scale of [1, 3, 19, 20]) {
      const state = stateOf(scale)
      state.route!.paths = new Map([[0, []]])
      expect(guidanceFor(state)?.distance).toBeCloseTo(50)
      expect(adviceOf(state)).toBe(laneHint)
    }
  })

  it('rejects an off-route projection outside the map snap limit and falls back', () => {
    const state = stateOf()
    state.telemetry = { ...state.telemetry!, z: SNAP_NONE + 1, navigationDistance: 6000 }
    expect(guidanceFor(state)?.distance).toBeCloseTo(200)
    expect(guidanceFor({ ...state, telemetry: { ...state.telemetry, localScale: 0 } })).toBeNull()
  })

  it('does not invent a route approach when the truck faces away from its start', () => {
    const state = stateOf(20, -50)
    state.telemetry = { ...state.telemetry!, heading: 0.25, navigationDistance: 6000 }
    expect(guidanceFor(state)?.distance).toBeCloseTo(200)
  })

  it('handles single-node routes with the scaled arrival distance', () => {
    const state = stateOf()
    state.route = routeOf([[0, 0]])
    state.route.maneuvers = []
    expect(guidanceFor(state)).toEqual({ step: { kind: 'arrive' }, distance: 150, then: null })
  })

  it('hides without usable geometry or scale, then restores when valid data returns', () => {
    const state = stateOf()
    state.route!.paths = new Map([[0, []]])
    for (const localScale of [0, -1, NaN, Infinity]) {
      const missing = { ...state, telemetry: { ...state.telemetry!, localScale } }
      expect(guidanceDistancesOf(missing)).toBeNull()
      expect(guidanceFor(missing)).toBeNull()
      expect(adviceOf(missing)).toBeNull()
    }
    expect(guidanceFor({ ...state, telemetry: { ...state.telemetry!, localScale: 20 } })?.distance).toBeCloseTo(50)
  })

  it('uses fallback for non-finite geometry, coordinates or heading', () => {
    const state = stateOf()
    for (const property of ['x', 'z', 'heading'] as const)
      expect(guidanceFor({ ...state, telemetry: { ...state.telemetry!, [property]: NaN } })?.distance).toBeCloseTo(50)
    const route = routeOf()
    route.paths.set(0, [
      [0, 0],
      [NaN, 0],
    ])
    expect(guidanceFor({ ...state, route })?.distance).toBeCloseTo(50)
  })

  it('rejects invalid fallback distances rather than making up an instruction distance', () => {
    const state = stateOf()
    for (const distances of [[], [4000, NaN, 0], [4000, Infinity, 0], [4000, -1, 0], [4000]]) {
      const route = { ...state.route!, paths: new Map([[0, [] as Point[]]]), distances }
      expect(guidanceFor({ ...state, route })).toBeNull()
    }
  })

  it('hides for no route, no telemetry, invalid progress or inactive navigation', () => {
    const state = stateOf()
    expect(guidanceFor({ ...state, route: null })).toBeNull()
    expect(guidanceFor({ ...state, telemetry: null })).toBeNull()
    for (const navigationDistance of [0, -1, NaN, Infinity])
      expect(guidanceFor({ ...state, telemetry: { ...state.telemetry!, navigationDistance } })).toBeNull()
    for (const routeNext of [-1, 0.5, NaN, Infinity]) expect(guidanceFor({ ...state, routeNext })).toBeNull()
  })
})
