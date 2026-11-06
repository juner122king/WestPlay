;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  let autoClicked = false

  const check = () => {
    // 1. Check DOM for logged-in indicators
    const avatar = document.querySelector(
      'img[class*="avatar"], div[class*="avatar"], [class*="user-info"], [class*="user-header"], a[href*="/user"]'
    )
    const loginButtons = Array.from(document.querySelectorAll('button, a, span')).filter(
      (el) => el.textContent?.trim() === '登录' && el.offsetParent !== null
    )

    if (avatar && loginButtons.length === 0) {
      post({ signedIn: true })
      return
    }

    if (document.cookie.includes('LOGIN_STATUS=1')) {
      post({ signedIn: true })
      return
    }

    // 2. Auto click login button if QR modal hasn't popped up
    if (!autoClicked && loginButtons.length > 0) {
      const modal = document.querySelector('[class*="dialog"], [class*="modal"], [class*="qr"], [class*="login-panel"]')
      if (!modal) {
        autoClicked = true
        loginButtons[0].click()
      }
    }

    setTimeout(check, 800)
  }

  check()
})()
