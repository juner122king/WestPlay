import { useEffect, useState } from 'react'
import { VideoHole } from '../youtube/VideoHole'
import { playOrPause, positionOf, seek, setNowPlaying, skip, toggleLike, useDouyin } from './douyin'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function NowPlaying() {
  const playback = useDouyin((s) => s.playback)
  const playing = useDouyin((s) => s.playing)
  const liked = useDouyin((s) => (playback?.id ? s.liked[playback.id] : false))
  const [pos, setPos] = useState(0)

  useEffect(() => {
    const update = () => {
      setPos(positionOf(playback, performance.now()))
    }
    update()
    const interval = setInterval(update, 250)
    return () => clearInterval(interval)
  }, [playback])

  if (!playback) return null

  const duration = playback.duration || 1
  const progressPercent = Math.min(100, Math.max(0, (pos / duration) * 100))

  return (
    <div className="douyin-now-playing">
      <div className="douyin-np-header">
        <button type="button" className="douyin-back-btn" onClick={() => setNowPlaying(false)} aria-label="Back">
          ‹ 返回
        </button>
        <span className="douyin-np-brand">抖音 · 正在播放</span>
      </div>

      <div className="douyin-np-content">
        <div className="douyin-np-artwork">
          <VideoHole app="douyin" className="douyin-np-video-hole" crop />
        </div>

        <div className="douyin-np-meta">
          <h2 className="douyin-np-title">{playback.title}</h2>
          <p className="douyin-np-author">@{playback.author}</p>
        </div>

        <div className="douyin-np-progress-bar">
          <div
            className="douyin-np-track"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              seek(pct * duration)
            }}
          >
            <div className="douyin-np-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="douyin-np-times">
            <span>{formatSeconds(pos)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>

        <div className="douyin-np-controls">
          <button type="button" className="douyin-ctrl-btn" onClick={() => skip(-1)} aria-label="Previous Video">
            ⏮
          </button>
          <button
            type="button"
            className="douyin-ctrl-btn douyin-play-btn"
            onClick={playOrPause}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button type="button" className="douyin-ctrl-btn" onClick={() => skip(1)} aria-label="Next Video">
            ⏭
          </button>
          <button
            type="button"
            className={`douyin-ctrl-btn douyin-like-btn ${liked ? 'liked' : ''}`}
            onClick={() => toggleLike()}
            aria-label="Like"
          >
            {liked ? '❤️' : '🤍'}
          </button>
        </div>
      </div>
    </div>
  )
}
