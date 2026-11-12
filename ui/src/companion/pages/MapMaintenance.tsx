import { useState } from 'react'
import { Button, Group, Note, Row, Switch } from '../room/parts'
import { cancelMapPreparation, GAME_NAMES, prepareMaps } from '../setup'
import { pending as preparationPending } from '../mapRound'
import type { HostStatus, ProfileMap } from '../useHostStatus'
import type { SettingsState } from '../useSettings'
import type { CompanionWords } from './words'

export function MapMaintenance({
  status,
  settings: state,
  cw,
}: {
  status: HostStatus | null
  settings: SettingsState
  cw: CompanionWords
}) {
  const { settings, update } = state
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const w = cw.map.maintenance
  const policy = settings?.map.maintenance ?? { games: {}, profiles: {} }
  const maps = status?.profileMaps ?? []
  const action = async (target: string, run: () => Promise<unknown>) => {
    setAsking(target)
    setError(null)
    try {
      await run()
    } catch (error) {
      setError(String(error))
    } finally {
      setAsking(null)
    }
  }
  const change = (group: 'games' | 'profiles', key: string, enabled: boolean) => {
    if (settings)
      update({
        ...settings,
        map: {
          ...settings.map,
          maintenance: {
            ...policy,
            [group]: { ...policy[group], [key]: enabled },
          },
        },
      })
  }
  const detail = (map: ProfileMap) => {
    const status = map.status.state
    const text =
      status === 'ready'
        ? w.current
        : status === 'unverified'
          ? map.reason === 'dependencyVerificationUnavailable'
            ? w.unverifiable
            : w.initialize
          : status === 'stale'
            ? w.stale
            : status === 'notPrepared'
              ? w.notPrepared
              : status === 'unknown' || status === 'noGame'
                ? w.notPrepared
                : status === 'failed'
                  ? `${w.failed}: ${map.status.state === 'failed' ? map.status.error : ''}`
                  : w[status]
    const shared =
      Boolean(map.sharedTargets?.length) ||
      maps.filter((other) => other.game === map.game && other.folder === map.folder).length > 1
    return `${text}${shared ? ` ${w.shared}` : ''}`
  }
  return (
    <>
      <Note>{w.note}</Note>
      {error && <Note tone="bad">{error}</Note>}
      {(['ets2', 'ats'] as const)
        .filter((game) => maps.some((map) => map.game === game))
        .map((game) => (
          <Group key={game} place={4} title={GAME_NAMES[game]}>
            <Row
              title={w.automaticGame}
              accessory={
                <Switch
                  label={`${GAME_NAMES[game]} · ${w.automaticGame}`}
                  on={policy.games[game] ?? false}
                  disabled={!settings}
                  change={(on) => change('games', game, on)}
                />
              }
            />
            {maps
              .filter((map) => map.game === game)
              .map((map) => {
                const target = map.target
                const name = map.truckersmp
                  ? map.promods
                    ? 'TruckersMP ProMods'
                    : 'TruckersMP'
                  : (map.name ?? map.dir.split(/[\\/]/).pop() ?? map.dir)
                const pending = preparationPending(map.status)
                return (
                  <Row
                    key={target ?? `${map.dir}#${map.promods}`}
                    title={name}
                    detail={detail(map)}
                    wrap
                    accessory={
                      <div className="cp-map-maintenance-actions">
                        {pending && map.taskId ? (
                          <Button
                            glass
                            small
                            busy={asking === map.taskId}
                            onClick={() => void action(map.taskId!, () => cancelMapPreparation(map.taskId!))}
                          >
                            {w.cancel}
                          </Button>
                        ) : (
                          <Button
                            glass
                            small
                            disabled={!target || map.status.state === 'notAllowed'}
                            busy={asking === target}
                            onClick={() => target && void action(target, () => prepareMaps([target]))}
                          >
                            {w.prepareOnce}
                          </Button>
                        )}
                        <Switch
                          label={`${name} · ${w.automaticProfile}`}
                          on={target ? (policy.profiles[target] ?? false) : false}
                          disabled={!settings || !target || map.status.state === 'notAllowed'}
                          change={(on) => target && change('profiles', target, on)}
                        />
                      </div>
                    }
                  />
                )
              })}
          </Group>
        ))}
    </>
  )
}
