import { afterEach, describe, expect, it, vi } from 'vitest'
import { idleDisposal, MapResourceCache } from './idleResources'

afterEach(() => vi.useRealTimers())

describe('idle map disposal', () => {
  it('disposes once at 30 seconds, without extending repeated idle reports', () => {
    vi.useFakeTimers()
    const dispose = vi.fn()
    const resource = idleDisposal(dispose)
    resource.idle()
    vi.advanceTimersByTime(29_000)
    resource.idle()
    expect(dispose).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(dispose).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_000)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('cancels when a map host returns, and starts a fresh deadline on leaving', () => {
    vi.useFakeTimers()
    const dispose = vi.fn()
    const resource = idleDisposal(dispose)
    resource.idle()
    vi.advanceTimersByTime(29_000)
    resource.cancel()
    vi.advanceTimersByTime(30_000)
    expect(dispose).not.toHaveBeenCalled()
    resource.idle()
    vi.advanceTimersByTime(30_000)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})

describe('map version cache', () => {
  it('keeps the two most recently used versions and deduplicates pending requests', async () => {
    const cache = new MapResourceCache<string>()
    const fetcher = vi.fn(async () => 'map')
    const first = cache.load('a', fetcher)
    expect(cache.load('a', fetcher)).toBe(first)
    await first
    await cache.load('b', fetcher)
    await cache.load('a', fetcher)
    await cache.load('c', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(3)
    await cache.load('b', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('retries null and rejected requests, without deleting newer requests for an evicted key', async () => {
    const cache = new MapResourceCache<string>()
    await cache.load('a', async () => null)
    await cache.load('a', async () => {
      throw new Error('offline')
    })
    expect(await cache.load('a', async () => 'ok')).toBe('ok')
    let finish!: (value: string | null) => void
    const old = cache.load(
      'old',
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    await cache.load('b', async () => 'b')
    await cache.load('c', async () => 'c')
    const current = cache.load('old', async () => 'new')
    finish(null)
    await old
    expect(cache.load('old', async () => 'wrong')).toBe(current)
    expect(await current).toBe('new')
  })
})
