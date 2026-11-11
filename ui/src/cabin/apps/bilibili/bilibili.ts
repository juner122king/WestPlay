import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  type BilibiliAnswers,
  type BilibiliCommand,
  type BilibiliDynamicItem,
  type BilibiliLiveRoom,
  type BilibiliMovieItem,
  type BilibiliPlayback,
  type BilibiliQuestion,
  type BilibiliVideo,
  type BilibiliVideoPage,
  isInHost,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { whenTransitionEnds } from '../../state/launch'
import type { Hole } from '../youtube/youtube'

export type BilibiliView =
  | { id: string; kind: 'results'; query: string; filter: 'videos' | 'users' }
  | { id: string; kind: 'channel'; channel: { mid: string; name: string; avatar?: string | null } }
  | { id: string; kind: 'playlist'; video: BilibiliVideo }

export interface BilibiliWatched {
  video: BilibiliVideo
  time: number
  duration: number
}

export interface BilibiliQueue {
  video: BilibiliVideo
  page: number
  pages: BilibiliVideoPage[]
}

export interface BilibiliState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  playback: (BilibiliPlayback & { at: number }) | null
  current: BilibiliVideo | null
  open: boolean
  returnToPlayer: boolean
  views: BilibiliView[]
  queue: BilibiliQueue | null
  quality: number
  rate: number
  danmaku: boolean
  searches: string[]
  watched: BilibiliWatched[]
  volume: number
  muted: boolean
  hole: Hole | null
  related: BilibiliVideo[] | null
  videos: BilibiliVideo[]
}

const IN_HOST = typeof window !== 'undefined' && isInHost()
const ANSWER_MS = 15000
const SEARCHES_KEPT = 8
const WATCHED_KEPT = 24

export const MOCK_VIDEOS: BilibiliVideo[] = [
  {
    bvid: 'BV1xx411c7mD',
    title: '【经典】甩葱歌 初音未来 高清重制',
    author: '初音未来官方',
    mid: '1',
    duration: 154,
    playCount: '1250万',
    pubdate: '2020-01-01',
    artwork: 'https://i0.hdslb.com/bfs/archive/478a846c4fce45be5d120a1dbde86b72f10b7776.jpg',
  },
  {
    bvid: 'BV1GJ411x7h7',
    title: '【卡车司机的一天】驾驶斯堪尼亚穿越阿尔卑斯山脉',
    author: '欧卡达人',
    mid: '2',
    duration: 840,
    playCount: '89万',
    pubdate: '2023-05-12',
    artwork: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
  },
  {
    bvid: 'BV185411r7Kd',
    title: '周杰伦 经典金曲串烧 4K 60帧 车载无损',
    author: '音乐车道',
    mid: '3',
    duration: 1200,
    playCount: '345万',
    pubdate: '2022-10-08',
    artwork: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
  },
  {
    bvid: 'BV1t4411v7r5',
    title: '【4K沉浸式】雨夜长途驾驶 欧洲卡车模拟2 真实视听',
    author: 'SimDriver',
    mid: '4',
    duration: 1800,
    playCount: '67万',
    pubdate: '2023-11-20',
    artwork: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
  },
  {
    bvid: 'BV1uT4y1P7cx',
    title: '【4K60帧】中国高铁驾驶视角 穿越大好河山',
    author: '铁道视界',
    mid: '5',
    duration: 960,
    playCount: '190万',
    pubdate: '2024-03-15',
    artwork: 'https://i1.hdslb.com/bfs/archive/844781604a8b75249c3ce3882756885df1aeb6c4.jpg',
  },
  {
    bvid: 'BV1QK4y1d7Ng',
    title: '欧卡2 超重特种货物运输 挑战极限弯道',
    author: '重卡领航员',
    mid: '6',
    duration: 720,
    playCount: '45万',
    pubdate: '2024-08-01',
    artwork: 'https://i2.hdslb.com/bfs/archive/a64a377d61247d51fce8ba0722cb54c414e049bf.jpg',
  },
]

export const useBilibili = create<BilibiliState>()(
  persist(
    (): BilibiliState => ({
      signedIn: IN_HOST ? null : false,
      signingIn: false,
      playing: false,
      playback: null,
      current: null,
      open: false,
      returnToPlayer: false,
      views: [],
      queue: null,
      quality: 64, // 720P default
      rate: 1.0,
      danmaku: false, // Default off per decision
      searches: [],
      watched: [],
      volume: 100,
      muted: false,
      hole: null,
      related: null,
      videos: MOCK_VIDEOS,
    }),
    {
      name: 'westplay.bilibili',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (store) => ({
        searches: store.searches,
        watched: store.watched,
        volume: store.volume,
        muted: store.muted,
        quality: store.quality,
        rate: store.rate,
        danmaku: store.danmaku,
      }),
      merge: (stored, current) => {
        const s = (stored ?? {}) as Partial<BilibiliState>
        return {
          ...current,
          searches: Array.isArray(s.searches) ? s.searches.slice(0, SEARCHES_KEPT) : [],
          watched: Array.isArray(s.watched) ? s.watched.slice(0, WATCHED_KEPT) : [],
          volume: typeof s.volume === 'number' ? s.volume : 100,
          muted: Boolean(s.muted),
          quality: typeof s.quality === 'number' ? s.quality : 64,
          rate: typeof s.rate === 'number' ? s.rate : 1.0,
          danmaku: Boolean(s.danmaku),
        }
      },
    },
  ),
)

let shows = 0

export function send(command: BilibiliCommand): void {
  if (command.action === 'show') shows++
  if (isInHost()) postToHost({ type: 'bilibili', command })
}

export function followArea(place: () => void, element?: Element): () => void {
  place()
  const resized = new ResizeObserver(() => place())
  const area = document.querySelector('.carplay')
  if (area) resized.observe(area)
  if (element) resized.observe(element)
  window.addEventListener('resize', place)
  return () => {
    resized.disconnect()
    window.removeEventListener('resize', place)
  }
}

let questionId = 0
const waiting = new Map<number, (answer: BilibiliAnswers) => void>()

export function ask(question: BilibiliQuestion): Promise<BilibiliAnswers> {
  if (!isInHost()) {
    if (question.ask === 'suggest') {
      const q = question.query.trim().toLowerCase()
      const list = q ? [`${question.query} 欧卡`, `${question.query} 4K`, `${question.query} 驾驶`] : []
      return Promise.resolve({ suggestions: list })
    }
    if (question.ask === 'feed' && question.which === 'dynamic') {
      const mockDynamics: BilibiliDynamicItem[] = [
        {
          id: 'dyn-1',
          author: {
            mid: '2',
            name: '欧卡达人',
            avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
            pubTime: '10分钟前',
            pubAction: '投稿了视频',
          },
          desc: '新的一期欧洲卡车长途拉货视频来啦！这次从瑞士苏黎世一路开到奥地利因斯布鲁克，沿途的阿尔卑斯雪山景色绝美，配上雨夜驾驶音效，非常适合开车时当背景音，希望大家喜欢！',
          video: MOCK_VIDEOS[1],
        },
        {
          id: 'dyn-2',
          author: {
            mid: '4',
            name: 'SimDriver',
            avatar: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
            pubTime: '2小时前',
            pubAction: '发布了动态',
          },
          desc: '今晚8点准时开启欧卡2联运直播，届时会穿越北欧峡湾，欢迎大家一起来跑车交流！路线规划图已附上。',
        },
        {
          id: 'dyn-3',
          author: {
            mid: '3',
            name: '音乐车道',
            avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
            pubTime: '昨天 19:40',
            pubAction: '转发了动态',
          },
          desc: '转自原UP主的经典金曲串烧，车载听感无敌，强烈推荐各位车友收藏播放！',
          origAuthor: '初音未来官方',
          origDesc: '初音未来经典神曲高清重制版发布！感谢大家一直以来的支持~',
          video: MOCK_VIDEOS[0],
        },
      ]
      const offset = (question.freshIdx || 0) % MOCK_VIDEOS.length
      const rotated = offset > 0 ? [...MOCK_VIDEOS.slice(offset), ...MOCK_VIDEOS.slice(0, offset)] : MOCK_VIDEOS
      return Promise.resolve({ dynamics: mockDynamics, videos: rotated })
    }
    if (question.ask === 'live') {
      const mockFollowing: BilibiliLiveRoom[] = [
        {
          roomId: 1001,
          uid: 2,
          title: '【欧卡2】阿尔卑斯暴风雪连夜拉货 沉浸式驾驶',
          uname: '欧卡达人',
          avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
          cover: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
          areaName: '单机·卡车模拟',
          parentAreaName: '单机游戏',
          online: '12.8万',
          isFollowing: true,
        },
        {
          roomId: 1002,
          uid: 3,
          title: '车载无损无眠电台 治愈系深夜畅听',
          uname: '音乐车道',
          avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
          cover: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
          areaName: '电台·音乐',
          parentAreaName: '语音电台',
          online: '8.4万',
          isFollowing: true,
        },
      ]

      const categoryRooms: Record<number, BilibiliLiveRoom[]> = {
        6: [
          {
            roomId: 2001,
            uid: 101,
            title: '【极限竞速地平线5】漫游墨西哥海岸线 4K超清',
            uname: '极速车神',
            avatar: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
            cover: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
            areaName: '极限竞速',
            parentAreaName: '单机游戏',
            online: '25.6万',
            isFollowing: false,
          },
          {
            roomId: 2002,
            uid: 102,
            title: '重卡领航：北欧峡湾跨国联运 实时路况',
            uname: '重卡老张',
            avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
            cover: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
            areaName: '卡车模拟',
            parentAreaName: '单机游戏',
            online: '19.3万',
            isFollowing: false,
          },
          {
            roomId: 2003,
            uid: 103,
            title: '黑神话悟空：二周目全隐藏Boss速通',
            uname: '天命行者',
            avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
            cover: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
            areaName: '动作游戏',
            parentAreaName: '单机游戏',
            online: '45.1万',
            isFollowing: false,
          },
        ],
        2: [
          {
            roomId: 2011,
            uid: 111,
            title: '【英雄联盟】王者单排冲分！中路亚索教学',
            uname: '风之剑圣',
            avatar: 'https://i2.hdslb.com/bfs/archive/a64a377d61247d51fce8ba0722cb54c414e049bf.jpg',
            cover: 'https://i2.hdslb.com/bfs/archive/a64a377d61247d51fce8ba0722cb54c414e049bf.jpg',
            areaName: '英雄联盟',
            parentAreaName: '网游竞技',
            online: '88.5万',
            isFollowing: false,
          },
          {
            roomId: 2012,
            uid: 112,
            title: 'CS2 完美S分段狙击实况 瞬狙教学',
            uname: '狙击手老陈',
            avatar: 'https://i1.hdslb.com/bfs/archive/844781604a8b75249c3ce3882756885df1aeb6c4.jpg',
            cover: 'https://i1.hdslb.com/bfs/archive/844781604a8b75249c3ce3882756885df1aeb6c4.jpg',
            areaName: 'CS:GO/CS2',
            parentAreaName: '网游竞技',
            online: '52.3万',
            isFollowing: false,
          },
        ],
        3: [
          {
            roomId: 2021,
            uid: 121,
            title: '王者荣耀：巅峰赛2300分 顶尖打野全局意识',
            uname: '野王小亮',
            avatar: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
            cover: 'https://i0.hdslb.com/bfs/archive/522501a3000b2184aa330fcddbf29f939e6a9284.jpg',
            areaName: '王者荣耀',
            parentAreaName: '手机游戏',
            online: '63.9万',
            isFollowing: false,
          },
          {
            roomId: 2022,
            uid: 122,
            title: '原神：新版本深渊满星阵容实战讲解',
            uname: '提瓦特导师',
            avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
            cover: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
            areaName: '原神',
            parentAreaName: '手机游戏',
            online: '41.2万',
            isFollowing: false,
          },
        ],
        9: [
          {
            roomId: 2031,
            uid: 131,
            title: '【歌回】温柔治愈系日韩流行金曲连唱',
            uname: '星奈Kina',
            avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
            cover: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
            areaName: '虚拟主播',
            parentAreaName: '虚拟主播',
            online: '38.0万',
            isFollowing: false,
          },
        ],
        1: [
          {
            roomId: 2041,
            uid: 141,
            title: '流行经典暖心现场 一起听歌聊聊生活',
            uname: '深夜点歌台',
            avatar: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
            cover: 'https://i1.hdslb.com/bfs/archive/4d7a8d5e89d18bce5a79bbda441c9aaebfd618a8.jpg',
            areaName: '娱乐日常',
            parentAreaName: '娱乐',
            online: '16.7万',
            isFollowing: false,
          },
        ],
        5: [
          {
            roomId: 2051,
            uid: 151,
            title: '晚安电台：雨声与白噪音 深度助眠',
            uname: '知心树洞',
            avatar: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
            cover: 'https://i2.hdslb.com/bfs/archive/c44415510da89658742ba32e3505bf779e959ec2.jpg',
            areaName: '语音电台',
            parentAreaName: '电台',
            online: '9.4万',
            isFollowing: false,
          },
        ],
      }

      const parentAreaId = question.parentAreaId ?? 0
      const mockLiveRooms =
        parentAreaId > 0 && categoryRooms[parentAreaId]
          ? categoryRooms[parentAreaId]
          : [
              ...categoryRooms[6],
              ...categoryRooms[2],
              ...categoryRooms[3],
              ...categoryRooms[9],
              ...categoryRooms[1],
              ...categoryRooms[5],
            ]

      return Promise.resolve({
        followingLiveRooms: question.page === 1 ? mockFollowing : undefined,
        liveRooms: mockLiveRooms,
        hasMore: true,
      })
    }
    if (question.ask === 'movie') {
      const seasonType = question.seasonType ?? 2
      const allMockMovies: Record<number, BilibiliMovieItem[]> = {
        2: [
          {
            seasonId: 48001,
            title: '剧场版 咒术回战 0',
            subTitle: '爱与诅咒的物语',
            cover: 'https://i0.hdslb.com/bfs/bangumi/image/0082a5c243151ef989439578e745785268c58e7d.png',
            badge: '大会员',
            score: '8.8',
            indexShow: '全1话',
            order: '1342.2万追番',
            link: 'https://www.bilibili.com/bangumi/play/ss48001?theme=movie',
            epId: 826152,
          },
          {
            seasonId: 38744,
            title: '工作细胞：细胞大作战',
            subTitle: '王者归来，胃肠大暴动！',
            cover: 'https://i0.hdslb.com/bfs/bangumi/image/3beae497c35df1782eef1108210fe521a02d4560.png',
            badge: '独家',
            score: '9.2',
            indexShow: '全1话',
            order: '340万追番',
            link: 'https://www.bilibili.com/bangumi/play/ss38744',
            epId: 404859,
          },
          {
            seasonId: 36780,
            title: '紫罗兰永恒花园 剧场版',
            subTitle: '最后的信笺，献给深爱之人',
            cover: 'https://i0.hdslb.com/bfs/bangumi/image/1f4dce1fbb26c3683f124c653457a419eb502390.png',
            badge: '独家',
            score: '9.9',
            indexShow: '全1话',
            order: '680万追番',
            link: 'https://www.bilibili.com/bangumi/play/ss36780',
            epId: 395893,
          },
        ],
        5: [
          {
            seasonId: 28243,
            title: '非自然死亡',
            subTitle: '石原里美主演高分法医悬疑日剧',
            cover: 'https://i0.hdslb.com/bfs/bangumi/image/f1860d5bfa7ee23c72718e24c29ea7ea1f0cbe0a.png',
            badge: '大会员',
            score: '9.9',
            indexShow: '全10集',
            order: '1.2亿播放',
            link: 'https://www.bilibili.com/bangumi/play/ss28243',
            epId: 284241,
          },
          {
            seasonId: 24053,
            title: '孤独的美食家 第七季',
            subTitle: '井之头五郎的舌尖治愈之旅',
            cover: 'http://i0.hdslb.com/bfs/bangumi/72f01ec71e4e8cb1a765f875b7a26fb78b9ae6eb.jpg',
            badge: '大会员',
            score: '9.9',
            indexShow: '全12集',
            order: '8800万播放',
            link: 'https://www.bilibili.com/bangumi/play/ss24053',
            epId: 204577,
          },
        ],
        3: [
          {
            seasonId: 34220,
            title: '守护解放西',
            subTitle: '硬核又接地气的警务纪实',
            cover: 'https://i0.hdslb.com/bfs/bangumi/image/ef179dc1784c0c16928e46eb58f5d165682b9e67.png',
            badge: '出品',
            score: '9.8',
            indexShow: '全10集',
            order: '4800万播放',
            link: 'https://www.bilibili.com/bangumi/play/ss34220',
            epId: 341852,
          },
          {
            seasonId: 24659,
            title: '人生一串 第一季',
            subTitle: '致我们七荤八素的生存',
            cover: 'https://i0.hdslb.com/bfs/bangumi/image/9e7e1f4bbd1469f3fe26859e92823b1859bb0f45.png',
            badge: '出品',
            score: '9.8',
            indexShow: '全6集',
            order: '2.5亿播放',
            link: 'https://www.bilibili.com/bangumi/play/ss24659',
            epId: 232230,
          },
        ],
        7: [
          {
            seasonId: 39396,
            title: '非正式会谈 第7季',
            subTitle: '全球青年文化交流沙龙',
            cover: 'https://i0.hdslb.com/bfs/bangumi/image/62e5b8e99818816c1417e29bb3e66052796dc612.png',
            badge: '独家',
            score: '9.6',
            indexShow: '全14期',
            order: '1.8亿播放',
            link: 'https://www.bilibili.com/bangumi/play/ss39396',
            epId: 474812,
          },
        ],
        1: [
          {
            seasonId: 39250,
            title: '鬼灭之刃 游郭篇',
            subTitle: '炭治郎与音柱潜入花街',
            cover: 'https://i0.hdslb.com/bfs/bangumi/image/dcf4c6f393ee3a6cb4723c2140d34633d77d1ca4.png',
            badge: '独家',
            score: '9.7',
            indexShow: '全11话',
            order: '1200万追番',
            link: 'https://www.bilibili.com/bangumi/play/ss39250',
            epId: 429643,
          },
          {
            seasonId: 47836,
            title: '间谍过家家 第二季',
            subTitle: '为了世界和平，伪装家庭继续行动',
            cover: 'https://i0.hdslb.com/bfs/bangumi/image/07a4ec8e2a95558a99859e1e374fe4b634e47aaf.png',
            badge: '大会员',
            score: '9.7',
            indexShow: '全12话',
            order: '1770万追番',
            link: 'https://www.bilibili.com/bangumi/play/ss47836',
            epId: 826497,
          },
        ],
      }
      const mockMovies = allMockMovies[seasonType] || allMockMovies[2]
      return Promise.resolve({
        movies: mockMovies,
        hasMore: false,
      })
    }
    return Promise.resolve({ videos: MOCK_VIDEOS })
  }
  const id = ++questionId
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id)
      resolve({ failed: true, error: 'Request timeout' })
    }, ANSWER_MS)
    waiting.set(id, (answer) => {
      clearTimeout(timer)
      resolve(answer)
    })
    send({ action: 'ask', id, question })
  })
}

export function receiveAnswer(id: number, answer: BilibiliAnswers): void {
  const handler = waiting.get(id)
  if (handler) {
    waiting.delete(id)
    handler(answer)
  }
  if (!answer.failed && answer.videos && answer.videos.length > 0) {
    useBilibili.setState({ videos: answer.videos })
  }
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
  useBilibili.setState((state) => {
    const isLive = Boolean(state.playback?.isLive || state.playback?.bvid?.startsWith('live:'))
    const effectivePlaying =
      state.playback && state.playback.status
        ? isLive
          ? state.playback.status !== 'paused'
          : state.playback.status === 'playing'
        : (playing ?? state.playing)
    return { signedIn, playing: effectivePlaying, signingIn }
  })
}

export function receivePlayback(playback: BilibiliPlayback | null): void {
  const now = performance.now()
  if (playback) {
    const current = useBilibili.getState().current
    // If playback is paused or empty and there's no active current video,
    // ignore it so stopped videos do not resurrect the bottom player bar.
    if (!current && (playback.status === 'paused' || !playback.bvid)) {
      return
    }

    useBilibili.setState((state) => {
      const current = state.current
      const isPlaceholderTitle = (t?: string) => !t || t === '正在直播' || t === '哔哩哔哩直播' || t === '哔哩哔哩视频'
      const isPlaceholderAuthor = (a?: string) => !a || a === '主播' || a === 'UP主'

      const effectiveTitle = !isPlaceholderTitle(playback.title)
        ? playback.title
        : current?.title && !isPlaceholderTitle(current.title)
          ? current.title
          : playback.title
      const effectiveAuthor = !isPlaceholderAuthor(playback.artist)
        ? playback.artist
        : current?.author && !isPlaceholderAuthor(current.author)
          ? current.author
          : playback.artist
      const effectiveMid = playback.mid ?? current?.mid
      const effectiveArtwork = playback.artwork ?? current?.artwork
      const isLive = Boolean(playback.isLive ?? current?.isLive ?? playback.bvid?.startsWith('live:'))
      const roomId = playback.roomId ?? current?.roomId

      const cleanPlayback = {
        ...playback,
        title: effectiveTitle,
        artist: effectiveAuthor,
        mid: effectiveMid,
        artwork: effectiveArtwork,
        isLive,
        roomId,
      }

      const updatedCurrent: BilibiliVideo = {
        bvid: playback.bvid || current?.bvid || '',
        title: effectiveTitle,
        author: effectiveAuthor,
        mid: effectiveMid,
        artwork: effectiveArtwork,
        duration: playback.duration || current?.duration || 0,
        isLive,
        roomId,
      }

      let queue = state.queue
      if (playback.pages && playback.pages.length > 0) {
        queue = {
          video: updatedCurrent,
          page: playback.page || 1,
          pages: playback.pages,
        }
      }

      return {
        playback: { ...cleanPlayback, at: now },
        playing: isLive ? playback.status !== 'paused' : playback.status === 'playing',
        current: updatedCurrent,
        queue,
      }
    })
    rememberWatched()
  } else {
    useBilibili.setState({ playback: null, playing: false })
  }
}

export function positionOf(playback: BilibiliState['playback'], now: number): number {
  if (!playback) return 0
  const run = playback.status === 'playing' ? (now - playback.at) / 1000 : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

export function positionNow(): number {
  const { playback } = useBilibili.getState()
  return positionOf(playback, performance.now())
}

function rememberWatched(): void {
  const { current, playback } = useBilibili.getState()
  if (!current || !playback) return
  const pos = positionNow()
  if (pos < 3) return
  const duration = playback.duration || current.duration || 0
  const entry: BilibiliWatched = {
    video: current,
    time: Math.round(pos),
    duration: Math.round(duration),
  }
  useBilibili.setState((state) => {
    const list = state.watched.filter((w) => w.video.bvid !== current.bvid)
    return { watched: [entry, ...list].slice(0, WATCHED_KEPT) }
  })
}

export function play(video?: BilibiliVideo, openPlayer = true, page?: number): void {
  const { queue } = useBilibili.getState()
  if (video) {
    const now = performance.now()
    const isLive = Boolean(video.isLive || video.roomId || video.bvid?.startsWith('live:'))
    send({ action: 'play', video, page })
    useBilibili.setState({
      current: video,
      open: openPlayer,
      playback: {
        bvid: video.bvid,
        title: video.title,
        artist: video.author,
        artwork: video.artwork,
        mid: video.mid,
        duration: isLive ? 0 : video.duration || 300,
        position: 0,
        status: 'playing',
        at: now,
        page: page || 1,
        isLive,
        roomId: video.roomId,
      },
      playing: true,
      returnToPlayer: openPlayer,
    })
    if (!isLive) {
      // Fetch related recommendations
      ask({ ask: 'related', bvid: video.bvid }).then((ans) => {
        if (ans.videos) useBilibili.setState({ related: ans.videos })
      })
      // Fetch multi-part pagelist
      ask({ ask: 'playlist', bvid: video.bvid }).then((ans) => {
        if (ans.pages && ans.pages.length > 0) {
          useBilibili.setState({
            queue: {
              video,
              page: page || 1,
              pages: ans.pages,
            },
          })
        }
      })
    }
  } else if (page !== undefined && queue) {
    send({ action: 'play', video: queue.video, page })
    useBilibili.setState({
      queue: { ...queue, page },
      open: openPlayer,
    })
  } else {
    send({ action: 'play' })
    const { playback } = useBilibili.getState()
    if (playback) {
      useBilibili.setState({
        playback: { ...playback, status: 'playing', at: performance.now() },
        playing: true,
      })
    }
  }
}

export function replay(): void {
  const { current, queue } = useBilibili.getState()
  seek(0)
  if (queue) {
    play(queue.video, true, queue.page)
  } else if (current) {
    play(current, true)
  } else {
    send({ action: 'seek', seconds: 0 })
    send({ action: 'play' })
    useBilibili.setState((state) => ({
      playback: state.playback ? { ...state.playback, position: 0, status: 'playing', at: performance.now() } : null,
      playing: true,
    }))
  }
}

export function playOrPause(): void {
  const { playing, playback } = useBilibili.getState()
  const isLive = Boolean(playback?.isLive || playback?.bvid?.startsWith('live:'))
  const isPlayingNow = Boolean(playing || playback?.status === 'playing' || (isLive && playback?.status !== 'paused'))

  if (playback?.status === 'ended') {
    replay()
    return
  }
  if (isPlayingNow) {
    send({ action: 'pause' })
    if (playback) {
      const now = performance.now()
      useBilibili.setState({
        playback: { ...playback, position: positionOf(playback, now), status: 'paused', at: now },
        playing: false,
      })
    } else {
      useBilibili.setState({ playing: false })
    }
  } else {
    send({ action: 'play' })
    if (playback) {
      const now = performance.now()
      useBilibili.setState({
        playback: { ...playback, status: 'playing', at: now },
        playing: true,
      })
    } else {
      useBilibili.setState({ playing: true })
    }
  }
}

export function seek(seconds: number): void {
  const safe = Math.max(0, seconds)
  send({ action: 'seek', seconds: safe })
  const { playback } = useBilibili.getState()
  if (playback) {
    useBilibili.setState({
      playback: { ...playback, position: safe, at: performance.now() },
    })
  }
}

export function seekBy(seconds: number): void {
  const now = positionNow()
  const { playback } = useBilibili.getState()
  const duration = playback?.duration || 1000000
  seek(Math.min(duration, Math.max(0, now + seconds)))
}

export function skip(direction: 1 | -1): void {
  const { queue, related } = useBilibili.getState()
  if (queue && queue.pages.length > 1) {
    const nextPage = queue.page + direction
    if (nextPage >= 1 && nextPage <= queue.pages.length) {
      play(queue.video, true, nextPage)
      return
    }
  }
  if (direction === 1 && related && related.length > 0) {
    play(related[0], true)
    return
  }
  seekBy(direction * 10)
}

export function setQuality(quality: number): void {
  useBilibili.setState({ quality })
  send({ action: 'quality', quality })
}

export function setRate(rate: number): void {
  useBilibili.setState({ rate })
  send({ action: 'rate', rate })
}

export function setDanmaku(on: boolean): void {
  useBilibili.setState({ danmaku: on })
  send({ action: 'danmaku', on })
}

export function toggleDanmaku(): void {
  const { danmaku } = useBilibili.getState()
  setDanmaku(!danmaku)
}

export function sendVolume(percent: number): void {
  const safe = Math.max(0, Math.min(100, Math.round(percent)))
  useBilibili.setState({ volume: safe, muted: false })
  send({ action: 'volume', percent: safe })
}

export function toggleMute(): void {
  const { volume, muted } = useBilibili.getState()
  if (muted) {
    useBilibili.setState({ muted: false })
    send({ action: 'volume', percent: volume })
  } else {
    useBilibili.setState({ muted: true })
    send({ action: 'volume', percent: 0 })
  }
}

export function openPlayer(returnTo = false): void {
  useBilibili.setState({ open: true, returnToPlayer: returnTo })
}

export function reopenPlayer(): void {
  if (useBilibili.getState().current || useBilibili.getState().playback) {
    useBilibili.setState({ open: true, returnToPlayer: false })
  }
}

export function closePlayer(): void {
  useBilibili.setState({ open: false, returnToPlayer: false })
  const placed = shows
  whenTransitionEnds(() => {
    if (shows === placed && !useBilibili.getState().open && !useBilibili.getState().hole) {
      send({ action: 'hide' })
    }
  })
}

export function leavePlayer(): void {
  useBilibili.setState({ open: false, returnToPlayer: useBilibili.getState().current !== null })
  const placed = shows
  whenTransitionEnds(() => {
    if (shows === placed && !useBilibili.getState().open && !useBilibili.getState().hole) {
      send({ action: 'hide' })
    }
  })
}

export function stopVideo(): void {
  send({ action: 'stop' })
  send({ action: 'hide' })
  useBilibili.setState({
    playback: null,
    current: null,
    open: false,
    returnToPlayer: false,
    playing: false,
    queue: null,
    related: null,
  })
}

export function openResults(query: string, filter: 'videos' | 'users' = 'videos'): void {
  useBilibili.setState((state) => ({
    views: [...state.views, { id: `results-${Date.now()}`, kind: 'results', query, filter }],
  }))
}

export function openChannel(channel: { mid: string; name: string; avatar?: string | null }): void {
  if (!channel || !channel.mid || channel.mid === 'undefined') return
  useBilibili.setState((state) => ({
    views: [...state.views, { id: `channel-${channel.mid}-${Date.now()}`, kind: 'channel', channel }],
  }))
}

export function openPlaylist(video: BilibiliVideo): void {
  useBilibili.setState((state) => ({
    views: [...state.views, { id: `playlist-${video.bvid}-${Date.now()}`, kind: 'playlist', video }],
  }))
}

export function goBack(): void {
  useBilibili.setState((state) => ({
    views: state.views.slice(0, -1),
  }))
}

export function clearViews(): void {
  useBilibili.setState({ views: [] })
}

export function rememberSearch(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) return
  useBilibili.setState((state) => {
    const list = state.searches.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())
    return { searches: [trimmed, ...list].slice(0, SEARCHES_KEPT) }
  })
}

export function forgetSearch(query: string): void {
  useBilibili.setState((state) => ({
    searches: state.searches.filter((s) => s !== query),
  }))
}

export function clearSearches(): void {
  useBilibili.setState({ searches: [] })
}

export function clearWatched(): void {
  useBilibili.setState({ watched: [] })
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

/** Release session data while keeping login and the player's preferences. */
export function releaseResource(): void {
  shows++
  for (const answer of waiting.values()) answer({ failed: true })
  waiting.clear()
  const before = useBilibili.getState()
  const kept = {
    searches: before.searches,
    watched: before.watched,
    volume: before.volume,
    muted: before.muted,
    quality: before.quality,
    rate: before.rate,
    danmaku: before.danmaku,
  }
  useBilibili.setState({ ...useBilibili.getInitialState(), ...kept, signedIn: before.signedIn, playing: false })
}
