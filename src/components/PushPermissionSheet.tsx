import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BellIcon } from './icons'
import { enablePush, snoozePushPrompt } from '../lib/push'
import styles from './PushPermissionSheet.module.css'

// Sistem bildirim izninden ONCE gosterilen aciklama (Apple/Google'in
// "izni baglamiyla iste" onerisi). Yalnizca kullanici kabul ederse sistem
// penceresi acilir; reddederse 7 gun sorulmaz, Ayarlar'dan acilabilir.
export default function PushPermissionSheet({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false)

  async function enable() {
    setBusy(true)
    await enablePush()
    setBusy(false)
    onClose()
  }

  function later() {
    snoozePushPrompt()
    onClose()
  }

  return createPortal(
    <div className={styles.backdrop}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="pushSheetTitle">
        <span className={styles.icon} aria-hidden="true">
          <BellIcon width={24} height={24} />
        </span>
        <h2 id="pushSheetTitle" className={styles.title}>
          Randevu bildirimlerini açalım mı?
        </h2>
        <ul className={styles.list}>
          <li>Yeni, iptal edilen veya ertelenen randevuları anında görürsün.</li>
          <li>Online randevu ve WhatsApp asistanından gelen talepler kaçmaz.</li>
        </ul>
        <p className={styles.note}>
          Reklam veya tanıtım bildirimi göndermiyoruz. İstediğin zaman Ayarlar’dan kapatabilirsin.
        </p>
        <button type="button" className="btn-primary" onClick={enable} disabled={busy}>
          {busy ? 'Açılıyor…' : 'Bildirimleri aç'}
        </button>
        <button type="button" className={styles.later} onClick={later} disabled={busy}>
          Şimdi değil
        </button>
      </div>
    </div>,
    document.body,
  )
}
