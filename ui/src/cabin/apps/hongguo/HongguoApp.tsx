import { useEffect } from 'react'
import { VideoHole } from '../youtube/VideoHole'
import {
  play,
  selectEpisode,
  sendSignIn,
  sendSignOut,
  sendStart,
  setAutoNext,
  setNowPlaying,
  setSpeed,
  useHongguo,
} from './hongguo'
import { NowPlaying } from './NowPlaying'
import './hongguo.css'

export function HongguoApp() {
  const {
    signedIn,
    signingIn,
    playing,
    dramas,
    currentDramaId,
    currentEpisodeNumber,
    speed,
    autoNext,
    playback,
    nowPlaying,
  } = useHongguo()

  useEffect(() => {
    sendStart()
  }, [])

  if (nowPlaying && playback) {
    return (
      <section className="app-panel hongguo-app">
        <NowPlaying />
      </section>
    )
  }

  const activeDrama = dramas.find((d) => d.id === currentDramaId) ?? dramas[0] ?? null
  const totalEps = activeDrama ? activeDrama.totalEpisodes || 80 : 80
  const episodes = Array.from({ length: Math.min(totalEps, 40) }, (_, i) => i + 1)

  const SPEEDS = [1.0, 1.25, 1.5, 2.0]
  const nextSpeedIndex = (SPEEDS.indexOf(speed) + 1) % SPEEDS.length
  const nextSpeed = SPEEDS[nextSpeedIndex]

  return (
    <section className="app-panel hongguo-app" aria-label="红果短剧">
      <header className="hongguo-header">
        <div className="hongguo-logo">
          <span className="hongguo-badge">红果</span>
          <h1 className="hongguo-title">红果短剧</h1>
        </div>

        <div className="hongguo-header-actions">
          <button
            type="button"
            className={`hongguo-chip-btn ${autoNext ? 'active' : ''}`}
            onClick={() => setAutoNext(!autoNext)}
            title="驾驶时自动播放下一集"
          >
            {autoNext ? '✓ 自动连播' : '连播: 关'}
          </button>
          <button type="button" className="hongguo-chip-btn" onClick={() => setSpeed(nextSpeed)}>
            {speed}x
          </button>

          <div className="hongguo-account">
            {signingIn ? (
              <div className="hongguo-status-signing-in">
                <span className="hongguo-spinner" />
                <span>请在电脑桌面上扫码登录...</span>
              </div>
            ) : signedIn ? (
              <div className="hongguo-signed-in">
                <span className="hongguo-tag">已登录</span>
                <button type="button" className="hongguo-action-btn" onClick={sendSignOut}>
                  退出
                </button>
              </div>
            ) : (
              <button type="button" className="hongguo-sign-in-btn" onClick={sendSignIn}>
                桌面扫码登录
              </button>
            )}
          </div>
        </div>
      </header>

      {signingIn && (
        <div className="hongguo-qr-banner">
          <div className="hongguo-qr-banner-icon">📱</div>
          <div className="hongguo-qr-banner-text">
            <strong>桌面扫码登录窗口已打开</strong>
            <p>请查看您的电脑屏幕，使用红果短剧移动客户端扫描二维码即可登录，登录后解锁全部剧集进度。</p>
          </div>
        </div>
      )}

      <main className="hongguo-main">
        {activeDrama && (
          <div className="hongguo-hero-panel">
            <div className="hongguo-video-canvas">
              <VideoHole app="hongguo" className="hongguo-video-hole" crop />
            </div>

            <div className="hongguo-hero-info">
              <div className="hongguo-hero-meta">
                <span className="hongguo-category">{activeDrama.category}</span>
                <span className="hongguo-total-eps">全 {activeDrama.totalEpisodes} 集</span>
              </div>
              <h2 className="hongguo-hero-title">{activeDrama.title}</h2>
              <p className="hongguo-hero-desc">{activeDrama.synopsis}</p>
              <div className="hongguo-hero-bar">
                <button
                  type="button"
                  className="hongguo-primary-play-btn"
                  onClick={() => play(activeDrama, currentEpisodeNumber)}
                >
                  {playing ? '⏸ 暂停' : '▶ 播放'}
                </button>
                <span className="hongguo-active-ep-label">当前集数: 第 {currentEpisodeNumber} 集</span>
                <button
                  type="button"
                  className="hongguo-action-btn"
                  onClick={() => setNowPlaying(true)}
                  style={{ marginLeft: 'auto' }}
                >
                  全屏播放 ›
                </button>
              </div>
            </div>

            <div className="hongguo-episodes-section">
              <h3 className="hongguo-sub-title">选集</h3>
              <div className="hongguo-episodes-grid">
                {episodes.map((ep) => (
                  <button
                    key={ep}
                    type="button"
                    className={`hongguo-ep-btn ${ep === currentEpisodeNumber ? 'selected' : ''} ${
                      playing && playback?.episode === ep ? 'playing' : ''
                    }`}
                    onClick={() => selectEpisode(ep)}
                  >
                    {ep}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="hongguo-catalog-column">
          <h2 className="hongguo-section-title">热播好剧</h2>
          <div className="hongguo-drama-list">
            {dramas.length === 0 ? (
              <div className="hongguo-empty">正在加载短剧剧场...</div>
            ) : (
              dramas.map((drama) => (
                <div
                  key={drama.id}
                  className={`hongguo-drama-card ${drama.id === currentDramaId ? 'active' : ''}`}
                  onClick={() => play(drama, 1)}
                >
                  <div className="hongguo-drama-cover">
                    {drama.cover ? (
                      <img src={drama.cover} alt={drama.title} referrerPolicy="no-referrer" />
                    ) : (
                      <div className="hongguo-cover-fallback">🎬</div>
                    )}
                    <span className="hongguo-card-tag">{drama.category || '热剧'}</span>
                  </div>
                  <div className="hongguo-drama-meta">
                    <h3 className="hongguo-drama-title">{drama.title}</h3>
                    <p className="hongguo-drama-episodes">全 {drama.totalEpisodes} 集</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </section>
  )
}
