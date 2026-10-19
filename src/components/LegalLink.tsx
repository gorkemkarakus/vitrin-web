import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { APP_LEGAL_PATH, legalSiteUrl, openExternal, type LegalDoc } from '../lib/legalLinks'

// Yasal metin linki: tanitim sitesi tanimliysa oraya, degilse uygulama icindeki
// yedek sayfaya gider (bkz. lib/legalLinks.ts).
export default function LegalLink({ doc, children }: { doc: LegalDoc; children: ReactNode }) {
  const url = legalSiteUrl(doc)
  if (!url) return <Link to={APP_LEGAL_PATH[doc]}>{children}</Link>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (Capacitor.isNativePlatform()) {
          e.preventDefault()
          openExternal(url)
        }
      }}
    >
      {children}
    </a>
  )
}
