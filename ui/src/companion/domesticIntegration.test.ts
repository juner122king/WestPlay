import appConfig from '../../../app/tauri.conf.json?raw'
import releaseConfig from '../../../app/tauri.release.conf.json?raw'
import uiPackage from '../../package.json?raw'
import uiLockfile from '../../package-lock.json?raw'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { languages } from './onboarding/words'
import { companionLanguages, companionWords } from './pages/words'
import { RELEASED_APP_IDS, isAppId } from '../cabin/state/apps'
import { prepareMapsAgain } from './setup'
import { call } from './bridge'

vi.mock('./bridge', () => ({ call: vi.fn(), on: vi.fn() }))

describe('2.3.0-domestic.1 domestic edition integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the domestic apps, freight and existing retained players, not removed services', () => {
    expect(RELEASED_APP_IDS).toEqual(
      expect.arrayContaining([
        'netease',
        'bilibili',
        'ximalaya',
        'douyin',
        'hongguo',
        'freight',
        'safari',
        'music',
        'youtube',
        'player',
      ]),
    )
    expect(isAppId('spotify')).toBe(false)
    expect(isAppId('youtubeMusic')).toBe(false)
  })

  it('retains only English and Simplified Chinese, including the installer', () => {
    expect(languages()).toEqual(['en_us', 'zh_cn'])
    expect(companionLanguages()).toEqual(['en_us', 'zh_cn'])
    const release = JSON.parse(releaseConfig)
    expect(release.bundle.windows.nsis.languages).toEqual(['English', 'SimpChinese'])
    for (const code of companionLanguages()) {
      const words = companionWords(code)
      expect(words.map.fast).toBeTruthy()
      expect(words.update.manualOnly).toBeTruthy()
    }
    expect(companionWords('zh_cn').about.title).toContain('国内定制版')
    expect(companionWords('zh_cn').update.manualOnly).toContain('请手动安装升级')
  })

  it('keeps the app identity, resizable window and ships all native resources without an updater', () => {
    const config = JSON.parse(appConfig)
    const release = JSON.parse(releaseConfig)
    const ui = JSON.parse(uiPackage)
    expect(config.identifier).toBe('app.westplay')
    expect(config.version).toBe('2.3.0-domestic.1')
    expect(ui.version).toBe(config.version)
    const lockfile = JSON.parse(uiLockfile)
    expect(lockfile.version).toBe(config.version)
    expect(lockfile.packages[''].version).toBe(config.version)
    expect(__WESTPLAY_VERSION__).toBe(config.version)
    expect(`${companionWords('zh_cn').about.title} ${config.version}`).toBe('WestPlay 国内定制版 2.3.0-domestic.1')
    expect(config.app.windows[0]).toMatchObject({ resizable: true, maximizable: true, width: 780, height: 520 })
    expect(config.plugins?.updater).toBeUndefined()
    expect(release.bundle.createUpdaterArtifacts).toBe(false)
    expect(release.bundle.resources['../target/release/westplay.dll']).toBe('westplay.dll')
    expect(release.bundle.resources['../target/release/westplay-maps.exe']).toBe('westplay-maps.exe')
    expect(release.bundle.resources['../target/release/westplay-probe.exe']).toBe('westplay-probe.exe')
  })

  it('sends selected map folders explicitly, and null for all maps', () => {
    prepareMapsAgain(['europe-1', 'usa-2'])
    expect(call).toHaveBeenLastCalledWith('prepare_maps_again', { folders: ['europe-1', 'usa-2'] })
    prepareMapsAgain()
    expect(call).toHaveBeenLastCalledWith('prepare_maps_again', { folders: null })
  })
})
