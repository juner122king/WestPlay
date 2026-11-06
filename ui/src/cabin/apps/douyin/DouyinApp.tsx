import { useEffect } from 'react'
import { VideoHole } from '../youtube/VideoHole'
import { play, playOrPause, sendSignIn, sendSignOut, sendStart, skip, toggleLike, useDouyin } from './douyin'
import { NowPlaying } from './NowPlaying'
import './douyin.css'

export function DouyinApp() {
  const { signedIn, signingIn, playing, videos, currentVideoIndex, playback, nowPlaying, liked } = useDouyin()

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

  const activeVideo = videos[currentVideoIndex] ?? videos[0] ?? null
  const displayTitle = playback?.title || activeVideo?.title || '抖音精选短视频'
  const displayAuthor = playback?.author || playback?.artist || activeVideo?.author || '抖音创作者'
  const isLiked = playback?.id ? Boolean(liked[playback.id]) : Boolean(activeVideo?.id && liked[activeVideo.id])

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
        <div className="douyin-stage">
          <div className="douyin-card-hero">
            <div className="douyin-video-canvas">
              <VideoHole app="douyin" className="douyin-video-hole" crop />
            </div>

            {/* Douyin overlay info */}
            <div className="douyin-overlay-bottom">
              <div className="douyin-author-row">
                <span className="douyin-author-avatar">👤</span>
                <span className="douyin-author-name">@{displayAuthor}</span>
              </div>
              <p className="douyin-video-desc">{displayTitle}</p>
            </div>

            {/* Douyin vertical action rail */}
            <div className="douyin-rail">
              <button
                type="button"
                className={`douyin-rail-btn ${isLiked ? 'liked' : ''}`}
                onClick={() => toggleLike(playback?.id ?? activeVideo?.id)}
                aria-label="Like"
              >
                <span className="douyin-rail-icon">{isLiked ? '❤️' : '🤍'}</span>
                <span className="douyin-rail-label">赞</span>
              </button>

              <button type="button" className="douyin-rail-btn" onClick={playOrPause} aria-label="Play / Pause">
                <span className="douyin-rail-icon">{playing ? '⏸' : '▶'}</span>
                <span className="douyin-rail-label">{playing ? '暂停' : '播放'}</span>
              </button>

              <button type="button" className="douyin-rail-btn" onClick={() => skip(1)} aria-label="Next">
                <span className="douyin-rail-icon">⬇</span>
                <span className="douyin-rail-label">下一个</span>
              </button>

              <button type="button" className="douyin-rail-btn" onClick={() => skip(-1)} aria-label="Previous">
                <span className="douyin-rail-icon">⬆</span>
                <span className="douyin-rail-label">上一个</span>
              </button>
            </div>
          </div>
        </div>

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
                >
                  <div className="douyin-feed-thumb">
                    {video.artwork ? (
                      <img src={video.artwork} alt={video.title} referrerPolicy="no-referrer" />
                    ) : (
                      <div className="douyin-feed-thumb-fallback">♪</div>
                    )}
                    {idx === currentVideoIndex && playing && <div className="douyin-mini-playing-badge">播放中</div>}
                  </div>
                  <div className="douyin-feed-info">
                    <h3 className="douyin-feed-title">{video.title}</h3>
                    <p className="douyin-feed-author">@{video.author}</p>
                    <div className="douyin-feed-meta">
                      <span>❤️ {video.likes ? `${Math.round(video.likes / 1000)}k` : '热门'}</span>
                    </div>
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
