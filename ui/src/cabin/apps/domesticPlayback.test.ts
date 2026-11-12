import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PageMessage } from '../../shared/host'

const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0).reverse()) stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function players() {
  vi.useFakeTimers()
  const posted: PageMessage[] = []
  vi.stubGlobal('window', { chrome: { webview: { postMessage: (message: PageMessage) => posted.push(message) } } })
  const { useLive, useCabin } = await import('../state/store')
  const { oneAtATime } = await import('./oneAtATime')
  const { pauseMusicWithGame } = await import('./musicWithGame')
  const { postToHost } = await import('../../shared/host')
  const safari = await import('./safari/safari')
  const { safariPlayer } = await import('./safari/pauseWithGame')
  const { bilibiliPlayer } = await import('./bilibili/pauseWithGame')
  const { neteasePlayer } = await import('./netease/pauseWithGame')
  const { ximalayaPlayer } = await import('./ximalaya/pauseWithGame')
  const { douyinPlayer } = await import('./douyin/pauseWithGame')
  const { hongguoPlayer } = await import('./hongguo/pauseWithGame')
  const { useBilibili } = await import('./bilibili/bilibili')
  const { useNetease } = await import('./netease/netease')
  const { useXimalaya } = await import('./ximalaya/ximalaya')
  const { useDouyin } = await import('./douyin/douyin')
  const { useHongguo } = await import('./hongguo/hongguo')
  const domestic = {
    bilibili: { player: bilibiliPlayer, playing: (playing: boolean) => useBilibili.setState({ playing }) },
    netease: { player: neteasePlayer, playing: (playing: boolean) => useNetease.setState({ playing }) },
    ximalaya: { player: ximalayaPlayer, playing: (playing: boolean) => useXimalaya.setState({ playing }) },
    douyin: { player: douyinPlayer, playing: (playing: boolean) => useDouyin.setState({ playing }) },
    hongguo: { player: hongguoPlayer, playing: (playing: boolean) => useHongguo.setState({ playing }) },
  }
  useLive.setState({ gameShown: true, telemetry: null, menuGone: false })
  useCabin.setState({ power: { ...useCabin.getState().power, observed: false } })
  safari.receivePlaying(false)
  for (const app of Object.values(domestic)) app.playing(false)
  stops.push(oneAtATime([safariPlayer, ...Object.values(domestic).map((app) => app.player)]))
  return { posted, useLive, safari, safariPlayer, domestic, pauseMusicWithGame, postToHost }
}

describe('Safari with the domestic players', () => {
  it.each(['bilibili', 'netease', 'ximalaya', 'douyin', 'hongguo'] as const)(
    'pauses %s for Safari and Safari for it, without giving Safari an idle-resource generation',
    async (name) => {
      const p = await players()
      p.domestic[name].playing(true)
      p.safari.receivePlaying(true)
      expect(p.posted).toContainEqual({ type: name, command: { action: 'pause' } })
      p.domestic[name].playing(false)
      p.posted.length = 0
      p.domestic[name].playing(true)
      expect(p.posted).toContainEqual({ type: 'safari', command: { action: 'pause' } })
    },
  )

  it('pauses Safari with the game and resumes only the sound that the game paused', async () => {
    const p = await players()
    stops.push(p.pauseMusicWithGame(p.safariPlayer))
    p.safari.receivePlaying(true)
    p.useLive.setState({ gameShown: false })
    vi.advanceTimersByTime(600)
    expect(p.posted).toContainEqual({ type: 'safari', command: { action: 'pause' } })
    p.safari.receivePlaying(false)
    p.posted.length = 0
    p.useLive.setState({ gameShown: true })
    expect(p.posted).toContainEqual({ type: 'safari', command: { action: 'resume' } })
    expect(p.posted).not.toContainEqual(expect.objectContaining({ type: 'mediaActivity', app: 'safari' }))
  })

  it('does not resume Safari after the user pauses it while the game is away', async () => {
    const p = await players()
    stops.push(p.pauseMusicWithGame(p.safariPlayer))
    p.safari.receivePlaying(true)
    p.useLive.setState({ gameShown: false })
    vi.advanceTimersByTime(600)
    p.safari.receivePlaying(false)
    p.postToHost({ type: 'safari', command: { action: 'pause' } })
    p.posted.length = 0
    p.useLive.setState({ gameShown: true })
    expect(p.posted).not.toContainEqual({ type: 'safari', command: { action: 'resume' } })
  })

  it('cancels a pending Safari resume when a domestic player starts without a cab play command', async () => {
    const p = await players()
    stops.push(p.pauseMusicWithGame(p.safariPlayer))
    p.safari.receivePlaying(true)
    p.useLive.setState({ gameShown: false })
    vi.advanceTimersByTime(600)
    p.safari.receivePlaying(false)
    p.domestic.bilibili.playing(true)
    p.posted.length = 0
    p.useLive.setState({ gameShown: true })
    expect(p.posted).not.toContainEqual({ type: 'safari', command: { action: 'resume' } })
  })

  it('cancels a domestic player resume when sound starts from Safari web controls', async () => {
    const p = await players()
    stops.push(p.pauseMusicWithGame(p.domestic.bilibili.player))
    p.domestic.bilibili.playing(true)
    p.useLive.setState({ gameShown: false })
    vi.advanceTimersByTime(600)
    p.domestic.bilibili.playing(false)
    p.safari.receivePlaying(true)
    p.posted.length = 0
    p.useLive.setState({ gameShown: true })
    expect(p.posted).not.toContainEqual({ type: 'bilibili', command: { action: 'play' } })
  })

  it('keeps the automatic resume fade when a domestic player reports playback synchronously', async () => {
    const p = await players()
    stops.push(p.pauseMusicWithGame(p.domestic.bilibili.player))
    p.domestic.bilibili.playing(true)
    const volume = p.domestic.bilibili.player.volume()
    p.useLive.setState({ gameShown: false })
    vi.advanceTimersByTime(600)
    expect(p.domestic.bilibili.player.playingHere()).toBe(false)
    p.posted.length = 0
    p.useLive.setState({ gameShown: true })
    vi.advanceTimersByTime(400)
    expect(p.domestic.bilibili.player.playingHere()).toBe(true)
    const levels = p.posted.filter((message) => message.type === 'bilibili' && message.command.action === 'volume')
    expect(levels.at(-1)).toEqual({ type: 'bilibili', command: { action: 'volume', percent: volume } })
  })
})
