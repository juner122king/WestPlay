import { useMemo } from 'react'
import { create } from 'zustand'
import {
  type HongguoCommand,
  type HongguoDrama,
  type HongguoPlayback,
  isInHost,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'

export interface Hole {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

export interface HongguoState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  dramas: HongguoDrama[]
  currentDramaId: string | null
  currentEpisodeNumber: number
  speed: number
  autoNext: boolean
  playback: (HongguoPlayback & { at: number }) | null
  nowPlaying: boolean
  volume: number
  hole: Hole | null
}

const IN_HOST = typeof window !== 'undefined' && isInHost()

export const MOCK_HONGGUO_DRAMAS: HongguoDrama[] = [
  {
    id: 'hg_01',
    title: '绝品狂飙：重卡车神的逆袭',
    category: '都市热血',
    author: '红果短剧',
    cover: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80',
    totalEpisodes: 80,
    synopsis: '一代传奇车神隐退江湖成为普通货运司机，为守护车队再次握紧方向盘！',
  },
  {
    id: 'hg_02',
    title: '重生之我是物流大亨',
    category: '商战逆袭',
    author: '星火短剧',
    cover: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
    totalEpisodes: 60,
    synopsis: '重回三十年前，看穷小子如何从一辆破卡车起步，打造全球货运商业帝国！',
  },
  {
    id: 'hg_03',
    title: '公路之王：八百里秦川传奇',
    category: '公路冒险',
    author: '风驰影视',
    cover: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    totalEpisodes: 50,
    synopsis: '陕汽重卡穿行三秦大地，车轮滚滚书写货运男儿的豪情与坚守！',
  },
  {
    id: 'hg_04',
    title: '龙腾万里：重型挂车风云',
    category: '现代传奇',
    author: '极速传媒',
    cover: 'https://images.unsplash.com/photo-1508974239320-0a029497e820?auto=format&fit=crop&w=600&q=80',
    totalEpisodes: 72,
    synopsis: '十轮重卡纵横南北干线，面对重重阻难，誓保千万货品按时送达！',
  },
]

export const useHongguo = create<HongguoState>(() => ({
  signedIn: IN_HOST ? null : false,
  signingIn: false,
  playing: false,
  dramas: MOCK_HONGGUO_DRAMAS,
  currentDramaId: 'hg_01',
  currentEpisodeNumber: 1,
  speed: 1.0,
  autoNext: true,
  playback: null,
  nowPlaying: false,
  volume: 1,
  hole: null,
}))

function send(command: HongguoCommand): void {
  if (isInHost()) postToHost({ type: 'hongguo', command })
}

export function sendStart(): void {
  send({ action: 'start' })
  send({ action: 'ask', id: 1, question: { ask: 'catalog' } })
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
}

export function receiveState(signedIn: boolean | null, playing: boolean | null, signingIn: boolean): void {
  useHongguo.setState({ signedIn, playing, signingIn })
}

export function receiveAnswer(_id: number, failed?: boolean, _error?: string, dramas?: HongguoDrama[]): void {
  if (!failed && dramas && dramas.length > 0) {
    useHongguo.setState({ dramas })
  }
}

export function receivePlayback(playback: HongguoPlayback | null): void {
  useHongguo.setState({
    playback: playback ? { ...playback, at: performance.now() } : null,
    playing: playback ? playback.status === 'playing' : false,
    ...(playback ? {} : { nowPlaying: false }),
  })
}

export function positionOf(playback: HongguoState['playback'], now: number): number {
  if (!playback) return 0
  const speed = useHongguo.getState().speed || 1.0
  const run = playback.status === 'playing' ? ((now - playback.at) / 1000) * speed : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

function show(change: Partial<HongguoPlayback>): void {
  const { playback } = useHongguo.getState()
  if (!playback) return
  const now = performance.now()
  useHongguo.setState({
    playback: { ...playback, position: positionOf(playback, now), at: now, ...change },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

export function play(drama?: HongguoDrama, episodeNumber?: number): void {
  const currentDramas = useHongguo.getState().dramas
  const targetDrama =
    drama ?? (currentDramas.find((d) => d.id === useHongguo.getState().currentDramaId) || currentDramas[0])
  const ep = episodeNumber ?? useHongguo.getState().currentEpisodeNumber ?? 1

  send({ action: 'play', drama: targetDrama, episode: ep })
  if (targetDrama) {
    const now = performance.now()
    useHongguo.setState({
      currentDramaId: targetDrama.id,
      currentEpisodeNumber: ep,
      playback: {
        dramaId: targetDrama.id,
        title: `${targetDrama.title} · 第${ep}集`,
        dramaTitle: targetDrama.title,
        episodeTitle: `第${ep}集`,
        artist: targetDrama.author ?? '红果短剧',
        author: targetDrama.author ?? '红果短剧',
        artwork: targetDrama.cover,
        episode: ep,
        episodeNumber: ep,
        totalEpisodes: targetDrama.totalEpisodes,
        duration: 120,
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
  const { playing } = useHongguo.getState()
  if (playing) {
    send({ action: 'pause' })
    show({ status: 'paused' })
  } else {
    send({ action: 'play' })
    show({ status: 'playing' })
  }
}

export function skip(direction: 1 | -1): void {
  if (direction === 1) {
    send({ action: 'next' })
  } else {
    send({ action: 'previous' })
  }
}

export function selectEpisode(episode: number): void {
  send({ action: 'selectEpisode', episode })
  useHongguo.setState({ currentEpisodeNumber: episode })
}

export function seek(seconds: number): void {
  send({ action: 'seek', seconds })
  show({ position: Math.max(0, seconds) })
}

export function setSpeed(speed: number): void {
  useHongguo.setState({ speed })
  send({ action: 'setSpeed', speed })
}

export function setAutoNext(autoNext: boolean): void {
  useHongguo.setState({ autoNext })
}

export function sendVolume(percent: number): void {
  useHongguo.setState({ volume: percent })
  send({ action: 'volume', percent: Math.round(percent * 100) })
}

export function setNowPlaying(open: boolean): void {
  useHongguo.setState({ nowPlaying: open })
}

export function useHongguoSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useHongguo((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-hongguo',
        service: 'hongguo',
        title: playback.title,
        artist: playback.author ?? playback.artist ?? '红果短剧',
        album: '红果短剧',
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
