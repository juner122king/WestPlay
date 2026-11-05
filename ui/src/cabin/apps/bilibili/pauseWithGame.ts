import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { playOrPause, sendVolume, skip, useBilibili } from './bilibili'

export const bilibiliPlayer: MusicPlayer = {
  name: 'bilibili',
  playingHere: () => Boolean(useBilibili.getState().playing),
  pauseHere: () => {
    if (useBilibili.getState().playing) playOrPause()
  },
  resumeHere: () => {
    if (!useBilibili.getState().playing) playOrPause()
  },
  volume: () => useBilibili.getState().volume,
  sendVolume: (share) => sendVolume(share),
  setVolume: (share) => sendVolume(share),
  skip: (direction) => skip(direction),
  subscribe: (changed) =>
    useBilibili.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseBilibiliWithGame(): () => void {
  return pauseMusicWithGame(bilibiliPlayer)
}
