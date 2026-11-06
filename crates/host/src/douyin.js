// WestPlay: Douyin short video controller (crates/host/src/douyin.rs).
// Runs in the hidden WebView2 hosting https://www.douyin.com/
;(() => {
  if (!location.hostname.includes('douyin.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  let sound = null
  let currentMedia = null
  let isPlaying = false
  let wantedPlaying = false
  let autoScroll = true

  // Inject full-bleed video styles and strip all site chrome
  const style = document.createElement('style')
  style.id = 'westplay-douyin-style'
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
    /* Force active video container and video element visible and full-bleed */
    .xgplayer,
    .xgplayer-video,
    xg-video-container,
    video,
    [data-e2e="feed-active-video"] video,
    [data-e2e="feed-active-video"] .xgplayer {
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
    html.westplay-crop .xgplayer,
    html.westplay-crop .xgplayer-video,
    html.westplay-crop xg-video-container,
    html.westplay-crop video,
    html.westplay-crop [data-e2e="feed-active-video"] video {
      object-fit: cover !important;
    }
    /* Hide all modal dialogs, login masks, and guidance overlays */
    .semi-modal,
    .semi-modal-wrap,
    .semi-portal,
    .login-mask,
    [class*="login-guide"],
    [class*="loginMask"],
    [data-e2e="modal-container"],
    .dy-account-close {
      display: none !important;
      visibility: hidden !important;
    }
  `

  const addStyle = () => {
    const parent = document.head || document.documentElement
    if (parent) {
      if (!document.getElementById('westplay-douyin-style')) {
        parent.appendChild(style)
      }
    } else {
      requestAnimationFrame(addStyle)
    }
  }
  addStyle()

  // Auto-dismiss intrusive login or verification popups
  const dismissModals = () => {
    const closeBtns = document.querySelectorAll(
      '.semi-modal-close, [data-e2e="modal-close-icon"], .login-mask-close, [class*="modal"] [class*="close"]'
    )
    closeBtns.forEach((btn) => {
      try {
        if (btn && typeof btn.click === 'function') btn.click()
      } catch {}
    })
  }

  // Hook HTML5 video to truck sound system & monitor playback
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
      if (autoScroll) {
        switchVideo('next')
      }
    })
  }

  const findActiveVideo = () => {
    const activeFeed = document.querySelector('[data-e2e="feed-active-video"]')
    if (activeFeed) {
      const v = activeFeed.querySelector('video')
      if (v) return v
    }
    const all = Array.from(document.querySelectorAll('video'))
    const playing = all.find((v) => !v.paused && v.currentTime > 0)
    if (playing) return playing
    return all[0] || null
  }

  const ensurePlaying = () => {
    if (!wantedPlaying) return
    const v = findActiveVideo()
    if (v) {
      hookMedia(v)
      if (v.paused) {
        v.play().catch(() => {})
      }
    }
    const playBtn = document.querySelector(
      '.xgplayer-start, [data-e2e="feed-active-video"] .xgplayer-play, .xgplayer-icon-play'
    )
    if (playBtn && typeof playBtn.click === 'function') {
      try {
        playBtn.click()
      } catch {}
    }
  }

  setInterval(() => {
    dismissModals()
    ensurePlaying()
    checkStatus()
  }, 1000)

  let lastSignedIn = null
  const checkStatus = () => {
    const avatar = document.querySelector(
      '[data-e2e="user-avatar"], [data-e2e="user-info"], a[href^="/user/"], [data-e2e="user-detail"], img[class*="avatar"], div[class*="avatar"]'
    )
    const hasUserCookies =
      document.cookie.includes('sessionid') ||
      document.cookie.includes('sid_tt') ||
      document.cookie.includes('uid_tt')
    const loginBtn = Array.from(document.querySelectorAll('button, a')).find(
      (el) => (el.textContent?.trim() === '登录' || el.getAttribute('data-e2e') === 'login-button') && el.offsetParent !== null
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

  const extractActiveInfo = () => {
    const activeFeed = document.querySelector('[data-e2e="feed-active-video"]') || document
    const titleEl = activeFeed.querySelector(
      '[data-e2e="video-desc"], .title, .desc, span[class*="desc"], h1, h2'
    )
    const authorEl = activeFeed.querySelector(
      '[data-e2e="feed-active-video"] .account-name, [data-e2e="video-author-name"], .author, .nickname'
    )
    const avatarEl = activeFeed.querySelector('img[class*="avatar"], [data-e2e="user-avatar"] img')
    const likeIcon = activeFeed.querySelector('[data-e2e="feed-like-icon"], svg[class*="like"]')
    const liked =
      likeIcon?.classList?.contains('active') ||
      likeIcon?.closest?.('[class*="active"]') !== null ||
      false

    const title = titleEl?.textContent?.trim() || '抖音精选短视频'
    const author = authorEl?.textContent?.trim()?.replace(/^@/, '') || '抖音创作者'
    const artwork = avatarEl?.src || null

    return { title, author, artwork, liked }
  }

  let lastPlaybackTime = 0
  const sendPlayback = () => {
    const now = performance.now()
    if (now - lastPlaybackTime < 250 && isPlaying) return
    lastPlaybackTime = now

    const meta = extractActiveInfo()
    const duration = currentMedia ? currentMedia.duration || 0 : 0
    const position = currentMedia ? currentMedia.currentTime || 0 : 0

    post({
      type: 'playback',
      playback: {
        id: `dy_current`,
        title: meta.title,
        artist: meta.author,
        author: meta.author,
        artwork: meta.artwork,
        duration: Number.isFinite(duration) ? duration : 0,
        position: Number.isFinite(position) ? position : 0,
        status: isPlaying ? 'playing' : 'paused',
        liked: meta.liked
      }
    })
  }

  const switchVideo = (direction) => {
    const isNext = direction === 'next'
    const key = isNext ? 'ArrowDown' : 'ArrowUp'
    const code = isNext ? 'ArrowDown' : 'ArrowUp'
    const keyCode = isNext ? 40 : 38

    const eventInit = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true }
    window.dispatchEvent(new KeyboardEvent('keydown', eventInit))
    document.body?.dispatchEvent(new KeyboardEvent('keydown', eventInit))

    // Fallback: click feed arrow buttons if present
    const arrowBtn = document.querySelector(
      isNext ? '[data-e2e="feed-arrow-down"], .xgplayer-page-down' : '[data-e2e="feed-arrow-up"], .xgplayer-page-up'
    )
    if (arrowBtn && typeof arrowBtn.click === 'function') {
      arrowBtn.click()
    }

    setTimeout(() => {
      const activeVideo = findActiveVideo()
      if (activeVideo) {
        hookMedia(activeVideo)
        if (wantedPlaying) {
          activeVideo.play().catch(() => {})
        }
      }
      sendPlayback()
    }, 400)
  }

  window.westplayDouyinCommand = (cmd) => {
    handleHost(cmd)
  }

  const handleMessage = (data) => {
    try {
      const cmd = typeof data === 'string' ? JSON.parse(data) : data
      handleHost(cmd)
    } catch (e) {
      console.error('[douyin] handleMessage error', e)
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
      wantedPlaying = true
      const activeVideo = findActiveVideo()
      if (activeVideo) {
        hookMedia(activeVideo)
        activeVideo.play().catch(() => {})
      }
    } else if (action === 'pause') {
      wantedPlaying = false
      if (currentMedia) currentMedia.pause()
      const pauseBtn = document.querySelector('[data-e2e="feed-active-video"] .xgplayer-pause, .xgplayer-pause')
      if (pauseBtn && typeof pauseBtn.click === 'function') {
        try { pauseBtn.click() } catch {}
      }
    } else if (action === 'next') {
      switchVideo('next')
    } else if (action === 'previous') {
      switchVideo('previous')
    } else if (action === 'seek') {
      if (currentMedia && typeof cmd.seconds === 'number') {
        currentMedia.currentTime = cmd.seconds
      }
    } else if (action === 'volume') {
      if (currentMedia && typeof cmd.percent === 'number') {
        currentMedia.volume = Math.max(0, Math.min(1, cmd.percent / 100))
      }
    } else if (action === 'like') {
      const likeBtn = document.querySelector('[data-e2e="feed-active-video"] [data-e2e="feed-like-icon"], [data-e2e="feed-like-icon"]')
      if (likeBtn && typeof likeBtn.click === 'function') {
        likeBtn.click()
      } else {
        // Dispatch 'z' key
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', keyCode: 90, which: 90, bubbles: true }))
      }
      setTimeout(sendPlayback, 300)
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }

  const handleAsk = async (id, question) => {
    try {
      if (question.ask === 'feed' || question.ask === 'search') {
        const videoCards = Array.from(document.querySelectorAll('[data-e2e="feed-active-video"], .video-card'))
        const videos = videoCards.slice(0, 10).map((card, idx) => ({
          id: `dy_${Date.now()}_${idx}`,
          title: card.querySelector('.title, .desc, h3')?.textContent?.trim() || `抖音推荐短视频 #${idx + 1}`,
          author: card.querySelector('.author, .nickname')?.textContent?.trim() || '抖音创作者',
          artwork: card.querySelector('img')?.src || null,
          duration: 180
        }))
        post({ type: 'answer', answer: { id, videos } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  checkStatus()
})()
