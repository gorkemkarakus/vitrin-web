import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { CheckCircleIcon, RobotIcon, XCircleIcon } from '../components/icons'
import { useAuth } from '../contexts/AuthContext'
import {
  FEATURE_TITLES,
  fetchPlanDefinitions,
  hasAssistant,
  planRows,
  type MyPlan,
  type PlanDefinition,
  type PlanFeature,
} from '../lib/plan'
import { planBlockMessage } from '../lib/planBlock'
import styles from './PlansPage.module.css'

// Paketler. Sinirlar/ozellikler plan_definitions tablosundan gelir; fiyat
// burada yazmaz (magazadan okunacak — satin alma RevenueCat ile eklenecek).

function reasonText(reason: string): string {
  if (reason in FEATURE_TITLES) return `${FEATURE_TITLES[reason as PlanFeature]} mevcut paketinizde yok.`
  return planBlockMessage({ kind: 'limit', key: reason })
}

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100
  const tone = pct >= 100 ? styles.meterFull : pct >= 80 ? styles.meterNear : ''
  return (
    <div className={styles.meter}>
      <div className={styles.meterHead}>
        <span>{label}</span>
        <span className={styles.meterNum}>
          {used.toLocaleString('tr-TR')} / {limit.toLocaleString('tr-TR')}
        </span>
      </div>
      <div
        className={styles.meterTrack}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <span className={`${styles.meterFill} ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function UsageCard({ plan }: { plan: MyPlan }) {
  const l = plan.limits
  const meters = [
    { label: 'Bu ayki randevular', used: plan.usage.appointments_this_month, limit: l.appointments_per_month },
    { label: 'Müşteriler', used: plan.usage.customers, limit: l.max_customers },
    { label: 'Kullanıcılar', used: plan.usage.users, limit: l.max_users },
  ].filter((m): m is { label: string; used: number; limit: number } => typeof m.limit === 'number')

  if (meters.length === 0) return null
  return (
    <div className={styles.usage}>
      <span className={styles.usageTitle}>Kullanımınız</span>
      {meters.map((m) => (
        <UsageMeter key={m.label} {...m} />
      ))}
    </div>
  )
}

function PlanCard({ def, current }: { def: PlanDefinition; current: boolean }) {
  const assistant = hasAssistant(def)
  const botCap = def.limits.bot_messages_per_month
  return (
    <section
      className={`${styles.card} ${assistant ? styles.cardAssistant : ''} ${current ? styles.cardCurrent : ''}`}
      aria-labelledby={`plan-${def.id}`}
    >
      <header className={styles.cardHead}>
        <h2 id={`plan-${def.id}`} className={styles.cardName}>
          {def.name}
        </h2>
        {current && <span className={styles.currentPill}>Şu anki paketiniz</span>}
      </header>

      <div className={assistant ? styles.botIn : styles.botOut}>
        <RobotIcon width={22} height={22} />
        <span className={styles.botText}>
          <span className={styles.botTitle}>
            WhatsApp + Instagram asistanı <strong>{assistant ? 'DAHİL' : 'YOK'}</strong>
          </span>
          <span className={styles.botSub}>
            {assistant
              ? `Müşterilerinize 7/24 cevap verir, randevu alır${botCap ? ` · ayda ${botCap.toLocaleString('tr-TR')} mesaj` : ''}`
              : 'Bu pakette müşteri mesajlarına otomatik cevap verilmez'}
          </span>
        </span>
      </div>

      <ul className={styles.rows}>
        {planRows(def).map((row) => (
          <li key={row.label} className={row.included ? styles.rowIn : styles.rowOut}>
            {row.included ? (
              <CheckCircleIcon width={16} height={16} aria-label="Var" />
            ) : (
              <XCircleIcon width={16} height={16} aria-label="Yok" />
            )}
            <span>{row.label}</span>
          </li>
        ))}
      </ul>

      {!current && def.id !== 'free' && (
        <button type="button" className={`btn-secondary ${styles.buy}`} disabled>
          Satın alma çok yakında
        </button>
      )}
    </section>
  )
}

export default function PlansPage() {
  const { plan, refreshPlan } = useAuth()
  const [params] = useSearchParams()
  const reason = params.get('neden')
  const [defs, setDefs] = useState<PlanDefinition[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    void refreshPlan()
    fetchPlanDefinitions()
      .then(setDefs)
      .catch(() => setLoadError(true))
    // refreshPlan her render'da yeni; yalnizca acilista calissin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const expired = plan && plan.stored_plan !== plan.plan
  const storedName = defs?.find((d) => d.id === plan?.stored_plan)?.name

  return (
    <div className={styles.wrap}>
      <PageHeader back="/daha-fazla" title="Paketler" sub={plan ? `Şu an: ${plan.name}` : undefined} />

      {reason && <div className={styles.reason}>{reasonText(reason)}</div>}

      {expired && (
        <div className={styles.reason}>
          {storedName ?? 'Ücretli'} paketinizin süresi doldu; Ücretsiz paketle devam ediyorsunuz. Verileriniz silinmedi.
        </div>
      )}

      {plan && <UsageCard plan={plan} />}

      {loadError && <p className={styles.foot}>Paketler yüklenemedi. Bağlantınızı kontrol edip tekrar açın.</p>}
      {!defs && !loadError && <p className={styles.foot}>Yükleniyor…</p>}

      {defs?.map((def) => (
        <PlanCard key={def.id} def={def} current={plan?.plan === def.id} />
      ))}

      {defs && (
        <p className={styles.foot}>
          Ücretli paketler App Store / Google Play üzerinden alınır ve oradan iptal edilir. Paket değişince verileriniz
          silinmez.
        </p>
      )}
    </div>
  )
}
