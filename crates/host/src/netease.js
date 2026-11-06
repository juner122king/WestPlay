// WestPlay: NetEase Cloud Music web player controller (crates/host/src/netease.rs).
// Runs in the hidden WebView2 hosting https://music.163.com/
;(() => {
  if (!location.hostname.includes('music.163.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  let sound = null
  let currentAudio = null
  let currentTrack = null
  let isPlaying = false

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
      isPlaying = true
      sendPlayback()
    })
    el.addEventListener('pause', () => {
      isPlaying = false
      sendPlayback()
    })
    el.addEventListener('timeupdate', () => {
      sendPlayback()
    })
    el.addEventListener('ended', () => {
      isPlaying = false
      sendPlayback()
      post({ type: 'ended' })
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
  const checkStatus = async () => {
    if (window.GUser && window.GUser.userId > 0) {
      currentUserId = window.GUser.userId
    }
    let signedIn = Boolean(
      (window.GUser && window.GUser.userId > 0) ||
      document.querySelector('a[href*="/user/home"]') ||
      document.querySelector('a[href*="/u?id="]') ||
      document.querySelector('.m-tophead img') ||
      document.querySelector('.head.f-fl img')
    )

    if (!signedIn && !checkingAccount) {
      checkingAccount = true
      try {
        const res = await fetch('https://music.163.com/api/nuser/account/get', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data && data.code === 200 && data.account && data.account.id) {
            signedIn = true
            currentUserId = data.account.id
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

  const sendPlayback = () => {
    if (!currentTrack) return
    post({
      type: 'playback',
      playback: {
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || 'Unknown Artist',
        artwork: currentTrack.artwork || null,
        duration: currentAudio ? currentAudio.duration || 0 : currentTrack.duration || 0,
        position: currentAudio ? currentAudio.currentTime || 0 : 0,
        status: isPlaying ? 'playing' : 'paused'
      }
    })
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
        currentTrack = cmd.track
        if (!currentAudio) {
          const created = document.createElement('audio')
          created.id = 'wp-netease-audio'
          document.body.appendChild(created)
          hookAudio(created)
        }
        if (cmd.track.url) {
          currentAudio.src = cmd.track.url
          currentAudio.play().catch(() => {})
        } else if (cmd.track.id) {
          // Play via standard NetEase media outer URL with API fallback
          currentAudio.src = `https://music.163.com/song/media/outer/url?id=${cmd.track.id}.mp3`
          currentAudio.play().catch(async () => {
            try {
              const res = await fetch(`https://music.163.com/api/song/enhance/player/url?id=${cmd.track.id}&ids=[${cmd.track.id}]&br=320000`)
              const data = await res.json()
              if (data.data && data.data[0] && data.data[0].url) {
                currentAudio.src = data.data[0].url
                currentAudio.play().catch(() => {})
              }
            } catch {}
          })
        }
      } else if (currentAudio) {
        currentAudio.play().catch(() => {})
      }
    } else if (action === 'pause') {
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

  const handleAsk = async (id, question) => {
    try {
      if (question.ask === 'search') {
        const res = await fetch(`https://music.163.com/api/search/get/web?csrf_token=&s=${encodeURIComponent(question.query)}&type=1&offset=0&total=true&limit=30`)
        const data = await res.json()
        const songs = (data?.result?.songs || []).map(s => ({
          id: String(s.id),
          title: s.name,
          artist: (s.artists || []).map(a => a.name).join(', '),
          album: s.album?.name,
          artwork: s.album?.picUrl || null,
          duration: (s.duration || 0) / 1000
        }))
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'recommend' || question.ask === 'top') {
        const res = await fetch(`https://music.163.com/api/playlist/detail?id=3778678`) // Hot Playlist
        const data = await res.json()
        const songs = (data?.result?.tracks || []).slice(0, 50).map(s => ({
          id: String(s.id),
          title: s.name,
          artist: (s.artists || []).map(a => a.name).join(', '),
          album: s.album?.name,
          artwork: s.album?.picUrl || null,
          duration: (s.duration || 0) / 1000
        }))
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'chart') {
        const chartId = question.id || '3778678'
        const res = await fetch(`https://music.163.com/api/playlist/detail?id=${chartId}`)
        const data = await res.json()
        const songs = (data?.result?.tracks || []).slice(0, 50).map(s => ({
          id: String(s.id),
          title: s.name,
          artist: (s.artists || []).map(a => a.name).join(', '),
          album: s.album?.name,
          artwork: s.album?.picUrl || null,
          duration: (s.duration || 0) / 1000
        }))
        post({ type: 'answer', answer: { id, songs } })
      } else if (question.ask === 'userPlaylists') {
        let uid = currentUserId
        if (!uid) {
          try {
            const uRes = await fetch('https://music.163.com/api/nuser/account/get', { credentials: 'include' })
            const uData = await uRes.json()
            if (uData?.account?.id) {
              uid = uData.account.id
              currentUserId = uid
            }
          } catch {}
        }
        if (uid) {
          const plRes = await fetch(`https://music.163.com/api/user/playlist?uid=${uid}&limit=30&offset=0`, { credentials: 'include' })
          const plData = await plRes.json()
          const playlists = (plData?.playlist || []).map(p => ({
            id: String(p.id),
            name: p.name,
            coverImgUrl: p.coverImgUrl,
            trackCount: p.trackCount || 0
          }))
          post({ type: 'answer', answer: { id, playlists } })
        } else {
          post({ type: 'answer', answer: { id, playlists: [] } })
        }
      } else if (question.ask === 'playlistTracks') {
        const res = await fetch(`https://music.163.com/api/playlist/detail?id=${question.playlistId}`, { credentials: 'include' })
        const data = await res.json()
        const songs = (data?.result?.tracks || []).slice(0, 100).map(s => ({
          id: String(s.id),
          title: s.name,
          artist: (s.artists || []).map(a => a.name).join(', '),
          album: s.album?.name,
          artwork: s.album?.picUrl || null,
          duration: (s.duration || 0) / 1000
        }))
        post({ type: 'answer', answer: { id, songs } })
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
      const res = await fetch(`https://music.163.com/api/playlist/detail?id=3778678`)
      const data = await res.json()
      const songs = (data?.result?.tracks || []).slice(0, 30).map(s => ({
        id: String(s.id),
        title: s.name,
        artist: (s.artists || []).map(a => a.name).join(', '),
        album: s.album?.name,
        artwork: s.album?.picUrl || null,
        duration: (s.duration || 0) / 1000
      }))
      if (songs.length > 0) {
        post({ type: 'answer', answer: { id: 1, songs } })
      }
    } catch (e) {
      console.error('[netease] auto fetch top tracks error', e)
    }
  }

  // Tell host initial state and fetch real online songs
  checkStatus()
  fetchTopTracks()
})()
