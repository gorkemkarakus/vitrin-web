import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fontlar paketle gelir (calisma aninda Google Fonts'a istek gitmez).
import '@fontsource-variable/outfit'
import '@fontsource-variable/dm-sans/opsz.css'
import './styles/theme.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
