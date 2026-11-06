import { describe, expect, it } from 'vitest'
import appleMusic from '../../crates/host/src/apple_music.js?raw'
import appleMusicSignIn from '../../crates/host/src/apple_music_sign_in.js?raw'
import bilibili from '../../crates/host/src/bilibili.js?raw'
import bilibiliSignIn from '../../crates/host/src/bilibili_sign_in.js?raw'
import douyin from '../../crates/host/src/douyin.js?raw'
import douyinSignIn from '../../crates/host/src/douyin_sign_in.js?raw'
import hongguo from '../../crates/host/src/hongguo.js?raw'
import hongguoSignIn from '../../crates/host/src/hongguo_sign_in.js?raw'
import cabSound from '../../crates/host/src/cab_sound.js?raw'
import netease from '../../crates/host/src/netease.js?raw'
import neteaseSignIn from '../../crates/host/src/netease_sign_in.js?raw'
import ximalaya from '../../crates/host/src/ximalaya.js?raw'
import ximalayaSignIn from '../../crates/host/src/ximalaya_sign_in.js?raw'
import youtube from '../../crates/host/src/youtube.js?raw'

/**
 * The scripts the host runs in the players' pages (crates/host/src), each as the host puts it in: the truck
 * speakers' script first, then the player's own, one script. One that doesn't compile does nothing at all (the
 * player never answers), so each is compiled here, never run.
 */
const AS_RUN: Record<string, string[]> = {
  YouTube: [cabSound, youtube],
  'Apple Music': [cabSound, appleMusic],
  "Apple Music's sign-in": [appleMusicSignIn],
  Bilibili: [cabSound, bilibili],
  "Bilibili's sign-in": [bilibiliSignIn],
  Ximalaya: [cabSound, ximalaya],
  "Ximalaya's sign-in": [ximalayaSignIn],
  Douyin: [cabSound, douyin],
  "Douyin's sign-in": [douyinSignIn],
  Hongguo: [cabSound, hongguo],
  "Hongguo's sign-in": [hongguoSignIn],
  NetEase: [cabSound, netease],
  "NetEase's sign-in": [neteaseSignIn],
}

describe("the players' page scripts", () => {
  for (const [player, parts] of Object.entries(AS_RUN)) {
    it(`compile for ${player}`, () => {
      expect(() => new Function(parts.join('\n'))).not.toThrow()
    })
  }
})
