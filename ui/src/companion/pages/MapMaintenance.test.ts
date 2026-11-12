import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapMaintenance } from './MapMaintenance'
import { pending as preparationPending } from '../mapRound'
import { companionWords } from './words'
import type { HostStatus, ProfileMap } from '../useHostStatus'
import type { Settings, SettingsState } from '../useSettings'
vi.mock('../bridge', () => ({ call: vi.fn(), on: vi.fn(), IN_APP: false, PREVIEW_TUTORIAL: null }))

function render(map: Partial<ProfileMap>, settings?: SettingsState) {
  const status = {
    profileMaps: [
      {
        game: 'ats',
        dir: 'profiles/a',
        name: 'Driver A',
        target: 'ats:profiles/a',
        folder: 'usa-1',
        status: { state: 'notPrepared' },
        ...map,
      },
    ],
  } as HostStatus
  const state = settings ?? {
    settings: { map: { buildings: true, roads: true, fast: false } } as unknown as Settings,
    update: vi.fn(),
    error: null,
  }
  return renderToStaticMarkup(createElement(MapMaintenance, { status, settings: state, cw: companionWords('zh_cn') }))
}
describe('selective map preparation', () => {
  it('defaults both game and profile switches off and offers prepare once', () => {
    const html = render({})
    expect(html.match(/aria-checked="false"/g)).toHaveLength(2)
    expect(html).toContain('准备一次')
    expect(html).toContain('尚未准备地图')
    expect(html).not.toContain('ob-spinner')
  })
  it('shows legacy initialization and retains independent profile choice', () => {
    const state = {
      settings: {
        map: { maintenance: { games: { ats: false }, profiles: { 'ats:profiles/a': true } } },
      } as unknown as Settings,
      update: vi.fn(),
      error: null,
    }
    const html = render({ status: { state: 'unverified' } }, state)
    expect(html).toContain('首次需手动准备一次')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-checked="false"')
  })
  it('offers cancellation only for a pending task and shows cancelled as idle', () => {
    expect(render({ status: { state: 'queued' }, taskId: 'task-1' })).toContain('取消任务')
    const cancelled = render({ status: { state: 'cancelled' }, taskId: 'old' })
    expect(cancelled).toContain('相同输入不会自动重试')
    expect(cancelled).not.toContain('>取消任务<')
  })
  it('counts checking and actual work as pending, excluding disabled/idle caches', () => {
    for (const state of ['checking', 'queued', 'building', 'waitingForGame', 'waitingForMemory'])
      expect(preparationPending({ state } as ProfileMap['status'])).toBe(true)
    for (const state of ['notPrepared', 'unverified', 'stale', 'cancelled', 'ready'])
      expect(preparationPending({ state } as ProfileMap['status'])).toBe(false)
  })
})
