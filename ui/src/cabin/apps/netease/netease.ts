import { useMemo } from 'react'
import { create } from 'zustand'
import {
  isInHost,
  type NeteaseCommand,
  type NeteasePlayback,
  type NeteasePlaylist,
  type NeteaseTrack,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'

export type NeteaseTab = 'hot' | 'soar' | 'new' | 'my' | 'search'

export interface NeteaseState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  tracks: NeteaseTrack[]
  playlists: NeteasePlaylist[]
  currentPlaylist: NeteasePlaylist | null
  tab: NeteaseTab
  searchQuery: string
  loading: boolean
  playback: (NeteasePlayback & { at: number }) | null
  nowPlaying: boolean
  volume: number
  lyrics?: string
}

const IN_HOST = typeof window !== 'undefined' && isInHost()

const MOCK_TRACKS: NeteaseTrack[] = [
  {
    id: '186016',
    title: '晴天',
    artist: '周杰伦',
    album: '叶惠美',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 269,
  },
  {
    id: '347230',
    title: '海阔天空',
    artist: 'Beyond',
    album: '乐与怒',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 326,
  },
  {
    id: '1330348068',
    title: '起风了',
    artist: '买辣椒也用券',
    album: '起风了',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 325,
  },
  {
    id: '28815250',
    title: '平凡之路',
    artist: '朴树',
    album: '猎户星座',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 301,
  },
  {
    id: '185906',
    title: '夜曲',
    artist: '周杰伦',
    album: '十一月的萧邦',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 226,
  },
]

export const useNetease = create<NeteaseState>(() => ({
  signedIn: IN_HOST ? null : false,
  signingIn: false,
  playing: false,
  tracks: MOCK_TRACKS,
  playlists: [],
  currentPlaylist: null,
  tab: 'hot',
  searchQuery: '',
  loading: false,
  playback: null,
  nowPlaying: false,
  volume: 1,
}))

function send(command: NeteaseCommand): void {
  if (isInHost()) postToHost({ type: 'netease', command })
}

export function sendStart(): void {
  send({ action: 'start' })
  send({ action: 'ask', id: 1, question: { ask: 'top' } })
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
}

export function selectTab(tab: NeteaseTab): void {
  useNetease.setState({ tab, currentPlaylist: null })
  if (tab === 'hot') {
    useNetease.setState({ loading: true })
    send({ action: 'ask', id: 1, question: { ask: 'chart', id: '3778678' } })
  } else if (tab === 'soar') {
    useNetease.setState({ loading: true })
    send({ action: 'ask', id: 2, question: { ask: 'chart', id: '19723756' } })
  } else if (tab === 'new') {
    useNetease.setState({ loading: true })
    send({ action: 'ask', id: 3, question: { ask: 'chart', id: '3779629' } })
  } else if (tab === 'my') {
    useNetease.setState({ loading: true })
    send({ action: 'ask', id: 4, question: { ask: 'userPlaylists' } })
  }
}

export function searchSongs(query: string): void {
  if (!query.trim()) return
  useNetease.setState({ loading: true, searchQuery: query })
  send({ action: 'ask', id: 10, question: { ask: 'search', query: query.trim() } })
}

export function selectPlaylist(playlist: NeteasePlaylist): void {
  useNetease.setState({ loading: true, currentPlaylist: playlist })
  send({ action: 'ask', id: 20, question: { ask: 'playlistTracks', playlistId: playlist.id } })
}

export function backToPlaylists(): void {
  useNetease.setState({ currentPlaylist: null })
}

export function receiveState(signedIn: boolean | null, playing: boolean | null, signingIn: boolean): void {
  useNetease.setState({ signedIn, playing, signingIn })
  if (useNetease.getState().tracks.length <= 5) {
    send({ action: 'ask', id: 1, question: { ask: 'top' } })
  }
}

export function receiveAnswer(
  _id: number,
  failed?: boolean,
  _error?: string,
  songs?: NeteaseTrack[],
  playlists?: NeteasePlaylist[],
  lyric?: string,
): void {
  if (!failed) {
    if (songs) useNetease.setState({ tracks: songs, loading: false })
    if (playlists) useNetease.setState({ playlists, loading: false })
    if (lyric) useNetease.setState({ lyrics: lyric })
  } else {
    useNetease.setState({ loading: false })
  }
}

export function receivePlayback(playback: NeteasePlayback | null): void {
  useNetease.setState({
    playback: playback ? { ...playback, at: performance.now() } : null,
    playing: playback ? playback.status === 'playing' : false,
    ...(playback ? {} : { nowPlaying: false }),
  })
}

export function positionOf(playback: NeteaseState['playback'], now: number): number {
  if (!playback) return 0
  const run = playback.status === 'playing' ? (now - playback.at) / 1000 : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

function show(change: Partial<NeteasePlayback>): void {
  const { playback } = useNetease.getState()
  if (!playback) return
  const now = performance.now()
  useNetease.setState({
    playback: { ...playback, position: positionOf(playback, now), at: now, ...change },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

export function play(track?: NeteaseTrack): void {
  send({ action: 'play', track })
  if (track) {
    const now = performance.now()
    useNetease.setState({
      playback: {
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        duration: track.duration || 240,
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
  const { playing } = useNetease.getState()
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
  useNetease.setState({ volume: percent })
  send({ action: 'volume', percent: Math.round(percent * 100) })
}

export function setNowPlaying(open: boolean): void {
  useNetease.setState({ nowPlaying: open })
}

export function useNeteaseSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useNetease((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-netease',
        service: 'netease',
        title: playback.title,
        artist: playback.artist,
        album: '网易云音乐',
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
