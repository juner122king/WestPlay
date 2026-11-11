import { useEffect, useState } from 'react'
import { call, on } from './bridge'

/** An update to WestPlay, found on its releases. Mirrors the app's `update::Offer`. */
export interface Offer {
  version: string
  /** What's new: the changelog's notes for it (Markdown, a list). */
  notes: string
  /** When it was released, `YYYY-MM-DD`. */
  date: string | null
}

/** How far the download is. */
export interface Progress {
  done: number
  total: number | null
}

/** The backend owns the policy; missing/older commands fail closed. */
export async function onlineUpdatesEnabled(): Promise<boolean> {
  try {
    return (await call<boolean>('online_updates_enabled')) === true
  } catch {
    return false
  }
}

export function useOnlineUpdatesEnabled(): boolean {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let live = true
    onlineUpdatesEnabled().then((value) => {
      if (live) setEnabled(value)
    })
    return () => {
      live = false
    }
  }, [])
  return enabled
}

/** Register only after policy approval: stale events cannot offer an upstream installer. */
export function subscribeToUpdateOffers(take: (offer: Offer) => void): () => void {
  let live = true
  let stop: (() => void) | undefined
  onlineUpdatesEnabled().then((enabled) => {
    if (!live || !enabled) return
    const receive = (offer: Offer | null) => {
      if (live && offer) take(offer)
    }
    stop = on<Offer>('update-found', receive)
    call<Offer | null>('update_offer').then(receive, () => {})
    call<Offer | null>('look_for_update').then(receive, () => {})
  })
  return () => {
    live = false
    stop?.()
  }
}

export function useUpdateOffer(): Offer | null {
  const [offer, setOffer] = useState<Offer | null>(null)
  useEffect(() => subscribeToUpdateOffers(setOffer), [])
  return offer
}

/** No update lookup is sent when the domestic edition policy disables it. */
export async function lookForUpdate(): Promise<Offer | null> {
  return (await onlineUpdatesEnabled()) ? call('look_for_update') : null
}

/** Defense in depth; the backend also rejects direct invocations. */
export async function installUpdate(): Promise<void> {
  if (!(await onlineUpdatesEnabled())) throw new Error('定制版暂不支持在线更新，请手动安装升级')
  return call('install_update')
}

/** Follows the download of the update being installed. */
export function onUpdateProgress(handler: (progress: Progress) => void): () => void {
  return on<Progress>('update-progress', handler)
}

/** The notes' lines: the changelog's list items, without their Markdown, each whole (the changelog wraps an
 * item onto indented lines after its first). */
export function noteLines(notes: string): string[] {
  const items: string[] = []
  let inItem = false
  for (const raw of notes.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('- ') || line.startsWith('* ')) {
      items.push(line.slice(2))
      inItem = true
    } else if (inItem && line && /^\s/.test(raw)) {
      items[items.length - 1] += ` ${line}`
    } else {
      inItem = false
    }
  }
  return items.map((item) => item.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1'))
}
