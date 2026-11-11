import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOverviewSession, routeBounds } from './routeOverview'
import type { Point } from './route'

afterEach(() => vi.useRealTimers())

describe('current-route overview session', () => {
  function setup() {
    vi.useFakeTimers()
    const change = vi.fn(),
      back = vi.fn()
    const session = createOverviewSession(change, back)
    return { session, change, back }
  }
  it('hides cards on entry and restores navigation after exactly 15 seconds', () => {
    const { session, change, back } = setup()
    session.enter()
    expect(change).toHaveBeenLastCalledWith(true)
    vi.advanceTimersByTime(14999)
    expect(back).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(change).toHaveBeenLastCalledWith(false)
    expect(back).toHaveBeenCalledTimes(1)
    expect(session.active()).toBe(false)
  })
  it('only explicit activity resets the deadline, not animation or telemetry', () => {
    const { session, back } = setup()
    session.enter()
    vi.advanceTimersByTime(14000)
    session.touch()
    vi.advanceTimersByTime(14000)
    expect(back).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(back).toHaveBeenCalledTimes(1)
  })
  it('never recentres in the middle of a long drag and restarts on release', () => {
    const { session, back } = setup()
    session.enter()
    session.hold(true)
    vi.advanceTimersByTime(60000)
    expect(back).not.toHaveBeenCalled()
    session.hold(false)
    vi.advanceTimersByTime(15000)
    expect(back).toHaveBeenCalledTimes(1)
  })
  it('manual return, leaving maps and disposal cancel the pending callback', () => {
    const { session, back } = setup()
    session.enter()
    session.exit()
    session.exit()
    vi.advanceTimersByTime(60000)
    expect(back).not.toHaveBeenCalled()
    session.enter()
    vi.advanceTimersByTime(15000)
    expect(back).toHaveBeenCalledTimes(1)
  })
  it('handles long, looping, short and missing routes', () => {
    expect(routeBounds([])).toBeNull()
    expect(routeBounds([[NaN, Infinity]])).toBeNull()
    expect(routeBounds([[10, 20]])).toEqual([
      [-5, 5],
      [25, 35],
    ])
    expect(
      routeBounds([
        [0, 0],
        [200, -100],
        [0, 0],
      ]),
    ).toEqual([
      [0, -100],
      [200, 0],
    ])
    const points: Point[] = Array.from({ length: 200000 }, (_, i) => [i, -i])
    expect(routeBounds(points)).toEqual([
      [0, -199999],
      [199999, 0],
    ])
  })
})
