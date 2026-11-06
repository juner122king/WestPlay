// WestPlay: Bilibili video & audio controller (crates/host/src/bilibili.rs).
// Runs in the hidden WebView2 hosting https://www.bilibili.com/
;(() => {
  if (!location.hostname.includes('bilibili.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  let sound = null
  let currentMedia = null
  let currentVideo = null
  let isPlaying = false
  let wantedPlaying = false

  // Inject full-bleed video styles and strip site chrome
  const style = document.createElement('style')
  style.id = 'westplay-bilibili-style'
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
    #bilibili-player,
    .bpx-player-container,
    .bpx-player-video-wrap,
    .bpx-player-video-area,
    video,
    #wp-bilibili-video {
      visibility: visible !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      left: 0 !important;
      top: 0 !important;
      z-index: 2147483647 !important;
      background: #000 !important;
      object-fit: contain !important;
    }
    html.westplay-crop video,
    html.westplay-crop #wp-bilibili-video {
      object-fit: cover !important;
    }
    .bili-header,
    .bpx-player-dm-wrap,
    .bpx-player-control-wrap,
    .login-dialog-wrapper,
    .bili-mini-mask,
    .van-popover,
    .bpx-player-toast-wrap,
    .bili-guide-box {
      display: none !important;
      visibility: hidden !important;
    }
  `

  const addStyle = () => {
    const parent = document.head || document.documentElement
    if (parent && !document.getElementById('westplay-bilibili-style')) {
      parent.appendChild(style)
    }
  }
  addStyle()
  document.addEventListener('DOMContentLoaded', addStyle)

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

  const ensurePlaying = () => {
    if (!wantedPlaying) return
    const v = document.querySelector('video')
    if (v) {
      hookMedia(v)
      if (v.paused) {
        v.play().catch(() => {})
      }
    }
    const playBtn = document.querySelector('.bpx-player-ctrl-play')
    if (playBtn && playBtn.getAttribute('aria-label') === '播放') {
      try { playBtn.click() } catch {}
    }
  }

  const capResolution = () => {
    try {
      const profile = JSON.parse(localStorage.getItem('bpx_player_profile') || '{}')
      if (!profile.media || profile.media.quality > 64) {
        profile.media = profile.media || {}
        profile.media.quality = 64 // 720P 高清 (saves memory & GPU buffer)
        localStorage.setItem('bpx_player_profile', JSON.stringify(profile))
      }
    } catch {}
    try {
      const activeQ = document.querySelector('.bpx-player-ctrl-quality-result')
      if (activeQ && (activeQ.textContent.includes('1080') || activeQ.textContent.includes('4K'))) {
        const items = Array.from(document.querySelectorAll('.bpx-player-ctrl-quality-item'))
        const q720 = items.find(el => el.textContent.includes('720P') || el.textContent.includes('高清'))
        if (q720 && typeof q720.click === 'function') q720.click()
      }
    } catch {}
  }

  const extractActiveInfo = () => {
    if (!location.pathname.includes('/video/')) return
    const titleEl = document.querySelector('.video-title, h1[title], .video-info-title-inner')
    const authorEl = document.querySelector('.up-name, .username, .up-detail-top .name')
    const imgEl = document.querySelector('meta[property="og:image"]')
    const title = titleEl?.textContent?.trim()
    const author = authorEl?.textContent?.trim()
    const artwork = imgEl?.content || null
    if (title && (!currentVideo || currentVideo.title !== title)) {
      currentVideo = {
        bvid: location.pathname.split('/video/')[1]?.split('/')[0]?.split('?')[0] || '',
        title,
        author: author || 'UP主',
        artwork,
        duration: currentMedia ? currentMedia.duration || 0 : 0,
      }
      sendPlayback()
    }
  }

  setInterval(() => {
    addStyle()
    const videos = document.querySelectorAll('video, audio')
    videos.forEach(hookMedia)
    extractActiveInfo()
    ensurePlaying()
    capResolution()
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

  window.chrome?.webview?.addEventListener('message', (event) => {
    try {
      const data = event.data
      handleHost(typeof data === 'string' ? JSON.parse(data) : data)
    } catch (e) {
      console.error('Bilibili IPC parse error', e)
    }
  })

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'play') {
      wantedPlaying = true
      if (cmd.video) {
        currentVideo = cmd.video
        if (cmd.video.url) {
          if (!currentMedia) {
            const created = document.createElement('video')
            created.id = 'wp-bilibili-video'
            created.playsInline = true
            document.body.appendChild(created)
            hookMedia(created)
          }
          currentMedia.src = cmd.video.url
          currentMedia.play().catch(() => {})
        } else if (cmd.video.bvid) {
          if (!location.pathname.includes(cmd.video.bvid)) {
            location.href = `https://www.bilibili.com/video/${cmd.video.bvid}`
            return
          } else if (currentMedia) {
            currentMedia.play().catch(() => {})
          }
        }
      } else if (currentMedia) {
        currentMedia.play().catch(() => {})
      }
    } else if (action === 'pause') {
      wantedPlaying = false
      if (currentMedia) currentMedia.pause()
      const playBtn = document.querySelector('.bpx-player-ctrl-play')
      if (playBtn && playBtn.getAttribute('aria-label') === '暂停') {
        try { playBtn.click() } catch {}
      }
    } else if (action === 'crop') {
      if (cmd.on) {
        document.documentElement.classList.add('westplay-crop')
      } else {
        document.documentElement.classList.remove('westplay-crop')
      }
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
          artwork: v.pic ? (v.pic.startsWith('//') ? 'https:' + v.pic : v.pic) : null,
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

  const fetchPopularVideos = async () => {
    try {
      const res = await fetch(`https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1`)
      const data = await res.json()
      const videos = (data?.data?.list || []).map(v => ({
        bvid: v.bvid,
        title: v.title,
        author: v.owner?.name,
        artwork: v.pic,
        duration: v.duration || 0
      }))
      if (videos.length > 0) {
        post({ type: 'answer', answer: { id: 1, videos } })
      }
    } catch (e) {
      console.error('[bilibili] auto fetch popular error', e)
    }
  }

  checkStatus()
  fetchPopularVideos()
})()
