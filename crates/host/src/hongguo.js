// WestPlay: Hongguo short drama controller (crates/host/src/hongguo.rs).
// Runs in the hidden WebView2 hosting https://hongguoduanju.com/?tab=home
;(() => {
  if (!location.hostname.includes('hongguoduanju.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  const STATE_KEY = 'westplay_hongguo_state'
  const detailCache = new Map()

  let currentMedia = null
  let currentDrama = null
  let currentEpisode = 1
  let currentVid = null
  let currentSpeed = 1.0
  let currentVolume = 1.0
  let isPlaying = false
  let isEnded = false
  let wantedPlaying = false
  let autoNext = true
  let cropOn = false
  let detectedError = null
  let hasPlayedVideo = false
  let fallbackAttemptedVid = null
  let stallWatchSince = 0
  let playAttemptToken = 0
  let lastPlaybackAt = 0

  const toHttps = (url) => (typeof url === 'string' && url ? url.replace(/^http:\/\//i, 'https://') : undefined)

  const cleanText = (str) => (typeof str === 'string' ? str.replace(/\s+/g, ' ').trim() : '')

  const readPersisted = () => {
    try {
      const raw = sessionStorage.getItem(STATE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  const writePersisted = () => {
    try {
      if (!currentDrama && !wantedPlaying) {
        sessionStorage.removeItem(STATE_KEY)
        return
      }
      sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          drama: currentDrama,
          episode: currentEpisode,
          vid: currentVid,
          speed: currentSpeed,
          volume: currentVolume,
          autoNext,
          wantedPlaying,
          crop: cropOn,
        }),
      )
    } catch {}
  }

  const saved = readPersisted()
  if (saved && typeof saved === 'object') {
    currentDrama = saved.drama || null
    currentEpisode = Number(saved.episode) || 1
    currentVid = saved.vid || null
    currentSpeed = Number(saved.speed) || 1.0
    currentVolume = typeof saved.volume === 'number' ? saved.volume : 1.0
    autoNext = saved.autoNext !== undefined ? Boolean(saved.autoNext) : true
    wantedPlaying = Boolean(saved.wantedPlaying)
    cropOn = Boolean(saved.crop)
    if (cropOn) document.documentElement.classList.add('westplay-crop')
  }

  // Prevent Hongguo's daily guest promo login modal (`hongguo:pc-login-prompt-date`) from opening invisible
  // inside WebView2: `ho.js` attaches a capture-phase `play` listener that pauses `<video>` while open (`ze.N6()`).
  const suppressDailyLoginPrompt = () => {
    try {
      const now = new Date()
      const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
      if (localStorage.getItem('hongguo:pc-login-prompt-date') !== today) {
        localStorage.setItem('hongguo:pc-login-prompt-date', today)
      }
    } catch {}
  }
  suppressDailyLoginPrompt()

  // Intercept Hongguo's protected play-info API responses so locked episodes fail fast and cleanly.
  const nativeFetch = window.fetch
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || ''
    const p = nativeFetch.call(this, input, init)
    if (url.includes('/api/video/protected/play-info')) {
      p.then(async (res) => {
        if (res.status === 403 || res.status === 502) {
          let errBody = null
          try {
            errBody = await res.clone().json()
          } catch {}
          if (errBody?.error === 'protected_playback_unavailable') {
            detectedError = 'episode_locked'
            isPlaying = false
            sendPlayback({ status: 'paused', error: 'episode_locked' })
          }
        }
      }).catch(() => {})
    }
    return p
  }

  // Cab 3D speaker system (crates/host/src/cab_sound.js).
  const cab = window.westplayCabSound?.(() => currentMedia, post)
  if (cab) setInterval(() => cab.tick(), 250)

  // Inject full-bleed video styles and strip all site chrome & QR prompts.
  const style = document.createElement('style')
  style.id = 'westplay-hongguo-style'
  style.textContent = `
    html, body {
      background: #000 !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
    }
    body * {
      visibility: hidden !important;
    }
    #pc-mse,
    [class*="pc-stage-"],
    [class*="pc-container-"],
    xg-video-container,
    .xgplayer-video,
    video,
    #wp-hongguo-video {
      visibility: visible !important;
    }
    #pc-mse,
    [class*="pc-stage-"],
    [class*="pc-container-"],
    xg-video-container,
    .xgplayer-video {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      left: 0 !important;
      top: 0 !important;
      z-index: 2147483640 !important;
      background: transparent !important;
    }
    video,
    #wp-hongguo-video {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      left: 0 !important;
      top: 0 !important;
      z-index: 2147483645 !important;
      background: #000 !important;
      object-fit: contain !important;
    }
    html.westplay-crop video,
    html.westplay-crop #wp-hongguo-video {
      object-fit: cover !important;
    }
    #pc-mse img,
    [class*="pc-stage-"] img,
    [class*="pc-container-"] img,
    header,
    footer,
    xg-poster,
    xg-start,
    xg-controls,
    xg-loading,
    xg-error,
    xg-prompt,
    xg-mini-layer,
    .xgplayer-poster,
    .xgplayer-controls,
    .xgplayer-start,
    .xgplayer-loading,
    [class*="pc-ended-"],
    [class*="pc-scan-"],
    [class*="pc-guide-"],
    [class*="pc-login-required-"],
    [class*="pc-error-"],
    [class*="pc-controls-"],
    [class*="pc-centerPlay-"],
    [class*="modal"],
    [class*="dialog"],
    [class*="side-bar"],
    [class*="recommend"],
    .web-login-container {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `

  const addStyle = () => {
    const parent = document.head || document.documentElement
    if (parent) {
      if (!document.getElementById('westplay-hongguo-style')) {
        parent.appendChild(style)
      }
    } else {
      requestAnimationFrame(addStyle)
    }
  }
  addStyle()
  document.addEventListener('DOMContentLoaded', addStyle)

  const findActiveVideo = () => {
    const wp = document.getElementById('wp-hongguo-video')
    if (wp) return wp
    const mse = document.querySelector('#pc-mse video, video.pc-media-q_1ues')
    if (mse) return mse
    const all = Array.from(document.querySelectorAll('video'))
    return all.find((v) => !v.paused && v.currentTime > 0) || all[0] || null
  }

  const getPlayerContext = () => {
    try {
      const ld = window._ROUTER_DATA?.loaderData
      if (!ld) return null
      return ld['player_(series_id)/(vid)/page'] || ld['player_(series_id)/page'] || null
    } catch {
      return null
    }
  }

  const parseEpisodeFromContext = () => {
    const ctx = getPlayerContext()
    const vids = ctx?.seriesDetail?.vid_list || currentDrama?.vidList
    const pathVid = location.pathname.match(/\/player\/\d+\/(\d+)/)?.[1]
    const vid = pathVid || ctx?.vid || currentVid
    if (Array.isArray(vids) && vid) {
      const idx = vids.indexOf(vid)
      if (idx >= 0) return idx + 1
    }
    return currentEpisode || 1
  }

  const sendPlayback = (override = {}) => {
    if (!currentDrama && !location.pathname.startsWith('/player/')) return
    const now = performance.now()
    if (!override.force && !override.error && override.status === undefined && now - lastPlaybackAt < 250 && isPlaying) {
      return
    }
    lastPlaybackAt = now

    const ctx = getPlayerContext()
    const detail = ctx?.seriesDetail
    const ep = parseEpisodeFromContext()
    const dramaId = currentDrama?.id || ctx?.series_id || location.pathname.match(/\/player\/(\d+)/)?.[1] || undefined
    const dramaTitle = currentDrama?.title || detail?.series_name || '红果短剧'
    const totalEpisodes = currentDrama?.totalEpisodes || detail?.episode_cnt || 0
    const accessibleEpisodes =
      currentDrama?.accessibleEpisodes ?? detail?.accessible_episode_cnt ?? undefined
    const artwork = currentDrama?.cover || toHttps(detail?.series_cover)
    const rawDuration = currentMedia && Number.isFinite(currentMedia.duration) ? currentMedia.duration : 0
    const duration = rawDuration > 0 ? rawDuration : ctx?.publicVideoSeo?.durationSeconds || 120
    const position = currentMedia && Number.isFinite(currentMedia.currentTime) ? currentMedia.currentTime : 0
    const status = override.status ?? (isEnded ? 'ended' : isPlaying ? 'playing' : 'paused')

    post({
      type: 'playback',
      playback: {
        dramaId,
        vid: currentVid || ctx?.vid || undefined,
        title: `${dramaTitle} · 第${ep}集`,
        dramaTitle,
        episodeTitle: `第${ep}集`,
        artist: currentDrama?.author || '红果短剧',
        author: currentDrama?.author || '红果短剧',
        artwork: artwork || undefined,
        episode: ep,
        episodeNumber: ep,
        totalEpisodes: totalEpisodes || undefined,
        accessibleEpisodes,
        duration,
        position,
        status,
        speed: currentSpeed,
        autoNext,
        error: override.error ?? detectedError ?? undefined,
      },
    })
  }

  const hookMedia = (el) => {
    if (!el || el === currentMedia) return
    currentMedia = el
    stallWatchSince = performance.now()
    el.playbackRate = currentSpeed
    if (wantedPlaying) {
      el.muted = false
      el.volume = currentVolume
    }

    const kickIfWanted = () => {
      if (!wantedPlaying || isEnded || detectedError) return
      el.muted = false
      el.volume = currentVolume
      el.playbackRate = currentSpeed
      if (el.paused) el.play().catch(() => {})
    }

    el.addEventListener('loadeddata', kickIfWanted)
    el.addEventListener('canplay', kickIfWanted)

    el.addEventListener('play', () => {
      if (!wantedPlaying) {
        try {
          el.pause()
        } catch {}
        return
      }
      isPlaying = true
      isEnded = false
      detectedError = null
      el.muted = false
      el.volume = currentVolume
      el.playbackRate = currentSpeed
      sendPlayback({ status: 'playing', force: true })
    })

    el.addEventListener('playing', () => {
      if (!wantedPlaying) {
        try {
          el.pause()
        } catch {}
        return
      }
      hasPlayedVideo = true
      isPlaying = true
      isEnded = false
      detectedError = null
      el.muted = false
      el.volume = currentVolume
      el.playbackRate = currentSpeed
      sendPlayback({ status: 'playing', force: true })
    })

    el.addEventListener('pause', () => {
      isPlaying = false
      sendPlayback({ status: isEnded ? 'ended' : 'paused', force: true })
    })

    el.addEventListener('timeupdate', () => {
      if (el.currentTime > 0.3) {
        hasPlayedVideo = true
        stallWatchSince = performance.now()
      }
      if (el.duration > 2 && el.currentTime >= el.duration - 0.35 && !isEnded) {
        handleEpisodeEnded()
        return
      }
      sendPlayback()
    })

    el.addEventListener('ended', () => {
      handleEpisodeEnded()
    })

    el.addEventListener('error', () => {
      if (!wantedPlaying) return
      tryFallbackPlayback()
    })
  }

  try {
    const mediaObserver = new MutationObserver(() => {
      const v = findActiveVideo()
      if (v) hookMedia(v)
    })
    mediaObserver.observe(document.documentElement, { childList: true, subtree: true })
  } catch {}

  const handleEpisodeEnded = () => {
    if (isEnded) return
    isEnded = true
    isPlaying = false
    const total = currentDrama?.totalEpisodes || 0
    const acc = currentDrama?.accessibleEpisodes
    const nextEp = parseEpisodeFromContext() + 1
    const canAutoAdvance =
      autoNext &&
      wantedPlaying &&
      (total === 0 || nextEp <= total) &&
      (acc === undefined || acc === null || acc === 0 || nextEp <= acc)

    if (canAutoAdvance) {
      sendPlayback({ status: 'ended', force: true })
      selectEpisode(nextEp)
    } else {
      wantedPlaying = false
      writePersisted()
      sendPlayback({ status: 'ended', force: true })
    }
  }

  const tryFallbackPlayback = async () => {
    if (!currentVid || !wantedPlaying) return
    if (fallbackAttemptedVid === currentVid || document.getElementById('wp-hongguo-video')) return
    fallbackAttemptedVid = currentVid
    try {
      const res = await nativeFetch('/api/video/protected/fallback-play-info', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: currentVid }),
      })
      if (res.status === 403) {
        detectedError = 'episode_locked'
        isPlaying = false
        sendPlayback({ status: 'paused', error: 'episode_locked', force: true })
        return
      }
      if (!res.ok) return
      const data = await res.json()
      if (data?.main_url) {
        let wp = document.getElementById('wp-hongguo-video')
        if (!wp) {
          wp = document.createElement('video')
          wp.id = 'wp-hongguo-video'
          wp.playsInline = true
          document.body.appendChild(wp)
        }
        const prev = document.querySelector('#pc-mse video')
        if (prev && prev !== wp) {
          try {
            prev.pause()
            prev.removeAttribute('src')
          } catch {}
        }
        wp.src = data.main_url
        wp.muted = false
        wp.volume = currentVolume
        wp.playbackRate = currentSpeed
        hookMedia(wp)
        wp.play().catch(() => {})
      }
    } catch {}
  }

  const checkPlayerBlockers = () => {
    if (!wantedPlaying || !location.pathname.startsWith('/player/')) return
    const ctx = getPlayerContext()
    if (document.querySelector('[class*="pc-login-required-"]') || (ctx?.req?.pcLoginRequired && ctx?.req?.pcPlaybackAuthState === 'guest')) {
      if (detectedError !== 'login_required') {
        detectedError = 'login_required'
        isPlaying = false
        sendPlayback({ status: 'paused', error: 'login_required', force: true })
      }
      return
    }
    const endedModal = document.querySelector('[class*="pc-ended-"]')
    if (endedModal && !hasPlayedVideo && (!currentMedia || currentMedia.currentTime < 1)) {
      if (detectedError !== 'episode_locked') {
        detectedError = 'episode_locked'
        isPlaying = false
        sendPlayback({ status: 'paused', error: 'episode_locked', force: true })
      }
      return
    }
    const errEl = document.querySelector('[class*="pc-error-"]')
    if (errEl && errEl.textContent?.trim() && !detectedError) {
      tryFallbackPlayback()
    }
  }

  setInterval(() => {
    suppressDailyLoginPrompt()
    const v = findActiveVideo()
    if (v) {
      hookMedia(v)
      if (wantedPlaying && !isEnded && !detectedError) {
        if (v.paused && (v.readyState >= 1 || performance.now() > 2200)) {
          v.muted = false
          v.volume = currentVolume
          v.playbackRate = currentSpeed
          v.play().catch(() => {})
        } else if (
          !hasPlayedVideo &&
          v.currentTime === 0 &&
          stallWatchSince > 0 &&
          performance.now() - stallWatchSince > 6500 &&
          !document.querySelector('[class*="pc-login-required-"], [class*="pc-ended-"]')
        ) {
          tryFallbackPlayback()
        }
      }
    }
    checkPlayerBlockers()
    checkStatus()
  }, 450)

  let lastSignedIn = null
  const checkStatus = () => {
    const hasUserCookies =
      document.cookie.includes('sessionid=') ||
      document.cookie.includes('sessionid_ss=') ||
      document.cookie.includes('sid_tt=') ||
      document.cookie.includes('uid_tt=')

    const ctxReq = getPlayerContext()?.req
    const ctxAuth = ctxReq?.pcPlaybackAuthState
    const hasProfile = Boolean(
      ctxReq?.pcLoginProfile ||
        document.querySelector('[class*="pc-profile"]:not([class*="loading"]):not([class*="entry"])'),
    )
    const signedIn =
      Boolean(hasUserCookies) || ctxAuth === 'authenticated' || (ctxAuth !== 'guest' && hasProfile)
    if (signedIn !== lastSignedIn) {
      lastSignedIn = signedIn
      post({ type: 'state', state: { signedIn, playing: isPlaying } })
    }
  }

  // --- Data mapping helpers matching hongguoduanju.com schemas ---

  const mapCelebrities = (list) =>
    Array.isArray(list)
      ? list.map((c) => ({
          id: c.celebrity_id ? String(c.celebrity_id) : undefined,
          name: cleanText(c.nickname || c.name || ''),
          role: cleanText(c.sub_title || '') || undefined,
          avatar: toHttps(c.avatar),
        })).filter((c) => c.name)
      : []

  const extractTags = (item) => {
    if (Array.isArray(item.tags) && item.tags.length > 0) {
      return item.tags.map((t) => cleanText(t)).filter(Boolean)
    }
    if (Array.isArray(item.category_list) && item.category_list.length > 0) {
      return item.category_list.map((c) => cleanText(c?.name || c)).filter(Boolean)
    }
    return []
  }

  const mapSeriesItem = (item, extra = {}) => {
    if (!item) return null
    const id = String(item.series_id || item.seriesId || item.id || '')
    const title = cleanText(item.series_name || item.series_title || item.title || '')
    if (!id || !title) return null
    const tags = extractTags(item)
    const celebrities = mapCelebrities(item.celebrities)
    const leadActors = celebrities.slice(0, 2).map((c) => c.name).join(' / ')
    const totalEpisodes = Number(item.episode_cnt || item.episodeCount || item.series_episode_info?.episode_cnt || 0)
    const accessibleEpisodes =
      item.accessible_episode_cnt !== undefined
        ? Number(item.accessible_episode_cnt)
        : item.openEpisodeCount !== undefined
          ? Number(item.openEpisodeCount)
          : undefined
    const vidList = Array.isArray(item.vid_list)
      ? item.vid_list.map(String)
      : Array.isArray(item.episodeVids)
        ? item.episodeVids.map(String)
        : undefined
    return {
      id,
      title,
      category: tags[0] || (item.genre === '205' ? '漫剧' : '短剧'),
      tags: tags.length > 0 ? tags : undefined,
      author: leadActors || (item.genre === '205' ? '红果漫剧' : '红果短剧'),
      cover: toHttps(item.series_cover || item.cover),
      backdrop: toHttps(item.background_cover_pc || item.background_cover),
      titleArt: toHttps(item.title_link_pc || item.title_link),
      totalEpisodes,
      accessibleEpisodes,
      episodeText: cleanText(item.episode_right_text || (totalEpisodes > 0 ? `全${totalEpisodes}集` : '')) || undefined,
      synopsis: cleanText(item.series_intro || item.description || '') || undefined,
      heatText: cleanText(item.heatText || '') || undefined,
      scoreText: cleanText(item.scoreText || '') || undefined,
      favoriteText: cleanText(item.favoriteText || '') || undefined,
      likeText: cleanText(item.likeText || '') || undefined,
      rank: typeof item.rank === 'number' ? item.rank : undefined,
      statusTags: Array.isArray(item.statusTags) && item.statusTags.length > 0 ? item.statusTags : undefined,
      genre: item.genre ? String(item.genre) : undefined,
      vidList: vidList && vidList.length > 0 ? vidList : undefined,
      ...extra,
    }
  }

  const parseDeferredJson = (text) => {
    const trimmed = String(text || '').trim()
    if (!trimmed) throw new Error('Empty response body')
    try {
      return JSON.parse(trimmed)
    } catch {}

    const merged = {}
    let parsedAny = false
    for (const raw of trimmed.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const payload = line.startsWith('data:') ? line.slice(5).trim() : line
      if (!payload) continue
      try {
        const obj = JSON.parse(payload)
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          Object.assign(merged, obj)
          parsedAny = true
        }
      } catch {}
    }
    if (!parsedAny) throw new Error('Invalid deferred JSON response')
    return merged
  }

  const fetchJson = async (url, init) => {
    const absUrl = new URL(url, 'https://hongguoduanju.com').href
    const res = await nativeFetch(absUrl, { credentials: 'include', ...init })
    if (!res.ok || res.status === 204) throw new Error(`HTTP ${res.status}`)
    return parseDeferredJson(await res.text())
  }

  const fetchDramaDetail = async (dramaId) => {
    if (detailCache.has(dramaId)) return detailCache.get(dramaId)

    const playerUrl = `/player/${encodeURIComponent(dramaId)}?__loader=${encodeURIComponent('player_(series_id)/page')}&__ssrDirect=true`
    const detailUrl = `/detail?series_id=${encodeURIComponent(dramaId)}&__loader=detail_page&__ssrDirect=true`

    const [playerData, detailPageData] = await Promise.all([
      fetchJson(playerUrl).catch(() => null),
      fetchJson(detailUrl).catch(() => null),
    ])

    const sd = {
      ...(detailPageData?.seriesDetail || {}),
      ...(playerData?.seriesDetail || {}),
    }
    if (!sd.series_id && !sd.seriesId && !sd.id && dramaId) {
      sd.series_id = dramaId
    }
    const drama = mapSeriesItem(sd)
    if (!drama) {
      throw new Error('剧集详情数据暂不可用')
    }

    const vidList = Array.isArray(sd.vid_list) ? sd.vid_list.map(String) : drama.vidList || []
    const accessibleEpisodes = Number(sd.accessible_episode_cnt ?? drama.accessibleEpisodes ?? 5)
    const celebrities = mapCelebrities(sd.celebrities)
    const rawRecs = Array.isArray(detailPageData?.recommendations?.videoList)
      ? detailPageData.recommendations.videoList
      : Array.isArray(playerData?.recommendationsFromSearch)
        ? playerData.recommendationsFromSearch
        : []
    const recommendations = rawRecs.map((r) => mapSeriesItem(r)).filter(Boolean)

    const detail = {
      drama: { ...drama, vidList: vidList.length > 0 ? vidList : drama.vidList, accessibleEpisodes },
      celebrities,
      vidList,
      accessibleEpisodes,
      favoriteCount:
        playerData?.seriesSocialInfo?.series_favorite_count ||
        detailPageData?.seriesSocialInfo?.series_favorite_count
          ? String(
              playerData?.seriesSocialInfo?.series_favorite_count ||
                detailPageData?.seriesSocialInfo?.series_favorite_count,
            )
          : undefined,
      likeCount: playerData?.episodeSocialInfo?.episode_like_count
        ? String(playerData.episodeSocialInfo.episode_like_count)
        : undefined,
      reviewCount: playerData?.episodeSocialInfo?.reviews?.total_count
        ? String(playerData.episodeSocialInfo.reviews.total_count)
        : undefined,
      recordNumber: cleanText(sd.record_number || '') || undefined,
      recommendations,
    }
    detailCache.set(dramaId, detail)
    return detail
  }

  const navigateToPlay = async (drama, episode, explicitVid) => {
    const token = ++playAttemptToken
    wantedPlaying = true
    isEnded = false
    detectedError = null
    hasPlayedVideo = false
    fallbackAttemptedVid = null
    stallWatchSince = performance.now()
    currentEpisode = Math.max(1, Number(episode) || 1)
    if (drama) currentDrama = drama

    let vid = explicitVid || currentDrama?.vidList?.[currentEpisode - 1]
    if (!vid && currentDrama?.id) {
      try {
        const detail = await fetchDramaDetail(currentDrama.id)
        if (token !== playAttemptToken) return
        currentDrama = { ...currentDrama, ...detail.drama }
        vid = detail.vidList[currentEpisode - 1] || detail.vidList[0]
      } catch {}
    }

    currentVid = vid || null
    writePersisted()
    sendPlayback({ status: 'playing', force: true })

    if (!currentDrama?.id) return
    const targetPath = currentVid ? `/player/${currentDrama.id}/${currentVid}` : `/player/${currentDrama.id}`
    if (location.pathname !== targetPath) {
      location.href = targetPath
    } else {
      const v = findActiveVideo()
      if (v) {
        hookMedia(v)
        v.currentTime = 0
        v.muted = false
        v.volume = currentVolume
        v.playbackRate = currentSpeed
        v.play().catch(() => {})
      }
    }
  }

  const selectEpisode = (epNumber, explicitVid) => {
    const ep = Math.max(1, Number(epNumber) || 1)
    navigateToPlay(currentDrama, ep, explicitVid)
  }

  const stopPlayback = () => {
    playAttemptToken++
    wantedPlaying = false
    isPlaying = false
    isEnded = false
    detectedError = null
    hasPlayedVideo = false
    fallbackAttemptedVid = null
    stallWatchSince = 0
    currentDrama = null
    currentVid = null
    writePersisted()
    const v = findActiveVideo()
    if (v) {
      try {
        v.pause()
        v.removeAttribute('src')
        v.load()
      } catch {}
    }
    currentMedia = null
    post({ type: 'playback', playback: null })
    if (location.pathname !== '/' || location.search !== '?tab=home') {
      location.href = 'https://hongguoduanju.com/?tab=home'
    }
  }

  // --- Host command handler ---

  window.westplayHongguoCommand = (cmd) => handleHost(cmd)

  const handleMessage = (data) => {
    try {
      if (typeof data === 'string') {
        const trimmed = data.trim()
        if (!trimmed.startsWith('{')) return
        handleHost(JSON.parse(trimmed))
      } else if (data && typeof data === 'object' && typeof data.action === 'string') {
        handleHost(data)
      }
    } catch (e) {
      console.error('[hongguo] handleMessage error', e)
    }
  }

  window.chrome?.webview?.addEventListener('message', (event) => handleMessage(event.data))
  window.addEventListener('message', (event) => handleMessage(event.data))
  window.chrome?.webview?.postMessage({ ready: true })

  const cabSeen = {
    speakers: null,
    head: null,
    outside: null,
    equalizer: null,
    spectrum: null,
  }
  const CAB = {
    speakers: (d) => {
      const key = JSON.stringify(d.speakers ?? null)
      if (key === cabSeen.speakers) return
      cabSeen.speakers = key
      cab?.speakers(d.speakers)
    },
    head: (d) => {
      const key = JSON.stringify(d.head ?? null)
      if (key === cabSeen.head) return
      cabSeen.head = key
      cab?.head(d.head)
    },
    outside: (d) => {
      const key = `${Boolean(d.outside)}:${Number(d.distance || 0).toFixed(2)}`
      if (key === cabSeen.outside) return
      cabSeen.outside = key
      cab?.outside(d.outside, d.distance)
    },
    equalizer: (d) => {
      const key = JSON.stringify(d.equalizer ?? null)
      if (key === cabSeen.equalizer) return
      cabSeen.equalizer = key
      cab?.equalizer(d.equalizer)
    },
    spectrum: (d) => {
      const wanted = Boolean(d.spectrum)
      if (wanted === cabSeen.spectrum) return
      cabSeen.spectrum = wanted
      cab?.spectrum(wanted)
    },
  }

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'cab') {
      CAB.speakers(cmd)
      CAB.head(cmd)
      CAB.outside(cmd)
      CAB.equalizer(cmd)
      CAB.spectrum(cmd)
      return
    }
    if (action === 'crop') {
      cropOn = Boolean(cmd.on)
      document.documentElement.classList.toggle('westplay-crop', cropOn)
      writePersisted()
      return
    }
    if (action === 'play') {
      if (cmd.drama) {
        await navigateToPlay(cmd.drama, cmd.episode || 1, cmd.vid)
      } else {
        wantedPlaying = true
        isEnded = false
        detectedError = null
        writePersisted()
        const v = findActiveVideo()
        if (v) {
          hookMedia(v)
          v.muted = false
          v.volume = currentVolume
          v.playbackRate = currentSpeed
          v.play().catch(() => {})
        }
      }
      return
    }
    if (action === 'pause') {
      wantedPlaying = false
      writePersisted()
      if (currentMedia) currentMedia.pause()
      sendPlayback({ status: 'paused', force: true })
      return
    }
    if (action === 'stop') {
      stopPlayback()
      return
    }
    if (action === 'next') {
      selectEpisode(parseEpisodeFromContext() + 1)
      return
    }
    if (action === 'previous') {
      selectEpisode(Math.max(1, parseEpisodeFromContext() - 1))
      return
    }
    if (action === 'selectEpisode') {
      if (typeof cmd.episode === 'number') {
        selectEpisode(cmd.episode, cmd.vid)
      }
      return
    }
    if (action === 'setSpeed') {
      if (typeof cmd.speed === 'number' && Number.isFinite(cmd.speed) && cmd.speed !== currentSpeed) {
        currentSpeed = cmd.speed
        if (currentMedia) currentMedia.playbackRate = currentSpeed
        writePersisted()
        if (currentMedia) sendPlayback({ force: true })
      }
      return
    }
    if (action === 'setAutoNext') {
      const nextVal = Boolean(cmd.on)
      if (nextVal !== autoNext) {
        autoNext = nextVal
        writePersisted()
        if (currentMedia) sendPlayback({ force: true })
      }
      return
    }
    if (action === 'toggleAutoNext') {
      autoNext = !autoNext
      writePersisted()
      sendPlayback({ force: true })
      return
    }
    if (action === 'seek') {
      if (currentMedia && typeof cmd.seconds === 'number' && Number.isFinite(cmd.seconds)) {
        isEnded = false
        currentMedia.currentTime = Math.max(0, cmd.seconds)
        sendPlayback({ force: true })
      }
      return
    }
    if (action === 'volume') {
      if (typeof cmd.percent === 'number' && Number.isFinite(cmd.percent)) {
        currentVolume = Math.max(0, Math.min(1, cmd.percent / 100))
        if (currentMedia) {
          currentMedia.muted = currentVolume === 0
          currentMedia.volume = currentVolume
        }
        writePersisted()
      }
      return
    }
    if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }

  const handleAsk = async (id, question) => {
    try {
      const ask = question?.ask
      if (ask === 'home' || ask === 'catalog' || ask === 'featured') {
        const page = await fetchJson('/?tab=home&__loader=page&__ssrDirect=true')
        const rawBanners = Array.isArray(page.bannerList) && page.bannerList.length > 0 ? page.bannerList : page.mBannerList || []
        const banners = rawBanners.map((b) => mapSeriesItem(b)).filter(Boolean)
        const sections = (page.homeSections || []).map((sec) => ({
          tabType: String(sec.tab_type || 'all'),
          tabName: cleanText(sec.tab_name || '热播短剧'),
          dramas: (sec.video_list || []).map((v) => mapSeriesItem(v)).filter(Boolean),
        }))
        const seen = new Set()
        const dramas = []
        for (const sec of sections) {
          for (const d of sec.dramas) {
            if (!seen.has(d.id)) {
              seen.add(d.id)
              dramas.push(d)
            }
          }
        }
        post({ type: 'answer', answer: { id, banners, sections, dramas } })
      } else if (ask === 'feed') {
        const body = {
          action: question.cursor ? 'load_more' : 'initial',
          request_id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
          count: 10,
          ...(question.cursor && question.sessionId
            ? {
                session_id: question.sessionId,
                cursor: question.cursor,
                shown_entry_ids: Array.isArray(question.shownEntryIds) ? question.shownEntryIds : [],
              }
            : {}),
        }
        const data = await fetchJson('/api/home/feed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const dramas = (data.items || [])
          .map((it) => mapSeriesItem(it.detail, { entryId: it.entry_id, sessionId: data.session_id }))
          .filter(Boolean)
        post({
          type: 'answer',
          answer: {
            id,
            dramas,
            sessionId: data.session_id,
            nextCursor: data.next_cursor,
            hasMore: Boolean(data.has_more),
          },
        })
      } else if (ask === 'category') {
        const contentType = question.contentType || 'real-drama'
        const slug = question.slug || ''
        const pageNum = Math.max(1, Number(question.page) || 1)
        const pageParam = pageNum > 1 ? `page=${pageNum}&` : ''
        const path = slug
          ? `/category/${encodeURIComponent(contentType)}/${encodeURIComponent(slug)}`
          : `/category/${encodeURIComponent(contentType)}`
        const data = await fetchJson(`${path}?${pageParam}__loader=${encodeURIComponent('category_$')}&__ssrDirect=true`)
        const selectors = (data.selectorList?.[0]?.items || []).map((item) => ({
          id: String(item.selector_item_id || ''),
          name: cleanText(item.show_name || ''),
        })).filter((s) => s.id && s.name)
        const dramas = (data.recommendList || []).map((v) => mapSeriesItem(v)).filter(Boolean)
        const pag = data.pagination || {}
        post({
          type: 'answer',
          answer: {
            id,
            selectors,
            dramas,
            pageNum: pag.pageNum || pageNum,
            totalPages: pag.totalPages || 1,
            total: pag.total || dramas.length,
            hasMore: (pag.pageNum || pageNum) < (pag.totalPages || 1),
          },
        })
      } else if (ask === 'rank') {
        const kind = question.kind || 'hot-drama'
        const pageNum = Math.max(1, Number(question.page) || 1)
        const pageParam = pageNum > 1 ? `page=${pageNum}&` : ''
        const loader = `rank_${kind}/page`
        const data = await fetchJson(
          `/rank/${encodeURIComponent(kind)}?${pageParam}__loader=${encodeURIComponent(loader)}&__ssrDirect=true`,
        )
        const dramas = (data.content?.rankList || []).map((v) => mapSeriesItem(v)).filter(Boolean)
        const pag = data.pagination || {}
        post({
          type: 'answer',
          answer: {
            id,
            dramas,
            updatedText: cleanText(data.updatedText || ''),
            pageNum: pag.pageNum || pageNum,
            totalPages: pag.totalPages || 1,
            hasMore: Boolean(pag.nextUrl) || (pag.pageNum || pageNum) < (pag.totalPages || 1),
          },
        })
      } else if (ask === 'suggest') {
        const q = (question.query || '').trim()
        if (!q) {
          post({ type: 'answer', answer: { id, suggestions: [] } })
          return
        }
        const data = await fetchJson(`/api/search/suggestion?query=${encodeURIComponent(q)}`)
        const list = Array.isArray(data.suggestionList) ? data.suggestionList : []
        const suggestions = list
          .map((s) => cleanText(s.name || (Array.isArray(s.display_words) ? s.display_words.join('') : '')))
          .filter(Boolean)
        const dramas = list.map((s) => mapSeriesItem(s.video_data)).filter(Boolean)
        post({ type: 'answer', answer: { id, suggestions: Array.from(new Set(suggestions)), dramas } })
      } else if (ask === 'search') {
        const q = (question.query || '').trim()
        if (!q) {
          post({ type: 'answer', answer: { id, dramas: [] } })
          return
        }
        const data = await fetchJson(`/api/search/result?query=${encodeURIComponent(q)}`)
        const dramas = (data.searchList || [])
          .filter((item) => item.doc_type === 23 && item.video_data)
          .map((item) => mapSeriesItem(item.video_data))
          .filter(Boolean)
        post({ type: 'answer', answer: { id, dramas, hasMore: Boolean(data.hasMore) } })
      } else if (ask === 'detail' || ask === 'episodes') {
        const dramaId = question.dramaId
        const detail = await fetchDramaDetail(dramaId)
        const total = Math.max(detail.drama.totalEpisodes || 0, detail.vidList.length)
        const episodes = Array.from({ length: total }, (_, i) => ({
          episode: i + 1,
          vid: detail.vidList[i],
          title: `第 ${i + 1} 集`,
          accessible: detail.accessibleEpisodes > 0 ? i + 1 <= detail.accessibleEpisodes : true,
        }))
        post({ type: 'answer', answer: { id, detail, episodes } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  checkStatus()
})()
