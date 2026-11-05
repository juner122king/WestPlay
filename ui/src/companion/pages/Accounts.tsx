import { useState } from 'react'
import type { Service, SignedIn } from '../accounts'
import type { Note, Words } from '../onboarding/words'
import { Button, Checking, Group, Panel, Row } from '../room/parts'
import { banner, useSignOut, useWords } from '../room/room'
import { GLOW, useScreenAt } from '../room/screen'
import type { AppId } from '../../cabin/state/apps'
import {
  type HostStatus,
  appleMusicSignIn,
  appleMusicSignOut,
  bilibiliSignIn,
  bilibiliSignOut,
  ximalayaSignIn,
  ximalayaSignOut,
  neteaseSignIn,
  neteaseSignOut,
  youtubeSignIn,
  youtubeSignOut,
} from '../useHostStatus'
import type { PageProps } from './page'

/** Each service: its name, its app on the screen, its sign-in and sign-out, and what its status says. */
const SERVICES: Record<
  Service,
  {
    name: string
    app: AppId
    glow: string
    signIn(): Promise<void>
    signOut(): Promise<void>
    signingIn(status: HostStatus | null): boolean
    /** Its words while signing in (YouTube's are the accounts' own). */
    words(words: Words): { finishInWindow: string; signingIn: Note }
  }
> = {
  youtube: {
    name: 'YouTube',
    app: 'youtube',
    glow: GLOW.youtube,
    signIn: youtubeSignIn,
    signOut: youtubeSignOut,
    signingIn: (status) => status?.youtubeSigningIn ?? false,
    words: (words) => words.accounts,
  },
  bilibili: {
    name: '哔哩哔哩',
    app: 'bilibili',
    glow: GLOW.bilibili,
    signIn: bilibiliSignIn,
    signOut: bilibiliSignOut,
    signingIn: (status) => status?.bilibiliSigningIn ?? false,
    words: (words) => words.accounts,
  },
  ximalaya: {
    name: '喜马拉雅',
    app: 'ximalaya',
    glow: GLOW.ximalaya,
    signIn: ximalayaSignIn,
    signOut: ximalayaSignOut,
    signingIn: (status) => status?.ximalayaSigningIn ?? false,
    words: (words) => words.accounts,
  },
  netease: {
    name: '网易云音乐',
    app: 'netease',
    glow: GLOW.netease,
    signIn: neteaseSignIn,
    signOut: neteaseSignOut,
    signingIn: (status) => status?.neteaseSigningIn ?? false,
    words: (words) => words.accounts,
  },
  appleMusic: {
    name: 'Apple Music',
    app: 'music',
    glow: GLOW.music,
    signIn: appleMusicSignIn,
    signOut: appleMusicSignOut,
    signingIn: (status) => status?.appleMusicSigningIn ?? false,
    words: (words) => words.appleMusic,
  },
}

const ORDER: Service[] = ['youtube', 'netease', 'bilibili', 'ximalaya', 'appleMusic']

/**
 * The services WestPlay plays from, each signed in (in its own window, on the desktop) or not. WestPlay only
 * ever knows whether it is. On the room's screen, the app of the service the pointer is on.
 */
export function Accounts({ status, cw, signedIn }: PageProps) {
  const words = useWords()
  const [shown, setShown] = useState<Service>('youtube')
  const signingIn = ORDER.find((service) => SERVICES[service].signingIn(status)) ?? null
  const service = SERVICES[signingIn ?? shown]
  useScreenAt(service.app, service.glow, signingIn ? banner(service.words(words).signingIn, true) : null)
  return (
    <Panel place="page" title={cw.accounts.title} sub={cw.accounts.sub}>
      <Group place={4}>
        {ORDER.map((each) => (
          <Account key={each} service={each} status={status} signedIn={signedIn} hover={() => setShown(each)} />
        ))}
      </Group>
    </Panel>
  )
}

/** A service: signed in or not (as last known; found out as the companion opened if never known), and its
 * button. */
function Account({
  service,
  status,
  signedIn: all,
  hover,
}: {
  service: Service
  status: HostStatus | null
  signedIn: SignedIn
  hover(): void
}) {
  const words = useWords()
  const w = words.accounts
  const s = SERVICES[service]
  const known = all[service]
  const signedIn = known ?? false
  const signingIn = s.signingIn(status)
  const checking = known === null
  const signOut = useSignOut(signedIn, s.signOut)
  return (
    <Row
      title={s.name}
      detail={checking ? undefined : signingIn ? s.words(words).finishInWindow : signedIn ? w.signedIn : w.notSignedIn}
      hover={hover}
      accessory={
        checking ? (
          <Checking />
        ) : signedIn ? (
          <Button glass small busy={signOut.signingOut} onClick={signOut.start}>
            {w.signOut}
          </Button>
        ) : (
          <Button glass small busy={signingIn} onClick={() => s.signIn()}>
            {w.signIn}
          </Button>
        )
      }
    />
  )
}
