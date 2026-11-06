import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { playOrPause, sendVolume, skip, useHongguo } from './hongguo'

export const hongguoPlayer: MusicPlayer = {
  name: 'hongguo',
  playingHere: () => Boolean(useHongguo.getState().playing),
  pauseHere: () => {
    if (useHongguo.getState().playing) playOrPause()
  },
  resumeHere: () => {
    if (!useHongguo.getState().playing) playOrPause()
  },
  volume: () => useHongguo.getState().volume,
  sendVolume: (share) => sendVolume(share),
  setVolume: (share) => sendVolume(share),
  skip: (direction) => skip(direction),
  subscribe: (changed) =>
    useHongguo.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseHongguoWithGame(): () => void {
  return pauseMusicWithGame(hongguoPlayer)
}
