import { call, on } from './bridge'
import type { GameKind } from './setup'
import { useEffect, useState } from 'react'
import { followRound } from './mapRound'

/** Emitted by the Tauri backend about once per second (mirrors `westplay_host::Status`). */
export interface HostStatus {
  webviewVersion: string
  adapter: string | null
  /** The graphics card WestPlay's screen is drawn on, and the game's (`null` until the game runs). */
  cabAdapter: string | null
  gameAdapter: string | null
  /** The PC's graphics cards, the high-performance ones first (mirrors `westplay_host::graphics::Adapter`). */
  adapters: Adapter[]
  framesPerSecond: number
  droppedTotal: number
  gameConnected: boolean
  /** Which game is connected (`null`: none). */
  game: GameKind | null
  screenDrawing: boolean
  /** Whether the truck the player is in is one WestPlay shows in, as the plugin last saw (`null`: not known yet). */
  truckSupported: boolean | null
  /** Whether the game runs as administrator: WestPlay can't read its route, guidance or weather then. */
  gameElevated: boolean
  /** Whether WestPlay is open on the truck's screen (otherwise the truck's original screen shows), as the
   * cabin page last said; `null` until it has. */
  westplayOpen: boolean | null
  /** Whether YouTube is signed in (`null`: not known yet: YouTube hasn't run), and whether Google's sign-in
   * window is open. Nothing else of the account. */
  youtubeSignedIn: boolean | null
  youtubeSigningIn: boolean
  /** Whether Bilibili is signed in (`null`: not known yet), and whether its sign-in window is open. */
  bilibiliSignedIn: boolean | null
  bilibiliSigningIn: boolean
  /** Whether Ximalaya is signed in (`null`: not known yet), and whether its sign-in window is open. */
  ximalayaSignedIn: boolean | null
  ximalayaSigningIn: boolean
  /** Whether Douyin is signed in (`null`: not known yet), and whether its sign-in window is open. */
  douyinSignedIn: boolean | null
  douyinSigningIn: boolean
  /** Whether Hongguo is signed in (`null`: not known yet), and whether its sign-in window is open. */
  hongguoSignedIn: boolean | null
  hongguoSigningIn: boolean
  /** Whether NetEase Cloud Music is signed in (`null`: not known yet), and whether its sign-in window is open. */
  neteaseSignedIn: boolean | null
  neteaseSigningIn: boolean
  /** The same of Apple Music: signed in or not (`null`: not known yet), and Apple's sign-in window open. */
  appleMusicSignedIn: boolean | null
  appleMusicSigningIn: boolean
  /** The map of the profile played (mirrors `westplay_host::maps::MapStatus`). */
  map: MapStatus
  /** The map the cab shows: its folder in WestPlay's maps, and when it was built (seconds since 1970;
   * `null`: none yet). */
  mapFolder: string | null
  mapBuilt: number | null
  /** Every profile's map (mirrors `westplay_host::maps::ProfileMap`): WestPlay makes one for each, one by
   * one, the profile played first. */
  profileMaps: ProfileMap[]
  error: string | null
}

export interface Adapter {
  /** What the player's choice is kept as (`Settings.graphics.gpu`). */
  id: string
  name: string
}

export interface ProfileMap {
  /** Its game. */
  game: GameKind
  /** The profile's folder, as the setup's check of the game names it (`ProfileCheck.dir`). */
  dir: string
  /** Its map's folder, by name: profiles sharing a map share it (what `prepareMapsAgain` asks by). */
  folder: string
  status: MapStatus
  /** The map it plays (`europe`, or a standalone map mod's), the mods that change it as the game names them, and
   * how many of those can't be read: as the host worked them out from the profile now (setup's check of the game
   * may be older: a mod turned off since). */
  map?: string
  mapMods?: string[]
  unreadable?: number
  /** The map mods left out of its map, as the Mod Manager names them: their files couldn't be read (a damaged
   * or protected archive), so the map was made from the rest. */
  leftOut?: string[]
  /** TruckersMP's map (`dir`: TruckersMP's installation), one for every profile: not a profile's. */
  truckersmp?: boolean
  /** TruckersMP's ProMods servers' map, beside its other servers'. */
  promods?: boolean
}

/** What a map being built is doing (mirrors `westplay_host::maps::MapStage`). */
export type MapStage = 'reading' | 'drawing' | 'tiles' | 'saving'

export type MapStatus =
  | { state: 'unknown' }
  /** WestPlay isn't set up in a game yet. */
  | { state: 'noGame' }
  | { state: 'ready' }
  /** How far, 0 to 1. */
  | { state: 'building'; done: number; stage: MapStage }
  /** To build once the game is closed. */
  | { state: 'waitingForGame' }
  /** To build once the PC has `needed` bytes of memory free (it has `free` now). */
  | { state: 'waitingForMemory'; needed: number; free: number }
  /** Road to Heavy: no map for it. */
  | { state: 'notAllowed' }
  | { state: 'failed'; error: string }
  /** Another profile's map, to make after the maps before it. */
  | { state: 'queued' }

/** Latest host status, or `null` until the first update arrives. */
export function useHostStatus(): HostStatus | null {
  const [status, setStatus] = useState<HostStatus | null>(null)
  useEffect(() => {
    return on<HostStatus>('host-status', (next) => {
      followRound(next)
      setStatus(next)
    })
  }, [])
  return status
}

/** Opens Google's sign-in for YouTube in a window on the desktop. */
export function youtubeSignIn(): Promise<void> {
  return call('youtube_sign_in')
}

/** Signs YouTube out. */
export function youtubeSignOut(): Promise<void> {
  return call('youtube_sign_out')
}

/** Runs YouTube (hidden), so the status says whether it's signed in. */
export function youtubeCheck(): Promise<void> {
  return call('youtube_check')
}

/** Opens Bilibili's sign-in in a window on the desktop. */
export function bilibiliSignIn(): Promise<void> {
  return call('bilibili_sign_in')
}

/** Signs Bilibili out. */
export function bilibiliSignOut(): Promise<void> {
  return call('bilibili_sign_out')
}

/** Runs Bilibili's web player (hidden), so the status says whether it's signed in. */
export function bilibiliCheck(): Promise<void> {
  return call('bilibili_check')
}

/** Opens Ximalaya's sign-in in a window on the desktop. */
export function ximalayaSignIn(): Promise<void> {
  return call('ximalaya_sign_in')
}

/** Signs Ximalaya out. */
export function ximalayaSignOut(): Promise<void> {
  return call('ximalaya_sign_out')
}

/** Runs Ximalaya's web player (hidden), so the status says whether it's signed in. */
export function ximalayaCheck(): Promise<void> {
  return call('ximalaya_check')
}

/** Opens Douyin's sign-in in a window on the desktop. */
export function douyinSignIn(): Promise<void> {
  return call('douyin_sign_in')
}

/** Signs Douyin out. */
export function douyinSignOut(): Promise<void> {
  return call('douyin_sign_out')
}

/** Runs Douyin (hidden), so the status says whether it's signed in. */
export function douyinCheck(): Promise<void> {
  return call('douyin_check')
}

/** Opens Hongguo's sign-in in a window on the desktop. */
export function hongguoSignIn(): Promise<void> {
  return call('hongguo_sign_in')
}

/** Signs Hongguo out. */
export function hongguoSignOut(): Promise<void> {
  return call('hongguo_sign_out')
}

/** Runs Hongguo (hidden), so the status says whether it's signed in. */
export function hongguoCheck(): Promise<void> {
  return call('hongguo_check')
}

/** Opens NetEase Cloud Music's sign-in in a window on the desktop. */
export function neteaseSignIn(): Promise<void> {
  return call('netease_sign_in')
}

/** Signs NetEase Cloud Music out. */
export function neteaseSignOut(): Promise<void> {
  return call('netease_sign_out')
}

/** Runs NetEase's web player (hidden), so the status says whether it's signed in. */
export function neteaseCheck(): Promise<void> {
  return call('netease_check')
}

/** Opens Apple's sign-in for Apple Music in a window on the desktop. */
export function appleMusicSignIn(): Promise<void> {
  return call('apple_music_sign_in')
}

/** Signs Apple Music out. */
export function appleMusicSignOut(): Promise<void> {
  return call('apple_music_sign_out')
}

/** Opens the support page (Kreosus) in the player's browser. */
export function openSupportPage(): Promise<void> {
  return call('open_support_page')
}

/** WestPlay's pages elsewhere, at the foot of the list. */
export type Social = 'youtube' | 'discord' | 'patreon'

/** Opens one of WestPlay's pages elsewhere in the player's browser (the app holds their addresses). */
export function openSocial(site: Social): Promise<void> {
  return call('open_social', { site })
}

/** Where this run's app.log is: Documents\WestPlay\logs, or WestPlay's own folder where Documents refused it. */
export function appLogPlace(): Promise<string | null> {
  return call('app_log_place')
}

/** Runs Apple Music's web player (hidden), so the status says whether it's signed in. */
export function appleMusicCheck(): Promise<void> {
  return call('apple_music_check')
}

/** Opens or closes WestPlay on the truck's screen (the status then reports it, once the cabin has). */
export function setWestplayOpen(open: boolean): Promise<void> {
  return call('set_westplay_open', { open })
}
