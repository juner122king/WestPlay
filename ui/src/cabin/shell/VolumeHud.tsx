import { useVolumeHud } from './volumeShown'
import './volumeHud.css'

/** The volume: a speaker, its waves as many as it's loud (none, a cross, muted). */
export function VolumeGlyph({ volume }: { volume: number }) {
  const waves = volume === 0 ? 0 : volume < 0.34 ? 1 : volume < 0.67 ? 2 : 3
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9.2h3.6L11.5 5v14l-4.9-4.2H3z" fill="currentColor" strokeLinejoin="round" />
      {waves === 0 && <path d="m15.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      {waves >= 1 && (
        <path
          d="M14.5 9.6a3.4 3.4 0 0 1 0 4.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {waves >= 2 && (
        <path
          d="M16.9 7.3a6.6 6.6 0 0 1 0 9.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {waves >= 3 && (
        <path d="M19.3 5a9.8 9.8 0 0 1 0 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  )
}

/**
 * The volume, as CarPlay shows it when the steering wheel's buttons change it: a glass pill at the top of the
 * screen with a speaker and the level, for a moment after each change (apps/keybinds.ts, volumeShown.ts).
 */
export function VolumeHud() {
  const { volume, shown } = useVolumeHud()
  return (
    <div className={shown ? 'volume-hud shown' : 'volume-hud'} aria-hidden={!shown}>
      <div className="volume-hud-pill">
        <VolumeGlyph volume={volume} />
        <div className="volume-hud-bar">
          <i style={{ width: `${Math.round(volume * 100)}%` }} />
        </div>
      </div>
    </div>
  )
}
