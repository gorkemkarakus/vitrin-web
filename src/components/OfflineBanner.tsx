import { useEffect, useState } from 'react'
import styles from './OfflineBanner.module.css'

// Baglanti kopunca ustte ince bir serit: kullanici kaydetmeye calisip
// anlamsiz bir hata almadan once neden calismadigini gorur.
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (online) return null
  return (
    <div className={styles.banner} role="status" aria-live="polite">
      İnternet bağlantısı yok. Bağlantı gelene kadar değişiklikler kaydedilemez.
    </div>
  )
}
