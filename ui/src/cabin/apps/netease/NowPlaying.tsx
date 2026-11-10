import { useEffect, useState, useRef } from 'react'
import {
  playOrPause,
  positionOf,
  seek,
  skip,
  toggleFullscreenPlayer,
  toggleLike,
  togglePlayMode,
  toggleQueue,
  useNetease,
} from './netease'
import { PlaybackNoticeBanner } from './PlaybackNoticeBanner'

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '00:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  const mm = m < 10 ? `0${m}` : `${m}`
  const ss = s < 10 ? `0${s}` : `${s}`
  return `${mm}:${ss}`
}

export function NowPlaying() {
  const playback = useNetease((s) => s.playback)
  const playing = useNetease((s) => s.playing)
  const playMode = useNetease((s) => s.playMode)
  const likedTrackIds = useNetease((s) => s.likedTrackIds)
  const queue = useNetease((s) => s.queue)
  const [pos, setPos] = useState(playback ? playback.position : 0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [scrubPos, setScrubPos] = useState(0)
  const progressBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isScrubbing) return
    const update = () => {
      if (!playback) return
      const current = positionOf(playback, performance.now())
      setPos(current)
      if (playback.status === 'playing' && playback.duration > 0 && current >= playback.duration - 0.5) {
        skip(1)
      }
    }
    update()
    const interval = setInterval(update, 250)
    return () => clearInterval(interval)
  }, [playback, isScrubbing])

  if (!playback) return null

  const duration = playback.duration || 215
  const displayPos = isScrubbing ? scrubPos : pos
  const progressPercent = Math.min(100, Math.max(0, (displayPos / duration) * 100))

  const activeTrack =
    queue.find((t) =>
      playback.trackId ? t.id === playback.trackId : t.title === playback.title && t.artist === playback.artist,
    ) || null
  const currentTrackId = activeTrack?.id || ''
  const isVipTrack = activeTrack?.fee === 1 || activeTrack?.fee === 4
  const isLiked = currentTrackId ? likedTrackIds.includes(currentTrackId) : false

  const handleSeekFromClientX = (clientX: number) => {
    if (!progressBarRef.current) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const targetSeconds = fraction * duration
    setScrubPos(targetSeconds)
    return targetSeconds
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsScrubbing(true)
    handleSeekFromClientX(e.clientX)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return
    handleSeekFromClientX(e.clientX)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return
    setIsScrubbing(false)
    const target = handleSeekFromClientX(e.clientX)
    if (target !== undefined) {
      seek(target)
    }
  }

  return (
    <div className="netease-immersive-player">
      {/* Top Bar with minimize chevron */}
      <header className="immersive-header">
        <button
          type="button"
          className="immersive-back-btn"
          onClick={() => toggleFullscreenPlayer(false)}
          aria-label="收起播放器"
        >
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="immersive-header-title">
          <span>车载云音乐 · 纯享模式</span>
        </div>

        <div className="immersive-header-placeholder" />
      </header>

      {/* Center Stage: Large Turntable */}
      <div className="immersive-stage">
        <div className={`immersive-assembly ${playing ? 'playing' : 'paused'}`}>
          <div className="immersive-vinyl-body">
            <div className="immersive-disc">
              <div className="immersive-disc-grooves" />
              <div className="immersive-disc-label">
                {playback.artwork ? (
                  <img
                    src={playback.artwork}
                    alt={playback.title}
                    className="immersive-art-img"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="immersive-art-fallback">🎵</div>
                )}
                <div className="immersive-spindle" />
              </div>
            </div>
          </div>

          {/* Tonearm */}
          <div className={`immersive-tonearm ${playing ? 'arm-playing' : 'arm-paused'}`}>
            <svg viewBox="0 0 100 180" className="immersive-tonearm-svg">
              <defs>
                <linearGradient id="arm-metal-imm" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#d1d5db" />
                  <stop offset="70%" stopColor="#9ca3af" />
                  <stop offset="100%" stopColor="#4b5563" />
                </linearGradient>
              </defs>
              <g filter="drop-shadow(2px 5px 6px rgba(0,0,0,0.5))">
                <circle cx="78" cy="24" r="16" fill="#18181b" stroke="#3f3f46" strokeWidth="2" />
                <circle cx="78" cy="24" r="9" fill="url(#arm-metal-imm)" />
                <path
                  d="M78 24 Q68 70 54 110 L44 140"
                  fill="none"
                  stroke="url(#arm-metal-imm)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <rect
                  x="36"
                  y="138"
                  width="14"
                  height="22"
                  rx="3"
                  transform="rotate(18 43 149)"
                  fill="#18181b"
                  stroke="#a1a1aa"
                  strokeWidth="1.5"
                />
                <circle cx="41" cy="155" r="2.5" fill="#ef4444" />
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* Playback Notice Banner (e.g. VIP required / skipped) */}
      <PlaybackNoticeBanner className="immersive-playback-notice" />

      {/* Metadata */}
      <div className="immersive-meta">
        <div className="immersive-meta-info">
          <div className="immersive-title-row">
            <h1 className="immersive-title">{playback.title}</h1>
            {isVipTrack && <span className="immersive-vip-badge">{activeTrack?.fee === 4 ? '付费' : 'VIP'}</span>}
          </div>
          <p className="immersive-artist">{playback.artist}</p>
        </div>

        <button
          type="button"
          className={`immersive-like-btn ${isLiked ? 'liked' : ''}`}
          onClick={() => {
            if (currentTrackId) toggleLike(currentTrackId)
          }}
          aria-label={isLiked ? '取消喜欢' : '加入我喜欢'}
        >
          {isLiked ? (
            <svg viewBox="0 0 24 24" width="32" height="32" fill="#ef4444">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Progress */}
      <div className="immersive-progress-wrap">
        <div
          ref={progressBarRef}
          className="immersive-progress-track"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={displayPos}
        >
          <div className="immersive-progress-fill" style={{ width: `${progressPercent}%` }}>
            <div className="immersive-knob" />
          </div>
        </div>
        <div className="immersive-times">
          <span>{formatTime(displayPos)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="immersive-controls">
        <button
          type="button"
          className="imm-ctrl-btn"
          onClick={togglePlayMode}
          title={playMode === 'loop' ? '列表循环' : playMode === 'shuffle' ? '随机播放' : '单曲循环'}
        >
          {playMode === 'loop' && (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {playMode === 'shuffle' && (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {playMode === 'single' && (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text x="12" y="15" fontSize="8" fontWeight="bold" fill="currentColor" textAnchor="middle">
                1
              </text>
            </svg>
          )}
        </button>

        <button type="button" className="imm-ctrl-btn" onClick={() => skip(-1)} aria-label="上一曲">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          type="button"
          className="imm-ctrl-btn imm-play-btn"
          onClick={playOrPause}
          aria-label={playing ? '暂停' : '播放'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="38" height="38" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="38" height="38" fill="currentColor" style={{ marginLeft: 3 }}>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button type="button" className="imm-ctrl-btn" onClick={() => skip(1)} aria-label="下一曲">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        <button type="button" className="imm-ctrl-btn" onClick={() => toggleQueue()} aria-label="播放队列">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
