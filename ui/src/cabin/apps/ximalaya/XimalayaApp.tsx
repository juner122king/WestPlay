import { useEffect } from 'react'
import { play, playOrPause, sendSignIn, sendSignOut, sendStart, setNowPlaying, useXimalaya } from './ximalaya'
import { NowPlaying } from './NowPlaying'
import './ximalaya.css'

export function XimalayaApp() {
  const { signedIn, signingIn, playing, tracks, playback, nowPlaying } = useXimalaya()

  useEffect(() => {
    sendStart()
  }, [])

  if (nowPlaying && playback) {
    return (
      <section className="app-panel ximalaya-app">
        <NowPlaying />
      </section>
    )
  }

  return (
    <section className="app-panel ximalaya-app" aria-label="喜马拉雅">
      <header className="xima-header">
        <div className="xima-logo">
          <span className="xima-badge">FM</span>
          <h1 className="xima-title">喜马拉雅</h1>
        </div>

        <div className="xima-account">
          {signingIn ? (
            <div className="xima-status-signing-in">
              <span className="xima-spinner" />
              <span>请在电脑桌面上扫码登录...</span>
            </div>
          ) : signedIn ? (
            <div className="xima-signed-in">
              <span className="xima-vip-tag">已登录</span>
              <button type="button" className="xima-action-btn" onClick={sendSignOut}>
                退出
              </button>
            </div>
          ) : (
            <button type="button" className="xima-sign-in-btn" onClick={sendSignIn}>
              桌面扫码登录
            </button>
          )}
        </div>
      </header>

      {signingIn && (
        <div className="xima-qr-banner">
          <div className="xima-qr-banner-icon">📱</div>
          <div className="xima-qr-banner-text">
            <strong>桌面扫码登录窗口已打开</strong>
            <p>请查看您的电脑屏幕，使用喜马拉雅移动客户端扫描二维码即可登录，畅听VIP有声书。</p>
          </div>
        </div>
      )}

      <main className="xima-main">
        <h2 className="xima-section-title">精选声音节目</h2>
        <div className="xima-list">
          {tracks.length === 0 ? (
            <div className="xima-empty">正在加载喜马拉雅声音节目...</div>
          ) : (
            tracks.map((track) => (
              <div key={track.id} className="xima-item" onClick={() => play(track)} role="button" tabIndex={0}>
                <div className="xima-item-thumb">
                  {track.artwork ? (
                    <img src={track.artwork} alt={track.title} referrerPolicy="no-referrer" />
                  ) : (
                    <div className="xima-thumb-fallback">🎙️</div>
                  )}
                </div>
                <div className="xima-item-body">
                  <div className="xima-item-title">{track.title}</div>
                  <div className="xima-item-sub">
                    <span>{track.artist}</span>
                    {track.album && <span> · {track.album}</span>}
                  </div>
                </div>
                <button type="button" className="xima-item-play-btn" aria-label="Play">
                  ▶
                </button>
              </div>
            ))
          )}
        </div>
      </main>

      {playback && (
        <div className="xima-mini-bar" onClick={() => setNowPlaying(true)}>
          <div className="xima-mini-info">
            <span className="xima-mini-title">{playback.title}</span>
            <span className="xima-mini-author">{playback.artist}</span>
          </div>
          <div className="xima-mini-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="xima-mini-btn"
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
