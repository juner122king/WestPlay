// WestPlay: Bilibili video & audio controller (crates/host/src/bilibili.rs).
// Runs in the hidden WebView2 hosting https://www.bilibili.com/
;(() => {
  if (!location.hostname.includes('bilibili.com') || window.top !== window) return

  const post = (msg) => window.chrome?.webview?.postMessage(msg)
  let sound = null
  let currentMedia = null
  let currentVideo = null
  let wantedPlaying =
    location.pathname.includes('/video/') ||
    location.hostname.includes('live.bilibili.com') ||
    location.pathname.includes('/bangumi/play/')
  let isPlaying = wantedPlaying
  let isEnded = false
  let isDanmakuOn = false
  let currentQuality = 64 // 720P default
  let currentRate = 1.0
  let currentPage = 1
  let currentPages = []
  let dynamicOffset = ''

  const apiFetch = (url, options = {}) => {
    return fetch(url, {
      ...options,
      credentials: 'include',
    })
  }

  function cleanText(str) {
    if (!str || typeof str !== 'string') return ''
    return str
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
  }

  function formatPic(pic) {
    if (!pic || typeof pic !== 'string') return null
    if (pic.startsWith('//')) return 'https:' + pic
    return pic
  }

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
    #live-player,
    #live-room-player,
    .live-player-mian,
    .web-player,
    .web-player-module,
    .web-player-inject-wrap,
    .web-player-video-wrap,
    .video-container,
    #player-ctnr,
    .live-room-player,
    .player-section,
    .live-player-mounter,
    .bpx-player-video-area,
    .bpx-player-video-perch,
    .bpx-player-video-wrap,
    video,
    #wp-bilibili-video {
      visibility: visible !important;
    }
    #bilibili-player,
    .bpx-player-container,
    #live-player,
    #live-room-player,
    .live-player-mian,
    .web-player,
    .web-player-module,
    .web-player-inject-wrap,
    .web-player-video-wrap,
    .video-container,
    #player-ctnr,
    .live-room-player,
    .player-section,
    .live-player-mounter {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      left: 0 !important;
      top: 0 !important;
      z-index: 2147483640 !important;
      background: transparent !important;
      overflow: hidden !important;
    }
    video,
    #wp-bilibili-video {
      visibility: visible !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      left: 0 !important;
      top: 0 !important;
      background: transparent !important;
      object-fit: contain !important;
      z-index: 2147483645 !important;
    }
    canvas {
      display: none !important;
      visibility: hidden !important;
    }
    html.westplay-crop video,
    html.westplay-crop canvas,
    html.westplay-crop #wp-bilibili-video {
      object-fit: cover !important;
    }
    .bpx-player-dm-wrap {
      display: none !important;
      visibility: hidden !important;
    }
    html.westplay-danmaku-on canvas,
    html.westplay-danmaku-on .bpx-player-dm-wrap,
    html.westplay-danmaku-on .bpx-player-dm-wrap *,
    html.westplay-danmaku-on .web-player-danmaku,
    html.westplay-danmaku-on .web-player-danmaku *,
    html.westplay-danmaku-on .danmaku-canvas-box {
      display: block !important;
      visibility: visible !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      left: 0 !important;
      top: 0 !important;
      background: transparent !important;
      object-fit: contain !important;
      pointer-events: none !important;
      z-index: 2147483646 !important;
    }
    .video-cover,
    .web-player-mask,
    .player-mask,
    .live-cover,
    .bili-header,
    .bpx-player-control-wrap,
    .login-dialog-wrapper,
    .bili-mini-mask,
    .van-popover,
    .bpx-player-toast-wrap,
    .bili-guide-box,
    .bpx-player-state-paused,
    .bpx-player-loading-panel,
    .bpx-player-black-side,
    .bpx-player-ending-wrap,
    .bpx-player-shadow,
    .bpx-player-pop-wrap,
    .bpx-player-dialog-wrap,
    .bpx-player-cmd-dm-wrap,
    .bpx-player-electric-panel,
    .web-player-controller-wrap,
    .web-player-danmaku,
    .chat-history-panel,
    .gift-panel,
    .side-bar-cntr,
    .announcement-cntr,
    #aside-area-vm,
    #sidebar-vm,
    #gift-control-vm,
    .gift-control-section,
    #head-info-vm,
    .header-info-ctnr,
    .player-and-aside-area aside,
    .live-title,
    .rank-cntr,
    .web-player-ending-panel,
    .web-player-watermark,
    .live-sidebar,
    .room-player-aside,
    #web-player__bottom-bar__container {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
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
    if (currentRate && currentRate !== 1.0) {
      try { el.playbackRate = currentRate } catch {}
    }
    if (!el.paused && !el.ended) {
      isPlaying = true
      isEnded = false
      sendPlayback()
    }
    el.addEventListener('play', () => {
      isPlaying = true
      isEnded = false
      sendPlayback()
    })
    el.addEventListener('playing', () => {
      isPlaying = true
      isEnded = false
      sendPlayback()
    })
    el.addEventListener('pause', () => {
      const othersPlaying = Array.from(document.querySelectorAll('video, audio')).some(
        (m) => m !== el && !m.paused && !m.ended && (m.readyState >= 2 || m.currentTime > 0)
      )
      if (!othersPlaying) {
        isPlaying = false
        sendPlayback()
      }
    })
    el.addEventListener('timeupdate', () => {
      const isLive = Boolean(
        location.hostname.includes('live.bilibili.com') ||
        (currentVideo && (currentVideo.isLive || currentVideo.bvid?.startsWith('live:')))
      )
      if (!el.paused && !el.ended && !isPlaying) {
        isPlaying = true
      }
      if (isLive) {
        sendPlayback()
        return
      }
      if (el.duration > 0 && el.currentTime >= el.duration - 0.4) {
        if (!isEnded) {
          isEnded = true
          isPlaying = false
          wantedPlaying = false
          sendPlayback()
          post({ type: 'ended' })
        }
      } else if (isEnded && el.currentTime < el.duration - 1) {
        isEnded = false
      }
      sendPlayback()
    })
    el.addEventListener('ended', () => {
      const isLive = Boolean(
        location.hostname.includes('live.bilibili.com') ||
        (currentVideo && (currentVideo.isLive || currentVideo.bvid?.startsWith('live:')))
      )
      if (isLive) {
        return
      }
      isPlaying = false
      isEnded = true
      wantedPlaying = false
      sendPlayback()
      post({ type: 'ended' })
    })
  }

  const ensurePlaying = () => {
    if (!wantedPlaying || isEnded) return
    const videos = Array.from(document.querySelectorAll('video'))
    for (const v of videos) {
      hookMedia(v)
      if (v.paused) {
        v.play().catch(() => {})
      } else if (!isPlaying) {
        isPlaying = true
        sendPlayback()
      }
    }
    const playBtn = document.querySelector(
      '.bpx-player-ctrl-play, .web-player-controller-wrap .play-btn, .web-player-start-btn, .room-player-box .play-btn'
    )
    if (playBtn && (playBtn.getAttribute('aria-label') === '播放' || playBtn.classList.contains('paused') || playBtn.classList.contains('web-player-start-btn'))) {
      try { playBtn.click() } catch {}
    }
  }

  const applyQuality = (targetQ) => {
    try {
      const profile = JSON.parse(localStorage.getItem('bpx_player_profile') || '{}')
      profile.media = profile.media || {}
      profile.media.quality = targetQ
      localStorage.setItem('bpx_player_profile', JSON.stringify(profile))
    } catch {}
    try {
      const items = Array.from(document.querySelectorAll('.bpx-player-ctrl-quality-menu-item, .bpx-player-ctrl-quality-item'))
      const match = items.find((el) => {
        const val = el.getAttribute('data-value') || el.getAttribute('data-quality')
        if (val && Number(val) === targetQ) return true
        if (targetQ === 80 && el.textContent.includes('1080P')) return true
        if (targetQ === 64 && el.textContent.includes('720P')) return true
        if (targetQ === 32 && el.textContent.includes('480P')) return true
        if (targetQ === 16 && el.textContent.includes('360P')) return true
        return false
      })
      if (match && typeof match.click === 'function') match.click()
    } catch {}
  }

  const getAvailableQualities = () => {
    const list = [
      { quality: 116, label: '1080P 60帧' },
      { quality: 80, label: '1080P 高清' },
      { quality: 64, label: '720P 高清' },
      { quality: 32, label: '480P 清晰' },
      { quality: 16, label: '360P 流畅' },
    ]
    return list
  }

  const fetchPagelist = async (bvid) => {
    if (!bvid) return
    try {
      const res = await apiFetch(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`)
      const data = await res.json()
      if (data?.data && Array.isArray(data.data)) {
        currentPages = data.data.map((p) => ({
          cid: p.cid,
          page: p.page,
          part: p.part || `第${p.page}集`,
          duration: p.duration || 0,
        }))
        sendPlayback()
      }
    } catch (e) {
      console.warn('[bilibili] fetch pagelist failed', e)
    }
  }

  let lastFetchedRoomId = 0
  const fetchLiveRoomInfo = async (roomIdNum) => {
    if (!roomIdNum || roomIdNum === lastFetchedRoomId) return
    lastFetchedRoomId = roomIdNum
    try {
      const res = await apiFetch(`https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=${roomIdNum}`)
      const json = await res.json()
      if (json?.code === 0 && json?.data) {
        const roomInfo = json.data.room_info
        const anchorInfo = json.data.anchor_info
        let updated = false
        if (currentVideo && (currentVideo.roomId === roomIdNum || currentVideo.bvid === `live:${roomIdNum}`)) {
          if (roomInfo?.title && (!currentVideo.title || currentVideo.title === '正在直播' || currentVideo.title === '哔哩哔哩直播')) {
            currentVideo.title = cleanText(roomInfo.title)
            updated = true
          }
          if (anchorInfo?.base_info?.uname && (!currentVideo.author || currentVideo.author === '主播' || currentVideo.author === 'UP主')) {
            currentVideo.author = cleanText(anchorInfo.base_info.uname)
            updated = true
          }
          if (anchorInfo?.base_info?.uid && (!currentVideo.mid || currentVideo.mid === 'undefined')) {
            currentVideo.mid = String(anchorInfo.base_info.uid)
            updated = true
          }
          if (roomInfo?.cover && !currentVideo.artwork) {
            currentVideo.artwork = formatPic(roomInfo.cover)
            updated = true
          }
          if (updated) {
            sendPlayback()
          }
        }
      }
    } catch (e) {
      console.warn('[bilibili] fetchLiveRoomInfo error', e)
    }
  }

  const extractActiveInfo = () => {
    if (location.hostname === 'live.bilibili.com' || location.pathname.includes('/live/')) {
      const match = location.pathname.match(/\/(\d+)/)
      const roomIdStr = match ? match[1] : (location.pathname.replace(/^\//, '').split('/')[0]?.split('?')[0] || '')
      const roomIdNum = parseInt(roomIdStr, 10) || (currentVideo?.roomId || 0)

      let title = ''
      let author = ''
      let artwork = null
      let mid = ''

      // 1. Try window.__NEPTUNE_IS_MY_WAIFU__
      try {
        const neptune = window.__NEPTUNE_IS_MY_WAIFU__
        if (neptune?.roomInfoRes?.data) {
          const rInfo = neptune.roomInfoRes.data.room_info
          const aInfo = neptune.roomInfoRes.data.anchor_info
          if (rInfo?.title) title = cleanText(rInfo.title)
          if (rInfo?.cover) artwork = formatPic(rInfo.cover)
          if (aInfo?.base_info?.uname) author = cleanText(aInfo.base_info.uname)
          if (aInfo?.base_info?.uid) mid = String(aInfo.base_info.uid)
        }
      } catch {}

      // 2. Try DOM
      if (!title) {
        const titleEl = document.querySelector('.live-title .title-text, .room-title, h1, .header-info-ctnr .room-title')
        if (titleEl?.textContent?.trim()) title = cleanText(titleEl.textContent)
      }
      if (!author) {
        const authorEl = document.querySelector('.room-owner-username, .up-name, .anchor-name, a[href*="space.bilibili.com"]')
        if (authorEl?.textContent?.trim()) author = cleanText(authorEl.textContent)
      }
      if (!artwork) {
        const imgEl = document.querySelector('meta[property="og:image"]')
        if (imgEl?.content) artwork = formatPic(imgEl.content)
      }

      // 3. Try sessionStorage
      try {
        const raw = sessionStorage.getItem('westplay_live_meta')
        if (raw) {
          const saved = JSON.parse(raw)
          const neptuneShortId = window.__NEPTUNE_IS_MY_WAIFU__?.roomInfoRes?.data?.room_info?.short_id
          const neptuneRoomId = window.__NEPTUNE_IS_MY_WAIFU__?.roomInfoRes?.data?.room_info?.room_id
          const isMatch = !saved.roomId || saved.roomId === roomIdNum || saved.roomId === neptuneShortId || saved.roomId === neptuneRoomId
          if (saved && isMatch) {
            if (!title && saved.title && saved.title !== '正在直播' && saved.title !== '哔哩哔哩直播') title = saved.title
            if (!author && saved.author && saved.author !== '主播' && saved.author !== 'UP主') author = saved.author
            if (!artwork && saved.artwork) artwork = saved.artwork
            if (!mid && saved.mid) mid = saved.mid
          }
        }
      } catch {}

      // 4. Try document.title
      if (!author || !title) {
        try {
          const docTitle = document.title || ''
          if (docTitle && !docTitle.startsWith('哔哩哔哩直播')) {
            const parts = docTitle.split('_')[0]?.split(' - ') || []
            if (parts.length >= 2) {
              if (!title && parts[0]) title = cleanText(parts[0])
              if (!author && parts[1]) author = cleanText(parts[1].replace(/的直播间$/, ''))
            }
          }
        } catch {}
      }

      // 5. Try currentVideo
      if (!title && currentVideo?.title && currentVideo.title !== '正在直播' && currentVideo.title !== '哔哩哔哩直播') {
        title = currentVideo.title
      }
      if (!author && currentVideo?.author && currentVideo.author !== '主播' && currentVideo.author !== 'UP主') {
        author = currentVideo.author
      }
      if (!artwork && currentVideo?.artwork) artwork = currentVideo.artwork
      if (!mid && currentVideo?.mid) mid = currentVideo.mid

      if ((!title || title === '正在直播' || title === '哔哩哔哩直播' || !author || author === '主播') && roomIdNum) {
        fetchLiveRoomInfo(roomIdNum)
      }

      const finalTitle = title || '哔哩哔哩直播'
      const finalAuthor = author || '主播'

      if (!currentVideo || currentVideo.roomId !== roomIdNum || currentVideo.bvid !== `live:${roomIdStr}`) {
        currentVideo = {
          bvid: `live:${roomIdStr}`,
          roomId: roomIdNum,
          isLive: true,
          title: finalTitle,
          author: finalAuthor,
          mid: mid || undefined,
          artwork,
          duration: 0,
        }
        sendPlayback()
      } else {
        let changed = false
        if (title && title !== '正在直播' && title !== '哔哩哔哩直播' && currentVideo.title !== title) {
          currentVideo.title = title
          changed = true
        }
        if (author && author !== '主播' && currentVideo.author !== author) {
          currentVideo.author = author
          changed = true
        }
        if (mid && currentVideo.mid !== mid) {
          currentVideo.mid = mid
          changed = true
        }
        if (artwork && !currentVideo.artwork) {
          currentVideo.artwork = artwork
          changed = true
        }
        if (changed) {
          sendPlayback()
        }
      }
      return
    }

    if (location.pathname.includes('/bangumi/play/')) {
      const match = location.pathname.match(/\/bangumi\/play\/(ss\d+|ep\d+)/)
      const playId = match ? match[1] : ''
      const titleEl = document.querySelector('.media-info-title, .bpx-player-top-left-title, h1')
      const imgEl = document.querySelector('meta[property="og:image"]')
      let title = titleEl?.textContent?.trim() || currentVideo?.title || '哔哩哔哩影视'
      let artwork = imgEl?.content || currentVideo?.artwork || null
      try {
        const state = window.__INITIAL_STATE__
        if (state?.mediaInfo?.title) title = state.mediaInfo.title
        if (state?.mediaInfo?.cover) artwork = state.mediaInfo.cover
      } catch {}

      if (!currentVideo || currentVideo.bvid !== playId) {
        currentVideo = {
          bvid: playId,
          title,
          author: '哔哩哔哩影视',
          artwork,
          duration: currentMedia ? currentMedia.duration || 0 : 0,
        }
        sendPlayback()
      }
      return
    }

    if (!location.pathname.includes('/video/')) return
    const bvid = location.pathname.split('/video/')[1]?.split('/')[0]?.split('?')[0] || ''
    const titleEl = document.querySelector('.video-title, h1[title], .video-info-title-inner')
    const authorEl = document.querySelector('.up-name, .username, .up-detail-top .name, .up-info--right .name, a[href*="space.bilibili.com"]')
    const imgEl = document.querySelector('meta[property="og:image"]')
    let title = titleEl?.textContent?.trim()
    let author = authorEl?.textContent?.trim()
    let artwork = imgEl?.content || null
    let mid = ''

    // Attempt to extract owner name, mid and artwork from window state
    try {
      const state = window.__INITIAL_STATE__
      if (state?.videoData) {
        if (!title && state.videoData.title) title = state.videoData.title
        if (!author && state.videoData.owner?.name) author = state.videoData.owner.name
        if (state.videoData.owner?.mid) mid = String(state.videoData.owner.mid)
        if (!artwork && state.videoData.pic) artwork = state.videoData.pic
      }
      if (!mid && state?.upData?.mid) {
        mid = String(state.upData.mid)
      }
      if (!author && state?.upData?.name) {
        author = state.upData.name
      }
    } catch {}

    // Check space link in DOM for mid if not already found
    if (!mid) {
      const spaceLink = document.querySelector('a[href*="space.bilibili.com"]')?.getAttribute('href') || ''
      const match = spaceLink.match(/space\.bilibili\.com\/(\d+)/)
      if (match) mid = match[1]
    }

    const pageParam = new URLSearchParams(location.search).get('p')
    if (pageParam) {
      currentPage = parseInt(pageParam, 10) || 1
    }

    if (bvid && (!currentVideo || currentVideo.bvid !== bvid || (title && currentVideo.title !== title))) {
      currentVideo = {
        bvid,
        title: title || currentVideo?.title || '哔哩哔哩视频',
        author: author || currentVideo?.author || 'UP主',
        mid: mid || currentVideo?.mid || undefined,
        artwork: artwork || currentVideo?.artwork || null,
        duration: currentMedia ? currentMedia.duration || 0 : 0,
      }
      fetchPagelist(bvid)
      sendPlayback()
    } else if (currentVideo && currentVideo.bvid === bvid) {
      let changed = false
      if ((!currentVideo.mid || currentVideo.mid === 'undefined') && mid) {
        currentVideo.mid = mid
        changed = true
      }
      if ((!currentVideo.author || currentVideo.author === 'UP主') && author && author !== 'UP主') {
        currentVideo.author = author
        changed = true
      }
      if (!currentVideo.artwork && artwork) {
        currentVideo.artwork = artwork
        changed = true
      }
      if (changed) {
        sendPlayback()
      }
    }
  }

  const syncMediaPlayingState = () => {
    const mediaList = Array.from(document.querySelectorAll('video, audio'))
    if (mediaList.length === 0) return

    const activeMedia = mediaList.find((m) => !m.paused && !m.ended && (m.readyState >= 2 || m.currentTime > 0))
    if (activeMedia) {
      if (!currentMedia || currentMedia.paused) {
        hookMedia(activeMedia)
      }
      if (!isPlaying) {
        isPlaying = true
        isEnded = false
        sendPlayback()
      }
    }
  }

  setInterval(() => {
    addStyle()
    const videos = document.querySelectorAll('video, audio')
    videos.forEach(hookMedia)
    syncMediaPlayingState()
    extractActiveInfo()
    ensurePlaying()
    checkStatus()
  }, 1000)

  const observer = new MutationObserver(() => {
    const videos = document.querySelectorAll('video, audio')
    videos.forEach(hookMedia)
    syncMediaPlayingState()
    extractActiveInfo()
    if (wantedPlaying) ensurePlaying()
  })
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) observer.observe(document.body, { childList: true, subtree: true })
    })
  }

  // WBI Signer and pure JS MD5 for Bilibili APIs
  const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
  ]

  const md5 = (string) => {
    const rotateLeft = (lValue, iShiftBits) => (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits))
    const addUnsigned = (lX, lY) => {
      const lX4 = lX & 0x40000000
      const lY4 = lY & 0x40000000
      const lX8 = lX & 0x80000000
      const lY8 = lY & 0x80000000
      const lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff)
      if (lX4 & lY4) return lResult ^ 0x80000000 ^ lX8 ^ lY8
      if (lX4 | lY4) {
        if (lResult & 0x40000000) return lResult ^ 0xc0000000 ^ lX8 ^ lY8
        return lResult ^ 0x40000000 ^ lX8 ^ lY8
      }
      return lResult ^ lX8 ^ lY8
    }
    const F = (x, y, z) => (x & y) | ((~x) & z)
    const G = (x, y, z) => (x & z) | (y & (~z))
    const H = (x, y, z) => x ^ y ^ z
    const I = (x, y, z) => y ^ (x | (~z))
    const FF = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac)), s), b)
    const GG = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac)), s), b)
    const HH = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac)), s), b)
    const II = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac)), s), b)
    const convertToWordArray = (str) => {
      let lWordCount
      const lMessageLength = str.length
      const lNumberOfWords_temp1 = lMessageLength + 8
      const lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64
      const lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16
      const lWordArray = new Array(lNumberOfWords)
      for (let i = 0; i < lNumberOfWords; i++) lWordArray[i] = 0
      let lBytePosition = 0
      let lByteCount = 0
      while (lByteCount < lMessageLength) {
        lWordCount = (lByteCount - (lByteCount % 4)) / 4
        lBytePosition = (lByteCount % 4) * 8
        lWordArray[lWordCount] = lWordArray[lWordCount] | (str.charCodeAt(lByteCount) << lBytePosition)
        lByteCount++
      }
      lWordCount = (lByteCount - (lByteCount % 4)) / 4
      lBytePosition = (lByteCount % 4) * 8
      lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition)
      lWordArray[lNumberOfWords - 2] = lMessageLength << 3
      lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29
      return lWordArray
    }
    const wordToHex = (lValue) => {
      let WordToHexValue = ''
      for (let lCount = 0; lCount <= 3; lCount++) {
        const lByte = (lValue >>> (lCount * 8)) & 255
        const temp = '0' + lByte.toString(16)
        WordToHexValue += temp.substr(temp.length - 2, 2)
      }
      return WordToHexValue
    }
    const utf8Encode = (str) => {
      str = str.replace(/\r\n/g, '\n')
      let utftext = ''
      for (let n = 0; n < str.length; n++) {
        const c = str.charCodeAt(n)
        if (c < 128) {
          utftext += String.fromCharCode(c)
        } else if (c > 127 && c < 2048) {
          utftext += String.fromCharCode((c >> 6) | 192)
          utftext += String.fromCharCode((c & 63) | 128)
        } else {
          utftext += String.fromCharCode((c >> 12) | 224)
          utftext += String.fromCharCode(((c >> 6) & 63) | 128)
          utftext += String.fromCharCode((c & 63) | 128)
        }
      }
      return utftext
    }

    const encoded = utf8Encode(string)
    const x = convertToWordArray(encoded)
    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476
    const S11 = 7, S12 = 12, S13 = 17, S14 = 22
    const S21 = 5, S22 = 9, S23 = 14, S24 = 20
    const S31 = 4, S32 = 11, S33 = 16, S34 = 23
    const S41 = 6, S42 = 10, S43 = 15, S44 = 21

    for (let k = 0; k < x.length; k += 16) {
      const AA = a, BB = b, CC = c, DD = d
      a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478)
      d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756)
      c = FF(c, d, a, b, x[k + 2], S13, 0x242070db)
      b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee)
      a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf)
      d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a)
      c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613)
      b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501)
      a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8)
      d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af)
      c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1)
      b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be)
      a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122)
      d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193)
      c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e)
      b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821)
      a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562)
      d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340)
      c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51)
      b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa)
      a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d)
      d = GG(d, a, b, c, x[k + 10], S22, 0x2441453)
      c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681)
      b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8)
      a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6)
      d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6)
      c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87)
      b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed)
      a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905)
      d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8)
      c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9)
      b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a)
      a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942)
      d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681)
      c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122)
      b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c)
      a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44)
      d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9)
      c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60)
      b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70)
      a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6)
      d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa)
      c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085)
      b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05)
      a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039)
      d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5)
      c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8)
      b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665)
      a = II(a, b, c, d, x[k + 0], S41, 0xf4292244)
      d = II(d, a, b, c, x[k + 7], S42, 0x432aff97)
      c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7)
      b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039)
      a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3)
      d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92)
      c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d)
      b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1)
      a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f)
      d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0)
      c = II(c, d, a, b, x[k + 6], S43, 0xa3014314)
      b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1)
      a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82)
      d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235)
      c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb)
      b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391)
      a = addUnsigned(a, AA)
      b = addUnsigned(b, BB)
      c = addUnsigned(c, CC)
      d = addUnsigned(d, DD)
    }
    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase()
  }

  const getKeyFromUrl = (url) => {
    if (!url || typeof url !== 'string') return ''
    const parts = url.split('/')
    const file = parts[parts.length - 1]
    return file ? file.split('.')[0] : ''
  }

  let wbiImgKey = ''
  let wbiSubKey = ''

  const updateWbiKeys = (wbiImg) => {
    if (!wbiImg) return
    const img = getKeyFromUrl(wbiImg.img_url)
    const sub = getKeyFromUrl(wbiImg.sub_url)
    if (img && sub) {
      wbiImgKey = img
      wbiSubKey = sub
    }
  }

  const getWbiKeys = async () => {
    if (wbiImgKey && wbiSubKey) {
      return { imgKey: wbiImgKey, subKey: wbiSubKey }
    }
    try {
      const res = await apiFetch('https://api.bilibili.com/x/web-interface/nav')
      const data = await res.json()
      if (data?.data?.wbi_img) {
        updateWbiKeys(data.data.wbi_img)
      }
    } catch {}
    return { imgKey: wbiImgKey, subKey: wbiSubKey }
  }

  const getMixinKey = (orig) => {
    let temp = ''
    for (let i = 0; i < mixinKeyEncTab.length; i++) {
      temp += orig[mixinKeyEncTab[i]] || ''
    }
    return temp.slice(0, 32)
  }

  const signWbi = async (params) => {
    const { imgKey, subKey } = await getWbiKeys()
    if (!imgKey || !subKey) {
      return Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    }
    const mixinKey = getMixinKey(imgKey + subKey)
    const currTime = Math.round(Date.now() / 1000)
    const newParams = { ...params, wts: currTime }
    const sortedKeys = Object.keys(newParams).sort()
    const query = []
    for (const k of sortedKeys) {
      let v = String(newParams[k])
      v = v.replace(/[!'()*]/g, '')
      query.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
    const queryString = query.join('&')
    const w_rid = md5(queryString + mixinKey)
    return `${queryString}&w_rid=${w_rid}`
  }

  let lastSignedIn = null
  let isCheckingNav = false
  let lastNavCheck = 0

  const checkStatus = async () => {
    const cookieSignedIn = document.cookie.includes('DedeUserID')
    if (cookieSignedIn && lastSignedIn !== true) {
      lastSignedIn = true
      post({
        type: 'state',
        state: { signedIn: true, playing: isPlaying },
      })
      return
    }

    const now = Date.now()
    if (isCheckingNav || now - lastNavCheck < 5000) return
    isCheckingNav = true
    lastNavCheck = now
    try {
      const res = await apiFetch('https://api.bilibili.com/x/web-interface/nav')
      const data = await res.json()
      if (data?.data?.wbi_img) {
        updateWbiKeys(data.data.wbi_img)
      }
      const signedIn = Boolean(data?.data?.isLogin)
      if (signedIn !== lastSignedIn) {
        lastSignedIn = signedIn
        post({
          type: 'state',
          state: { signedIn, playing: isPlaying },
        })
      }
    } catch {
    } finally {
      isCheckingNav = false
    }
  }

  const sendPlayback = () => {
    if (!currentVideo) return
    const isLive = Boolean(
      currentVideo.isLive ||
      location.hostname.includes('live.bilibili.com') ||
      (currentVideo.bvid && currentVideo.bvid.startsWith('live:'))
    )
    let dur = 0
    if (!isLive) {
      dur = currentMedia && Number.isFinite(currentMedia.duration)
        ? currentMedia.duration
        : currentVideo && Number.isFinite(currentVideo.duration)
          ? currentVideo.duration
          : 0
    }
    let pos = 0
    if (currentMedia && Number.isFinite(currentMedia.currentTime)) {
      pos = currentMedia.currentTime
    }
    const status = isLive
      ? (isPlaying ? 'playing' : 'paused')
      : (isEnded ? 'ended' : isPlaying ? 'playing' : 'paused')

    post({
      type: 'playback',
      playback: {
        bvid: currentVideo.bvid || null,
        title: currentVideo.title || (isLive ? '哔哩哔哩直播' : '哔哩哔哩视频'),
        artist: currentVideo.author || (isLive ? '主播' : 'UP主'),
        mid: currentVideo.mid || null,
        artwork: currentVideo.artwork || null,
        duration: dur,
        position: pos,
        status,
        quality: currentQuality,
        qualities: getAvailableQualities(),
        rate: currentMedia && Number.isFinite(currentMedia.playbackRate) ? currentMedia.playbackRate : currentRate,
        danmaku: isDanmakuOn,
        page: currentPage,
        pages: currentPages.length > 0 ? currentPages : undefined,
        isLive,
        roomId: currentVideo.roomId || undefined,
      },
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
      isPlaying = true
      isEnded = false
      if (cmd.page) {
        currentPage = cmd.page
      }
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
        } else if (cmd.video.roomId || cmd.video.isLive || (cmd.video.bvid && cmd.video.bvid.startsWith('live:'))) {
          const roomId = String(cmd.video.roomId || cmd.video.bvid.replace('live:', ''))
          const targetUrl = `https://live.bilibili.com/${roomId}`
          const currentRoomMatch = location.pathname.match(/\/(\d+)/)
          const currentRoomId = currentRoomMatch ? currentRoomMatch[1] : ''
          try {
            sessionStorage.setItem('westplay_live_meta', JSON.stringify({
              roomId: Number(roomId),
              title: cmd.video.title,
              author: cmd.video.author,
              artwork: cmd.video.artwork,
              mid: cmd.video.mid,
            }))
          } catch {}

          const neptuneRealId = window.__NEPTUNE_IS_MY_WAIFU__?.roomInfoRes?.data?.room_info?.room_id
          const neptuneShortId = window.__NEPTUNE_IS_MY_WAIFU__?.roomInfoRes?.data?.room_info?.short_id

          const isSameRoom = Boolean(
            location.hostname.includes('live.bilibili.com') &&
            (
              (currentRoomId && currentRoomId === roomId) ||
              (neptuneRealId && String(neptuneRealId) === roomId) ||
              (neptuneShortId && String(neptuneShortId) === roomId)
            )
          )

          if (!isSameRoom) {
            document.querySelectorAll('video, audio').forEach((el) => {
              try {
                el.pause()
                el.removeAttribute('src')
                el.load()
              } catch {}
            })
            window.onbeforeunload = null
            location.href = targetUrl
            return
          } else {
            const v = document.querySelector('video')
            if (v && v.paused) {
              v.play().catch(() => {})
            }
            ensurePlaying()
            sendPlayback()
          }
        } else if (cmd.video.bvid && (cmd.video.bvid.startsWith('ss') || cmd.video.bvid.startsWith('ep'))) {
          const targetUrl = `https://www.bilibili.com/bangumi/play/${cmd.video.bvid}`
          if (!location.pathname.includes(cmd.video.bvid)) {
            document.querySelectorAll('video, audio').forEach((el) => {
              try {
                el.pause()
                el.removeAttribute('src')
                el.load()
              } catch {}
            })
            window.onbeforeunload = null
            location.href = targetUrl
            return
          } else {
            ensurePlaying()
            sendPlayback()
          }
        } else if (cmd.video.seasonId || cmd.video.epId) {
          const id = cmd.video.epId ? `ep${cmd.video.epId}` : `ss${cmd.video.seasonId}`
          const targetUrl = `https://www.bilibili.com/bangumi/play/${id}`
          if (!location.href.includes(id)) {
            document.querySelectorAll('video, audio').forEach((el) => {
              try {
                el.pause()
                el.removeAttribute('src')
                el.load()
              } catch {}
            })
            window.onbeforeunload = null
            location.href = targetUrl
            return
          } else {
            ensurePlaying()
            sendPlayback()
          }
        } else if (cmd.video.bvid) {
          const targetUrl = `https://www.bilibili.com/video/${cmd.video.bvid}${cmd.page && cmd.page > 1 ? `?p=${cmd.page}` : ''}`
          if (!location.pathname.includes(cmd.video.bvid) || (cmd.page && location.search !== `?p=${cmd.page}`)) {
            document.querySelectorAll('video, audio').forEach((el) => {
              try {
                el.pause()
                el.removeAttribute('src')
                el.load()
              } catch {}
            })
            window.onbeforeunload = null
            location.href = targetUrl
            return
          } else {
            ensurePlaying()
            sendPlayback()
          }
        }
      } else {
        document.querySelectorAll('video, audio').forEach((el) => {
          try { el.play().catch(() => {}) } catch {}
        })
        ensurePlaying()
        sendPlayback()
      }
    } else if (action === 'pause') {
      wantedPlaying = false
      isPlaying = false
      document.querySelectorAll('video, audio').forEach((el) => {
        try { el.pause() } catch {}
      })
      const playBtn = document.querySelector(
        '.bpx-player-ctrl-play, .web-player-controller-wrap .play-btn, .room-player-box .play-btn'
      )
      if (playBtn && (playBtn.getAttribute('aria-label') === '暂停' || !playBtn.classList.contains('paused'))) {
        try { playBtn.click() } catch {}
      }
      sendPlayback()
    } else if (action === 'stop') {
      wantedPlaying = false
      isPlaying = false
      isEnded = false
      currentVideo = null
      currentMedia = null
      currentPages = []
      document.querySelectorAll('video, audio').forEach((el) => {
        try {
          el.pause()
          el.removeAttribute('src')
          el.load()
        } catch {}
      })
      if (
        location.pathname.includes('/video/') ||
        location.pathname.includes('/bangumi/') ||
        location.hostname.includes('live.bilibili.com')
      ) {
        window.onbeforeunload = null
        location.href = 'https://www.bilibili.com/'
      }
      post({ type: 'playback', playback: null })
    } else if (action === 'crop') {
      if (cmd.on) {
        document.documentElement.classList.add('westplay-crop')
      } else {
        document.documentElement.classList.remove('westplay-crop')
      }
    } else if (action === 'seek') {
      isEnded = false
      if (currentMedia && typeof cmd.seconds === 'number') {
        currentMedia.currentTime = cmd.seconds
        if (wantedPlaying) {
          currentMedia.play().catch(() => {})
        }
      }
    } else if (action === 'volume') {
      if (currentMedia && typeof cmd.percent === 'number') {
        currentMedia.volume = Math.max(0, Math.min(1, cmd.percent / 100))
      }
    } else if (action === 'quality') {
      if (typeof cmd.quality === 'number') {
        currentQuality = cmd.quality
        applyQuality(cmd.quality)
        sendPlayback()
      }
    } else if (action === 'rate') {
      if (typeof cmd.rate === 'number') {
        currentRate = cmd.rate
        if (currentMedia) currentMedia.playbackRate = cmd.rate
        sendPlayback()
      }
    } else if (action === 'danmaku') {
      isDanmakuOn = Boolean(cmd.on)
      if (isDanmakuOn) {
        document.documentElement.classList.add('westplay-danmaku-on')
      } else {
        document.documentElement.classList.remove('westplay-danmaku-on')
      }
      sendPlayback()
    } else if (action === 'ask') {
      handleAsk(cmd.id, cmd.question)
    }
  }



  const formatCount = (num) => {
    if (num === undefined || num === null) return ''
    const n = Number(num)
    if (Number.isNaN(n)) return String(num)
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
    if (n >= 10000) return (n / 10000).toFixed(1) + '万'
    return String(n)
  }

  const parseDuration = (str) => {
    if (typeof str === 'number') return str
    if (!str || typeof str !== 'string') return 0
    const parts = str.split(':').map(Number)
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }

  const formatPubdate = (ts) => {
    if (!ts) return ''
    const date = new Date(ts * 1000)
    const now = new Date()
    const diff = (now.getTime() - date.getTime()) / 1000
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
    if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  }

  const getCookie = (name) => {
    const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'))
    return match ? decodeURIComponent(match[3]) : ''
  }

  const handleAsk = async (id, question) => {
    try {
      if (!question || typeof question !== 'object') return

      if (question.ask === 'search') {
        const query = question.query || ''
        const page = question.page || 1
        if (question.filter === 'users') {
          const res = await apiFetch(`https://api.bilibili.com/x/web-interface/search/type?search_type=bili_user&keyword=${encodeURIComponent(query)}&page=${page}`)
          const data = await res.json()
          const list = data?.data?.result || []
          const channels = list.map((u) => ({
            mid: String(u.mid),
            name: cleanText(u.uname),
            avatar: formatPic(u.upic),
            sign: cleanText(u.usign),
            fans: formatCount(u.fans),
            videos: formatCount(u.videos),
          }))
          post({ type: 'answer', answer: { id, channels, hasMore: list.length >= 20 } })
        } else {
          const res = await apiFetch(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(query)}&page=${page}`)
          const data = await res.json()
          const list = data?.data?.result || []
          const videos = list.map((v) => ({
            bvid: v.bvid,
            title: cleanText(v.title),
            author: cleanText(v.author),
            mid: v.mid ? String(v.mid) : undefined,
            artwork: formatPic(v.pic),
            duration: parseDuration(v.duration),
            playCount: formatCount(v.play),
            pubdate: formatPubdate(v.pubdate),
          }))
          post({ type: 'answer', answer: { id, videos, hasMore: list.length >= 20 } })
        }
      } else if (question.ask === 'suggest') {
        const term = question.query || ''
        const res = await apiFetch(`https://s.search.bilibili.com/main/suggest?term=${encodeURIComponent(term)}`)
        const data = await res.json()
        const tags = data?.result?.tag || []
        const suggestions = tags.map((t) => t.value).filter(Boolean)
        post({ type: 'answer', answer: { id, suggestions } })
      } else if (question.ask === 'popular') {
        const page = question.page || 1
        const res = await apiFetch(`https://api.bilibili.com/x/web-interface/popular?ps=20&pn=${page}`)
        const data = await res.json()
        const list = data?.data?.list || []
        const videos = list.map((v) => ({
          bvid: v.bvid,
          title: cleanText(v.title),
          author: cleanText(v.owner?.name),
          mid: v.owner?.mid ? String(v.owner.mid) : undefined,
          artwork: formatPic(v.pic),
          duration: v.duration || 0,
          playCount: formatCount(v.stat?.view),
          pubdate: formatPubdate(v.pubdate),
        }))
        post({ type: 'answer', answer: { id, videos, hasMore: list.length >= 20 } })
      } else if (question.ask === 'recommend') {
        const page = question.page || 1
        const res = await apiFetch(`https://api.bilibili.com/x/web-interface/index/top/feed/rcmd?ps=20&fresh_idx=${page}`)
        const data = await res.json()
        const list = data?.data?.item || []
        const videos = list.map((v) => ({
          bvid: v.bvid,
          title: cleanText(v.title),
          author: cleanText(v.owner?.name),
          mid: v.owner?.mid ? String(v.owner.mid) : undefined,
          artwork: formatPic(v.pic),
          duration: v.duration || 0,
          playCount: formatCount(v.stat?.view),
          pubdate: formatPubdate(v.pubdate),
        }))
        post({ type: 'answer', answer: { id, videos, hasMore: list.length >= 20 } })
      } else if (question.ask === 'feed') {
        const which = question.which || 'recommend'
        const page = question.page || 1
        if (which === 'dynamic') {
          if (page === 1) {
            dynamicOffset = ''
          }
          const offsetParam = dynamicOffset ? `&offset=${encodeURIComponent(dynamicOffset)}` : ''
          const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?timezone_offset=-480&type=all&features=itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete${offsetParam}`
          const res = await apiFetch(url)
          const data = await res.json()

          if (data?.code !== 0) {
            console.warn('[bilibili] dynamic error code:', data?.code, data?.message)
            post({
              type: 'answer',
              answer: {
                id,
                failed: true,
                error: data?.code === -101 ? '账号未登录或登录已过期' : (data?.message || '获取动态失败'),
                videos: [],
                dynamics: [],
              },
            })
            return
          }

          let items = data?.data?.items || []
          if (data?.data?.offset) {
            dynamicOffset = String(data.data.offset)
          }

          const dynamics = items
            .map((it) => {
              if (!it) return null
              const arc =
                it.modules?.module_dynamic?.major?.archive ||
                it.modules?.module_dynamic?.major?.pgc ||
                it.orig?.modules?.module_dynamic?.major?.archive ||
                it.orig?.modules?.module_dynamic?.major?.pgc
              const author = it.modules?.module_author || {}

              let pubTime = ''
              if (typeof author.pub_time === 'string' && author.pub_time.trim()) {
                pubTime = cleanText(author.pub_time)
              } else if (typeof author.pub_ts === 'number' && author.pub_ts > 0) {
                pubTime = formatPubdate(author.pub_ts)
              } else if (typeof author.pub_time === 'number' && author.pub_time > 0) {
                pubTime = formatPubdate(author.pub_time)
              }

              const desc = cleanText(
                it.modules?.module_dynamic?.desc?.text ||
                it.modules?.module_dynamic?.major?.opus?.summary?.text ||
                it.modules?.module_dynamic?.major?.opus?.title ||
                it.modules?.module_dynamic?.topic?.name
              )

              const origDesc = cleanText(
                it.orig?.modules?.module_dynamic?.desc?.text ||
                it.orig?.modules?.module_dynamic?.major?.opus?.summary?.text ||
                it.orig?.modules?.module_dynamic?.major?.opus?.title
              )

              const origAuthor = cleanText(it.orig?.modules?.module_author?.name)

              const video = arc ? {
                bvid: String(arc.bvid || (arc.aid ? `av${arc.aid}` : '')),
                title: cleanText(arc.title) || '视频',
                author: cleanText(it.orig ? (it.orig.modules?.module_author?.name || '原UP主') : (author.name || 'UP主')) || 'UP主',
                mid: String(arc.author?.mid || author.mid || ''),
                artwork: formatPic(arc.cover),
                duration: parseDuration(arc.duration_text),
                playCount: formatCount(arc.stat?.play),
                pubdate: String(arc.badge?.text || pubTime || ''),
              } : undefined

              const id = String(it.id_str || it.basic?.id_str || (Date.now() + Math.random()))

              return {
                id,
                author: {
                  mid: String(author.mid || ''),
                  name: cleanText(author.name || 'UP主') || 'UP主',
                  avatar: formatPic(author.face),
                  pubTime: String(pubTime || ''),
                  pubAction: cleanText(author.pub_action || (arc ? '投稿了视频' : '发布了动态')) || (arc ? '投稿了视频' : '发布了动态'),
                },
                desc: desc || undefined,
                video: video && video.bvid ? video : undefined,
                origAuthor: origAuthor || undefined,
                origDesc: origDesc || undefined,
              }
            })
            .filter((d) => d && (d.video || d.desc || d.origDesc || d.author?.name))

          const videos = dynamics.map((d) => d.video).filter(Boolean)

          post({
            type: 'answer',
            answer: {
              id,
              dynamics,
              videos,
              hasMore: Boolean(data?.data?.has_more),
            },
          })
        } else if (which === 'popular') {
          const res = await apiFetch(`https://api.bilibili.com/x/web-interface/popular?ps=20&pn=${page}`)
          const data = await res.json()
          const list = data?.data?.list || []
          const videos = list.map((v) => ({
            bvid: v.bvid,
            title: cleanText(v.title),
            author: cleanText(v.owner?.name),
            mid: v.owner?.mid ? String(v.owner.mid) : undefined,
            artwork: formatPic(v.pic),
            duration: v.duration || 0,
            playCount: formatCount(v.stat?.view),
            pubdate: formatPubdate(v.pubdate),
          }))
          post({ type: 'answer', answer: { id, videos, hasMore: list.length >= 20 } })
        } else {
          const freshIdx = (question.freshIdx ? question.freshIdx * 10 : 0) + page
          const res = await apiFetch(`https://api.bilibili.com/x/web-interface/index/top/feed/rcmd?ps=20&fresh_idx=${freshIdx}`)
          const data = await res.json()
          const list = data?.data?.item || []
          const videos = list.map((v) => ({
            bvid: v.bvid,
            title: cleanText(v.title),
            author: cleanText(v.owner?.name),
            mid: v.owner?.mid ? String(v.owner.mid) : undefined,
            artwork: formatPic(v.pic),
            duration: v.duration || 0,
            playCount: formatCount(v.stat?.view),
            pubdate: formatPubdate(v.pubdate),
          }))
          post({ type: 'answer', answer: { id, videos, hasMore: list.length >= 20 } })
        }
      } else if (question.ask === 'channel') {
        const mid = question.mid
        const page = question.page || 1

        // 1. Fetch channel profile from card API & relation stat (non-WBI)
        const [cardRes, statRes] = await Promise.all([
          apiFetch(`https://api.bilibili.com/x/web-interface/card?mid=${mid}&photo=true`).then((r) => r.json()).catch(() => null),
          apiFetch(`https://api.bilibili.com/x/relation/stat?vmid=${mid}`).then((r) => r.json()).catch(() => null),
        ])

        const cardData = cardRes?.data?.card || {}
        const spaceData = cardRes?.data?.space || {}
        const statData = statRes?.data || {}

        const channelName = cleanText(cardData.name || '')
        const channel = {
          mid: String(mid),
          name: channelName || 'UP主',
          avatar: formatPic(cardData.face),
          banner: formatPic(spaceData.s_img || spaceData.l_img),
          sign: cleanText(cardData.sign),
          fans: formatCount(cardData.fans || statData.follower || 0),
          videos: formatCount(cardRes?.data?.archive_count || 0),
          subscribed: cardRes?.data?.following !== undefined ? Boolean(cardRes.data.following) : null,
        }

        // 2. Fetch channel videos using WBI-signed space search
        let vlist = []
        let totalCount = cardRes?.data?.archive_count || 0
        try {
          const signedQuery = await signWbi({ mid: String(mid), ps: 20, pn: page, order: 'pubdate' })
          const arcRes = await apiFetch(`https://api.bilibili.com/x/space/wbi/arc/search?${signedQuery}`).then((r) => r.json()).catch(() => null)
          if (arcRes?.code === 0 && arcRes?.data?.list?.vlist) {
            vlist = arcRes.data.list.vlist
            if (arcRes.data.page?.count) totalCount = arcRes.data.page.count
          }
        } catch (e) {
          console.warn('[bilibili] arc search error', e)
        }

        // Fallback: if vlist is empty on page 1 and we have channelName, try searching videos by author keyword
        if (vlist.length === 0 && page === 1 && channelName && channelName !== 'UP主') {
          try {
            const searchRes = await apiFetch(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(channelName)}&page=1`).then((r) => r.json()).catch(() => null)
            const searchItems = searchRes?.data?.result || []
            const matched = searchItems.filter((v) => cleanText(v.author) === channelName || String(v.mid) === String(mid))
            if (matched.length > 0) {
              vlist = matched
            } else if (searchItems.length > 0) {
              vlist = searchItems.slice(0, 10)
            }
          } catch {}
        }

        if (totalCount && (!channel.videos || channel.videos === '0')) {
          channel.videos = formatCount(totalCount)
        }

        const videos = vlist.map((v) => ({
          bvid: v.bvid,
          title: cleanText(v.title),
          author: channel.name,
          mid: String(mid),
          artwork: formatPic(v.pic),
          duration: typeof v.length === 'string' ? parseDuration(v.length) : (v.duration ? parseDuration(v.duration) : 0),
          playCount: formatCount(v.play || v.stat?.view),
          pubdate: formatPubdate(v.created || v.pubdate),
        }))

        post({ type: 'answer', answer: { id, channel, videos, hasMore: vlist.length >= 20 } })
      } else if (question.ask === 'playlist') {
        const bvid = question.bvid
        const res = await apiFetch(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`)
        const data = await res.json()
        const list = data?.data || []
        const pages = list.map((p) => ({
          cid: p.cid,
          page: p.page,
          part: p.part || `第${p.page}集`,
          duration: p.duration || 0,
        }))
        post({ type: 'answer', answer: { id, pages } })
      } else if (question.ask === 'related') {
        const bvid = question.bvid
        const res = await apiFetch(`https://api.bilibili.com/x/web-interface/archive/related?bvid=${bvid}`)
        const data = await res.json()
        const list = data?.data || []
        const videos = list.map((v) => ({
          bvid: v.bvid,
          title: cleanText(v.title),
          author: cleanText(v.owner?.name),
          mid: v.owner?.mid ? String(v.owner.mid) : undefined,
          artwork: formatPic(v.pic),
          duration: v.duration || 0,
          playCount: formatCount(v.stat?.view),
          pubdate: formatPubdate(v.pubdate),
        }))
        post({ type: 'answer', answer: { id, videos } })
      } else if (question.ask === 'subscribe') {
        const mid = question.mid
        const csrf = getCookie('bili_jct')
        const act = question.on ? 1 : 2
        const res = await apiFetch('https://api.bilibili.com/x/relation/modify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `fid=${mid}&act=${act}&re_src=11&csrf=${csrf}`,
        })
        const data = await res.json()
        post({ type: 'answer', answer: { id, failed: data?.code !== 0, error: data?.message } })
      } else if (question.ask === 'live') {
        const page = question.page || 1
        const parentAreaId = question.parentAreaId ?? question.parent_area_id ?? 0
        let followingLiveRooms = []
        let liveRooms = []
        let hasMore = false

        // 1. On page 1: Prioritize followed UP hosts who are currently live
        if (page === 1) {
          try {
            const followRes = await apiFetch('https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/GetWebList?hit_ab=false')
            const followData = await followRes.json()
            const followList = followData?.data?.rooms || []
            followingLiveRooms = followList.map((r) => ({
              roomId: r.room_id || r.roomid || 0,
              uid: r.uid || 0,
              title: cleanText(r.title || r.roomname || '直播中'),
              uname: cleanText(r.uname || r.nickname || 'UP主'),
              avatar: formatPic(r.face),
              cover: formatPic(r.cover || r.user_cover || r.system_cover || r.keyframe),
              areaName: cleanText(r.area_name || r.area_v2_name || ''),
              online: formatCount(r.online),
              isFollowing: true,
            }))
          } catch (e) {
            console.warn('[bilibili] fetch followed live failed', e)
          }
        }

        // 2. Fetch category live rooms
        try {
          const areaParam = parentAreaId > 0 ? `parent_area_id=${parentAreaId}&` : ''
          const url = `https://api.live.bilibili.com/room/v3/area/getRoomList?platform=web&${areaParam}sort_type=online&page=${page}&page_size=20`
          const areaRes = await apiFetch(url)
          const areaData = await areaRes.json()
          let list = areaData?.data?.list || []

          // If category returned empty on page 1, fallback to live search
          if (list.length === 0 && page === 1) {
            const fallbackKeywords = {
              6: '单机游戏',
              2: '英雄联盟',
              3: '王者荣耀',
              9: '虚拟主播',
              1: '唱歌',
              5: '电台',
            }
            const fallbackKeyword = fallbackKeywords[parentAreaId] || (parentAreaId === 0 ? '热门' : '驾驶')
            const searchRes = await apiFetch(`https://api.bilibili.com/x/web-interface/search/type?search_type=live&keyword=${encodeURIComponent(fallbackKeyword)}&page=1`)
              .then((r) => r.json())
              .catch(() => null)
            const searchList = searchRes?.data?.result?.live_room || searchRes?.data?.result || []
            if (Array.isArray(searchList) && searchList.length > 0) {
              list = searchList.map((item) => ({
                roomid: item.roomid,
                uid: item.uid,
                title: item.title,
                uname: item.uname,
                face: item.uface,
                cover: item.cover || item.user_cover,
                area_name: item.cate_name,
                parent_name: item.parent_name,
                online: item.online,
              }))
            }
          }

          liveRooms = list.map((r) => ({
            roomId: r.roomid || r.room_id || 0,
            uid: r.uid || 0,
            title: cleanText(r.title || '直播中'),
            uname: cleanText(r.uname || '主播'),
            avatar: formatPic(r.face),
            cover: formatPic(r.cover || r.user_cover || r.system_cover),
            areaName: cleanText(r.area_v2_name || r.area_name || r.parent_name || ''),
            parentAreaName: cleanText(r.area_v2_parent_name || r.parent_name || ''),
            online: formatCount(r.online),
            isFollowing: false,
          }))
          hasMore = list.length >= 20
        } catch (e) {
          console.warn('[bilibili] fetch live rooms error', e)
        }

        post({
          type: 'answer',
          answer: {
            id,
            followingLiveRooms: page === 1 ? followingLiveRooms : undefined,
            liveRooms,
            hasMore,
          },
        })
        return
      } else if (question.ask === 'movie') {
        const page = question.page || 1
        const seasonType = question.seasonType ?? question.season_type ?? 2 // 2: 电影, 5: 电视剧, 3: 纪录片, 7: 综艺, 1: 动画
        const order = question.order ?? 3 // 3: 最热追剧, 2: 播放最多, 4: 评分最高, 0: 最新更新
        const pageSize = 20

        const url = `https://api.bilibili.com/pgc/season/index/result?season_version=-1&is_finish=-1&copyright=-1&season_status=-1&year=-1&style_id=-1&order=${order}&st=${seasonType}&sort=0&page=${page}&season_type=${seasonType}&pagesize=${pageSize}&type=1`
        const res = await apiFetch(url, {
          headers: {
            'Referer': 'https://www.bilibili.com/movie/',
          },
        })
        const data = await res.json()
        const list = data?.data?.list || []
        const total = data?.data?.total || 0
        const hasMore = page * pageSize < total

        const movies = list.map((item) => ({
          seasonId: item.season_id,
          title: cleanText(item.title),
          subTitle: cleanText(item.subTitle || item.sub_title || ''),
          cover: formatPic(item.cover),
          badge: cleanText(item.badge || item.badge_info?.text || ''),
          score: cleanText(item.score || ''),
          indexShow: cleanText(item.index_show || ''),
          order: cleanText(item.order || ''),
          link: item.link || '',
          epId: item.first_ep?.ep_id || undefined,
        }))

        post({
          type: 'answer',
          answer: {
            id,
            movies,
            hasMore,
          },
        })
        return
      }
    } catch (err) {
      post({ type: 'answer', answer: { id, failed: true, error: String(err) } })
    }
  }

  const fetchPopularVideos = async () => {
    try {
      const res = await apiFetch('https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1')
      const data = await res.json()
      const list = data?.data?.list || []
      const videos = list.map((v) => ({
        bvid: v.bvid,
        title: cleanText(v.title),
        author: cleanText(v.owner?.name),
        mid: v.owner?.mid ? String(v.owner.mid) : undefined,
        artwork: formatPic(v.pic),
        duration: v.duration || 0,
        playCount: formatCount(v.stat?.view),
        pubdate: formatPubdate(v.pubdate),
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
