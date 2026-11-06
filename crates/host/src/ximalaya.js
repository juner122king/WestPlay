// WestPlay: Ximalaya player controller (crates/host/src/ximalaya.rs).
// Runs in the hidden WebView2 hosting https://www.ximalaya.com/
;(() => {
  if (!location.hostname.includes('ximalaya.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  let sound = null
  let currentAudio = null
  let currentTrack = null
  let isPlaying = false

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

  setInterval(() => {
    const audios = document.querySelectorAll('audio')
    audios.forEach(hookAudio)
    checkStatus()
  }, 1000)

  let lastSignedIn = null
  const checkStatus = () => {
    const signedIn = document.cookie.includes('1&_token') || document.cookie.includes('1_l_flag')
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
        artist: currentTrack.album || currentTrack.artist || '喜马拉雅',
        artwork: currentTrack.artwork || null,
        duration: currentAudio ? currentAudio.duration || 0 : currentTrack.duration || 0,
        position: currentAudio ? currentAudio.currentTime || 0 : 0,
        status: isPlaying ? 'playing' : 'paused'
      }
    })
  }

  window.westplayXimalayaCommand = (cmd) => {
    handleHost(cmd)
  }
  window.chrome?.webview?.addEventListener('message', (event) => {
    try {
      const data = event.data
      handleHost(typeof data === 'string' ? JSON.parse(data) : data)
    } catch (e) {
      console.error('Ximalaya IPC parse error', e)
    }
  })

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'play') {
      if (cmd.track) {
        currentTrack = cmd.track
        if (!currentAudio) {
          const created = document.createElement('audio')
          created.id = 'wp-ximalaya-audio'
          document.body.appendChild(created)
          hookAudio(created)
        }
        if (cmd.track.url) {
          currentAudio.src = cmd.track.url
          currentAudio.play().catch(() => {})
        } else if (cmd.track.id) {
          // Resolve audio url from Ximalaya api
          try {
            const res = await fetch(`https://www.ximalaya.com/revision/play/v1/audio?id=${cmd.track.id}&ptype=1`)
            const data = await res.json()
            if (data?.data?.src) {
              currentAudio.src = data.data.src
              currentAudio.play().catch(() => {})
            }
          } catch (e) {
            console.error('Ximalaya audio fetch error', e)
          }
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
        const res = await fetch(`https://www.ximalaya.com/revision/search/main?core=all&spellchecker=true&device=iPhone&kw=${encodeURIComponent(question.query)}&page=1&rows=20`)
        const data = await res.json()
        const tracks = (data?.data?.track?.docs || []).map(t => ({
          id: String(t.trackId || t.id),
          title: t.title,
          artist: t.nickname || '喜马拉雅主播',
          album: t.albumTitle,
          artwork: t.coverPath ? (t.coverPath.startsWith('http') ? t.coverPath : 'https:' + t.coverPath) : null,
          duration: t.duration || 0
        }))
        post({ type: 'answer', answer: { id, tracks } })
      } else if (question.ask === 'recommend' || question.ask === 'category') {
        // Fetch rank or category (xiangsheng / audiobook)
        const category = question.category || 'xiangsheng'
        const res = await fetch(`https://www.ximalaya.com/revision/category/v2/albums?pageNum=1&pageSize=20&sort=1&category=${encodeURIComponent(category)}`)
        const data = await res.json()
        const albums = (data?.data?.albums || []).map(a => ({
          id: String(a.albumId),
          title: a.albumTitle,
          artist: a.anchorName || '喜马拉雅主播',
          artwork: a.coverPath ? (a.coverPath.startsWith('http') ? a.coverPath : 'https:' + a.coverPath) : null,
          description: a.intro
        }))
        post({ type: 'answer', answer: { id, albums } })
      } else if (question.ask === 'albumTracks') {
        const res = await fetch(`https://www.ximalaya.com/revision/album/v1/getTracksList?albumId=${question.albumId}&pageNum=1&pageSize=30`)
        const data = await res.json()
        const tracks = (data?.data?.tracks || []).map(t => ({
          id: String(t.trackId),
          title: t.title,
          artist: t.anchorName || '喜马拉雅主播',
          duration: t.duration || 0,
          artwork: t.coverPath ? (t.coverPath.startsWith('http') ? t.coverPath : 'https:' + t.coverPath) : null
        }))
        post({ type: 'answer', answer: { id, tracks } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  checkStatus()
})()
