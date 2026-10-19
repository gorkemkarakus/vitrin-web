import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { LEGAL_INFO, PLACEHOLDER_RE } from '../legal/legalInfo'

// Yasal metinlerin TEK kaynagi tanitim sitesidir (Meta ve magazalar oraya
// bakar). Site adresi legalInfo.ts'de tanimliysa linkler siteyi acar; henuz
// tanimli degilse uygulamanin icindeki yedek sayfalar acilir.
export type LegalDoc = 'gizlilik' | 'kvkk' | 'kosullar'

const SITE_PATH: Record<LegalDoc, string> = {
  gizlilik: '/gizlilik',
  // Sitedeki gizlilik politikasi KVKK aydinlatma metnini de kapsar.
  kvkk: '/gizlilik',
  kosullar: '/kullanim-sozlesmesi',
}

export const APP_LEGAL_PATH: Record<LegalDoc, string> = {
  gizlilik: '/gizlilik',
  kvkk: '/kvkk',
  kosullar: '/kullanim-kosullari',
}

export function legalSiteUrl(doc: LegalDoc): string | null {
  const base = LEGAL_INFO.webBaseUrl
  return PLACEHOLDER_RE.test(base) ? null : `${base.replace(/\/+$/, '')}${SITE_PATH[doc]}`
}

export function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) void Browser.open({ url })
  else window.open(url, '_blank', 'noopener,noreferrer')
}

// Ayarlar gibi satir tiklamalari icin: site varsa disarida, yoksa uygulamada acar.
export function openLegal(doc: LegalDoc, navigate: (to: string) => void) {
  const url = legalSiteUrl(doc)
  if (url) openExternal(url)
  else navigate(APP_LEGAL_PATH[doc])
}
