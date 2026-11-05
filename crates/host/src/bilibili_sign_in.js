;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  const check = () => {
    if (document.cookie.includes('DedeUserID') || (location.hostname.includes('bilibili.com') && !location.pathname.includes('login'))) {
      post({ signedIn: true })
      return
    }
    setTimeout(check, 500)
  }
  check()
})()
