import { useEffect } from 'react'
import {
  play,
  playOrPause,
  sendSignIn,
  sendSignOut,
  sendStart,
  setNowPlaying,
  useBilibili,
} from './bilibili'
import { NowPlaying } from './NowPlaying'
import './bilibili.css'

export function BilibiliApp() {
  const { signedIn, signingIn, playing, videos, playback, nowPlaying } = useBilibili()

  useEffect(() => {
    sendStart()
  }, [])

  if (nowPlaying && playback) {
    return (
      <section className="app-panel bilibili-app">
        <NowPlaying />
      </section>
    )
  }

  return (
    <section className="app-panel bilibili-app" aria-label="哔哩哔哩">
      <header className="bili-header">
        <div className="bili-logo">
          <span className="bili-badge">Bilibili</span>
          <h1 className="bili-title">哔哩哔哩</h1>
        </div>

        <div className="bili-account">
          {signingIn ? (
            <div className="bili-status-signing-in">
              <span className="bili-spinner" />
              <span>请在电脑桌面上扫码登录...</span>
            </div>
          ) : signedIn ? (
            <div className="bili-signed-in">
              <span className="bili-vip-tag">已登录</span>
              <button type="button" className="bili-action-btn" onClick={sendSignOut}>
                退出
              </button>
            </div>
          ) : (
            <button type="button" className="bili-sign-in-btn" onClick={sendSignIn}>
              桌面扫码登录
            </button>
          )}
        </div>
      </header>

      {signingIn && (
        <div className="bili-qr-banner">
          <div className="bili-qr-banner-icon">📱</div>
          <div className="bili-qr-banner-text">
            <strong>桌面扫码登录窗口已打开</strong>
            <p>请查看您的电脑屏幕，使用哔哩哔哩移动客户端扫描二维码即可登录，登录后自动同步。</p>
          </div>
        </div>
      )}

      <main className="bili-main">
        <h2 className="bili-section-title">热门视频推荐</h2>
        <div className="bili-grid">
          {videos.length === 0 ? (
            <div className="bili-empty">正在加载哔哩哔哩热门视频...</div>
          ) : (
            videos.map((video) => (
              <div
                key={video.bvid}
                className="bili-card"
                onClick={() => play(video)}
                role="button"
                tabIndex={0}
              >
                <div className="bili-card-thumb">
                  {video.artwork ? (
                    <img src={video.artwork} alt={video.title} />
                  ) : (
                    <div className="bili-thumb-fallback">📺</div>
                  )}
                  <span className="bili-play-hint">▶</span>
                </div>
                <div className="bili-card-body">
                  <div className="bili-card-title">{video.title}</div>
                  <div className="bili-card-author">UP主: {video.author}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {playback && (
        <div className="bili-mini-bar" onClick={() => setNowPlaying(true)}>
          <div className="bili-mini-info">
            <span className="bili-mini-title">{playback.title}</span>
            <span className="bili-mini-author">{playback.artist}</span>
          </div>
          <div className="bili-mini-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="bili-mini-btn"
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
