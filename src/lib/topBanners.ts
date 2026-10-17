// Ust uyari seritleri (cevrimdisi, saat dilimi) index.html'deki tek bir
// sabit kapta (#top-banners) ust uste dizilir. Kabin yuksekligi --banner-h
// degiskenine yazilir; sayfalar ust boslukta --top-inset kullandigi icin
// serit cikinca icerik asagi kayar, basligin ustune binmez.
export function topBannerHost(): HTMLElement {
  let el = document.getElementById('top-banners')
  if (!el) {
    el = document.createElement('div')
    el.id = 'top-banners'
    document.body.prepend(el)
  }
  return el
}

let installed = false

export function installTopBannerInset() {
  if (installed || typeof ResizeObserver === 'undefined') return
  installed = true
  const host = topBannerHost()
  const root = document.documentElement
  const update = () => root.style.setProperty('--banner-h', `${host.offsetHeight}px`)
  update()
  new ResizeObserver(update).observe(host)
}
