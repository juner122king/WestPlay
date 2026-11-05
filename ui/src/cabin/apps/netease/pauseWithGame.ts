import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { playOrPause, sendVolume, skip, useNetease } from './netease'

export const neteasePlayer: MusicPlayer = {
  name: 'netease',
  playingHere: () => Boolean(useNetease.getState().playing),
  pauseHere: () => {
    if (useNetease.getState().playing) playOrPause()
  },
  resumeHere: () => {
    if (!useNetease.getState().playing) playOrPause()
  },
  volume: () => useNetease.getState().volume,
  sendVolume: (share) => sendVolume(share),
  setVolume: (share) => sendVolume(share),
  skip: (direction) => skip(direction),
  subscribe: (changed) =>
    useNetease.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseNeteaseWithGame(): () => void {
  return pauseMusicWithGame(neteasePlayer)
}
