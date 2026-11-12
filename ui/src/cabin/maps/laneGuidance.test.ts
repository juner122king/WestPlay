import { describe, expect, it } from 'vitest'
import type { LaneHint } from '../../shared/host'
import { laneHintOf, validLaneHints } from './laneGuidance'

const hint: LaneHint = {
  node: 2,
  start: 0,
  end: 3,
  lanes: [
    { directions: ['straight'], recommended: true },
    { directions: ['straight', 'right'], recommended: true },
    { directions: ['right'], recommended: false },
  ],
}
const distances = [9000, 8500, 8000, 7500, 7000]

describe('real lane advice', () => {
  it('enters at 1000 physical metres and retains until 1200, without boundary chatter', () => {
    expect(laneHintOf([hint], distances, 1, 9001)).toBeNull()
    expect(laneHintOf([hint], distances, 1, 9000)).toBe(hint)
    expect(laneHintOf([hint], distances, 1, 9200, hint)).toBe(hint)
    expect(laneHintOf([hint], distances, 1, 9201, hint)).toBeNull()
  })
  it('only applies along the verified approach and through its own junction', () => {
    const short = { ...hint, start: 1 }
    expect(laneHintOf([short], distances, 1, 8900)).toBeNull()
    expect(laneHintOf([short], distances, 2, 8700)).toBe(short)
    expect(laneHintOf([short], distances, 3, 8000)).toBe(short)
    expect(laneHintOf([short], distances, 4, 7500, short)).toBeNull()
  })
  it('clears without navigation, including missing and invalid distances', () => {
    for (const left of [0, -1, NaN, Infinity]) expect(laneHintOf([hint], distances, 1, left)).toBeNull()
    expect(laneHintOf([hint], [], 1, 100)).toBeNull()
    expect(laneHintOf([], distances, 1, 9000, hint)).toBeNull()
  })
  it('selects the nearest event, including straight-through lane decisions', () => {
    const second = { ...hint, node: 3, start: 2, end: 4 }
    expect(laneHintOf([hint, second], distances, 3, 8000)).toBe(hint)
    expect(laneHintOf([hint, second], distances, 4, 7500)).toBe(second)
  })
  it('accepts old hosts and rejects malformed, all-usable and single-lane hints', () => {
    expect(validLaneHints(undefined, 5)).toEqual([])
    expect(validLaneHints([hint], 5)).toEqual([hint])
    for (const broken of [
      null,
      { ...hint, start: -1 },
      { ...hint, end: 99 },
      { ...hint, lanes: hint.lanes.slice(0, 1) },
      { ...hint, lanes: hint.lanes.map((l) => ({ ...l, recommended: true })) },
      { ...hint, lanes: [{ directions: ['invented'], recommended: true }, hint.lanes[2]] },
      { ...hint, lanes: [{ directions: [], recommended: true }, hint.lanes[2]] },
    ]) {
      expect(validLaneHints([broken], 5)).toEqual([])
    }
  })
})
