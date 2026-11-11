import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PageMessage } from '../../shared/host'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function setup() {
  vi.useFakeTimers()
  const messages: PageMessage[] = []
  vi.stubGlobal('window', { chrome: { webview: { postMessage: (message: PageMessage) => messages.push(message) } } })
  const { postToHost } = await import('../../shared/host')
  const { useLive, useCabin } = await import('../state/store')
  const { pauseMusicWithGame } = await import('./musicWithGame')
  useLive.setState({ gameShown: true, telemetry: null })
  useCabin.setState({ power: { ...useCabin.getState().power, observed: true, phase: 'on' } })
  let playing = true
  const resume = vi.fn(() => {
    playing = true
    postToHost({ type: 'bilibili', command: { action: 'play' } })
  })
  const stop = pauseMusicWithGame({
    name: 'bilibili',
    playingHere: () => playing,
    pauseHere: () => {
      playing = false
      postToHost({ type: 'bilibili', command: { action: 'pause' } })
    },
    resumeHere: resume,
    volume: () => null,
    sendVolume: () => {},
    setVolume: () => {},
    skip: () => {},
    subscribe: () => () => {},
  })
  return { messages, postToHost, useLive, useCabin, resume, stop }
}

describe('idle protection during game pauses', () => {
  it('protects an automatically paused player for more than 30 seconds and resumes it', async () => {
    const { messages, useLive, resume, stop } = await setup()
    useLive.setState({ gameShown: false })
    expect(messages).toContainEqual({ type: 'mediaActivity', app: 'bilibili', resumePending: true })
    vi.advanceTimersByTime(31_000)
    expect(messages.filter((message) => message.type === 'mediaActivity')).toEqual([
      { type: 'mediaActivity', app: 'bilibili', resumePending: true },
    ])
    useLive.setState({ gameShown: true })
    expect(resume).toHaveBeenCalledTimes(1)
    expect(messages).toContainEqual({ type: 'mediaActivity', app: 'bilibili', resumePending: false })
    stop()
  })

  it('cancels pending resume on an explicit user pause', async () => {
    const { messages, useLive, postToHost, resume, stop } = await setup()
    useLive.setState({ gameShown: false })
    postToHost({ type: 'bilibili', command: { action: 'pause' } })
    expect(messages).toContainEqual({ type: 'mediaActivity', app: 'bilibili', resumePending: false })
    useLive.setState({ gameShown: true })
    expect(resume).not.toHaveBeenCalled()
    stop()
  })

  it('cancels pending resume when another app is played or the truck powers off', async () => {
    const { useLive, useCabin, postToHost, resume, stop } = await setup()
    useLive.setState({ gameShown: false })
    postToHost({ type: 'youtube', command: { action: 'load', video: 'new' } })
    useLive.setState({ gameShown: true })
    expect(resume).not.toHaveBeenCalled()
    useCabin.setState({ power: { ...useCabin.getState().power, phase: 'off' } })
    expect(resume).not.toHaveBeenCalled()
    stop()
  })
})
