import { useEffect, useState } from 'react'
import {
  type HostStatus,
  appleMusicCheck,
  bilibiliCheck,
  neteaseCheck,
  ximalayaCheck,
  youtubeCheck,
} from './useHostStatus'

export interface SignedIn {
  youtube: boolean | null
  bilibili: boolean | null
  ximalaya: boolean | null
  netease: boolean | null
  appleMusic: boolean | null
}

export type Service = keyof SignedIn

const SERVICES: Service[] = ['youtube', 'bilibili', 'ximalaya', 'netease', 'appleMusic']

const KEY = 'westplay.companion.signedIn'

function kept(): SignedIn {
  let value: Partial<Record<Service, unknown>> | null = null
  try {
    value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Record<Service, unknown>> | null
  } catch {
    // Nothing kept: each is asked.
  }
  const known = (service: Service) => (typeof value?.[service] === 'boolean' ? (value[service] as boolean) : null)
  return {
    youtube: known('youtube'),
    bilibili: known('bilibili'),
    ximalaya: known('ximalaya'),
    netease: known('netease'),
    appleMusic: known('appleMusic'),
  }
}

function keep(value: SignedIn) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Not kept: known again next time a service says.
  }
}

/** What's known now: the status's, else what was kept (saved again whenever a status says). */
export function useSignedIn(status: HostStatus | null): SignedIn {
  const [known] = useState(kept)
  const now: SignedIn = {
    youtube: status?.youtubeSignedIn ?? null,
    bilibili: status?.bilibiliSignedIn ?? null,
    ximalaya: status?.ximalayaSignedIn ?? null,
    netease: status?.neteaseSignedIn ?? null,
    appleMusic: status?.appleMusicSignedIn ?? null,
  }
  useEffect(() => {
    if (SERVICES.every((service) => now[service] === null)) return
    const before = kept()
    keep({
      youtube: now.youtube ?? before.youtube,
      bilibili: now.bilibili ?? before.bilibili,
      ximalaya: now.ximalaya ?? before.ximalaya,
      netease: now.netease ?? before.netease,
      appleMusic: now.appleMusic ?? before.appleMusic,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.youtube, now.bilibili, now.ximalaya, now.netease, now.appleMusic])
  return {
    youtube: now.youtube ?? known.youtube,
    bilibili: now.bilibili ?? known.bilibili,
    ximalaya: now.ximalaya ?? known.ximalaya,
    netease: now.netease ?? known.netease,
    appleMusic: now.appleMusic ?? known.appleMusic,
  }
}

/** As the companion opens: each service never known yet is run, hidden, to say. */
export function useAskOnce(): void {
  useEffect(() => {
    const known = kept()
    if (known.youtube === null) youtubeCheck().catch(() => {})
    if (known.bilibili === null) bilibiliCheck().catch(() => {})
    if (known.ximalaya === null) ximalayaCheck().catch(() => {})
    if (known.netease === null) neteaseCheck().catch(() => {})
    if (known.appleMusic === null) appleMusicCheck().catch(() => {})
  }, [])
}
