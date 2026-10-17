import { Capacitor } from '@capacitor/core'
import { supabase } from './supabase'

// Uretimde yakalanan hatalari kendi veritabanimiza (report_client_error)
// KISISEL VERI OLMADAN gonderir. Ucuncu taraf hata servisi yok.

const MAX_PER_SESSION = 10
const sent = new Set<string>()

// E-posta, telefon/uzun sayi dizileri ve UUID'ler maskelenir; adres
// cubugundaki sorgu parametreleri (ör. ?musteri=...) hic gonderilmez.
export function scrub(text: string): string {
  return text
    .replace(/[^\s@"'<>()]+@[^\s@"'<>()]+\.[a-z]{2,}/gi, '[e-posta]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[sayı]')
}

function currentRoute(): string {
  return scrub(window.location.pathname)
}

export function reportError(error: unknown) {
  if (!import.meta.env.PROD) return
  const err = error instanceof Error ? error : new Error(String(error))
  const message = scrub(`${err.name}: ${err.message}`).slice(0, 500)
  if (sent.has(message) || sent.size >= MAX_PER_SESSION) return
  sent.add(message)
  // Oturum yoksa RPC sessizce hicbir sey yapmaz; hata asla firlatilmaz.
  supabase
    .rpc('report_client_error', {
      p_message: message,
      p_stack: err.stack ? scrub(err.stack).slice(0, 4000) : null,
      p_route: currentRoute(),
      p_app_version: import.meta.env.VITE_APP_VERSION ?? null,
      p_platform: Capacitor.getPlatform(),
    })
    .then(
      () => {},
      () => {},
    )
}

let installed = false

export function installGlobalErrorHandlers() {
  if (installed) return
  installed = true
  window.addEventListener('error', (e) => reportError(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}
