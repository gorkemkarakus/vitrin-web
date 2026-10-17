import { useState } from 'react'
import { isIstanbulOffset } from '../lib/date'
import styles from './OfflineBanner.module.css'

// Uygulama saatleri cihazin yerel saatiyle gosterir; sunucu (hatirlatma,
// online randevu, chatbot) Europe/Istanbul kullanir. Turkiye sabit UTC+3
// oldugu icin cihaz baska saat dilimindeyse randevu saatleri kayar —
// kullanici en azindan uyarilir (bkz. RELEASE_AUDIT.md bilinen riskler).
export default function TimezoneBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || isIstanbulOffset()) return null
  return (
    <div className={`${styles.banner} ${styles.warn}`} role="status">
      Telefonunun saat dilimi Türkiye değil; randevu saatleri farklı görünebilir. Ayarlar’dan saat dilimini İstanbul
      yap.{' '}
      <button type="button" className={styles.dismiss} onClick={() => setDismissed(true)}>
        Kapat
      </button>
    </div>
  )
}
