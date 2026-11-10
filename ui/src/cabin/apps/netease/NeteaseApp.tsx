import { useEffect, useState } from 'react'
import { TextField } from '../../keyboard/TextField'
import { SearchGlyph } from '../../keyboard/glyphs'
import {
  backToPlaylists,
  DEFAULT_USER_PLAYLISTS,
  DISCOVER_CATEGORIES,
  MOCK_RECOMMENDED_PLAYLISTS,
  play,
  playOrPause,
  searchSongs,
  selectDiscoverChart,
  selectPlaylist,
  selectTab,
  sendSignIn,
  sendSignOut,
  sendStart,
  useNetease,
} from './netease'
import { PlaybackNoticeBanner } from './PlaybackNoticeBanner'
import { TurntablePlayer } from './TurntablePlayer'
import { NowPlaying } from './NowPlaying'
import { QueueDrawer } from './QueueDrawer'
import './netease.css'

function formatPlayCount(count?: number): string {
  if (!count) return '10万'
  if (count >= 100000000) return `${(count / 100000000).toFixed(1)}亿`
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
  return `${count}`
}

export function NeteaseApp() {
  const {
    signedIn,
    signingIn,
    tracks,
    playlists,
    recommendedPlaylists,
    currentPlaylist,
    tab,
    discoverChartId,
    loading,
    nowPlaying,
    userProfile,
  } = useNetease()

  const [query, setQuery] = useState('')
  const [currentDateNumber] = useState(() => new Date().getDate())
  const [myCategory, setMyCategory] = useState<'all' | 'created' | 'collected'>('all')

  const myPlaylists = (playlists.length > 0 ? playlists : DEFAULT_USER_PLAYLISTS).filter((pl, idx, arr) => {
    if (arr.findIndex((other) => other.id === pl.id) !== idx) return false
    if (myCategory === 'created') return !pl.subscribed
    if (myCategory === 'collected') return Boolean(pl.subscribed)
    return true
  })

  useEffect(() => {
    sendStart()
  }, [])

  // If user opened full-screen / expanded player
  if (nowPlaying) {
    return (
      <section className="app-panel netease-app" aria-label="网易云音乐">
        <NowPlaying />
        <QueueDrawer />
      </section>
    )
  }

  const handleSearchSubmit = () => {
    if (query.trim()) {
      searchSongs(query)
    }
  }

  const handleTagClick = (tag: string) => {
    setQuery(tag)
    searchSongs(tag)
  }

  return (
    <section className="app-panel netease-app" aria-label="网易云音乐">
      <div className="netease-split-layout">
        {/* Left Side: Automotive Turntable Player */}
        <aside className="netease-left-panel">
          <TurntablePlayer />
        </aside>

        {/* Right Side: Automotive Content Browser */}
        <main className="netease-right-panel">
          {/* Top Bar with Navigation Tabs and VIP / Account Status */}
          <header className="netease-nav-bar">
            <nav className="netease-tabs" aria-label="导航标签">
              <button
                type="button"
                className={`tab-item ${tab === 'recommend' ? 'active' : ''}`}
                onClick={() => selectTab('recommend')}
              >
                推荐
              </button>
              <button
                type="button"
                className={`tab-item ${tab === 'discover' ? 'active' : ''}`}
                onClick={() => selectTab('discover')}
              >
                发现
              </button>
              <button
                type="button"
                className={`tab-item ${tab === 'roaming' ? 'active' : ''}`}
                onClick={() => selectTab('roaming')}
              >
                漫游
              </button>
              <button
                type="button"
                className={`tab-item ${tab === 'my' ? 'active' : ''}`}
                onClick={() => selectTab('my')}
              >
                我的
              </button>
              <button
                type="button"
                className={`tab-item ${tab === 'search' ? 'active' : ''}`}
                onClick={() => selectTab('search')}
              >
                搜索 <span className="tab-search-icon">🔍</span>
              </button>
            </nav>

            <div className="netease-account-box">
              {signingIn ? (
                <div className="account-signing-in">
                  <span className="account-spinner" />
                  <span>请在电脑扫码...</span>
                </div>
              ) : signedIn ? (
                <div
                  className="account-vip-pill"
                  title={`已登录车载黑胶VIP · 已陪伴您 ${userProfile?.vipDays || 1498} 天`}
                >
                  <span className="vip-icon">👑</span>
                  <span className="vip-text">VIP 陪伴 {userProfile?.vipDays || 1498}天</span>
                  <button type="button" className="account-signout-btn" onClick={sendSignOut} title="退出登录">
                    退出
                  </button>
                </div>
              ) : (
                <button type="button" className="account-signin-btn" onClick={sendSignIn}>
                  桌面扫码登录
                </button>
              )}
            </div>
          </header>

          {/* If signing in QR banner prompt */}
          {signingIn && (
            <div className="netease-qr-notice">
              <span className="notice-icon">📱</span>
              <div className="notice-content">
                <strong>桌面扫码登录窗口已开启</strong>
                <span>请查看电脑桌面，使用网易云音乐手机APP扫码即可同步你的红心歌单与专属推荐。</span>
              </div>
            </div>
          )}

          {/* Playback skip / VIP restriction notice */}
          <PlaybackNoticeBanner />

          {/* Scrollable Content Viewport */}
          <div className="netease-content-scroll">
            {/* 1. RECOMMEND TAB (Matches Reference Picture) */}
            {tab === 'recommend' && !currentPlaylist && (
              <div className="recommend-view">
                {/* Section A: 4 Hero Mode Cards */}
                <section className="hero-cards-section">
                  {/* Card 1: 每日推荐 */}
                  <div
                    className="hero-card hero-daily"
                    onClick={() => {
                      if (tracks.length > 0) play(tracks[0], tracks, 0)
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="hero-card-badge">
                      <span className="badge-cal-icon">📅</span>
                      <span className="badge-cal-num">{currentDateNumber}</span>
                      <span className="badge-title">每日推荐</span>
                    </div>
                    <div className="hero-card-footer">
                      <span className="hero-card-sub">符合你口味的新鲜好歌</span>
                    </div>
                  </div>

                  {/* Card 2: 私人漫游 */}
                  <div
                    className="hero-card hero-roaming"
                    onClick={() => selectTab('roaming')}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="hero-card-badge">
                      <span className="badge-cal-icon">♾️</span>
                      <span className="badge-title">私人漫游</span>
                    </div>
                    <div className="hero-card-footer">
                      <span className="hero-card-sub">多种听歌模式随心播放</span>
                    </div>
                  </div>

                  {/* Card 3: 心动模式 */}
                  <div
                    className="hero-card hero-heartbeat"
                    onClick={() => {
                      if (tracks.length > 1) play(tracks[1], tracks, 1)
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="hero-card-badge">
                      <span className="badge-cal-icon">〰️</span>
                      <span className="badge-title">心动模式</span>
                    </div>
                    <div className="hero-card-footer">
                      <span className="hero-card-sub">智能推荐你的最爱</span>
                    </div>
                  </div>

                  {/* Card 4: 民谣日推 */}
                  <div
                    className="hero-card hero-folk"
                    onClick={() => {
                      const pl =
                        recommendedPlaylists.find((item) => /民谣|公路|folk/i.test(item.name)) ||
                        MOCK_RECOMMENDED_PLAYLISTS[3]
                      selectPlaylist(pl)
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="hero-card-badge">
                      <span className="badge-cal-icon">🎸</span>
                      <span className="badge-title">民谣日推</span>
                    </div>
                    <div className="hero-card-footer">
                      <span className="hero-card-sub">公路行者的故事</span>
                    </div>
                  </div>
                </section>

                {/* Section B: 最近常听 (Recently Listened Tiles) */}
                <section className="section-block">
                  <h3 className="section-heading">最近常听</h3>
                  <div className="recent-tiles-grid">
                    <div className="recent-tile tile-heart" onClick={() => selectTab('my')} role="button" tabIndex={0}>
                      <div className="recent-tile-thumb heart-thumb">
                        <span className="heart-icon">❤️</span>
                      </div>
                      <span className="recent-tile-name">红心歌单</span>
                    </div>

                    <div
                      className="recent-tile"
                      onClick={() => {
                        if (tracks.length > 0) play(tracks[0], tracks, 0)
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="recent-tile-thumb">
                        <span className="tile-badge-icon">📅</span>
                      </div>
                      <span className="recent-tile-name">每日推荐</span>
                    </div>

                    <div className="recent-tile" onClick={() => selectTab('roaming')} role="button" tabIndex={0}>
                      <div className="recent-tile-thumb roam-thumb">
                        <span className="tile-badge-icon">♾️</span>
                      </div>
                      <span className="recent-tile-name">漫游歌单</span>
                    </div>

                    <div
                      className="recent-tile"
                      onClick={() =>
                        selectPlaylist({
                          id: '19723756',
                          name: '云音乐飙升榜 · 全网热播',
                          trackCount: 100,
                        })
                      }
                      role="button"
                      tabIndex={0}
                    >
                      <div className="recent-tile-thumb soar-thumb">
                        <span className="tile-badge-icon">🚀</span>
                      </div>
                      <span className="recent-tile-name">飙升榜单</span>
                    </div>
                  </div>
                </section>

                {/* Section C: 推荐歌单 (Recommended Playlists) */}
                <section className="section-block">
                  <h3 className="section-heading">推荐歌单</h3>
                  <div className="playlists-grid">
                    {recommendedPlaylists
                      .filter((pl, idx, arr) => arr.findIndex((o) => o.id === pl.id) === idx)
                      .map((pl) => (
                        <div
                          key={pl.id}
                          className="pl-card"
                          onClick={() => selectPlaylist(pl)}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="pl-card-thumb">
                            {pl.coverImgUrl ? (
                              <img src={pl.coverImgUrl} alt={pl.name} referrerPolicy="no-referrer" />
                            ) : (
                              <div className="pl-thumb-fallback">📁</div>
                            )}
                            <div className="pl-play-count">🎧 {formatPlayCount(pl.playCount)}</div>
                          </div>
                          <div className="pl-card-title">{pl.name}</div>
                        </div>
                      ))}
                  </div>
                </section>

                {/* Section D: 今日推荐好歌流 */}
                <section className="section-block">
                  <h3 className="section-heading">今日热推好歌</h3>
                  <SongListView tracks={tracks} loading={loading} />
                </section>
              </div>
            )}

            {/* 2. DISCOVER TAB (Charts & Categories) */}
            {tab === 'discover' && !currentPlaylist && (
              <div className="discover-view">
                {/* Secondary Tab Pills (二级Tab: 参考推荐、官方、华语胶囊样式) */}
                <div className="sub-tabs-row" role="tablist" aria-label="二级分类标签">
                  {DISCOVER_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={discoverChartId === c.id}
                      className={`sub-tab-pill ${c.kind === 'brand' ? 'pill-brand' : 'pill-genre'} ${
                        discoverChartId === c.id ? 'active' : ''
                      }`}
                      onClick={() => selectDiscoverChart(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                <SongListView tracks={tracks} loading={loading} showRank />
              </div>
            )}

            {/* 3. ROAMING TAB */}
            {tab === 'roaming' && !currentPlaylist && (
              <div className="roaming-view">
                <div className="roaming-hero-banner">
                  <div className="roaming-hero-icon">♾️</div>
                  <div className="roaming-hero-info">
                    <h2>车载私人漫游</h2>
                    <p>根据你的收听偏好实时生成个性化电台，长途驾驶的最佳音乐伴侣。</p>
                    <button
                      type="button"
                      className="roaming-start-btn"
                      onClick={() => {
                        if (tracks.length > 0) play(tracks[0], tracks, 0)
                      }}
                    >
                      ▶ 开始漫游播放
                    </button>
                  </div>
                </div>

                <div className="section-block">
                  <h3 className="section-heading">漫游推荐曲目</h3>
                  <SongListView tracks={tracks} loading={loading} />
                </div>
              </div>
            )}

            {/* 4. MY MUSIC TAB */}
            {tab === 'my' && !currentPlaylist && (
              <div className="my-view">
                {!signedIn ? (
                  <div className="my-empty-box">
                    <div className="empty-icon">❤️</div>
                    <h3>登录网易云音乐</h3>
                    <p>扫码登录后，可直接在卡车座舱内同步你的「我喜欢的音乐」以及收藏的个人歌单。</p>
                    <button type="button" className="account-signin-btn large" onClick={sendSignIn}>
                      桌面扫码登录
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="section-title-row">
                      <h3 className="section-heading">我的曲库与收藏</h3>
                      {loading && <span className="detail-loading-badge">· 正在同步...</span>}
                    </div>

                    {/* Secondary Tab Pills in "我的" (二级Tab) */}
                    <div className="sub-tabs-row" role="tablist" aria-label="我的曲库二级分类">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={myCategory === 'all'}
                        className={`sub-tab-pill pill-brand ${myCategory === 'all' ? 'active' : ''}`}
                        onClick={() => setMyCategory('all')}
                      >
                        全部
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={myCategory === 'created'}
                        className={`sub-tab-pill pill-brand ${myCategory === 'created' ? 'active' : ''}`}
                        onClick={() => setMyCategory('created')}
                      >
                        自建
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={myCategory === 'collected'}
                        className={`sub-tab-pill pill-genre ${myCategory === 'collected' ? 'active' : ''}`}
                        onClick={() => setMyCategory('collected')}
                      >
                        收藏
                      </button>
                    </div>

                    {myPlaylists.length === 0 ? (
                      <div className="song-list-empty">暂无{myCategory === 'collected' ? '收藏' : '自建'}歌单</div>
                    ) : (
                      <div className="playlists-grid">
                        {myPlaylists.map((pl) => (
                          <div
                            key={pl.id}
                            className="pl-card"
                            onClick={() => selectPlaylist(pl)}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="pl-card-thumb">
                              {pl.coverImgUrl ? (
                                <img src={pl.coverImgUrl} alt={pl.name} referrerPolicy="no-referrer" />
                              ) : (
                                <div className="pl-thumb-fallback">📁</div>
                              )}
                              <div className="pl-play-count">🎧 {formatPlayCount(pl.playCount)}</div>
                            </div>
                            <div className="pl-card-title">{pl.name}</div>
                            <div className="pl-card-sub">{pl.trackCount} 首歌曲</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 5. SEARCH TAB */}
            {tab === 'search' && !currentPlaylist && (
              <div className="search-view">
                <div className="search-bar-wrap">
                  <div className="search-input-field">
                    <TextField
                      id="netease-search-input"
                      value={query}
                      onChange={setQuery}
                      onSubmit={handleSearchSubmit}
                      returnKind="search"
                      hint="搜索歌曲、歌手、专辑..."
                      label="搜索歌曲"
                      icon={<SearchGlyph />}
                    />
                  </div>
                  <button type="button" className="search-submit-btn" onClick={handleSearchSubmit}>
                    搜索
                  </button>
                </div>

                {/* Popular Tags */}
                <div className="search-tags">
                  <span className="tags-label">大家都在搜:</span>
                  <div className="sub-tabs-row search-tags-row">
                    {['周杰伦', '起风了', '平凡之路', '车载摇滚', '经典民谣', '粤语老歌', '电音慢摇'].map(
                      (tag, idx) => (
                        <button
                          key={tag}
                          type="button"
                          className={`sub-tab-pill ${idx < 2 ? 'pill-brand' : 'pill-genre'}`}
                          onClick={() => handleTagClick(tag)}
                        >
                          {tag}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="search-results-section">
                  <h3 className="section-heading">{query ? `搜索结果: "${query}"` : '推荐热搜好歌'}</h3>
                  <SongListView tracks={tracks} loading={loading} />
                </div>
              </div>
            )}

            {/* PLAYLIST DETAIL VIEW (When a playlist is open) */}
            {currentPlaylist && (
              <div className="playlist-detail-view">
                <div className="detail-header">
                  <button type="button" className="detail-back-btn" onClick={backToPlaylists}>
                    ‹ 返回
                  </button>
                  <div className="detail-pl-info">
                    <h2 className="detail-pl-title">{currentPlaylist.name}</h2>
                    <span className="detail-pl-count">
                      {tracks.length > 0 ? tracks.length : currentPlaylist.trackCount} 首歌曲
                      {loading && <span className="detail-loading-badge"> · 正在同步...</span>}
                    </span>
                  </div>
                  {tracks.length > 0 && (
                    <button type="button" className="detail-playall-btn" onClick={() => play(tracks[0], tracks, 0)}>
                      ▶ 播放全部
                    </button>
                  )}
                </div>

                <SongListView tracks={tracks} loading={loading} />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Floating Queue Drawer */}
      <QueueDrawer />
    </section>
  )
}

function SongListView({
  tracks,
  loading,
  showRank = false,
}: {
  tracks: import('../../../shared/host').NeteaseTrack[]
  loading: boolean
  showRank?: boolean
}) {
  const playback = useNetease((s) => s.playback)
  const playing = useNetease((s) => s.playing)

  if (loading && tracks.length === 0) {
    return (
      <div className="song-list-loading">
        <span className="list-spinner" />
        <span>正在加载歌曲列表...</span>
      </div>
    )
  }

  if (tracks.length === 0) {
    return <div className="song-list-empty">暂无歌曲</div>
  }

  return (
    <div className="song-list">
      {tracks.map((track, idx) => {
        const isCurrent = playback?.title === track.title && playback?.artist === track.artist
        const isUnplayable = track.playable === false
        const isVip = track.fee === 1 || track.fee === 4
        return (
          <div
            key={`${track.id}-${idx}`}
            className={`song-item ${isCurrent ? 'is-playing' : ''} ${isUnplayable ? 'is-unplayable' : ''}`}
            onClick={() => play(track, tracks, idx)}
            role="button"
            tabIndex={0}
          >
            <div className="song-idx">
              {isCurrent ? (
                <div className="sound-bars">
                  <span className={`bar b1 ${playing ? 'active' : ''}`} />
                  <span className={`bar b2 ${playing ? 'active' : ''}`} />
                  <span className={`bar b3 ${playing ? 'active' : ''}`} />
                </div>
              ) : (
                <span className={`idx-text ${showRank && idx < 3 ? 'rank-top' : ''}`}>{idx + 1}</span>
              )}
            </div>

            <div className="song-thumb">
              {track.artwork ? (
                <img src={track.artwork} alt={track.title} referrerPolicy="no-referrer" />
              ) : (
                <div className="song-thumb-fallback">🎵</div>
              )}
            </div>

            <div className="song-body">
              <div className="song-title-row">
                <span className="song-title">{track.title}</span>
                {isVip && <span className="song-badge-vip">{track.fee === 4 ? '付费' : 'VIP'}</span>}
                {isUnplayable && <span className="song-badge-muted">{isVip ? 'VIP限播' : '无音源'}</span>}
              </div>
              <div className="song-artist">
                <span>{track.artist}</span>
                {track.album && <span> · {track.album}</span>}
              </div>
            </div>

            <button
              type="button"
              className="song-play-action"
              onClick={(e) => {
                e.stopPropagation()
                if (isCurrent) {
                  playOrPause()
                } else {
                  play(track, tracks, idx)
                }
              }}
              aria-label={isCurrent && playing ? '暂停' : '播放'}
            >
              {isCurrent && playing ? '⏸' : '▶'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
