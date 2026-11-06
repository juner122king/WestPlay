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
      if (autoNext && currentDrama) {
        const nextEp = currentEpisode + 1
        if (nextEp <= (currentDrama.totalEpisodes || 80)) {
          handleHost({ action: 'play', drama: currentDrama, episode: nextEp })
        }
      }
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
      document.cookie.includes('LOGIN_STATUS')
    if (signedIn !== lastSignedIn) {
      lastSignedIn = signedIn
      post({
        type: 'state',
        state: { signedIn, playing: isPlaying }
      })
    }
  }

  const sendPlayback = () => {
    if (!currentDrama) return
    post({
      type: 'playback',
      playback: {
        dramaId: currentDrama.id,
        title: `${currentDrama.title} · 第${currentEpisode}集`,
        dramaTitle: currentDrama.title,
        episodeTitle: `第${currentEpisode}集`,
        artist: currentDrama.author || '红果短剧',
        author: currentDrama.author || '红果短剧',
        artwork: currentDrama.cover || null,
        episode: currentEpisode,
        episodeNumber: currentEpisode,
        totalEpisodes: currentDrama.totalEpisodes || 80,
        duration: currentMedia ? currentMedia.duration || 120 : 120,
        position: currentMedia ? currentMedia.currentTime || 0 : 0,
        status: isPlaying ? 'playing' : 'paused',
        speed: currentSpeed,
        autoNext
      }
    })
  }

  window.westplayHongguoCommand = (cmd) => {
    handleHost(cmd)
  }

  const handleHost = async (cmd) => {
    if (!cmd || typeof cmd !== 'object') return
    const { action } = cmd

    if (action === 'play') {
      if (cmd.drama) {
        currentDrama = cmd.drama
        currentEpisode = cmd.episode || 1
        if (!currentMedia) {
          const created = document.createElement('video')
          created.id = 'wp-hongguo-video'
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
        // In WebView, if the page has interactive episode elements, click them:
        const epButtons = document.querySelectorAll('.episode-item, .anthology-item, [data-episode]')
        if (epButtons.length >= currentEpisode) {
          epButtons[currentEpisode - 1]?.click()
        } else if (currentMedia) {
          currentMedia.play().catch(() => {})
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
    } else if (action === 'setSpeed') {
      if (typeof cmd.speed === 'number') {
        currentSpeed = cmd.speed
        if (currentMedia) currentMedia.playbackRate = currentSpeed
        sendPlayback()
      }
    } else if (action === 'toggleAutoNext') {
      autoNext = !autoNext
      sendPlayback()
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }

  const handleAsk = async (id, question) => {
    try {
      if (question.ask === 'catalog' || question.ask === 'featured') {
        const dramaCards = Array.from(document.querySelectorAll('.drama-card, .album-item'))
        const dramas = dramaCards.slice(0, 10).map((card, idx) => ({
          id: `hg_${Date.now()}_${idx}`,
          title: card.querySelector('.title, h3')?.textContent?.trim() || `精选热播剧集 #${idx + 1}`,
          category: '都市逆袭',
          author: '红果短剧',
          cover: card.querySelector('img')?.src || null,
          totalEpisodes: 80
        }))
        post({ type: 'answer', answer: { id, dramas } })
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  checkStatus()
})()
