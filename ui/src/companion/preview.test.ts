import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostStatus } from './useHostStatus'
import type { Settings } from './useSettings'

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubGlobal('location', { search: '?update&ats' })
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('domestic companion preview', () => {
  it('does not offer upstream updates even with the legacy update query parameter', async () => {
    const preview = await import('./preview')
    const enabled = preview.answer('online_updates_enabled')
    const offer = preview.answer('update_offer')
    const lookup = preview.answer('look_for_update')
    await vi.advanceTimersByTimeAsync(300)
    expect(await enabled).toBe(false)
    expect(await offer).toBeNull()
    expect(await lookup).toBeNull()
    await expect(preview.answer('install_update')).rejects.toThrow('定制版暂不支持在线更新')
  })

  it('provides domestic account fields alongside the new map folder fields and defaults', async () => {
    const preview = await import('./preview')
    const take = vi.fn()
    const stop = preview.subscribe('host-status', take)
    const pending = preview.answer('get_settings')
    await vi.advanceTimersByTimeAsync(300)
    const settings = (await pending) as Settings
    expect(settings.map.fast).toBe(false)
    const status = take.mock.calls[0][0] as HostStatus
    for (const service of ['bilibili', 'netease', 'ximalaya', 'douyin', 'hongguo']) {
      expect(status).toHaveProperty(service + 'SignedIn')
      expect(status).toHaveProperty(service + 'SigningIn')
    }
    expect(status.profileMaps.length).toBeGreaterThan(0)
    for (const map of status.profileMaps) expect(map.folder).toBeTruthy()
    stop()
  })
})
