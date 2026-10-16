import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'
import { callEdgeFunction } from '../lib/edgeFunctions'
import { NETWORK_ERROR } from '../lib/messages'
import PageHeader from '../components/PageHeader'
import { currencyWhole as currency } from '../lib/currency'
import { SOURCE_LABEL } from '../lib/sourceLabels'
import styles from './AdInsightsPage.module.css'

type ConnectionStatus = 'pending' | 'connected' | 'error'

interface Connection {
  status: ConnectionStatus
  ad_account_name: string | null
  last_synced_at: string | null
  last_error: string | null
}

interface Insights {
  spend: number
  impressions: number
  clicks: number
  conversions: number
  roas: number | null
}

interface SourceAppt {
  id: string
  source: string
  status: string
}

type RangeDays = 7 | 30

const number = new Intl.NumberFormat('tr-TR')

// Sira gercek bir surec (once giris, sonra hesap secimi, sonra veri).
const CONNECT_STEPS = [
  { title: 'Meta’ya giriş yaparsın', sub: 'Facebook hesabınla, 1 dakika sürer' },
  { title: 'Reklam hesabını seçersin', sub: 'Birden fazlaysa salonunkini işaretle' },
  { title: 'Rakamlar burada görünür', sub: 'Harcama, tıklama ve randevu sayıları her gün güncellenir' },
]

const AD_SOURCES = ['reklam_instagram', 'reklam_whatsapp']

export default function AdInsightsPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [connection, setConnection] = useState<Connection | null>(null)
  const [loading, setLoading] = useState(true)
  const [rangeDays, setRangeDays] = useState<RangeDays>(7)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  // Uygulamaya kaydedilen randevularin kaynaklari (Meta'dan bagimsiz).
  const [sourceAppts, setSourceAppts] = useState<SourceAppt[]>([])
  const [showSources, setShowSources] = useState(false)

  async function loadConnection() {
    setLoading(true)
    const { data } = await supabase
      .from('business_ad_connections')
      .select('status, ad_account_name, last_synced_at, last_error')
      .maybeSingle()
    setConnection(data)
    setLoading(false)
  }

  useEffect(() => {
    loadConnection()
  }, [])

  useEffect(() => {
    let cancelled = false
    const since = new Date(Date.now() - (rangeDays - 1) * 86400000)
    since.setHours(0, 0, 0, 0)
    // fetchAll: tek istekte en fazla 1000 satir doner, yogun bir ayda kesilmesin.
    fetchAll(() =>
      supabase.from('appointments').select('id, source, status').gte('created_at', since.toISOString()).order('id'),
    ).then(({ data }) => {
      if (!cancelled) setSourceAppts(data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [rangeDays])

  useEffect(() => {
    if (connection?.status !== 'connected' || !session) return
    let cancelled = false
    async function loadInsights() {
      setInsightsLoading(true)
      setError(null)
      try {
        const res = await callEdgeFunction<Insights>('get-ad-insights', { range_days: rangeDays })
        if (cancelled) return
        if (!res.ok) {
          setError(res.error ?? 'Veriler alınamadı.')
          return
        }
        setInsights(res.data)
      } catch {
        if (!cancelled) setError(NETWORK_ERROR)
      } finally {
        if (!cancelled) setInsightsLoading(false)
      }
    }
    loadInsights()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.status, rangeDays, session?.access_token])

  async function handleDisconnect() {
    const ok = window.confirm('Facebook reklam hesabı bağlantısını kaldırmak istediğinize emin misiniz?')
    if (!ok || !session) return
    setError(null)
    setDisconnecting(true)
    try {
      const res = await callEdgeFunction('disconnect-ad-account')
      if (!res.ok) {
        setError(res.error ?? 'Bağlantı kaldırılamadı.')
        return
      }
      setConnection(null)
      setInsights(null)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setDisconnecting(false)
    }
  }

  const sources = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of sourceAppts) {
      if (a.status === 'iptal') continue
      counts.set(a.source, (counts.get(a.source) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [sourceAppts])
  const adByChannel = AD_SOURCES.map((src) => ({ src, count: sources.find(([s]) => s === src)?.[1] ?? 0 }))
  const adAppts = adByChannel.reduce((s, c) => s + c.count, 0)

  const isConnected = connection?.status === 'connected'

  if (loading) return <p className={styles.note}>Yükleniyor…</p>

  const sourceMax = Math.max(1, ...sources.map(([, n]) => n))
  const sourcesCard = (
    <div className={styles.card}>
      <span className={styles.cardTitle}>Son {rangeDays} günde randevular nereden geldi?</span>
      {sources.length === 0 ? (
        <span className={styles.cardSub}>Bu dönemde kaydedilen randevu yok.</span>
      ) : (
        sources.map(([src, n]) => (
          <div className={styles.barRow} key={src}>
            <span className={styles.barLabel}>{SOURCE_LABEL[src] ?? src}</span>
            <span className={styles.barTrack}>
              <span className={styles.barFill} style={{ width: `${(n / sourceMax) * 100}%` }} />
            </span>
            <span className={styles.barValue}>{n}</span>
          </div>
        ))
      )}
    </div>
  )

  if (!isConnected) {
    return (
      <div className={styles.wrap}>
        <PageHeader back="/daha-fazla" title="Reklam performansı" />

        <div className={styles.hero}>
          <span className={styles.heroTitle}>Reklamın kaç randevu getirdiğini gör.</span>
          <span className={styles.heroText}>
            Instagram ve Facebook reklam hesabını bağla; harcadığın parayı salona gelen müşterilerle eşleştirelim.
          </span>
          <button type="button" className={styles.heroBtn} onClick={() => navigate('/reklam-callback')}>
            Meta hesabını bağla
          </button>
          <span className={styles.heroNote}>Sadece okuma izni istenir. Reklamlarına dokunmayız.</span>
        </div>

        {connection?.status === 'error' && connection.last_error && (
          <p className={styles.errorText}>Son deneme başarısız: {connection.last_error}</p>
        )}

        <div className={styles.card}>
          <span className={styles.cardTitleSm}>Bağlayınca neler olacak?</span>
          {CONNECT_STEPS.map((step, i) => (
            <div className={styles.stepRow} key={step.title}>
              <span className={styles.stepNum}>{i + 1}</span>
              <span className={styles.stepText}>
                <span className={styles.stepTitle}>{step.title}</span>
                <span className={styles.stepSub}>{step.sub}</span>
              </span>
            </div>
          ))}
        </div>

        <div className={styles.noAdCard}>
          <span className={styles.stepText}>
            <span className={styles.stepTitle}>Reklam vermiyorum</span>
            <span className={styles.stepSub}>Randevu kaynağını elle seçmeye devam edebilirsin</span>
          </span>
          <button type="button" className={styles.linkBtn} onClick={() => setShowSources((v) => !v)}>
            {showSources ? 'Gizle' : 'Kaynakları gör ›'}
          </button>
        </div>
        {showSources && sourcesCard}
      </div>
    )
  }

  const ctr = insights && insights.impressions > 0 ? (insights.clicks / insights.impressions) * 100 : null
  const cpc = insights && insights.clicks > 0 ? insights.spend / insights.clicks : null
  const cpa = insights && insights.conversions > 0 ? insights.spend / insights.conversions : null
  const perAppt = insights && adAppts > 0 ? insights.spend / adAppts : null
  // Harcama varken reklam kaynakli hic randevu yoksa uyar.
  const verdict =
    !insights || insights.spend === 0
      ? null
      : adAppts === 0
        ? { label: 'Randevu getirmedi', tone: 'warn' as const }
        : { label: `${adAppts} randevu getirdi`, tone: 'ok' as const }

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Reklamlar"
        action={
          <div className={styles.miniSeg}>
            <button
              type="button"
              className={rangeDays === 7 ? styles.miniSegActive : styles.miniSegBtn}
              onClick={() => setRangeDays(7)}
            >
              7 gün
            </button>
            <button
              type="button"
              className={rangeDays === 30 ? styles.miniSegActive : styles.miniSegBtn}
              onClick={() => setRangeDays(30)}
            >
              30 gün
            </button>
          </div>
        }
      />

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.card}>
        <div className={styles.adTop}>
          <span className={styles.adThumb}>Meta</span>
          <span className={styles.adText}>
            <span className={styles.adName}>{connection.ad_account_name ?? 'Reklam hesabı'}</span>
            <span className={styles.cardSub}>
              {connection.last_synced_at
                ? `Güncellendi ${new Date(connection.last_synced_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : 'Henüz veri çekilmedi'}
            </span>
            {verdict && <span className={verdict.tone === 'ok' ? styles.pillOk : styles.pillWarn}>{verdict.label}</span>}
          </span>
        </div>
        {insightsLoading ? (
          <span className={styles.cardSub}>Yükleniyor…</span>
        ) : (
          insights && (
            <div className={styles.statGrid}>
              <span className={styles.stat}>
                <span className={styles.statValue}>{currency.format(insights.spend)}</span>
                <span className={styles.statLabel}>harcama</span>
              </span>
              <span className={styles.stat}>
                <span className={styles.statValue}>{number.format(insights.clicks)}</span>
                <span className={styles.statLabel}>tıklama</span>
              </span>
              <span className={styles.stat}>
                <span className={styles.statValue}>{adAppts}</span>
                <span className={styles.statLabel}>randevu</span>
              </span>
              <span className={styles.stat}>
                <span className={perAppt !== null ? styles.statValueOk : styles.statValue}>
                  {perAppt !== null ? currency.format(perAppt) : '—'}
                </span>
                <span className={styles.statLabel}>randevu başı</span>
              </span>
            </div>
          )
        )}
      </div>

      <div className={styles.listCard}>
        {adByChannel.map((c) => (
          <div className={styles.kvRow} key={c.src}>
            <span className={styles.kvLabel}>{SOURCE_LABEL[c.src] ?? c.src}</span>
            <span className={styles.kvValue}>{c.count} randevu</span>
          </div>
        ))}
      </div>

      {insights && (
        <div className={styles.totals}>
          <span className={styles.totalItem}>
            <span className={styles.totalValue}>{number.format(insights.impressions)}</span>
            <span className={styles.totalLabel}>kez göründü</span>
          </span>
          <span className={styles.totalItem}>
            <span className={styles.totalValue}>{ctr !== null ? `%${ctr.toFixed(1)}` : '—'}</span>
            <span className={styles.totalLabel}>tıklanma oranı</span>
          </span>
          <span className={styles.totalItem}>
            <span className={styles.totalValue}>{insights.roas !== null ? `${insights.roas.toFixed(2)}x` : '—'}</span>
            <span className={styles.totalLabel}>getiri (ROAS)</span>
          </span>
        </div>
      )}

      {insights && (
        <div className={styles.listCard}>
          <div className={styles.kvRow}>
            <span className={styles.kvLabel}>Tıklama başına maliyet</span>
            <span className={styles.kvValue}>{cpc !== null ? currency.format(cpc) : '—'}</span>
          </div>
          <div className={styles.kvRow}>
            <span className={styles.kvLabel}>Meta’daki dönüşüm başına</span>
            <span className={styles.kvValue}>{cpa !== null ? currency.format(cpa) : '—'}</span>
          </div>
        </div>
      )}

      <span className={styles.note}>
        Reklamları Meta’dan yönetirsin; burada sadece salonuna ne getirdiklerini görürsün. Randevu sayıları, kaynağı
        “Instagram/WhatsApp reklamı” seçilen randevulardan gelir.
      </span>

      <button type="button" className={styles.disconnectBtn} onClick={handleDisconnect} disabled={disconnecting}>
        {disconnecting ? 'Kaldırılıyor…' : 'Hesap bağlantısını kaldır'}
      </button>
    </div>
  )
}
