;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  let clicked = false
  let checkingAccount = false

  const check = async () => {
    // 1. Check DOM for logged-in indicators
    // NetEase replaces the login button with avatar/nickname in top nav
    const hasAvatar = Boolean(
      document.querySelector('a[href*="/user/home"]') ||
      document.querySelector('a[href*="/u?id="]') ||
      document.querySelector('.m-tophead img') ||
      document.querySelector('.head.f-fl img') ||
      (window.GUser && window.GUser.userId > 0)
    )

    if (hasAvatar) {
      post({ signedIn: true })
      return
    }

    // 2. NetEase account API (cookies like MUSIC_U are sent automatically with credentials: 'include')
    if (!checkingAccount) {
      checkingAccount = true
      try {
        const res = await fetch('/api/nuser/account/get', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data && data.code === 200 && data.account && data.account.id) {
            post({ signedIn: true })
            return
          }
        }
      } catch (e) {
        // network or parse error, ignore and retry
      } finally {
        checkingAccount = false
      }
    }

    // 3. Auto click login button if QR modal hasn't popped up
    if (!clicked && location.hostname.includes('music.163.com')) {
      const loginBtn = document.querySelector('.link.s-fc3') || document.querySelector('a[data-action="login"]')
      const qrModal = document.querySelector('.m-layer') || document.querySelector('[class*="login-box"]')
      if (loginBtn && !qrModal) {
        clicked = true
        loginBtn.click()
      }
    }

    setTimeout(check, 800)
  }

  check()
})()
