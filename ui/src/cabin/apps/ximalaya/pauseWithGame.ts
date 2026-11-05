import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { playOrPause, sendVolume, skip, useXimalaya } from './ximalaya'

export const ximalayaPlayer: MusicPlayer = {
  name: 'ximalaya',
  playingHere: () => Boolean(useXimalaya.getState().playing),
  pauseHere: () => {
    if (useXimalaya.getState().playing) playOrPause()
  },
  resumeHere: () => {
    if (!useXimalaya.getState().playing) playOrPause()
  },
  volume: () => useXimalaya.getState().volume,
  sendVolume: (share) => sendVolume(share),
  setVolume: (share) => sendVolume(share),
  skip: (direction) => skip(direction),
  subscribe: (changed) =>
    useXimalaya.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseXimalayaWithGame(): () => void {
  return pauseMusicWithGame(ximalayaPlayer)
}
