import { describe, expect, it } from 'vitest'
import { MediaGenerations } from './mediaGeneration'

describe('media instance messages', () => {
  it('rejects reports while absent and from an older generation after reopening', () => {
    const pages = new MediaGenerations()
    expect(pages.accept({ type: 'mediaResource', app: 'bilibili', generation: 1, resident: true })).toBe(true)
    expect(pages.generation('bilibili')).toBe(1)
    expect(pages.accept({ type: 'bilibiliPlayback', generation: 1 })).toBe(true)
    pages.accept({ type: 'mediaResource', app: 'bilibili', generation: 1, resident: false })
    expect(pages.accept({ type: 'bilibiliAnswer', generation: 1 })).toBe(false)
    expect(pages.generation('bilibili')).toBeUndefined()
    pages.accept({ type: 'mediaResource', app: 'bilibili', generation: 2, resident: true })
    expect(pages.accept({ type: 'bilibiliPlayback', generation: 1 })).toBe(false)
    expect(pages.accept({ type: 'mediaResource', app: 'bilibili', generation: 1, resident: false })).toBe(false)
    expect(pages.accept({ type: 'bilibiliPlayback', generation: 2 })).toBe(true)
  })

  it('leaves other platforms and non-media telemetry independent', () => {
    const pages = new MediaGenerations()
    pages.accept({ type: 'mediaResource', app: 'youtube', generation: 1, resident: false })
    expect(pages.accept({ type: 'telemetry' })).toBe(true)
    expect(pages.accept({ type: 'appleMusicPlayback', generation: 4 })).toBe(true)
  })
})
