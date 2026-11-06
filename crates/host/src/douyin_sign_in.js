;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  let autoClicked = false
  let checkingAccount = false

  const check = async () => {
    // 1. Check DOM for logged-in user avatar or profile elements
    const avatar = document.querySelector(
      '[data-e2e="profile-avatar"], a[href*="/user/MS4wLjAB"], .avatar-component, img[class*="avatar"]'
    )
    const loginBtn = document.querySelector('[data-e2e="header-login-button"]')

    if (avatar && !loginBtn) {
      post({ signedIn: true })
      return
    }

    // 2. Cookie check for explicit login status
    if (document.cookie.includes('LOGIN_STATUS=1')) {
      post({ signedIn: true })
      return
    }

    // 3. Douyin passport account verification API
    if (!checkingAccount) {
      checkingAccount = true
      try {
        const res = await fetch('/passport/web/account/info/', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data && (data.message === 'success' || data?.data?.error_code === 0)) {
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

    // 4. If not logged in and login button is visible, auto-click to pop up QR login modal
    if (!autoClicked && loginBtn) {
      const qrModal = document.querySelector(
        '[class*="login-guide"], [class*="login-panel"], [class*="login-mask"], [id*="login"]'
      )
      if (!qrModal) {
        autoClicked = true
        loginBtn.click()
      }
    }

    setTimeout(check, 800)
  }

  check()
})()
