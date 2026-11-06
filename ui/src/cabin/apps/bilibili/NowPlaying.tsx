import { useEffect, useState } from 'react'
import { VideoHole } from '../youtube/VideoHole'
import { playOrPause, positionOf, seek, setNowPlaying, skip, useBilibili } from './bilibili'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function NowPlaying() {
  const playback = useBilibili((s) => s.playback)
  const playing = useBilibili((s) => s.playing)
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
    <div className="bili-now-playing">
      <div className="bili-np-header">
        <button type="button" className="bili-back-btn" onClick={() => setNowPlaying(false)} aria-label="Back">
          ‹ 返回
        </button>
        <span className="bili-np-brand">哔哩哔哩 播放中</span>
      </div>

      <div className="bili-np-content">
        <div className="bili-np-artwork">
          <VideoHole app="bilibili" className="bili-np-video-hole" crop />
        </div>

        <div className="bili-np-meta">
          <h2 className="bili-np-title">{playback.title}</h2>
          <p className="bili-np-author">{playback.artist}</p>
        </div>

        <div className="bili-np-progress-bar">
          <div
            className="bili-np-track"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              seek(pct * duration)
            }}
          >
            <div className="bili-np-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="bili-np-times">
            <span>{formatSeconds(pos)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>

        <div className="bili-np-controls">
          <button type="button" className="bili-ctrl-btn" onClick={() => skip(-1)} aria-label="Previous">
            ⏮
          </button>
          <button
            type="button"
            className="bili-ctrl-btn bili-play-btn"
            onClick={playOrPause}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button type="button" className="bili-ctrl-btn" onClick={() => skip(1)} aria-label="Next">
            ⏭
          </button>
        </div>
      </div>
    </div>
  )
}
