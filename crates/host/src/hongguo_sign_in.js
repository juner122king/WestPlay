;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  let autoClicked = false

  const check = () => {
    const hasUserCookies =
      document.cookie.includes('sessionid=') ||
      document.cookie.includes('sessionid_ss=') ||
      document.cookie.includes('sid_tt=') ||
      document.cookie.includes('uid_tt=')

    const avatar = document.querySelector(
      'img[class*="avatar"], div[class*="avatar"], a[href*="/user"], [class*="user-info"], [class*="user-header"]',
    )

    const loginBtn = Array.from(document.querySelectorAll('button, a, div[role="button"]')).find((el) => {
      const text = el.textContent?.trim()
      return (text === '登录' || text === '立即登录') && el.offsetParent !== null
    })

    if (hasUserCookies || (avatar && !loginBtn)) {
      post({ signedIn: true })
      return
    }

    if (!autoClicked && loginBtn) {
      const modal = document.querySelector(
        '[class*="dialog"], [class*="modal"], [class*="qr"], [class*="login-panel"], .web-login-container',
      )
      if (!modal) {
        autoClicked = true
        loginBtn.click()
      }
    }

    setTimeout(check, 600)
  }

  check()
})()
