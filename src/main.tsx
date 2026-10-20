import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fontlar paketle gelir (calisma aninda Google Fonts'a istek gitmez).
import '@fontsource-variable/outfit'
import '@fontsource-variable/dm-sans/opsz.css'
import './styles/theme.css'
import App from './App.tsx'
import { installGlobalErrorHandlers } from './lib/errorReporting'
import { installTopBannerInset } from './lib/topBanners'

// crypto.randomUUID eski WebView'lerde (Chrome 92 oncesi) yok; ayni bicimde uretir.
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  ;(crypto as { randomUUID: () => string }).randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  }
}

installGlobalErrorHandlers()
installTopBannerInset()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
