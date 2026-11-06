import { useEffect } from 'react'
import {
  play,
  playOrPause,
  sendSignIn,
  sendSignOut,
  sendStart,
  setNowPlaying,
  skip,
  toggleLike,
  useDouyin,
} from './douyin'
import { NowPlaying } from './NowPlaying'
import './douyin.css'

export function DouyinApp() {
  const {
    signedIn,
    signingIn,
    playing,
    videos,
    currentVideoIndex,
    playback,
    nowPlaying,
    liked,
  } = useDouyin()

  useEffect(() => {
    sendStart()
  }, [])

  if (nowPlaying && playback) {
    return (
      <section className="app-panel douyin-app">
        <NowPlaying />
      </section>
    )
  }

  const activeVideo = videos[currentVideoIndex] ?? videos[0]

  return (
    <section className="app-panel douyin-app" aria-label="抖音">
      <header className="douyin-header">
        <div className="douyin-logo">
          <span className="douyin-badge">抖音</span>
          <h1 className="douyin-title">抖音短视频</h1>
        </div>

        <div className="douyin-account">
          {signingIn ? (
            <div className="douyin-status-signing-in">
              <span className="douyin-spinner" />
              <span>请在电脑桌面上扫码登录...</span>
            </div>
          ) : signedIn ? (
            <div className="douyin-signed-in">
              <span className="douyin-tag">已登录</span>
              <button type="button" className="douyin-action-btn" onClick={sendSignOut}>
                退出
              </button>
            </div>
          ) : (
            <button type="button" className="douyin-sign-in-btn" onClick={sendSignIn}>
              桌面扫码登录
            </button>
          )}
        </div>
      </header>

      {signingIn && (
        <div className="douyin-qr-banner">
          <div className="douyin-qr-banner-icon">📱</div>
          <div className="douyin-qr-banner-text">
            <strong>桌面扫码登录窗口已打开</strong>
            <p>请查看您的电脑屏幕，使用抖音移动客户端扫描二维码即可登录，登录后自动同步推荐与关注。</p>
          </div>
        </div>
      )}

      <main className="douyin-main">
        {activeVideo && (
          <div className="douyin-stage">
            <div className="douyin-card-hero">
              <div className="douyin-video-canvas">
                <div className="douyin-video-fallback">
                  <div className="douyin-brand-symbol">♪</div>
                  <div className="douyin-playing-indicator">
                    {playing && playback?.id === activeVideo.id ? '播放中' : '点击播放'}
                  </div>
                </div>
              </div>

              {/* Douyin overlay info */}
              <div className="douyin-overlay-bottom">
                <div className="douyin-author-row">
                  <span className="douyin-author-avatar">👤</span>
                  <span className="douyin-author-name">@{activeVideo.author}</span>
                </div>
                <p className="douyin-video-desc">{activeVideo.title}</p>
                {activeVideo.music && (
                  <div className="douyin-music-pill">
                    <span className="douyin-disc-icon">💿</span>
                    <span className="douyin-music-name">{activeVideo.music}</span>
                  </div>
                )}
              </div>

              {/* Douyin vertical action rail */}
              <div className="douyin-rail">
                <button
                  type="button"
                  className={`douyin-rail-btn ${liked[activeVideo.id] ? 'liked' : ''}`}
                  onClick={() => toggleLike(activeVideo.id)}
                  aria-label="Like"
                >
                  <span className="douyin-rail-icon">{liked[activeVideo.id] ? '❤️' : '🤍'}</span>
                  <span className="douyin-rail-label">
                    {activeVideo.likes
                      ? `${Math.round((activeVideo.likes + (liked[activeVideo.id] ? 1 : 0)) / 1000)}k`
                      : '赞'}
                  </span>
                </button>

                <button
                  type="button"
                  className="douyin-rail-btn"
                  onClick={() => play(activeVideo, currentVideoIndex)}
                  aria-label="Play"
                >
                  <span className="douyin-rail-icon">
                    {playing && playback?.id === activeVideo.id ? '⏸' : '▶'}
                  </span>
                  <span className="douyin-rail-label">播放</span>
                </button>

                <button
                  type="button"
                  className="douyin-rail-btn"
                  onClick={() => skip(1)}
                  aria-label="Next"
                >
                  <span className="douyin-rail-icon">⬇</span>
                  <span className="douyin-rail-label">下一个</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="douyin-feed-column">
          <h2 className="douyin-section-title">推荐视频流</h2>
          <div className="douyin-feed-list">
            {videos.length === 0 ? (
              <div className="douyin-empty">正在加载抖音短视频推荐...</div>
            ) : (
              videos.map((video, idx) => (
                <div
                  key={video.id}
                  className={`douyin-feed-item ${idx === currentVideoIndex ? 'active' : ''}`}
                  onClick={() => play(video, idx)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="douyin-feed-thumb">
                    <span className="douyin-feed-idx">#{idx + 1}</span>
                  </div>
                  <div className="douyin-feed-meta">
                    <div className="douyin-feed-title">{video.title}</div>
                    <div className="douyin-feed-author">@{video.author}</div>
                  </div>
                  <div className="douyin-feed-action">
                    {playing && playback?.id === video.id ? '▶ 播中' : '▶'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {playback && (
        <footer className="douyin-mini-bar" onClick={() => setNowPlaying(true)}>
          <div className="douyin-mini-info">
            <span className="douyin-mini-icon">🎵</span>
            <div className="douyin-mini-meta">
              <span className="douyin-mini-title">{playback.title}</span>
              <span className="douyin-mini-artist">@{playback.author}</span>
            </div>
          </div>
          <div className="douyin-mini-controls" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="douyin-mini-btn"
              onClick={playOrPause}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '⏸' : '▶'}
            </button>
            <button
              type="button"
              className="douyin-mini-btn"
              onClick={() => skip(1)}
              aria-label="Next"
            >
              ⏭
            </button>
          </div>
        </footer>
      )}
    </section>
  )
}
