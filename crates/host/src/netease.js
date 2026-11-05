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
  const checkStatus = () => {
    const signedIn = document.cookie.includes('MUSIC_U')
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
  window.addEventListener('message', (event) => {
    handleHost(event.data)
  })

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
          // Resolve standard playback url
          try {
            const res = await fetch(`https://music.163.com/api/song/enhance/player/url?id=${cmd.track.id}&ids=[${cmd.track.id}]&br=320000`)
            const data = await res.json()
            if (data.data && data.data[0] && data.data[0].url) {
              currentAudio.src = data.data[0].url
              currentAudio.play().catch(() => {})
            }
          } catch (e) {
            console.error('Netease play failed', e)
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
        const songs = (data?.result?.tracks || []).slice(0, 30).map(s => ({
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

  // Tell host initial state
  checkStatus()
})()
