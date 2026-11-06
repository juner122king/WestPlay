;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  let autoClicked = false

  const check = () => {
    // 1. Check DOM for logged-in user avatar or profile elements
    const avatar = document.querySelector(
      'img[class*="avatar"], div[class*="avatar"], a[href*="/user"], [class*="user-info"], [class*="user-header"]'
    )
    const hasUserCookies =
      document.cookie.includes('sessionid') ||
      document.cookie.includes('sid_tt') ||
      document.cookie.includes('uid_tt')

    const loginBtn = Array.from(document.querySelectorAll('button, a, div[role="button"]')).find((el) => {
      const text = el.textContent?.trim()
      return (text === '登录' || text === '立即登录' || el.getAttribute('class')?.includes('login')) && el.offsetParent !== null
    })

    if (avatar || hasUserCookies || (!loginBtn && document.querySelector('video'))) {
      post({ signedIn: true })
      return
    }

    // 2. Auto click login button if QR modal is not open yet
    if (!autoClicked && loginBtn) {
      const modal = document.querySelector('[class*="dialog"], [class*="modal"], [class*="qr"], [class*="login-panel"]')
      if (!modal) {
        autoClicked = true
        loginBtn.click()
      }
    }

    setTimeout(check, 600)
  }

  check()
})()
