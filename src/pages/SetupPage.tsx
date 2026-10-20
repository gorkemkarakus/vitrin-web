import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Share } from '@capacitor/share'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import { loadSetupStatus, markSetupStep, setSetupFlag, type SetupStatus, type SetupStep } from '../lib/setupStatus'
import styles from './SetupPage.module.css'

// Ilk kurulum sihirbazi: yeni salon icin sirali adimlar; her adim ilgili
// ekrana goturur, donuste durum veritabanindan yeniden okunur.
export default function SetupPage() {
  const navigate = useNavigate()
  const { profile, hasFeature } = useAuth()
  const canAddStaff = hasFeature('staff')
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [linkMsg, setLinkMsg] = useState<string | null>(null)
  const businessId = profile?.business_id ?? ''

  const refresh = useCallback(() => {
    if (!profile) return
    loadSetupStatus(profile.business_id, profile.id, { canAddStaff }).then(setStatus)
  }, [profile, canAddStaff])

  useEffect(() => {
    if (businessId) setSetupFlag(businessId, 'goruldu')
    refresh()
  }, [businessId, refresh])

  function skip(step: SetupStep, on = true) {
    markSetupStep(businessId, 'atlandi', step.id, on)
    refresh()
  }

  async function shareLink() {
    if (!status?.link) return
    const text = `Online randevu almak için: ${status.link}`
    try {
      await Share.share({ title: 'Online randevu', text, url: status.link })
    } catch {
      try {
        await navigator.clipboard.writeText(status.link)
        setLinkMsg('Link kopyalandı')
      } catch {
        window.alert(status.link)
      }
    }
    markSetupStep(businessId, 'yapildi', 'link')
    refresh()
  }

  function finish() {
    setSetupFlag(businessId, 'gizli')
    navigate('/dashboard', { replace: true })
  }

  if (!status) {
    return (
      <div className={styles.wrap}>
        <PageHeader back="/dashboard" title="Kurulum" />
        <p className={styles.hint}>Yükleniyor…</p>
      </div>
    )
  }

  const nextIndex = status.steps.findIndex((s) => !s.done && !s.skipped)
  const firstName = (profile?.full_name ?? '').split(' ')[0]

  return (
    <div className={styles.wrap}>
      <PageHeader back="/dashboard" title="Kurulum" />

      <section className={styles.hero}>
        <span className={styles.heroEyebrow}>{firstName ? `Hoş geldin ${firstName}` : 'Hoş geldin'}</span>
        <span className={styles.heroTitle}>{status.complete ? 'Salonun hazır' : 'Salonunu birlikte hazırlayalım'}</span>
        <span className={styles.heroSub}>
          {status.complete
            ? 'Tüm adımlar tamam. Randevular, kasa ve raporlar artık seninle.'
            : 'Birkaç dakika sürer. İstediğin adımda çıkabilirsin; kaldığın yer Anasayfa’da durur.'}
        </span>
        <div className={styles.progress} aria-label={`${status.doneCount} / ${status.total} adım tamam`}>
          {/* Cubuk soldan dolar: hangi adim bittiyse bitsin "kac adim tamam" okunur
              (eskiden biten adimin kendi yeri boyaniyordu, "3. adimdayim" gibi gorunuyordu). */}
          {status.steps.map((s, i) => (
            <span
              key={s.id}
              className={i < status.steps.filter((x) => x.done || x.skipped).length ? styles.progDone : styles.prog}
            />
          ))}
        </div>
        <span className={styles.heroCount}>
          {status.doneCount} / {status.total} adım tamam
        </span>
      </section>

      <ol className={styles.steps}>
        {status.steps.map((s, i) => {
          const isNext = i === nextIndex
          const state = s.done ? 'done' : s.skipped ? 'skipped' : isNext ? 'next' : 'todo'
          return (
            <li key={s.id} className={`${styles.step} ${isNext ? styles.stepNext : ''}`}>
              <span className={`${styles.num} ${styles[`num_${state}`]}`}>{s.done ? '✓' : i + 1}</span>
              <div className={styles.body}>
                <span className={styles.titleRow}>
                  <span className={styles.title}>{s.title}</span>
                  {s.optional && !s.done && <span className={styles.optional}>isteğe bağlı</span>}
                </span>
                {!s.done && <span className={styles.desc}>{s.desc}</span>}
                {s.done && <span className={styles.doneText}>Tamamlandı</span>}
                {s.skipped && !s.done && <span className={styles.desc}>Atlandı</span>}
                {!s.done && (
                  <div className={styles.actions}>
                    {!s.skipped && (
                      <button
                        type="button"
                        className={isNext ? styles.ctaPrimary : styles.cta}
                        onClick={() => (s.id === 'link' ? shareLink() : s.to && navigate(s.to))}
                      >
                        {s.cta}
                      </button>
                    )}
                    {s.optional && (
                      <button type="button" className={styles.skip} onClick={() => skip(s, !s.skipped)}>
                        {s.skipped ? 'Geri al' : 'Atla'}
                      </button>
                    )}
                  </div>
                )}
                {s.id === 'link' && linkMsg && <span className={styles.doneText}>{linkMsg}</span>}
              </div>
            </li>
          )
        })}
      </ol>

      <div className={styles.footer}>
        <button type="button" className={status.complete ? styles.footerPrimary : styles.footerQuiet} onClick={finish}>
          {status.complete ? 'Anasayfaya git' : 'Şimdilik geç'}
        </button>
      </div>
    </div>
  )
}
