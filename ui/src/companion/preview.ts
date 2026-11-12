import type { GameCheck, GameInfo, InstallReport, SetupState } from './setup'
import type { Customizations } from '../shared/customize'
import type { Added } from './customize'
import type { HostStatus, MapStatus } from './useHostStatus'
import type { Settings } from './useSettings'

/**
 * The companion opened in a plain browser (bridge.ts): the app's answers, made up, so its pages can be
 * developed and checked without the app or the game. What it shows is set in the address:
 *
 * - `?onboarding`: the first run, from its start.
 * - `?ats`: American Truck Simulator installed too (both games set up, or found by the onboarding); `?ats=found`:
 *   found, ETS2 alone set up (as one who had WestPlay before ATS was supported).
 * - `?game=off|on|live|unsupported`: the game not running, running (the cab not on the screen), the screen live, or
 *   the player in a truck WestPlay doesn't show in.
 * - `?map=building|ready|waiting|failed`: the map's state (`building` runs to `ready`).
 * Online updates are disabled in the domestic edition, including browser previews.
 * - `?custom`: some wallpapers and an icon set of the player's (adding gives more, with a file left out).
 * - `?leftOut`: the played profile's map made without a map mod it couldn't read.
 * - `?elevated`: the game run as administrator (WestPlay can't read its route, guidance or weather).
 * - `?updated` (or `?updated=admin`): WestPlay updated since it was set up: the new plugin goes into the game
 *   once it's closed (with `admin`, Windows' permission is asked for first).
 *
 * Nothing here is ever in the app.
 */
const query = new URLSearchParams(location.search)
const gameState = query.get('game') ?? 'live'

const GAME: GameInfo = {
  kind: 'ets2',
  dir: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Euro Truck Simulator 2',
  foundBy: 'steam',
  version: '1.61.1.9',
  tested: true,
  dlcs: 34,
}

const ATS: GameInfo = {
  kind: 'ats',
  dir: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\American Truck Simulator',
  foundBy: 'steam',
  version: '1.61.3.18',
  tested: false,
  dlcs: 51,
}
const GAMES = query.has('ats') ? [GAME, ATS] : [GAME]

// A first run has no game set up until the onboarding installs into it.
const setup: SetupState = {
  finished: !query.has('onboarding'),
  game: query.has('onboarding') ? null : GAME,
  games: query.has('onboarding') ? [] : query.get('ats') === 'found' ? [GAME] : GAMES,
  found: GAMES,
  updated: query.has('updated'),
  outdated: query.has('updated') && !query.has('onboarding') ? [GAME] : [],
  gameRunning: gameState !== 'off',
  language: query.get('lang'),
}

let settings: Settings = {
  interaction: { key: 0xa4, mode: 'hold', sensitivity: 1.4 },
  keybinds: {
    volumeDown: { key: 0x31, withInteractionKey: true },
    playPause: { key: 0x32, withInteractionKey: true },
    volumeUp: { key: 0x33, withInteractionKey: true },
  },
  screen: { truckStrip: 'auto' },
  look: { wallpaper: null, iconSet: null, iconStyle: 'auto' },
  graphics: { gpu: null },
  map: { buildings: true, roads: true, fast: false, maintenance: { games: {}, profiles: {} } },
  language: null,
}

// The player's own, made up from WestPlay's files (the preview's address: `FILES_BASE` is `/` here).
const custom: Customizations = query.has('custom')
  ? {
      wallpapers: [{ id: 'custom:Logo', name: 'Logo', dark: 'westplay.png', light: 'westplay.png' }],
      iconSets: [
        {
          name: 'Sample icons',
          icons: {
            bilibili: { light: 'icons/westplay/bilibili.dark.svg', dark: 'icons/westplay/bilibili.dark.svg' },
            youtube: { light: null, dark: 'icons/westplay/youtube.light.svg' },
          },
        },
      ],
    }
  : { wallpapers: [], iconSets: [] }

const accounts = {
  youtube: true as boolean | null,
  appleMusic: false as boolean | null,
  bilibili: false as boolean | null,
  ximalaya: false as boolean | null,
  douyin: false as boolean | null,
  hongguo: false as boolean | null,
  netease: false as boolean | null,
  signingIn: '',
}

function startingMap(): MapStatus {
  switch (query.get('map')) {
    case 'building':
      return { state: 'building', done: 0.05, stage: 'reading' }
    case 'waiting':
      return { state: 'waitingForGame' }
    case 'memory':
      return { state: 'waitingForMemory', needed: 3_500_000_000, free: 2_140_000_000 }
    case 'failed':
      return { state: 'failed', error: 'The map couldn’t be read: def/world/road_look.sii is missing.' }
    case 'ready':
      return { state: 'ready' }
    case 'unverified':
      return { state: 'unverified' }
    case 'stale':
      return { state: 'stale' }
    case 'cancelled':
      return { state: 'cancelled' }
    default:
      return { state: 'notPrepared' }
  }
}
let map = startingMap()
let previewSequence = 0
const previewJobs = new Map<string, { id: string; state: MapStatus }>([
  ['ets2:profiles/57657374', { id: 'preview-west', state: map }],
  [
    'ets2:profiles/54657374',
    { id: 'preview-test', state: { state: query.get('others') === 'ready' ? 'ready' : 'notPrepared' } },
  ],
  ['ats:profiles/driver', { id: 'preview-ats', state: { state: 'notPrepared' } }],
])
let westplayOpen: boolean | null = gameState === 'live' ? true : null

/** A laptop's two graphics cards, the fast one first. */
const ADAPTERS = [
  { id: '10de:2860:00000000:161', name: 'NVIDIA GeForce RTX 4070 Laptop GPU' },
  { id: '8086:a7a0:00000000:4', name: 'Intel(R) Iris(R) Xe Graphics' },
]

function status(): HostStatus {
  const live = gameState === 'live'
  return {
    webviewVersion: '141.0.3537.71',
    adapter: gameState === 'off' ? null : ADAPTERS[0].name,
    // The one chosen, or WestPlay's pick: the game's.
    cabAdapter: (ADAPTERS.find((adapter) => adapter.id === settings.graphics.gpu) ?? ADAPTERS[0]).name,
    gameAdapter: gameState === 'off' ? null : ADAPTERS[0].name,
    adapters: ADAPTERS,
    framesPerSecond: live ? 58 + Math.round(Math.random() * 3) : 0,
    droppedTotal: live ? 3 : 0,
    gameConnected: gameState !== 'off',
    game: gameState === 'off' ? null : 'ets2',
    screenDrawing: live,
    // `?game=unsupported`: in a truck WestPlay doesn't show in.
    truckSupported: gameState === 'unsupported' ? false : live ? true : null,
    gameElevated: gameState !== 'off' && query.has('elevated'),
    westplayOpen: live ? westplayOpen : null,
    youtubeSignedIn: accounts.youtube,
    youtubeSigningIn: accounts.signingIn === 'youtube',
    appleMusicSignedIn: accounts.appleMusic,
    appleMusicSigningIn: accounts.signingIn === 'appleMusic',
    bilibiliSignedIn: accounts.bilibili,
    bilibiliSigningIn: accounts.signingIn === 'bilibili',
    ximalayaSignedIn: accounts.ximalaya,
    ximalayaSigningIn: accounts.signingIn === 'ximalaya',
    douyinSignedIn: accounts.douyin,
    douyinSigningIn: accounts.signingIn === 'douyin',
    hongguoSignedIn: accounts.hongguo,
    hongguoSigningIn: accounts.signingIn === 'hongguo',
    neteaseSignedIn: accounts.netease,
    neteaseSigningIn: accounts.signingIn === 'netease',
    map,
    mapFolder: null,
    mapBuilt: map.state === 'ready' ? Math.floor(Date.now() / 1000) - 3 * 86_400 : null,
    // The played profile's map, then the other profile's: made after it, or waiting its turn.
    profileMaps: [
      {
        game: 'ets2',
        dir: 'profiles/57657374',
        target: 'ets2:profiles/57657374',
        name: 'West',
        taskId: previewJobs.get('ets2:profiles/57657374')?.id,
        folder: 'europe-cbf29ce484222325',
        status: map,
        leftOut: map.state === 'ready' && query.has('leftOut') ? ['Crni Kal 1.61'] : undefined,
      },
      {
        game: 'ets2',
        dir: 'profiles/54657374',
        target: 'ets2:profiles/54657374',
        name: 'Test',
        taskId: previewJobs.get('ets2:profiles/54657374')?.id,
        folder: 'europe-6350e2ab6a0e4959',
        status: previewJobs.get('ets2:profiles/54657374')!.state,
      },
      ...(GAMES.some((game) => game.kind === 'ats')
        ? [
            {
              game: 'ats' as const,
              dir: 'profiles/driver',
              target: 'ats:profiles/driver',
              name: 'ATS Driver',
              folder: 'usa-preview',
              status: previewJobs.get('ats:profiles/driver')!.state,
              taskId: previewJobs.get('ats:profiles/driver')!.id,
            },
          ]
        : []),
    ],
    error: null,
  }
}

const listeners = new Map<string, Set<(payload: unknown) => void>>()
const emit = (event: string, payload: unknown) => listeners.get(event)?.forEach((handler) => handler(payload))

// The status, about once a second, as the app sends it; a map being built goes on.
const STAGES = ['reading', 'drawing', 'tiles', 'saving'] as const
const ENDS = [0.15, 0.6, 0.95, 1]
setInterval(() => {
  for (const job of previewJobs.values()) {
    if (job.state.state !== 'building') continue
    const done = Math.min(1, job.state.done + 0.012)
    const stage = STAGES[ENDS.findIndex((end) => done < end)] ?? 'saving'
    job.state = done >= 1 ? { state: 'ready' } : { state: 'building', done, stage }
  }
  map = previewJobs.get('ets2:profiles/57657374')!.state
  emit('host-status', status())
}, 1000)

export function subscribe(event: string, handler: (payload: unknown) => void): () => void {
  const set = listeners.get(event) ?? new Set()
  set.add(handler)
  listeners.set(event, set)
  if (event === 'host-status') setTimeout(() => handler(status()), 50)
  return () => set.delete(handler)
}

function setLook(change: Partial<Settings['look']>) {
  settings = { ...settings, look: { ...settings.look, ...change } }
  emit('settings-changed', settings)
}

const later = <T>(value: T, ms = 300) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

/** A sign-in: Google's, Apple's or domestic apps' window "open" a moment, then signed in. */
function signIn(service: 'youtube' | 'appleMusic' | 'bilibili' | 'ximalaya' | 'douyin' | 'hongguo' | 'netease') {
  accounts.signingIn = service
  emit('host-status', status())
  setTimeout(() => {
    accounts[service] = true
    accounts.signingIn = ''
    emit('host-status', status())
  }, 2500)
}

const CHECK: GameCheck = {
  game: GAME,
  dlcs: 34,
  mapDlcs: ['Going East!', 'Scandinavia', 'Vive la France!', 'Italia', 'Beyond the Baltic Sea', 'Iberia'],
  profiles: [
    {
      name: 'Western',
      dir: 'profiles/57657374',
      map: 'europe',
      mapMods: ['ProMods 2.80'],
      unreadable: 0,
      hvtMap: false,
    },
    {
      name: 'Test drive',
      dir: 'profiles/54657374',
      map: 'europe',
      mapMods: [],
      unreadable: 0,
      hvtMap: false,
    },
  ],
  trucks: [
    { id: 'daf-xf-2021', name: 'DAF XF 2021', fit: 'ready', fromMod: false },
    { id: 'scania-smart-dash', name: 'Scania S and R - Smart Dash', fit: 'ready', fromMod: false },
    { id: 'iveco-sway', name: 'Iveco S-Way', fit: 'ready', fromMod: false },
    { id: 'renault-t-2024', name: 'Renault T (2024)', fit: 'ready', fromMod: false },
    { id: 'volvo-fh-2021', name: 'Volvo FH (2021)', fit: 'ready', fromMod: false },
    { id: 'volvo-fh-2024', name: 'Volvo FH (2024)', fit: 'ready', fromMod: false },
    { id: 'any-truck-tablet', name: 'Any truck – with the WestPlay tablet', fit: 'ready', fromMod: false },
  ],
  modProblem: null,
  plugin: 'current',
  otherApps: [],
}

/** ATS's, as a check of it finds it (including its WestPlay-ready VNL 2025). */
const ATS_CHECK: GameCheck = {
  ...CHECK,
  game: ATS,
  dlcs: 51,
  mapDlcs: ['Nevada', 'Arizona', 'New Mexico', 'Oregon', 'Montana'],
  profiles: [
    { name: 'The Western', dir: 'steam_profiles/546865', map: 'usa', mapMods: [], unreadable: 0, hvtMap: false },
  ],
  trucks: [
    { id: 'volvo-vnl-2025', name: 'Volvo VNL (2025)', fit: 'ready', fromMod: false },
    { id: 'western-star-57x', name: 'Western Star 57X', fit: 'notYet', fromMod: false },
    { id: 'peterbilt-579', name: 'Peterbilt 579', fit: 'notInGame', fromMod: false },
    { id: 'any-truck-tablet', name: 'Any truck – with the WestPlay tablet', fit: 'ready', fromMod: false },
  ],
}

/** Some keys' names as Windows gives them (the app asks it for every key's). */
function previewKeyName(key: number): string | null {
  if ((key >= 0x30 && key <= 0x39) || (key >= 0x41 && key <= 0x5a)) return String.fromCharCode(key)
  if (key >= 0x70 && key <= 0x87) return `F${key - 0x6f}`
  const named: Record<number, string> = {
    0x08: 'Backspace',
    0x09: 'Tab',
    0x0d: 'Enter',
    0x20: 'Space',
    0x21: 'Page Up',
    0x22: 'Page Down',
    0x23: 'End',
    0x24: 'Home',
    0x25: 'Left',
    0x26: 'Up',
    0x27: 'Right',
    0x28: 'Down',
    0x2d: 'Insert',
    0x2e: 'Delete',
    0xa0: 'Shift',
    0xa1: 'Right Shift',
    0xa2: 'Ctrl',
    0xa3: 'Right Ctrl',
    0xa4: 'Alt',
    0xa5: 'Right Alt',
  }
  if (key >= 0x60 && key <= 0x69) return `Num ${key - 0x60}`
  return named[key] ?? null
}

export function answer(command: string, args?: Record<string, unknown>): Promise<unknown> {
  switch (command) {
    case 'setup_state':
      return later(setup, 120)
    case 'game_running':
      return later(gameState !== 'off', 80)
    case 'check_game':
      return later(String(args?.dir).includes('American') ? ATS_CHECK : CHECK, 900)
    case 'choose_game_folder':
      return later(null)
    case 'install_into_game':
      if (query.get('updated') === 'admin' && !args?.administrator) {
        return later<InstallReport>({ plugin: { state: 'needsAdministrator' }, modError: null, done: false }, 900)
      }
      setup.game = GAME
      setup.games = GAMES
      return later<InstallReport>({ plugin: { state: 'installed' }, modError: null, done: true }, 1600)
    case 'finish_setup':
      setup.finished = true
      return later(undefined)
    case 'get_settings':
      return later(settings, 60)
    case 'key_name':
      return later(previewKeyName(Number(args?.key)))
    case 'update_settings':
      settings = args?.settings as Settings
      emit('settings-changed', settings)
      return later(settings, 60)
    case 'set_westplay_open':
      westplayOpen = Boolean(args?.open)
      return later(undefined, 200)
    case 'cancel_map_preparation': {
      const job = [...previewJobs.values()].find((job) => job.id === args?.taskId)
      if (!job) return later(false)
      job.state = { state: 'cancelled' }
      map = previewJobs.get('ets2:profiles/57657374')!.state
      return later(true)
    }
    case 'prepare_maps':
    case 'prepare_maps_again': {
      console.info('prepare_maps_again', args)
      const targets = args?.targets as string[]
      if (!targets?.length || targets.some((target) => !previewJobs.has(target)))
        throw new Error('Choose map targets explicitly')
      for (const target of targets)
        previewJobs.set(target, {
          id: `preview-${++previewSequence}`,
          state: { state: 'building', done: 0, stage: 'reading' },
        })
      map = previewJobs.get('ets2:profiles/57657374')!.state
      return later(undefined, 300)
    }
    case 'youtube_check':
    case 'apple_music_check':
    case 'bilibili_check':
    case 'ximalaya_check':
    case 'douyin_check':
    case 'hongguo_check':
    case 'netease_check':
      return later(undefined)
    case 'youtube_sign_in':
      signIn('youtube')
      return later(undefined)
    case 'apple_music_sign_in':
      signIn('appleMusic')
      return later(undefined)
    case 'bilibili_sign_in':
      signIn('bilibili')
      return later(undefined)
    case 'ximalaya_sign_in':
      signIn('ximalaya')
      return later(undefined)
    case 'douyin_sign_in':
      signIn('douyin')
      return later(undefined)
    case 'hongguo_sign_in':
      signIn('hongguo')
      return later(undefined)
    case 'netease_sign_in':
      signIn('netease')
      return later(undefined)
    case 'open_support_page':
      window.open('https://kreosus.com/enes-less', '_blank', 'noopener')
      return later(undefined)
    case 'open_social':
      window.open(
        args?.site === 'youtube'
          ? 'https://www.youtube.com/@tyraness'
          : args?.site === 'patreon'
            ? 'https://www.patreon.com/c/westmods'
            : 'https://discord.com/invite/Jt34SmwU6',
        '_blank',
        'noopener',
      )
      return later(undefined)
    case 'app_log_place':
      return later('C:\\Users\\Player\\Documents\\WestPlay\\logs\\app.log')
    case 'youtube_sign_out':
      setTimeout(() => {
        accounts.youtube = false
        emit('host-status', status())
      }, 1200)
      return later(undefined)
    case 'apple_music_sign_out':
      setTimeout(() => {
        accounts.appleMusic = false
        emit('host-status', status())
      }, 1200)
      return later(undefined)
    case 'bilibili_sign_out':
      setTimeout(() => {
        accounts.bilibili = false
        emit('host-status', status())
      }, 1200)
      return later(undefined)
    case 'ximalaya_sign_out':
      setTimeout(() => {
        accounts.ximalaya = false
        emit('host-status', status())
      }, 1200)
      return later(undefined)
    case 'douyin_sign_out':
      setTimeout(() => {
        accounts.douyin = false
        emit('host-status', status())
      }, 1200)
      return later(undefined)
    case 'hongguo_sign_out':
      setTimeout(() => {
        accounts.hongguo = false
        emit('host-status', status())
      }, 1200)
      return later(undefined)
    case 'netease_sign_out':
      setTimeout(() => {
        accounts.netease = false
        emit('host-status', status())
      }, 1200)
      return later(undefined)
    case 'uninstall_from_game':
      return later(
        { plugin: { state: 'installed' }, modError: null, profilesChanged: 1, profilesFailed: 0, done: true },
        1400,
      )
    case 'remove_data':
      // The maps and the sign-ins going take a while: the red button turns meanwhile.
      return later(undefined, 2500)
    case 'leave_pc':
      // The app would quit: the preview starts over, at the onboarding.
      setTimeout(() => location.assign('/?onboarding'), 400)
      return later(undefined)
    case 'companion_ready':
    case 'room_held':
      return later(undefined, 0)
    case 'customize_list':
      return later(structuredClone(custom), 150)
    case 'add_wallpapers': {
      // A folder or pictures: the same here.
      // The picker closes, then the files take a while.
      setTimeout(() => emit('customize-adding', null), 400)
      const name = `Sample ${custom.wallpapers.length + 1}`
      custom.wallpapers.push({ id: `custom:${name}`, name, dark: 'westplay.png', light: 'westplay.png' })
      return later<Added>({ added: [name], problems: [{ file: 'notes.txt', reason: 'notAnImage' }] }, 2400)
    }
    case 'add_icon_set': {
      setTimeout(() => emit('customize-adding', null), 400)
      const name = `Icons ${custom.iconSets.length + 1}`
      const music = 'icons/westplay/music.dark.svg'
      custom.iconSets.push({ name, icons: { music: { light: music, dark: music } } })
      return later<Added>({ added: [name], problems: [{ file: 'Spotify Logo.png', reason: 'unknownName' }] }, 2400)
    }
    case 'remove_wallpaper':
      custom.wallpapers = custom.wallpapers.filter((wallpaper) => wallpaper.id !== args?.id)
      if (settings.look.wallpaper === args?.id) setLook({ wallpaper: null })
      return later(undefined)
    case 'remove_icon_set':
      custom.iconSets = custom.iconSets.filter((set) => set.name !== args?.name)
      if (settings.look.iconSet === args?.name) setLook({ iconSet: null })
      return later(undefined)
    case 'online_updates_enabled':
      return later(false)
    case 'update_offer':
    case 'look_for_update':
      return later(null)
    case 'install_update':
      return Promise.reject(new Error('定制版暂不支持在线更新，请手动安装升级'))
    default:
      return Promise.reject(new Error(`preview: no answer for ${command}`))
  }
}
