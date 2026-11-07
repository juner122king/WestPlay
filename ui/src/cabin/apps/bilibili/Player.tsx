import { useEffect, useRef, useState } from 'react'
import { useCabin } from '../../state/store'
import {
  BackGlyph,
  CheckGlyph,
  CloseGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  QueueGlyph,
  ReplayGlyph,
  SettingsGlyph,
  VolumeGlyph,
} from '../youtube/glyphs'
import {
  ask,
  closePlayer,
  followArea,
  leavePlayer,
  openChannel,
  play,
  playOrPause,
  positionNow,
  positionOf,
  replay,
  seek,
  seekBy,
  send,
  sendVolume,
  setQuality,
  setRate,
  skip,
  toggleDanmaku,
  toggleMute,
  useBilibili,
} from './bilibili'
import './bilibili.css'

const CONTROLS_MS = 3000
const DOUBLE_TAP_MS = 300
const SKIP_MS = 800
const SKIP_SECONDS = 10

type Side = 'back' | 'forward'

export function BilibiliPlayer() {
  const open = useBilibili((store) => store.open)
  const app = useCabin((state) => state.navigation.route)
  const handedOver = useCabin((state) => state.truckScreen)

  useEffect(() => {
    if (open && (handedOver || app.kind !== 'app' || app.app !== 'bilibili')) {
      leavePlayer()
    }
  }, [open, app, handedOver])

  return open ? <OpenPlayer /> : null
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

export function DanmakuGlyph({ on }: { on?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor">
      <rect x="3" y="4.5" width="18" height="13" rx="3" strokeWidth="2" fill={on ? 'currentColor' : 'none'} />
      <path
        d="M7 8.5h5M7 12.5h10M14 8.5h3"
        stroke={on ? '#000' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function OpenPlayer() {
  const current = useBilibili((store) => store.current)
  const playback = useBilibili((store) => store.playback)
  const playing = useBilibili((store) => store.playing)
  const queue = useBilibili((store) => store.queue)
  const related = useBilibili((store) => store.related)
  const danmaku = useBilibili((store) => store.danmaku)
  const currentQuality = useBilibili((store) => store.quality)
  const currentRate = useBilibili((store) => store.rate)

  const [controls, setControls] = useState(true)
  const [showDrawer, setShowDrawer] = useState(false)
  const [menu, setMenu] = useState<'settings' | null>(null)
  const [dismissEndedOverlay, setDismissEndedOverlay] = useState(false)
  const touched = useRef(0)

  const isLive = Boolean(current?.isLive || playback?.isLive || playback?.bvid?.startsWith('live:'))
  const isPlaybackPlaying = Boolean(
    playing ||
    playback?.status === 'playing' ||
    (isLive && playback?.status !== 'paused')
  )

  const ended =
    !isLive &&
    (playback?.status === 'ended' ||
      Boolean(playback && playback.duration > 3 && positionNow() >= playback.duration - 0.5))

  useEffect(() => {
    setDismissEndedOverlay(false)
  }, [current?.bvid, queue?.page])

  useEffect(() => {
    if (ended && (!related || related.length === 0) && (current?.bvid || playback?.bvid)) {
      const bvid = current?.bvid || playback?.bvid
      if (bvid) {
        ask({ ask: 'related', bvid }).then((ans) => {
          if (ans.videos) useBilibili.setState({ related: ans.videos })
        })
      }
    }
  }, [ended, related, current?.bvid, playback?.bvid])

  const lastTap = useRef<{ at: number; side: Side | null; single?: ReturnType<typeof setTimeout> }>({
    at: -Infinity,
    side: null,
  })
  const [skipInd, setSkipInd] = useState<{ side: Side; seconds: number; at: number } | null>(null)

  useEffect(() => {
    if (!skipInd) return
    const timer = setTimeout(() => setSkipInd(null), SKIP_MS)
    return () => clearTimeout(timer)
  }, [skipInd])

  useEffect(() => () => clearTimeout(lastTap.current.single), [])

  const touch = () => {
    touched.current = performance.now()
    setControls(true)
  }

  useEffect(() => {
    if (!controls || !isPlaybackPlaying || showDrawer || menu || ended) return
    const timer = setTimeout(() => setControls(false), CONTROLS_MS)
    return () => clearTimeout(timer)
  }, [controls, isPlaybackPlaying, showDrawer, menu, ended])

  // Place the video over the CarPlay area in frame pixels; update if resized
  useEffect(() => {
    const place = () => {
      const area = document.querySelector('.carplay')?.getBoundingClientRect()
      if (!area) return
      const scale = window.devicePixelRatio
      send({
        action: 'show',
        x: Math.round(area.left * scale),
        y: Math.round(area.top * scale),
        width: Math.round(area.width * scale),
        height: Math.round(area.height * scale),
        crop: false,
      })
    }
    return followArea(place)
  }, [])

  if (!current && !playback) return null

  const isGenericTitle = (t?: string) => !t || t === '正在直播' || t === '哔哩哔哩直播' || t === '哔哩哔哩视频'
  const isGenericAuthor = (a?: string) => !a || a === '主播' || a === 'UP主'

  const videoTitle =
    (!isGenericTitle(current?.title) ? current?.title : null) ||
    (!isGenericTitle(playback?.title) ? playback?.title : null) ||
    current?.title || playback?.title || (isLive ? '哔哩哔哩直播' : '哔哩哔哩视频')

  const authorName =
    (!isGenericAuthor(current?.author) ? current?.author : null) ||
    (!isGenericAuthor(playback?.artist) ? playback?.artist : null) ||
    current?.author || playback?.artist || (isLive ? '主播' : 'UP主')

  const mid = current?.mid || playback?.mid
  const roomId = current?.roomId || playback?.roomId

  return (
    <div
      className={`bili-player${controls ? ' controls' : ''}`}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (menu) {
          setMenu(null)
          touch()
          return
        }
        if (ended && dismissEndedOverlay) {
          setDismissEndedOverlay(false)
          touch()
          return
        }

        const toggle = () => {
          if (controls && isPlaybackPlaying && performance.now() - touched.current > 300) setControls(false)
          else touch()
        }

        const box = event.currentTarget.getBoundingClientRect()
        const across = (event.clientX - box.left) / box.width
        const side: Side | null = across < 1 / 3 ? 'back' : across > 2 / 3 ? 'forward' : null
        const now = performance.now()
        const last = lastTap.current
        const skipping = side !== null && skipInd?.side === side && now - skipInd.at < SKIP_MS

        if (!isLive && side && (skipping || (last.side === side && now - last.at < DOUBLE_TAP_MS))) {
          clearTimeout(last.single)
          lastTap.current = { at: -Infinity, side: null }
          seekBy(side === 'back' ? -SKIP_SECONDS : SKIP_SECONDS)
          setSkipInd({ side, seconds: (skipping ? skipInd.seconds : 0) + SKIP_SECONDS, at: now })
          return
        }

        clearTimeout(last.single)
        lastTap.current = { at: now, side, single: side ? setTimeout(toggle, DOUBLE_TAP_MS) : undefined }
        if (!side) toggle()
      }}
      onPointerMove={() => controls && touch()}
    >
      {skipInd && (
        <div key={skipInd.at} className={`bili-skip ${skipInd.side}`} aria-live="polite">
          <span className="bili-skip-arrows">{skipInd.side === 'back' ? '◀◀' : '▶▶'}</span>
          <span>{skipInd.seconds} 秒</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div className={`bili-player-top${isLive ? ' live' : ''}`}>
        <button type="button" className="bili-glass bili-round big" aria-label="返回" onClick={closePlayer}>
          <BackGlyph />
        </button>

        {isLive ? (
          <div className="bili-player-title live">
            <div className="bili-live-title-row">
              <span className="bili-live-player-badge">
                <span className="bili-live-pulse-dot" />
                <span className="bili-live-badge-label">LIVE 直播</span>
              </span>
              {roomId ? (
                <span className="bili-live-room-pill">
                  <span className="bili-live-room-lbl">房间</span>
                  <span className="bili-live-room-num">{roomId}</span>
                </span>
              ) : null}
              <span className="bili-player-title-text live">{videoTitle}</span>
            </div>

            <div className="bili-live-meta-row">
              {mid ? (
                <button
                  type="button"
                  className="bili-live-anchor-btn"
                  onClick={() => {
                    closePlayer()
                    openChannel({ mid, name: authorName })
                  }}
                >
                  <span className="bili-live-anchor-icon">🎙️</span>
                  <span className="bili-live-anchor-label">主播:</span>
                  <span className="bili-live-anchor-name">{authorName}</span>
                  <span className="bili-live-anchor-arrow">›</span>
                </button>
              ) : (
                <span className="bili-live-anchor-tag">
                  <span className="bili-live-anchor-icon">🎙️</span>
                  <span className="bili-live-anchor-label">主播:</span>
                  <span className="bili-live-anchor-name">{authorName}</span>
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="bili-player-title">
            <span className="bili-player-title-text">{videoTitle}</span>
            {mid ? (
              <button
                type="button"
                className="bili-player-author-btn"
                onClick={() => {
                  closePlayer()
                  openChannel({ mid, name: authorName })
                }}
              >
                UP主: {authorName}
              </button>
            ) : (
              <span className="bili-player-author-text">UP主: {authorName}</span>
            )}
          </div>
        )}

        {ended && dismissEndedOverlay && (
          <button
            type="button"
            className="bili-glass bili-pill bili-ended-pill-btn"
            onClick={() => setDismissEndedOverlay(false)}
          >
            <ReplayGlyph />
            <span>相关推荐 / 重播</span>
          </button>
        )}
      </div>

      {/* Ended Overlay: 播放结束重播与相关视频推荐 */}
      {ended && !dismissEndedOverlay && !showDrawer && (
        <div className="bili-ended-overlay">
          <div className="bili-ended-card">
            <div className="bili-ended-top-row">
              <div className="bili-ended-status">
                <span className="bili-ended-status-dot" />
                <span className="bili-ended-status-text">播放已结束</span>
              </div>
              <div className="bili-ended-actions">
                <button
                  type="button"
                  className="bili-btn-replay-primary"
                  onClick={() => replay()}
                >
                  <ReplayGlyph />
                  <span>重新播放</span>
                </button>

                {queue && queue.page < queue.pages.length && (
                  <button
                    type="button"
                    className="bili-btn-next-part"
                    onClick={() => play(undefined, true, queue.page + 1)}
                  >
                    <NextGlyph />
                    <span>播放下集 P{queue.page + 1}</span>
                  </button>
                )}

                {queue && queue.pages.length > 1 && (
                  <button
                    type="button"
                    className="bili-btn-parts"
                    onClick={() => setShowDrawer(true)}
                  >
                    <QueueGlyph />
                    <span>分P选集</span>
                  </button>
                )}

                <button
                  type="button"
                  className="bili-btn-dismiss"
                  aria-label="收起推荐"
                  onClick={() => setDismissEndedOverlay(true)}
                >
                  <CloseGlyph />
                </button>
              </div>
            </div>

            <div className="bili-ended-shelf-section">
              <div className="bili-ended-shelf-header">
                <span className="bili-ended-shelf-title">相关视频推荐</span>
                <span className="bili-ended-shelf-sub">点击卡片即可直接播放</span>
              </div>

              <div className="bili-ended-shelf">
                {related && related.length > 0 ? (
                  related.map((v) => (
                    <div
                      key={v.bvid}
                      className="bili-ended-video-card"
                      onClick={() => play(v, true)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="bili-ended-thumb">
                        {v.artwork ? (
                          <img src={v.artwork} alt="" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="bili-thumb-blank" />
                        )}
                        {v.duration ? (
                          <span className="bili-badge">{formatClock(v.duration)}</span>
                        ) : null}
                      </div>
                      <div className="bili-ended-video-info">
                        <span className="bili-title">{v.title}</span>
                        <span className="bili-sub">
                          {v.author}
                          {v.playCount ? ` · ▶ ${v.playCount}` : ''}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bili-ended-loading">
                    <span className="bili-note">正在获取推荐视频...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drawer: 分P选集 / 相关推荐 */}
      {showDrawer ? (
        <div className="bili-drawer">
          <div className="bili-drawer-header">
            <h3>{queue && queue.pages.length > 1 ? '分P选集与推荐' : '相关推荐'}</h3>
            <button type="button" className="bili-glass bili-round" onClick={() => setShowDrawer(false)}>
              <CloseGlyph />
            </button>
          </div>

          <div className="bili-drawer-body">
            {queue && queue.pages.length > 1 && (
              <section className="bili-drawer-section">
                <h4>选集 ({queue.pages.length}P)</h4>
                <div className="bili-pages-grid">
                  {queue.pages.map((p) => (
                    <button
                      key={p.page}
                      type="button"
                      className={`bili-page-chip${queue.page === p.page ? ' active' : ''}`}
                      onClick={() => {
                        play(undefined, true, p.page)
                        setShowDrawer(false)
                      }}
                    >
                      <span className="bili-page-num">P{p.page}</span>
                      <span className="bili-page-name">{p.part}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {related && related.length > 0 && (
              <section className="bili-drawer-section">
                <h4>相关推荐</h4>
                <div className="bili-related-list">
                  {related.map((v) => (
                    <div
                      key={v.bvid}
                      className="bili-related-card"
                      onClick={() => {
                        play(v, true)
                        setShowDrawer(false)
                      }}
                    >
                      <div className="bili-related-thumb">
                        {v.artwork ? <img src={v.artwork} alt="" /> : <span className="bili-thumb-blank" />}
                        {v.duration && <span className="bili-badge">{formatClock(v.duration)}</span>}
                      </div>
                      <div className="bili-related-info">
                        <span className="bili-title">{v.title}</span>
                        <span className="bili-sub">{v.author}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      ) : (
        /* Bottom Controls Bar */
        <div className="bili-player-bottom">
          {!isLive && <ProgressBar />}
          <div className="bili-controls">
            {!isLive && (
              <button
                type="button"
                className="bili-glass bili-pill"
                aria-label="上一集/快退"
                onClick={() => {
                  touch()
                  skip(-1)
                }}
              >
                <PreviousGlyph />
              </button>
            )}

            <button
              type="button"
              className="bili-glass bili-round big play"
              aria-label={ended ? '重播' : isPlaybackPlaying ? '暂停' : '播放'}
              onClick={() => {
                touch()
                if (ended) {
                  replay()
                } else {
                  playOrPause()
                }
              }}
            >
              {ended ? <ReplayGlyph /> : isPlaybackPlaying ? <PauseGlyph /> : <PlayGlyph />}
            </button>

            {isLive && (
              <button
                type="button"
                className="bili-glass bili-pill bili-live-refresh-btn"
                aria-label="刷新线路"
                onClick={() => {
                  touch()
                  if (current) {
                    play(current, true)
                  } else {
                    send({ action: 'seek', seconds: 0 })
                  }
                }}
              >
                <ReplayGlyph />
                <span className="bili-pill-text">刷新线路</span>
              </button>
            )}

            {!isLive && (
              <button
                type="button"
                className="bili-glass bili-pill"
                aria-label="下一集/快进"
                onClick={() => {
                  touch()
                  skip(1)
                }}
              >
                <NextGlyph />
              </button>
            )}

            <VolumeControl onTouch={touch} />

            {!isLive && (
              <div className="bili-glass bili-pill bili-time">
                <TimeDisplay />
              </div>
            )}

            <span className="bili-spacer" />

            {/* Danmaku Toggle */}
            <button
              type="button"
              className={`bili-glass bili-pill bili-danmaku-btn${danmaku ? ' on' : ''}`}
              aria-label="弹幕开关"
              onClick={() => {
                touch()
                toggleDanmaku()
              }}
            >
              <DanmakuGlyph on={danmaku} />
              <span className="bili-pill-text">{danmaku ? '弹幕开' : '弹幕关'}</span>
            </button>

            {/* Settings (Quality & Speed) */}
            <button
              type="button"
              className={`bili-glass bili-pill${menu === 'settings' ? ' on' : ''}`}
              aria-label={isLive ? '直播画质' : '画质与倍速'}
              onClick={() => {
                touch()
                setMenu(menu === 'settings' ? null : 'settings')
              }}
            >
              <SettingsGlyph />
              <span className="bili-quality-tag">{qualityLabel(currentQuality, isLive)}</span>
            </button>

            {/* Drawer / 选集 Button (VOD only) */}
            {!isLive && (
              <button
                type="button"
                className="bili-glass bili-pill"
                aria-label="选集与推荐"
                onClick={() => {
                  touch()
                  setMenu(null)
                  setShowDrawer(true)
                }}
              >
                <QueueGlyph />
                {queue && queue.pages.length > 1 && <span className="bili-pill-badge">{queue.pages.length}P</span>}
              </button>
            )}
          </div>

          {menu === 'settings' && (
            <SettingsMenu
              currentQuality={currentQuality}
              currentRate={currentRate}
              isLive={isLive}
              onClose={() => setMenu(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function qualityLabel(q: number, isLive = false): string {
  if (isLive) {
    if (q >= 10000) return '原画'
    if (q >= 400) return '蓝光'
    if (q >= 250 || q === 80) return '超清'
    if (q >= 150 || q === 64) return '高清'
    return '流畅'
  }
  if (q >= 120) return '4K'
  if (q >= 116) return '1080P60'
  if (q >= 80) return '1080P'
  if (q >= 64) return '720P'
  if (q >= 32) return '480P'
  return '360P'
}

function SettingsMenu({
  currentQuality,
  currentRate,
  isLive,
  onClose,
}: {
  currentQuality: number
  currentRate: number
  isLive?: boolean
  onClose: () => void
}) {
  const qualities = isLive
    ? [
        { quality: 10000, label: '原画 (超高清)' },
        { quality: 400, label: '蓝光 (高码率)' },
        { quality: 250, label: '超清 1080P' },
        { quality: 150, label: '高清 720P (推荐)' },
        { quality: 80, label: '流畅 480P' },
      ]
    : [
        { quality: 116, label: '1080P 60帧' },
        { quality: 80, label: '1080P 高清' },
        { quality: 64, label: '720P 高清 (推荐)' },
        { quality: 32, label: '480P 清晰' },
        { quality: 16, label: '360P 流畅' },
      ]
  const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

  return (
    <div className={`bili-menu${isLive ? ' live' : ''}`} role="menu">
      <div className="bili-menu-section">
        <span className="bili-menu-title">{isLive ? '直播画质' : '播放画质'}</span>
        <div className="bili-menu-items">
          {qualities.map((item) => (
            <button
              key={item.quality}
              type="button"
              className={currentQuality === item.quality ? 'bili-menu-item on' : 'bili-menu-item'}
              onClick={() => {
                setQuality(item.quality)
                onClose()
              }}
            >
              {currentQuality === item.quality && <CheckGlyph />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {!isLive && (
        <div className="bili-menu-section">
          <span className="bili-menu-title">播放倍速</span>
          <div className="bili-menu-items grid">
            {rates.map((r) => (
              <button
                key={r}
                type="button"
                className={currentRate === r ? 'bili-menu-item on' : 'bili-menu-item'}
                onClick={() => {
                  setRate(r)
                  onClose()
                }}
              >
                {currentRate === r && <CheckGlyph />}
                <span>{r === 1.0 ? '正常' : `${r}x`}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressBar() {
  const current = useBilibili((s) => s.current)
  const playback = useBilibili((s) => s.playback)
  const playing = useBilibili((s) => s.playing)
  const isLive = Boolean(current?.isLive || playback?.isLive || playback?.bvid?.startsWith('live:'))
  const [pos, setPos] = useState(0)

  useEffect(() => {
    if (isLive) return
    const update = () => {
      setPos(positionOf(playback, performance.now()))
    }
    update()
    if (!playing) return
    const id = setInterval(update, 250)
    return () => clearInterval(id)
  }, [playback, playing, isLive])

  if (isLive) return null

  const duration = playback?.duration || 1
  const pct = Math.min(100, Math.max(0, (pos / duration) * 100))

  return (
    <div
      className="bili-bar"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const clickPct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        seek(clickPct * duration)
      }}
    >
      <span className="bili-bar-played" style={{ width: `${pct}%` }} />
      <span className="bili-bar-dot" style={{ left: `${pct}%` }} />
    </div>
  )
}

function TimeDisplay() {
  const current = useBilibili((s) => s.current)
  const playback = useBilibili((s) => s.playback)
  const playing = useBilibili((s) => s.playing)
  const isLive = Boolean(current?.isLive || playback?.isLive || playback?.bvid?.startsWith('live:'))
  const [pos, setPos] = useState(0)

  useEffect(() => {
    if (isLive) return
    const update = () => {
      setPos(positionOf(playback, performance.now()))
    }
    update()
    if (!playing) return
    const id = setInterval(update, 250)
    return () => clearInterval(id)
  }, [playback, playing, isLive])

  if (isLive) return null

  const duration = playback?.duration || 0
  return (
    <span>
      {formatClock(pos)} / {formatClock(duration)}
    </span>
  )
}

function VolumeControl({ onTouch }: { onTouch: () => void }) {
  const volume = useBilibili((s) => s.volume)
  const muted = useBilibili((s) => s.muted)
  const shown = muted ? 0 : volume

  const at = (slider: HTMLElement, x: number) => {
    const box = slider.getBoundingClientRect()
    return Math.min(1, Math.max(0, (x - box.left) / box.width)) * 100
  }

  return (
    <div className="bili-glass bili-pill bili-volume">
      <button
        type="button"
        aria-label="音量"
        onClick={() => {
          onTouch()
          toggleMute()
        }}
      >
        <VolumeGlyph muted={shown === 0} />
      </button>
      <span
        className="bili-volume-slider"
        role="slider"
        aria-label="音量调节"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        onPointerDown={(event) => {
          const slider = event.currentTarget
          onTouch()
          sendVolume(at(slider, event.clientX))
          const drag = (move: PointerEvent) => {
            const next = Math.round(at(slider, move.clientX))
            sendVolume(next)
            onTouch()
          }
          const release = () => {
            window.removeEventListener('pointermove', drag)
            window.removeEventListener('pointerup', release)
            window.removeEventListener('pointercancel', release)
          }
          window.addEventListener('pointermove', drag)
          window.addEventListener('pointerup', release)
          window.addEventListener('pointercancel', release)
        }}
      >
        <span className="bili-volume-level" style={{ width: `${shown}%` }} />
      </span>
    </div>
  )
}
