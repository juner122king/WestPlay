import type { MediaApp } from '../../shared/mediaGeneration'
import { stopFade } from './fade'
import { releaseResource as youtube } from './youtube/youtube'
import { releaseResource as appleMusic } from './music/appleMusic'
import { releaseResource as bilibili } from './bilibili/bilibili'
import { releaseResource as ximalaya } from './ximalaya/ximalaya'
import { releaseResource as douyin } from './douyin/douyin'
import { releaseResource as hongguo } from './hongguo/hongguo'
import { releaseResource as netease } from './netease/netease'
import { releaseResource as player } from './player/player'

const release = { youtube, appleMusic, bilibili, ximalaya, douyin, hongguo, netease, player }

export function releaseMedia(app: MediaApp): void {
  stopFade(app === 'appleMusic' ? 'apple music' : app)
  release[app]()
}
