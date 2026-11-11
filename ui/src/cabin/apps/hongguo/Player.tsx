import { useEffect, useRef, useState } from 'react'
import { isInHost } from '../../../shared/host'
import { useCabin } from '../../state/store'
import {
  BackGlyph,
  CheckGlyph,
  CloseGlyph,
  FillGlyph,
  NextGlyph,
  PauseGlyph,
  PlayGlyph,
  PreviousGlyph,
  QueueGlyph,
  ReplayGlyph,
  SettingsGlyph,
  VolumeGlyph,
} from '../youtube/glyphs'
import { followArea } from '../youtube/youtube'
import {
  closePlayer,
  dismissNotice,
  formatClock,
  leavePlayer,
  loadDramaDetail,
  openDetail,
  play,
  playOrPause,
  positionNow,
  positionOf,
  PREVIEW_DRAMAS,
  replay,
  seek,
  seekBy,
  selectEpisode,
  send,
  sendSignIn,
  sendVolumePercent,
  setAutoNext,
  setCrop,
  setSpeed,
  skip,
  stopDrama,
  toggleMute,
  useHongguo,
} from './hongguo'
import { DramaCard, EpisodePicker } from './shared'

const CONTROLS_MS = 3200
const DOUBLE_TAP_MS = 300
const SKIP_MS = 800
const SKIP_SECONDS = 10
const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2]

type Side = 'back' | 'forward'

/**
 * Full-screen in-car theater overlay for Hongguo Short Drama.
 * Leaves `.carplay.watching` transparent so the underlying WebView2 renders directly through
 * when running in the Tauri host, with large automotive controls and 9:16 crop support.
 */
export function HongguoPlayer() {
  const open = useHongguo((store) => store.open)
  const route = useCabin((state) => state.navigation.route)
  const handedOver = useCabin((state) => state.truckScreen)

  useEffect(() => {
    if (open && (handedOver || route.kind !== 'app' || route.app !== 'hongguo')) {
      leavePlayer()
    }
  }, [open, route, handedOver])

  return open ? <OpenHongguoPlayer /> : null
}

function OpenHongguoPlayer() {
  const currentDrama = useHongguo((s) => s.currentDrama)
  const currentEpisode = useHongguo((s) => s.currentEpisode)
  const playback = useHongguo((s) => s.playback)
  const playing = useHongguo((s) => s.playing)
  const speed = useHongguo((s) => s.speed)
  const autoNext = useHongguo((s) => s.autoNext)
  const crop = useHongguo((s) => s.crop)
  const detailCache = useHongguo((s) => s.detailCache)
  const playbackNotice = useHongguo((s) => s.playbackNotice)

  const [controls, setControls] = useState(true)
  const [showDrawer, setShowDrawer] = useState(false)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [dismissedEndedKey, setDismissedEndedKey] = useState<string | null>(null)
  const [skipInd, setSkipInd] = useState<{ side: Side; seconds: number; at: number } | null>(null)
  const touched = useRef(0)
  const lastTap = useRef<{ at: number; side: Side | null; single?: ReturnType<typeof setTimeout> }>({
    at: -Infinity,
    side: null,
  })

  const dramaId = currentDrama?.id || playback?.dramaId
  const detail = dramaId ? detailCache[dramaId] : undefined
  const activeEpisode = playback?.episodeNumber ?? playback?.episode ?? currentEpisode ?? 1
  const endedKey = `${dramaId ?? ''}#${activeEpisode}`
  const dismissEndedOverlay = dismissedEndedKey === endedKey
  const totalEpisodes =
    detail?.drama.totalEpisodes || playback?.totalEpisodes || currentDrama?.totalEpisodes || Math.max(activeEpisode, 1)
  const accessibleEpisodes =
    detail?.accessibleEpisodes ?? playback?.accessibleEpisodes ?? currentDrama?.accessibleEpisodes ?? 0

  const isPlayingNow = Boolean(playing || playback?.status === 'playing')
  const ended =
    !playbackNotice &&
    (playback?.status === 'ended' ||
      Boolean(playback && playback.duration > 3 && positionNow() >= playback.duration - 0.5))

  useEffect(() => {
    if (dramaId && !detailCache[dramaId]) {
      loadDramaDetail(dramaId)
    }
  }, [dramaId, detailCache])

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
    if (!controls || !isPlayingNow || showDrawer || showSpeedMenu || ended || playbackNotice) return
    const timer = setTimeout(() => setControls(false), CONTROLS_MS)
    return () => clearTimeout(timer)
  }, [controls, isPlayingNow, showDrawer, showSpeedMenu, ended, playbackNotice])

  // Position the underlying Hongguo WebView2 over `.carplay` whenever area or crop mode changes.
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
        crop,
      })
    }
    return followArea(place)
  }, [crop])

  if (!currentDrama && !playback) return null

  const displayDrama = currentDrama ?? detail?.drama
  const dramaTitle = displayDrama?.title || playback?.dramaTitle || playback?.title?.split(' · ')[0] || '红果短剧'
  const authorText = displayDrama?.author || playback?.author || playback?.artist || '红果短剧'
  const recommendations =
    detail?.recommendations && detail.recommendations.length > 0
      ? detail.recommendations
      : PREVIEW_DRAMAS.filter((d) => d.id !== dramaId).slice(0, 4)

  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (showSpeedMenu) {
      setShowSpeedMenu(false)
      touch()
      return
    }
    if (showDrawer) {
      setShowDrawer(false)
      touch()
      return
    }
    if (ended && dismissEndedOverlay) {
      setDismissedEndedKey(null)
      touch()
      return
    }

    const toggleHud = () => {
      if (controls && isPlayingNow && performance.now() - touched.current > 300) {
        setControls(false)
      } else {
        touch()
      }
    }

    const box = event.currentTarget.getBoundingClientRect()
    const across = (event.clientX - box.left) / Math.max(box.width, 1)
    const side: Side | null = across < 1 / 3 ? 'back' : across > 2 / 3 ? 'forward' : null
    const now = performance.now()
    const last = lastTap.current
    const skipping = side !== null && skipInd?.side === side && now - skipInd.at < SKIP_MS

    if (side && (skipping || (last.side === side && now - last.at < DOUBLE_TAP_MS))) {
      clearTimeout(last.single)
      lastTap.current = { at: -Infinity, side: null }
      seekBy(side === 'forward' ? SKIP_SECONDS : -SKIP_SECONDS)
      setSkipInd({
        side,
        seconds: (skipping && skipInd ? skipInd.seconds : 0) + SKIP_SECONDS,
        at: now,
      })
      return
    }

    clearTimeout(last.single)
    lastTap.current = {
      at: now,
      side,
      single: side ? setTimeout(toggleHud, DOUBLE_TAP_MS) : undefined,
    }
    if (!side) toggleHud()
  }

  return (
    <div className={`hg-player${controls ? ' controls' : ''}`} onPointerDown={handleStagePointerDown}>
      {/* Non-host browser preview fallback so Vite dev preview displays the drama cover cleanly */}
      {!isInHost() && (
        <div className="hg-player-dev-stage" aria-hidden="true">
          {(displayDrama?.cover || playback?.artwork) && (
            <>
              <img
                className="hg-player-dev-blur"
                src={displayDrama?.cover || playback?.artwork}
                alt=""
                referrerPolicy="no-referrer"
              />
              <img
                className={`hg-player-dev-frame${crop ? ' crop' : ''}`}
                src={displayDrama?.cover || playback?.artwork}
                alt=""
                referrerPolicy="no-referrer"
              />
            </>
          )}
        </div>
      )}

      {/* Top HUD */}
      <div className="hg-player-top">
        <button type="button" className="hg-glass hg-round" aria-label="最小化播放器" onClick={() => closePlayer()}>
          <BackGlyph />
        </button>

        <div className="hg-player-title">
          <div className="hg-player-title-line">
            {displayDrama ? (
              <button
                type="button"
                className="hg-player-drama-btn"
                onClick={() => {
                  closePlayer()
                  openDetail(displayDrama)
                }}
              >
                {dramaTitle}
              </button>
            ) : (
              <span className="hg-player-drama-text">{dramaTitle}</span>
            )}
            <span className="hg-player-ep-badge">
              第 {activeEpisode} 集 / 共 {totalEpisodes} 集
            </span>
          </div>
          <span className="hg-player-sub">
            {authorText}
            {accessibleEpisodes > 0 && totalEpisodes > accessibleEpisodes ? ` · 网页免费前${accessibleEpisodes}集` : ''}
          </span>
        </div>

        <div className="hg-player-top-actions">
          <button
            type="button"
            className={`hg-glass hg-pill${crop ? ' active' : ''}`}
            aria-label={crop ? '切换为完整适应画面' : '切换为铺满裁剪画面'}
            onClick={() => {
              touch()
              setCrop(!crop)
            }}
          >
            <FillGlyph />
            <span>{crop ? '铺满' : '适应'}</span>
          </button>

          <button
            type="button"
            className="hg-glass hg-pill"
            onClick={() => {
              touch()
              setShowSpeedMenu(false)
              setShowDrawer(true)
            }}
          >
            <QueueGlyph />
            <span>选集 ({totalEpisodes})</span>
          </button>

          <button type="button" className="hg-glass hg-pill danger" onClick={() => stopDrama()}>
            结束播放
          </button>
        </div>
      </div>

      {/* Double-tap seek indicator */}
      {skipInd && (
        <div className={`hg-skip-badge ${skipInd.side}`}>
          {skipInd.side === 'back' ? `后退 ${skipInd.seconds} 秒` : `快进 ${skipInd.seconds} 秒`}
        </div>
      )}

      {/* Episode Lock / Login Wall / Error Modal inside Player */}
      {playbackNotice && !showDrawer && (
        <div className="hg-player-modal" role="dialog" aria-modal="true" aria-label={playbackNotice.title}>
          <div className="hg-player-modal-card">
            <span className="hg-modal-tag">
              {playbackNotice.reason === 'login_required'
                ? '需要登录账号'
                : playbackNotice.reason === 'episode_locked'
                  ? '网页试看限制'
                  : '播放提示'}
            </span>
            <h3>{playbackNotice.title}</h3>
            <p>{playbackNotice.detail}</p>
            <div className="hg-modal-actions">
              {playbackNotice.reason === 'login_required' && (
                <button
                  type="button"
                  className="hg-modal-btn primary"
                  onClick={() => {
                    dismissNotice()
                    sendSignIn()
                  }}
                >
                  打开扫码登录
                </button>
              )}
              {playbackNotice.reason === 'episode_locked' && (
                <button type="button" className="hg-modal-btn primary" onClick={() => selectEpisode(1)}>
                  回到第 1 集试看
                </button>
              )}
              <button
                type="button"
                className="hg-modal-btn"
                onClick={() => {
                  dismissNotice()
                  setShowDrawer(true)
                }}
              >
                选集与推荐
              </button>
              <button type="button" className="hg-modal-btn subtle" onClick={() => dismissNotice()}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ended Episode / Recommendations Overlay */}
      {ended && !dismissEndedOverlay && !showDrawer && (
        <div className="hg-player-modal">
          <div className="hg-player-modal-card wide">
            <div className="hg-ended-head">
              <div>
                <span className="hg-modal-tag">播放完成</span>
                <h3>
                  《{dramaTitle}》第 {activeEpisode} 集已播完
                </h3>
              </div>
              <button
                type="button"
                className="hg-round subtle"
                aria-label="收起结束提示"
                onClick={() => setDismissedEndedKey(endedKey)}
              >
                <CloseGlyph />
              </button>
            </div>

            <div className="hg-modal-actions">
              <button type="button" className="hg-modal-btn" onClick={() => replay()}>
                <ReplayGlyph />
                <span>重播本集</span>
              </button>
              {activeEpisode < totalEpisodes && (
                <button type="button" className="hg-modal-btn primary" onClick={() => selectEpisode(activeEpisode + 1)}>
                  <NextGlyph />
                  <span>下一集 (第{activeEpisode + 1}集)</span>
                </button>
              )}
              <button type="button" className="hg-modal-btn" onClick={() => setShowDrawer(true)}>
                <QueueGlyph />
                <span>全部选集</span>
              </button>
            </div>

            {recommendations.length > 0 && (
              <div className="hg-ended-recs">
                <h4>更多热门短剧推荐</h4>
                <div className="hg-ended-rec-grid">
                  {recommendations.slice(0, 4).map((rec) => (
                    <DramaCard
                      key={rec.id}
                      drama={rec}
                      onOpen={(item) => {
                        closePlayer()
                        openDetail(item)
                      }}
                      onQuickPlay={(item) => play(item, 1, true)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Speed Menu Popover */}
      {showSpeedMenu && (
        <div className="hg-speed-popover" role="menu" aria-label="播放倍速">
          <div className="hg-speed-title">播放倍速</div>
          {SPEED_OPTIONS.map((rate) => (
            <button
              key={rate}
              type="button"
              role="menuitem"
              className={`hg-speed-option${speed === rate ? ' active' : ''}`}
              onClick={() => {
                setSpeed(rate)
                setShowSpeedMenu(false)
                touch()
              }}
            >
              <span>{rate === 1 ? '1.0x 正常' : `${rate}x`}</span>
              {speed === rate && <CheckGlyph />}
            </button>
          ))}
        </div>
      )}

      {/* Bottom HUD */}
      <div className="hg-player-bottom">
        <div className="hg-timeline-row">
          <Timeline onTouch={touch} />
          <div className="hg-time-label">
            <TimeDisplay />
          </div>
        </div>

        <div className="hg-controls-row">
          <div className="hg-controls-left">
            <button
              type="button"
              className="hg-glass hg-round"
              aria-label="上一集"
              disabled={activeEpisode <= 1}
              onClick={() => {
                touch()
                skip(-1)
              }}
            >
              <PreviousGlyph />
            </button>

            <button
              type="button"
              className="hg-glass hg-pill"
              aria-label="后退10秒"
              onClick={() => {
                touch()
                seekBy(-SKIP_SECONDS)
              }}
            >
              -10s
            </button>

            <button
              type="button"
              className="hg-glass hg-round main"
              aria-label={ended ? '重播' : isPlayingNow ? '暂停' : '播放'}
              onClick={() => {
                touch()
                playOrPause()
              }}
            >
              {ended ? <ReplayGlyph /> : isPlayingNow ? <PauseGlyph /> : <PlayGlyph />}
            </button>

            <button
              type="button"
              className="hg-glass hg-pill"
              aria-label="快进10秒"
              onClick={() => {
                touch()
                seekBy(SKIP_SECONDS)
              }}
            >
              +10s
            </button>

            <button
              type="button"
              className="hg-glass hg-round"
              aria-label="下一集"
              onClick={() => {
                touch()
                skip(1)
              }}
            >
              <NextGlyph />
            </button>
          </div>

          <div className="hg-controls-right">
            <button
              type="button"
              className={`hg-glass hg-pill${autoNext ? ' active' : ''}`}
              onClick={() => {
                touch()
                setAutoNext(!autoNext)
              }}
            >
              连播 {autoNext ? '开' : '关'}
            </button>

            <button
              type="button"
              className={`hg-glass hg-pill${showSpeedMenu ? ' active' : ''}`}
              onClick={() => {
                touch()
                setShowSpeedMenu((v) => !v)
              }}
            >
              <SettingsGlyph />
              <span>{speed}x</span>
            </button>

            <VolumeControl onTouch={touch} />
          </div>
        </div>
      </div>

      {/* Slide-over Anthology & Recommendations Drawer */}
      {showDrawer && (
        <aside className="hg-drawer" aria-label="选集与推荐抽屉">
          <div className="hg-drawer-head">
            <div>
              <h3>选集与推荐</h3>
              <p>
                {dramaTitle} · 当前第 {activeEpisode} 集 / 共 {totalEpisodes} 集
              </p>
            </div>
            <button
              type="button"
              className="hg-glass hg-round"
              aria-label="关闭抽屉"
              onClick={() => setShowDrawer(false)}
            >
              <CloseGlyph />
            </button>
          </div>

          <div className="hg-drawer-body">
            <section className="hg-drawer-section">
              <h4>剧集目录</h4>
              <EpisodePicker
                totalEpisodes={totalEpisodes}
                accessibleEpisodes={accessibleEpisodes}
                currentEpisode={activeEpisode}
                compact
                onSelect={(ep) => {
                  selectEpisode(ep, true)
                  setShowDrawer(false)
                }}
              />
            </section>

            {recommendations.length > 0 && (
              <section className="hg-drawer-section">
                <h4>相关推荐</h4>
                <div className="hg-drawer-rec-grid">
                  {recommendations.slice(0, 6).map((rec) => (
                    <DramaCard
                      key={rec.id}
                      drama={rec}
                      onOpen={(item) => {
                        setShowDrawer(false)
                        closePlayer()
                        openDetail(item)
                      }}
                      onQuickPlay={(item) => {
                        setShowDrawer(false)
                        play(item, 1, true)
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

function Timeline({ onTouch }: { onTouch: () => void }) {
  const playback = useHongguo((s) => s.playback)
  const playing = useHongguo((s) => s.playing)
  const [pos, setPos] = useState(0)

  useEffect(() => {
    const update = () => setPos(positionOf(playback, performance.now()))
    update()
    if (!playing) return
    const id = setInterval(update, 250)
    return () => clearInterval(id)
  }, [playback, playing])

  const duration = playback?.duration || 1
  const pct = Math.min(100, Math.max(0, (pos / duration) * 100))

  const scrub = (bar: HTMLElement, clientX: number) => {
    const rect = bar.getBoundingClientRect()
    const pctClick = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)))
    onTouch()
    seek(pctClick * duration)
  }

  return (
    <div
      className="hg-bar"
      role="slider"
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(pos)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        scrub(e.currentTarget, e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) scrub(e.currentTarget, e.clientX)
      }}
    >
      <span className="hg-bar-played" style={{ width: `${pct}%` }} />
      <span className="hg-bar-dot" style={{ left: `${pct}%` }} />
    </div>
  )
}

function TimeDisplay() {
  const playback = useHongguo((s) => s.playback)
  const playing = useHongguo((s) => s.playing)
  const [pos, setPos] = useState(0)

  useEffect(() => {
    const update = () => setPos(positionOf(playback, performance.now()))
    update()
    if (!playing) return
    const id = setInterval(update, 250)
    return () => clearInterval(id)
  }, [playback, playing])

  return (
    <span>
      {formatClock(pos)} / {formatClock(playback?.duration || 0)}
    </span>
  )
}

function VolumeControl({ onTouch }: { onTouch: () => void }) {
  const volume = useHongguo((s) => s.volume)
  const muted = useHongguo((s) => s.muted)
  const shown = muted ? 0 : volume

  const applyAt = (slider: HTMLElement, clientX: number) => {
    const box = slider.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (clientX - box.left) / Math.max(box.width, 1))) * 100
    onTouch()
    sendVolumePercent(pct)
  }

  return (
    <div className="hg-glass hg-pill hg-volume">
      <button
        type="button"
        className="hg-volume-mute"
        aria-label={shown === 0 ? '取消静音' : '静音'}
        onClick={() => {
          onTouch()
          toggleMute()
        }}
      >
        <VolumeGlyph muted={shown === 0} />
      </button>
      <span
        className="hg-volume-slider"
        role="slider"
        aria-label="音量调节"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          applyAt(e.currentTarget, e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) applyAt(e.currentTarget, e.clientX)
        }}
      >
        <span className="hg-volume-fill" style={{ width: `${shown}%` }} />
      </span>
    </div>
  )
}
