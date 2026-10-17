import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { LockIcon } from './icons'
import { onPlanBlock, planBlockMessage, type PlanBlock } from '../lib/planBlock'
import { useAuth } from '../contexts/AuthContext'
import { FEATURE_TITLES, type PlanFeature } from '../lib/plan'
import styles from './PushPermissionSheet.module.css'

function sheetTitle(block: PlanBlock) {
  if (block.kind === 'feature' && block.feature && block.feature in FEATURE_TITLES)
    return `${FEATURE_TITLES[block.feature as PlanFeature]} paketinizde yok.`
  return planBlockMessage(block)
}

// Paket siniri ya da paket disi ozellik hangi ekranda yasanirsa yasansin
// (randevu ekleme, musteri ekleme, calisani aktif etme, AI...) bu pencere
// acilir: neyin dolu oldugu + "Paketleri gor".
export default function PlanLimitSheet() {
  const navigate = useNavigate()
  const { profile, refreshPlan } = useAuth()
  const [block, setBlock] = useState<PlanBlock | null>(null)
  const isAdmin = profile?.role === 'admin'

  useEffect(() => onPlanBlock((b) => setBlock((current) => current ?? b)), [])

  if (!block) return null

  function close() {
    setBlock(null)
    // Kullanim sayilari (ör. bu ayki randevu) ekranda guncel kalsin.
    void refreshPlan()
  }

  function openPlans() {
    const reason = block?.kind === 'limit' ? block.key : (block?.feature ?? '')
    setBlock(null)
    navigate(`/planlar${reason ? `?neden=${encodeURIComponent(reason)}` : ''}`)
  }

  return createPortal(
    <div className={styles.backdrop} onClick={close}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="planSheetTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.icon} aria-hidden="true">
          <LockIcon width={24} height={24} />
        </span>
        <h2 id="planSheetTitle" className={styles.title}>
          {sheetTitle(block)}
        </h2>
        <p className={styles.note}>
          {isAdmin
            ? 'Daha geniş bir pakete geçerek hemen devam edebilirsiniz. Mevcut verileriniz olduğu gibi kalır.'
            : 'Paketi işletme yöneticiniz yükseltebilir. Mevcut veriler olduğu gibi kalır.'}
        </p>
        {isAdmin && (
          <button type="button" className="btn-primary" onClick={openPlans}>
            Paketleri gör
          </button>
        )}
        <button type="button" className={styles.later} onClick={close}>
          Kapat
        </button>
      </div>
    </div>,
    document.body,
  )
}
