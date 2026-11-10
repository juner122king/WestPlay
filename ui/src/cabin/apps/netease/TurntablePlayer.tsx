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

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '00:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  const mm = m < 10 ? `0${m}` : `${m}`
  const ss = s < 10 ? `0${s}` : `${s}`
  return `${mm}:${ss}`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 11) return '早上好'
  if (hour >= 11 && hour < 14) return '中午好'
  if (hour >= 14 && hour < 19) return '下午好'
  return '晚上好'
}

interface TurntablePlayerProps {
  compact?: boolean
}

export function TurntablePlayer({ compact = false }: TurntablePlayerProps) {
  const playback = useNetease((s) => s.playback)
  const playing = useNetease((s) => s.playing)
  const playMode = useNetease((s) => s.playMode)
  const likedTrackIds = useNetease((s) => s.likedTrackIds)
  const queue = useNetease((s) => s.queue)
  const queueOpen = useNetease((s) => s.queueOpen)
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

      // Auto advance to next song when finished
      if (playback.status === 'playing' && playback.duration > 0 && current >= playback.duration - 0.5) {
        skip(1)
      }
    }
    update()
    const interval = setInterval(update, 250)
    return () => clearInterval(interval)
  }, [playback, isScrubbing])

  const duration = playback?.duration || 215
  const displayPos = isScrubbing ? scrubPos : pos
  const progressPercent = Math.min(100, Math.max(0, (displayPos / duration) * 100))

  const activeTrack =
    queue.find((t) =>
      playback?.trackId ? t.id === playback.trackId : t.title === playback?.title && t.artist === playback?.artist,
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
    <div className={`turntable-player ${compact ? 'turntable-compact' : ''}`}>
      {/* Top Header / Greeting */}
      <div className="turntable-header">
        <div className="turntable-brand">
          <div className="turntable-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" className="netease-icon-svg">
              <circle cx="12" cy="12" r="10" fill="#e60026" />
              <path
                d="M14.8 8.2c-.6-.7-1.4-1.1-2.3-1.1-1.8 0-3.3 1.5-3.3 3.3 0 1.2.6 2.2 1.6 2.8.2.1.4.3.4.5 0 .3-.2.5-.5.5-.1 0-.3 0-.4-.1-1.3-.8-2.1-2.2-2.1-3.7 0-2.4 1.9-4.3 4.3-4.3 1.2 0 2.3.5 3.1 1.4.2.2.2.5 0 .7-.2.2-.5.2-.7 0z"
                fill="#ffffff"
              />
              <circle cx="12" cy="11.5" r="1.5" fill="#ffffff" />
            </svg>
          </div>
          <span className="turntable-greeting">{getGreeting()}</span>
        </div>

        <button
          type="button"
          className="turntable-fullscreen-btn"
          onClick={() => toggleFullscreenPlayer()}
          title="纯享沉浸黑胶"
          aria-label="Toggle Fullscreen Player"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Vinyl Record & Tonearm Stage */}
      <div className="turntable-stage" onClick={() => toggleFullscreenPlayer()}>
        <div className={`turntable-assembly ${playing ? 'playing' : 'paused'}`}>
          {/* Vinyl Disc */}
          <div className="turntable-vinyl-body">
            <div className="turntable-disc">
              {/* Disc Grooves concentric sheen */}
              <div className="turntable-disc-grooves" />
              {/* Center Artwork Label */}
              <div className="turntable-disc-label">
                {playback?.artwork ? (
                  <img
                    src={playback.artwork}
                    alt={playback.title}
                    className="turntable-art-img"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="turntable-art-fallback">🎵</div>
                )}
                <div className="turntable-center-spindle" />
              </div>
            </div>
          </div>

          {/* Realistic Tonearm with Stylus */}
          <div className={`turntable-tonearm ${playing ? 'arm-playing' : 'arm-paused'}`}>
            <svg viewBox="0 0 100 180" className="tonearm-svg" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="tonearm-metal" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#d1d5db" />
                  <stop offset="70%" stopColor="#9ca3af" />
                  <stop offset="100%" stopColor="#4b5563" />
                </linearGradient>
                <filter id="arm-shadow" x="-20%" y="-20%" width="150%" height="150%">
                  <feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="rgba(0,0,0,0.4)" />
                </filter>
              </defs>
              <g filter="url(#arm-shadow)">
                {/* Pivot base (top-right pivot) */}
                <circle cx="78" cy="24" r="16" fill="#1f2937" stroke="#4b5563" strokeWidth="2.5" />
                <circle cx="78" cy="24" r="9" fill="url(#tonearm-metal)" />
                <circle cx="78" cy="24" r="3" fill="#111827" />

                {/* Curved Tonearm Rod */}
                <path
                  d="M78 24 Q68 70 54 110 L44 140"
                  fill="none"
                  stroke="url(#tonearm-metal)"
                  strokeWidth="4"
                  strokeLinecap="round"
                />

                {/* Cartridge and Stylus Head */}
                <rect
                  x="36"
                  y="138"
                  width="14"
                  height="22"
                  rx="3"
                  transform="rotate(18 43 149)"
                  fill="#1f2937"
                  stroke="#9ca3af"
                  strokeWidth="1.5"
                />
                <circle cx="41" cy="155" r="2.5" fill="#ef4444" />
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* Track Metadata (Title, VIP tag, Artist, Like) */}
      <div className="turntable-meta">
        <div className="turntable-meta-main">
          <div className="turntable-title-row">
            <h2 className="turntable-title" title={playback?.title || '未在播放'}>
              {playback?.title || '网易云音乐'}
            </h2>
            {isVipTrack && <span className="turntable-badge-vip">{activeTrack?.fee === 4 ? '付费' : 'VIP'}</span>}
          </div>
          <p className="turntable-artist" title={playback?.artist || '车载音乐'}>
            {playback?.artist || '车载云音乐电台'}
          </p>
        </div>

        <button
          type="button"
          className={`turntable-like-btn ${isLiked ? 'liked' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            if (currentTrackId) toggleLike(currentTrackId)
          }}
          aria-label={isLiked ? '取消喜欢' : '加入我喜欢'}
        >
          {isLiked ? (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#e60026">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Progress Bar & Timestamps */}
      <div className="turntable-progress-wrap">
        <div
          ref={progressBarRef}
          className="turntable-progress-track"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={displayPos}
        >
          <div className="turntable-progress-fill" style={{ width: `${progressPercent}%` }}>
            <div className="turntable-progress-knob" />
          </div>
        </div>
        <div className="turntable-times">
          <span className="time-curr">{formatTime(displayPos)}</span>
          <span className="time-total">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Media Controls Bar */}
      <div className="turntable-controls">
        {/* Play Mode Toggle */}
        <button
          type="button"
          className="ctrl-btn ctrl-mode"
          onClick={togglePlayMode}
          title={playMode === 'loop' ? '列表循环' : playMode === 'shuffle' ? '随机播放' : '单曲循环'}
          aria-label="切换播放模式"
        >
          {playMode === 'loop' && (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {playMode === 'shuffle' && (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {playMode === 'single' && (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
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

        {/* Previous */}
        <button type="button" className="ctrl-btn ctrl-prev" onClick={() => skip(-1)} aria-label="Previous Track">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        {/* Play/Pause Button */}
        <button
          type="button"
          className="ctrl-btn ctrl-play-main"
          onClick={playOrPause}
          aria-label={playing ? '暂停' : '播放'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" style={{ marginLeft: 2 }}>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Next */}
        <button type="button" className="ctrl-btn ctrl-next" onClick={() => skip(1)} aria-label="Next Track">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        {/* Queue Drawer Trigger */}
        <button
          type="button"
          className={`ctrl-btn ctrl-queue ${queueOpen ? 'active' : ''}`}
          onClick={() => toggleQueue()}
          aria-label="播放队列"
          title="播放队列"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {queue.length > 0 && <span className="queue-pill">{queue.length}</span>}
        </button>
      </div>
    </div>
  )
}
