import { useMemo } from 'react'
import { create } from 'zustand'
import {
  type DouyinCommand,
  type DouyinPlayback,
  type DouyinVideo,
  isInHost,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'

export interface DouyinState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  videos: DouyinVideo[]
  currentVideoIndex: number
  playback: (DouyinPlayback & { at: number }) | null
  nowPlaying: boolean
  volume: number
  liked: Record<string, boolean>
}

const IN_HOST = typeof window !== 'undefined' && isInHost()

export const MOCK_DOUYIN_VIDEOS: DouyinVideo[] = [
  {
    id: 'dy_01',
    title: '【川藏线纪实】开着重卡翻越折多山，这就是卡车司机的浪漫！',
    author: '老张聊重卡',
    duration: 180,
    likes: 45200,
    comments: 2890,
    music: '老张聊重卡创作的原声 - 征服群山',
  },
  {
    id: 'dy_02',
    title: '卡车司机夜间行车必备提神神曲！听完精力充沛，一路平安！',
    author: '车载DJ音乐坊',
    duration: 240,
    likes: 128000,
    comments: 8520,
    music: '车载DJ狂热电音 - 超强低音车载重低音',
  },
  {
    id: 'dy_03',
    title: '【沉浸式驾驶】雨夜斯堪尼亚V8长途货运，窗外雨声好治愈',
    author: '欧卡漫游指南',
    duration: 420,
    likes: 89300,
    comments: 3410,
    music: '公路漫游者 - 雨夜呢喃',
  },
  {
    id: 'dy_04',
    title: '新疆独库公路重卡实拍，沿途大好河山美到窒息！',
    author: '西域老司机',
    duration: 210,
    likes: 96400,
    comments: 4120,
    music: '西域风情 - 苍茫戈壁长调',
  },
]

export const useDouyin = create<DouyinState>(() => ({
  signedIn: IN_HOST ? null : false,
  signingIn: false,
  playing: false,
  videos: MOCK_DOUYIN_VIDEOS,
  currentVideoIndex: 0,
  playback: null,
  nowPlaying: false,
  volume: 1,
  liked: {},
}))

function send(command: DouyinCommand): void {
  if (isInHost()) postToHost({ type: 'douyin', command })
}

export function sendStart(): void {
  send({ action: 'start' })
  send({ action: 'ask', id: 1, question: { ask: 'feed' } })
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
}

export function receiveState(signedIn: boolean | null, playing: boolean | null, signingIn: boolean): void {
  useDouyin.setState({ signedIn, playing, signingIn })
}

export function receiveAnswer(_id: number, failed?: boolean, _error?: string, videos?: DouyinVideo[]): void {
  if (!failed && videos && videos.length > 0) {
    useDouyin.setState({ videos })
  }
}

export function receivePlayback(playback: DouyinPlayback | null): void {
  useDouyin.setState({
    playback: playback ? { ...playback, at: performance.now() } : null,
    playing: playback ? playback.status === 'playing' : false,
    ...(playback ? {} : { nowPlaying: false }),
  })
}

export function positionOf(playback: DouyinState['playback'], now: number): number {
  if (!playback) return 0
  const run = playback.status === 'playing' ? (now - playback.at) / 1000 : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

function show(change: Partial<DouyinPlayback>): void {
  const { playback } = useDouyin.getState()
  if (!playback) return
  const now = performance.now()
  useDouyin.setState({
    playback: { ...playback, position: positionOf(playback, now), at: now, ...change },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

export function play(video?: DouyinVideo, index?: number): void {
  const currentVideos = useDouyin.getState().videos
  const targetVideo = video ?? (currentVideos.length > 0 ? currentVideos[0] : undefined)
  const targetIndex = index ?? (targetVideo ? currentVideos.findIndex((v) => v.id === targetVideo.id) : 0)

  send({ action: 'play', video: targetVideo })
  if (targetVideo) {
    const now = performance.now()
    useDouyin.setState({
      currentVideoIndex: Math.max(0, targetIndex),
      playback: {
        id: targetVideo.id,
        title: targetVideo.title,
        artist: targetVideo.author,
        author: targetVideo.author,
        artwork: targetVideo.artwork,
        duration: targetVideo.duration || 180,
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
  const { playing } = useDouyin.getState()
  if (playing) {
    send({ action: 'pause' })
    show({ status: 'paused' })
  } else {
    send({ action: 'play' })
    show({ status: 'playing' })
  }
}

export function skip(direction: 1 | -1): void {
  const { videos, currentVideoIndex } = useDouyin.getState()
  if (videos.length === 0) return
  const nextIndex = (currentVideoIndex + direction + videos.length) % videos.length
  play(videos[nextIndex], nextIndex)
}

export function seek(seconds: number): void {
  send({ action: 'seek', seconds })
  show({ position: Math.max(0, seconds) })
}

export function sendVolume(percent: number): void {
  useDouyin.setState({ volume: percent })
  send({ action: 'volume', percent: Math.round(percent * 100) })
}

export function toggleLike(id?: string): void {
  const { playback, liked } = useDouyin.getState()
  const targetId = id ?? playback?.id
  if (!targetId) return
  const nextLiked = !liked[targetId]
  useDouyin.setState({
    liked: { ...liked, [targetId]: nextLiked },
  })
  send({ action: 'like', id: targetId })
}

export function setNowPlaying(open: boolean): void {
  useDouyin.setState({ nowPlaying: open })
}

export function useDouyinSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useDouyin((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-douyin',
        service: 'douyin',
        title: playback.title,
        artist: playback.author ?? playback.artist,
        album: '抖音短视频',
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
