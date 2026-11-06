import { describe, expect, it } from 'vitest'
import { type NowPlayingSource, shownSource } from './nowPlaying'

const none: Record<NowPlayingSource, boolean> = {
  video: false,
  netease: false,
  bilibili: false,
  ximalaya: false,
  douyin: false,
  hongguo: false,
  appleMusic: false,
  player: false,
}
const only = (...sources: NowPlayingSource[]) => ({ ...none, ...Object.fromEntries(sources.map((s) => [s, true])) })

describe("the Dashboard's Now Playing", () => {
  it('shows what plays, the video first when two do', () => {
    expect(shownSource(only('appleMusic'), only('video', 'appleMusic'), null)).toBe('appleMusic')
    expect(shownSource(only('video', 'appleMusic'), only('video', 'appleMusic'), null)).toBe('video')
  })

  it('keeps the song between two songs, not the paused video under it', () => {
    // Apple Music played; for a moment between songs nothing plays, and a paused video is there.
    expect(shownSource(none, only('video', 'appleMusic'), 'appleMusic')).toBe('appleMusic')
  })

  it('shows what played last once it is paused, while it still has something', () => {
    expect(shownSource(none, only('video', 'netease'), 'netease')).toBe('netease')
    // Gone (signed out, say): the first that has something.
    expect(shownSource(none, only('video'), 'netease')).toBe('video')
  })

  it('shows the first that has something when nothing has played, and Not Playing with nothing at all', () => {
    expect(shownSource(none, only('netease', 'bilibili'), null)).toBe('netease')
    expect(shownSource(none, none, null)).toBeNull()
    expect(shownSource(none, none, 'netease')).toBeNull()
  })
})
