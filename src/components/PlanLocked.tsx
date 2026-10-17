import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from './PageHeader'
import { LockIcon } from './icons'
import { useAuth } from '../contexts/AuthContext'
import {
  cheapestPlanWith,
  FEATURE_TITLES,
  fetchPlanDefinitions,
  type PlanDefinition,
  type PlanFeature,
} from '../lib/plan'
import styles from './PlanLocked.module.css'

const FEATURE_PITCH: Partial<Record<PlanFeature, string>> = {
  messages:
    'Müşterilerinizin WhatsApp ve Instagram konuşmalarını tek ekranda görür, gerektiğinde asistandan devralırsınız.',
  bulk_campaign: 'Kampanya izni veren müşterilerinize toplu mesaj gönderir, metni yapay zekâya yazdırırsınız.',
  ads: 'Meta reklamlarınızın harcamasını ve getirdiği müşteriyi uygulamadan takip edersiniz.',
  ai_insights: 'Randevu ve kasa verilerinizden işletmenize özel öneriler çıkarır.',
  staff: 'Ekibinize hesap açar; herkes kendi takvimini ve kazancını görür.',
  pdf_reports: 'Kasa ve performans raporlarını PDF olarak indirip paylaşırsınız.',
}

// Paketin kapsamadigi bir ekrana girilince sayfanin yerine gosterilir.
export default function PlanLocked({ feature, back = '/daha-fazla' }: { feature: PlanFeature; back?: string }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [plans, setPlans] = useState<PlanDefinition[]>([])
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    fetchPlanDefinitions()
      .then(setPlans)
      .catch(() => setPlans([]))
  }, [])

  const target = cheapestPlanWith(plans, feature)
  const title = FEATURE_TITLES[feature]

  return (
    <div className={styles.wrap}>
      <PageHeader back={back} title={title} />
      <div className={styles.card}>
        <span className={styles.icon} aria-hidden="true">
          <LockIcon width={26} height={26} />
        </span>
        <h2 className={styles.title}>{target ? `${title}, ${target.name} paketinde` : `${title} paketinizde yok`}</h2>
        {FEATURE_PITCH[feature] && <p className={styles.text}>{FEATURE_PITCH[feature]}</p>}
        {isAdmin ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate(`/planlar?neden=${encodeURIComponent(feature)}`)}
          >
            Paketleri gör
          </button>
        ) : (
          <p className={styles.hint}>Paketi işletme yöneticiniz yükseltebilir.</p>
        )}
      </div>
    </div>
  )
}
