import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { friendlyDbError } from '../../lib/dbErrors'
import { currency } from '../../lib/currency'
import { STATUS_LABEL } from '../../lib/appointmentStatus'
import { PAYMENT_METHOD_OPTIONS } from '../../lib/paymentMethods'
import { FIELD_LIMITS } from '../../lib/fieldLimits'
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABEL,
  fetchTimeline,
  isActivityKind,
  type ActivityKind,
  type TimelineItem,
} from '../../lib/customerCrm'
import styles from './Crm.module.css'

type Filter = 'hepsi' | 'notlar' | 'randevular' | 'odemeler' | 'mesajlar'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'hepsi', label: 'Tümü' },
  { value: 'notlar', label: 'Notlar' },
  { value: 'randevular', label: 'Randevular' },
  { value: 'odemeler', label: 'Ödemeler' },
  { value: 'mesajlar', label: 'Mesajlar' },
]

function matches(filter: Filter, item: TimelineItem) {
  switch (filter) {
    case 'notlar':
      return isActivityKind(item.kind)
    case 'randevular':
      return item.kind === 'randevu' || item.kind === 'paket'
    case 'odemeler':
      return item.kind === 'odeme' || item.kind === 'odeme_iptal'
    case 'mesajlar':
      return item.kind === 'whatsapp' || item.kind === 'bildirim' || item.kind === 'mesaj'
    default:
      return true
  }
}

const PLACEHOLDER: Record<ActivityKind, string> = {
  not: 'ör. Boya 7.1 + %6, 35 dk bekletildi. Amonyaksız tercih ediyor.',
  arama: 'ör. Aradım, gelecek hafta için randevu istiyor; Salı öğleden sonra dönülecek.',
  mesaj: 'ör. Instagram’dan yazdı, kampanyayı sordu.',
  ziyaret: 'ör. Uğradı, ürün sordu; ilgilendiği şampuanı not aldım.',
  sikayet: 'ör. Bekleme süresinden şikâyetçi oldu; bir sonraki randevuda %10 indirim sözü verildi.',
}

const METHOD_LABEL = new Map(PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]))

function monthKey(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Musterinin tum gecmisi tek listede + not/arama/sikayet kaydi ekleme.
export default function CustomerTimeline({ customerId }: { customerId: string }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [items, setItems] = useState<TimelineItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('hepsi')
  const [kind, setKind] = useState<ActivityKind>('not')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await fetchTimeline(customerId))
      setLoadError(null)
    } catch (e) {
      setLoadError(friendlyDbError(e, 'Geçmiş yüklenemedi.'))
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  async function addActivity(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.business_id || !body.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('customer_activities').insert({
      business_id: profile.business_id,
      customer_id: customerId,
      kind,
      body: body.trim(),
    })
    setSaving(false)
    if (err) {
      setError(friendlyDbError(err, 'Kaydedilemedi, lütfen tekrar deneyin.'))
      return
    }
    setBody('')
    void load()
  }

  async function removeActivity(id: string) {
    if (!window.confirm('Bu kayıt silinsin mi?')) return
    const { error: err } = await supabase.from('customer_activities').delete().eq('id', id)
    if (err) {
      setError(friendlyDbError(err, 'Silinemedi.'))
      return
    }
    void load()
  }

  const now = Date.now()
  const grouped = useMemo(() => {
    const list = (items ?? []).filter((i) => matches(filter, i))
    const groups: { month: string; items: TimelineItem[] }[] = []
    for (const item of list) {
      const m = monthKey(item.at)
      const last = groups[groups.length - 1]
      if (last && last.month === m) last.items.push(item)
      else groups.push({ month: m, items: [item] })
    }
    return groups
  }, [items, filter])

  function renderItem(item: TimelineItem, index: number) {
    const activity = isActivityKind(item.kind)
    const future = item.kind === 'randevu' && new Date(item.at).getTime() > now
    let title = item.title ?? ''
    let detail = item.detail
    let pill: { text: string; tone?: string } | null = null
    if (activity) title = ACTIVITY_LABEL[item.kind as ActivityKind]
    if (item.kind === 'randevu') {
      pill = future
        ? { text: 'Yaklaşan', tone: styles.pillSoon }
        : item.status
          ? {
              text: STATUS_LABEL[item.status] ?? item.status,
              tone: item.status === 'gelmedi' ? styles.pillWarn : undefined,
            }
          : null
    }
    if (item.kind === 'odeme' || item.kind === 'odeme_iptal') {
      title = `Ödeme · ${METHOD_LABEL.get(item.status ?? '') ?? 'Diğer'}`
      if (item.kind === 'odeme_iptal') pill = { text: 'Silindi' }
    }
    if (item.kind === 'paket') title = `${item.title} paketi`
    if (item.kind === 'izin' && item.detail) detail = null
    if (item.kind === 'sikayet') pill = { text: 'Şikâyet', tone: styles.pillWarn }

    const meta = [timeLabel(item.at), item.kind === 'randevu' ? item.detail : item.actor].filter(Boolean).join(' · ')
    if (item.kind === 'randevu') detail = null

    return (
      <div key={`${item.kind}-${item.ref_id ?? index}-${item.at}`} className={styles.item}>
        <span className={`${styles.dot} ${styles[`dot_${item.kind}`] ?? ''}`} aria-hidden="true" />
        <div className={styles.itemMain}>
          <span className={styles.itemTitle}>{title}</span>
          {detail && (
            <span
              className={
                item.kind === 'bildirim' ? `${styles.itemDetail} ${styles.itemDetailClamp}` : styles.itemDetail
              }
            >
              {detail}
            </span>
          )}
          <span className={styles.itemMeta}>{meta}</span>
        </div>
        <div className={styles.itemSide}>
          {item.amount !== null && (
            <span
              className={`${styles.amount} ${item.kind === 'odeme' ? styles.amountIn : ''} ${
                item.kind === 'odeme_iptal' ? styles.voided : ''
              }`}
            >
              {item.kind === 'odeme' ? '+' : ''}
              {currency.format(item.amount)}
            </span>
          )}
          {pill && <span className={`${styles.pill} ${pill.tone ?? ''}`}>{pill.text}</span>}
          {activity && isAdmin && item.ref_id && (
            <button type="button" className={styles.deleteBtn} onClick={() => removeActivity(item.ref_id!)}>
              Sil
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.timeline}>
      <form className={styles.composer} onSubmit={addActivity}>
        <div className={styles.kinds} role="radiogroup" aria-label="Kayıt türü">
          {ACTIVITY_KINDS.map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? styles.kindActive : styles.kind}
              onClick={() => setKind(k)}
            >
              {ACTIVITY_LABEL[k]}
            </button>
          ))}
        </div>
        <textarea
          className={styles.composerInput}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={FIELD_LIMITS.customerActivitiesBody}
          placeholder={PLACEHOLDER[kind]}
          aria-label={`${ACTIVITY_LABEL[kind]} yaz`}
        />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.composerFoot}>
          <span className={styles.composerHint}>Ekipteki herkes görür.</span>
          <button type="submit" className={styles.saveBtn} disabled={saving || !body.trim()}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>

      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.value}
            className={filter === f.value ? styles.kindActive : styles.kind}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError && <p className={styles.error}>{loadError}</p>}
      {!items && !loadError && <p className={styles.emptyHint}>Yükleniyor…</p>}
      {items && grouped.length === 0 && <p className={styles.emptyHint}>Bu filtrede kayıt yok.</p>}
      {grouped.map((g) => (
        <div key={g.month}>
          <div className={styles.month}>{g.month}</div>
          <div className={styles.items}>{g.items.map(renderItem)}</div>
        </div>
      ))}
    </div>
  )
}
