import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Uygulama Android 7'den (minSdk 24) itibaren kuruluyor; guncellenmemis
  // eski WebView'lerde de calissin diye kod daha eski bir hedefe derlenir.
  // Varsayilan hedefte (yeni tarayicilar) eski WebView kodu hic calistiramiyor,
  // uygulama acilis logosunda kaliyordu.
  build: { target: ['es2020', 'chrome87', 'safari14', 'edge88', 'firefox78'] },
  // Ayarlar'daki surum satiri package.json'dan gelir (tek kaynak).
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
})
