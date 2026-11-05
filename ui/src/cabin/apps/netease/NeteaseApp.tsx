import { useEffect } from 'react'
import {
  play,
  playOrPause,
  sendSignIn,
  sendSignOut,
  sendStart,
  setNowPlaying,
  useNetease,
} from './netease'
import { NowPlaying } from './NowPlaying'
import './netease.css'

export function NeteaseApp() {
  const { signedIn, signingIn, playing, tracks, playback, nowPlaying } = useNetease()

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

      <main className="netease-main">
        <h2 className="netease-section-title">热歌飙升榜</h2>
        <div className="netease-list">
          {tracks.length === 0 ? (
            <div className="netease-empty">正在加载网易云热歌榜...</div>
          ) : (
            tracks.map((track, idx) => (
              <div
                key={track.id}
                className="netease-item"
                onClick={() => play(track)}
                role="button"
                tabIndex={0}
              >
                <div className="netease-item-index">{idx + 1}</div>
                <div className="netease-item-thumb">
                  {track.artwork ? (
                    <img src={track.artwork} alt={track.title} />
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
            ))
          )}
        </div>
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
