import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ayarlar'daki surum satiri package.json'dan gelir (tek kaynak).
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
})
