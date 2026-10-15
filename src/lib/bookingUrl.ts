import { Capacitor } from '@capacitor/core'

// Herkese acik site adresi (VITE_PUBLIC_SITE_URL). Tarayicida sayfanin kendi
// adresi kullanilabilir; telefon uygulamasinda ise origin "https://localhost"
// oldugu icin musteride calismaz — orada tanimli adres sart. Bilinmiyorsa null.
export function publicSiteBase(): string | null {
  const configured = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '')
  return configured || (Capacitor.isNativePlatform() ? null : window.location.origin)
}

// Musteriye gonderilen online randevu baglantisi (adres bilinmiyorsa null;
// ekran "adres ayarlanmadi" der).
export function bookingUrl(slug: string | null | undefined): string | null {
  if (!slug) return null
  const base = publicSiteBase()
  return base ? `${base}/randevu-al/${slug}` : null
}
