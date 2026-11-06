import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { postToHost } from '../../../shared/host'
import { whenTransitionEnds } from '../../state/launch'
import { useCabin } from '../../state/store'
import { useDouyin } from '../douyin/douyin'
import { useHongguo } from '../hongguo/hongguo'
import { useBilibili } from '../bilibili/bilibili'
import { command, followArea, useYouTube } from './youtube'

/** How long the CarPlay area takes at most to grow back from the truck's screen, ms (its spring). */
const GROW_MS = 900

export type VideoApp = 'youtube' | 'douyin' | 'hongguo' | 'bilibili'

/**
 * Where the video playing shows outside the full-screen player (YouTube's Now playing, Douyin card, Hongguo player, the Dashboard's): its
 * picture is the underlying WebView's own, placed under the page by the host, and the CarPlay area is cut open over this
 * element (Shell.tsx), its rounding included. `crop`: the picture fills it, cropped (otherwise all of it
 * shows, with bars). Placed again whenever it may have moved.
 */
export function VideoHole({
  className,
  crop = false,
  app = 'youtube',
  thumbnailSrc = null,
}: {
  className: string
  crop?: boolean
  app?: VideoApp
  thumbnailSrc?: string | null
}) {
  const ytThumbnail = useYouTube((store) => store.current?.thumbnail ?? null)
  const dyThumbnail = useDouyin((store) => store.playback?.artwork ?? null)
  const hgThumbnail = useHongguo((store) => store.playback?.artwork ?? null)
  const biliThumbnail = useBilibili((store) => store.playback?.artwork ?? null)
  const thumbnail =
    thumbnailSrc ??
    (app === 'douyin'
      ? dyThumbnail
      : app === 'hongguo'
        ? hgThumbnail
        : app === 'bilibili'
          ? biliThumbnail
          : ytThumbnail)

  // The screen handed to the truck (Alt+W): the CarPlay area shrinks away, and the picture goes at once.
  const handedOver = useCabin((state) => state.truckScreen)
  const frame = useRef<HTMLSpanElement>(null)
  // Handed over before this placing: the CarPlay area is growing back.
  const returning = useRef(false)
  useEffect(() => {
    const element = frame.current
    if (!element) return
    if (handedOver) {
      returning.current = true
      return
    }
    // The screen it's on, while it comes or goes (CabinApp.tsx's `Screens`).
    const slot = element.closest('.screen-slot')
    const moving = () => !!slot && (slot.classList.contains('entering') || slot.classList.contains('leaving'))
    const place = () => {
      const area = document.querySelector('.carplay')?.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      if (!area || box.width === 0) return
      // Its rounding in screen pixels (the CarPlay area's content is zoomed to the screen's scale).
      const zoom = box.width / element.offsetWidth
      const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) * zoom
      const hole = { x: box.left - area.left, y: box.top - area.top, width: box.width, height: box.height, radius }

      if (app === 'douyin') {
        useDouyin.setState({ hole })
      } else if (app === 'hongguo') {
        useHongguo.setState({ hole })
      } else if (app === 'bilibili') {
        useBilibili.setState({ hole })
      } else {
        useYouTube.setState({ hole })
      }

      const scale = window.devicePixelRatio
      const showCmd = {
        action: 'show' as const,
        x: Math.round(box.left * scale),
        y: Math.round(box.top * scale),
        width: Math.round(box.width * scale),
        height: Math.round(box.height * scale),
        crop,
      }

      if (app === 'douyin') {
        postToHost({ type: 'douyin', command: showCmd })
      } else if (app === 'hongguo') {
        postToHost({ type: 'hongguo', command: showCmd })
      } else if (app === 'bilibili') {
        postToHost({ type: 'bilibili', command: showCmd })
      } else {
        command(showCmd)
      }
    }
    let following: (() => void) | null = null
    let settling: ReturnType<typeof setTimeout>[] = []
    let gone = false
    const follow = () => {
      if (gone || following || moving()) return
      following = followArea(place, element)
      // An app's window grows in from its icon (a transform, which no size change tells of): placed again
      // as it settles.
      settling = [120, 350, 700].map((ms) => setTimeout(place, ms))
    }
    // On a screen still coming in, the picture waits for it to stop (a screen going never shows it).
    const stopped = slot ? new MutationObserver(follow) : null
    if (slot) stopped?.observe(slot, { attributes: true, attributeFilter: ['class'] })
    // The CarPlay area growing back from the truck's screen (a transform, which nothing tells of): the
    // picture once it's grown (at the latest a moment after).
    const area = document.querySelector('.carplay')
    let grown: ReturnType<typeof setTimeout> | undefined
    const grew = (event: Event) => {
      if (event.target !== area || (event as TransitionEvent).propertyName !== 'transform') return
      area?.removeEventListener('transitionend', grew)
      clearTimeout(grown)
      follow()
    }
    if (returning.current && area) {
      returning.current = false
      area.addEventListener('transitionend', grew)
      grown = setTimeout(() => {
        area.removeEventListener('transitionend', grew)
        follow()
      }, GROW_MS)
    } else {
      returning.current = false
      // A screen change animating (the full-screen player closing onto the Dashboard): the picture where it
      // was, under the page fading over it, until the change ends (youtube.ts `leavePlayer`).
      whenTransitionEnds(follow)
    }
    return () => {
      gone = true
      stopped?.disconnect()
      area?.removeEventListener('transitionend', grew)
      clearTimeout(grown)
      settling.forEach(clearTimeout)
      if (following) {
        following()
        following = null
      }
      if (app === 'douyin') {
        useDouyin.setState({ hole: null })
        postToHost({ type: 'douyin', command: { action: 'hide' } })
      } else if (app === 'hongguo') {
        useHongguo.setState({ hole: null })
        postToHost({ type: 'hongguo', command: { action: 'hide' } })
      } else if (app === 'bilibili') {
        useBilibili.setState({ hole: null })
        postToHost({ type: 'bilibili', command: { action: 'hide' } })
      } else {
        useYouTube.setState({ hole: null })
        // Gone (whatever shows it next places it again).
        command({ action: 'hide' })
      }
    }
  }, [crop, handedOver, app])
  // The thumbnail, under the picture (cut out with the page while the picture shows).
  return (
    <span ref={frame} className={className}>
      {thumbnail && <img src={thumbnail} alt="" referrerPolicy="no-referrer" />}
    </span>
  )
}

/**
 * Content over the video where it shows through the page (`VideoHole`): drawn in its own layer above the
 * CarPlay area (anything in the CarPlay area there is cut out with it), the same size, at the same scale.
 */
export function OverVideo({ app = 'youtube', children }: { app?: VideoApp; children: ReactNode }) {
  const ytHole = useYouTube((store) => store.hole)
  const dyHole = useDouyin((store) => store.hole)
  const hgHole = useHongguo((store) => store.hole)
  const biliHole = useBilibili((store) => store.hole)
  const hole = app === 'douyin' ? dyHole : app === 'hongguo' ? hgHole : app === 'bilibili' ? biliHole : ytHole
  // The layer is the shell's (Shell.tsx): there by the time a hole is (a VideoHole placed after it).
  const layer = hole ? document.getElementById('video-over') : null
  if (!layer || !hole) return null
  return createPortal(
    <div
      className="over-video"
      style={{ left: hole.x, top: hole.y, width: hole.width, height: hole.height, borderRadius: hole.radius }}
    >
      <div
        className="over-video-content"
        style={{
          width: `calc(${hole.width}px / var(--ui-scale, 1))`,
          height: `calc(${hole.height}px / var(--ui-scale, 1))`,
        }}
      >
        {children}
      </div>
    </div>,
    layer,
  )
}
