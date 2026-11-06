// WestPlay: Douyin short video controller (crates/host/src/douyin.rs).
// Runs in the hidden WebView2 hosting https://www.douyin.com/
;(() => {
  if (!location.hostname.includes('douyin.com') || window.top !== window) return

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
    const mediaElements = document.querySelectorAll('video, audio')
    mediaElements.forEach(hookMedia)
    checkStatus()
  }, 1000)

  let lastSignedIn = null
  const checkStatus = () => {
    const signedIn =
      document.cookie.includes('sessionid') ||
      document.cookie.includes('LOGIN_STATUS') ||
      document.cookie.includes('passport_csrf_token')
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
        id: currentVideo.id,
        title: currentVideo.title || '抖音短视频',
        artist: currentVideo.author || '创作者',
        author: currentVideo.author || '创作者',
        artwork: currentVideo.artwork || null,
        duration: currentMedia ? currentMedia.duration || 0 : currentVideo.duration || 0,
        position: currentMedia ? currentMedia.currentTime || 0 : 0,
        status: isPlaying ? 'playing' : 'paused'
      }
    })
  }

  window.westplayDouyinCommand = (cmd) => {
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
          created.id = 'wp-douyin-video'
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
        } else {
          // Play current video on page
          const pageVideo = document.querySelector('video')
          if (pageVideo) {
            hookMedia(pageVideo)
            pageVideo.play().catch(() => {})
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
    } else if (action === 'like') {
      // Simulate like button click on page if present
      const likeBtn = document.querySelector('[data-e2e="feed-like-icon"], .like-icon')
      if (likeBtn) likeBtn.click()
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }

  const handleAsk = async (id, question) => {
    try {
      if (question.ask === 'feed' || question.ask === 'search') {
        // Return active feed items from DOM or mock list
        const videoCards = Array.from(document.querySelectorAll('[data-e2e="feed-active-video"], .video-card'))
        const videos = videoCards.slice(0, 10).map((card, idx) => ({
          id: `dy_${Date.now()}_${idx}`,
          title: card.querySelector('.title, .desc, h3')?.textContent?.trim() || `热门卡车旅行记录 #${idx + 1}`,
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
