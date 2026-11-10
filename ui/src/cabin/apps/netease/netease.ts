import { useMemo } from 'react'
import { create } from 'zustand'
import {
  isInHost,
  type NeteaseCommand,
  type NeteasePlayback,
  type NeteasePlaylist,
  type NeteaseQuestion,
  type NeteaseTrack,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'

export type NeteaseTab = 'recommend' | 'discover' | 'roaming' | 'my' | 'search'
export type NeteasePlayMode = 'loop' | 'shuffle' | 'single'

export interface UserProfile {
  nickname: string
  avatarUrl?: string
  vipDays?: number
  vipType?: number
}

export interface PlaybackNotice {
  trackId: string
  title: string
  reason: 'vip_required' | 'unavailable'
  skippedTo?: string
}

export interface NeteaseState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  tracks: NeteaseTrack[]
  playlists: NeteasePlaylist[]
  recommendedPlaylists: NeteasePlaylist[]
  currentPlaylist: NeteasePlaylist | null
  tab: NeteaseTab
  discoverChartId: string
  searchQuery: string
  loading: boolean
  playback: (NeteasePlayback & { at: number }) | null
  playbackNotice: PlaybackNotice | null
  nowPlaying: boolean // Fullscreen / expanded turntable player
  volume: number
  lyrics?: string
  playMode: NeteasePlayMode
  queue: NeteaseTrack[]
  queueIndex: number
  queueOpen: boolean
  likedTrackIds: string[]
  userProfile: UserProfile | null
}

const IN_HOST = typeof window !== 'undefined' && isInHost()

export const MOCK_TRACKS: NeteaseTrack[] = [
  {
    id: '186016',
    title: '晴天',
    artist: '周杰伦',
    album: '叶惠美',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 269,
    fee: 0,
    playable: false,
  },
  {
    id: '1413585838',
    title: '迷恋',
    artist: '梅卡德尔',
    album: '狗叫空间',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 215,
    fee: 1,
    playable: true,
  },
  {
    id: '347230',
    title: '海阔天空',
    artist: 'Beyond',
    album: '乐与怒',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 326,
    fee: 1,
    playable: true,
  },
  {
    id: '1330348068',
    title: '起风了',
    artist: '买辣椒也用券',
    album: '起风了',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 325,
    fee: 8,
    playable: true,
  },
  {
    id: '28815250',
    title: '平凡之路',
    artist: '朴树',
    album: '猎户星座',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 301,
    fee: 1,
    playable: true,
  },
  {
    id: '185906',
    title: '夜曲',
    artist: '周杰伦',
    album: '十一月的萧邦',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 226,
    fee: 0,
    playable: false,
  },
  {
    id: '1901371647',
    title: '漠河舞厅',
    artist: '柳爽',
    album: '1st.星球',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 312,
    fee: 1,
    playable: true,
  },
]

export const MOCK_RECOMMENDED_PLAYLISTS: NeteasePlaylist[] = [
  {
    id: '3778678',
    name: '云音乐热歌榜 · 实时精选',
    coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
    trackCount: 200,
    playCount: 1845000,
  },
  {
    id: '19723756',
    name: '云音乐飙升榜 · 全网热播',
    coverImgUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
    trackCount: 100,
    playCount: 923000,
  },
  {
    id: '8877118200',
    name: '车载重低音 · 长途提神专属',
    coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    trackCount: 60,
    playCount: 409300,
  },
  {
    id: '2298267009',
    name: '公路民谣 · 属于行者的故事',
    coverImgUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
    trackCount: 93,
    playCount: 5679866,
  },
  {
    id: '5460985377',
    name: '经典欧美摇滚 · 蓝调律动',
    coverImgUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=400&q=80',
    trackCount: 69,
    playCount: 1408414,
  },
  {
    id: '2884035',
    name: '云音乐原创榜 · 独立新声',
    coverImgUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=400&q=80',
    trackCount: 100,
    playCount: 624492,
  },
]

export const DEFAULT_USER_PLAYLISTS: NeteasePlaylist[] = [
  {
    id: 'user_liked',
    name: '我喜欢的音乐',
    coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    trackCount: 7,
    playCount: 1280,
    subscribed: false,
  },
  {
    id: 'user_car_fav',
    name: '车载精选私藏',
    coverImgUrl: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=400&q=80',
    trackCount: 5,
    playCount: 420,
    subscribed: false,
  },
  {
    id: 'user_highway',
    name: '公路自驾经典电台',
    coverImgUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80',
    trackCount: 5,
    playCount: 890,
    subscribed: true,
  },
  {
    id: 'user_night_drive',
    name: '深夜漫摇微醺',
    coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
    trackCount: 4,
    playCount: 630,
    subscribed: true,
  },
]

export interface NeteaseCategory {
  id: string
  name: string
  kind: 'brand' | 'genre'
}

export const DISCOVER_CATEGORIES: NeteaseCategory[] = [
  { id: '3778678', name: '推荐', kind: 'brand' },
  { id: '19723756', name: '官方', kind: 'brand' },
  { id: '2884035', name: '华语', kind: 'genre' },
  { id: '2809513713', name: '欧美', kind: 'genre' },
  { id: '3779629', name: '流行', kind: 'genre' },
  { id: 'rock', name: '摇滚', kind: 'genre' },
  { id: 'folk', name: '民谣', kind: 'genre' },
  { id: '1978921795', name: '电音', kind: 'genre' },
]

export const CHARTS = DISCOVER_CATEGORIES

export const useNetease = create<NeteaseState>(() => ({
  signedIn: IN_HOST ? null : true,
  signingIn: false,
  playing: false,
  tracks: MOCK_TRACKS,
  playlists: DEFAULT_USER_PLAYLISTS,
  recommendedPlaylists: MOCK_RECOMMENDED_PLAYLISTS,
  currentPlaylist: null,
  tab: 'recommend',
  discoverChartId: '3778678',
  searchQuery: '',
  loading: false,
  playback: {
    title: MOCK_TRACKS[1].title,
    artist: MOCK_TRACKS[1].artist,
    artwork: MOCK_TRACKS[1].artwork,
    duration: MOCK_TRACKS[1].duration ?? 215,
    position: 28,
    status: 'paused',
    trackId: MOCK_TRACKS[1].id,
    at: performance.now(),
  },
  playbackNotice: null,
  nowPlaying: false,
  volume: 1,
  playMode: 'loop',
  queue: MOCK_TRACKS,
  queueIndex: 1,
  queueOpen: false,
  likedTrackIds: ['1413585838', '186016'],
  userProfile: {
    nickname: '欧卡车神',
    vipDays: 1498,
    vipType: 11,
  },
}))

type AskKind = 'recommend' | 'chart' | 'roaming' | 'userPlaylists' | 'search' | 'playlistTracks'

interface InFlightAsk {
  kind: AskKind
  playlistId?: string
}

let nextAskId = 100
const inFlightAsks = new Map<number, InFlightAsk>()
let latestRecommendAskId = 0
let latestUserPlaylistsAskId = 0
let latestTabTracksAskId = 0
let latestPlaylistTracksAskId = 0
let savedTabTracks: NeteaseTrack[] | null = null

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function send(command: NeteaseCommand): void {
  if (isInHost()) postToHost({ type: 'netease', command })
}

function sendAsk(question: NeteaseQuestion, kind: AskKind, playlistId?: string): number {
  const id = nextAskId++
  inFlightAsks.set(id, { kind, playlistId })
  if (kind === 'recommend') latestRecommendAskId = id
  if (kind === 'userPlaylists') latestUserPlaylistsAskId = id
  if (kind === 'playlistTracks') {
    latestPlaylistTracksAskId = id
  } else if (kind !== 'userPlaylists') {
    latestTabTracksAskId = id
  }
  send({ action: 'ask', id, question })
  return id
}

export function sendStart(): void {
  send({ action: 'start' })
  sendAsk({ ask: 'recommend' }, 'recommend')
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
}

export function selectTab(tab: NeteaseTab): void {
  latestPlaylistTracksAskId = nextAskId++
  const restoreTracks = savedTabTracks
  savedTabTracks = null
  useNetease.setState({
    tab,
    currentPlaylist: null,
    ...(restoreTracks && restoreTracks.length > 0 ? { tracks: restoreTracks } : {}),
  })
  if (tab === 'recommend') {
    useNetease.setState({ loading: isInHost() })
    sendAsk({ ask: 'recommend' }, 'recommend')
  } else if (tab === 'discover') {
    const chartId = useNetease.getState().discoverChartId
    if (chartId === 'rock') {
      useNetease.setState({ tracks: ROCK_TRACKS, loading: false })
    } else if (chartId === 'folk') {
      useNetease.setState({ tracks: FOLK_TRACKS, loading: false })
    } else {
      useNetease.setState({ loading: isInHost() })
      sendAsk({ ask: 'chart', id: chartId }, 'chart')
    }
  } else if (tab === 'roaming') {
    useNetease.setState({ loading: isInHost() })
    sendAsk({ ask: 'chart', id: '19723756' }, 'roaming')
  } else if (tab === 'my') {
    const current = useNetease.getState().playlists
    if (!current || current.length === 0) {
      useNetease.setState({ playlists: DEFAULT_USER_PLAYLISTS })
    }
    useNetease.setState({ loading: isInHost() })
    const askId = sendAsk({ ask: 'userPlaylists' }, 'userPlaylists')
    if (isInHost()) {
      setTimeout(() => {
        const s = useNetease.getState()
        if (inFlightAsks.has(askId) && s.loading && s.tab === 'my' && askId === latestUserPlaylistsAskId) {
          inFlightAsks.delete(askId)
          useNetease.setState({ loading: false })
        }
      }, 2000)
    }
  }
}

export function selectDiscoverChart(chartId: string): void {
  useNetease.setState({ discoverChartId: chartId, loading: isInHost() && chartId !== 'rock' && chartId !== 'folk' })
  if (chartId === 'rock') {
    latestTabTracksAskId = nextAskId++
    useNetease.setState({ tracks: ROCK_TRACKS, loading: false })
  } else if (chartId === 'folk') {
    latestTabTracksAskId = nextAskId++
    useNetease.setState({ tracks: FOLK_TRACKS, loading: false })
  } else {
    sendAsk({ ask: 'chart', id: chartId }, 'chart')
  }
}

export function searchSongs(query: string): void {
  if (!query.trim()) return
  useNetease.setState({ loading: isInHost(), searchQuery: query })
  sendAsk({ ask: 'search', query: query.trim() }, 'search')
}

export const ROCK_TRACKS: NeteaseTrack[] = [
  {
    id: '4010201',
    title: 'Hotel California',
    artist: 'Eagles',
    album: 'Hotel California',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 391,
  },
  {
    id: '3448738711',
    title: '无意',
    artist: '加木, Demxntia',
    album: '无意',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 176,
  },
  {
    id: '1393666',
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night At The Opera',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 354,
  },
  {
    id: '3986241',
    title: "Sweet Child O' Mine",
    artist: "Guns N' Roses",
    album: 'Appetite For Destruction',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 356,
  },
  {
    id: '16343516',
    title: 'In The End',
    artist: 'Linkin Park',
    album: 'Hybrid Theory',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 216,
  },
  {
    id: '4466775',
    title: "It's My Life",
    artist: 'Bon Jovi',
    album: 'Crush',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 224,
  },
  {
    id: '16343528',
    title: 'Numb',
    artist: 'Linkin Park',
    album: 'Meteora',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 187,
  },
  {
    id: '418603099',
    title: 'Back In Black',
    artist: 'AC/DC',
    album: 'Back In Black',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 255,
  },
]

export const FOLK_TRACKS: NeteaseTrack[] = [
  {
    id: '1901371647',
    title: '漠河舞厅',
    artist: '柳爽',
    album: '1st.星球',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 312,
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
    id: '1330348068',
    title: '起风了',
    artist: '买辣椒也用券',
    album: '起风了',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 325,
  },
  {
    id: '347230',
    title: '海阔天空',
    artist: 'Beyond',
    album: '乐与怒',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 326,
  },
]

export const CAR_FAV_TRACKS: NeteaseTrack[] = [
  {
    id: '27955653',
    title: '夜空中最亮的星',
    artist: '逃跑计划',
    album: '世界',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 252,
  },
  {
    id: '436514312',
    title: '成都',
    artist: '赵雷',
    album: '无法长大',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 328,
  },
  {
    id: '346089',
    title: '光辉岁月',
    artist: 'Beyond',
    album: '命运派对',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 299,
  },
  {
    id: '569200213',
    title: '像我这样的人',
    artist: '毛不易',
    album: '平凡的一天',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 169,
  },
  {
    id: '167827',
    title: '蓝莲花',
    artist: '许巍',
    album: '时光·漫步',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 270,
  },
]

export const HIGHWAY_TRACKS: NeteaseTrack[] = [
  {
    id: '167876',
    title: '曾经的你',
    artist: '许巍',
    album: '每一刻都是崭新的',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 263,
  },
  {
    id: '29814898',
    title: '南山南',
    artist: '马頔',
    album: '孤岛',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 324,
  },
  {
    id: '31445772',
    title: '理想三旬',
    artist: '陈鸿宇',
    album: '浓烟下的诗歌电台',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 211,
  },
  {
    id: '27646205',
    title: '安和桥',
    artist: '宋冬野',
    album: '安和桥北',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 250,
  },
  {
    id: '29732992',
    title: '去大理',
    artist: '郝云',
    album: '心花路放 电影原声带',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 247,
  },
]

export const EDM_TRACKS: NeteaseTrack[] = [
  {
    id: '4010202',
    title: 'Faded',
    artist: 'Alan Walker',
    album: 'Faded',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 212,
  },
  {
    id: '4010203',
    title: 'The Spectre',
    artist: 'Alan Walker',
    album: 'The Spectre',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 193,
  },
  {
    id: '442869203',
    title: 'Alone',
    artist: 'Alan Walker',
    album: 'Alone',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 161,
  },
  {
    id: '461347998',
    title: 'Something Just Like This',
    artist: 'The Chainsmokers, Coldplay',
    album: 'Memories...Do Not Open',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 247,
  },
]

export const SOARING_TRACKS: NeteaseTrack[] = [
  {
    id: '1842025914',
    title: '悬溺',
    artist: '葛东琪',
    album: '第二街区',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 197,
  },
  {
    id: '1496089152',
    title: '精卫',
    artist: '30年前，50年后',
    album: '精卫',
    artwork: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    duration: 245,
  },
  {
    id: '1407551413',
    title: '世间美好与你环环相扣',
    artist: '柏松',
    album: '听闻余生',
    artwork: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80',
    duration: 191,
  },
  {
    id: '1813926556',
    title: '星辰大海',
    artist: '黄霄雲',
    album: '星辰大海',
    artwork: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    duration: 207,
  },
]

export const ORIGINAL_TRACKS: NeteaseTrack[] = [
  {
    id: '1398663411',
    title: '山雀',
    artist: '万能青年旅店',
    album: '冀西南林路行',
    artwork: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=600&q=80',
    duration: 263,
  },
  {
    id: '1959528822',
    title: '如果爱忘了',
    artist: '汪苏泷, 单依纯',
    album: '如果爱忘了',
    artwork: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    duration: 238,
  },
  {
    id: '1858118347',
    title: '孤勇者',
    artist: '陈奕迅',
    album: '孤勇者',
    artwork: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    duration: 256,
  },
  {
    id: '2026224214',
    title: '奢香夫人',
    artist: '凤凰传奇',
    album: '最炫民族风',
    artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    duration: 261,
  },
]

const FALLBACK_POOLS: NeteaseTrack[][] = [
  CAR_FAV_TRACKS,
  HIGHWAY_TRACKS,
  ROCK_TRACKS,
  EDM_TRACKS,
  SOARING_TRACKS,
  ORIGINAL_TRACKS,
  MOCK_TRACKS,
]

export function getFallbackTracksForPlaylist(playlist: NeteasePlaylist): NeteaseTrack[] {
  const name = (playlist.name || '').toLowerCase()
  const id = playlist.id || ''
  if (id === 'user_liked' || id === '3778678') return MOCK_TRACKS
  if (id === 'user_car_fav') return CAR_FAV_TRACKS
  if (id === 'user_highway' || id === '2298267009') return HIGHWAY_TRACKS
  if (id === 'user_night_drive' || id === '8877118200') return EDM_TRACKS
  if (id === '19723756') return SOARING_TRACKS
  if (id === '5460985377') return ROCK_TRACKS
  if (id === '2884035') return ORIGINAL_TRACKS
  if (name.includes('喜欢') || name.includes('红心')) return MOCK_TRACKS
  if (name.includes('飙升')) return SOARING_TRACKS
  if (name.includes('原创')) return ORIGINAL_TRACKS
  if (name.includes('摇滚') || name.includes('rock') || name.includes('欧美') || name.includes('经典欧美')) {
    return ROCK_TRACKS
  }
  if (name.includes('民谣') || name.includes('folk')) return FOLK_TRACKS
  if (name.includes('公路') || name.includes('自驾') || name.includes('电台')) return HIGHWAY_TRACKS
  if (name.includes('私藏') || name.includes('车载精选')) return CAR_FAV_TRACKS
  if (
    name.includes('重低音') ||
    name.includes('电音') ||
    name.includes('edm') ||
    name.includes('深夜') ||
    name.includes('微醺')
  ) {
    return EDM_TRACKS
  }
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return FALLBACK_POOLS[Math.abs(hash) % FALLBACK_POOLS.length]
}

export function selectPlaylist(playlist: NeteasePlaylist): void {
  const { currentPlaylist, tracks } = useNetease.getState()
  if (!currentPlaylist && savedTabTracks === null) {
    savedTabTracks = tracks
  }

  const isSynthetic = playlist.id.startsWith('user_')
  if (!isInHost() || isSynthetic) {
    latestPlaylistTracksAskId = nextAskId++
    useNetease.setState({
      loading: false,
      currentPlaylist: playlist,
      tracks: getFallbackTracksForPlaylist(playlist),
    })
    return
  }

  useNetease.setState({ loading: true, currentPlaylist: playlist, tracks: [] })
  const askId = sendAsk({ ask: 'playlistTracks', playlistId: playlist.id }, 'playlistTracks', playlist.id)
  setTimeout(() => {
    const s = useNetease.getState()
    if (
      inFlightAsks.has(askId) &&
      s.loading &&
      s.currentPlaylist?.id === playlist.id &&
      askId === latestPlaylistTracksAskId
    ) {
      inFlightAsks.delete(askId)
      useNetease.setState({
        tracks: getFallbackTracksForPlaylist(playlist),
        loading: false,
      })
    }
  }, 6000)
}

export function backToPlaylists(): void {
  latestPlaylistTracksAskId = nextAskId++
  const restoreTracks = savedTabTracks
  savedTabTracks = null
  useNetease.setState({
    currentPlaylist: null,
    loading: false,
    ...(restoreTracks && restoreTracks.length > 0 ? { tracks: restoreTracks } : {}),
  })
}

export function togglePlayMode(): void {
  const modes: NeteasePlayMode[] = ['loop', 'shuffle', 'single']
  const current = useNetease.getState().playMode
  const nextIdx = (modes.indexOf(current) + 1) % modes.length
  useNetease.setState({ playMode: modes[nextIdx] })
}

export function toggleLike(trackId: string): void {
  const { likedTrackIds } = useNetease.getState()
  const exists = likedTrackIds.includes(trackId)
  const updated = exists ? likedTrackIds.filter((id) => id !== trackId) : [...likedTrackIds, trackId]
  useNetease.setState({ likedTrackIds: updated })
}

export function toggleQueue(open?: boolean): void {
  useNetease.setState((s) => ({ queueOpen: open !== undefined ? open : !s.queueOpen }))
}

export function toggleFullscreenPlayer(open?: boolean): void {
  useNetease.setState((s) => ({ nowPlaying: open !== undefined ? open : !s.nowPlaying }))
}

export function clearQueue(): void {
  useNetease.setState({ queue: [], queueIndex: -1 })
}

export function removeFromQueue(index: number): void {
  const { queue, queueIndex } = useNetease.getState()
  const newQueue = queue.filter((_, i) => i !== index)
  let newIndex = queueIndex
  if (index < queueIndex) {
    newIndex = queueIndex - 1
  } else if (index === queueIndex) {
    newIndex = Math.min(queueIndex, newQueue.length - 1)
  }
  useNetease.setState({ queue: newQueue, queueIndex: newIndex })
}

export function playQueueTrack(index: number): void {
  const { queue } = useNetease.getState()
  const track = queue[index]
  if (track) {
    play(track, queue, index)
  }
}

let playbackStartedInHost = false
let playbackPendingTrackId: string | null = null
let vipBlockedForSession = false
const autoSkipVisitedIds = new Set<string>()
let noticeTimer: ReturnType<typeof setTimeout> | null = null

export function formatPlaybackNotice(notice: PlaybackNotice): string {
  const base =
    notice.reason === 'vip_required' ? `「${notice.title}」需要网易云黑胶 VIP` : `「${notice.title}」暂无可用音源`
  if (notice.skippedTo) {
    return `${base}，已为您自动播放「${notice.skippedTo}」`
  }
  return notice.reason === 'vip_required' ? `${base}，当前队列暂无其他可播曲目` : `${base}，请切换其他歌曲`
}

export function dismissPlaybackNotice(): void {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
  useNetease.setState({ playbackNotice: null })
}

function setPlaybackNotice(notice: PlaybackNotice | null, autoHideMs = 5500): void {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
  useNetease.setState({ playbackNotice: notice })
  if (notice && autoHideMs > 0) {
    noticeTimer = setTimeout(() => {
      noticeTimer = null
      const curr = useNetease.getState().playbackNotice
      if (curr?.trackId === notice.trackId && curr?.skippedTo === notice.skippedTo) {
        useNetease.setState({ playbackNotice: null })
      }
    }, autoHideMs)
  }
}

function isTrackVipLocked(track: NeteaseTrack, assumeNoVip: boolean): boolean {
  if (track.playable === false) return true
  if (assumeNoVip && (track.fee === 1 || track.fee === 4)) return true
  return false
}

function markTrackUnplayable(trackId: string, reason: 'vip_required' | 'unavailable'): void {
  const patch = (t: NeteaseTrack): NeteaseTrack => {
    if (t.id !== trackId) return t
    return {
      ...t,
      playable: false,
      ...(reason === 'vip_required' && t.fee === undefined ? { fee: 1 } : {}),
    }
  }
  useNetease.setState((s) => ({
    tracks: s.tracks.map(patch),
    queue: s.queue.map(patch),
  }))
}

function findNextPlayableIndex(
  queue: NeteaseTrack[],
  fromIndex: number,
  direction: 1 | -1,
  playMode: NeteasePlayMode,
  visited: Set<string>,
  assumeNoVip: boolean,
): number {
  if (queue.length === 0) return -1
  const safeFrom = fromIndex >= 0 && fromIndex < queue.length ? fromIndex : 0
  const candidates: number[] = []
  for (let offset = 1; offset < queue.length; offset++) {
    const idx = (safeFrom + direction * offset + queue.length * 2) % queue.length
    candidates.push(idx)
  }
  if (playMode === 'shuffle') {
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }
  }
  for (const idx of candidates) {
    const candidate = queue[idx]
    if (!candidate || visited.has(candidate.id)) continue
    if (!isTrackVipLocked(candidate, assumeNoVip)) return idx
  }
  return -1
}

export function receiveState(signedIn: boolean | null, playing: boolean | null, signingIn: boolean): void {
  const prevSignedIn = useNetease.getState().signedIn
  if (signedIn !== prevSignedIn) {
    vipBlockedForSession = false
    autoSkipVisitedIds.clear()
    if (signedIn) {
      const clearVipBlock = (t: NeteaseTrack): NeteaseTrack =>
        t.fee === 1 || t.fee === 4 ? { ...t, playable: true } : t
      useNetease.setState((s) => ({
        tracks: s.tracks.map(clearVipBlock),
        queue: s.queue.map(clearVipBlock),
        playbackNotice: null,
      }))
    }
  }
  useNetease.setState({ signedIn, playing, signingIn })
  const state = useNetease.getState()
  if (signedIn && state.tab === 'my' && (!prevSignedIn || state.playlists.every((p) => p.id.startsWith('user_')))) {
    sendAsk({ ask: 'userPlaylists' }, 'userPlaylists')
  }
  if (!state.currentPlaylist && state.tab === 'recommend' && state.tracks.length <= 5) {
    sendAsk({ ask: 'recommend' }, 'recommend')
  }
}

export function receiveAnswer(
  id: number,
  failed?: boolean,
  _error?: string,
  songs?: NeteaseTrack[] | null,
  playlists?: NeteasePlaylist[] | null,
  lyric?: string | null,
): void {
  const meta = inFlightAsks.get(id)
  if (meta) inFlightAsks.delete(id)
  const state = useNetease.getState()

  if (!failed) {
    if (Array.isArray(playlists)) {
      const uniquePlaylists = dedupeById(playlists)
      if (meta?.kind === 'userPlaylists' || (!meta && state.tab === 'my')) {
        if (!meta || id === latestUserPlaylistsAskId) {
          useNetease.setState({
            playlists: uniquePlaylists.length > 0 ? uniquePlaylists : DEFAULT_USER_PLAYLISTS,
            loading: false,
          })
        }
      } else if (meta?.kind === 'recommend' || (!meta && state.tab === 'recommend')) {
        if (!meta || id === latestRecommendAskId) {
          useNetease.setState({
            recommendedPlaylists: uniquePlaylists.length > 0 ? uniquePlaylists : MOCK_RECOMMENDED_PLAYLISTS,
            loading: false,
          })
        }
      }
    }

    if (Array.isArray(songs)) {
      const uniqueSongs = dedupeById(songs)
      if (meta?.kind === 'playlistTracks') {
        const activePlaylist = state.currentPlaylist
        if (id === latestPlaylistTracksAskId && activePlaylist && activePlaylist.id === meta.playlistId) {
          const finalSongs =
            uniqueSongs.length > 0
              ? uniqueSongs
              : (activePlaylist.trackCount ?? 0) === 0
                ? []
                : getFallbackTracksForPlaylist(activePlaylist)
          useNetease.setState({ tracks: finalSongs, loading: false })
        }
      } else if (meta) {
        if (id === latestTabTracksAskId && !state.currentPlaylist) {
          useNetease.setState({
            tracks: uniqueSongs.length > 0 ? uniqueSongs : MOCK_TRACKS,
            loading: false,
          })
        }
      } else if (!state.currentPlaylist && state.tab === 'recommend') {
        useNetease.setState({
          tracks: uniqueSongs.length > 0 ? uniqueSongs : MOCK_TRACKS,
          loading: false,
        })
      }
    }

    if (lyric) useNetease.setState({ lyrics: lyric })
    return
  }

  if (meta?.kind === 'playlistTracks') {
    const activePlaylist = state.currentPlaylist
    if (id === latestPlaylistTracksAskId && activePlaylist && activePlaylist.id === meta.playlistId) {
      useNetease.setState({
        tracks: getFallbackTracksForPlaylist(activePlaylist),
        loading: false,
      })
    }
  } else if (meta?.kind === 'userPlaylists') {
    if (id === latestUserPlaylistsAskId) {
      useNetease.setState((s) => ({
        playlists: s.playlists.length > 0 ? s.playlists : DEFAULT_USER_PLAYLISTS,
        loading: false,
      }))
    }
  } else if (meta) {
    if (id === latestTabTracksAskId) {
      useNetease.setState({ loading: false })
    }
  } else if (state.currentPlaylist) {
    useNetease.setState({ tracks: getFallbackTracksForPlaylist(state.currentPlaylist), loading: false })
  } else {
    useNetease.setState({ loading: false })
  }
}

export function receivePlayback(playback: NeteasePlayback | null): void {
  if (!playback) {
    playbackPendingTrackId = null
    useNetease.setState({ playback: null, playing: false })
    return
  }

  const state = useNetease.getState()
  const activeTrack = state.queue[state.queueIndex]
  const targetTrackId = playback.trackId || activeTrack?.id || playback.title

  if (playback.error === 'ended') {
    const wasActive =
      state.playing === true || (playback.trackId !== undefined && playback.trackId === playbackPendingTrackId)
    playbackStartedInHost = true
    if (wasActive && state.queue.length > 0) {
      skip(1)
      return
    }
    playbackPendingTrackId = null
    useNetease.setState({
      playback: { ...playback, status: 'paused', at: performance.now() },
      playing: false,
    })
    return
  }

  if (playback.error === 'vip_required' || playback.error === 'unavailable') {
    const matchesCurrent =
      !playback.trackId ||
      activeTrack?.id === playback.trackId ||
      state.playback?.trackId === playback.trackId ||
      playback.title === state.playback?.title
    const wasActiveOrPending =
      state.playing === true || (playback.trackId !== undefined && playback.trackId === playbackPendingTrackId)

    playbackPendingTrackId = null
    if (!matchesCurrent || !wasActiveOrPending) {
      useNetease.setState({
        playback: { ...playback, status: 'paused', at: performance.now() },
        playing: false,
      })
      return
    }

    const reason = playback.error
    if (reason === 'vip_required') {
      vipBlockedForSession = true
    }
    markTrackUnplayable(targetTrackId, reason)
    autoSkipVisitedIds.add(targetTrackId)

    const updatedQueue = useNetease.getState().queue
    const assumeNoVip = vipBlockedForSession || !state.signedIn
    const nextIdx = findNextPlayableIndex(
      updatedQueue,
      state.queueIndex,
      1,
      state.playMode,
      autoSkipVisitedIds,
      assumeNoVip,
    )

    if (nextIdx >= 0 && updatedQueue[nextIdx]) {
      const nextTrack = updatedQueue[nextIdx]
      setPlaybackNotice(
        {
          trackId: targetTrackId,
          title: playback.title,
          reason,
          skippedTo: nextTrack.title,
        },
        5500,
      )
      startPlayTrack(nextTrack, updatedQueue, nextIdx, false)
      return
    }

    useNetease.setState({
      playback: { ...playback, position: 0, status: 'paused', at: performance.now() },
      playing: false,
    })
    setPlaybackNotice({ trackId: targetTrackId, title: playback.title, reason }, 0)
    return
  }

  playbackStartedInHost = true
  if (playback.status === 'playing') {
    playbackPendingTrackId = null
    autoSkipVisitedIds.clear()
  }
  useNetease.setState({
    playback: { ...playback, at: performance.now() },
    playing: playback.status === 'playing',
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

function startPlayTrack(track: NeteaseTrack, list?: NeteaseTrack[], index?: number, clearNotice = true): void {
  const { queue } = useNetease.getState()
  const currentList = list || (queue.length > 0 ? queue : [track])
  const foundIdx = index !== undefined ? index : currentList.findIndex((t) => t.id === track.id)
  const idx = foundIdx >= 0 ? foundIdx : 0

  playbackPendingTrackId = track.id
  autoSkipVisitedIds.add(track.id)
  if (clearNotice) {
    dismissPlaybackNotice()
  }

  send({ action: 'play', track })
  useNetease.setState({
    playback: {
      title: track.title,
      artist: track.artist,
      artwork: track.artwork,
      duration: track.duration || 240,
      position: 0,
      status: 'playing',
      trackId: track.id,
      at: performance.now(),
    },
    playing: true,
    queue: currentList,
    queueIndex: idx,
  })
}

export function play(track?: NeteaseTrack, list?: NeteaseTrack[], index?: number): void {
  if (track) {
    autoSkipVisitedIds.clear()
    startPlayTrack(track, list, index, true)
  } else {
    autoSkipVisitedIds.clear()
    dismissPlaybackNotice()
    send({ action: 'play' })
    show({ status: 'playing' })
  }
}

export function playOrPause(): void {
  const { playing, playback, queue, queueIndex, playbackNotice } = useNetease.getState()
  if (playing) {
    playbackPendingTrackId = null
    send({ action: 'pause' })
    show({ status: 'paused' })
  } else {
    const idx = queueIndex >= 0 && queueIndex < queue.length ? queueIndex : 0
    const currentTrack = queue[idx]
    if ((!playback || !playbackStartedInHost || playbackNotice) && currentTrack) {
      play(currentTrack, queue, idx)
    } else {
      playbackPendingTrackId = playback?.trackId || currentTrack?.id || null
      send({ action: 'play' })
      show({ status: 'playing' })
    }
  }
}

export function skip(direction: 1 | -1): void {
  const { queue, queueIndex, playMode, signedIn } = useNetease.getState()
  if (queue.length === 0) {
    send({ action: direction === 1 ? 'next' : 'previous' })
    return
  }

  autoSkipVisitedIds.clear()
  const assumeNoVip = vipBlockedForSession || !signedIn
  if (playMode === 'single') {
    const idx = queueIndex >= 0 && queueIndex < queue.length ? queueIndex : 0
    const nextTrack = queue[idx]
    if (nextTrack) play(nextTrack, queue, idx)
    return
  }

  let nextIdx = findNextPlayableIndex(queue, queueIndex, direction, playMode, autoSkipVisitedIds, assumeNoVip)
  if (nextIdx < 0) {
    nextIdx = (queueIndex + direction + queue.length) % queue.length
  }

  const nextTrack = queue[nextIdx]
  if (nextTrack) {
    play(nextTrack, queue, nextIdx)
  }
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
        controls: { playPause: true, next: true, previous: true, shuffle: true, repeat: true },
        shuffle: false,
        repeat: null,
      },
    }
  }, [playback])
}
