import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installUpdate, lookForUpdate, noteLines, onlineUpdatesEnabled, subscribeToUpdateOffers } from './update'
import { call, on } from './bridge'

// The app's line isn't there in a test (bridge.ts reads the page's address as it loads).
vi.mock('./bridge', () => ({ call: vi.fn(), on: vi.fn() }))

describe('noteLines', () => {
  it('takes the changelog’s list items, without their Markdown', () => {
    const notes = ['- Song lyrics on Now Playing.', '* **Fixed:** the map’s `zoom` on roundabouts.'].join('\n')
    expect(noteLines(notes)).toEqual(['Song lyrics on Now Playing.', 'Fixed: the map’s zoom on roundabouts.'])
  })

  it('leaves out what isn’t a list item: headings, blank lines, text between', () => {
    const notes = [
      '### Added',
      '',
      '- Song lyrics.',
      'Thanks to everyone who tried it.',
      '  - Indented, still one.',
    ].join('\r\n')
    expect(noteLines(notes)).toEqual(['Song lyrics.', 'Indented, still one.'])
  })

  it('joins an item the changelog wraps onto indented lines', () => {
    const notes = [
      '- With map mods, the route follows the mod’s own junctions and the',
      '  Maps app gives its turns there.',
      '- One line.',
    ].join('\r\n')
    expect(noteLines(notes)).toEqual([
      'With map mods, the route follows the mod’s own junctions and the Maps app gives its turns there.',
      'One line.',
    ])
  })

  it('has nothing for notes without a list', () => {
    expect(noteLines('')).toEqual([])
    expect(noteLines('First release.')).toEqual([])
  })
})

describe('domestic online update policy', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('never sends a lookup or installation command when disabled', async () => {
    vi.mocked(call).mockResolvedValue(false)
    await expect(lookForUpdate()).resolves.toBeNull()
    await expect(installUpdate()).rejects.toThrow('定制版暂不支持在线更新')
    expect(vi.mocked(call).mock.calls.map(([command]) => command)).toEqual([
      'online_updates_enabled',
      'online_updates_enabled',
    ])
  })

  it('subscribes to no update events and fetches no offers when disabled', async () => {
    vi.mocked(call).mockResolvedValue(false)
    const take = vi.fn()
    const stop = subscribeToUpdateOffers(take)
    await Promise.resolve()
    await Promise.resolve()
    stop()
    expect(on).not.toHaveBeenCalled()
    expect(take).not.toHaveBeenCalled()
    expect(call).toHaveBeenCalledExactlyOnceWith('online_updates_enabled')
  })

  it('fails closed if the policy command fails or returns a non-boolean', async () => {
    vi.mocked(call).mockRejectedValueOnce(new Error('old backend'))
    await expect(onlineUpdatesEnabled()).resolves.toBe(false)
    vi.mocked(call).mockResolvedValueOnce('true')
    await expect(onlineUpdatesEnabled()).resolves.toBe(false)
  })

  it('does not subscribe after the window closes during a policy lookup', async () => {
    let answer!: (value: boolean) => void
    vi.mocked(call).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    const stop = subscribeToUpdateOffers(vi.fn())
    stop()
    answer(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(on).not.toHaveBeenCalled()
    expect(call).toHaveBeenCalledTimes(1)
  })
})
