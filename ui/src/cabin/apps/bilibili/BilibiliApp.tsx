import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type BilibiliAnswers,
  type BilibiliChannel,
  type BilibiliDynamicItem,
  type BilibiliLiveRoom,
  type BilibiliMovieItem,
  type BilibiliQuestion,
  type BilibiliVideo,
  type BilibiliVideoPage,
  isInHost,
} from '../../../shared/host'
import { SearchGlyph } from '../../keyboard/glyphs'
import { useKeyboard } from '../../keyboard/store'
import { TextField } from '../../keyboard/TextField'
import {
  BackGlyph,
  CloseGlyph,
  FillGlyph,
  HistoryGlyph,
  PauseGlyph,
  PersonGlyph,
  PlayGlyph,
} from '../youtube/glyphs'
import { VideoHole } from '../youtube/VideoHole'
import {
  ask,
  clearSearches,
  clearWatched,
  forgetSearch,
  goBack,
  openChannel,
  openPlayer,
  openResults,
  play,
  playOrPause,
  rememberSearch,
  sendSignIn,
  sendSignOut,
  sendStart,
  stopVideo,
  useBilibili,
  type BilibiliView,
  type BilibiliWatched,
} from './bilibili'
import './bilibili.css'

const FIELD = 'bilibili-search'

const PRESET_CHIPS = ['车载音乐', '欧卡驾驶', '科技数码', '热门单曲', '影视解说', '二次元', '户外自驾']

const TRENDING_SEARCHES = [
  { rank: 1, title: '欧卡2 极限重载运输', tag: '热' },
  { rank: 2, title: '4K 车载沉浸式自驾', tag: '热' },
  { rank: 3, title: '车载无损音乐大碟', tag: '新' },
  { rank: 4, title: '夜间雨天自驾ASMR', tag: '' },
  { rank: 5, title: 'Steam 年度高分大作', tag: '' },
  { rank: 6, title: '赛博朋克2077 往日之影', tag: '' },
  { rank: 7, title: '黑神话悟空 隐藏支线', tag: '' },
  { rank: 8, title: '科技数码 降噪车机横评', tag: '' },
]

export interface LiveAreaItem {
  label: string
  parentAreaId: number
  icon?: string
}

const LIVE_AREAS: LiveAreaItem[] = [
  { label: '全部精选', parentAreaId: 0, icon: '✨' },
  { label: '单机·驾驶', parentAreaId: 6, icon: '🚚' },
  { label: '网游竞技', parentAreaId: 2, icon: '⚔️' },
  { label: '手机游戏', parentAreaId: 3, icon: '📱' },
  { label: '虚拟主播', parentAreaId: 9, icon: '🎭' },
  { label: '娱乐日常', parentAreaId: 1, icon: '🎉' },
  { label: '语音电台', parentAreaId: 5, icon: '📻' },
]

function SparkleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="currentColor">
      <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
    </svg>
  )
}

function SignalGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1.5" fill="currentColor" />
    </svg>
  )
}

function FireGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="currentColor">
      <path d="M12 23c-4.4 0-8-3.6-8-8 0-4.8 4.2-9.6 6.3-11.7.5-.5 1.3-.3 1.5.3.6 1.7 1.7 4 3.2 4.4 2 .6 3 2.5 3 4.5 0 1-.3 2-.8 2.8 1.4-.4 2.8-1.5 3.3-2.6.2-.5 1-.4 1.1.1.9 3.5-.8 10.2-9.6 10.2z" />
    </svg>
  )
}

function LiveBroadcastGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M16.2 7.8a6 6 0 0 1 0 8.4m-8.4-8.4a6 6 0 0 0 0 8.4" />
      <path d="M19.1 4.9a10 10 0 0 1 0 14.2m-14.2-14.2a10 10 0 0 0 0 14.2" />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function CompassGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" />
    </svg>
  )
}

function FilmGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="4" />
      <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5" />
    </svg>
  )
}

function SortGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M6 12h12M10 18h4" />
    </svg>
  )
}

function RefreshGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  )
}

export interface MovieCategory {
  seasonType: number
  label: string
  icon?: string
}

const MOVIE_CATEGORIES: MovieCategory[] = [
  { seasonType: 2, label: '电影', icon: '🎬' },
  { seasonType: 5, label: '电视剧', icon: '📺' },
  { seasonType: 3, label: '纪录片', icon: '🎞️' },
  { seasonType: 7, label: '综艺', icon: '🎪' },
  { seasonType: 1, label: '番剧', icon: '🌸' },
]

export interface MovieSortOption {
  order: number
  label: string
  icon?: string
}

const MOVIE_SORT_OPTIONS: MovieSortOption[] = [
  { order: 3, label: '最热追剧', icon: '🔥' },
  { order: 2, label: '最高播放', icon: '▶' },
  { order: 4, label: '高分必看', icon: '⭐' },
  { order: 0, label: '最新上映', icon: '🕒' },
]

export function BilibiliApp() {
  const views = useBilibili((store) => store.views)
  const [query, setQuery] = useState('')
  const typing = useKeyboard((state) => state.field?.id === FIELD)

  useEffect(() => {
    sendStart()
  }, [])

  useEffect(() => {
    if (useBilibili.getState().returnToPlayer) openPlayer(true)
  }, [])

  const search = (wanted: string) => {
    const trimmed = wanted.trim()
    if (!trimmed) return
    rememberSearch(trimmed)
    setQuery(trimmed)
    useKeyboard.getState().detach(FIELD)
    openResults(trimmed)
  }

  const back = () => {
    useKeyboard.getState().detach(FIELD)
    goBack()
  }

  const cancelSearch = () => {
    useKeyboard.getState().detach(FIELD)
    setQuery('')
  }

  const top = views.at(-1)
  const shownQuery = top?.kind === 'results' ? top.query : ''
  const [lastShown, setLastShown] = useState(shownQuery)
  if (shownQuery !== lastShown) {
    setLastShown(shownQuery)
    setQuery(shownQuery)
  }

  return (
    <section className="app-panel bilibili-app" aria-label="哔哩哔哩">
      <div className="bili-top">
        {views.length > 0 && !typing && (
          <button type="button" className="bili-round" aria-label="返回" onClick={back}>
            <BackGlyph />
          </button>
        )}
        <TextField
          id={FIELD}
          value={query}
          onChange={setQuery}
          onSubmit={() => search(query)}
          returnKind="search"
          hint="搜索哔哩哔哩视频、UP主..."
          label="搜索哔哩哔哩"
          icon={<SearchGlyph />}
        />
        {typing && (
          <button type="button" className="bili-cancel-search-btn" onClick={cancelSearch}>
            取消
          </button>
        )}
        {!typing && <Account />}
      </div>

      {!typing && <SigningInBanner />}

      <div className="bili-body">
        <div className={views.length === 0 && !typing ? 'bili-layer' : 'bili-layer away'}>
          <Home onSearch={search} />
        </div>
        {views.map((view, index) => (
          <div key={view.id} className={index === views.length - 1 && !typing ? 'bili-layer' : 'bili-layer away'}>
            <Page view={view} />
          </div>
        ))}
        {typing && (
          <div className="bili-layer">
            <SearchOverlay query={query} onSearch={search} onFill={setQuery} />
          </div>
        )}
      </div>

      {!typing && <NowPlayingBar />}
    </section>
  )
}

function Page({ view }: { view: BilibiliView }) {
  switch (view.kind) {
    case 'results':
      return <Results query={view.query} filter={view.filter} />
    case 'channel':
      return <ChannelPage channel={view.channel} />
    case 'playlist':
      return <PlaylistPage video={view.video} />
  }
}

function NowPlayingBar() {
  const playback = useBilibili((store) => store.playback)
  const open = useBilibili((store) => store.open)
  const playing = useBilibili((store) => store.playing)

  if (!playback || open) return null
  const isPlayingNow = Boolean(
    playing ||
    playback.status === 'playing' ||
    (playback.isLive && playback.status !== 'paused')
  )
  const live = isInHost() && isPlayingNow

  return (
    <div className="bili-now" onClick={() => openPlayer(true)}>
      <div className="bili-now-open">
        {live ? (
          <VideoHole app="bilibili" className="bili-thumb bili-now-video" crop />
        ) : playback.artwork ? (
          <img className="bili-thumb bili-now-video" src={playback.artwork} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="bili-thumb-blank">📺</span>
        )}
        <span className="bili-now-text">
          <span className="bili-title">{playback.title}</span>
          <span className="bili-sub">{playback.artist}</span>
        </span>
      </div>

      <button
        type="button"
        className="bili-round"
        aria-label={isPlayingNow ? '暂停' : '播放'}
        onClick={(e) => {
          e.stopPropagation()
          playOrPause()
        }}
      >
        {isPlayingNow ? <PauseGlyph /> : <PlayGlyph />}
      </button>

      <button
        type="button"
        className="bili-round"
        aria-label="关闭"
        onClick={(e) => {
          e.stopPropagation()
          stopVideo()
        }}
      >
        <CloseGlyph />
      </button>
    </div>
  )
}

function Account() {
  const signedIn = useBilibili((store) => store.signedIn)
  const [menu, setMenu] = useState(false)

  if (signedIn === null || signedIn === false) {
    return (
      <button type="button" className="bili-sign-in" onClick={sendSignIn}>
        <PersonGlyph />
        扫码登录
      </button>
    )
  }

  return (
    <div className="bili-account-box">
      <button type="button" className="bili-me" aria-label="账号菜单" onClick={() => setMenu(!menu)}>
        <PersonGlyph />
      </button>
      {menu && (
        <div className="bili-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false)
              sendSignOut()
            }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}

function SigningInBanner() {
  const signingIn = useBilibili((store) => store.signingIn)
  if (!signingIn) return null
  return (
    <div className="bili-signing-in-banner">
      <span className="bili-spinner" />
      <span>请在电脑屏幕上使用哔哩哔哩手机客户端扫码登录...</span>
    </div>
  )
}

type HomeTab = 'recommend' | 'dynamic' | 'popular' | 'live' | 'movie'

const HOME_TABS: { id: HomeTab; label: string; icon: React.ReactNode }[] = [
  { id: 'recommend', label: '推荐', icon: <SparkleGlyph /> },
  { id: 'dynamic', label: '动态', icon: <SignalGlyph /> },
  { id: 'popular', label: '热门', icon: <FireGlyph /> },
  { id: 'live', label: '直播', icon: <LiveBroadcastGlyph /> },
  { id: 'movie', label: '影视', icon: <FilmGlyph /> },
]

function Home({ onSearch }: { onSearch(query: string): void }) {
  const [tab, setTab] = useState<HomeTab>('recommend')
  const signedIn = useBilibili((store) => store.signedIn ?? false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(() => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshKey((k) => k + 1)
    setTimeout(() => {
      setRefreshing(false)
    }, 700)
  }, [refreshing])

  return (
    <div className="bili-home-container">
      <div className="bili-home-header">
        <div className="bili-segmented-control" role="tablist">
          {HOME_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'bili-segmented-btn active' : 'bili-segmented-btn'}
              onClick={() => {
                if (tab === t.id) {
                  handleRefresh()
                } else {
                  setTab(t.id)
                }
              }}
            >
              <span className="bili-tab-icon">{t.icon}</span>
              <span className="bili-tab-label">{t.label}</span>
              {t.id === 'live' && <span className="bili-live-pulse-dot small" />}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={refreshing ? 'bili-home-refresh-btn refreshing' : 'bili-home-refresh-btn'}
          onClick={handleRefresh}
          title="刷新内容"
          aria-label="刷新"
        >
          <span className="bili-refresh-icon">
            <RefreshGlyph />
          </span>
          <span className="bili-refresh-label">刷新</span>
        </button>
      </div>

      <div className="bili-tab-content">
        {tab === 'recommend' && <RecommendTabContent onSearch={onSearch} signedIn={signedIn} refreshKey={refreshKey} />}
        {tab === 'dynamic' && <DynamicTabContent signedIn={signedIn} refreshKey={refreshKey} />}
        {tab === 'popular' && <PopularTabContent refreshKey={refreshKey} />}
        {tab === 'live' && <LiveTabContent signedIn={signedIn} refreshKey={refreshKey} />}
        {tab === 'movie' && <MovieTabContent refreshKey={refreshKey} />}
      </div>
    </div>
  )
}

function RecommendTabContent({
  onSearch,
  signedIn,
  refreshKey,
}: {
  onSearch(query: string): void
  signedIn: boolean
  refreshKey?: number
}) {
  const watched = useBilibili((store) => store.watched)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [refreshKey])

  const getQuestion = useCallback(
    (page: number) =>
      signedIn
        ? { ask: 'feed' as const, which: 'recommend' as const, page, freshIdx: refreshKey }
        : { ask: 'popular' as const, page, freshIdx: refreshKey },
    [signedIn, refreshKey],
  )

  return (
    <div ref={scrollRef} className="bili-scroll bili-home">
      <div className="bili-topic-chips-wrapper">
        <div className="bili-chips bili-topic-chips">
          {PRESET_CHIPS.map((chip) => (
            <button key={chip} type="button" className="bili-chip" onClick={() => onSearch(chip)}>
              <span className="bili-chip-label">{chip}</span>
            </button>
          ))}
        </div>
      </div>

      {watched.length > 0 && (
        <section className="bili-section">
          <SectionTitle title="继续观看" onClear={clearWatched} />
          <div className="bili-shelf">
            {watched.slice(0, 10).map((w) => (
              <ShelfCard key={w.video.bvid} watched={w} />
            ))}
          </div>
        </section>
      )}

      <section className="bili-section">
        <VideoList
          key={refreshKey}
          layout="grid"
          question={getQuestion}
        />
      </section>
    </div>
  )
}

function DynamicTabContent({ signedIn, refreshKey }: { signedIn: boolean; refreshKey?: number }) {
  if (!signedIn) {
    return (
      <div className="bili-scroll bili-signin-guide-wrap">
        <div className="bili-signin-guide-card">
          <div className="bili-signin-guide-icon">📡</div>
          <div className="bili-signin-guide-text">
            <h3>登录哔哩哔哩查看动态</h3>
            <p>登录后即可同步关注 UP 主的最新视频投稿、图文动态与精彩转发</p>
          </div>
          <button type="button" className="bili-live-login-btn large" onClick={sendSignIn}>
            <PersonGlyph />
            扫码登录
          </button>
        </div>
      </div>
    )
  }

  return <DynamicTimeline refreshKey={refreshKey} />
}

function DynamicTimeline({ refreshKey }: { refreshKey?: number }) {
  const [items, setItems] = useState<BilibiliDynamicItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  const currentReq = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback((nextPage: number) => {
    const reqId = ++currentReq.current
    setStatus('loading')
    ask({ ask: 'feed', which: 'dynamic', page: nextPage }).then((answer: BilibiliAnswers) => {
      if (reqId !== currentReq.current) return
      if (answer.failed) {
        setStatus('failed')
        return
      }
      if (answer.dynamics) {
        setItems((before) => {
          if (nextPage === 1) return answer.dynamics!
          const seen = new Set(before.map((d) => d.id))
          const added = answer.dynamics!.filter((d) => !seen.has(d.id))
          return [...before, ...added]
        })
      }
      setHasMore(answer.hasMore ?? false)
      setPage(nextPage)
      setStatus('done')
    })
  }, [])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    load(1)
  }, [load, refreshKey])

  const nearEnd = (element: HTMLDivElement) =>
    element.scrollTop + element.clientHeight > element.scrollHeight - element.clientHeight * 0.8

  return (
    <div
      ref={scrollRef}
      className="bili-scroll bili-timeline-container"
      onScroll={(event) => {
        if (hasMore && status === 'done' && nearEnd(event.currentTarget)) {
          load(page + 1)
        }
      }}
    >
      <div className="bili-timeline">
        {items.map((item) => (
          <div key={item.id} className="bili-timeline-item">
            <div className="bili-timeline-rail">
              <span className="bili-timeline-dot" />
              <span className="bili-timeline-line" />
            </div>
            <div className="bili-timeline-card">
              <div
                className="bili-timeline-author-row"
                onClick={() =>
                  openChannel({
                    mid: item.author.mid,
                    name: item.author.name,
                    avatar: item.author.avatar,
                  })
                }
              >
                {item.author.avatar ? (
                  <img className="bili-avatar" src={item.author.avatar} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="bili-avatar blank">{item.author.name.slice(0, 1)}</span>
                )}
                <div className="bili-timeline-author-meta">
                  <span className="bili-timeline-author-name">{item.author.name}</span>
                  <span className="bili-timeline-pub-time">
                    {item.author.pubTime}
                    {item.author.pubAction ? ` · ${item.author.pubAction}` : ''}
                  </span>
                </div>
              </div>

              {item.desc && <div className="bili-timeline-text">{item.desc}</div>}

              {item.origAuthor && (
                <div className="bili-timeline-orig-box">
                  <span className="bili-timeline-orig-author">@{item.origAuthor}: </span>
                  <span className="bili-timeline-orig-desc">{item.origDesc}</span>
                </div>
              )}

              {item.video && (
                <div
                  className="bili-timeline-video"
                  onClick={() => play(item.video!, true)}
                  role="button"
                  tabIndex={0}
                >
                  <Thumbnail video={item.video} />
                  <div className="bili-timeline-video-meta">
                    <span className="bili-title">{item.video.title}</span>
                    <span className="bili-sub">
                      {[item.video.author, item.video.playCount ? `▶ ${item.video.playCount}` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {status === 'loading' && <Skeletons layout="rows" count={items.length > 0 ? 2 : 4} />}

      {status === 'done' && items.length === 0 && (
        <p className="bili-note">暂无关注 UP 主动态</p>
      )}

      {status === 'failed' && (
        <p className="bili-note">
          加载动态失败{' '}
          <button type="button" className="bili-chip" onClick={() => load(page)}>
            重试
          </button>
        </p>
      )}
    </div>
  )
}

function PopularTabContent({ refreshKey }: { refreshKey?: number }) {
  const [videos, setVideos] = useState<BilibiliVideo[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  const currentReq = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback((nextPage: number) => {
    const reqId = ++currentReq.current
    setStatus('loading')
    ask({ ask: 'popular', page: nextPage }).then((answer: BilibiliAnswers) => {
      if (reqId !== currentReq.current) return
      if (answer.failed) {
        setStatus('failed')
        return
      }
      if (answer.videos) {
        setVideos((before) => {
          if (nextPage === 1) return answer.videos!
          const seen = new Set(before.map((v) => v.bvid))
          const added = answer.videos!.filter((v) => !seen.has(v.bvid))
          return [...before, ...added]
        })
      }
      setHasMore(answer.hasMore ?? false)
      setPage(nextPage)
      setStatus('done')
    })
  }, [])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    load(1)
  }, [load, refreshKey])

  const nearEnd = (element: HTMLDivElement) =>
    element.scrollTop + element.clientHeight > element.scrollHeight - element.clientHeight * 0.8

  const getRankBadge = (index: number) => {
    if (index === 0) return <span className="bili-rank-badge gold">TOP 1</span>
    if (index === 1) return <span className="bili-rank-badge silver">TOP 2</span>
    if (index === 2) return <span className="bili-rank-badge bronze">TOP 3</span>
    return <span className="bili-rank-badge normal">{index + 1}</span>
  }

  return (
    <div
      ref={scrollRef}
      className="bili-scroll bili-grid"
      onScroll={(event) => {
        if (hasMore && status === 'done' && nearEnd(event.currentTarget)) {
          load(page + 1)
        }
      }}
    >
      {videos.map((video, index) => (
        <div
          key={video.bvid}
          className="bili-card bili-popular-card"
          onClick={() => play(video, true)}
          role="button"
          tabIndex={0}
        >
          <div className="bili-thumb-wrap">
            {getRankBadge(index)}
            <Thumbnail video={video} />
          </div>
          <span className="bili-meta">
            <span className="bili-meta-text">
              <span className="bili-title">{video.title}</span>
              <span className="bili-sub">
                <span
                  className="bili-author-link"
                  onClick={(e) => {
                    if (video.mid) {
                      e.stopPropagation()
                      openChannel({ mid: video.mid, name: video.author })
                    }
                  }}
                >
                  {video.author}
                </span>
                {[video.playCount, video.pubdate].filter(Boolean).map((text, idx) => (
                  <span key={idx}> · {text}</span>
                ))}
              </span>
            </span>
          </span>
        </div>
      ))}

      {status === 'loading' && <Skeletons layout="grid" count={videos.length > 0 ? 2 : 6} />}

      {status === 'done' && videos.length === 0 && (
        <p className="bili-note">暂无热门视频</p>
      )}

      {status === 'failed' && (
        <p className="bili-note">
          加载失败{' '}
          <button type="button" className="bili-chip" onClick={() => load(page)}>
            重试
          </button>
        </p>
      )}
    </div>
  )
}

function LiveTabContent({ signedIn, refreshKey }: { signedIn: boolean; refreshKey?: number }) {
  const [selectedArea, setSelectedArea] = useState<number>(0)
  const [followingRooms, setFollowingRooms] = useState<BilibiliLiveRoom[]>([])
  const [liveRooms, setLiveRooms] = useState<BilibiliLiveRoom[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  const currentReq = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback((nextPage: number, areaId: number) => {
    const reqId = ++currentReq.current
    setStatus('loading')

    ask({ ask: 'live', parentAreaId: areaId, page: nextPage }).then((answer: BilibiliAnswers) => {
      if (reqId !== currentReq.current) return
      if (answer.failed) {
        setStatus('failed')
        return
      }

      if (nextPage === 1 && answer.followingLiveRooms) {
        setFollowingRooms(answer.followingLiveRooms)
      }

      if (answer.liveRooms) {
        setLiveRooms((before) => {
          if (nextPage === 1) return answer.liveRooms!
          const seen = new Set(before.map((r) => r.roomId))
          const added = answer.liveRooms!.filter((r) => !seen.has(r.roomId))
          return [...before, ...added]
        })
      }

      setHasMore(answer.hasMore ?? false)
      setPage(nextPage)
      setStatus('done')
    })
  }, [])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    load(1, selectedArea)
  }, [load, selectedArea, refreshKey])

  const selectArea = (parentAreaId: number) => {
    if (selectedArea === parentAreaId) return
    setSelectedArea(parentAreaId)
    setLiveRooms([])
    setPage(1)
  }

  const playLive = (room: BilibiliLiveRoom) => {
    play(
      {
        bvid: `live:${room.roomId}`,
        roomId: room.roomId,
        isLive: true,
        title: room.title,
        author: room.uname,
        artwork: room.cover,
        mid: String(room.uid),
      },
      true,
    )
  }

  const nearEnd = (element: HTMLDivElement) =>
    element.scrollTop + element.clientHeight > element.scrollHeight - element.clientHeight * 0.8

  return (
    <div
      ref={scrollRef}
      className="bili-scroll bili-live-scroll"
      onScroll={(event) => {
        if (hasMore && status === 'done' && nearEnd(event.currentTarget)) {
          load(page + 1, selectedArea)
        }
      }}
    >
      {/* 1. 关注的直播 Shelf (Priority 1) */}
      {signedIn ? (
        followingRooms.length > 0 ? (
          <div className="bili-live-section">
            <div className="bili-live-header">
              <div className="bili-live-title">
                <span className="bili-live-pulse-dot" />
                <span>关注的UP主正在直播</span>
                <span className="bili-live-count-badge">{followingRooms.length}</span>
              </div>
            </div>
            <div className="bili-following-live-shelf">
              {followingRooms.map((room) => (
                <div
                  key={room.roomId}
                  className="bili-following-live-card"
                  onClick={() => playLive(room)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="bili-following-thumb-wrap">
                    {room.cover ? (
                      <img src={room.cover} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="bili-thumb-blank">🔴</span>
                    )}
                    <span className="bili-live-pill-badge">
                      <span className="bili-live-pulse-dot small" />
                      直播中
                    </span>
                    <span className="bili-live-bottom-heat">🔥 {room.online}</span>
                  </div>
                  <div className="bili-following-meta">
                    <div className="bili-following-host-row">
                      <div className="bili-following-avatar-wrap">
                        {room.avatar ? (
                          <img src={room.avatar} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="bili-avatar blank">{room.uname.slice(0, 1)}</span>
                        )}
                        <span className="bili-live-mini-badge" />
                      </div>
                      <span className="bili-following-uname">{room.uname}</span>
                    </div>
                    <span className="bili-title">{room.title}</span>
                    {room.areaName && <span className="bili-sub">{room.areaName}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bili-live-section">
            <div className="bili-live-quiet-card">
              <div className="bili-quiet-icon">🌙</div>
              <div className="bili-quiet-text">
                <span className="bili-quiet-title">关注的 UP 主当前暂无直播</span>
                <span className="bili-quiet-sub">为你推荐热门与分类直播频道，随时点击畅听</span>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="bili-live-section">
          <div className="bili-live-signin-banner">
            <div className="bili-signin-banner-text">
              <span className="bili-live-pulse-dot" />
              <span className="bili-banner-main">登录哔哩哔哩账号，即时查看关注的 UP 主直播</span>
            </div>
            <button type="button" className="bili-live-login-btn" onClick={sendSignIn}>
              <PersonGlyph />
              扫码登录
            </button>
          </div>
        </div>
      )}

      {/* 2. 类型直播兜底与精选 (Priority 2 / Fallback & Exploration) */}
      <div className="bili-live-section">
        <div className="bili-live-header">
          <div className="bili-live-title">
            <CompassGlyph />
            <span>类型直播精选</span>
          </div>
        </div>

        {/* Category selector chips (二级 Tab) */}
        <div className="bili-topic-chips-wrapper">
          <div className="bili-subtabs-track">
            {LIVE_AREAS.map((area) => (
              <button
                key={area.parentAreaId}
                type="button"
                className={selectedArea === area.parentAreaId ? 'bili-subtab-btn active' : 'bili-subtab-btn'}
                onClick={() => selectArea(area.parentAreaId)}
              >
                {area.icon && <span className="bili-subtab-icon">{area.icon}</span>}
                <span className="bili-subtab-label">{area.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category Live Grid */}
        <div className="bili-live-grid">
          {liveRooms.map((room) => (
            <div
              key={room.roomId}
              className="bili-card bili-live-card"
              onClick={() => playLive(room)}
              role="button"
              tabIndex={0}
            >
              <div className="bili-live-thumb-wrap">
                {room.cover ? (
                  <img src={room.cover} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="bili-thumb-blank">🔴</span>
                )}
                <span className="bili-live-pill-badge">
                  <span className="bili-live-pulse-dot small" />
                  直播中
                </span>
                {room.areaName && <span className="bili-live-area-pill">{room.areaName}</span>}
                <span className="bili-live-bottom-heat">
                  <span className="bili-live-heat-text">🔥 {room.online}</span>
                  <span className="bili-live-host-name">{room.uname}</span>
                </span>
              </div>
              <div className="bili-meta">
                <div className="bili-live-card-info">
                  <span className="bili-title">{room.title}</span>
                  <span className="bili-sub">
                    {room.uname} · {room.areaName || '直播'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {status === 'loading' && <Skeletons layout="grid" count={liveRooms.length > 0 ? 2 : 6} />}

        {status === 'done' && liveRooms.length === 0 && (
          <p className="bili-note">当前分类暂无直播</p>
        )}

        {status === 'failed' && (
          <p className="bili-note">
            加载直播失败{' '}
            <button type="button" className="bili-chip" onClick={() => load(page, selectedArea)}>
              重试
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

function MovieTabContent({ refreshKey }: { refreshKey?: number }) {
  const [selectedType, setSelectedType] = useState<number>(2) // 2: 电影
  const [selectedOrder, setSelectedOrder] = useState<number>(3) // 3: 最热追剧
  const [movies, setMovies] = useState<BilibiliMovieItem[]>([])
  const [page, setPage] = useState<number>(1)
  const [hasMore, setHasMore] = useState<boolean>(true)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  const currentReq = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback((nextPage: number, seasonType: number, order: number) => {
    const reqId = ++currentReq.current
    setStatus('loading')

    ask({ ask: 'movie', seasonType, order, page: nextPage }).then((answer: BilibiliAnswers) => {
      if (reqId !== currentReq.current) return
      if (answer.failed) {
        setStatus('failed')
        return
      }

      if (answer.movies) {
        setMovies((before) => {
          if (nextPage === 1) return answer.movies!
          const seen = new Set(before.map((m) => m.seasonId))
          const added = answer.movies!.filter((m) => !seen.has(m.seasonId))
          return [...before, ...added]
        })
      }

      setHasMore(answer.hasMore ?? false)
      setPage(nextPage)
      setStatus('done')
    })
  }, [])

  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    load(1, selectedType, selectedOrder)
  }, [load, selectedType, selectedOrder, refreshKey])

  const selectType = (type: number) => {
    if (selectedType === type) return
    setSelectedType(type)
    setMovies([])
    setPage(1)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }

  const selectOrder = (order: number) => {
    if (selectedOrder === order) return
    setSelectedOrder(order)
    setMovies([])
    setPage(1)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }

  const playMovie = (movie: BilibiliMovieItem) => {
    play(
      {
        bvid: movie.epId ? `ep${movie.epId}` : `ss${movie.seasonId}`,
        seasonId: movie.seasonId,
        epId: movie.epId,
        title: movie.title,
        author: '哔哩哔哩影视',
        artwork: movie.cover,
      },
      true,
    )
  }

  const nearEnd = (element: HTMLDivElement) =>
    element.scrollTop + element.clientHeight > element.scrollHeight - element.clientHeight * 0.8

  const getBadgeClass = (badge?: string) => {
    if (!badge) return ''
    if (badge.includes('会员')) return 'vip'
    if (badge.includes('独家') || badge.includes('独播')) return 'exclusive'
    if (badge.includes('出品')) return 'original'
    if (badge.includes('限免') || badge.includes('限时')) return 'limited'
    return 'free'
  }

  return (
    <div
      ref={scrollRef}
      className="bili-scroll bili-movie-scroll"
      onScroll={(event) => {
        if (hasMore && status === 'done' && nearEnd(event.currentTarget)) {
          load(page + 1, selectedType, selectedOrder)
        }
      }}
    >
      {/* Category and Sort Controls */}
      <div className="bili-movie-controls">
        {/* Genre pills (二级 Tab) */}
        <div className="bili-topic-chips-wrapper">
          <div className="bili-subtabs-track">
            {MOVIE_CATEGORIES.map((cat) => (
              <button
                key={cat.seasonType}
                type="button"
                className={selectedType === cat.seasonType ? 'bili-subtab-btn active' : 'bili-subtab-btn'}
                onClick={() => selectType(cat.seasonType)}
              >
                {cat.icon && <span className="bili-subtab-icon">{cat.icon}</span>}
                <span className="bili-subtab-label">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Sort selector bar (三级 Tab / 排序) */}
        <div className="bili-movie-sort-bar">
          <span className="bili-movie-sort-label">
            <SortGlyph />
            <span>排序:</span>
          </span>
          <div className="bili-movie-sort-chips">
            {MOVIE_SORT_OPTIONS.map((opt) => (
              <button
                key={opt.order}
                type="button"
                className={selectedOrder === opt.order ? 'bili-sort-btn active' : 'bili-sort-btn'}
                onClick={() => selectOrder(opt.order)}
              >
                {opt.icon && <span className="bili-sort-icon">{opt.icon}</span>}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Movie Vertical Poster Grid */}
      <div className="bili-movie-grid">
        {movies.map((movie) => (
          <div
            key={movie.seasonId}
            className="bili-movie-card"
            onClick={() => playMovie(movie)}
            role="button"
            tabIndex={0}
          >
            <div className="bili-movie-poster-wrap">
              {movie.cover ? (
                <img src={movie.cover} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <div className="bili-thumb-blank">🎬</div>
              )}

              {/* Badge: 大会员 / 独家 / 出品 / 限免 */}
              {movie.badge && (
                <span className={`bili-movie-badge ${getBadgeClass(movie.badge)}`}>
                  {movie.badge}
                </span>
              )}

              {/* Rating score badge */}
              {movie.score && (
                <span className="bili-movie-score-badge">
                  ⭐ {movie.score}
                </span>
              )}

              {/* Update progress / Episode count */}
              {movie.indexShow && (
                <span className="bili-movie-status-pill">
                  {movie.indexShow}
                </span>
              )}
            </div>

            <div className="bili-movie-meta">
              <span className="bili-movie-title" title={movie.title}>{movie.title}</span>
              <span className="bili-movie-sub">
                {movie.subTitle || movie.order || '哔哩哔哩影视'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {status === 'loading' && (
        <div className="bili-movie-grid">
          {Array.from({ length: movies.length > 0 ? 3 : 9 }, (_, i) => (
            <div key={i} className="bili-movie-card bili-skeleton">
              <span className="bili-movie-poster-wrap" />
              <span className="bili-movie-meta">
                <span className="bili-skeleton-line" />
                <span className="bili-skeleton-line short" />
              </span>
            </div>
          ))}
        </div>
      )}

      {status === 'done' && movies.length === 0 && (
        <p className="bili-note">暂无相关影视内容</p>
      )}

      {status === 'failed' && (
        <p className="bili-note">
          加载影视失败{' '}
          <button type="button" className="bili-chip" onClick={() => load(page, selectedType, selectedOrder)}>
            重试
          </button>
        </p>
      )}
    </div>
  )
}

function SectionTitle({ title, onClear }: { title: string; onClear(): void }) {
  return (
    <div className="bili-section-title">
      <h3 className="bili-section-heading">{title}</h3>
      <button type="button" className="bili-clear" onClick={onClear}>
        清除
      </button>
    </div>
  )
}

function ShelfCard({ watched }: { watched: BilibiliWatched }) {
  const { video, time, duration } = watched
  const progress = duration > 0 ? time / duration : 0

  return (
    <button type="button" className="bili-card shelf" onClick={() => play(video, true)}>
      <Thumbnail video={video} progress={progress} />
      <span className="bili-title">{video.title}</span>
      <span className="bili-sub">{video.author}</span>
    </button>
  )
}

function SearchOverlay({
  query,
  onSearch,
  onFill,
}: {
  query: string
  onSearch(q: string): void
  onFill(q: string): void
}) {
  const searches = useBilibili((store) => store.searches)
  const [suggested, setSuggested] = useState<{ query: string; list: string[] }>({ query: '', list: [] })

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return
    let current = true
    const timer = setTimeout(() => {
      ask({ ask: 'suggest', query }).then((answer) => {
        if (current) setSuggested({ query, list: answer.suggestions ?? [] })
      })
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])

  const typed = query.trim().toLowerCase()

  if (!typed) {
    return (
      <div className="bili-scroll bili-suggestions-page">
        {searches.length > 0 && (
          <div className="bili-sug-section">
            <div className="bili-sug-header">
              <div className="bili-sug-title">
                <HistoryGlyph />
                <span>最近搜索</span>
              </div>
              <button
                type="button"
                className="bili-clear-history-btn"
                onClick={clearSearches}
              >
                <TrashGlyph />
                <span>清空</span>
              </button>
            </div>
            <div className="bili-history-tags">
              {searches.map((s) => (
                <div key={s} className="bili-history-tag">
                  <button
                    type="button"
                    className="bili-history-text-btn"
                    onClick={() => onSearch(s)}
                  >
                    {s}
                  </button>
                  <button
                    type="button"
                    className="bili-history-del-btn"
                    aria-label="删除"
                    onClick={() => forgetSearch(s)}
                  >
                    <CloseGlyph />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bili-sug-section">
          <div className="bili-sug-header">
            <div className="bili-sug-title">
              <FireGlyph />
              <span>热门搜索</span>
            </div>
          </div>
          <div className="bili-hot-grid">
            {TRENDING_SEARCHES.map((item) => (
              <div
                key={item.rank}
                className="bili-hot-item"
                onClick={() => onSearch(item.title)}
                role="button"
                tabIndex={0}
              >
                <span
                  className={
                    item.rank === 1
                      ? 'bili-hot-rank rank-1'
                      : item.rank === 2
                      ? 'bili-hot-rank rank-2'
                      : item.rank === 3
                      ? 'bili-hot-rank rank-3'
                      : 'bili-hot-rank rank-normal'
                  }
                >
                  {item.rank}
                </span>
                <span className="bili-hot-text">{item.title}</span>
                {item.tag && (
                  <span className={`bili-hot-tag ${item.tag === '热' ? 'hot' : 'new'}`}>
                    {item.tag}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const past = searches.filter((s) => s.toLowerCase().startsWith(typed)).slice(0, 4)
  const theirs = (suggested.query.trim() ? suggested.list : []).filter(
    (s) => !past.some((p) => p.toLowerCase() === s.toLowerCase()),
  )
  const rows = [...past.map((s) => ({ s, past: true })), ...theirs.map((s) => ({ s, past: false }))].slice(0, 8)

  return (
    <div className="bili-scroll" style={{ padding: '8px 4px 120px' }}>
      <div className="bili-suggestions-card">
        {rows.length > 0 ? (
          rows.map(({ s, past: isPast }) => {
            const isMatch = s.toLowerCase().startsWith(typed)
            const prefix = isMatch ? s.slice(0, typed.length) : ''
            const rest = isMatch ? s.slice(typed.length) : s

            return (
              <div key={`${isPast}:${s}`} className="bili-suggestion-row">
                <button
                  type="button"
                  className="bili-suggestion-main"
                  onClick={() => onSearch(s)}
                >
                  <span className="bili-sug-icon">
                    {isPast ? <HistoryGlyph /> : <SearchGlyph />}
                  </span>
                  <span className="bili-sug-label">
                    {isMatch ? (
                      <>
                        <span className="bili-sug-prefix">{prefix}</span>
                        <span className="bili-sug-rest">{rest}</span>
                      </>
                    ) : (
                      <span className="bili-sug-rest">{s}</span>
                    )}
                  </span>
                  {isPast && <span className="bili-sug-history-badge">历史</span>}
                </button>
                <button
                  type="button"
                  className="bili-suggestion-fill-btn"
                  aria-label="补全"
                  onClick={() => onFill(`${s} `)}
                >
                  <FillGlyph />
                </button>
              </div>
            )
          })
        ) : (
          <div className="bili-sug-empty">按回车直接搜索 &ldquo;{query}&rdquo;</div>
        )}
      </div>
    </div>
  )
}

function Results({ query, filter }: { query: string; filter: 'videos' | 'users' }) {
  const filters: { filter: 'videos' | 'users'; label: string; icon: React.ReactNode }[] = [
    { filter: 'videos', label: '视频', icon: <PlayGlyph /> },
    { filter: 'users', label: 'UP主', icon: <PersonGlyph /> },
  ]

  return (
    <>
      <div className="bili-results-header">
        <div className="bili-segmented-control small" role="tablist">
          {filters.map((chip) => (
            <button
              key={chip.filter}
              type="button"
              role="tab"
              className={filter === chip.filter ? 'bili-segmented-btn active' : 'bili-segmented-btn'}
              aria-selected={filter === chip.filter}
              onClick={() => filter !== chip.filter && openResults(query, chip.filter)}
            >
              <span className="bili-tab-icon">{chip.icon}</span>
              <span className="bili-tab-label">{chip.label}</span>
            </button>
          ))}
        </div>
      </div>
      <VideoList
        key={`${query}-${filter}`}
        layout={filter === 'users' ? 'grid' : 'rows'}
        question={(page) => ({ ask: 'search', query, filter, page })}
      />
    </>
  )
}

function ChannelPage({ channel: known }: { channel: { mid: string; name: string; avatar?: string | null } }) {
  const [channel, setChannel] = useState<BilibiliChannel>({
    mid: known.mid,
    name: known.name || 'UP主',
    avatar: known.avatar,
  })
  const [subscribing, setSubscribing] = useState(false)

  const toggleSubscribe = async () => {
    if (subscribing || channel.subscribed === undefined) return
    setSubscribing(true)
    const next = !channel.subscribed
    setChannel((c) => ({ ...c, subscribed: next }))
    const res = await ask({ ask: 'subscribe', mid: known.mid, on: next })
    if (res.channel?.subscribed !== undefined) {
      setChannel((c) => ({ ...c, subscribed: res.channel!.subscribed }))
    }
    setSubscribing(false)
  }

  return (
    <VideoList
      key={known.mid}
      layout="grid"
      header={
        <div className="bili-channel-head">
          {channel.banner && <img className="bili-banner" src={channel.banner} alt="" referrerPolicy="no-referrer" />}
          <div className="bili-channel-who">
            {channel.avatar ? (
              <img className="bili-avatar large" src={channel.avatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="bili-avatar large blank">{channel.name.slice(0, 1)}</span>
            )}
            <div className="bili-channel-text">
              <h2>{channel.name}</h2>
              <span className="bili-sub">
                {[channel.fans ? `${channel.fans} 粉丝` : '', channel.videos ? `${channel.videos} 视频` : ''].filter(Boolean).join(' · ')}
              </span>
              {channel.sign && <p className="bili-sign">{channel.sign}</p>}
            </div>
            {channel.subscribed !== undefined && (
              <button
                type="button"
                className={`bili-subscribe${channel.subscribed ? ' subscribed' : ''}`}
                disabled={subscribing}
                onClick={toggleSubscribe}
              >
                {channel.subscribed ? '已关注' : '关注UP'}
              </button>
            )}
          </div>
        </div>
      }
      onAnswer={(answer) => {
        if (answer.channel) {
          setChannel((prev) => ({
            ...prev,
            ...answer.channel,
            name: answer.channel?.name || prev.name,
          }))
        }
      }}
      question={(page) => ({ ask: 'channel', mid: known.mid, page })}
    />
  )
}

function PlaylistPage({ video }: { video: BilibiliVideo }) {
  const [pages, setPages] = useState<BilibiliVideoPage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ask({ ask: 'playlist', bvid: video.bvid }).then((ans) => {
      if (ans.pages) setPages(ans.pages)
      setLoading(false)
    })
  }, [video.bvid])

  const playPart = (page: number) => {
    play(video, true, page)
  }

  return (
    <div className="bili-scroll bili-playlist-page">
      <div className="bili-playlist-head">
        <Thumbnail video={video} />
        <div className="bili-playlist-text">
          <h2>{video.title}</h2>
          <span className="bili-sub">{video.author} · 共 {pages.length} P</span>
          <button
            type="button"
            className="bili-play-all"
            disabled={pages.length === 0}
            onClick={() => playPart(1)}
          >
            <PlayGlyph />
            播放全部
          </button>
        </div>
      </div>

      <div className="bili-playlist-list">
        {loading ? (
          <p className="bili-note">加载分P中...</p>
        ) : (
          pages.map((p) => (
            <div key={p.page} className="bili-row" onClick={() => playPart(p.page)}>
              <span className="bili-page-badge">P{p.page}</span>
              <span className="bili-row-text">
                <span className="bili-title">{p.part}</span>
                {p.duration ? <span className="bili-sub">{formatClock(p.duration)}</span> : null}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function VideoList({
  question,
  layout,
  header,
  onAnswer,
}: {
  question(page: number): BilibiliQuestion
  layout: 'rows' | 'grid'
  header?: React.ReactNode
  onAnswer?(answer: BilibiliAnswers): void
}) {
  const [videos, setVideos] = useState<BilibiliVideo[]>([])
  const [channels, setChannels] = useState<BilibiliChannel[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [status, setStatus] = useState<'loading' | 'done' | 'failed'>('loading')
  const currentReq = useRef(0)
  const questionRef = useRef(question)
  questionRef.current = question
  const onAnswerRef = useRef(onAnswer)
  onAnswerRef.current = onAnswer

  const load = useCallback((nextPage: number) => {
    const reqId = ++currentReq.current
    setStatus('loading')
    ask(questionRef.current(nextPage)).then((answer: BilibiliAnswers) => {
      if (reqId !== currentReq.current) return
      if (answer.failed) {
        setStatus('failed')
        return
      }
      onAnswerRef.current?.(answer)
      if (answer.videos) {
        setVideos((before) => {
          if (nextPage === 1) return answer.videos!
          const seen = new Set(before.map((v) => v.bvid))
          const added = answer.videos!.filter((v) => !seen.has(v.bvid))
          return [...before, ...added]
        })
      }
      if (answer.channels) {
        setChannels((before) => {
          if (nextPage === 1) return answer.channels!
          const seen = new Set(before.map((c) => c.mid))
          const added = answer.channels!.filter((c) => !seen.has(c.mid))
          return [...before, ...added]
        })
      }
      setHasMore(answer.hasMore ?? false)
      setPage(nextPage)
      setStatus('done')
    })
  }, [])

  useEffect(() => {
    load(1)
  }, [load])

  const nearEnd = (element: HTMLDivElement) =>
    element.scrollTop + element.clientHeight > element.scrollHeight - element.clientHeight * 0.8

  return (
    <div
      className={layout === 'grid' ? 'bili-scroll bili-grid' : 'bili-scroll bili-results'}
      onScroll={(event) => {
        if (hasMore && status === 'done' && nearEnd(event.currentTarget)) {
          load(page + 1)
        }
      }}
    >
      {header}

      {channels.map((ch) => (
        <button
          key={ch.mid}
          type="button"
          className="bili-channel-row"
          onClick={() => openChannel({ mid: ch.mid, name: ch.name, avatar: ch.avatar })}
        >
          {ch.avatar ? (
            <img className="bili-avatar large" src={ch.avatar} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="bili-avatar large blank">{ch.name.slice(0, 1)}</span>
          )}
          <span className="bili-row-text">
            <span className="bili-title">{ch.name}</span>
            <span className="bili-sub">{[ch.fans ? `${ch.fans}粉丝` : '', ch.videos ? `${ch.videos}视频` : ''].filter(Boolean).join(' · ')}</span>
            {ch.sign && <span className="bili-sign-small">{ch.sign}</span>}
          </span>
        </button>
      ))}

      {videos.map((video) =>
        layout === 'grid' ? (
          <div key={video.bvid} className="bili-card" onClick={() => play(video, true)} role="button" tabIndex={0}>
            <Thumbnail video={video} />
            <span className="bili-meta">
              <span className="bili-meta-text">
                <span className="bili-title">{video.title}</span>
                <span className="bili-sub">
                  <span
                    className="bili-author-link"
                    onClick={(e) => {
                      if (video.mid) {
                        e.stopPropagation()
                        openChannel({ mid: video.mid, name: video.author })
                      }
                    }}
                  >
                    {video.author}
                  </span>
                  {[video.playCount, video.pubdate].filter(Boolean).map((text, idx) => (
                    <span key={idx}> · {text}</span>
                  ))}
                </span>
              </span>
            </span>
          </div>
        ) : (
          <div key={video.bvid} className="bili-row" onClick={() => play(video, true)} role="button" tabIndex={0}>
            <Thumbnail video={video} />
            <span className="bili-row-text">
              <span className="bili-title">{video.title}</span>
              <span className="bili-sub">
                <span
                  className="bili-author-link"
                  onClick={(e) => {
                    if (video.mid) {
                      e.stopPropagation()
                      openChannel({ mid: video.mid, name: video.author })
                    }
                  }}
                >
                  {video.author}
                </span>
                {[video.playCount, video.pubdate].filter(Boolean).map((text, idx) => (
                  <span key={idx}> · {text}</span>
                ))}
              </span>
            </span>
          </div>
        ),
      )}

      {status === 'loading' && <Skeletons layout={layout} count={videos.length > 0 ? 2 : 6} />}

      {status === 'done' && videos.length === 0 && channels.length === 0 && (
        <p className="bili-note">暂无相关视频</p>
      )}

      {status === 'failed' && (
        <p className="bili-note">
          加载失败{' '}
          <button type="button" className="bili-chip" onClick={() => load(page)}>
            重试
          </button>
        </p>
      )}
    </div>
  )
}

function Skeletons({ layout, count }: { layout: 'rows' | 'grid'; count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) =>
        layout === 'grid' ? (
          <div key={i} className="bili-card bili-skeleton">
            <span className="bili-thumb" />
            <span className="bili-meta">
              <span className="bili-skeleton-line" />
              <span className="bili-skeleton-line short" />
            </span>
          </div>
        ) : (
          <div key={i} className="bili-row bili-skeleton">
            <span className="bili-thumb" />
            <span className="bili-row-text">
              <span className="bili-skeleton-line" />
              <span className="bili-skeleton-line short" />
            </span>
          </div>
        ),
      )}
    </>
  )
}

export function Thumbnail({ video, progress = 0 }: { video: BilibiliVideo; progress?: number }) {
  return (
    <span className="bili-thumb">
      {video.artwork ? (
        <img src={video.artwork} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="bili-thumb-blank">📺</span>
      )}
      {video.duration ? <span className="bili-badge">{formatClock(video.duration)}</span> : null}
      {progress > 0 && <span className="bili-progress" style={{ width: `${Math.min(100, progress * 100)}%` }} />}
    </span>
  )
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}
