import { useEffect, useState } from 'react'
import {
  playOrPause,
  positionOf,
  seek,
  setNowPlaying,
  skip,
  useNetease,
} from './netease'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function NowPlaying() {
  const playback = useNetease((s) => s.playback)
  const playing = useNetease((s) => s.playing)
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
    <div className="netease-now-playing">
      <div className="netease-np-header">
        <button
          type="button"
          className="netease-back-btn"
          onClick={() => setNowPlaying(false)}
          aria-label="Back"
        >
          ‹ 返回
        </button>
        <span className="netease-np-brand">网易云音乐 播放中</span>
      </div>

      <div className="netease-np-content">
        <div className={`netease-vinyl ${playing ? 'playing' : 'paused'}`}>
          <div className="netease-vinyl-disc">
            <div className="netease-vinyl-artwork">
              {playback.artwork ? (
                <img src={playback.artwork} alt={playback.title} />
              ) : (
                <div className="netease-np-placeholder">🎵</div>
              )}
            </div>
          </div>
        </div>

        <div className="netease-np-meta">
          <h2 className="netease-np-title">{playback.title}</h2>
          <p className="netease-np-author">{playback.artist}</p>
        </div>

        <div className="netease-np-progress-bar">
          <div className="netease-np-track" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            seek(pct * duration)
          }}>
            <div className="netease-np-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="netease-np-times">
            <span>{formatSeconds(pos)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>

        <div className="netease-np-controls">
          <button
            type="button"
            className="netease-ctrl-btn"
            onClick={() => skip(-1)}
            aria-label="Previous"
          >
            ⏮
          </button>
          <button
            type="button"
            className="netease-ctrl-btn netease-play-btn"
            onClick={playOrPause}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            className="netease-ctrl-btn"
            onClick={() => skip(1)}
            aria-label="Next"
          >
            ⏭
          </button>
        </div>
      </div>
    </div>
  )
}
