import { type MusicPlayer, pauseMusicWithGame } from '../musicWithGame'
import { playOrPause, send, sendVolumePercent, skip, useHongguo } from './hongguo'

export const hongguoPlayer: MusicPlayer = {
  name: 'hongguo',
  playingHere: () => Boolean(useHongguo.getState().playing),
  pauseHere: () => {
    if (useHongguo.getState().playing) playOrPause()
  },
  resumeHere: () => {
    if (!useHongguo.getState().playing) playOrPause()
  },
  volume: () => {
    const { volume, muted } = useHongguo.getState()
    return muted ? 0 : volume / 100
  },
  sendVolume: (share) => send({ action: 'volume', percent: Math.round(share * 100) }),
  setVolume: (share) => sendVolumePercent(Math.round(share * 100)),
  skip: (direction) => skip(direction),
  subscribe: (changed) =>
    useHongguo.subscribe((state, before) => {
      changed(Boolean(state.playing && !before.playing))
    }),
}

export function pauseHongguoWithGame(): () => void {
  return pauseMusicWithGame(hongguoPlayer)
}
