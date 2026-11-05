import { useMemo } from 'react'
import { create } from 'zustand'
import {
  type BilibiliCommand,
  type BilibiliPlayback,
  type BilibiliVideo,
  isInHost,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'

export interface BilibiliState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  videos: BilibiliVideo[]
  playback: (BilibiliPlayback & { at: number }) | null
  nowPlaying: boolean
  volume: number
}

const IN_HOST = typeof window !== 'undefined' && isInHost()

const MOCK_VIDEOS: BilibiliVideo[] = [
  { bvid: 'BV1xx411c7mD', title: '【经典】甩葱歌 初音未来 高清重制', author: '初音未来官方', duration: 154 },
  { bvid: 'BV1GJ411x7h7', title: '【卡车司机的一天】驾驶斯堪尼亚穿越阿尔卑斯山脉', author: '欧卡达人', duration: 840 },
  { bvid: 'BV185411r7Kd', title: '周杰伦 经典金曲串烧 4K 60帧 车载无损', author: '音乐车道', duration: 1200 },
  { bvid: 'BV1t4411v7r5', title: '【4K沉浸式】雨夜长途驾驶 欧洲卡车模拟2 真实视听', author: 'SimDriver', duration: 1800 },
]

export const useBilibili = create<BilibiliState>(() => ({
  signedIn: IN_HOST ? null : false,
  signingIn: false,
  playing: false,
  videos: IN_HOST ? [] : MOCK_VIDEOS,
  playback: null,
  nowPlaying: false,
  volume: 1,
}))

function send(command: BilibiliCommand): void {
  if (isInHost()) postToHost({ type: 'bilibili', command })
}

export function sendStart(): void {
  send({ action: 'start' })
  send({ action: 'ask', id: 1, question: { ask: 'popular' } })
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
}

export function receiveState(signedIn: boolean | null, playing: boolean | null, signingIn: boolean): void {
  useBilibili.setState({ signedIn, playing, signingIn })
}

export function receiveAnswer(_id: number, failed?: boolean, _error?: string, videos?: BilibiliVideo[]): void {
  if (!failed && videos && videos.length > 0) {
    useBilibili.setState({ videos })
  }
}

export function receivePlayback(playback: BilibiliPlayback | null): void {
  useBilibili.setState({
    playback: playback ? { ...playback, at: performance.now() } : null,
    playing: playback ? playback.status === 'playing' : false,
    ...(playback ? {} : { nowPlaying: false }),
  })
}

export function positionOf(playback: BilibiliState['playback'], now: number): number {
  if (!playback) return 0
  const run = playback.status === 'playing' ? (now - playback.at) / 1000 : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

function show(change: Partial<BilibiliPlayback>): void {
  const { playback } = useBilibili.getState()
  if (!playback) return
  const now = performance.now()
  useBilibili.setState({
    playback: { ...playback, position: positionOf(playback, now), at: now, ...change },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

export function play(video?: BilibiliVideo): void {
  send({ action: 'play', video })
  if (video) {
    const now = performance.now()
    useBilibili.setState({
      playback: {
        title: video.title,
        artist: video.author,
        artwork: video.artwork,
        duration: video.duration || 300,
        position: 0,
        status: 'playing',
        at: now,
      },
      playing: true,
      nowPlaying: true,
    })
  } else {
    show({ status: 'playing' })
  }
}

export function playOrPause(): void {
  const { playing } = useBilibili.getState()
  if (playing) {
    send({ action: 'pause' })
    show({ status: 'paused' })
  } else {
    send({ action: 'play' })
    show({ status: 'playing' })
  }
}

export function skip(direction: 1 | -1): void {
  send({ action: direction === 1 ? 'next' : 'previous' })
}

export function seek(seconds: number): void {
  send({ action: 'seek', seconds })
  show({ position: Math.max(0, seconds) })
}

export function sendVolume(percent: number): void {
  useBilibili.setState({ volume: percent })
  send({ action: 'volume', percent: Math.round(percent * 100) })
}

export function setNowPlaying(open: boolean): void {
  useBilibili.setState({ nowPlaying: open })
}

export function useBilibiliSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useBilibili((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-bilibili',
        service: 'bilibili',
        title: playback.title,
        artist: playback.artist,
        album: 'Bilibili',
        artwork: playback.artwork ?? null,
        status: playback.status === 'playing' ? 'playing' : 'paused',
        positionMs: playback.position * 1000,
        positionAt: Date.now(),
        durationMs: playback.duration * 1000,
        controls: { playPause: true, next: true, previous: true, shuffle: false, repeat: false },
        shuffle: false,
        repeat: null,
      },
    }
  }, [playback])
}
