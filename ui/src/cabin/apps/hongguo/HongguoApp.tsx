import { useEffect, useMemo, useRef, useState } from 'react'
import { type HongguoDrama } from '../../../shared/host'
import { useKeyboard } from '../../keyboard/store'
import { SearchGlyph } from '../../keyboard/glyphs'
import { TextField } from '../../keyboard/TextField'
import {
  BackGlyph,
  CloseGlyph,
  NextGlyph,
  PauseGlyph,
  PersonGlyph,
  PlayGlyph,
  PreviousGlyph,
  ReplayGlyph,
  FullScreenGlyph,
} from '../youtube/glyphs'
import {
  ask,
  clearSearches,
  clearWatched,
  forgetSearch,
  formatClock,
  goBack,
  HONGGUO_CONTENT_TYPES,
  HONGGUO_HOT_KEYWORDS,
  HONGGUO_RANK_KINDS,
  type HongguoTab,
  loadCategory,
  loadDramaDetail,
  loadFeed,
  loadHome,
  loadRank,
  mergeDramaDetail,
  openDetail,
  openPlayer,
  openResults,
  play,
  playOrPause,
  positionOf,
  PREVIEW_DRAMAS,
  refreshFeed,
  reopenPlayer,
  selectTab,
  sendSignIn,
  sendSignOut,
  sendStart,
  skip,
  stopDrama,
  toggleFavorite,
  useHongguo,
} from './hongguo'
import { DramaCard, EpisodePicker, HongguoNoticeBanner } from './shared'
import './hongguo.css'

const TABS: { id: HongguoTab; label: string }[] = [
  { id: 'home', label: '首页' },
  { id: 'feed', label: '刷剧' },
  { id: 'category', label: '分类' },
  { id: 'rank', label: '榜单' },
  { id: 'library', label: '追剧' },
]

/**
 * CarPlay-styled Hongguo Short Drama (`红果短剧 · 车载版`) root screen.
 * Mirrors the live `hongguoduanju.com` catalog structure (Home / Feed / Category / Rank / Library)
 * with touch-first grids, in-cab keyboard search suggestions, and seamless handoff to `HongguoPlayer`.
 */
export function HongguoApp() {
  const signedIn = useHongguo((s) => s.signedIn)
  const signingIn = useHongguo((s) => s.signingIn)
  const tab = useHongguo((s) => s.tab)
  const views = useHongguo((s) => s.views)
  const returnToPlayer = useHongguo((s) => s.returnToPlayer)
  const currentDrama = useHongguo((s) => s.currentDrama)
  const playback = useHongguo((s) => s.playback)
  const open = useHongguo((s) => s.open)

  const [draft, setDraft] = useState('')
  const [accountMenu, setAccountMenu] = useState(false)
  const typing = useKeyboard((state) => state.field?.id === 'hongguo-search')

  useEffect(() => {
    sendStart()
  }, [])

  useEffect(() => {
    if (returnToPlayer && (currentDrama || playback)) {
      reopenPlayer()
    }
  }, [returnToPlayer, currentDrama, playback])

  const submitSearch = (text = draft) => {
    const query = text.trim()
    if (!query) return
    setDraft(query)
    useKeyboard.getState().detach('hongguo-search')
    openResults(query)
  }

  const activeView = views[views.length - 1]

  return (
    <section className="app-panel hongguo-app" aria-label="红果短剧车载版">
      <header className="hg-header">
        <div className="hg-header-left">
          {views.length > 0 ? (
            <button type="button" className="hg-back-btn" onClick={() => goBack()}>
              <BackGlyph />
              <span>返回</span>
            </button>
          ) : (
            <div className="hg-brand">
              <span className="hg-brand-mark" aria-hidden="true">
                果
              </span>
              <div className="hg-brand-copy">
                <span className="hg-brand-name">红果短剧</span>
                <span className="hg-brand-tag">车载版</span>
              </div>
            </div>
          )}
        </div>

        <div className="hg-search-wrap">
          <TextField
            id="hongguo-search"
            value={draft}
            onChange={setDraft}
            onSubmit={() => submitSearch()}
            returnKind="search"
            hint="搜索短剧剧名、演员或题材"
            label="搜索短剧"
            icon={<SearchGlyph />}
          />
          {draft.trim() && (
            <button type="button" className="hg-search-go" onClick={() => submitSearch()}>
              搜索
            </button>
          )}
        </div>

        <div className="hg-header-actions">
          <button
            type="button"
            className="hg-header-pill"
            onClick={() => {
              if (tab === 'home') loadHome(true)
              else if (tab === 'feed') refreshFeed()
              else if (tab === 'category') {
                const s = useHongguo.getState()
                loadCategory(s.categoryType, s.categorySlug, 1)
              } else if (tab === 'rank') {
                loadRank(useHongguo.getState().rankKind, 1)
              }
            }}
          >
            刷新
          </button>

          <div className="hg-account-wrap">
            <button
              type="button"
              className={`hg-header-pill${signedIn ? ' signed' : ' accent'}`}
              onClick={() => {
                if (signedIn) setAccountMenu((v) => !v)
                else sendSignIn()
              }}
            >
              <PersonGlyph />
              <span>{signedIn ? '已登录' : signingIn ? '扫码中…' : '扫码登录'}</span>
            </button>

            {accountMenu && signedIn && (
              <div className="hg-account-popover" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenu(false)
                    loadHome(true)
                  }}
                >
                  重新同步片库
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenu(false)
                    sendSignIn()
                  }}
                >
                  切换账号 / 重登
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    setAccountMenu(false)
                    sendSignOut()
                  }}
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!open && <HongguoNoticeBanner className="hg-app-notice" />}

      {/* Tab strip shown at root catalog level; replaced cleanly by subviews when drilling down */}
      {!typing && views.length === 0 && (
        <nav className="hg-tabs" role="tablist" aria-label="红果频道">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`hg-tab${tab === item.id ? ' active' : ''}`}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <main className="hg-main">
        {typing ? (
          <SearchPanel draft={draft} onPick={(query) => submitSearch(query)} />
        ) : activeView ? (
          activeView.kind === 'detail' ? (
            <DramaDetailView drama={activeView.drama} />
          ) : (
            <SearchResultsView query={activeView.query} />
          )
        ) : tab === 'home' ? (
          <HomeTab />
        ) : tab === 'feed' ? (
          <FeedTab />
        ) : tab === 'category' ? (
          <CategoryTab />
        ) : tab === 'rank' ? (
          <RankTab />
        ) : (
          <LibraryTab />
        )}
      </main>

      {!typing && !open && <MiniPlayerBar />}
    </section>
  )
}

function SearchPanel({ draft, onPick }: { draft: string; onPick: (query: string) => void }) {
  const searches = useHongguo((s) => s.searches)
  const [resolved, setResolved] = useState<{ query: string; list: string[] }>({ query: '', list: [] })
  const trimmed = draft.trim()

  useEffect(() => {
    if (!trimmed) return
    let cancelled = false
    const timer = setTimeout(() => {
      ask({ ask: 'suggest', query: trimmed }).then((ans) => {
        if (cancelled) return
        setResolved({ query: trimmed, list: ans.suggestions ?? [] })
      })
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [trimmed])

  const loading = Boolean(trimmed) && resolved.query !== trimmed
  const suggestions = trimmed && resolved.query === trimmed ? resolved.list : []

  return (
    <div className="hg-search-panel">
      {trimmed && (
        <section className="hg-search-group">
          <div className="hg-search-group-head">
            <h3>{loading ? '正在联想关键词…' : '相关推荐词'}</h3>
            <button type="button" className="hg-link-btn" onClick={() => onPick(trimmed)}>
              直接搜索 “{trimmed}”
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="hg-chip-wrap">
              {suggestions.map((item) => (
                <button key={item} type="button" className="hg-search-chip" onClick={() => onPick(item)}>
                  <SearchGlyph />
                  <span>{item}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {searches.length > 0 && (
        <section className="hg-search-group">
          <div className="hg-search-group-head">
            <h3>最近搜索</h3>
            <button type="button" className="hg-link-btn" onClick={() => clearSearches()}>
              清空记录
            </button>
          </div>
          <div className="hg-chip-wrap">
            {searches.map((item) => (
              <div key={item} className="hg-history-pill">
                <button type="button" onClick={() => onPick(item)}>
                  {item}
                </button>
                <button
                  type="button"
                  className="hg-history-del"
                  aria-label={`删除 ${item}`}
                  onClick={() => forgetSearch(item)}
                >
                  <CloseGlyph />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="hg-search-group">
        <div className="hg-search-group-head">
          <h3>全网热搜题材</h3>
        </div>
        <div className="hg-chip-wrap">
          {HONGGUO_HOT_KEYWORDS.map((kw) => (
            <button key={kw} type="button" className="hg-hot-chip" onClick={() => onPick(kw)}>
              {kw}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function HomeTab() {
  const banners = useHongguo((s) => s.banners)
  const sections = useHongguo((s) => s.sections)
  const watched = useHongguo((s) => s.watched)
  const homeLoading = useHongguo((s) => s.homeLoading)

  const [bannerIndex, setBannerIndex] = useState(0)
  const [sectionFilter, setSectionFilter] = useState<string>('all')

  const heroList = banners.length > 0 ? banners : PREVIEW_DRAMAS.slice(0, 4)
  const safeBannerIndex = heroList.length > 0 ? bannerIndex % heroList.length : 0

  useEffect(() => {
    if (heroList.length <= 1) return
    const timer = setInterval(() => {
      setBannerIndex((i) => (i + 1) % heroList.length)
    }, 6500)
    return () => clearInterval(timer)
  }, [heroList.length])

  const hero = heroList[safeBannerIndex] ?? heroList[0]
  const visibleSections = useMemo(() => {
    if (sectionFilter === 'all') return sections
    const matched = sections.filter((s) => s.tabType === sectionFilter)
    return matched.length > 0 ? matched : sections
  }, [sections, sectionFilter])

  return (
    <div className="hg-home">
      {hero && (
        <section className="hg-hero" aria-label="精选推荐轮播">
          <div className="hg-hero-bg">
            {(hero.backdrop || hero.cover) && (
              <img src={hero.backdrop || hero.cover} alt="" referrerPolicy="no-referrer" />
            )}
            <div className="hg-hero-mask" />
          </div>

          <div className="hg-hero-content">
            <div className="hg-hero-badges">
              {hero.category && <span className="hg-hero-pill accent">{hero.category}</span>}
              {hero.totalEpisodes > 0 && (
                <span className="hg-hero-pill">{hero.episodeText || `${hero.totalEpisodes}集全`}</span>
              )}
              {hero.heatText && <span className="hg-hero-pill">{hero.heatText}</span>}
            </div>

            {hero.titleArt ? (
              <img className="hg-hero-title-art" src={hero.titleArt} alt={hero.title} referrerPolicy="no-referrer" />
            ) : (
              <h2 className="hg-hero-title">{hero.title}</h2>
            )}

            {hero.synopsis && <p className="hg-hero-synopsis">{hero.synopsis}</p>}

            <div className="hg-hero-actions">
              <button type="button" className="hg-hero-btn primary" onClick={() => play(hero, 1, true)}>
                <PlayGlyph />
                <span>立即播放 第1集</span>
              </button>
              <button type="button" className="hg-hero-btn" onClick={() => openDetail(hero)}>
                <span>剧集详情 & 选集</span>
              </button>
            </div>
          </div>

          {heroList.length > 1 && (
            <div className="hg-hero-dots" role="tablist" aria-label="切换推荐海报">
              {heroList.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={idx === safeBannerIndex}
                  aria-label={item.title}
                  className={`hg-hero-dot${idx === safeBannerIndex ? ' active' : ''}`}
                  onClick={() => setBannerIndex(idx)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {watched.length > 0 && (
        <section className="hg-section">
          <div className="hg-section-head">
            <h3>继续观看</h3>
            <button type="button" className="hg-link-btn" onClick={() => selectTab('library')}>
              全部记录 ({watched.length})
            </button>
          </div>
          <div className="hg-continue-row">
            {watched.slice(0, 6).map((w) => (
              <button
                key={w.drama.id}
                type="button"
                className="hg-continue-card"
                onClick={() => play(w.drama, w.episode, true)}
              >
                <div className="hg-continue-thumb">
                  {w.drama.cover && <img src={w.drama.cover} alt="" referrerPolicy="no-referrer" />}
                  <span className="hg-continue-play">
                    <PlayGlyph />
                  </span>
                </div>
                <div className="hg-continue-info">
                  <strong>{w.drama.title}</strong>
                  <span>
                    第 {w.episode} 集 · {formatClock(w.position)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {sections.length > 1 && (
        <div className="hg-channel-pills">
          <button
            type="button"
            className={`hg-filter-pill${sectionFilter === 'all' ? ' active' : ''}`}
            onClick={() => setSectionFilter('all')}
          >
            全部频道
          </button>
          {sections.map((sec) => (
            <button
              key={sec.tabType}
              type="button"
              className={`hg-filter-pill${sectionFilter === sec.tabType ? ' active' : ''}`}
              onClick={() => setSectionFilter(sec.tabType)}
            >
              {sec.tabName}
            </button>
          ))}
        </div>
      )}

      {homeLoading && sections.length === 0 ? (
        <div className="hg-loading-box">正在同步红果短剧片库…</div>
      ) : (
        visibleSections.map((sec) => (
          <section key={sec.tabType} className="hg-section">
            <div className="hg-section-head">
              <h3>{sec.tabName}</h3>
              <button
                type="button"
                className="hg-link-btn"
                onClick={() => {
                  if (sec.tabType === 'human') loadCategory('real-drama', '', 1)
                  else if (sec.tabType === 'comic') loadCategory('comic-drama', '', 1)
                  else if (sec.tabType === 'ai') loadCategory('ai-drama', '', 1)
                  selectTab(sec.tabType === 'all' ? 'rank' : 'category')
                }}
              >
                查看更多 ›
              </button>
            </div>
            <div className="hg-grid">
              {sec.dramas.map((drama) => (
                <DramaCard key={`${sec.tabType}-${drama.id}`} drama={drama} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function FeedTab() {
  const feedItems = useHongguo((s) => s.feedItems)
  const feedActiveIndex = useHongguo((s) => s.feedActiveIndex)
  const feedHasMore = useHongguo((s) => s.feedHasMore)
  const feedLoading = useHongguo((s) => s.feedLoading)
  const favorites = useHongguo((s) => s.favorites)

  const items = feedItems.length > 0 ? feedItems : PREVIEW_DRAMAS
  const safeIdx = Math.max(0, Math.min(items.length - 1, feedActiveIndex))
  const current = items[safeIdx]
  const fav = current ? favorites.some((f) => f.id === current.id) : false

  const moveFeed = (delta: number) => {
    const next = Math.max(0, Math.min(items.length - 1, safeIdx + delta))
    useHongguo.setState({ feedActiveIndex: next })
    if (delta > 0 && next >= items.length - 2 && feedHasMore && !feedLoading) {
      loadFeed(true)
    }
  }

  return (
    <div className="hg-feed">
      {current && (
        <div className="hg-feed-spotlight">
          <div className="hg-feed-poster">
            {(current.cover || current.backdrop) && (
              <img src={current.cover || current.backdrop} alt={current.title} referrerPolicy="no-referrer" />
            )}
          </div>

          <div className="hg-feed-detail">
            <div className="hg-feed-tags">
              {current.category && <span className="hg-hero-pill accent">{current.category}</span>}
              {current.totalEpisodes > 0 && (
                <span className="hg-hero-pill">{current.episodeText || `${current.totalEpisodes}集`}</span>
              )}
              {current.heatText && <span className="hg-hero-pill">{current.heatText}</span>}
            </div>

            <h2>{current.title}</h2>
            <p className="hg-feed-author">
              {current.author || '红果精选'}
              {current.tags && current.tags.length > 0 ? ` · ${current.tags.slice(0, 4).join(' / ')}` : ''}
            </p>
            <p className="hg-feed-synopsis">{current.synopsis || '精彩高能短剧，点击即刻全屏开播。'}</p>

            <div className="hg-feed-actions">
              <button type="button" className="hg-hero-btn primary" onClick={() => play(current, 1, true)}>
                <PlayGlyph />
                <span>立即播放</span>
              </button>
              <button type="button" className="hg-hero-btn" onClick={() => openDetail(current)}>
                <span>详情 / 选集</span>
              </button>
              <button
                type="button"
                className={`hg-hero-btn${fav ? ' active' : ''}`}
                onClick={() => toggleFavorite(current)}
              >
                <span>{fav ? '已追剧' : '+ 追剧'}</span>
              </button>
            </div>

            <div className="hg-feed-step">
              <button type="button" className="hg-step-btn" disabled={safeIdx === 0} onClick={() => moveFeed(-1)}>
                上一部
              </button>
              <span className="hg-step-count">
                {safeIdx + 1} / {items.length}
              </span>
              <button
                type="button"
                className="hg-step-btn"
                disabled={safeIdx >= items.length - 1 && !feedHasMore}
                onClick={() => moveFeed(1)}
              >
                下一部
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hg-feed-queue">
        <div className="hg-feed-queue-head">
          <h3>推荐片单</h3>
          <button type="button" className="hg-link-btn" onClick={() => refreshFeed()}>
            {feedLoading ? '刷新中…' : '换一批'}
          </button>
        </div>

        <div className="hg-feed-list">
          {items.map((item, idx) => (
            <button
              key={`${item.id}-${idx}`}
              type="button"
              className={`hg-feed-item${idx === safeIdx ? ' active' : ''}`}
              onClick={() => useHongguo.setState({ feedActiveIndex: idx })}
            >
              <div className="hg-feed-item-thumb">
                {item.cover && <img src={item.cover} alt="" referrerPolicy="no-referrer" />}
              </div>
              <div className="hg-feed-item-copy">
                <strong>{item.title}</strong>
                <span>
                  {item.category || '短剧'} · {item.episodeText || `${item.totalEpisodes}集`}
                </span>
              </div>
            </button>
          ))}
        </div>

        {feedHasMore && (
          <button type="button" className="hg-load-more" disabled={feedLoading} onClick={() => loadFeed(true)}>
            {feedLoading ? '加载中…' : '加载更多短剧'}
          </button>
        )}
      </div>
    </div>
  )
}

function CategoryTab() {
  const categoryType = useHongguo((s) => s.categoryType)
  const categorySlug = useHongguo((s) => s.categorySlug)
  const categorySelectors = useHongguo((s) => s.categorySelectors)
  const categoryDramas = useHongguo((s) => s.categoryDramas)
  const categoryPage = useHongguo((s) => s.categoryPage)
  const categoryHasMore = useHongguo((s) => s.categoryHasMore)
  const categoryLoading = useHongguo((s) => s.categoryLoading)

  return (
    <div className="hg-category">
      <div className="hg-filter-bar">
        <div className="hg-type-pills" role="tablist" aria-label="内容类型">
          {HONGGUO_CONTENT_TYPES.map((ct) => (
            <button
              key={ct.id}
              type="button"
              role="tab"
              aria-selected={categoryType === ct.id}
              className={`hg-type-pill${categoryType === ct.id ? ' active' : ''}`}
              onClick={() => loadCategory(ct.id, '', 1)}
            >
              {ct.label}
            </button>
          ))}
        </div>

        <div className="hg-genre-pills" role="tablist" aria-label="题材标签">
          <button
            type="button"
            role="tab"
            aria-selected={categorySlug === ''}
            className={`hg-filter-pill${categorySlug === '' ? ' active' : ''}`}
            onClick={() => loadCategory(categoryType, '', 1)}
          >
            全部题材
          </button>
          {categorySelectors.map((sel) => (
            <button
              key={sel.id}
              type="button"
              role="tab"
              aria-selected={categorySlug === sel.id}
              className={`hg-filter-pill${categorySlug === sel.id ? ' active' : ''}`}
              onClick={() => loadCategory(categoryType, sel.id, 1)}
            >
              {sel.name}
            </button>
          ))}
        </div>
      </div>

      {categoryLoading && categoryDramas.length === 0 ? (
        <div className="hg-loading-box">正在加载分类剧单…</div>
      ) : categoryDramas.length === 0 ? (
        <div className="hg-empty-box">暂无该分类下的短剧</div>
      ) : (
        <>
          <div className="hg-grid">
            {categoryDramas.map((drama) => (
              <DramaCard key={drama.id} drama={drama} />
            ))}
          </div>
          {categoryHasMore && (
            <button
              type="button"
              className="hg-load-more"
              disabled={categoryLoading}
              onClick={() => loadCategory(categoryType, categorySlug, categoryPage + 1)}
            >
              {categoryLoading ? '正在加载…' : '加载下一页'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function RankTab() {
  const rankKind = useHongguo((s) => s.rankKind)
  const rankUpdatedText = useHongguo((s) => s.rankUpdatedText)
  const rankDramas = useHongguo((s) => s.rankDramas)
  const rankPage = useHongguo((s) => s.rankPage)
  const rankHasMore = useHongguo((s) => s.rankHasMore)
  const rankLoading = useHongguo((s) => s.rankLoading)

  return (
    <div className="hg-rank">
      <div className="hg-rank-header">
        <div className="hg-type-pills" role="tablist" aria-label="热播榜单">
          {HONGGUO_RANK_KINDS.map((rk) => (
            <button
              key={rk.id}
              type="button"
              role="tab"
              aria-selected={rankKind === rk.id}
              className={`hg-type-pill${rankKind === rk.id ? ' active' : ''}`}
              onClick={() => loadRank(rk.id, 1)}
            >
              {rk.label}
            </button>
          ))}
        </div>
        {rankUpdatedText && <span className="hg-updated-pill">{rankUpdatedText}</span>}
      </div>

      {rankLoading && rankDramas.length === 0 ? (
        <div className="hg-loading-box">正在加载榜单排名…</div>
      ) : (
        <>
          <div className="hg-grid">
            {rankDramas.map((drama, idx) => (
              <DramaCard key={drama.id} drama={drama} rank={drama.rank ?? idx + 1} />
            ))}
          </div>
          {rankHasMore && (
            <button
              type="button"
              className="hg-load-more"
              disabled={rankLoading}
              onClick={() => loadRank(rankKind, rankPage + 1)}
            >
              {rankLoading ? '正在加载…' : '查看更多排名'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function LibraryTab() {
  const favorites = useHongguo((s) => s.favorites)
  const watched = useHongguo((s) => s.watched)

  return (
    <div className="hg-library">
      <section className="hg-section">
        <div className="hg-section-head">
          <h3>我的追剧 ({favorites.length})</h3>
        </div>
        {favorites.length === 0 ? (
          <div className="hg-empty-box">还没有追剧收藏，打开任意短剧点击“+ 追剧”即可保存在此</div>
        ) : (
          <div className="hg-grid">
            {favorites.map((drama) => (
              <DramaCard key={drama.id} drama={drama} />
            ))}
          </div>
        )}
      </section>

      <section className="hg-section">
        <div className="hg-section-head">
          <h3>观看记录 ({watched.length})</h3>
          {watched.length > 0 && (
            <button type="button" className="hg-link-btn" onClick={() => clearWatched()}>
              清空历史
            </button>
          )}
        </div>
        {watched.length === 0 ? (
          <div className="hg-empty-box">暂无观看记录</div>
        ) : (
          <div className="hg-watched-grid">
            {watched.map((w) => {
              const pct = w.duration > 0 ? Math.min(100, (w.position / w.duration) * 100) : 0
              return (
                <article key={w.drama.id} className="hg-watched-card">
                  <button type="button" className="hg-watched-main" onClick={() => play(w.drama, w.episode, true)}>
                    <div className="hg-watched-cover">
                      {w.drama.cover && <img src={w.drama.cover} alt="" referrerPolicy="no-referrer" />}
                      <span className="hg-watched-badge">第 {w.episode} 集</span>
                    </div>
                    <div className="hg-watched-info">
                      <strong>{w.drama.title}</strong>
                      <span>
                        已播 {formatClock(w.position)} / {formatClock(w.duration)}
                      </span>
                      <div className="hg-watched-bar">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </button>
                  <button type="button" className="hg-watched-detail-btn" onClick={() => openDetail(w.drama)}>
                    选集
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function DramaDetailView({ drama }: { drama: HongguoDrama }) {
  const detailCache = useHongguo((s) => s.detailCache)
  const favorites = useHongguo((s) => s.favorites)
  const watched = useHongguo((s) => s.watched)
  const currentDrama = useHongguo((s) => s.currentDrama)
  const currentEpisode = useHongguo((s) => s.currentEpisode)

  useEffect(() => {
    loadDramaDetail(drama.id)
  }, [drama.id])

  const detail = detailCache[drama.id]
  const merged = mergeDramaDetail(drama, detail)
  const fav = favorites.some((f) => f.id === merged.id)
  const watchedEntry = watched.find((w) => w.drama.id === merged.id)
  const isPlayingThis = currentDrama?.id === merged.id
  const activeEpisode = isPlayingThis ? currentEpisode : (watchedEntry?.episode ?? 1)
  const totalEpisodes = Math.max(merged.totalEpisodes || detail?.vidList.length || 0, 1)
  const accessibleEpisodes = detail?.accessibleEpisodes ?? merged.accessibleEpisodes ?? 0
  const recommendations = detail?.recommendations ?? []

  return (
    <div className="hg-detail">
      <div className="hg-detail-hero">
        {(merged.backdrop || merged.cover) && (
          <img className="hg-detail-blur" src={merged.backdrop || merged.cover} alt="" referrerPolicy="no-referrer" />
        )}
        <div className="hg-detail-poster">
          {merged.cover && <img src={merged.cover} alt={merged.title} referrerPolicy="no-referrer" />}
        </div>

        <div className="hg-detail-meta">
          <h2>{merged.title}</h2>
          <div className="hg-detail-stats">
            {merged.category && <span className="hg-hero-pill accent">{merged.category}</span>}
            <span>{merged.episodeText || `共 ${totalEpisodes} 集`}</span>
            {merged.scoreText && <span>评分 {merged.scoreText}</span>}
            {merged.heatText && <span>{merged.heatText}</span>}
            {detail?.favoriteCount && <span>{detail.favoriteCount} 收藏</span>}
            {detail?.likeCount && <span>{detail.likeCount} 点赞</span>}
            {detail?.recordNumber && <span>{detail.recordNumber}</span>}
          </div>

          {merged.tags && merged.tags.length > 0 && (
            <div className="hg-detail-tags">
              {merged.tags.map((t) => (
                <span key={t} className="hg-tag-chip">
                  {t}
                </span>
              ))}
            </div>
          )}

          <p className="hg-detail-synopsis">{merged.synopsis || '红果精选热播短剧，大屏沉浸观影。'}</p>

          <div className="hg-detail-actions">
            <button type="button" className="hg-hero-btn primary" onClick={() => play(merged, activeEpisode, true)}>
              <PlayGlyph />
              <span>
                {isPlayingThis
                  ? `继续播放 第${activeEpisode}集`
                  : watchedEntry
                    ? `续播 第${watchedEntry.episode}集`
                    : '立即播放 第1集'}
              </span>
            </button>

            <button
              type="button"
              className={`hg-hero-btn${fav ? ' active' : ''}`}
              onClick={() => toggleFavorite(merged)}
            >
              <span>{fav ? '✓ 已追剧' : '+ 加入追剧'}</span>
            </button>
          </div>
        </div>
      </div>

      {detail?.celebrities && detail.celebrities.length > 0 && (
        <section className="hg-section">
          <div className="hg-section-head">
            <h3>演职员表</h3>
          </div>
          <div className="hg-cast-row">
            {detail.celebrities.map((person, i) => (
              <div key={`${person.name}-${i}`} className="hg-cast-card">
                <div className="hg-cast-avatar">
                  {person.avatar ? (
                    <img src={person.avatar} alt={person.name} referrerPolicy="no-referrer" />
                  ) : (
                    <PersonGlyph />
                  )}
                </div>
                <strong className="hg-cast-name">{person.name}</strong>
                {person.role && <span className="hg-cast-role">{person.role}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="hg-section">
        <div className="hg-section-head">
          <h3>剧集选集 (共 {totalEpisodes} 集)</h3>
        </div>
        <EpisodePicker
          totalEpisodes={totalEpisodes}
          accessibleEpisodes={accessibleEpisodes}
          currentEpisode={activeEpisode}
          onSelect={(ep) => play(merged, ep, true)}
        />
      </section>

      {recommendations.length > 0 && (
        <section className="hg-section">
          <div className="hg-section-head">
            <h3>猜你喜欢</h3>
          </div>
          <div className="hg-grid">
            {recommendations.map((rec) => (
              <DramaCard key={rec.id} drama={rec} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SearchResultsView({ query }: { query: string }) {
  const [retryTick, setRetryTick] = useState(0)
  const requestKey = `${query}#${retryTick}`
  const [result, setResult] = useState<{
    key: string
    dramas: HongguoDrama[]
    errorMsg: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    ask({ ask: 'search', query }).then((ans) => {
      if (cancelled) return
      setResult({
        key: requestKey,
        dramas: ans.failed ? [] : (ans.dramas ?? []),
        errorMsg: ans.failed ? ans.error || '搜索接口暂时不可用或需要风控验证，请稍后重试' : null,
      })
    })
    return () => {
      cancelled = true
    }
  }, [query, requestKey])

  const loading = result?.key !== requestKey
  const dramas = loading ? [] : result.dramas
  const errorMsg = loading ? null : result.errorMsg

  return (
    <div className="hg-results">
      <div className="hg-section-head">
        <h3>
          “{query}” 的搜索结果 {!loading && `(${dramas.length})`}
        </h3>
        <button type="button" className="hg-link-btn" onClick={() => setRetryTick((n) => n + 1)}>
          重新搜索
        </button>
      </div>

      {loading ? (
        <div className="hg-loading-box">正在检索红果片库…</div>
      ) : errorMsg ? (
        <div className="hg-empty-box">
          <p>{errorMsg}</p>
          <button type="button" className="hg-hero-btn primary" onClick={() => setRetryTick((n) => n + 1)}>
            重试搜索
          </button>
        </div>
      ) : dramas.length === 0 ? (
        <div className="hg-empty-box">未找到与 “{query}” 相关的短剧，试试换个关键词</div>
      ) : (
        <div className="hg-grid">
          {dramas.map((drama) => (
            <DramaCard key={drama.id} drama={drama} />
          ))}
        </div>
      )}
    </div>
  )
}

function MiniPlayerBar() {
  const playback = useHongguo((s) => s.playback)
  const currentDrama = useHongguo((s) => s.currentDrama)
  const currentEpisode = useHongguo((s) => s.currentEpisode)
  const playing = useHongguo((s) => s.playing)

  const posTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [pos, setPos] = useState(0)

  useEffect(() => {
    const update = () => setPos(positionOf(playback, performance.now()))
    update()
    if (!playing) return
    const id = setInterval(update, 500)
    posTimerRef.current = id
    return () => clearInterval(id)
  }, [playback, playing])

  if (!playback && !currentDrama) return null

  const title = playback?.dramaTitle || currentDrama?.title || playback?.title?.split(' · ')[0] || '红果短剧'
  const ep = playback?.episodeNumber ?? playback?.episode ?? currentEpisode ?? 1
  const artwork = playback?.artwork || currentDrama?.cover
  const ended = playback?.status === 'ended'
  const isPlayingNow = Boolean(playing || playback?.status === 'playing')

  return (
    <div className="hg-mini" role="region" aria-label="当前播放控制栏">
      <button type="button" className="hg-mini-info" onClick={() => openPlayer()}>
        <div className="hg-mini-thumb">{artwork && <img src={artwork} alt="" referrerPolicy="no-referrer" />}</div>
        <div className="hg-mini-copy">
          <strong>{title}</strong>
          <span>
            第 {ep} 集 · {formatClock(pos)} / {formatClock(playback?.duration || 0)}
          </span>
        </div>
      </button>

      <div className="hg-mini-controls">
        <button type="button" className="hg-mini-btn" aria-label="上一集" onClick={() => skip(-1)}>
          <PreviousGlyph />
        </button>
        <button
          type="button"
          className="hg-mini-btn main"
          aria-label={ended ? '重播' : isPlayingNow ? '暂停' : '播放'}
          onClick={() => playOrPause()}
        >
          {ended ? <ReplayGlyph /> : isPlayingNow ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <button type="button" className="hg-mini-btn" aria-label="下一集" onClick={() => skip(1)}>
          <NextGlyph />
        </button>
        <button type="button" className="hg-mini-btn" aria-label="展开全屏播放器" onClick={() => openPlayer()}>
          <FullScreenGlyph />
        </button>
        <button type="button" className="hg-mini-btn close" aria-label="停止播放" onClick={() => stopDrama()}>
          <CloseGlyph />
        </button>
      </div>
    </div>
  )
}
