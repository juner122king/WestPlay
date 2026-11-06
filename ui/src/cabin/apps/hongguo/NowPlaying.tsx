import { useEffect, useState } from 'react'
import { VideoHole } from '../youtube/VideoHole'
import { playOrPause, positionOf, seek, setNowPlaying, setSpeed, skip, useHongguo } from './hongguo'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function NowPlaying() {
  const playback = useHongguo((s) => s.playback)
  const playing = useHongguo((s) => s.playing)
  const speed = useHongguo((s) => s.speed)
  const autoNext = useHongguo((s) => s.autoNext)
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

  const SPEEDS = [1.0, 1.25, 1.5, 2.0]
  const nextSpeedIndex = (SPEEDS.indexOf(speed) + 1) % SPEEDS.length
  const nextSpeed = SPEEDS[nextSpeedIndex]

  return (
    <div className="hongguo-now-playing">
      <div className="hongguo-np-header">
        <button type="button" className="hongguo-back-btn" onClick={() => setNowPlaying(false)} aria-label="Back">
          ‹ 返回
        </button>
        <span className="hongguo-np-brand">红果短剧 · 剧场模式</span>
      </div>

      <div className="hongguo-np-content">
        <div className="hongguo-np-artwork">
          <VideoHole app="hongguo" className="hongguo-np-video-hole" crop />
        </div>

        <div className="hongguo-np-meta">
          <h2 className="hongguo-np-title">{playback.title}</h2>
          <div className="hongguo-np-tags">
            <span className="hongguo-np-tag">短剧</span>
            {playback.episode && <span className="hongguo-np-tag ep">第 {playback.episode} 集</span>}
            {autoNext && <span className="hongguo-np-tag auto">自动连播</span>}
          </div>
        </div>

        <div className="hongguo-np-progress-bar">
          <div
            className="hongguo-np-track"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              seek(pct * duration)
            }}
          >
            <div className="hongguo-np-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="hongguo-np-times">
            <span>{formatSeconds(pos)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>

        <div className="hongguo-np-controls">
          <button type="button" className="hongguo-ctrl-btn" onClick={() => skip(-1)} aria-label="Previous Episode">
            ⏮
          </button>
          <button
            type="button"
            className="hongguo-ctrl-btn hongguo-play-btn"
            onClick={playOrPause}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button type="button" className="hongguo-ctrl-btn" onClick={() => skip(1)} aria-label="Next Episode">
            ⏭
          </button>
          <button
            type="button"
            className="hongguo-ctrl-btn hongguo-speed-btn"
            onClick={() => setSpeed(nextSpeed)}
            aria-label="Speed"
          >
            {speed}x
          </button>
        </div>
      </div>
    </div>
  )
}
