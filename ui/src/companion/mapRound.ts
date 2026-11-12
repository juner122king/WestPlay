import type { HostStatus, MapStatus, ProfileMap } from './useHostStatus'

/**
 * A round of maps being prepared: the profiles whose map was waiting or being made since the round began
 * (each by [`mapKey`]), in the order first seen. Only requested or automatically maintained targets join;
 * profiles sharing a task count once. The Map page's bar gives each task an equal share of the round.
 */
export type MapRound = string[]

/** Waiting its turn or being made: not done in this round yet. */
export function pending(status: MapStatus): boolean {
  return (
    status.state === 'checking' ||
    status.state === 'building' ||
    status.state === 'queued' ||
    status.state === 'waitingForGame' ||
    status.state === 'waitingForMemory'
  )
}

/** A map, told apart from the others: its folder, and its game and ProMods' or not (TruckersMP's maps, ETS2's,
 * ATS's and ProMods', all have TruckersMP's folder: ATS's being made counted as ETS2's, done). */
export function mapKey(map: ProfileMap): string {
  return map.taskId ?? `${map.game}|${map.dir}|${map.promods ? 'promods' : ''}`
}

/** The round after the host's latest word on each profile's map: those pending join it; none pending, it's over. */
export function nextRound(round: MapRound, maps: ProfileMap[]): MapRound {
  const now = [...new Set(maps.filter((each) => pending(each.status)).map(mapKey))]
  if (now.length === 0) return []
  return [...round, ...now.filter((key) => !round.includes(key))]
}

/**
 * How far the round is, 0 to 1: each of its profiles an equal share, a map done (made, or failed) whole, the
 * one being made by `making` (its own progress, as shown), one waiting nothing. `null` without a round.
 */
export function roundProgress(round: MapRound, maps: ProfileMap[], making: number): number | null {
  if (round.length === 0) return null
  const share = (key: string) => {
    const status = maps.find((each) => mapKey(each) === key)?.status
    if (!status) return 1
    if (status.state === 'building') return making
    return pending(status) ? 0 : 1
  }
  return round.reduce((sum, key) => sum + share(key), 0) / round.length
}

/** The round as the companion has followed it, across every status the host has sent. */
let current: MapRound = []

/** Each profile's map; before any profile (a new player), the played one's. */
function mapsOf(status: HostStatus): ProfileMap[] {
  return status.profileMaps.length ? status.profileMaps : [{ game: 'ets2', dir: '', folder: '', status: status.map }]
}

/** Follows the round with the host's latest status (`useHostStatus` calls it with each). */
export function followRound(status: HostStatus): void {
  current = nextRound(current, mapsOf(status))
}

/** How far the round followed is, the map being made at `making` (`null`: no round). */
export function roundShown(status: HostStatus | null, making: number): number | null {
  return status ? roundProgress(current, mapsOf(status), making) : null
}
