import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Group, Row, Tick } from '../room/parts'
import type { CompanionWords } from './words'

/** An explicit game/profile target; cache folder names are never command identities. */
export interface MapChoice {
  target: string
  title: string
  detail: string
}

/** Select profiles to validate and prepare once, or explicitly force a full rebuild. */
export function PrepareMapsSheet({
  cw,
  maps,
  prepare,
  close,
}: {
  cw: CompanionWords
  maps: MapChoice[]
  prepare(targets: string[], force?: boolean): void
  close(): void
}) {
  const w = cw.map
  const [chosen, setChosen] = useState(() => new Set<string>())
  const toggle = (target: string) =>
    setChosen((before) => {
      const after = new Set(before)
      if (!after.delete(target)) after.add(target)
      return after
    })
  // Whether the list holds more than it shows: only then does it fade at its foot.
  const list = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return
    const look = () => setMore(element.scrollHeight - element.scrollTop - element.clientHeight > 1)
    look()
    element.addEventListener('scroll', look)
    const resized = new ResizeObserver(look)
    resized.observe(element)
    return () => {
      element.removeEventListener('scroll', look)
      resized.disconnect()
    }
  }, [])
  const root = document.querySelector('.cp')
  if (!root) return null
  return createPortal(
    <div className="cp-veil" onClick={close}>
      <section
        className="cp-sheet cp-sheet-tall"
        role="dialog"
        aria-label={w.prepareAgain}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{w.prepareAgain}</h2>
        <p>{w.pickText}</p>
        {/* The maps with room to see them; more than the window holds scroll, fading at the foot. */}
        <div ref={list} className="cp-sheet-list cp-sheet-maps" data-more={more || undefined}>
          <Group place={0}>
            {maps.map((map) => (
              <Row
                key={map.target}
                title={map.title}
                detail={map.detail}
                accessory={chosen.has(map.target) ? <Tick key="chosen" /> : undefined}
                onClick={() => toggle(map.target)}
              />
            ))}
          </Group>
        </div>
        <div className="cp-sheet-actions">
          <Button
            glass
            disabled={chosen.size === 0}
            onClick={() =>
              prepare(
                maps.filter((map) => chosen.has(map.target)).map((map) => map.target),
                true,
              )
            }
          >
            {w.maintenance.forcePrepare}
          </Button>
          <Button glass onClick={close}>
            {cw.uninstall.cancel}
          </Button>
          <Button
            onClick={() => prepare(maps.filter((map) => chosen.has(map.target)).map((map) => map.target))}
            disabled={chosen.size === 0}
          >
            {w.prepare}
          </Button>
        </div>
      </section>
    </div>,
    root,
  )
}
