;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  const check = () => {
    if (
      document.cookie.includes('sessionid') ||
      document.cookie.includes('LOGIN_STATUS') ||
      (location.hostname.includes('hongguoduanju.com') && !location.pathname.includes('login'))
    ) {
      post({ signedIn: true })
      return
    }
    setTimeout(check, 500)
  }
  check()
})()
