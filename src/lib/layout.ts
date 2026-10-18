import { useSyncExternalStore } from 'react'

// Ekran boyutu katmanlari — platforma (telefon uygulamasi / tarayici) gore
// DEGIL genislige gore. Ayni kod hem uygulamada hem web'de calisir; tablet
// yatay tutulunca masaustu gibi davranir.
//
//   compact  < 768px      telefon: tek kolon, alt sekme cubugu
//   medium   768–1023px   dik tablet: telefon duzeni, daha genis
//   wide     >= 1024px    yatay tablet / bilgisayar: yan menu, zengin ekranlar
//
// Ekranlarin uc seviyesi (yalnizca genis ekran olanlar components/WideOnly.tsx
// ile sarilir, menu listesi lib/navigation.ts):
//   - her yerde ayni (randevu, musteri, mesaj, kasa)
//   - genis ekranda zengin, dar ekranda sade (raporlar, takvim, huni)
//   - yalnizca genis ekran (otomasyon, toplu ice/disa aktarma, yetki matrisi…)
//
// CSS'teki @media (min-width: 1024px) kurallari WIDE_MIN ile ayni olmali.
export const MEDIUM_MIN = 768
export const WIDE_MIN = 1024

export type LayoutSize = 'compact' | 'medium' | 'wide'

const wideQuery = `(min-width: ${WIDE_MIN}px)`
const mediumQuery = `(min-width: ${MEDIUM_MIN}px)`

function readSize(): LayoutSize {
  if (typeof window === 'undefined' || !window.matchMedia) return 'compact'
  if (window.matchMedia(wideQuery).matches) return 'wide'
  if (window.matchMedia(mediumQuery).matches) return 'medium'
  return 'compact'
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const queries = [window.matchMedia(wideQuery), window.matchMedia(mediumQuery)]
  queries.forEach((q) => q.addEventListener('change', onChange))
  return () => queries.forEach((q) => q.removeEventListener('change', onChange))
}

export function useLayout() {
  const size = useSyncExternalStore(subscribe, readSize, () => 'compact' as LayoutSize)
  return { size, isWide: size === 'wide', isCompact: size === 'compact' }
}
