// WestPlay: Hongguo short drama controller (crates/host/src/hongguo.rs).
// Runs in the hidden WebView2 hosting https://www.hongguoduanju.com/
;(() => {
  if (!location.hostname.includes('hongguoduanju.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  let sound = null
  let currentMedia = null
  let currentDrama = null
  let currentEpisode = 1
  let currentSpeed = 1.0
  let isPlaying = false
  let autoNext = true

  // Inject full-bleed video styles and strip all site chrome
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
    /* Force player container and video element visible and full-bleed */
    .player-container,
    [class*="player-wrapper"],
    [class*="player-box"],
    [class*="video-player"],
    video {
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
    html.westplay-crop .player-container,
    html.westplay-crop [class*="player-wrapper"],
    html.westplay-crop [class*="player-box"],
    html.westplay-crop [class*="video-player"],
    html.westplay-crop video {
      object-fit: cover !important;
    }
    /* Hide all modals, login dialogs, headers, footers */
    [class*="modal"],
    [class*="login"],
    [class*="header"],
    [class*="footer"],
    [class*="side-bar"],
    [class*="recommend"] {
      display: none !important;
      visibility: hidden !important;
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

  // Hook HTML5 video to truck sound system & monitor playback
  const hookMedia = (el) => {
    if (!el || el === currentMedia) return
    currentMedia = el
    if (window.westplayCabSound) {
      sound = window.westplayCabSound(el, (bars) => {
        post({ type: 'spectrum', bars })
      })
    }
    el.playbackRate = currentSpeed
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
      if (autoNext) {
        goToNextEpisode()
      }
    })
  }

  const findActiveVideo = () => {
    const all = Array.from(document.querySelectorAll('video'))
    const playing = all.find((v) => !v.paused && v.currentTime > 0)
    if (playing) return playing
    return all[0] || null
  }

  setInterval(() => {
    const v = findActiveVideo()
    if (v) hookMedia(v)
    checkStatus()
  }, 1000)

  let lastSignedIn = null
  const checkStatus = () => {
    const avatar = document.querySelector(
      'img[class*="avatar"], div[class*="avatar"], a[href*="/user"], [class*="user-info"], [class*="user-header"]'
    )
    const hasUserCookies =
      document.cookie.includes('sessionid') ||
      document.cookie.includes('sid_tt') ||
      document.cookie.includes('uid_tt')
    const loginBtn = Array.from(document.querySelectorAll('button, a')).find(
      (el) => el.textContent?.trim() === '登录' && el.offsetParent !== null
    )
    const signedIn = Boolean(avatar) || Boolean(hasUserCookies) || (!loginBtn && document.querySelectorAll('video').length > 0)
    if (signedIn !== lastSignedIn) {
      lastSignedIn = signedIn
      post({
        type: 'state',
        state: { signedIn, playing: isPlaying }
      })
    }
  }

  const parseEpisodeFromPage = () => {
    const epMatch = document.title?.match(/第\s*(\d+)\s*集/) || location.pathname?.match(/(\d+)$/)
    return epMatch ? parseInt(epMatch[1], 10) : currentEpisode
  }

  let lastPlaybackTime = 0
  const sendPlayback = () => {
    const now = performance.now()
    if (now - lastPlaybackTime < 250 && isPlaying) return
    lastPlaybackTime = now

    const ep = parseEpisodeFromPage()
    const pageTitle =
      document.querySelector('[class*="drama-title"], h1, .title')?.textContent?.trim() ||
      currentDrama?.title ||
      '红果热门短剧'
    const duration = currentMedia ? currentMedia.duration || 120 : 120
    const position = currentMedia ? currentMedia.currentTime || 0 : 0

    post({
      type: 'playback',
      playback: {
        dramaId: currentDrama?.id || 'hg_drama',
        title: `${pageTitle} · 第${ep}集`,
        dramaTitle: pageTitle,
        episodeTitle: `第${ep}集`,
        artist: currentDrama?.author || '红果短剧',
        author: currentDrama?.author || '红果短剧',
        artwork: currentDrama?.cover || null,
        episode: ep,
        episodeNumber: ep,
        totalEpisodes: currentDrama?.totalEpisodes || 80,
        duration: Number.isFinite(duration) ? duration : 120,
        position: Number.isFinite(position) ? position : 0,
        status: isPlaying ? 'playing' : 'paused',
        speed: currentSpeed,
        autoNext
      }
    })
  }

  const goToNextEpisode = () => {
    const nextEp = parseEpisodeFromPage() + 1
    selectEpisode(nextEp)
  }

  const selectEpisode = (epNumber) => {
    currentEpisode = epNumber
    // Look for episode button in page drawer / anthology list
    const epBtns = Array.from(
      document.querySelectorAll(
        '[class*="episode-item"], [class*="anthology-item"], [data-episode], button, [class*="item"]'
      )
    )
    const target = epBtns.find((el) => {
      const text = el.textContent?.trim() || ''
      return (
        el.getAttribute('data-episode') === String(epNumber) ||
        text === String(epNumber) ||
        text === `第${epNumber}集`
      )
    })

    if (target && typeof target.click === 'function') {
      target.click()
    } else {
      // If direct element not found, navigate if drama URL pattern known
      if (currentDrama?.id) {
        location.href = `/play/${currentDrama.id}/${epNumber}`
      }
    }

    setTimeout(() => {
      const v = findActiveVideo()
      if (v) {
        hookMedia(v)
        v.playbackRate = currentSpeed
        v.play().catch(() => {})
      }
      sendPlayback()
    }, 500)
  }

  window.westplayHongguoCommand = (cmd) => {
    handleHost(cmd)
  }

  const handleMessage = (data) => {
    try {
      const cmd = typeof data === 'string' ? JSON.parse(data) : data
      handleHost(cmd)
    } catch (e) {
      console.error('[hongguo] handleMessage error', e)
    }
  }

  window.chrome?.webview?.addEventListener('message', (event) => handleMessage(event.data))
  window.addEventListener('message', (event) => handleMessage(event.data))
  window.chrome?.webview?.postMessage({ ready: true })

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'crop') {
      document.documentElement.classList.toggle('westplay-crop', Boolean(cmd.on))
    } else if (action === 'play') {
      if (cmd.drama) {
        const dramaChanged = currentDrama?.id !== cmd.drama.id
        currentDrama = cmd.drama
        if (cmd.episode) currentEpisode = cmd.episode

        if (dramaChanged && cmd.drama.id) {
          // Navigate to drama page if needed
          const targetUrl = cmd.drama.id.startsWith('http')
            ? cmd.drama.id
            : `/play/${cmd.drama.id}/${currentEpisode}`
          if (!location.href.includes(cmd.drama.id)) {
            location.href = targetUrl
            return
          }
        }
        if (cmd.episode) {
          selectEpisode(cmd.episode)
        }
      }
      const v = findActiveVideo()
      if (v) {
        hookMedia(v)
        v.play().catch(() => {})
      }
    } else if (action === 'pause') {
      if (currentMedia) currentMedia.pause()
    } else if (action === 'next') {
      goToNextEpisode()
    } else if (action === 'previous') {
      const prevEp = Math.max(1, parseEpisodeFromPage() - 1)
      selectEpisode(prevEp)
    } else if (action === 'selectEpisode') {
      if (typeof cmd.episode === 'number') {
        selectEpisode(cmd.episode)
      }
    } else if (action === 'setSpeed') {
      if (typeof cmd.speed === 'number') {
        currentSpeed = cmd.speed
        if (currentMedia) currentMedia.playbackRate = currentSpeed
        sendPlayback()
      }
    } else if (action === 'toggleAutoNext') {
      autoNext = !autoNext
      sendPlayback()
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
      if (question.ask === 'catalog' || question.ask === 'featured' || question.ask === 'search') {
        const cardEls = Array.from(
          document.querySelectorAll(
            'a[href*="/drama/"], a[href*="/play/"], [class*="drama-card"], [class*="book-item"], [class*="card"]'
          )
        )
        const dramas = cardEls.slice(0, 12).map((card, idx) => {
          const href = card.getAttribute('href') || ''
          const dramaIdMatch = href.match(/(?:drama|play)\/([a-zA-Z0-9_-]+)/)
          const dramaId = dramaIdMatch ? dramaIdMatch[1] : `hg_drama_${idx + 1}`
          const title =
            card.querySelector('[class*="title"], h2, h3, .name')?.textContent?.trim() ||
            `热门精选短剧 #${idx + 1}`
          const cover = card.querySelector('img')?.src || null
          const tag = card.querySelector('[class*="tag"], [class*="category"]')?.textContent?.trim() || '热血·逆袭'
          const countMatch = card.textContent?.match(/(\d+)\s*集/)
          const totalEpisodes = countMatch ? parseInt(countMatch[1], 10) : 80

          return {
            id: dramaId,
            title,
            cover,
            category: tag,
            author: '红果剧场',
            totalEpisodes,
            synopsis: `全本 ${totalEpisodes} 集高清短剧在线播放`
          }
        })
        post({ type: 'answer', answer: { id, dramas } })
      } else if (question.ask === 'episodes') {
        // Return 1..N episodes list
        const total = currentDrama?.totalEpisodes || 80
        const episodes = Array.from({ length: total }, (_, i) => ({
          episode: i + 1,
          title: `第 ${i + 1} 集`,
          duration: 120
        }))
        post({ type: 'answer', answer: { id, episodes } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  checkStatus()
})()
