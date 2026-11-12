import { useContext, useState } from 'react'
import { hvtMapMessage } from '../../cabin/maps/blockedMap'
import { Button, Group, MapProgress, Note, Panel, Row, Switch, Tick } from '../room/parts'
import { GAME_NAMES, prepareMaps } from '../setup'
import { banner, WordsContext } from '../room/room'
import { GLOW, ON_SCREEN, useScreenAt, useTour } from '../room/screen'
import { percent } from '../onboarding/words'
import { memoryNote, type PageProps } from './page'
import { type MapChoice, PrepareMapsSheet } from './PrepareMapsSheet'
import { MapMaintenance } from './MapMaintenance'

/**
 * The map in the cab's Maps app: made from the player's own game, for the profile they play. Its state (built
 * when, or being built now, as in the onboarding), and each profile's map with its map mods. On the room's
 * screen, Maps with the player's map, zooming out and back in.
 */
export function MapPage(props: PageProps) {
  const { status, cw, mapProgress } = props
  const { settings, update } = props.settings
  const { words, code } = useContext(WordsContext)
  const w = words.map
  const map = status?.map ?? { state: 'unknown' as const }
  // The map being made now, and the bar: every map being made in this round, each an equal share (worked out
  // once, the sidebar showing the same: mapProgress.ts). Finished only once none is being made or waits.
  const { building, finished, shown } = mapProgress
  // Seen building on this visit: once it's ready, its stages stay up, all ticked.
  const [watched, setWatched] = useState(false)
  if (building && !watched) setWatched(true)
  const [hvtTitle, hvtText] = [
    ...new Intl.Segmenter(words.locale, { granularity: 'sentence' }).segment(hvtMapMessage(code)),
  ].map((part) => part.segment.trim())

  useScreenAt(
    'maps',
    GLOW.maps,
    building
      ? {
          title: w.banners.building,
          detail: `${w.stages[building.stage].now} · ${percent(words, shown)}`,
          progress: shown,
        }
      : map.state === 'waitingForGame'
        ? banner(w.banners.waiting)
        : map.state === 'waitingForMemory'
          ? banner(cw.map.memory.banner)
          : map.state === 'notAllowed'
            ? { title: hvtTitle, detail: hvtText }
            : map.state === 'failed'
              ? banner(w.banners.failed)
              : null,
  )
  useTour(
    map.state === 'ready'
      ? [
          { tap: ON_SCREEN.zoomOut, then: 700 },
          { tap: ON_SCREEN.zoomOut, then: 3200 },
          { tap: ON_SCREEN.zoomIn, then: 700 },
          { tap: ON_SCREEN.zoomIn, then: 4200 },
        ]
      : null,
    1800,
  )

  const title = building
    ? cw.map.titles.building
    : map.state === 'waitingForGame'
      ? cw.map.titles.waiting
      : map.state === 'waitingForMemory'
        ? cw.map.memory.title
        : map.state === 'failed' || map.state === 'notAllowed'
          ? cw.map.titles.failed
          : map.state === 'noGame'
            ? cw.map.titles.noGame
            : cw.map.titles.ready
  const built = status?.mapBuilt
  // A map being made: the button waits for it. Once asked, it turns until a map is being made, or for a moment
  // (the game open, the maps wait for it to close).
  const [asked, setAsked] = useState(false)
  const [preparationError, setPreparationError] = useState<string | null>(null)
  if (asked && building) setAsked(false)
  const ask = (targets: string[], force = false) => {
    setAsked(true)
    setPreparationError(null)
    prepareMaps(targets, force).then(
      () => setTimeout(() => setAsked(false), 2500),
      (error) => {
        setAsked(false)
        setPreparationError(String(error))
      },
    )
  }
  // Each map once, with the profiles playing it (two games: its game's name first), for the player to pick from
  // when there's more than one (owner 2026-11-06); HVT's, never made, left out.
  const choices: MapChoice[] = (status?.profileMaps ?? [])
    .filter((map) => map.target && map.status.state !== 'notAllowed')
    .map((map) => ({
      target: map.target!,
      title: map.name || (map.truckersmp ? 'TruckersMP' : map.dir),
      detail: `${GAME_NAMES[map.game]} · ${map.map ?? words.check.baseMap}`,
    }))
  const [picking, setPicking] = useState(false)
  const again = () => setPicking(true)
  return (
    <Panel
      place="page"
      title={title}
      sub={cw.map.sub}
      action={
        map.state !== 'noGame' &&
        map.state !== 'unknown' && (
          <Button glass onClick={again} busy={asked} disabled={building !== null}>
            {cw.map.prepareAgain}
          </Button>
        )
      }
    >
      {(building || (watched && finished)) && (
        <MapProgress shown={shown} stage={building?.stage ?? null} finished={!building && finished} />
      )}
      {map.state === 'ready' && !watched && !building && (
        <Group place={4}>
          <Row
            title={cw.map.inCab}
            detail={
              built
                ? cw.map.built.replace(
                    '{date}',
                    new Intl.DateTimeFormat(words.locale, { dateStyle: 'medium' }).format(new Date(built * 1000)),
                  )
                : cw.map.notBuilt
            }
            accessory={<Tick done />}
          />
        </Group>
      )}
      {map.state === 'waitingForGame' && (
        <Note>
          <b>{w.waiting.title}</b> {w.waiting.text}
        </Note>
      )}
      {map.state === 'waitingForMemory' && (
        <Note>
          <b>{cw.map.memory.note.title}</b> {memoryNote(cw, words.locale, map.needed, map.free)}
        </Note>
      )}
      {map.state === 'failed' && <Note tone="bad">{map.error}</Note>}
      {map.state === 'notAllowed' && <Note tone="bad">{hvtMapMessage(code)}</Note>}
      {settings && (
        <Group place={4}>
          <Row
            title={cw.map.buildings}
            detail={cw.map.buildingsDetail}
            accessory={
              <Switch
                on={settings.map.buildings}
                label={cw.map.buildings}
                change={(buildings) => update({ ...settings, map: { ...settings.map, buildings } })}
              />
            }
          />
          <Row
            title={cw.map.roads}
            detail={cw.map.roadsDetail}
            accessory={
              <Switch
                on={settings.map.roads}
                label={cw.map.roads}
                change={(roads) => update({ ...settings, map: { ...settings.map, roads } })}
              />
            }
          />
          <Row
            title={cw.map.fast}
            detail={cw.map.fastDetail}
            accessory={
              <Switch
                on={settings.map.fast}
                label={cw.map.fast}
                change={(fast) => update({ ...settings, map: { ...settings.map, fast } })}
              />
            }
          />
        </Group>
      )}
      {preparationError && <Note tone="bad">{preparationError}</Note>}
      <MapMaintenance status={status} settings={props.settings} cw={cw} />
      {picking && (
        <PrepareMapsSheet
          cw={cw}
          maps={choices}
          close={() => setPicking(false)}
          prepare={(targets, force) => {
            setPicking(false)
            ask(targets, force)
          }}
        />
      )}
    </Panel>
  )
}
