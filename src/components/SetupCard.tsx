import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { loadSetupStatus, setSetupFlag, setupFlag, type SetupStatus } from '../lib/setupStatus'
import styles from './SetupCard.module.css'

// Anasayfa: kurulum bitmediyse ilerleme karti. Salon yepyeniyse (hic hizmet
// ve randevu yok) ilk acilista dogrudan sihirbaza goturur.
export default function SetupCard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const businessId = profile?.business_id ?? ''
  const hidden = businessId ? setupFlag(businessId, 'gizli') : true

  useEffect(() => {
    if (!profile || hidden) return
    let cancelled = false
    loadSetupStatus(profile.business_id, profile.id).then((s) => {
      if (cancelled) return
      if (s.fresh && !setupFlag(profile.business_id, 'goruldu')) {
        navigate('/kurulum', { replace: true })
        return
      }
      setStatus(s)
    })
    return () => {
      cancelled = true
    }
  }, [profile, hidden, navigate])

  // Kart yalnizca zorunlu bir adim eksikse gorunur; istege bagli adimlar
  // (ekip, link) sadece sihirbazda durur — kurulu salonlari rahatsiz etmez.
  const next = status?.steps.find((s) => !s.optional && !s.done)
  if (hidden || !status || !next) return null

  return (
    <div className={styles.card}>
      <button type="button" className={styles.main} onClick={() => navigate('/kurulum')}>
        <span className={styles.ring} style={{ ['--p' as string]: `${(status.doneCount / status.total) * 100}%` }}>
          <span>
            {status.doneCount}/{status.total}
          </span>
        </span>
        <span className={styles.text}>
          <span className={styles.title}>Kurulumu tamamla</span>
          <span className={styles.sub}>Sıradaki: {next.title}</span>
        </span>
        <span className={styles.arrow}>›</span>
      </button>
      <button
        type="button"
        className={styles.close}
        aria-label="Kurulum kartını gizle"
        onClick={() => {
          setSetupFlag(businessId, 'gizli')
          setStatus(null)
        }}
      >
        ×
      </button>
    </div>
  )
}
