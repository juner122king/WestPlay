import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  type HongguoAnswers,
  type HongguoCategorySelector,
  type HongguoCommand,
  type HongguoDrama,
  type HongguoDramaDetail,
  type HongguoHomeSection,
  type HongguoPlayback,
  type HongguoQuestion,
  isInHost,
  postToHost,
} from '../../../shared/host'
import type { MediaSource } from '../../../shared/media'
import { whenTransitionEnds } from '../../state/launch'
import type { Hole } from '../youtube/youtube'

export type HongguoTab = 'home' | 'feed' | 'category' | 'rank' | 'library'
export type HongguoContentType = 'real-drama' | 'comic-drama' | 'ai-drama'
export type HongguoRankKind = 'hot-drama' | 'hot-real-drama' | 'hot-comic-drama' | 'hot-ai-drama'

export type HongguoView =
  { id: string; kind: 'detail'; drama: HongguoDrama } | { id: string; kind: 'results'; query: string }

export interface HongguoWatched {
  drama: HongguoDrama
  episode: number
  position: number
  duration: number
  updatedAt: number
}

export interface HongguoNotice {
  reason: 'episode_locked' | 'login_required' | 'unavailable'
  title: string
  detail: string
  accessibleEpisodes?: number
}

export interface HongguoState {
  signedIn: boolean | null
  signingIn: boolean
  playing: boolean | null
  playback: (HongguoPlayback & { at: number }) | null
  currentDrama: HongguoDrama | null
  currentEpisode: number
  currentVid: string | null
  open: boolean
  returnToPlayer: boolean
  tab: HongguoTab
  views: HongguoView[]

  banners: HongguoDrama[]
  sections: HongguoHomeSection[]
  homeLoaded: boolean
  homeLoading: boolean

  feedItems: HongguoDrama[]
  feedSessionId: string | null
  feedCursor: string | null
  feedHasMore: boolean
  feedLoading: boolean
  feedActiveIndex: number

  categoryType: HongguoContentType
  categorySlug: string
  categorySelectors: HongguoCategorySelector[]
  categoryDramas: HongguoDrama[]
  categoryPage: number
  categoryHasMore: boolean
  categoryLoading: boolean

  rankKind: HongguoRankKind
  rankUpdatedText: string
  rankDramas: HongguoDrama[]
  rankPage: number
  rankHasMore: boolean
  rankLoading: boolean

  detailCache: Record<string, HongguoDramaDetail>
  playbackNotice: HongguoNotice | null

  speed: number
  autoNext: boolean
  crop: boolean
  volume: number
  muted: boolean
  hole: Hole | null

  searches: string[]
  watched: HongguoWatched[]
  favorites: HongguoDrama[]
}

const IN_HOST = typeof window !== 'undefined' && isInHost()
const ANSWER_MS = 15000
const SEARCHES_KEPT = 10
const WATCHED_KEPT = 24
const FAVORITES_KEPT = 48

export const HONGGUO_HOT_KEYWORDS = [
  '十八岁太奶奶',
  '总裁',
  '穿书',
  '古装逆袭',
  '战神',
  '玄幻修仙',
  '闪婚甜宠',
  '年代致富',
]

export const HONGGUO_CONTENT_TYPES: { id: HongguoContentType; label: string }[] = [
  { id: 'real-drama', label: '真人剧' },
  { id: 'comic-drama', label: '漫剧' },
  { id: 'ai-drama', label: 'AI剧' },
]

export const HONGGUO_RANK_KINDS: { id: HongguoRankKind; label: string }[] = [
  { id: 'hot-drama', label: '红果热播榜' },
  { id: 'hot-real-drama', label: '真人剧热播榜' },
  { id: 'hot-comic-drama', label: '漫剧热播榜' },
  { id: 'hot-ai-drama', label: 'AI剧热播榜' },
]

export const PREVIEW_BANNERS: HongguoDrama[] = [
  {
    id: '7530119479875882009',
    title: '十八岁太奶奶驾到，重整家族荣耀第二部',
    category: '女强',
    tags: ['女性成长', '都市', '穿越', '女强', '亲情'],
    author: '李柯以 / 屈刚',
    cover:
      'https://p11-novel-seo.byteimg.com/tos-cn-i-wu9im5hjhw/home/316f54ec7d279fe23bb5ed269e8da6cf.png~tplv-wu9im5hjhw-image.image',
    backdrop:
      'https://p11-novel-seo.byteimg.com/tos-cn-i-wu9im5hjhw/home/44cf89bc2c03539a44a2c3476d388e77.png~tplv-wu9im5hjhw-image.image',
    totalEpisodes: 100,
    accessibleEpisodes: 5,
    episodeText: '全100集',
    heatText: '10256万热度',
    scoreText: '评分9.5',
    synopsis: '1955年容遇意外去世，一睁眼穿到了七十年后同名同姓的高中少女身上，整顿家族后辈，开启全新的爽飒人生。',
  },
  {
    id: '7503745441910017049',
    title: '宴律，你的白月光回国了',
    category: '都市爱情',
    tags: ['都市爱情', '破镜重圆', '律师', '现代'],
    author: '红果短剧',
    cover:
      'https://p11-novel-seo.byteimg.com/tos-cn-i-wu9im5hjhw/home/17cb1811364ca40499b124ac8515efdf.png~tplv-wu9im5hjhw-image.image',
    backdrop:
      'https://p11-novel-seo.byteimg.com/tos-cn-i-wu9im5hjhw/home/340e0595f297bd0df021cfe5b5d897a6.png~tplv-wu9im5hjhw-image.image',
    totalEpisodes: 80,
    accessibleEpisodes: 5,
    episodeText: '全80集',
    heatText: '8920万热度',
    scoreText: '评分9.2',
    synopsis: '时隔七年重逢，律界大佬宴矜与顾星晚之间的过往纠葛与未说出口的秘密逐渐揭开。',
  },
  {
    id: '7527125460430375961',
    title: '一品布衣',
    category: '历史古代',
    tags: ['历史古代', '穿越', '逆袭', '大男主'],
    author: '红果短剧',
    cover:
      'https://p11-novel-seo.byteimg.com/tos-cn-i-wu9im5hjhw/home/76080f382f7a6d0a0c74d842409777b9.png~tplv-wu9im5hjhw-image.image',
    backdrop:
      'https://p11-novel-seo.byteimg.com/tos-cn-i-wu9im5hjhw/home/7dc70c6484b5621db980bf8ac4570724.png~tplv-wu9im5hjhw-image.image',
    totalEpisodes: 92,
    accessibleEpisodes: 5,
    episodeText: '全92集',
    heatText: '7850万热度',
    scoreText: '评分9.4',
    synopsis: '现代工程师徐牧穿成市井无赖，遇逃难富家女。乱世之中，他刀弓仗马，誓要护家人活下去。',
  },
]

export const PREVIEW_DRAMAS: HongguoDrama[] = [
  {
    id: '7701935931787316286',
    title: '十八岁太奶奶驾到，重整家族荣耀第五部',
    category: '家族',
    tags: ['家族', '家族振兴', '穿越', '女强'],
    author: '李柯以 / 屈刚',
    cover: 'https://p3-novel.byteimg.com/novel-pic/84a71f1a5d7ef5c9c16a73b74011ef75~tplv-shrink:640:0.image',
    totalEpisodes: 102,
    accessibleEpisodes: 5,
    episodeText: '全102集',
    heatText: '10256万热度',
    scoreText: '评分9.5',
    favoriteText: '353.4万收藏',
    likeText: '54.6万点赞',
    rank: 1,
    synopsis: '纪家大少爷势利前妻突然回来认亲，太奶奶容遇带领纪家全体，扮穷测试真心，反转不断。',
  },
  {
    id: '7702763145030290457',
    title: '万妖图录传第十四季',
    category: '玄幻',
    tags: ['玄幻', '穿越', '战斗'],
    author: '红果漫剧',
    cover: 'https://p3-novel.byteimg.com/novel-pic/973dad4339e00fa9a5d1bf71e6431245~tplv-shrink:640:0.image',
    totalEpisodes: 202,
    accessibleEpisodes: 5,
    episodeText: '全202集',
    heatText: '9840万热度',
    scoreText: '评分9.5',
    rank: 2,
    genre: '205',
    synopsis: '以妖魔之血为墨，以百妖谱为卷，姜月初斩妖夺神通，揭开盛世长安的迷雾。',
  },
  {
    id: '7701328280862854168',
    title: '装穷提亲，娶到全家嫌弃的她',
    category: '恋爱',
    tags: ['恋爱', '乡村', 'AI剧'],
    author: '红果AI剧场',
    cover: 'https://p6-novel.byteimg.com/novel-pic/dd47bf8f4357b931ef542a2f91478aed~tplv-shrink:640:0.image',
    totalEpisodes: 80,
    accessibleEpisodes: 5,
    episodeText: '全80集',
    heatText: '9625万热度',
    scoreText: '评分8.8',
    rank: 3,
    synopsis: '顾承川装穷提亲，被林家塞来不受待见的长女林小满，却被她的真心打动，婚礼当天百万彩礼震撼全场。',
  },
  {
    id: '7704261228037671998',
    title: '和离后我带女儿横扫魔域第二季',
    category: '逆袭',
    tags: ['玄幻', '系统', '逆袭'],
    author: '红果漫剧',
    cover: 'https://p6-novel.byteimg.com/novel-pic/8a4a416112a1d8afef083499e22f6ad3~tplv-shrink:640:0.image',
    totalEpisodes: 521,
    accessibleEpisodes: 5,
    episodeText: '全521集',
    heatText: '8234万热度',
    scoreText: '评分9.3',
    rank: 4,
    statusTags: ['新剧'],
    genre: '205',
    synopsis: '陆清安走出旧日情缘，凭借非凡悟性建立永夜宗，守护子女，踏入鸿蒙圣界。',
  },
  {
    id: '7701651454108371993',
    title: '妹妹心疼我穷，可她婚礼酒店是我的',
    category: '都市',
    tags: ['总裁', '都市', '豪门'],
    author: '红果短剧',
    cover: 'https://p3-novel.byteimg.com/novel-pic/74aa43471924390edd0f4ee2e24c07e8~tplv-shrink:640:0.image',
    totalEpisodes: 60,
    accessibleEpisodes: 5,
    episodeText: '全60集',
    heatText: '5880万热度',
    scoreText: '评分8.4',
    rank: 5,
    synopsis: '霍辞身家千亿，低调参加妹妹婚礼只随礼两百，面对婆家势利轻视，身份揭开令所有人震惊。',
  },
  {
    id: '7702412157731753022',
    title: '退休老头再就业',
    category: '剧情',
    tags: ['剧情', '都市', '职场'],
    author: '红果短剧',
    cover: 'https://p6-novel.byteimg.com/novel-pic/9a37e20f88eb9ee2794ebc3595944501~tplv-shrink:640:0.image',
    totalEpisodes: 88,
    accessibleEpisodes: 5,
    episodeText: '全88集',
    heatText: '5420万热度',
    scoreText: '评分8.9',
    rank: 6,
    synopsis: '退休老将重返职场江湖，凭一身本领破解困局，温暖演绎银发逆袭传奇。',
  },
]

const PREVIEW_SECTIONS: HongguoHomeSection[] = [
  { tabType: 'all', tabName: '热播短剧', dramas: PREVIEW_DRAMAS },
  { tabType: 'human', tabName: '热播真人剧', dramas: [PREVIEW_DRAMAS[0], PREVIEW_DRAMAS[4], PREVIEW_DRAMAS[5]] },
  { tabType: 'comic', tabName: '热播漫剧', dramas: [PREVIEW_DRAMAS[1], PREVIEW_DRAMAS[3]] },
  { tabType: 'ai', tabName: '热播AI剧', dramas: [PREVIEW_DRAMAS[2]] },
]

const PREVIEW_SELECTORS: HongguoCategorySelector[] = [
  { id: 'romance', name: '爱情' },
  { id: 'period', name: '年代' },
  { id: 'comeback', name: '逆袭' },
  { id: 'legend', name: '传奇' },
  { id: 'growth', name: '成长' },
  { id: 'family', name: '家庭' },
  { id: 'urban', name: '都市' },
  { id: 'suspense', name: '悬疑' },
]

export const useHongguo = create<HongguoState>()(
  persist(
    (): HongguoState => ({
      signedIn: IN_HOST ? null : false,
      signingIn: false,
      playing: false,
      playback: null,
      currentDrama: null,
      currentEpisode: 1,
      currentVid: null,
      open: false,
      returnToPlayer: false,
      tab: 'home',
      views: [],

      banners: IN_HOST ? [] : PREVIEW_BANNERS,
      sections: IN_HOST ? [] : PREVIEW_SECTIONS,
      homeLoaded: !IN_HOST,
      homeLoading: false,

      feedItems: IN_HOST ? [] : PREVIEW_DRAMAS,
      feedSessionId: null,
      feedCursor: null,
      feedHasMore: !IN_HOST,
      feedLoading: false,
      feedActiveIndex: 0,

      categoryType: 'real-drama',
      categorySlug: '',
      categorySelectors: IN_HOST ? [] : PREVIEW_SELECTORS,
      categoryDramas: IN_HOST ? [] : PREVIEW_DRAMAS,
      categoryPage: 1,
      categoryHasMore: !IN_HOST,
      categoryLoading: false,

      rankKind: 'hot-drama',
      rankUpdatedText: IN_HOST ? '' : '今日已更新 · 基于红果内观看/互动等综合热度排序',
      rankDramas: IN_HOST ? [] : PREVIEW_DRAMAS,
      rankPage: 1,
      rankHasMore: false,
      rankLoading: false,

      detailCache: {},
      playbackNotice: null,

      speed: 1.0,
      autoNext: true,
      crop: false,
      volume: 100,
      muted: false,
      hole: null,

      searches: [],
      watched: [],
      favorites: [],
    }),
    {
      name: 'westplay.hongguo',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (store) => ({
        searches: store.searches,
        watched: store.watched,
        favorites: store.favorites,
        speed: store.speed,
        autoNext: store.autoNext,
        crop: store.crop,
        volume: store.volume,
        muted: store.muted,
      }),
      merge: (stored, current) => {
        const s = (stored ?? {}) as Partial<HongguoState>
        return {
          ...current,
          searches: Array.isArray(s.searches) ? s.searches.slice(0, SEARCHES_KEPT) : [],
          watched: Array.isArray(s.watched) ? s.watched.slice(0, WATCHED_KEPT) : [],
          favorites: Array.isArray(s.favorites) ? s.favorites.slice(0, FAVORITES_KEPT) : [],
          speed: typeof s.speed === 'number' && s.speed > 0 ? s.speed : 1.0,
          autoNext: s.autoNext !== undefined ? Boolean(s.autoNext) : true,
          crop: Boolean(s.crop),
          volume: typeof s.volume === 'number' ? Math.max(0, Math.min(100, s.volume)) : 100,
          muted: Boolean(s.muted),
        }
      },
    },
  ),
)

let shows = 0

export function send(command: HongguoCommand): void {
  if (command.action === 'show') shows++
  if (isInHost()) postToHost({ type: 'hongguo', command })
}

let questionId = 0
const waiting = new Map<number, (answer: HongguoAnswers) => void>()

export function ask(question: HongguoQuestion): Promise<HongguoAnswers> {
  if (!isInHost()) {
    if (question.ask === 'home' || question.ask === 'catalog' || question.ask === 'featured') {
      return Promise.resolve({ banners: PREVIEW_BANNERS, sections: PREVIEW_SECTIONS, dramas: PREVIEW_DRAMAS })
    }
    if (question.ask === 'feed') {
      return Promise.resolve({ dramas: PREVIEW_DRAMAS, sessionId: 'preview', nextCursor: '2', hasMore: false })
    }
    if (question.ask === 'category') {
      const list =
        question.contentType === 'comic-drama'
          ? PREVIEW_DRAMAS.filter((d) => d.genre === '205')
          : question.contentType === 'ai-drama'
            ? [PREVIEW_DRAMAS[2]]
            : PREVIEW_DRAMAS
      return Promise.resolve({
        selectors: PREVIEW_SELECTORS,
        dramas: list,
        pageNum: question.page ?? 1,
        totalPages: 1,
        hasMore: false,
      })
    }
    if (question.ask === 'rank') {
      return Promise.resolve({
        dramas: PREVIEW_DRAMAS,
        updatedText: '今日已更新 · 基于红果内观看/互动等综合热度排序',
        pageNum: 1,
        totalPages: 1,
        hasMore: false,
      })
    }
    if (question.ask === 'suggest') {
      const q = question.query.trim()
      const suggestions = q
        ? HONGGUO_HOT_KEYWORDS.filter((k) => k.includes(q))
            .concat([`${q} 全集`, `${q} 短剧`])
            .slice(0, 6)
        : []
      return Promise.resolve({ suggestions })
    }
    if (question.ask === 'search') {
      const q = question.query.trim().toLowerCase()
      const matched = PREVIEW_DRAMAS.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.synopsis ?? '').toLowerCase().includes(q) ||
          (d.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      )
      return Promise.resolve({ dramas: matched.length > 0 ? matched : PREVIEW_DRAMAS.slice(0, 3), hasMore: false })
    }
    if (question.ask === 'detail' || question.ask === 'episodes') {
      const drama =
        PREVIEW_DRAMAS.find((d) => d.id === question.dramaId) ||
        PREVIEW_BANNERS.find((d) => d.id === question.dramaId) ||
        PREVIEW_DRAMAS[0]
      const total = drama.totalEpisodes || 80
      const acc = drama.accessibleEpisodes ?? 5
      const vidList = Array.from({ length: total }, (_, i) => `${drama.id}_ep_${i + 1}`)
      return Promise.resolve({
        detail: {
          drama: { ...drama, vidList },
          celebrities: [
            { id: 'c1', name: '李柯以', role: '饰 主角' },
            { id: 'c2', name: '屈刚', role: '饰 配角' },
          ],
          vidList,
          accessibleEpisodes: acc,
          favoriteCount: '353.4万',
          likeCount: '54.6万',
          reviewCount: '4.1万',
          recommendations: PREVIEW_DRAMAS.filter((d) => d.id !== drama.id).slice(0, 4),
        },
        episodes: Array.from({ length: total }, (_, i) => ({
          episode: i + 1,
          vid: vidList[i],
          title: `第 ${i + 1} 集`,
          accessible: i + 1 <= acc,
        })),
      })
    }
    return Promise.resolve({ dramas: PREVIEW_DRAMAS })
  }

  const id = ++questionId
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id)
      resolve({ failed: true, error: '请求超时，请检查网络连接' })
    }, ANSWER_MS)
    waiting.set(id, (answer) => {
      clearTimeout(timer)
      resolve(answer)
    })
    send({ action: 'ask', id, question })
  })
}

export function receiveAnswer(id: number, answer: HongguoAnswers): void {
  const handler = waiting.get(id)
  if (handler) {
    waiting.delete(id)
    handler(answer)
  }
}

let homeSeq = 0
export async function loadHome(force = false): Promise<void> {
  const state = useHongguo.getState()
  if (!force && (state.homeLoaded || state.homeLoading)) return
  const seq = ++homeSeq
  useHongguo.setState({ homeLoading: true })
  const ans = await ask({ ask: 'home' })
  if (seq !== homeSeq) return
  if (!ans.failed) {
    useHongguo.setState({
      banners: ans.banners ?? state.banners,
      sections: ans.sections ?? state.sections,
      homeLoaded: true,
      homeLoading: false,
    })
  } else {
    useHongguo.setState({ homeLoading: false })
  }
}

let feedSeq = 0
export async function loadFeed(more = false): Promise<void> {
  const state = useHongguo.getState()
  if (!more && state.feedItems.length > 0 && state.feedSessionId) return
  if (more && !state.feedHasMore) return
  const seq = ++feedSeq
  useHongguo.setState({ feedLoading: true })
  const ans = await ask({
    ask: 'feed',
    cursor: more ? (state.feedCursor ?? undefined) : undefined,
    sessionId: more ? (state.feedSessionId ?? undefined) : undefined,
    shownEntryIds: more ? state.feedItems.map((d) => d.entryId).filter((x): x is string => Boolean(x)) : undefined,
  })
  if (seq !== feedSeq) return
  if (!ans.failed && ans.dramas) {
    const existing = more ? state.feedItems : []
    const seen = new Set(existing.map((d) => d.id))
    const merged = [...existing, ...ans.dramas.filter((d) => !seen.has(d.id))]
    useHongguo.setState({
      feedItems: merged,
      feedSessionId: ans.sessionId ?? state.feedSessionId,
      feedCursor: ans.nextCursor ?? null,
      feedHasMore: Boolean(ans.hasMore),
      feedLoading: false,
    })
  } else {
    useHongguo.setState({ feedLoading: false })
  }
}

export async function refreshFeed(): Promise<void> {
  useHongguo.setState({ feedItems: [], feedCursor: null, feedSessionId: null, feedActiveIndex: 0 })
  await loadFeed(false)
}

let categorySeq = 0
export async function loadCategory(
  contentType = useHongguo.getState().categoryType,
  slug = useHongguo.getState().categorySlug,
  page = 1,
): Promise<void> {
  const seq = ++categorySeq
  const isFirstPage = page <= 1
  useHongguo.setState({
    categoryType: contentType,
    categorySlug: slug,
    categoryLoading: true,
    ...(isFirstPage ? { categoryDramas: [], categoryPage: 1 } : {}),
  })
  const ans = await ask({ ask: 'category', contentType, slug: slug || undefined, page })
  if (seq !== categorySeq) return
  if (!ans.failed) {
    const prev = isFirstPage ? [] : useHongguo.getState().categoryDramas
    const seen = new Set(prev.map((d) => d.id))
    const nextList = [...prev, ...(ans.dramas ?? []).filter((d) => !seen.has(d.id))]
    useHongguo.setState({
      categorySelectors:
        ans.selectors && ans.selectors.length > 0 ? ans.selectors : useHongguo.getState().categorySelectors,
      categoryDramas: nextList,
      categoryPage: ans.pageNum ?? page,
      categoryHasMore: Boolean(ans.hasMore),
      categoryLoading: false,
    })
  } else {
    useHongguo.setState({ categoryLoading: false })
  }
}

let rankSeq = 0
export async function loadRank(kind = useHongguo.getState().rankKind, page = 1): Promise<void> {
  const seq = ++rankSeq
  const isFirstPage = page <= 1
  useHongguo.setState({
    rankKind: kind,
    rankLoading: true,
    ...(isFirstPage ? { rankDramas: [], rankPage: 1 } : {}),
  })
  const ans = await ask({ ask: 'rank', kind, page })
  if (seq !== rankSeq) return
  if (!ans.failed) {
    const prev = isFirstPage ? [] : useHongguo.getState().rankDramas
    const seen = new Set(prev.map((d) => d.id))
    const nextList = [...prev, ...(ans.dramas ?? []).filter((d) => !seen.has(d.id))]
    useHongguo.setState({
      rankUpdatedText: ans.updatedText || useHongguo.getState().rankUpdatedText,
      rankDramas: nextList,
      rankPage: ans.pageNum ?? page,
      rankHasMore: Boolean(ans.hasMore),
      rankLoading: false,
    })
  } else {
    useHongguo.setState({ rankLoading: false })
  }
}

/** Verify a fetched detail payload carries real metadata rather than a generic fallback placeholder. */
export function isValidDramaDetail(detail?: HongguoDramaDetail | null): detail is HongguoDramaDetail {
  if (!detail?.drama) return false
  const title = detail.drama.title?.trim()
  return Boolean(title && (title !== '红果短剧' || detail.vidList.length > 0 || detail.drama.cover))
}

/** Merge fetched drama detail onto a summary card without ever clobbering real metadata with blanks. */
export function mergeDramaDetail(summary: HongguoDrama, detail?: HongguoDramaDetail | null): HongguoDrama {
  const rich = isValidDramaDetail(detail) ? detail.drama : undefined
  if (!rich) return summary
  return {
    ...summary,
    ...rich,
    title: rich.title && rich.title !== '红果短剧' ? rich.title : summary.title,
    cover: rich.cover || summary.cover,
    backdrop: rich.backdrop || summary.backdrop,
    category: rich.category || summary.category,
    tags: rich.tags?.length ? rich.tags : summary.tags,
    author: rich.author || summary.author,
    synopsis: rich.synopsis || summary.synopsis,
    heatText: rich.heatText || summary.heatText,
    scoreText: rich.scoreText || summary.scoreText,
    totalEpisodes: rich.totalEpisodes || summary.totalEpisodes || detail?.vidList.length || 0,
    accessibleEpisodes: rich.accessibleEpisodes ?? summary.accessibleEpisodes,
    episodeText: rich.episodeText || summary.episodeText,
    vidList: rich.vidList?.length ? rich.vidList : detail?.vidList?.length ? detail.vidList : summary.vidList,
  }
}

const detailInFlight = new Map<string, Promise<HongguoDramaDetail | null>>()

export async function loadDramaDetail(dramaId: string): Promise<HongguoDramaDetail | null> {
  const cached = useHongguo.getState().detailCache[dramaId]
  if (isValidDramaDetail(cached) && cached.vidList.length > 0) return cached
  const pending = detailInFlight.get(dramaId)
  if (pending) return pending

  const req = (async () => {
    const ans = await ask({ ask: 'detail', dramaId })
    if (!ans.failed && isValidDramaDetail(ans.detail)) {
      useHongguo.setState((s) => ({
        detailCache: { ...s.detailCache, [dramaId]: ans.detail! },
      }))
      return ans.detail
    }
    return null
  })().finally(() => {
    detailInFlight.delete(dramaId)
  })
  detailInFlight.set(dramaId, req)
  return req
}

export function sendStart(): void {
  send({ action: 'start' })
  const { speed, autoNext, volume, muted } = useHongguo.getState()
  send({ action: 'setSpeed', speed })
  send({ action: 'setAutoNext', on: autoNext })
  send({ action: 'volume', percent: muted ? 0 : volume })
  loadHome()
}

export function sendSignIn(): void {
  send({ action: 'signIn' })
}

export function sendSignOut(): void {
  send({ action: 'signOut' })
}

export function receiveState(signedIn: boolean | null, playing: boolean | null, signingIn: boolean): void {
  useHongguo.setState((state) => ({
    signedIn,
    signingIn,
    playing: state.playback ? state.playback.status === 'playing' : playing,
  }))
}

function noticeForError(error: string, accessibleEpisodes?: number): HongguoNotice {
  if (error === 'login_required') {
    return {
      reason: 'login_required',
      title: '需要登录红果账号观看',
      detail: '请在电脑桌面上完成扫码登录后继续播放本集。',
      accessibleEpisodes,
    }
  }
  if (error === 'episode_locked') {
    const countText = accessibleEpisodes && accessibleEpisodes > 0 ? `前 ${accessibleEpisodes} 集` : '试看集数'
    return {
      reason: 'episode_locked',
      title: `网页端仅支持试看${countText}`,
      detail: '后续剧集受平台版权保护，需前往红果短剧 App 观看完整全集。',
      accessibleEpisodes,
    }
  }
  return {
    reason: 'unavailable',
    title: '当前剧集暂无法播放',
    detail: '视频流加载异常，建议切换其他剧集或下一部热播短剧。',
    accessibleEpisodes,
  }
}

export function receivePlayback(playback: HongguoPlayback | null): void {
  const now = performance.now()
  if (!playback) {
    useHongguo.setState({ playback: null, playing: false })
    return
  }

  const state = useHongguo.getState()
  if (!state.currentDrama && (playback.status === 'paused' || !playback.dramaId)) {
    return
  }

  const notice = playback.error ? noticeForError(playback.error, playback.accessibleEpisodes) : null
  const ep = playback.episode ?? playback.episodeNumber ?? state.currentEpisode ?? 1
  const currentDrama = state.currentDrama
    ? {
        ...state.currentDrama,
        ...(playback.totalEpisodes ? { totalEpisodes: playback.totalEpisodes } : {}),
        ...(playback.accessibleEpisodes !== undefined ? { accessibleEpisodes: playback.accessibleEpisodes } : {}),
        ...(playback.artwork && !state.currentDrama.cover ? { cover: playback.artwork } : {}),
      }
    : playback.dramaId
      ? {
          id: playback.dramaId,
          title: playback.dramaTitle || playback.title,
          author: playback.author || playback.artist || '红果短剧',
          cover: playback.artwork,
          totalEpisodes: playback.totalEpisodes || 0,
          accessibleEpisodes: playback.accessibleEpisodes,
        }
      : null

  useHongguo.setState({
    playback: { ...playback, at: now },
    playing: playback.status === 'playing',
    currentDrama,
    currentEpisode: ep,
    currentVid: playback.vid ?? state.currentVid,
    ...(notice ? { playbackNotice: notice } : playback.status === 'playing' ? { playbackNotice: null } : {}),
  })

  if (currentDrama && playback.position >= 3) {
    rememberWatched(currentDrama, ep, playback.position, playback.duration)
  }
}

/** Format playback seconds as `m:ss` or `h:mm:ss` for automotive HUD displays. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function positionOf(playback: HongguoState['playback'], now: number): number {
  if (!playback) return 0
  const speed = playback.speed || useHongguo.getState().speed || 1.0
  const run = playback.status === 'playing' ? ((now - playback.at) / 1000) * speed : 0
  const end = playback.duration || Number.POSITIVE_INFINITY
  return Math.min(end, playback.position + run)
}

export function positionNow(): number {
  const { playback } = useHongguo.getState()
  return positionOf(playback, performance.now())
}

function rememberWatched(drama: HongguoDrama, episode: number, position: number, duration: number): void {
  const entry: HongguoWatched = {
    drama,
    episode,
    position: Math.round(position),
    duration: Math.round(duration || 120),
    updatedAt: Date.now(),
  }
  useHongguo.setState((state) => ({
    watched: [entry, ...state.watched.filter((w) => w.drama.id !== drama.id)].slice(0, WATCHED_KEPT),
  }))
}

export function play(drama?: HongguoDrama, episodeNumber?: number, openPlayer = true, vid?: string): void {
  const state = useHongguo.getState()
  const detail = drama
    ? state.detailCache[drama.id]
    : state.currentDrama
      ? state.detailCache[state.currentDrama.id]
      : undefined
  const target = drama
    ? {
        ...drama,
        ...(detail?.drama ?? {}),
        vidList: drama.vidList?.length ? drama.vidList : detail?.vidList,
        accessibleEpisodes: drama.accessibleEpisodes ?? detail?.accessibleEpisodes,
      }
    : state.currentDrama || state.banners[0] || state.sections[0]?.dramas[0] || PREVIEW_DRAMAS[0]

  if (!target) return
  const ep = Math.max(
    1,
    episodeNumber ?? (drama && drama.id !== state.currentDrama?.id ? 1 : state.currentEpisode) ?? 1,
  )
  const resolvedVid = vid || target.vidList?.[ep - 1]
  const now = performance.now()

  send({ action: 'play', drama: target, episode: ep, vid: resolvedVid })

  useHongguo.setState({
    currentDrama: target,
    currentEpisode: ep,
    currentVid: resolvedVid ?? null,
    open: openPlayer,
    returnToPlayer: openPlayer,
    playbackNotice: null,
    playing: true,
    playback: {
      dramaId: target.id,
      vid: resolvedVid,
      title: `${target.title} · 第${ep}集`,
      dramaTitle: target.title,
      episodeTitle: `第${ep}集`,
      artist: target.author || '红果短剧',
      author: target.author || '红果短剧',
      artwork: target.cover,
      episode: ep,
      episodeNumber: ep,
      totalEpisodes: target.totalEpisodes || undefined,
      accessibleEpisodes: target.accessibleEpisodes,
      duration: 120,
      position: 0,
      status: 'playing',
      speed: state.speed,
      autoNext: state.autoNext,
      at: now,
    },
  })

  if (!detail) {
    loadDramaDetail(target.id)
  }
  rememberWatched(target, ep, 0, 120)
}

export function replay(): void {
  const { currentDrama, currentEpisode, currentVid } = useHongguo.getState()
  if (currentDrama) {
    play(currentDrama, currentEpisode, true, currentVid ?? undefined)
  } else {
    seek(0)
    send({ action: 'play' })
  }
}

export function playOrPause(): void {
  const { playing, playback } = useHongguo.getState()
  if (playback?.status === 'ended') {
    replay()
    return
  }
  if (playing) {
    send({ action: 'pause' })
    if (playback) {
      const now = performance.now()
      useHongguo.setState({
        playback: { ...playback, position: positionOf(playback, now), status: 'paused', at: now },
        playing: false,
      })
    } else {
      useHongguo.setState({ playing: false })
    }
  } else {
    send({ action: 'play' })
    if (playback) {
      useHongguo.setState({
        playback: { ...playback, status: 'playing', at: performance.now() },
        playing: true,
        playbackNotice: null,
      })
    } else {
      play()
    }
  }
}

export function skip(direction: 1 | -1): void {
  const { currentDrama, currentEpisode, open } = useHongguo.getState()
  if (!currentDrama) return
  const total = currentDrama.totalEpisodes || Number.POSITIVE_INFINITY
  const targetEp = Math.max(1, Math.min(total, currentEpisode + direction))
  if (targetEp === currentEpisode && direction === -1) {
    seek(0)
    return
  }
  selectEpisode(targetEp, open)
}

export function selectEpisode(episode: number, openPlayer?: boolean): void {
  const state = useHongguo.getState()
  const drama = state.currentDrama
  const ep = Math.max(1, episode)
  const detail = drama ? state.detailCache[drama.id] : undefined
  const vid = detail?.vidList[ep - 1] ?? drama?.vidList?.[ep - 1]

  send({ action: 'selectEpisode', episode: ep, vid })
  const now = performance.now()
  useHongguo.setState({
    currentEpisode: ep,
    currentVid: vid ?? null,
    playbackNotice: null,
    playing: true,
    ...(openPlayer !== undefined ? { open: openPlayer, returnToPlayer: openPlayer } : {}),
    ...(drama
      ? {
          playback: {
            ...(state.playback ?? {
              duration: 120,
              artist: drama.author || '红果短剧',
              author: drama.author || '红果短剧',
              artwork: drama.cover,
            }),
            dramaId: drama.id,
            vid,
            title: `${drama.title} · 第${ep}集`,
            dramaTitle: drama.title,
            episodeTitle: `第${ep}集`,
            episode: ep,
            episodeNumber: ep,
            totalEpisodes: drama.totalEpisodes || undefined,
            accessibleEpisodes: drama.accessibleEpisodes ?? detail?.accessibleEpisodes,
            position: 0,
            status: 'playing',
            speed: state.speed,
            autoNext: state.autoNext,
            error: undefined,
            at: now,
          },
        }
      : {}),
  })
}

export function seek(seconds: number): void {
  const safe = Math.max(0, seconds)
  send({ action: 'seek', seconds: safe })
  const { playback } = useHongguo.getState()
  if (playback) {
    useHongguo.setState({
      playback: {
        ...playback,
        position: safe,
        at: performance.now(),
        ...(playback.status === 'ended' ? { status: 'paused' } : {}),
      },
    })
  }
}

export function seekBy(seconds: number): void {
  const now = positionNow()
  const duration = useHongguo.getState().playback?.duration || 1000000
  seek(Math.min(duration, Math.max(0, now + seconds)))
}

export function setSpeed(speed: number): void {
  useHongguo.setState({ speed })
  send({ action: 'setSpeed', speed })
}

export function setAutoNext(autoNext: boolean): void {
  useHongguo.setState({ autoNext })
  send({ action: 'setAutoNext', on: autoNext })
}

export function setCrop(crop: boolean): void {
  useHongguo.setState({ crop })
  send({ action: 'crop', on: crop })
}

export function sendVolumePercent(percent: number): void {
  const safe = Math.max(0, Math.min(100, Math.round(percent)))
  useHongguo.setState({ volume: safe, muted: safe === 0 })
  send({ action: 'volume', percent: safe })
}

export function toggleMute(): void {
  const { volume, muted } = useHongguo.getState()
  if (muted) {
    const restored = volume > 0 ? volume : 80
    useHongguo.setState({ muted: false, volume: restored })
    send({ action: 'volume', percent: restored })
  } else {
    useHongguo.setState({ muted: true })
    send({ action: 'volume', percent: 0 })
  }
}

export function openPlayer(returnTo = false): void {
  useHongguo.setState({ open: true, returnToPlayer: returnTo })
}

export function reopenPlayer(): void {
  if (useHongguo.getState().currentDrama || useHongguo.getState().playback) {
    useHongguo.setState({ open: true, returnToPlayer: false })
  }
}

export function closePlayer(): void {
  useHongguo.setState({ open: false, returnToPlayer: false })
  const placed = shows
  whenTransitionEnds(() => {
    if (shows === placed && !useHongguo.getState().open && !useHongguo.getState().hole) {
      send({ action: 'hide' })
    }
  })
}

export function leavePlayer(): void {
  useHongguo.setState((s) => ({ open: false, returnToPlayer: s.currentDrama !== null }))
  const placed = shows
  whenTransitionEnds(() => {
    if (shows === placed && !useHongguo.getState().open && !useHongguo.getState().hole) {
      send({ action: 'hide' })
    }
  })
}

export function stopDrama(): void {
  send({ action: 'stop' })
  send({ action: 'hide' })
  useHongguo.setState({
    playback: null,
    currentDrama: null,
    currentVid: null,
    playing: false,
    open: false,
    returnToPlayer: false,
    playbackNotice: null,
  })
}

export function selectTab(tab: HongguoTab): void {
  useHongguo.setState({ tab, views: [] })
  if (tab === 'home') loadHome()
  else if (tab === 'feed') loadFeed()
  else if (tab === 'category') {
    const s = useHongguo.getState()
    if (s.categoryDramas.length === 0) loadCategory(s.categoryType, s.categorySlug, 1)
  } else if (tab === 'rank') {
    const s = useHongguo.getState()
    if (s.rankDramas.length === 0) loadRank(s.rankKind, 1)
  }
}

export function openDetail(drama: HongguoDrama): void {
  useHongguo.setState((state) => ({
    views: [...state.views, { id: `detail-${drama.id}-${Date.now()}`, kind: 'detail', drama }],
  }))
  loadDramaDetail(drama.id)
}

export function openResults(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) return
  rememberSearch(trimmed)
  useHongguo.setState((state) => ({
    views: [...state.views, { id: `results-${Date.now()}`, kind: 'results', query: trimmed }],
  }))
}

export function goBack(): void {
  useHongguo.setState((state) => ({
    views: state.views.slice(0, -1),
  }))
}

export function toggleFavorite(drama: HongguoDrama): void {
  useHongguo.setState((state) => {
    const exists = state.favorites.some((f) => f.id === drama.id)
    const favorites = exists
      ? state.favorites.filter((f) => f.id !== drama.id)
      : [drama, ...state.favorites].slice(0, FAVORITES_KEPT)
    return { favorites }
  })
}

export function isFavorite(dramaId: string): boolean {
  return useHongguo.getState().favorites.some((f) => f.id === dramaId)
}

export function rememberSearch(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) return
  useHongguo.setState((state) => ({
    searches: [trimmed, ...state.searches.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())].slice(
      0,
      SEARCHES_KEPT,
    ),
  }))
}

export function forgetSearch(query: string): void {
  useHongguo.setState((state) => ({
    searches: state.searches.filter((s) => s !== query),
  }))
}

export function clearSearches(): void {
  useHongguo.setState({ searches: [] })
}

export function clearWatched(): void {
  useHongguo.setState({ watched: [] })
}

export function dismissNotice(): void {
  useHongguo.setState({ playbackNotice: null })
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
