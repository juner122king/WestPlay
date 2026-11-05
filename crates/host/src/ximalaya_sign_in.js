;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  const check = () => {
    if (document.cookie.includes('1&_token') || (location.hostname.includes('ximalaya.com') && !location.pathname.includes('login'))) {
      post({ signedIn: true })
      return
    }
    setTimeout(check, 500)
  }
  check()
})()
