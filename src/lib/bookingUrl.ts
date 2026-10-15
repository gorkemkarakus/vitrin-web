import { Capacitor } from '@capacitor/core'

// Musteriye gonderilen online randevu bagliantisi. Tarayicida sayfanin kendi
// adresi kullanilabilir; telefon uygulamasinda ise origin "https://localhost"
// oldugu icin musteride calismaz — orada VITE_PUBLIC_SITE_URL sart.
// Adres bilinmiyorsa null doner (ekran "adres ayarlanmadi" der).
export function bookingUrl(slug: string | null | undefined): string | null {
  if (!slug) return null
  const configured = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '')
  const base = configured || (Capacitor.isNativePlatform() ? null : window.location.origin)
  return base ? `${base}/randevu-al/${slug}` : null
}
