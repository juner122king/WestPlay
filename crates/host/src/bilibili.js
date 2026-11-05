// WestPlay: Bilibili video & audio controller (crates/host/src/bilibili.rs).
// Runs in the hidden WebView2 hosting https://www.bilibili.com/
;(() => {
  if (!location.hostname.includes('bilibili.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  let sound = null
  let currentMedia = null
  let currentVideo = null
  let isPlaying = false

  const hookMedia = (el) => {
    if (!el || el === currentMedia) return
    currentMedia = el
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
    const videos = document.querySelectorAll('video, audio')
    videos.forEach(hookMedia)
    checkStatus()
  }, 1000)

  let lastSignedIn = null
  const checkStatus = () => {
    const signedIn = document.cookie.includes('DedeUserID')
    if (signedIn !== lastSignedIn) {
      lastSignedIn = signedIn
      post({
        type: 'state',
        state: { signedIn, playing: isPlaying }
      })
    }
  }

  const sendPlayback = () => {
    if (!currentVideo) return
    post({
      type: 'playback',
      playback: {
        title: currentVideo.title || '哔哩哔哩视频',
        artist: currentVideo.author || 'UP主',
        artwork: currentVideo.artwork || null,
        duration: currentMedia ? currentMedia.duration || 0 : currentVideo.duration || 0,
        position: currentMedia ? currentMedia.currentTime || 0 : 0,
        status: isPlaying ? 'playing' : 'paused'
      }
    })
  }

  window.westplayBilibiliCommand = (cmd) => {
    handleHost(cmd)
  }

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'play') {
      if (cmd.video) {
        currentVideo = cmd.video
        if (!currentMedia) {
          const created = document.createElement('video')
          created.id = 'wp-bilibili-video'
          created.playsInline = true
          created.style.position = 'fixed'
          created.style.top = '0'
          created.style.left = '0'
          created.style.width = '100%'
          created.style.height = '100%'
          created.style.zIndex = '9999'
          document.body.appendChild(created)
          hookMedia(created)
        }
        if (cmd.video.url) {
          currentMedia.src = cmd.video.url
          currentMedia.play().catch(() => {})
        } else if (cmd.video.bvid) {
          // Resolve video playurl
          try {
            // Get cid first
            const infoRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${cmd.video.bvid}`)
            const infoData = await infoRes.json()
            const cid = infoData?.data?.cid || cmd.video.cid
            if (cid) {
              const playRes = await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${cmd.video.bvid}&cid=${cid}&qn=64&fnval=1`)
              const playData = await playRes.json()
              const durl = playData?.data?.durl?.[0]?.url
              if (durl) {
                currentMedia.src = durl
                currentMedia.play().catch(() => {})
              }
            }
          } catch (e) {
            console.error('Bilibili resolve error', e)
          }
        }
      } else if (currentMedia) {
        currentMedia.play().catch(() => {})
      }
    } else if (action === 'pause') {
      if (currentMedia) currentMedia.pause()
    } else if (action === 'seek') {
      if (currentMedia && typeof cmd.seconds === 'number') {
        currentMedia.currentTime = cmd.seconds
      }
    } else if (action === 'volume') {
      if (currentMedia && typeof cmd.percent === 'number') {
        currentMedia.volume = Math.max(0, Math.min(1, cmd.percent / 100))
      }
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }

  const handleAsk = async (id, question) => {
    try {
      if (question.ask === 'search') {
        const res = await fetch(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(question.query)}&page=1`)
        const data = await res.json()
        const videos = (data?.data?.result || []).map(v => ({
          bvid: v.bvid,
          title: (v.title || '').replace(/<[^>]+>/g, ''),
          author: v.author,
          artwork: v.pic ? (v.pic.startsWith('//') ? 'https:' + v.pic : v.pic) : null,
          duration: v.duration ? parseDuration(v.duration) : 0
        }))
        post({ type: 'answer', answer: { id, videos } })
      } else if (question.ask === 'popular' || question.ask === 'recommend') {
        const res = await fetch(`https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1`)
        const data = await res.json()
        const videos = (data?.data?.list || []).map(v => ({
          bvid: v.bvid,
          title: v.title,
          author: v.owner?.name,
          artwork: v.pic,
          duration: v.duration || 0
        }))
        post({ type: 'answer', answer: { id, videos } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  const parseDuration = (str) => {
    if (!str || typeof str !== 'string') return 0
    const parts = str.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  checkStatus()
})()
