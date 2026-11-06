import { useEffect } from 'react'
import { command, useYouTube } from '../apps/youtube/youtube'
import { playOrPause as playOrPauseBilibili, useBilibiliSource } from '../apps/bilibili/bilibili'
import { playOrPause as playOrPauseXimalaya, useXimalayaSource } from '../apps/ximalaya/ximalaya'
import { playOrPause as playOrPauseDouyin, useDouyinSource } from '../apps/douyin/douyin'
import { playOrPause as playOrPauseHongguo, useHongguoSource } from '../apps/hongguo/hongguo'
import { playOrPause as playOrPauseNetease, useNeteaseSource } from '../apps/netease/netease'
import { playOrPause as playOrPauseAppleMusic, useAppleMusicSource } from '../apps/music/appleMusic'
import { playOrPause as playOrPausePlayer, usePlayerSource } from '../apps/player/player'
import { type NowPlayingSource, shownSource } from './nowPlaying'

/** What Now Playing last showed playing, kept while the screens showing it come and go (nowPlaying.ts). */
let lastPlayed: NowPlayingSource | null = null

/** What Now Playing shows (`shownSource`): which player, and each player's own state (the screen showing it
 * draws it its own way: the Dashboard's widget, the Equalizer's track). */
export function useNowPlaying() {
  const bilibili = useBilibiliSource()
  const ximalaya = useXimalayaSource()
  const douyin = useDouyinSource()
  const hongguo = useHongguoSource()
  const netease = useNeteaseSource()
  const appleMusic = useAppleMusicSource()
  const player = usePlayerSource()
  const video = useYouTube((store) => store.current)
  const videoPlaying = useYouTube((store) => store.state?.state === 1 && store.state.video === store.current?.video)
  const playing = {
    video: video !== null && videoPlaying,
    bilibili: bilibili?.source.status === 'playing',
    ximalaya: ximalaya?.source.status === 'playing',
    douyin: douyin?.source.status === 'playing',
    hongguo: hongguo?.source.status === 'playing',
    netease: netease?.source.status === 'playing',
    appleMusic: appleMusic?.source.status === 'playing',
    player: player?.source.status === 'playing',
  }
  const has = {
    video: video !== null,
    bilibili: Boolean(bilibili),
    ximalaya: Boolean(ximalaya),
    douyin: Boolean(douyin),
    hongguo: Boolean(hongguo),
    netease: Boolean(netease),
    appleMusic: Boolean(appleMusic),
    player: Boolean(player),
  }
  const showing = shownSource(playing, has, lastPlayed)
  const showingPlays = showing !== null && playing[showing]
  useEffect(() => {
    if (showing !== null && showingPlays) lastPlayed = showing
  }, [showing, showingPlays])
  return { showing, playing, bilibili, ximalaya, douyin, hongguo, netease, appleMusic, player, video }
}

/** The track Now Playing shows, as one line of a list draws it (the Equalizer's): its title, who it's by, its
 * cover, whether it plays, and playing or pausing it; `null`: nothing to show. */
export function useNowPlayingTrack(): {
  title: string
  by: string
  artwork: string | null
  playing: boolean
  playPause: (() => void) | null
} | null {
  const { showing, playing, bilibili, ximalaya, douyin, hongguo, netease, appleMusic, player, video } = useNowPlaying()
  const music = (
    player: { source: { title: string; artist: string; controls: { playPause: boolean } }; artwork: string | null },
    playPause: () => void,
    plays: boolean,
  ) => ({
    title: player.source.title,
    by: player.source.artist,
    artwork: player.artwork,
    playing: plays,
    playPause: player.source.controls.playPause ? playPause : null,
  })
  switch (showing) {
    case 'video':
      return video
        ? {
            title: video.title,
            by: video.channel,
            artwork: video.thumbnail,
            playing: playing.video,
            playPause: () => command({ action: playing.video ? 'pause' : 'play' }),
          }
        : null
    case 'bilibili':
      return bilibili ? music(bilibili, playOrPauseBilibili, playing.bilibili) : null
    case 'ximalaya':
      return ximalaya ? music(ximalaya, playOrPauseXimalaya, playing.ximalaya) : null
    case 'douyin':
      return douyin ? music(douyin, playOrPauseDouyin, playing.douyin) : null
    case 'hongguo':
      return hongguo ? music(hongguo, playOrPauseHongguo, playing.hongguo) : null
    case 'netease':
      return netease ? music(netease, playOrPauseNetease, playing.netease) : null
    case 'appleMusic':
      return appleMusic ? music(appleMusic, playOrPauseAppleMusic, playing.appleMusic) : null
    case 'player':
      return player ? music(player, playOrPausePlayer, playing.player) : null
    default:
      return null
  }
}
