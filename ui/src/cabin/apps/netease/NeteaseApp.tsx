import { useEffect, useState } from 'react'
import { TextField } from '../../keyboard/TextField'
import { SearchGlyph } from '../../keyboard/glyphs'
import {
  backToPlaylists,
  play,
  playOrPause,
  searchSongs,
  selectPlaylist,
  selectTab,
  sendSignIn,
  sendSignOut,
  sendStart,
  setNowPlaying,
  useNetease,
} from './netease'
import { NowPlaying } from './NowPlaying'
import './netease.css'

export function NeteaseApp() {
  const { signedIn, signingIn, playing, tracks, playlists, currentPlaylist, tab, loading, playback, nowPlaying } =
    useNetease()
  const [query, setQuery] = useState('')

  useEffect(() => {
    sendStart()
  }, [])

  if (nowPlaying && playback) {
    return (
      <section className="app-panel netease-app">
        <NowPlaying />
      </section>
    )
  }

  const handleSearchSubmit = () => {
    if (query.trim()) {
      searchSongs(query)
    }
  }

  return (
    <section className="app-panel netease-app" aria-label="网易云音乐">
      <header className="netease-header">
        <div className="netease-logo">
          <span className="netease-badge">Music</span>
          <h1 className="netease-title">网易云音乐</h1>
        </div>

        <div className="netease-account">
          {signingIn ? (
            <div className="netease-status-signing-in">
              <span className="netease-spinner" />
              <span>请在电脑桌面上扫码登录...</span>
            </div>
          ) : signedIn ? (
            <div className="netease-signed-in">
              <span className="netease-vip-tag">黑胶VIP</span>
              <button type="button" className="netease-action-btn" onClick={sendSignOut}>
                退出
              </button>
            </div>
          ) : (
            <button type="button" className="netease-sign-in-btn" onClick={sendSignIn}>
              桌面扫码登录
            </button>
          )}
        </div>
      </header>

      {signingIn && (
        <div className="netease-qr-banner">
          <div className="netease-qr-banner-icon">📱</div>
          <div className="netease-qr-banner-text">
            <strong>桌面扫码登录窗口已打开</strong>
            <p>请查看您的电脑屏幕，使用网易云音乐手机APP扫描二维码登录，同步您的歌单与红心收藏。</p>
          </div>
        </div>
      )}

      {/* Tabs navigation */}
      <nav className="netease-tabs" aria-label="分类切换">
        <button
          type="button"
          className={`netease-tab-btn ${tab === 'hot' ? 'active' : ''}`}
          onClick={() => selectTab('hot')}
        >
          🔥 热歌榜
        </button>
        <button
          type="button"
          className={`netease-tab-btn ${tab === 'soar' ? 'active' : ''}`}
          onClick={() => selectTab('soar')}
        >
          🚀 飙升榜
        </button>
        <button
          type="button"
          className={`netease-tab-btn ${tab === 'new' ? 'active' : ''}`}
          onClick={() => selectTab('new')}
        >
          ✨ 新歌榜
        </button>
        <button
          type="button"
          className={`netease-tab-btn ${tab === 'my' ? 'active' : ''}`}
          onClick={() => selectTab('my')}
        >
          ❤️ 我的歌单
        </button>
        <button
          type="button"
          className={`netease-tab-btn ${tab === 'search' ? 'active' : ''}`}
          onClick={() => selectTab('search')}
        >
          🔍 搜索
        </button>
      </nav>

      {/* Search Input Bar (when tab is search) */}
      {tab === 'search' && (
        <div className="netease-search-bar">
          <div className="netease-search-input-wrap">
            <TextField
              id="netease-search-field"
              value={query}
              onChange={setQuery}
              onSubmit={handleSearchSubmit}
              returnKind="search"
              hint="搜索歌曲、歌手..."
              label="搜索歌曲"
              icon={<SearchGlyph />}
            />
          </div>
          <button type="button" className="netease-search-btn" onClick={handleSearchSubmit}>
            搜索
          </button>
        </div>
      )}

      <main className="netease-main">
        {/* If in My Playlists tab */}
        {tab === 'my' ? (
          !signedIn ? (
            <div className="netease-my-empty">
              <div className="netease-my-empty-icon">❤️</div>
              <h3>登录网易云音乐</h3>
              <p>扫码登录后，可直接在卡车座舱内同步播放您的「我喜欢的音乐」以及收藏的个人歌单。</p>
              <button type="button" className="netease-sign-in-btn" onClick={sendSignIn}>
                桌面扫码登录
              </button>
            </div>
          ) : currentPlaylist ? (
            <div>
              <div className="netease-playlist-header">
                <button type="button" className="netease-back-btn" onClick={backToPlaylists}>
                  ‹ 返回歌单
                </button>
                <h2 className="netease-section-title">{currentPlaylist.name}</h2>
              </div>
              <SongList tracks={tracks} loading={loading} />
            </div>
          ) : (
            <div>
              <h2 className="netease-section-title">我的曲库与歌单</h2>
              {loading ? (
                <div className="netease-empty">正在加载个人歌单...</div>
              ) : playlists.length === 0 ? (
                <div className="netease-empty">暂未获取到个人歌单，请稍后刷新</div>
              ) : (
                <div className="netease-playlists-grid">
                  {playlists.map((pl) => (
                    <div
                      key={pl.id}
                      className="netease-playlist-card"
                      onClick={() => selectPlaylist(pl)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="netease-pl-thumb">
                        {pl.coverImgUrl ? (
                          <img src={pl.coverImgUrl} alt={pl.name} referrerPolicy="no-referrer" />
                        ) : (
                          <div className="netease-thumb-fallback">📁</div>
                        )}
                      </div>
                      <div className="netease-pl-name">{pl.name}</div>
                      <div className="netease-pl-count">{pl.trackCount} 首歌曲</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          /* Other tabs (hot, soar, new, search) */
          <div>
            <h2 className="netease-section-title">
              {tab === 'hot'
                ? '网易云音乐 · 热歌榜'
                : tab === 'soar'
                  ? '网易云音乐 · 飙升榜'
                  : tab === 'new'
                    ? '网易云音乐 · 新歌榜'
                    : query
                      ? `搜索结果: "${query}"`
                      : '搜索网易云音乐歌曲'}
            </h2>
            <SongList tracks={tracks} loading={loading} />
          </div>
        )}
      </main>

      {playback && (
        <div className="netease-mini-bar" onClick={() => setNowPlaying(true)}>
          <div className="netease-mini-info">
            <span className="netease-mini-title">{playback.title}</span>
            <span className="netease-mini-author">{playback.artist}</span>
          </div>
          <div className="netease-mini-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="netease-mini-btn"
              onClick={playOrPause}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '⏸' : '▶'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function SongList({ tracks, loading }: { tracks: import('../../../shared/host').NeteaseTrack[]; loading: boolean }) {
  if (loading) {
    return <div className="netease-empty">正在加载歌曲列表...</div>
  }
  if (tracks.length === 0) {
    return <div className="netease-empty">暂无歌曲</div>
  }
  return (
    <div className="netease-list">
      {tracks.map((track, idx) => (
        <div key={track.id} className="netease-item" onClick={() => play(track)} role="button" tabIndex={0}>
          <div className="netease-item-index">{idx + 1}</div>
          <div className="netease-item-thumb">
            {track.artwork ? (
              <img src={track.artwork} alt={track.title} referrerPolicy="no-referrer" />
            ) : (
              <div className="netease-thumb-fallback">🎵</div>
            )}
          </div>
          <div className="netease-item-body">
            <div className="netease-item-title">{track.title}</div>
            <div className="netease-item-sub">
              <span>{track.artist}</span>
              {track.album && <span> - {track.album}</span>}
            </div>
          </div>
          <button type="button" className="netease-item-play-btn" aria-label="Play">
            ▶
          </button>
        </div>
      ))}
    </div>
  )
}
