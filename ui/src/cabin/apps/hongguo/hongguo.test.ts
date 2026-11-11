import { beforeEach, describe, expect, it } from 'vitest'
import type { HongguoDrama } from '../../../shared/host'
import {
  clearSearches,
  clearWatched,
  dismissNotice,
  forgetSearch,
  goBack,
  isFavorite,
  isValidDramaDetail,
  leavePlayer,
  loadCategory,
  loadDramaDetail,
  loadFeed,
  loadHome,
  loadRank,
  mergeDramaDetail,
  openDetail,
  openResults,
  play,
  positionOf,
  PREVIEW_DRAMAS,
  receiveAnswer,
  receivePlayback,
  rememberSearch,
  reopenPlayer,
  selectEpisode,
  selectTab,
  setAutoNext,
  setCrop,
  setSpeed,
  stopDrama,
  toggleFavorite,
  useHongguo,
} from './hongguo'

const SAMPLE_DRAMA: HongguoDrama = {
  id: '749999001',
  title: '重返巅峰从搬砖开始',
  category: '都市',
  tags: ['逆袭', '爽剧'],
  author: '红果短剧',
  totalEpisodes: 88,
  accessibleEpisodes: 5,
  heatText: '820万热度',
}

describe('Hongguo Short Drama store', () => {
  beforeEach(() => {
    stopDrama()
    useHongguo.setState({
      signedIn: null,
      signingIn: false,
      tab: 'home',
      views: [],
      banners: [],
      sections: [],
      homeLoaded: false,
      homeLoading: false,
      feedItems: [],
      feedActiveIndex: 0,
      categoryType: 'real-drama',
      categorySlug: '',
      categorySelectors: [],
      categoryDramas: [],
      rankKind: 'hot-drama',
      rankDramas: [],
      detailCache: {},
      playbackNotice: null,
      speed: 1,
      autoNext: true,
      crop: false,
      volume: 100,
      muted: false,
      hole: null,
      searches: [],
      watched: [],
      favorites: [],
    })
  })

  it('starts playback, minimizes on leavePlayer, and clears cleanly on stopDrama', () => {
    play(SAMPLE_DRAMA, 3, true)
    let state = useHongguo.getState()
    expect(state.currentDrama?.id).toBe('749999001')
    expect(state.currentEpisode).toBe(3)
    expect(state.playing).toBe(true)
    expect(state.open).toBe(true)
    expect(state.playback?.title).toContain('第3集')

    leavePlayer()
    state = useHongguo.getState()
    expect(state.open).toBe(false)
    expect(state.returnToPlayer).toBe(true)

    reopenPlayer()
    state = useHongguo.getState()
    expect(state.open).toBe(true)
    expect(state.returnToPlayer).toBe(false)

    stopDrama()
    state = useHongguo.getState()
    expect(state.playback).toBeNull()
    expect(state.currentDrama).toBeNull()
    expect(state.playing).toBe(false)
    expect(state.open).toBe(false)
  })

  it('ignores trailing paused reports after stopDrama to prevent ghost resurrection', () => {
    stopDrama()
    receivePlayback({
      dramaId: '749999001',
      title: '重返巅峰从搬砖开始 · 第1集',
      duration: 120,
      position: 14,
      status: 'paused',
    })
    expect(useHongguo.getState().playback).toBeNull()
    expect(useHongguo.getState().currentDrama).toBeNull()
  })

  it('hydrates playing reports when idle and records watched history once past 3s', () => {
    receivePlayback({
      dramaId: '749999001',
      dramaTitle: '重返巅峰从搬砖开始',
      title: '重返巅峰从搬砖开始 · 第4集',
      episodeNumber: 4,
      totalEpisodes: 88,
      accessibleEpisodes: 5,
      duration: 110,
      position: 24,
      status: 'playing',
    })

    const state = useHongguo.getState()
    expect(state.currentDrama?.id).toBe('749999001')
    expect(state.currentEpisode).toBe(4)
    expect(state.playing).toBe(true)
    expect(state.watched).toHaveLength(1)
    expect(state.watched[0]?.episode).toBe(4)
    expect(state.watched[0]?.position).toBe(24)
  })

  it('surfaces episode_locked and login_required playback notices and clears when resumed', () => {
    play(SAMPLE_DRAMA, 6, true)

    receivePlayback({
      dramaId: '749999001',
      title: '重返巅峰从搬砖开始 · 第6集',
      episodeNumber: 6,
      accessibleEpisodes: 5,
      duration: 120,
      position: 0,
      status: 'paused',
      error: 'episode_locked',
    })

    let state = useHongguo.getState()
    expect(state.playbackNotice?.reason).toBe('episode_locked')
    expect(state.playbackNotice?.accessibleEpisodes).toBe(5)

    dismissNotice()
    expect(useHongguo.getState().playbackNotice).toBeNull()

    receivePlayback({
      dramaId: '749999001',
      title: '重返巅峰从搬砖开始 · 第6集',
      episodeNumber: 6,
      duration: 120,
      position: 0,
      status: 'paused',
      error: 'login_required',
    })
    expect(useHongguo.getState().playbackNotice?.reason).toBe('login_required')

    selectEpisode(1, true)
    expect(useHongguo.getState().currentEpisode).toBe(1)
    expect(useHongguo.getState().playbackNotice).toBeNull()
  })

  it('computes positionOf accurately across playback speeds and paused state', () => {
    const base = {
      title: 'test',
      duration: 100,
      position: 10,
      status: 'playing',
      speed: 1.5,
      at: 1000,
    }
    expect(positionOf(base, 11000)).toBeCloseTo(25, 4)
    expect(positionOf(base, 200000)).toBe(100)
    expect(positionOf({ ...base, status: 'paused' }, 11000)).toBe(10)
  })

  it('manages speed, autoNext, crop, favorites, search history, and navigation views', () => {
    setSpeed(1.5)
    setAutoNext(false)
    setCrop(true)
    expect(useHongguo.getState().speed).toBe(1.5)
    expect(useHongguo.getState().autoNext).toBe(false)
    expect(useHongguo.getState().crop).toBe(true)

    toggleFavorite(SAMPLE_DRAMA)
    expect(isFavorite(SAMPLE_DRAMA.id)).toBe(true)
    toggleFavorite(SAMPLE_DRAMA)
    expect(isFavorite(SAMPLE_DRAMA.id)).toBe(false)

    rememberSearch('逆袭')
    rememberSearch('甜宠')
    rememberSearch('逆袭')
    expect(useHongguo.getState().searches).toEqual(['逆袭', '甜宠'])
    forgetSearch('甜宠')
    expect(useHongguo.getState().searches).toEqual(['逆袭'])
    clearSearches()
    expect(useHongguo.getState().searches).toEqual([])

    openDetail(PREVIEW_DRAMAS[0])
    openResults('战神')
    expect(useHongguo.getState().views).toHaveLength(2)
    goBack()
    expect(useHongguo.getState().views).toHaveLength(1)
    selectTab('rank')
    expect(useHongguo.getState().tab).toBe('rank')
    expect(useHongguo.getState().views).toHaveLength(0)

    clearWatched()
    expect(useHongguo.getState().watched).toEqual([])
  })

  it('loads preview data cleanly across home, feed, category, rank, and detail views', async () => {
    await loadHome(true)
    expect(useHongguo.getState().homeLoaded).toBe(true)
    expect(useHongguo.getState().sections.length).toBeGreaterThan(0)
    expect(useHongguo.getState().banners.length).toBeGreaterThan(0)

    await loadFeed(false)
    expect(useHongguo.getState().feedItems.length).toBeGreaterThan(0)

    await loadCategory('comic-drama', 'xuanhuan', 1)
    expect(useHongguo.getState().categoryType).toBe('comic-drama')
    expect(useHongguo.getState().categorySlug).toBe('xuanhuan')
    expect(useHongguo.getState().categoryDramas.length).toBeGreaterThan(0)

    await loadRank('hot-real-drama', 1)
    expect(useHongguo.getState().rankKind).toBe('hot-real-drama')
    expect(useHongguo.getState().rankDramas.length).toBeGreaterThan(0)

    const detail = await loadDramaDetail(PREVIEW_DRAMAS[0].id)
    expect(detail?.drama.id).toBe(PREVIEW_DRAMAS[0].id)
    expect(useHongguo.getState().detailCache[PREVIEW_DRAMAS[0].id]).toBeDefined()

    // Unmatched answer ID is safely ignored without throwing
    expect(() => receiveAnswer(999999, { banners: [] })).not.toThrow()
  })

  it('rejects generic fallback detail payloads so card titles/covers are never overwritten', async () => {
    const fakeDetail = {
      drama: { id: SAMPLE_DRAMA.id, title: '红果短剧', totalEpisodes: 0 },
      celebrities: [],
      vidList: [],
      accessibleEpisodes: 5,
      recommendations: [],
    }
    expect(isValidDramaDetail(fakeDetail)).toBe(false)
    expect(mergeDramaDetail(SAMPLE_DRAMA, fakeDetail)).toEqual(SAMPLE_DRAMA)

    const partialDetail = {
      drama: { id: SAMPLE_DRAMA.id, title: '红果短剧', totalEpisodes: 0 },
      celebrities: [],
      vidList: ['v1', 'v2'],
      accessibleEpisodes: 5,
      recommendations: [],
    }
    expect(isValidDramaDetail(partialDetail)).toBe(true)
    const merged = mergeDramaDetail(SAMPLE_DRAMA, partialDetail)
    expect(merged.title).toBe(SAMPLE_DRAMA.title)
    expect(merged.totalEpisodes).toBe(SAMPLE_DRAMA.totalEpisodes)
    expect(merged.vidList).toEqual(['v1', 'v2'])

    const loaded = await loadDramaDetail(PREVIEW_DRAMAS[0].id)
    expect(loaded?.drama.title).toBe(PREVIEW_DRAMAS[0].title)
  })
})
