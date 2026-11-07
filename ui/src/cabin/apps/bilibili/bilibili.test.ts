import { beforeEach, describe, expect, it } from 'vitest'
import {
  ask,
  positionOf,
  receivePlayback,
  stopVideo,
  useBilibili,
} from './bilibili'

describe('Bilibili app state and functions', () => {
  beforeEach(() => {
    useBilibili.setState({
      playback: null,
      current: null,
      playing: false,
      open: false,
      returnToPlayer: false,
    })
  })

  it('provides distinct movie lists for different seasonType categories in preview', async () => {
    const movieRes = await ask({ ask: 'movie', seasonType: 2 })
    expect(movieRes.movies).toBeDefined()
    expect(movieRes.movies!.length).toBeGreaterThan(0)
    expect(movieRes.movies![0].title).toBe('剧场版 咒术回战 0')

    const tvRes = await ask({ ask: 'movie', seasonType: 5 })
    expect(tvRes.movies).toBeDefined()
    expect(tvRes.movies![0].title).toBe('非自然死亡')

    const docRes = await ask({ ask: 'movie', seasonType: 3 })
    expect(docRes.movies).toBeDefined()
    expect(docRes.movies![0].title).toBe('守护解放西')

    const varietyRes = await ask({ ask: 'movie', seasonType: 7 })
    expect(varietyRes.movies).toBeDefined()
    expect(varietyRes.movies![0].title).toBe('非正式会谈 第7季')

    const animeRes = await ask({ ask: 'movie', seasonType: 1 })
    expect(animeRes.movies).toBeDefined()
    expect(animeRes.movies![0].title).toBe('鬼灭之刃 游郭篇')
  })

  it('stops video and resets all playback state on stopVideo', () => {
    useBilibili.setState({
      current: { bvid: 'BV1xx411c7mD', title: 'Test', author: 'UP', duration: 100 },
      playback: {
        bvid: 'BV1xx411c7mD',
        title: 'Test',
        artist: 'UP',
        duration: 100,
        position: 10,
        status: 'playing',
        at: performance.now(),
      },
      playing: true,
      open: true,
    })

    stopVideo()

    const state = useBilibili.getState()
    expect(state.playback).toBeNull()
    expect(state.current).toBeNull()
    expect(state.playing).toBe(false)
    expect(state.open).toBe(false)
  })

  it('does not resurrect playback when current is null and received playback is paused', () => {
    useBilibili.setState({
      current: null,
      playback: null,
    })

    receivePlayback({
      bvid: 'BV1xx411c7mD',
      title: 'Paused Video',
      artist: 'UP',
      duration: 120,
      position: 10,
      status: 'paused',
    })

    expect(useBilibili.getState().playback).toBeNull()
    expect(useBilibili.getState().current).toBeNull()
  })

  it('clears playback when receiving null playback', () => {
    useBilibili.setState({
      current: { bvid: 'BV1', title: 'Test', author: 'UP', duration: 100 },
      playback: {
        bvid: 'BV1',
        title: 'Test',
        artist: 'UP',
        duration: 100,
        position: 10,
        status: 'playing',
        at: performance.now(),
      },
      playing: true,
    })

    receivePlayback(null)

    expect(useBilibili.getState().playback).toBeNull()
    expect(useBilibili.getState().playing).toBe(false)
  })

  it('calculates playback position properly', () => {
    const now = 5000
    const playback = {
      bvid: 'BV1',
      title: 'Test',
      artist: 'UP',
      duration: 100,
      position: 10,
      status: 'playing',
      at: now,
    }
    expect(positionOf(playback, now + 2000)).toBe(12)

    const pausedPlayback = { ...playback, status: 'paused' }
    expect(positionOf(pausedPlayback, now + 2000)).toBe(10)
  })
})
