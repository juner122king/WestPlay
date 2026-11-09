import type { CustomWallpaper, IconSet } from './customize'

/**
 * Messages from the WestPlay host to the cabin page (WebView2 web messages). Mirrors the Rust side:
 * `westplay_shared::Telemetry`, `westplay_shared::TruckInfo`, the screen layout the game draws WestPlay on
 * (an id from crates/shared/screen_layouts.txt), and the app's dev commands.
 */

export interface Telemetry {
  x: number
  y: number
  z: number
  /** Turns (0..1), 0 = north. */
  heading: number
  pitch: number
  roll: number
  /** m/s, negative when reversing. */
  speed: number
  engineRpm: number
  gear: number
  displayedGear: number
  cruiseControlSpeed: number
  /** Litres. */
  fuel: number
  /** km. */
  fuelRange: number
  /** m / s / m/s (0 = no limit known). */
  navigationDistance: number
  navigationTime: number
  navigationSpeedLimit: number
  /** Minutes since day 0, 00:00 (day 0 is a Monday): the player's own time, which a job's times are in. */
  gameTime: number
  /** In a Convoy session, the session's time less the player's own, in-game minutes (0 out of one): the cab's
   * clock shows `gameTime` plus this ([`cabClock`]). */
  multiplayerTimeOffset: number
  localScale: number
  dashboardBacklight: number
  electricEnabled: boolean
  engineEnabled: boolean
  parkingBrake: boolean
  lowBeam: boolean
  highBeam: boolean
  leftBlinker: boolean
  rightBlinker: boolean
  paused: boolean
  nextRestStop?: number
  cargoDamage?: number
  wearEngine?: number
  wearTransmission?: number
  wearCabin?: number
  wearChassis?: number
  wearWheels?: number
  wearTrailerChassis?: number
  wearTrailerWheels?: number
  wearTrailerBody?: number
  brakeAirPressure?: number
  brakeAirPressureWarning?: boolean
}

/** The time the cab's clock shows (minutes since day 0, 00:00): the game's, or in a Convoy session the
 * session's, shifted by `shift` minutes, the time zone where the truck is with the profile's time zones on
 * (the cab's `clockShift`, cabin/state/timeZone.ts: an hour on in Finland, an hour back in the UK).
 * Everything shown as a time goes by it; whether a job is late, by `gameTime`. */
export function cabClock(telemetry: Telemetry, shift: number): number {
  // A telemetry without it (none sent yet) is out of a session.
  return telemetry.gameTime + (telemetry.multiplayerTimeOffset || 0) + shift
}

export interface TruckInfo {
  /** e.g. "daf" */
  brandId: string
  /** Display brand, localized by the game, e.g. "DAF". */
  brand: string
  /** Model id, e.g. "vehicle.daf.2021". */
  id: string
  /** Display model name, localized by the game, e.g. "XG+". */
  name: string
}

export interface SemaphoreInfo {
  x: number
  y: number
  z: number
  /** Turns (0..1), 0 = north, clockwise. */
  heading: number
  /** 0 = Green, 1 = Yellow, 2 = Red, 3 = Red+Amber, 4 = Off. */
  state: number
  /** Seconds left until phase change. */
  countdown: number
  /** Total phase duration in seconds. */
  duration: number
}

/** The player's job (`westplay_shared::JobInfo`): names localized by the game. */
export interface JobInfo {
  /** There is a job. */
  active: boolean
  /** The cargo is on: delivering it (otherwise on the way to pick it up). */
  cargoLoaded: boolean
  /** A special transport (no companies). */
  special: boolean
  cargo: string
  /** kg. */
  cargoMass: number
  sourceCity: string
  sourceCompany: string
  destinationCity: string
  destinationCompany: string
  /** When the delivery window ends: minutes since day 0, 00:00 (as `Telemetry.gameTime`). */
  deliveryTime: number
  plannedDistanceKm: number
  income: number
}

/** What a keybind does: the music's volume a step up or down, or it paused or played on; or, a volume key held
 * (two seconds: owner 2026-11-03), the next song or the one before (or the song's start, past its first seconds). */
export type KeybindAction = 'volumeUp' | 'volumeDown' | 'playPause' | 'nextTrack' | 'previousTrack'

export type HostMessage =
  | { type: 'telemetry'; data: Telemetry }
  | { type: 'truck'; data: TruckInfo }
  | { type: 'job'; data: JobInfo }
  /** `null` until the game has drawn a WestPlay screen. Checked against the known ids on arrival. */
  | { type: 'screen'; layout: string | null }
  /** The settings the page applies: whether the truck's own strip stays beside WestPlay
   * (`westplay_host::settings::TruckStrip`), the wallpaper (`null`: none chosen yet) and the player's icon set
   * (`null`: WestPlay's own). Sent as the page loads and whenever they change. */
  | {
      type: 'settings'
      truckStrip: string
      wallpaper?: string | null
      iconSet?: string | null
      /** Light or dark icons, or as the screen is (`IconStyle`). */
      iconStyle?: string
      /** Whether the map's buildings rise from it. */
      buildings?: boolean
      /** Whether its roads rise to their real heights. */
      roads?: boolean
      /** The player's own tone curve (Settings › Equalizer), and whether it plays (Custom) or not (Recommended). */
      equalizer?: Equalizer
      equalizerCustom?: boolean
      /** The language chosen in the companion (a game code, `de_de`); `null`: the game's. */
      language?: string | null
    }
  /** The player's own wallpapers and icon sets (shared/customize.ts), their files at `CABIN_FILES`. */
  | { type: 'customize'; wallpapers: CustomWallpaper[]; iconSets: IconSet[] }
  /** The music's spectrum as it plays, while the page asks for it (`spectrum`): bars from the lows to the
   * highs, spaced by octaves, each 0 (silent) to 255; all 0 when it stops. */
  | { type: 'spectrum'; bars: number[] }
  /** Whether the host draws the screen's cursor (into the frames the game takes, where the mouse is at once), or
   * the page draws its own (crates/host cursor.rs). */
  | { type: 'cursor'; host: boolean }
  /** The cities whose garages the player owns, and their headquarters', from their latest save. */
  | { type: 'garages'; owned: string[]; headquarters: string | null }
  /** The game's answer to the page's `route` request `id`. */
  | { type: 'routeAnswer'; id: number; answer: RouteAnswer }
  /** WestPlay's own routes for the page's `routes` request `id` (none: no road graph, or no way there). */
  | { type: 'routes'; id: number; routes: PlannedRoute[] }
  /** What route `index` offered for the page's `routes` request `id` is drawn from, read from the game's files as the
   * game's route is (`route` and `routePaths`): its map nodes, `[x, z, forward x, forward z]`, the ways through its
   * junctions and how far right of its way it runs. Each as it's read: one across the map takes seconds. */
  | {
      type: 'offeredWays'
      id: number
      index: number
      nodes: [number, number, number, number][]
      paths: [number, [number, number][]][]
      shifts: [number, number][]
    }
  /** Whether the game's GPS follows the route picked (`follow` request `id`): `answer` "ownWay" when the
   * game takes another way however held, else the game's answer. */
  | { type: 'followed'; id: number; follows: boolean; answer: string }
  /** What stopping at each place of the page's `detours` request `id` adds to the trip (seconds on the map's
   * ground, in the order asked; `null`: not known). */
  | { type: 'detours'; id: number; seconds: (number | null)[] }
  /** What the player typed on their own keyboard, oldest first (a paste comes as its text). */
  | { type: 'typed'; events: TypedEvent[] }
  /** Whether the player's own keyboard types into the field selected. */
  | { type: 'typingState'; state: TypingState }
  /** Whether the player plays on a map by HVT, which WestPlay doesn't allow; and the game's language. */
  | { type: 'mapBlock'; hvt: boolean; language: string | null }
  /** Whether the player's profile has the game's time zones on (its clock the time where the truck is). */
  | { type: 'timeZones'; on: boolean }
  /** The player's profile's units (its `g_mph`): miles and mph (`true`), or kilometres and km/h; `null` when its
   * options don't say. */
  | { type: 'units'; mph: boolean | null }
  /** The game's GPS route: its map nodes in order, `[x, z, forward x, forward z, distance left, height]` (metres;
   * the road's direction, either way along it; the distance left from the node to the destination, as the
   * game counts distances). `null` without a route. */
  | { type: 'route'; id: number | null; nodes: [number, number, number, number, number, number][] | null }
  /** The ways through the route's junctions (the junction's own lanes, from the game's files): each from
   * the node it starts at to the next, as `[x, z]` points; and the turns there, by the same node: the
   * turn (`right`, `exit-left`, `roundabout`…), its angle (degrees, right positive) and a roundabout's
   * exit; and how far to the right of its way the route runs at its nodes on roads (metres: on the
   * carriageway it drives on, where a road is drawn as two), by node. */
  | {
      type: 'routePaths'
      id: number
      paths: [number, [number, number][]][]
      maneuvers: [number, string, number, number | null][]
      shifts: [number, number][]
    }
  /** The truck's progress along the route: the index of the map node ahead of it. */
  | { type: 'routeNext'; next: number }
  /** Open (or close) WestPlay on the truck's screen: the companion window's switch. */
  | { type: 'westplay'; open: boolean }
  /** The game's weather (`null` when it can't be read: no game, or a game version whose weather the host
   * doesn't know). */
  | { type: 'weather'; weather: GameWeather | null }
  /** How YouTube's player plays (`null`: YouTube isn't running). */
  | { type: 'youtube'; state: YouTubeState | null }
  /** YouTube's answer to the page's question `id` (a `youtube` command with an `id`). */
  | ({ type: 'youtubeAnswer'; id: number } & YouTubeAnswer)
  /** Whether the game's window shows (`false`: minimised, or on another desktop; in front or not: Lossless
   * Scaling's window is in front of it). */
  | { type: 'gameShown'; shown: boolean }
  /** The player's stops along the route `id`: their map nodes' indices in it, ascending (not WestPlay's own
   * waypoints, nor the destination). */
  | { type: 'routeStops'; id: number | null; stops: number[] }
  /** The game's menu gone while it's still paused: its still picture before the truck moves on. */
  | { type: 'menuGone'; gone: boolean }
  /** A keybind of the player's (the companion's Controls), pressed in the game. */
  | { type: 'keybind'; action: KeybindAction }
  /** Whether the game runs. As it closes, the host closes the web players; the page powers off and forgets
   * its last telemetry. */
  | { type: 'game'; running: boolean }
  /** Whether the game runs under TruckersMP (the page shows its other players, from TruckersMP's map feed). */
  /** Whether the game runs under TruckersMP, and which game it is (`null`: not said yet). */
  | { type: 'truckersmp'; on: boolean; game?: 'ets2' | 'ats' | null }
  /** Under TruckersMP, the players around the player from its SDK (the plugin's): its game server's id, the
   * player's own number on it, and each other player's number, world x and z (m) and heading (turns); `null`s
   * and none when there are none to tell. */
  | { type: 'nearby'; server: number | null; local: number | null; players: [number, number, number, number][] }
  /** Traffic light semaphores around the player: coordinates, heading, state and countdown timer. */
  | { type: 'semaphores'; data: SemaphoreInfo[] }
  /** Whether YouTube is signed in, and the picture to show for the player: nothing else of the account. */
  | { type: 'youtubeAccount'; signedIn: boolean; avatar: string | null }
  /** Whether Google's sign-in window is open on the PC's desktop. */
  | { type: 'youtubeSignIn'; open: boolean }
  /** The map the cab shows: its folder in WestPlay's maps (served at `https://westplay.maps/`), and when it
   * was built; `null` for none (none built yet). */
  | { type: 'map'; folder: string | null; built: number | null }
  /** Bilibili: whether it's signed in and playing, and whether its sign-in QR window is open. */
  | { type: 'bilibili'; signedIn: boolean | null; playing: boolean | null; signingIn: boolean }
  | ({ type: 'bilibiliAnswer'; id: number; failed?: boolean; error?: string } & Partial<BilibiliAnswers>)
  | { type: 'bilibiliPlayback'; playback: BilibiliPlayback | null }
  /** Ximalaya: whether it's signed in and playing, and whether its sign-in QR window is open. */
  | { type: 'ximalaya'; signedIn: boolean | null; playing: boolean | null; signingIn: boolean }
  | ({ type: 'ximalayaAnswer'; id: number; failed?: boolean; error?: string } & Partial<XimalayaAnswers>)
  | { type: 'ximalayaPlayback'; playback: XimalayaPlayback | null }
  /** NetEase Cloud Music: whether it's signed in and playing, and whether its sign-in QR window is open. */
  | { type: 'netease'; signedIn: boolean | null; playing: boolean | null; signingIn: boolean }
  | ({ type: 'neteaseAnswer'; id: number; failed?: boolean; error?: string } & Partial<NeteaseAnswers>)
  | { type: 'neteasePlayback'; playback: NeteasePlayback | null }
  /** Douyin: whether it's signed in and playing, and whether its sign-in QR window is open. */
  | { type: 'douyin'; signedIn: boolean | null; playing: boolean | null; signingIn: boolean }
  | ({ type: 'douyinAnswer'; id: number; failed?: boolean; error?: string } & Partial<DouyinAnswers>)
  | { type: 'douyinPlayback'; playback: DouyinPlayback | null }
  /** Hongguo: whether it's signed in and playing, and whether its sign-in QR window is open. */
  | { type: 'hongguo'; signedIn: boolean | null; playing: boolean | null; signingIn: boolean }
  | ({ type: 'hongguoAnswer'; id: number; failed?: boolean; error?: string } & Partial<HongguoAnswers>)
  | { type: 'hongguoPlayback'; playback: HongguoPlayback | null }
  /** Apple Music's web player: whether it's signed in and playing (`null`: not running), and whether its
   * sign-in window is open on the PC. */
  | {
      type: 'appleMusic'
      signedIn: boolean | null
      playing: boolean | null
      signingIn: boolean
      /** The account's picture (its Apple Music profile's), if it has one. */
      avatar: string | null
    }
  /** Apple Music's answer to the Music app's question `id` (`failed`: Apple Music didn't answer). */
  | ({ type: 'appleMusicAnswer'; id: number; failed?: boolean } & Partial<AppleMusicAnswers>)
  /** What Apple Music plays; `null`: nothing. */
  | { type: 'appleMusicPlayback'; playback: AppleMusicPlayback | null }
  /** The game's music folder (Player): where it is (`null`: the game's folder isn't known) and its songs. */
  | { type: 'musicFolder'; folder: string | null; songs: PlayerSong[] }
  /** What Player plays; `null`: nothing. */
  | { type: 'playerPlayback'; playback: PlayerPlayback | null }

/** The game's weather: the one there is and the one it's turning to (the same once it has); in game minutes,
 * how long until the game changes it next; and how wet the roads are, percent. Each of the last two `null`
 * (or missing, from an older host) when the host can't read it. */
export interface GameWeather {
  now: Sky
  coming: Sky
  changeIn?: number | null
  wetness?: number | null
}

/** One of the game's two weathers. */
export type Sky = 'clear' | 'rain'

/** Messages from the cabin page to the host. */
/** The players' tone controls, as a car stereo's: bass, mid and treble, in dB each (`EQUALIZER_MOST` either way;
 * the host's `speakers::Equalizer`). */
export interface Equalizer {
  bass: number
  mid: number
  treble: number
}

export const EQUALIZER_BANDS = ['bass', 'mid', 'treble'] as const satisfies readonly (keyof Equalizer)[]

/** How far each band goes, dB (the host's `Equalizer::MOST`). */
export const EQUALIZER_MOST = 6

export const FLAT: Equalizer = { bass: 0, mid: 0, treble: 0 }

/** The tone as the host may send it: each band a whole number of dB within the range (anything else flat). */
export function toEqualizer(value: unknown): Equalizer {
  const told = (value ?? {}) as Partial<Record<keyof Equalizer, unknown>>
  const band = (db: unknown) =>
    typeof db === 'number' && Number.isFinite(db)
      ? Math.max(-EQUALIZER_MOST, Math.min(EQUALIZER_MOST, Math.round(db)))
      : 0
  return { bass: band(told.bass), mid: band(told.mid), treble: band(told.treble) }
}

export type PageMessage =
  | { type: 'ready' }
  /** A startup stage reached (the boot screens shown), for the host's startup log. */
  | { type: 'startup'; stage: string }
  /** Whether WestPlay is open on the truck's screen (or the truck's original screen shows): posted as the
   * page connects and whenever it changes, for the companion window. */
  | { type: 'westplay'; open: boolean }
  /** The wallpaper chosen in Settings (wallpapers.ts), kept with WestPlay's settings (the companion's too). */
  | { type: 'wallpaper'; id: string }
  /** The Vehicle Bar (the truck's strip) kept or not, chosen in Settings › Appearance, kept the same way. */
  | { type: 'truckStrip'; strip: 'auto' | 'off' }
  /** The players' tone, set in Settings › Equalizer: the player's curve, and whether it plays (Custom) or the
   * speakers as tuned (Recommended); kept with WestPlay's settings and played by every player. */
  | ({ type: 'equalizer'; custom: boolean } & Equalizer)
  /** The music's spectrum wanted (Settings › Equalizer open) or not: the host answers `spectrum` as it plays. */
  | { type: 'spectrum'; on: boolean }
  /** Whether what's under the cursor is light: the host draws it dark there. */
  | { type: 'cursorLight'; light: boolean }
  /** Where the host's cursor may be seen (page pixels): the CarPlay area, its corners round as its black ones, a
   * little inside the frame's edge (shell/cursorArea.ts). */
  | { type: 'cursorArea'; area: { left: number; top: number; right: number; bottom: number; radius: number } }
  /** A change to the game's GPS route (Maps' search), at a map node (its uid, hex) for going or adding a
   * stop; the host answers with `routeAnswer` and the same `id`. */
  | { type: 'route'; id: number; action: RouteAction; node?: string }
  /** The routes to a map node (its uid, hex; or to `also`, if a route comes to that last) from where the truck is, to
   * offer before Go (Directions). */
  | { type: 'routes'; id: number; node: string; also?: string }
  /** Go along the route at `index` of those offered for `routes` request `id`: the host hands it to the
   * game's GPS and answers `followed`. */
  | { type: 'follow'; id: number; index: number }
  /** What stopping at each of these map nodes (uids, hex) would add to the trip the game's route makes. */
  | { type: 'detours'; id: number; nodes: string[] }
  /** The text field selected, a number that changes with every selection (0: none), for the player's own
   * keyboard to type into while the truck stands still. */
  | { type: 'typing'; selection: number }
  /** A command for YouTube's player, or a question for YouTube (answered with `youtubeAnswer`). */
  | { type: 'youtube'; command: YouTubeCommand }
  /** A command for Bilibili's web player (`westplay_host::bilibili::Command`). */
  | { type: 'bilibili'; command: BilibiliCommand }
  /** A command for Ximalaya's web player (`westplay_host::ximalaya::Command`). */
  | { type: 'ximalaya'; command: XimalayaCommand }
  /** A command for NetEase Cloud Music's web player (`westplay_host::netease::Command`). */
  | { type: 'netease'; command: NeteaseCommand }
  /** A command for Douyin's web player (`westplay_host::douyin::Command`). */
  | { type: 'douyin'; command: DouyinCommand }
  /** A command for Hongguo's web player (`westplay_host::hongguo::Command`). */
  | { type: 'hongguo'; command: HongguoCommand }
  /** A command for Apple Music's web player (`westplay_host::apple_music::Command`). */
  | { type: 'appleMusic'; command: AppleMusicCommand }
  /** A command for Player's own player (`westplay_host::music_folder::Command`). */
  | { type: 'player'; command: PlayerCommand }

/** A song of the game's music folder (`westplay_host::music_folder::Song`): its file's name, and what its tags
 * say (none on a file without them): title, artist, length (seconds; 0: not known), cover (a file at
 * `https://westplay.music-covers/`). */
export interface PlayerSong {
  file: string
  title?: string
  artist?: string
  seconds: number
  cover?: string
}

export type PlayerRepeat = 'off' | 'all' | 'one'

/** What Player plays (`westplay_host::music_folder::Playback`): the song (its file), playing or not (loading:
 * asked to, its sound not come yet), where and how long (seconds), the options, the volume (0 to 1), and where
 * it is in the songs playing. */
export interface PlayerPlayback {
  file: string
  playing: boolean
  loading: boolean
  position: number
  duration: number
  shuffle: boolean
  repeat: PlayerRepeat
  volume: number | null
  index: number
  count: number
}

/** What Player asks of its player: the folder's songs (by file name, in its order) from the one at `index`
 * (shuffled: from any when there's no index), or play on (`play` alone); its controls. */
export type PlayerCommand =
  | { action: 'play'; files?: string[]; index?: number; shuffle?: boolean }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; seconds: number }
  | { action: 'volume'; percent: number }
  | { action: 'shuffle'; on: boolean }
  | { action: 'repeat'; mode: PlayerRepeat }

/** What the Bilibili app asks of Bilibili's web player (`westplay_host::bilibili::Command`). */
export type BilibiliCommand =
  | { action: 'start' }
  | { action: 'signIn' }
  | { action: 'signOut' }
  | { action: 'play'; video?: BilibiliVideo; page?: number }
  | { action: 'pause' }
  | { action: 'stop' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; seconds: number }
  | { action: 'volume'; percent: number }
  | { action: 'quality'; quality: number }
  | { action: 'rate'; rate: number }
  | { action: 'danmaku'; on: boolean }
  | { action: 'show'; x: number; y: number; width: number; height: number; crop?: boolean }
  | { action: 'crop'; on: boolean }
  | { action: 'hide' }
  | { action: 'ask'; id: number; question: BilibiliQuestion }

export type BilibiliQuestion =
  | { ask: 'search'; query: string; page?: number; filter?: 'videos' | 'users' }
  | { ask: 'suggest'; query: string }
  | { ask: 'popular'; page?: number; freshIdx?: number }
  | { ask: 'recommend'; page?: number; freshIdx?: number }
  | { ask: 'feed'; which?: 'recommend' | 'popular' | 'dynamic'; page?: number; freshIdx?: number }
  | { ask: 'channel'; mid: string; page?: number }
  | { ask: 'playlist'; bvid: string }
  | { ask: 'related'; bvid: string }
  | { ask: 'subscribe'; mid: string; on: boolean }
  | { ask: 'live'; parentAreaId?: number; page?: number }
  | { ask: 'movie'; seasonType?: number; order?: number; page?: number }

export interface BilibiliVideo {
  bvid: string
  title: string
  author: string
  mid?: string
  cid?: number
  artwork?: string | null
  duration?: number
  playCount?: string
  pubdate?: string
  url?: string
  roomId?: number
  isLive?: boolean
  seasonId?: number
  epId?: number
}

export interface BilibiliMovieItem {
  seasonId: number
  title: string
  subTitle?: string
  cover?: string | null
  badge?: string
  score?: string
  indexShow?: string
  order?: string
  link?: string
  epId?: number
}

export interface BilibiliLiveRoom {
  roomId: number
  uid: number
  title: string
  uname: string
  avatar?: string | null
  cover?: string | null
  areaName?: string
  parentAreaName?: string
  online?: string
  isFollowing?: boolean
}

export interface BilibiliChannel {
  mid: string
  name: string
  avatar?: string | null
  banner?: string | null
  sign?: string
  fans?: string
  videos?: string
  subscribed?: boolean | null
}

export interface BilibiliDynamicAuthor {
  mid: string
  name: string
  avatar?: string | null
  pubTime: string
  pubAction?: string | null
}

export interface BilibiliDynamicItem {
  id: string
  author: BilibiliDynamicAuthor
  desc?: string | null
  video?: BilibiliVideo | null
  origAuthor?: string | null
  origDesc?: string | null
}

export interface BilibiliVideoPage {
  cid: number
  page: number
  part: string
  duration?: number
}

export interface BilibiliQualityOption {
  quality: number
  label: string
}

export interface BilibiliPlayback {
  bvid?: string | null
  title: string
  artist: string
  artwork?: string | null
  mid?: string | null
  duration: number
  position: number
  status: string
  quality?: number
  qualities?: BilibiliQualityOption[]
  rate?: number
  danmaku?: boolean
  page?: number
  pages?: BilibiliVideoPage[]
  isLive?: boolean
  roomId?: number
  seasonId?: number
  epId?: number
}

export interface BilibiliAnswers {
  videos?: BilibiliVideo[]
  dynamics?: BilibiliDynamicItem[]
  liveRooms?: BilibiliLiveRoom[]
  followingLiveRooms?: BilibiliLiveRoom[]
  movies?: BilibiliMovieItem[]
  channels?: BilibiliChannel[]
  channel?: BilibiliChannel | null
  suggestions?: string[]
  pages?: BilibiliVideoPage[]
  hasMore?: boolean
  failed?: boolean
  error?: string
}

/** What the Ximalaya app asks of Ximalaya's web player (`westplay_host::ximalaya::Command`). */
export type XimalayaCommand =
  | { action: 'start' }
  | { action: 'signIn' }
  | { action: 'signOut' }
  | { action: 'play'; track?: XimalayaTrack }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; seconds: number }
  | { action: 'volume'; percent: number }
  | { action: 'ask'; id: number; question: XimalayaQuestion }

export type XimalayaQuestion =
  | { ask: 'search'; query: string }
  | { ask: 'recommend' }
  | { ask: 'category'; category: string }
  | { ask: 'albumTracks'; albumId: string }

export interface XimalayaTrack {
  id: string
  title: string
  artist: string
  album?: string
  artwork?: string
  duration?: number
  url?: string
}

export interface XimalayaAlbum {
  id: string
  title: string
  artist: string
  artwork?: string
  description?: string
}

export interface XimalayaPlayback {
  title: string
  artist: string
  artwork?: string
  duration: number
  position: number
  status: string
}

export interface XimalayaAnswers {
  tracks?: XimalayaTrack[]
  albums?: XimalayaAlbum[]
}

/** What the NetEase Cloud Music app asks of NetEase's web player (`westplay_host::netease::Command`). */
export type NeteaseCommand =
  | { action: 'start' }
  | { action: 'signIn' }
  | { action: 'signOut' }
  | { action: 'play'; track?: NeteaseTrack }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; seconds: number }
  | { action: 'volume'; percent: number }
  | { action: 'ask'; id: number; question: NeteaseQuestion }

export type NeteaseQuestion =
  | { ask: 'search'; query: string }
  | { ask: 'recommend' }
  | { ask: 'top' }
  | { ask: 'chart'; id: string }
  | { ask: 'userPlaylists' }
  | { ask: 'playlistTracks'; playlistId: string }
  | { ask: 'lyrics'; id: string }

export interface NeteasePlaylist {
  id: string
  name: string
  coverImgUrl?: string
  trackCount: number
}

export interface NeteaseTrack {
  id: string
  title: string
  artist: string
  album?: string
  artwork?: string
  duration?: number
  url?: string
}

export interface NeteasePlayback {
  title: string
  artist: string
  artwork?: string
  duration: number
  position: number
  status: string
}

export interface NeteaseAnswers {
  songs?: NeteaseTrack[]
  playlists?: NeteasePlaylist[]
  lyric?: string
}

/** What the Douyin app asks of Douyin's web player (`westplay_host::douyin::Command`). */
export type DouyinCommand =
  | { action: 'start' }
  | { action: 'signIn' }
  | { action: 'signOut' }
  | { action: 'play'; video?: DouyinVideo }
  | { action: 'pause' }
  | { action: 'toggle' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; seconds: number }
  | { action: 'volume'; percent: number }
  | { action: 'like'; id?: string }
  | { action: 'show'; x: number; y: number; width: number; height: number; crop?: boolean }
  | { action: 'crop'; on: boolean }
  | { action: 'hide' }
  | { action: 'ask'; id: number; question: DouyinQuestion }

export type DouyinQuestion = { ask: 'feed' } | { ask: 'search'; query: string }

export interface DouyinVideo {
  id: string
  title: string
  author: string
  avatar?: string
  artwork?: string
  duration?: number
  url?: string
  liked?: boolean
  likes?: number
  comments?: number
  music?: string
}

export interface DouyinPlayback {
  id?: string
  title: string
  artist: string
  author?: string
  artwork?: string
  duration: number
  position: number
  status: string
  liked?: boolean
}

export interface DouyinAnswers {
  videos?: DouyinVideo[]
}

/** What the Hongguo app asks of Hongguo's web player (`westplay_host::hongguo::Command`). */
export type HongguoCommand =
  | { action: 'start' }
  | { action: 'signIn' }
  | { action: 'signOut' }
  | { action: 'play'; drama?: HongguoDrama; episode?: number }
  | { action: 'pause' }
  | { action: 'toggle' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; seconds: number }
  | { action: 'volume'; percent: number }
  | { action: 'selectEpisode'; episode: number }
  | { action: 'setSpeed'; speed: number }
  | { action: 'toggleAutoNext' }
  | { action: 'show'; x: number; y: number; width: number; height: number; crop?: boolean }
  | { action: 'crop'; on: boolean }
  | { action: 'hide' }
  | { action: 'ask'; id: number; question: HongguoQuestion }

export type HongguoQuestion =
  { ask: 'catalog' } | { ask: 'featured' } | { ask: 'search'; query: string } | { ask: 'episodes'; dramaId: string }

export interface HongguoDrama {
  id: string
  title: string
  category?: string
  author?: string
  cover?: string
  totalEpisodes: number
  episodesCount?: number
  synopsis?: string
  description?: string
}

export interface HongguoEpisode {
  episode: number
  title: string
  duration?: number
  url?: string
}

export interface HongguoPlayback {
  dramaId?: string
  title: string
  dramaTitle?: string
  artist?: string
  author?: string
  episodeTitle?: string
  episode?: number
  episodeNumber?: number
  totalEpisodes?: number
  artwork?: string
  duration: number
  position: number
  status: string
  speed?: number
  autoNext?: boolean
}

export interface HongguoAnswers {
  dramas?: HongguoDrama[]
  episodes?: HongguoEpisode[]
}

/** What the Music app asks of Apple Music's web player (`westplay_host::apple_music::Command`), run hidden by
 * the host: its sign-in (MusicKit's own window, on the PC), a question (answered with `appleMusicAnswer` and
 * the same `id`), and the player's controls. Ids are Apple Music's type and its own id: `albums:1440…`. */
export type AppleMusicCommand =
  /** Run (hidden), saying whether it's signed in (the Music app opened). */
  | { action: 'start' }
  | { action: 'signIn' }
  | { action: 'signOut' }
  | { action: 'ask'; id: number; question: AppleMusicQuestion }
  /** An album, playlist, station, artist or song (`id`), or a list of songs (`songs`), from `index`; with
   * neither, play on. */
  | { action: 'play'; id?: string; songs?: string[]; index?: number; shuffle?: boolean }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; seconds: number }
  | { action: 'volume'; percent: number }
  | { action: 'shuffle'; on: boolean }
  | { action: 'repeat'; mode: AppleMusicRepeat }
  /** A song of the queue, `offset` songs on. */
  | { action: 'jump'; offset: number }
  | { action: 'favorite'; id: string; on: boolean }
  | { action: 'add'; id: string }

export type AppleMusicRepeat = 'off' | 'all' | 'one'
export type AppleMusicShelf = 'recent' | 'playlists' | 'artists' | 'albums' | 'songs'

/** A card or row: what it is, its name, who it's by (an album's artist, a playlist's curator, a station's
 * tagline), Apple's editors' note, its cover (and a wide picture, Apple's editors' own) and the cover's
 * colour. */
export interface AppleMusicItem {
  id: string
  /** A folder: of the Library's playlists. */
  kind: 'album' | 'playlist' | 'artist' | 'station' | 'song' | 'curator' | 'folder'
  name: string
  by: string
  note: string
  image: string | null
  wide: string | null
  color: string
  explicit: boolean
  /** A live station (Apple Music 1…). */
  live: boolean
  /** A big card's label ("UPDATED PLAYLIST"). */
  label?: string
  /** A favourite (the Library's lists say). */
  favorite?: boolean
}

export interface AppleMusicTrack {
  id: string
  name: string
  artist: string
  album: string
  albumId: string | null
  artistId: string | null
  image: string | null
  color: string
  /** Seconds. */
  duration: number
  explicit: boolean
  /** Its number on its album. */
  number: number | null
  /** A favourite (Apple Music says, signed in, for the song playing). */
  favorite?: boolean
}

export interface AppleMusicSection {
  title: string
  /** Big cards with the editors' pictures, a shelf of covers, what was played lately, or songs. */
  style: 'hero' | 'shelf' | 'recent' | 'songs'
  items: AppleMusicItem[]
  songs: AppleMusicTrack[]
}

/** Home, New, Radio or a category's page. */
export interface AppleMusicPage {
  sections: AppleMusicSection[]
}

export interface AppleMusicCollection {
  item: AppleMusicItem
  description: string
  genre: string
  year: number | null
  tracks: AppleMusicTrack[]
}

export interface AppleMusicArtist {
  item: AppleMusicItem
  top: AppleMusicTrack[]
  sections: AppleMusicSection[]
}

export interface AppleMusicResults {
  top: AppleMusicItem[]
  songs: AppleMusicTrack[]
  artists: AppleMusicItem[]
  albums: AppleMusicItem[]
  playlists: AppleMusicItem[]
  stations: AppleMusicItem[]
}

export interface AppleMusicLibrary {
  items: AppleMusicItem[]
  songs: AppleMusicTrack[]
  /** The sorts the list has (Apple Music's own, named in the cab's language; a playlist's unnamed: the cab
   * names them), and the one it's in. */
  sorts: { id: string; label: string }[]
  sort: string | null
}

/** What the Music app asks Apple Music: Home (signed in), New, Radio, Search's categories, a category's page,
 * a search, an album's or playlist's page, an artist's, a list of the Library. */
export type AppleMusicQuestion =
  | { ask: 'home' }
  | { ask: 'new' }
  | { ask: 'radio' }
  | { ask: 'browse' }
  | { ask: 'curator'; id: string }
  | { ask: 'search'; query: string }
  | { ask: 'collection'; id: string }
  | { ask: 'artist'; id: string }
  | { ask: 'library'; shelf: AppleMusicShelf; sort?: string; folder?: string; language?: string }
  | { ask: 'lyrics'; id: string }

export interface AppleMusicAnswers {
  home: AppleMusicPage
  new: AppleMusicPage
  radio: AppleMusicPage
  browse: AppleMusicItem[]
  curator: AppleMusicPage
  search: AppleMusicResults
  collection: AppleMusicCollection
  artist: AppleMusicArtist
  library: AppleMusicLibrary
  lyrics: Lyrics
}

/** A song's words, as answered by the music services (`westplay_host::lyrics::Lyrics`): line by line with
 * when each is sung (`synced`; seconds, `end` 0: until the next), where a stanza starts, where they're from,
 * their colours, and whether they're written right to left. No lines: no words for the song. */
export interface Lyrics {
  synced: boolean
  lines: { start: number; end: number; text: string; stanza?: boolean }[]
  provider?: string
  writers?: string[]
  colors?: { background: string; text: string; highlight: string }
  rtl?: boolean
}

/** What Apple Music plays: the song, where from (as the app asked for it), how far (seconds), whether it's
 * the song's 90-second preview (signed out, or no subscription), the options, the volume and what's next. */
export interface AppleMusicPlayback {
  track: AppleMusicTrack | null
  context: { id: string; name: string; kind: AppleMusicItem['kind'] } | null
  playing: boolean
  /** Playing as asked, its sound not come yet (loading, waiting for its stream, seeking): its time still. */
  loading?: boolean
  position: number
  duration: number
  preview: boolean
  shuffle: boolean
  repeat: AppleMusicRepeat
  /** The page's player's volume, 0 to 1. */
  volume: number | null
  next: AppleMusicTrack[]
}

/** What the YouTube app asks of YouTube's player (hidden, under the page) or of YouTube (`westplay_host::
 * youtube::Command`). `show` places the video, in the frame's pixels. */
export type YouTubeCommand =
  | { action: 'load'; video: string; start?: number }
  | { action: 'play' }
  | { action: 'pause' }
  | { action: 'seek'; seconds: number }
  | { action: 'volume'; percent: number }
  | { action: 'captions'; track: string | null }
  | { action: 'quality'; quality: string }
  | { action: 'rate'; rate: number }
  | { action: 'audioTrack'; id: string }
  | { action: 'stableVolume'; on: boolean }
  | { action: 'voiceBoost'; on: boolean }
  | { action: 'show'; x: number; y: number; width: number; height: number; crop?: boolean }
  | { action: 'hide' }
  | { action: 'close' }
  | { action: 'language'; code: string }
  | { action: 'search'; id: number; query: string; more?: string; filter?: 'channels' | 'playlists' }
  | { action: 'playlist'; id: number; playlist: string; more?: string }
  | { action: 'channel'; id: number; channel: string; more?: string }
  | { action: 'subscribe'; id: number; channel: string; on: boolean }
  | { action: 'suggest'; id: number; query: string }
  | { action: 'related'; id: number; video: string }
  | { action: 'feed'; id: number; which: 'home' | 'subscriptions'; more?: string }
  | { action: 'signIn' }
  | { action: 'signOut' }

/** How YouTube's player plays. `state`: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. */
export interface YouTubeState {
  video: string | null
  title: string
  author: string
  live: boolean
  state: number
  /** Seconds. */
  time: number
  duration: number
  volume: number
  ad: boolean
  /** The video's captions (YouTube's id for each: `.en`, `a.en` automatic) and the one shown (`null`: none). */
  captions: { track: string; name: string }[]
  caption: string | null
  /** The qualities the video has, best first (`hd1080`, "1080p60"); the one chosen (`auto`: YouTube's own
   * choice), and the one playing ("720p"). */
  qualities: { quality: string; label: string }[]
  quality: string
  qualityLabel: string
  /** The speeds it can play at and the one it plays at; its audio tracks (none: only its own) and the one
   * playing; YouTube's Stable volume and Voice boost (`null`: the video doesn't offer it). */
  rates: number[]
  rate: number
  audioTracks: { id: string; name: string; original: boolean }[]
  audioTrack: string | null
  stableVolume: boolean | null
  voiceBoost: boolean | null
}

/** A video as the YouTube app lists it; its texts are YouTube's own, in the cabin's language. */
export interface YouTubeVideo {
  video: string
  title: string
  channel: string
  avatar: string | null
  thumbnail: string | null
  /** "13:34"; empty for a live video. */
  duration: string
  /** "17K", "14 Mn" */
  views: string
  /** "2 days ago" */
  age: string
  live: boolean
  /** Its channel's id, to open the channel (absent: not known). */
  channelId?: string
}

/** A channel; its texts are YouTube's ("@LofiGirl", "15.8M subscribers", "468 videos"). */
export interface YouTubeChannel {
  channel: string
  name: string
  avatar: string | null
  banner: string | null
  handle: string
  subscribers: string
  videos: string
  /** Whether the signed-in player is subscribed (`null`: not signed in, or not known). */
  subscribed?: boolean | null
}

/** A playlist; its texts are YouTube's ("13 videos", "2M views"). In a search, `after`: how many of the
 * search's videos come before it. */
export interface YouTubePlaylist {
  playlist: string
  title: string
  channel: string
  channelId?: string
  thumbnail: string | null
  count: string
  views: string
  after: number
}

/** YouTube's answer: videos (and the token for more), suggestions, or that it didn't answer. */
export interface YouTubeAnswer {
  videos?: YouTubeVideo[]
  more?: string | null
  suggestions?: string[]
  /** Channels a search found; the channel a channel's page is. */
  channels?: YouTubeChannel[]
  channel?: YouTubeChannel | null
  /** Playlists a search found; the playlist a playlist's page is. */
  playlists?: YouTubePlaylist[]
  playlist?: YouTubePlaylist | null
  failed?: boolean
}

/** Text typed, or a key with a meaning of its own. */
export type TypedEvent = { text: string } | { key: 'backspace' | 'wordBackspace' | 'enter' | 'escape' }

/** Whether the player's own keyboard types into the field selected: no field selected (`off`), typing, or
 * the keys the game's (`paused`: the truck moved, or the field was selected while it moved). */
export type TypingState = 'off' | 'typing' | 'paused'

/** What the page asks of the game's route: a stop added (before a job's destination), the route to a place
 * alone (not on a job), or no more stops. */
export type RouteAction = 'addStop' | 'go' | 'end'

/** A route WestPlay planned (crates/host planner.rs): what it's planned for, its length (metres) and time
 * (seconds), both on the map's ground (the page gives them in the game's scale), and its line through its
 * map nodes (`[x, z]`, metres). */
export interface PlannedRoute {
  plan: 'fastest' | 'shortest' | 'smallRoads' | 'other'
  length: number
  seconds: number
  line: [number, number][]
}

/** How the game answered: done, or why not (`noAnswer`: no game to ask, or it didn't answer in time;
 * `elevated`: the game runs as administrator, so WestPlay can't see its route, a `followed` answer's). */
export type RouteAnswer =
  'done' | 'alreadyThere' | 'onJob' | 'full' | 'noSuchNode' | 'unsupported' | 'unexpected' | 'noAnswer' | 'elevated'

interface WebViewBridge {
  addEventListener(type: 'message', listener: (event: { data: HostMessage }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: HostMessage }) => void): void
  postMessage(message: PageMessage): void
}

declare global {
  interface Window {
    chrome?: { webview?: WebViewBridge }
  }
}

/** The cabin page as a live demo in the companion's onboarding (`cabin.html?demo`): never the host's page,
 * even inside a WebView2 (the companion's own). See cabin/demo.ts. */
export const IS_DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

/** Whether the page runs inside the WestPlay host (and not in a plain browser preview, nor as the demo). */
export function isInHost(): boolean {
  return !IS_DEMO && typeof window !== 'undefined' && window.chrome?.webview !== undefined
}

/**
 * Calls `listener` for every host message. Returns the unsubscribe function.
 *
 * Subscribing also tells the host the page is ready, so it sends the current state again: anything it
 * sent before this page (re)loaded was lost, and some state (like the truck) is only sent on change.
 */
export function subscribeHostMessages(listener: (message: HostMessage) => void): () => void {
  const webview = typeof window !== 'undefined' ? window.chrome?.webview : undefined
  if (!webview) return () => {}
  const onMessage = (event: { data: HostMessage }) => listener(event.data)
  webview.addEventListener('message', onMessage)
  webview.postMessage({ type: 'ready' })
  return () => webview.removeEventListener('message', onMessage)
}

/** Sends a message to the host (nothing happens in a plain browser preview). */
export function postToHost(message: PageMessage): void {
  window.chrome?.webview?.postMessage(message)
}

/** A truck with no identity (the SDK reports empty strings when there is no truck). */
export function hasTruck(truck: TruckInfo | null): truck is TruckInfo {
  return truck !== null && truck.brandId !== ''
}
