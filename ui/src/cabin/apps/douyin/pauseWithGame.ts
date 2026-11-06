import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { playOrPause, sendVolume, skip, useDouyin } from './douyin'

export const douyinPlayer: MusicPlayer = {
  name: 'douyin',
  playingHere: () => Boolean(useDouyin.getState().playing),
  pauseHere: () => {
    if (useDouyin.getState().playing) playOrPause()
  },
  resumeHere: () => {
    if (!useDouyin.getState().playing) playOrPause()
  },
  volume: () => useDouyin.getState().volume,
  sendVolume: (share) => sendVolume(share),
  setVolume: (share) => sendVolume(share),
  skip: (direction) => skip(direction),
  subscribe: (changed) =>
    useDouyin.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseDouyinWithGame(): () => void {
  return pauseMusicWithGame(douyinPlayer)
}
