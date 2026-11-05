import { useMemo } from 'react'
import { create } from 'zustand'
import {
  isInHost,
  postToHost,
  type XimalayaAlbum,
  type XimalayaCommand,
  type XimalayaPlayback,
  type XimalayaTrack,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'

export interface XimalayaState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  tracks: XimalayaTrack[]
  albums: XimalayaAlbum[]
  playback: (XimalayaPlayback & { at: number }) | null
  nowPlaying: boolean
  volume: number
}

const IN_HOST = typeof window !== 'undefined' && isInHost()

const MOCK_TRACKS: XimalayaTrack[] = [
  { id: '101', title: '三体（全集有声剧）精选片段', artist: '喜马拉雅有声剧团', album: '三体', duration: 1800 },
  { id: '102', title: '郭德纲于谦 相声精选集', artist: '德云社', album: '经典相声', duration: 1500 },
  { id: '103', title: '明朝那些事儿（白话历史巨作）', artist: '当年明月 原著', album: '历史风云', duration: 2100 },
  { id: '104', title: '深夜车载电台：伴你漫漫长夜驾驶', artist: '喜马车电台', album: '晚安公路', duration: 2400 },
]

export const useXimalaya = create<XimalayaState>(() => ({
  signedIn: IN_HOST ? null : false,
  signingIn: false,
  playing: false,
  tracks: IN_HOST ? [] : MOCK_TRACKS,
  albums: [],
  playback: null,
  nowPlaying: false,
  volume: 1,
}))

function send(command: XimalayaCommand): void {
  if (isInHost()) postToHost({ type: 'ximalaya', command })
}

export function sendStart(): void {
  send({ action: 'start' })
  send({ action: 'ask', id: 1, question: { ask: 'recommend' } })
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
}

export function receiveState(signedIn: boolean | null, playing: boolean | null, signingIn: boolean): void {
  useXimalaya.setState({ signedIn, playing, signingIn })
}

export function receiveAnswer(
  _id: number,
  failed?: boolean,
  _error?: string,
  tracks?: XimalayaTrack[],
  albums?: XimalayaAlbum[],
): void {
  if (!failed) {
    if (tracks && tracks.length > 0) useXimalaya.setState({ tracks })
    if (albums && albums.length > 0) useXimalaya.setState({ albums })
  }
}

export function receivePlayback(playback: XimalayaPlayback | null): void {
  useXimalaya.setState({
    playback: playback ? { ...playback, at: performance.now() } : null,
    playing: playback ? playback.status === 'playing' : false,
    ...(playback ? {} : { nowPlaying: false }),
  })
}

export function positionOf(playback: XimalayaState['playback'], now: number): number {
  if (!playback) return 0
  const run = playback.status === 'playing' ? (now - playback.at) / 1000 : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

function show(change: Partial<XimalayaPlayback>): void {
  const { playback } = useXimalaya.getState()
  if (!playback) return
  const now = performance.now()
  useXimalaya.setState({
    playback: { ...playback, position: positionOf(playback, now), at: now, ...change },
    ...(change.status ? { playing: change.status === 'playing' } : {}),
  })
}

export function play(track?: XimalayaTrack): void {
  send({ action: 'play', track })
  if (track) {
    const now = performance.now()
    useXimalaya.setState({
      playback: {
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        duration: track.duration || 1800,
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
  const { playing } = useXimalaya.getState()
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
  useXimalaya.setState({ volume: percent })
  send({ action: 'volume', percent: Math.round(percent * 100) })
}

export function setNowPlaying(open: boolean): void {
  useXimalaya.setState({ nowPlaying: open })
}

export function useXimalayaSource(): { source: MediaSource; artwork: string | null } | null {
  const playback = useXimalaya((s) => s.playback)
  return useMemo(() => {
    if (!playback) return null
    return {
      artwork: playback.artwork ?? null,
      source: {
        id: 'westplay-ximalaya',
        service: 'ximalaya',
        title: playback.title,
        artist: playback.artist,
        album: '喜马拉雅FM',
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
