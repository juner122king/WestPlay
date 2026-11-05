;(() => {
  const post = (message) => window.chrome?.webview?.postMessage(message)
  let clicked = false
  const check = () => {
    if (document.cookie.includes('MUSIC_U')) {
      post({ signedIn: true })
      return
    }
    if (!clicked && location.hostname.includes('music.163.com')) {
      const loginBtn = document.querySelector('.link.s-fc3') || document.querySelector('a[data-action="login"]')
      if (loginBtn) {
        clicked = true
        loginBtn.click()
      }
    }
    setTimeout(check, 500)
  }
  check()
})()
