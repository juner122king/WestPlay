// WestPlay: NetEase Cloud Music web player controller (crates/host/src/netease.rs).
// Runs in the hidden WebView2 hosting https://music.163.com/
;(() => {
  if (!location.hostname.includes('music.163.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  const toHttpsUrl = (url) => (typeof url === 'string' && url ? url.replace(/^http:\/\//i, 'https://') : null)
  const fetchJsonSafe = async (url, init) => {
    try {
      const res = await fetch(url, init)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }
  let sound = null
  let currentAudio = null
  let currentTrack = null
  let isPlaying = false
  let playAttemptSeq = 0
  let reportedFailureSeq = 0
  let switchingTrack = false

  const reportPlaybackFailure = (attemptId, track, reason) => {
    if (!track || attemptId !== playAttemptSeq || attemptId === reportedFailureSeq) return
    reportedFailureSeq = attemptId
    isPlaying = false
    if (currentAudio && !currentAudio.paused) {
      try {
        currentAudio.pause()
      } catch {}
    }
    sendPlayback({
      status: 'paused',
      position: 0,
      error: reason || ((track.fee === 1 || track.fee === 4) ? 'vip_required' : 'unavailable')
    })
  }

  // Hook into any audio element
  const hookAudio = (el) => {
    if (!el || el === currentAudio) return
    currentAudio = el
    if (window.westplayCabSound) {
      sound = window.westplayCabSound(el, (bars) => {
        post({ type: 'spectrum', bars })
      })
    }
    el.addEventListener('play', () => {
      switchingTrack = false
      isPlaying = true
      sendPlayback()
    })
    el.addEventListener('pause', () => {
      isPlaying = false
      if (!switchingTrack) {
        sendPlayback()
      }
    })
    el.addEventListener('timeupdate', () => {
      if (!switchingTrack) {
        sendPlayback()
      }
    })
    el.addEventListener('ended', () => {
      isPlaying = false
      const dur = Number.isFinite(el.duration) ? el.duration : (currentTrack?.duration || 0)
      sendPlayback({ status: 'paused', duration: dur, position: dur, error: 'ended' })
      post({ type: 'ended' })
    })
    el.addEventListener('error', () => {
      if (switchingTrack || !currentTrack || !el.getAttribute('src')) return
      const reason = (currentTrack.fee === 1 || currentTrack.fee === 4) ? 'vip_required' : 'unavailable'
      reportPlaybackFailure(playAttemptSeq, currentTrack, reason)
    })
  }

  // Periodic check for audio element and sign-in status
  setInterval(() => {
    const audios = document.querySelectorAll('audio')
    audios.forEach(hookAudio)
    checkStatus()
  }, 1000)

  let lastSignedIn = null
  let currentUserId = null
  let checkingAccount = false

  const findUserIdInDom = () => {
    if (window.GUser && window.GUser.userId > 0) return String(window.GUser.userId)
    const links = document.querySelectorAll('a[href*="/user/home"], a[href*="/u?id="], a[href*="/user/event"], a[href*="/user/songs"]')
    for (const a of links) {
      const m = (a.getAttribute('href') || a.href || '').match(/[?&]id=(\d+)/)
      if (m && m[1]) return String(m[1])
    }
    return null
  }

  const checkStatus = async () => {
    const domUid = findUserIdInDom()
    if (domUid) {
      currentUserId = domUid
    }
    let signedIn = Boolean(
      currentUserId ||
      (window.GUser && window.GUser.userId > 0) ||
      document.querySelector('a[href*="/user/home"]') ||
      document.querySelector('a[href*="/u?id="]') ||
      document.querySelector('.m-tophead img') ||
      document.querySelector('.head.f-fl img')
    )

    if (!signedIn && !checkingAccount) {
      checkingAccount = true
      try {
        const res = await fetch('https://music.163.com/api/nuser/account/get', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
        if (res.ok) {
          const data = await res.json()
          if (data && data.code === 200 && data.account && data.account.id) {
            signedIn = true
            currentUserId = String(data.account.id)
          }
        }
      } catch (e) {
        // ignore
      } finally {
        checkingAccount = false
      }
    }

    if (signedIn !== lastSignedIn) {
      lastSignedIn = signedIn
      post({
        type: 'state',
        state: { signedIn, playing: isPlaying }
      })
    }
  }

  const sendPlayback = (extra = {}) => {
    if (!currentTrack) return
    const audioDur = currentAudio && Number.isFinite(currentAudio.duration) ? currentAudio.duration : 0
    const audioPos = currentAudio && Number.isFinite(currentAudio.currentTime) ? currentAudio.currentTime : 0
    post({
      type: 'playback',
      playback: {
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || 'Unknown Artist',
        artwork: currentTrack.artwork || null,
        duration: audioDur || currentTrack.duration || 0,
        position: audioPos,
        status: isPlaying ? 'playing' : 'paused',
        ...(currentTrack.id ? { trackId: String(currentTrack.id) } : {}),
        ...extra
      }
    })
  }

  const resolveTrackPlayback = async (track) => {
    if (track.url) return { url: toHttpsUrl(track.url) }
    const trackId = String(track.id || '').trim()
    if (!trackId) return { error: 'unavailable' }

    const encodedIds = encodeURIComponent(JSON.stringify([Number(trackId) || trackId]))
    const attempts = [
      () => fetchJsonSafe(`https://music.163.com/api/song/enhance/player/url/v1?ids=${encodedIds}&level=standard&encodeType=mp3`, { credentials: 'include' }),
      () => fetchJsonSafe(`https://music.163.com/api/song/enhance/player/url?id=${encodeURIComponent(trackId)}&ids=${encodedIds}&br=320000`, { credentials: 'include' })
    ]

    let lastItem = null
    for (const attempt of attempts) {
      const data = await attempt()
      if (!data || !Array.isArray(data.data) || data.data.length === 0) continue
      const item = data.data.find(d => String(d.id) === trackId) || data.data[0]
      lastItem = item
      if (item && item.url) {
        return { url: toHttpsUrl(item.url), isTrial: Boolean(item.freeTrialInfo) }
      }
    }

    if (lastItem) {
      const code = Number(lastItem.code)
      const fee = Number(lastItem.fee ?? track.fee ?? 0)
      if (code === -110 || fee === 1 || fee === 4 || track.fee === 1 || track.fee === 4) {
        return { error: 'vip_required' }
      }
      return { error: 'unavailable' }
    }

    // Fallback only if NetEase player URL API did not respond
    return { url: `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(trackId)}.mp3` }
  }

  const playTrack = async (track) => {
    const attemptId = ++playAttemptSeq
    currentTrack = track
    if (!currentAudio) {
      const created = document.createElement('audio')
      created.id = 'wp-netease-audio'
      document.body.appendChild(created)
      hookAudio(created)
    }

    switchingTrack = true
    try {
      if (!currentAudio.paused) {
        currentAudio.pause()
      }
    } catch {}

    const resolved = await resolveTrackPlayback(track)
    if (attemptId !== playAttemptSeq) return

    if (!resolved.url) {
      switchingTrack = false
      reportPlaybackFailure(attemptId, track, resolved.error || 'vip_required')
      return
    }

    currentAudio.src = resolved.url
    try {
      await currentAudio.play()
      if (attemptId === playAttemptSeq) {
        switchingTrack = false
      }
    } catch (err) {
      if (attemptId !== playAttemptSeq || err?.name === 'AbortError') return
      switchingTrack = false
      const reason = (track.fee === 1 || track.fee === 4) ? 'vip_required' : 'unavailable'
      reportPlaybackFailure(attemptId, track, reason)
    }
  }

  // Handle messages from host
  const handleMessage = (data) => {
    try {
      const cmd = typeof data === 'string' ? JSON.parse(data) : data
      handleHost(cmd)
    } catch (e) {
      console.error('[netease] handleMessage error', e)
    }
  }

  window.chrome?.webview?.addEventListener('message', (event) => handleMessage(event.data))
  window.addEventListener('message', (event) => handleMessage(event.data))
  window.chrome?.webview?.postMessage({ ready: true })

  // Also listen through custom dispatch if host injects directly
  window.westplayNeteaseCommand = (cmd) => {
    handleHost(cmd)
  }

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'play') {
      if (cmd.track) {
        await playTrack(cmd.track)
      } else if (currentAudio && currentAudio.getAttribute('src') && !currentAudio.error) {
        const attemptId = playAttemptSeq
        try {
          await currentAudio.play()
        } catch (err) {
          if (attemptId !== playAttemptSeq || err?.name === 'AbortError') return
          if (currentTrack) {
            await playTrack(currentTrack)
          }
        }
      } else if (currentTrack) {
        await playTrack(currentTrack)
      }
    } else if (action === 'pause') {
      switchingTrack = false
      if (currentAudio) currentAudio.pause()
    } else if (action === 'seek') {
      if (currentAudio && typeof cmd.seconds === 'number') {
        currentAudio.currentTime = cmd.seconds
      }
    } else if (action === 'volume') {
      if (currentAudio && typeof cmd.percent === 'number') {
        currentAudio.volume = Math.max(0, Math.min(1, cmd.percent / 100))
      }
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }

  const dedupeById = (items) => {
    const seen = new Set()
    const out = []
    for (const item of items) {
      if (!item || !item.id) continue
      const key = String(item.id)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
    return out
  }

  const mapTrack = (s, fallbackArtist = '未知歌手', privilege = null) => {
    const rawFee = s.fee ?? privilege?.fee
    const fee = Number.isFinite(Number(rawFee)) ? Number(rawFee) : 0
    const playable = privilege ? Number(privilege.st) >= 0 : s.status === undefined || Number(s.status) >= 0
    return {
      id: String(s.id),
      title: s.name || s.title || '未知歌曲',
      artist: (s.ar || s.artists || []).map(a => a.name).join(', ') || fallbackArtist,
      album: s.al?.name || s.album?.name || '',
      artwork: toHttpsUrl(s.al?.picUrl || s.album?.picUrl),
      duration: (s.dt || s.duration || 0) / 1000,
      fee,
      playable
    }
  }

  const mapPlaylist = (p, includeSubscribed = false) => ({
    id: String(p.id),
    name: p.name || '我的歌单',
    coverImgUrl: toHttpsUrl(p.coverImgUrl || p.picUrl),
    trackCount: p.trackCount || 0,
    playCount: p.playCount || 0,
    ...(includeSubscribed ? { subscribed: Boolean(p.subscribed) } : {})
  })

  const fetchRecommendedPlaylists = async (limit = 12) => {
    const personalized = await fetchJsonSafe(`https://music.163.com/api/personalized/playlist?limit=${limit}`, { credentials: 'include' })
    if (personalized && personalized.code === 200 && Array.isArray(personalized.result) && personalized.result.length > 0) {
      return dedupeById(personalized.result.map(p => mapPlaylist(p)))
    }
    const hq = await fetchJsonSafe(`https://music.163.com/api/playlist/highquality/list?cat=${encodeURIComponent('全部')}&limit=${limit}`, { credentials: 'include' })
    if (hq && hq.code === 200 && Array.isArray(hq.playlists) && hq.playlists.length > 0) {
      return dedupeById(hq.playlists.map(p => mapPlaylist(p)))
    }
    const hot = await fetchJsonSafe(`https://music.163.com/api/playlist/list?order=hot&cat=${encodeURIComponent('全部')}&limit=${limit}&offset=0`, { credentials: 'include' })
    if (hot && hot.code === 200 && Array.isArray(hot.playlists) && hot.playlists.length > 0) {
      return dedupeById(hot.playlists.map(p => mapPlaylist(p)))
    }
    return []
  }

  const fetchPlaylistSongs = async (playlistId, limit = 100, fallbackArtist = '未知歌手') => {
    const pid = String(playlistId || '').trim()
    if (!pid) return []
    const encodedPid = encodeURIComponent(pid)

    const attempts = [
      () => fetchJsonSafe(`https://music.163.com/api/v6/playlist/detail?id=${encodedPid}&n=${limit}`, { credentials: 'include' }),
      () => fetchJsonSafe('https://music.163.com/api/v6/playlist/detail', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `id=${encodedPid}&n=${limit}&s=8`
      }),
      () => fetchJsonSafe(`https://music.163.com/api/playlist/detail?id=${encodedPid}`, { credentials: 'include' })
    ]

    let rawTracks = []
    let trackIds = []
    const privById = new Map()
    const collectPrivileges = (list) => {
      if (!Array.isArray(list)) return
      for (const p of list) {
        if (p && p.id) privById.set(String(p.id), p)
      }
    }

    for (const attempt of attempts) {
      const data = await attempt()
      if (!data || (typeof data.code === 'number' && data.code !== 200)) continue
      const candidateObj = data.playlist || data.result || null
      const candidateTracks = candidateObj?.tracks || data.tracks || []
      const candidateTrackIds = candidateObj?.trackIds || []
      collectPrivileges(data.privileges || candidateObj?.privileges)
      if (candidateTracks.length > 0 || candidateTrackIds.length > 0) {
        rawTracks = candidateTracks
        trackIds = candidateTrackIds
        break
      }
    }

    // NetEase v6 playlist detail commonly truncates `tracks` to 10 songs while
    // listing full IDs in `trackIds`. Hydrate up to `limit` IDs via song/detail.
    const desiredCount = Math.min(limit, trackIds.length)
    if (desiredCount > rawTracks.length) {
      const rawById = new Map(rawTracks.map(t => [String(t.id), t]))
      const targetIds = trackIds.slice(0, desiredCount).map(t => Number(t.id ?? t)).filter(n => Number.isFinite(n) && n > 0)
      if (targetIds.length > 0) {
        const songDetail = await fetchJsonSafe('https://music.163.com/api/v3/song/detail', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `c=${encodeURIComponent(JSON.stringify(targetIds.map(id => ({ id }))))}`
        })
        if (songDetail && songDetail.code === 200 && Array.isArray(songDetail.songs) && songDetail.songs.length > 0) {
          collectPrivileges(songDetail.privileges)
          const hydratedById = new Map(songDetail.songs.map(s => [String(s.id), s]))
          const merged = targetIds.map(id => hydratedById.get(String(id)) || rawById.get(String(id))).filter(Boolean)
          if (merged.length > rawTracks.length) {
            rawTracks = merged
          }
        }
      }
    }

    return dedupeById(rawTracks.slice(0, limit).map(s => mapTrack(s, fallbackArtist, privById.get(String(s.id)))))
  }

  const handleAsk = async (id, question) => {
    try {
      if (question.ask === 'search') {
        const res = await fetch(`https://music.163.com/api/search/get/web?csrf_token=&s=${encodeURIComponent(question.query)}&type=1&offset=0&total=true&limit=30`)
        const data = await res.json()
        const songs = dedupeById((data?.result?.songs || []).map(s => mapTrack(s)))
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'recommend' || question.ask === 'top') {
        const [songs, playlists] = await Promise.all([
          fetchPlaylistSongs('3778678', 50),
          fetchRecommendedPlaylists(12)
        ])
        post({ type: 'answer', answer: { id, songs, playlists: playlists.length > 0 ? playlists : undefined } })
      } else if (question.ask === 'chart') {
        const chartId = question.id || '3778678'
        const songs = await fetchPlaylistSongs(chartId, 50)
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'userPlaylists') {
        let uid = currentUserId || findUserIdInDom()
        if (!uid) {
          try {
            const uRes = await fetch('https://music.163.com/api/nuser/account/get', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            })
            const uData = await uRes.json()
            if (uData?.account?.id) {
              uid = String(uData.account.id)
              currentUserId = uid
            }
          } catch {}
        }
        if (uid) {
          try {
            const plRes = await fetch(`https://music.163.com/api/user/playlist?uid=${encodeURIComponent(uid)}&limit=50&offset=0`, { credentials: 'include' })
            const plData = await plRes.json()
            const rawPlaylists = Array.isArray(plData?.playlist) ? plData.playlist : []
            const playlists = dedupeById(rawPlaylists.map(p => mapPlaylist(p, true)))
            post({ type: 'answer', answer: { id, playlists } })
          } catch (e) {
            post({ type: 'answer', answer: { id, playlists: [] } })
          }
        } else {
          post({ type: 'answer', answer: { id, playlists: [] } })
        }
      } else if (question.ask === 'playlistTracks') {
        try {
          const songs = await fetchPlaylistSongs(question.playlistId, 100, '群星')
          post({ type: 'answer', answer: { id, songs } })
        } catch (e) {
          console.error('[netease] fetch playlist tracks failed', e)
          post({ type: 'answer', answer: { id, failed: true, error: String(e), songs: [] } })
        }
      } else if (question.ask === 'lyrics') {
        const res = await fetch(`https://music.163.com/api/song/lyric?os=pc&id=${question.id}&lv=-1&kv=-1&tv=-1`)
        const data = await res.json()
        post({ type: 'answer', answer: { id, lyric: data?.lrc?.lyric || '' } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  const fetchTopTracks = async () => {
    try {
      const songs = await fetchPlaylistSongs('3778678', 30)
      if (songs.length > 0) {
        post({ type: 'answer', answer: { id: 0, songs } })
      }
    } catch (e) {
      console.error('[netease] auto fetch top tracks error', e)
    }
  }

  // Tell host initial state and fetch real online songs
  checkStatus()
  fetchTopTracks()
})()
