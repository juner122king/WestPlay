import { useEffect, useState } from 'react'
import {
  playOrPause,
  positionOf,
  seek,
  setNowPlaying,
  skip,
  useXimalaya,
} from './ximalaya'

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export function NowPlaying() {
  const playback = useXimalaya((s) => s.playback)
  const playing = useXimalaya((s) => s.playing)
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
    <div className="xima-now-playing">
      <div className="xima-np-header">
        <button
          type="button"
          className="xima-back-btn"
          onClick={() => setNowPlaying(false)}
          aria-label="Back"
        >
          ‹ 返回
        </button>
        <span className="xima-np-brand">喜马拉雅 播放中</span>
      </div>

      <div className="xima-np-content">
        <div className="xima-np-artwork">
          {playback.artwork ? (
            <img src={playback.artwork} alt={playback.title} />
          ) : (
            <div className="xima-np-placeholder">🎙️</div>
          )}
        </div>

        <div className="xima-np-meta">
          <h2 className="xima-np-title">{playback.title}</h2>
          <p className="xima-np-author">{playback.artist}</p>
        </div>

        <div className="xima-np-progress-bar">
          <div className="xima-np-track" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            seek(pct * duration)
          }}>
            <div className="xima-np-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="xima-np-times">
            <span>{formatSeconds(pos)}</span>
            <span>{formatSeconds(duration)}</span>
          </div>
        </div>

        <div className="xima-np-controls">
          <button
            type="button"
            className="xima-ctrl-btn"
            onClick={() => skip(-1)}
            aria-label="Previous"
          >
            ⏮
          </button>
          <button
            type="button"
            className="xima-ctrl-btn xima-play-btn"
            onClick={playOrPause}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            className="xima-ctrl-btn"
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
