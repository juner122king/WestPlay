import { useEffect, useState } from 'react'
import { go } from '../../state/store'
import { FullScreenGlyph, NextGlyph, PauseGlyph, PlayGlyph, PreviousGlyph, ReplayGlyph } from '../youtube/glyphs'
import { OverVideo, VideoHole } from '../youtube/VideoHole'
import { playOrPause, skip, useBilibili } from './bilibili'

const CONTROLS_MS = 3000

export function BilibiliVideoWidget() {
  const playback = useBilibili((store) => store.playback)
  const playing = useBilibili((store) => store.playing)
  const isPlayingNow = Boolean(
    playing || playback?.status === 'playing' || (playback?.isLive && playback?.status !== 'paused'),
  )
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

  return (
    <article className="widget now-playing yt-widget bili-widget" aria-label={playback.title}>
      <VideoHole app="bilibili" className="yt-widget-video" crop />
      <OverVideo app="bilibili">
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
              <span className="yt-widget-title">{playback.title}</span>
              <div className="yt-widget-controls">
                <button
                  type="button"
                  aria-label="Previous"
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
                  aria-label={ended ? 'Replay' : isPlayingNow ? 'Pause' : 'Play'}
                  onClick={() => {
                    touch()
                    playOrPause()
                  }}
                >
                  {ended ? <ReplayGlyph /> : isPlayingNow ? <PauseGlyph /> : <PlayGlyph />}
                </button>
                <button
                  type="button"
                  aria-label="Next"
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
                aria-label="全屏播放"
                onClick={() => {
                  useBilibili.setState({ returnToPlayer: true })
                  go({ type: 'openApp', app: 'bilibili' })
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
