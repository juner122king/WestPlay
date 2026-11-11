import { useEffect, useState } from 'react'
import { go } from '../../state/store'
import { FullScreenGlyph, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph, ReplayGlyph } from '../youtube/glyphs'
import { OverVideo, VideoHole } from '../youtube/VideoHole'
import { playOrPause, skip, useHongguo } from './hongguo'

const CONTROLS_MS = 3000

/**
 * Dashboard Now Playing live video card for Hongguo Short Drama.
 * Embeds the live WebView2 via `VideoHole` (cropped to fit the dashboard frame) with touch HUD controls.
 */
export function HongguoVideoWidget() {
  const playback = useHongguo((store) => store.playback)
  const playing = useHongguo((store) => store.playing)
  const currentDrama = useHongguo((store) => store.currentDrama)
  const currentEpisode = useHongguo((store) => store.currentEpisode)

  const isPlayingNow = Boolean(playing || playback?.status === 'playing')
  const ended = playback?.status === 'ended'
  const [controls, setControls] = useState(false)
  const [touched, setTouched] = useState(0)

  const touch = () => {
    setControls(true)
    setTouched((n) => n + 1)
  }

  useEffect(() => {
    if (!controls || !isPlayingNow) return
    const timer = setTimeout(() => setControls(false), CONTROLS_MS)
    return () => clearTimeout(timer)
  }, [controls, isPlayingNow, touched])

  if (!playback) return null

  const ep = playback.episodeNumber ?? playback.episode ?? currentEpisode ?? 1
  const label = playback.dramaTitle || currentDrama?.title || playback.title

  return (
    <article className="widget now-playing yt-widget hg-widget" aria-label={playback.title}>
      <VideoHole
        app="hongguo"
        className="yt-widget-video"
        crop
        thumbnailSrc={playback.artwork ?? currentDrama?.cover ?? null}
      />
      <OverVideo app="hongguo">
        <div
          className={controls ? 'yt-widget-over shown' : 'yt-widget-over'}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (controls) setControls(false)
            else touch()
          }}
        >
          {controls && (
            <>
              <div className="hg-widget-meta">
                <span className="hg-widget-badge">红果 · 第{ep}集</span>
                <span className="yt-widget-title">{label}</span>
              </div>
              <div className="yt-widget-controls">
                <button
                  type="button"
                  aria-label="上一集"
                  onClick={() => {
                    touch()
                    skip(-1)
                  }}
                >
                  <PreviousGlyph />
                </button>
                <button
                  type="button"
                  className="main"
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
                  aria-label="下一集"
                  onClick={() => {
                    touch()
                    skip(1)
                  }}
                >
                  <NextGlyph />
                </button>
              </div>
              <button
                type="button"
                className="yt-widget-full"
                aria-label="全屏观看"
                onClick={() => {
                  useHongguo.setState({ returnToPlayer: true })
                  go({ type: 'openApp', app: 'hongguo' })
                }}
              >
                <FullScreenGlyph />
              </button>
            </>
          )}
        </div>
      </OverVideo>
    </article>
  )
}
