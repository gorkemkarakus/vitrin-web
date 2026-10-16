import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { callEdgeFunction } from '../lib/edgeFunctions'
import { NETWORK_ERROR } from '../lib/messages'
import { fetchAll } from '../lib/fetchAll'
import { CheckCircleIcon, SendIcon } from '../components/icons'
import PageHeader from '../components/PageHeader'
import { computeCustomerDebts } from '../lib/customerDebts'
import { SOURCE_LABEL } from '../lib/sourceLabels'
import DonutChart from '../components/DonutChart'
import LineChart from '../components/LineChart'
import { currencyWhole as currency } from '../lib/currency'
import { toLocalDateString, firstOfMonth, DAY_LONG } from '../lib/date'
import { segmentForStats } from '../lib/customerSegments'
import styles from './AiInsightsPage.module.css'

interface Insight {
  generated_at: string
  summary: string
  highlights: string[]
  risks: string[]
  recommendations: string[]
}

interface Appointment {
  id: string
  customer_id: string | null
  service_id: string | null
  package_id: string | null
  price_override: number | null
  source: string
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
  scheduled_at: string
}
interface Payment {
  customer_id: string
  amount: number
  paid_at: string
  voided_at: string | null
  appointment_id: string | null
  package_id: string | null
}
interface Customer {
  id: string
  full_name: string
  created_at: string
}
interface ServiceLite {
  id: string
  name: string
  price: number | null
}
interface PackageLite {
  id: string
  customer_id: string
  service_id: string | null
  total_sessions: number
  session_offset: number
}
interface Expense {
  amount: number
  expense_date: string
  is_paid: boolean
}

// generate-ai-insights edge function'ındaki COOLDOWN_MS ile AYNI — bir
// dönemin analizi bu kadar taze ise otomatik yeniden üretmeyi atlıyoruz
// (sunucu zaten 429 dönecekti, gereksiz istek/hata göstermemek için).
const COOLDOWN_MS = 10 * 60 * 1000

// ---------- Tarih aralığı ----------

type Preset = 'bu_ay' | 'son_3_ay' | 'son_yil' | 'tum_zamanlar' | 'ozel'

function presetRange(preset: Preset): { start: string; end: string } {
  const today = new Date()
  switch (preset) {
    case 'son_3_ay': {
      const start = new Date(today)
      start.setMonth(start.getMonth() - 3)
      return { start: toLocalDateString(start), end: toLocalDateString(today) }
    }
    case 'son_yil': {
      const start = new Date(today)
      start.setFullYear(start.getFullYear() - 1)
      return { start: toLocalDateString(start), end: toLocalDateString(today) }
    }
    case 'tum_zamanlar':
      return { start: toLocalDateString(new Date(2000, 0, 1)), end: toLocalDateString(today) }
    case 'bu_ay':
    default:
      return { start: toLocalDateString(firstOfMonth(today)), end: toLocalDateString(today) }
  }
}

const PRESETS: { value: Preset; label: string; long: string }[] = [
  { value: 'bu_ay', label: 'Bu ay', long: 'Bu ay' },
  { value: 'son_3_ay', label: '3 ay', long: 'Son 3 ay' },
  { value: 'son_yil', label: '1 yıl', long: 'Son 1 yıl' },
  { value: 'tum_zamanlar', label: 'Tümü', long: 'Tüm zamanlar' },
]

const PERIOD_PHRASE: Partial<Record<Preset, string>> = {
  bu_ay: 'Bu ay',
  son_3_ay: 'Son 3 ayda',
  son_yil: 'Son 1 yılda',
  tum_zamanlar: 'Bugüne kadar',
}

// Sohbette sorulabilen hazir sorular. Cevaplar kayitlardan yerel olarak
// hesaplanir; yeni bir yapay zeka cagrisi YAPMAZ. 'iyi' / 'risk' / 'oneri'
// mevcut yazili analizin (generate-ai-insights) ilgili bolumunu acar.
type AskKey = 'hizmet' | 'gun' | 'borc' | 'reklam' | 'kar' | 'musteri' | 'iyi' | 'risk' | 'oneri' | 'bilinmiyor'

const ASK_ORDER: Exclude<AskKey, 'bilinmiyor'>[] = ['hizmet', 'gun', 'borc', 'reklam', 'kar', 'musteri', 'iyi', 'risk', 'oneri']

const ASK_TEXT: Record<AskKey, string> = {
  hizmet: 'En çok hangi hizmetten kazandım?',
  gun: 'En çok hangi gün boş kalıyorum?',
  borc: 'Kimler borçlu?',
  reklam: 'Reklam işe yarıyor mu?',
  kar: 'Kârım nasıl gidiyor?',
  musteri: 'Müşterilerim nasıl?',
  iyi: 'Neler iyi gidiyor?',
  risk: 'Nerede risk var?',
  oneri: 'Ne yapmalıyım?',
  bilinmiyor: '',
}

// Serbest yazilan soruyu anahtar kelimeyle hazir sorulardan birine esler.
function matchQuestion(text: string): AskKey {
  const t = text.toLocaleLowerCase('tr')
  if (/borç|borcl|alacak|ödemedi/.test(t)) return 'borc'
  if (/reklam|instagram|kaynak|nereden/.test(t)) return 'reklam'
  if (/hizmet|işlem/.test(t)) return 'hizmet'
  if (/gün|boş|yoğun|dolu/.test(t)) return 'gun'
  if (/müşteri|iptal|gelme/.test(t)) return 'musteri'
  if (/kâr|kar\b|gelir|kazanç|ciro|tahsilat|gider/.test(t)) return 'kar'
  if (/risk|sorun|kötü/.test(t)) return 'risk'
  if (/ne yap|öneri|tavsiye|nasıl artır/.test(t)) return 'oneri'
  if (/iyi gid|güzel/.test(t)) return 'iyi'
  return 'bilinmiyor'
}

const PERIOD_LABEL_FOR_AI: Partial<Record<Preset, string>> = {
  bu_ay: 'Bu Ay',
  son_3_ay: 'Son 3 Ay',
  son_yil: 'Son Yıl',
  tum_zamanlar: 'Tüm Zamanlar',
}

function daysBetween(start: string, end: string) {
  return Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000) + 1
}

function inRange(dateStr: string, start: string, end: string) {
  const d = dateStr.slice(0, 10)
  return d >= start && d <= end
}

function prevPeriodBounds(start: string, end: string): { start: string; end: string } {
  const s = new Date(`${start}T00:00:00`)
  const lengthMs = new Date(`${end}T00:00:00`).getTime() - s.getTime()
  const prevEnd = new Date(s.getTime() - 86400000)
  const prevStart = new Date(prevEnd.getTime() - lengthMs)
  return { start: toLocalDateString(prevStart), end: toLocalDateString(prevEnd) }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

export default function AiInsightsPage() {
  const { session } = useAuth()
  const [insight, setInsight] = useState<Insight | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const [thread, setThread] = useState<{ id: number; key: AskKey; text: string }[]>([])
  const [draft, setDraft] = useState('')
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false)
  const [services, setServices] = useState<ServiceLite[]>([])
  const [packages, setPackages] = useState<PackageLite[]>([])

  const [preset, setPreset] = useState<Preset>('bu_ay')
  const [rangeStart, setRangeStart] = useState(() => presetRange('bu_ay').start)
  const [rangeEnd, setRangeEnd] = useState(() => presetRange('bu_ay').end)

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [taxPct, setTaxPct] = useState(0)
  const [commissionPct, setCommissionPct] = useState(0)
  const [dataLoading, setDataLoading] = useState(true)

  function applyPreset(p: Preset) {
    setPreset(p)
    const { start, end } = presetRange(p)
    setRangeStart(start)
    setRangeEnd(end)
  }

  async function loadInsightForPeriod(periodKey: string): Promise<Insight | null> {
    const { data } = await supabase
      .from('business_ai_insights')
      .select('generated_at, summary, highlights, risks, recommendations')
      .eq('period_key', periodKey)
      .maybeSingle()
    return data
  }

  // Grafik/KPI verisi AI analizinden BAĞIMSIZ, ücretsiz ve canlı — tarih
  // aralığı değiştikçe yeniden hesaplanır ama OpenAI çağrısı YAPMAZ. Tüm-zaman
  // veri tek seferde çekilip pencereleme client-side yapılıyor (AccountingPage
  // ile aynı desen).
  useEffect(() => {
    async function loadLiveData() {
      setDataLoading(true)
      const [{ data: appts }, { data: pays }, { data: custs }, { data: exps }, { data: settings }, { data: svcs }, { data: pkgs }] = await Promise.all([
        fetchAll(() =>
          supabase
            .from('appointments')
            .select('id, customer_id, service_id, package_id, price_override, source, status, scheduled_at')
            .order('id'),
        ),
        fetchAll(() => supabase.from('payments').select('customer_id, amount, paid_at, voided_at, appointment_id, package_id').order('id')),
        fetchAll(() => supabase.from('customers').select('id, full_name, created_at').order('id')),
        fetchAll(() => supabase.from('business_expenses').select('amount, expense_date, is_paid').order('id')),
        supabase.from('business_finance_settings').select('commission_pct, tax_pct').maybeSingle(),
        supabase.from('services').select('id, name, price'),
        fetchAll(() => supabase.from('service_packages').select('id, customer_id, service_id, total_sessions, session_offset').order('id')),
      ])
      setAppointments(appts ?? [])
      setPayments(pays ?? [])
      setCustomers(custs ?? [])
      setExpenses(exps ?? [])
      setTaxPct(settings?.tax_pct ?? 0)
      setCommissionPct(settings?.commission_pct ?? 0)
      setServices(svcs ?? [])
      setPackages(pkgs ?? [])
      setDataLoading(false)
    }
    loadLiveData()
  }, [])

  async function handleGenerate() {
    if (!session || generating) return
    setGenerating(true)
    setError(null)
    try {
      const periodLabel = PERIOD_LABEL_FOR_AI[preset] ?? 'Bu Dönem'
      const res = await callEdgeFunction<Insight>('generate-ai-insights', { rangeStart, rangeEnd, periodLabel, periodKey: preset })
      if (!res.ok) {
        setError(res.error ?? 'Analiz oluşturulamadı.')
        return
      }
      setInsight(res.data)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setGenerating(false)
    }
  }

  // Donem degisince o donemin onbellekteki analizi gosterilir; 10 dakikadan
  // eskiyse ya da yoksa yeniden uretilir (sunucudaki bekleme suresi donem
  // bazli, 429 almaz). Ilk yuklemede uretim yapilmaz, yalnizca var olan
  // gosterilir; ilk analiz "Analiz Oluştur" ile baslatilir.
  const isFirstPeriodLoad = useRef(true)
  useEffect(() => {
    let cancelled = false
    async function run() {
      const data = await loadInsightForPeriod(preset)
      if (cancelled) return
      setInsight(data)
      const wasFirst = isFirstPeriodLoad.current
      isFirstPeriodLoad.current = false
      if (wasFirst) {
        setLoading(false)
        return
      }
      const isFresh = data && Date.now() - new Date(data.generated_at).getTime() < COOLDOWN_MS
      if (!isFresh) handleGenerate()
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset])

  // ---------- Canlı KPI/grafik hesaplamaları ----------

  const hasPrev = preset !== 'tum_zamanlar'
  const prev = useMemo(() => (hasPrev ? prevPeriodBounds(rangeStart, rangeEnd) : null), [hasPrev, rangeStart, rangeEnd])

  function periodTotals(start: string, end: string) {
    const rev = payments.filter((p) => !p.voided_at && inRange(p.paid_at, start, end)).reduce((s, p) => s + p.amount, 0)
    const exp = expenses.filter((e) => e.is_paid && inRange(e.expense_date, start, end)).reduce((s, e) => s + e.amount, 0)
    const afterTax = rev * (1 - taxPct / 100)
    const afterCommission = afterTax * (1 - commissionPct / 100)
    const netProfit = afterCommission - exp
    const newCustomers = customers.filter((c) => inRange(c.created_at, start, end)).length
    return { revenue: rev, expenses: exp, netProfit, newCustomers }
  }

  const current = useMemo(
    () => periodTotals(rangeStart, rangeEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeStart, rangeEnd, payments, expenses, customers, taxPct, commissionPct],
  )
  const previous = useMemo(
    () => (prev ? periodTotals(prev.start, prev.end) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prev, payments, expenses, customers, taxPct, commissionPct],
  )

  const profitMarginPct = current.revenue > 0 ? (current.netProfit / current.revenue) * 100 : 0
  const prevProfitMarginPct = previous && previous.revenue > 0 ? (previous.netProfit / previous.revenue) * 100 : 0
  const totalCustomers = customers.filter((c) => c.created_at.slice(0, 10) <= rangeEnd).length
  const prevTotalCustomers = prev ? customers.filter((c) => c.created_at.slice(0, 10) <= prev.end).length : 0

  function pctDelta(curr: number, prevVal: number): number | null {
    if (!previous) return null
    if (prevVal === 0) return curr > 0 ? 100 : 0
    return ((curr - prevVal) / Math.abs(prevVal)) * 100
  }

  const apptsInRange = useMemo(
    () => appointments.filter((a) => inRange(a.scheduled_at, rangeStart, rangeEnd)),
    [appointments, rangeStart, rangeEnd],
  )
  const cancelRate = apptsInRange.length
    ? (apptsInRange.filter((a) => a.status === 'iptal').length / apptsInRange.length) * 100
    : 0
  const noShowRate = apptsInRange.length
    ? (apptsInRange.filter((a) => a.status === 'gelmedi').length / apptsInRange.length) * 100
    : 0

  // ---------- Müşteri segmentleri (tarih aralığından bağımsız, her zaman güncel) ----------

  const now = useMemo(() => new Date(), [])
  const currentMonthStart = useMemo(() => firstOfMonth(now), [now])

  const segmentCounts = useMemo(() => {
    const paymentsByCustomer = new Map<string, Payment[]>()
    for (const p of payments) {
      const list = paymentsByCustomer.get(p.customer_id) ?? []
      list.push(p)
      paymentsByCustomer.set(p.customer_id, list)
    }
    const apptsByCustomer = new Map<string, Appointment[]>()
    for (const a of appointments) {
      if (!a.customer_id) continue
      const list = apptsByCustomer.get(a.customer_id) ?? []
      list.push(a)
      apptsByCustomer.set(a.customer_id, list)
    }
    interface Stats {
      totalSpend: number
      completedCount: number
      isNewThisMonth: boolean
    }
    const statsByCustomer = new Map<string, Stats>()
    for (const c of customers) {
      const appts = apptsByCustomer.get(c.id) ?? []
      const completed = appts.filter((a) => a.status === 'tamamlandi')
      const totalSpend = (paymentsByCustomer.get(c.id) ?? [])
        .filter((p) => !p.voided_at)
        .reduce((sum, p) => sum + p.amount, 0)
      const isNewThisMonth = new Date(c.created_at) >= currentMonthStart
      statsByCustomer.set(c.id, { totalSpend, completedCount: completed.length, isNewThisMonth })
    }

    let yeni = 0,
      sadik = 0
    for (const s of statsByCustomer.values()) {
      const seg = segmentForStats(s)
      if (seg === 'yeni') yeni++
      else if (seg === 'sadik') sadik++
    }
    return { yeni, sadik, total: customers.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, appointments, payments, currentMonthStart])

  // ---------- Tahsilat/Net Kâr trend grafiği ----------

  const chart = useMemo(() => {
    const spanDays = daysBetween(rangeStart, rangeEnd)
    const useMonthly = spanDays > 31
    const bucketKeys: string[] = []
    if (useMonthly) {
      const cur = new Date(`${rangeStart}T00:00:00`)
      cur.setDate(1)
      const endD = new Date(`${rangeEnd}T00:00:00`)
      while (cur <= endD) {
        bucketKeys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`)
        cur.setMonth(cur.getMonth() + 1)
      }
    } else {
      const cur = new Date(`${rangeStart}T00:00:00`)
      const endD = new Date(`${rangeEnd}T00:00:00`)
      while (cur <= endD) {
        bucketKeys.push(toLocalDateString(cur))
        cur.setDate(cur.getDate() + 1)
      }
    }

    const revenueByBucket = new Map<string, number>()
    const expenseByBucket = new Map<string, number>()
    for (const p of payments) {
      if (p.voided_at || !inRange(p.paid_at, rangeStart, rangeEnd)) continue
      const d = p.paid_at.slice(0, 10)
      const key = useMonthly ? d.slice(0, 7) : d
      revenueByBucket.set(key, (revenueByBucket.get(key) ?? 0) + p.amount)
    }
    for (const e of expenses) {
      if (!e.is_paid || !inRange(e.expense_date, rangeStart, rangeEnd)) continue
      const d = e.expense_date.slice(0, 10)
      const key = useMonthly ? d.slice(0, 7) : d
      expenseByBucket.set(key, (expenseByBucket.get(key) ?? 0) + e.amount)
    }

    const revenueSeries = bucketKeys.map((k) => revenueByBucket.get(k) ?? 0)
    const netProfitSeries = bucketKeys.map((k, i) => {
      const afterTaxB = revenueSeries[i] * (1 - taxPct / 100)
      const afterCommissionB = afterTaxB * (1 - commissionPct / 100)
      return afterCommissionB - (expenseByBucket.get(k) ?? 0)
    })

    const labelStep = Math.max(1, Math.ceil(bucketKeys.length / 12))
    const xLabels = bucketKeys.map((k, i) => {
      if (i % labelStep !== 0 && i !== bucketKeys.length - 1) return ''
      if (useMonthly) return new Date(`${k}-01T00:00:00`).toLocaleDateString('tr-TR', { month: 'short' })
      return String(new Date(`${k}T00:00:00`).getDate())
    })

    return { revenueSeries, netProfitSeries, xLabels }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, payments, expenses, taxPct, commissionPct])

  // ---------- Sağlık skoru ----------
  // Kârlılık (%40) + operasyonel güvenilirlik (%35, düşük iptal/gelmedi = yüksek puan)
  // + büyüme (%25, önceki döneme göre yeni müşteri değişimi) — 0-100'e ağırlıklı ortalama.
  const profitScore = clamp(profitMarginPct * 2, 0, 100)
  const reliabilityScore = clamp(100 - (cancelRate + noShowRate) * 2, 0, 100)
  const growthDeltaPct = previous
    ? previous.newCustomers > 0
      ? ((current.newCustomers - previous.newCustomers) / previous.newCustomers) * 100
      : current.newCustomers > 0
        ? 100
        : 0
    : 0
  const growthScore = clamp(50 + growthDeltaPct, 0, 100)
  const healthScore = Math.round(0.4 * profitScore + 0.35 * reliabilityScore + 0.25 * growthScore)
  const healthLabel = healthScore >= 70 ? 'İyi' : healthScore >= 40 ? 'Orta' : 'Geliştirilmeli'

  // ---------- Hazir sorularin cevaplari (kendi kayitlarindan, AI cagrisi YOK) ----------

  const serviceRevenue = useMemo(() => {
    const apptById = new Map(appointments.map((a) => [a.id, a]))
    const nameById = new Map(services.map((s) => [s.id, s.name]))
    const byService = new Map<string, { revenue: number; appts: Set<string> }>()
    let paymentCount = 0
    for (const p of payments) {
      if (p.voided_at || !p.appointment_id || !inRange(p.paid_at, rangeStart, rangeEnd)) continue
      const sid = apptById.get(p.appointment_id)?.service_id
      if (!sid) continue
      paymentCount++
      const cur = byService.get(sid) ?? { revenue: 0, appts: new Set<string>() }
      cur.revenue += p.amount
      cur.appts.add(p.appointment_id)
      byService.set(sid, cur)
    }
    const rows = Array.from(byService.entries())
      .map(([id, v]) => ({ name: nameById.get(id) ?? 'Silinmiş hizmet', revenue: v.revenue, count: v.appts.size }))
      .sort((a, b) => b.revenue - a.revenue)
    return { rows, paymentCount }
  }, [appointments, payments, services, rangeStart, rangeEnd])

  // Son 6 haftada haftanin gunlerine gore ortalama randevu (iptal/gelmedi haric).
  const weekdayLoad = useMemo(() => {
    const end = toLocalDateString(new Date())
    const startD = new Date()
    startD.setDate(startD.getDate() - 41)
    const start = toLocalDateString(startD)
    const counts = new Map<number, number>()
    for (const a of appointments) {
      if (a.status === 'iptal' || a.status === 'gelmedi' || !inRange(a.scheduled_at, start, end)) continue
      const dow = new Date(a.scheduled_at).getDay()
      counts.set(dow, (counts.get(dow) ?? 0) + 1)
    }
    const days = Array.from(counts.entries()).map(([dow, n]) => ({ dow, avg: n / 6 }))
    if (days.length === 0) return null
    const best = days.reduce((m, d) => (d.avg > m.avg ? d : m))
    const worst = days.reduce((m, d) => (d.avg < m.avg ? d : m))
    return { best, worst, dayCount: days.length }
  }, [appointments])

  const debts = useMemo(() => {
    const priceById = new Map(services.map((s) => [s.id, s.price ?? 0]))
    const map = computeCustomerDebts(
      packages,
      appointments,
      payments.filter((p) => !p.voided_at),
      priceById,
    )
    const nameById = new Map(customers.map((c) => [c.id, c.full_name]))
    const rows = Array.from(map.entries())
      .map(([id, amount]) => ({ id, name: nameById.get(id) ?? 'Müşteri', amount }))
      .sort((a, b) => b.amount - a.amount)
    return { rows, total: rows.reduce((s, r) => s + r.amount, 0) }
  }, [packages, appointments, payments, services, customers])

  const sourceStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of apptsInRange) counts.set(a.source, (counts.get(a.source) ?? 0) + 1)
    const adAppts = apptsInRange.filter((a) => a.source.startsWith('reklam_'))
    const adIds = new Set(adAppts.map((a) => a.id))
    const adRevenue = payments
      .filter((p) => !p.voided_at && p.appointment_id && adIds.has(p.appointment_id))
      .reduce((s, p) => s + p.amount, 0)
    return {
      rows: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]),
      adCount: adAppts.length,
      adCompleted: adAppts.filter((a) => a.status === 'tamamlandi').length,
      adRevenue,
    }
  }, [apptsInRange, payments])

  const threadEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (thread.length) threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread.length])

  if (loading) return <p className={styles.hint}>Yükleniyor…</p>

  const kpis = [
    { label: 'Tahsilat', value: currency.format(current.revenue), delta: pctDelta(current.revenue, previous?.revenue ?? 0) },
    { label: 'Net kâr', value: currency.format(current.netProfit), delta: pctDelta(current.netProfit, previous?.netProfit ?? 0) },
    { label: 'Kâr marjı', value: `%${profitMarginPct.toFixed(1)}`, delta: pctDelta(profitMarginPct, prevProfitMarginPct) },
    { label: 'Müşteri', value: `${totalCustomers}`, delta: pctDelta(totalCustomers, prevTotalCustomers) },
  ]

  const periodPhrase = PERIOD_PHRASE[preset] ?? 'Bu dönemde'
  const remaining = ASK_ORDER.filter((k) => !thread.some((t) => t.key === k))

  function ask(key: AskKey, text?: string) {
    setThread((prev) => [...prev, { id: Date.now() + prev.length, key, text: text ?? ASK_TEXT[key] }])
  }

  function submitDraft() {
    const text = draft.trim()
    if (!text) return
    ask(matchQuestion(text), text)
    setDraft('')
  }

  const generateChip = (
    <button type="button" className={styles.actionChip} onClick={handleGenerate} disabled={generating}>
      {generating ? 'Hazırlanıyor…' : insight ? 'Yazılı analizi yenile' : 'Yazılı analizi hazırla'}
    </button>
  )

  function renderAnswer(key: AskKey) {
    if (dataLoading) return <span className={styles.answerText}>Kayıtlara bakıyorum…</span>
    switch (key) {
      case 'hizmet': {
        const [top, second] = serviceRevenue.rows
        if (!top) return <span className={styles.answerText}>{periodPhrase} hizmete bağlı bir tahsilat görünmüyor.</span>
        const max = top.revenue || 1
        return (
          <>
            <span className={styles.answerText}>
              {periodPhrase} en çok <b>{top.name}</b> kazandırdı: {top.count} randevu, {currency.format(top.revenue)}.
              {second && ` İkinci sırada ${second.name} var.`}
            </span>
            <div className={styles.barGrid}>
              {serviceRevenue.rows.slice(0, 3).map((r) => (
                <div className={styles.barGridRow} key={r.name}>
                  <span className={styles.barName}>{r.name}</span>
                  <span className={styles.barTrack}>
                    <span className={styles.barFill} style={{ width: `${Math.max(4, (r.revenue / max) * 100)}%` }} />
                  </span>
                  <span className={styles.barAmount}>{currency.format(r.revenue)}</span>
                </div>
              ))}
            </div>
            <span className={styles.source}>Kaynak: {periodPhrase.toLocaleLowerCase('tr')} randevuya bağlı {serviceRevenue.paymentCount} tahsilat</span>
          </>
        )
      }
      case 'gun': {
        if (!weekdayLoad) return <span className={styles.answerText}>Son 6 haftada randevu görünmüyor.</span>
        const { best, worst } = weekdayLoad
        return (
          <>
            <span className={styles.answerText}>
              <b>{DAY_LONG[worst.dow]}.</b> Son 6 haftada {DAY_LONG[worst.dow]} günleri ortalama {worst.avg.toFixed(1)} randevu var.
              En yoğun gün {DAY_LONG[best.dow]} (ortalama {best.avg.toFixed(1)}).
            </span>
            {best.dow !== worst.dow && (
              <button type="button" className={styles.actionChip} onClick={() => navigate('/toplu-mesaj')}>
                {DAY_LONG[worst.dow]} için kampanya gönder
              </button>
            )}
          </>
        )
      }
      case 'borc': {
        if (debts.rows.length === 0) return <span className={styles.answerText}>Şu an borçlu müşterin yok.</span>
        return (
          <>
            <span className={styles.answerText}>
              <b>{debts.rows.length} müşteri</b> toplam <b>{currency.format(debts.total)}</b> borçlu.
            </span>
            <div className={styles.miniList}>
              {debts.rows.slice(0, 5).map((r) => (
                <button type="button" key={r.id} className={styles.miniRow} onClick={() => navigate(`/musteriler/${r.id}`)}>
                  <span className={styles.miniName}>{r.name}</span>
                  <span className={styles.miniAmount}>{currency.format(r.amount)}</span>
                </button>
              ))}
            </div>
            <button type="button" className={styles.actionChip} onClick={() => navigate('/musteriler?sekme=borclu')}>
              Borçluların hepsini aç
            </button>
          </>
        )
      }
      case 'reklam': {
        const total = apptsInRange.length
        const max = Math.max(1, ...sourceStats.rows.map(([, n]) => n))
        return (
          <>
            <span className={styles.answerText}>
              {sourceStats.adCount === 0 ? (
                `${periodPhrase} reklamdan gelen randevu görünmüyor.`
              ) : (
                <>
                  {periodPhrase} reklamdan <b>{sourceStats.adCount} randevu</b> geldi (tümünün %{Math.round((sourceStats.adCount / Math.max(1, total)) * 100)}
                  ’i). {sourceStats.adCompleted} tanesi tamamlandı, {currency.format(sourceStats.adRevenue)} tahsil edildi.
                </>
              )}
            </span>
            {sourceStats.rows.length > 0 && (
              <div className={styles.barGrid}>
                {sourceStats.rows.slice(0, 4).map(([src, n]) => (
                  <div className={styles.barGridRow} key={src}>
                    <span className={styles.barName}>{SOURCE_LABEL[src] ?? src}</span>
                    <span className={styles.barTrack}>
                      <span className={styles.barFill} style={{ width: `${Math.max(4, (n / max) * 100)}%` }} />
                    </span>
                    <span className={styles.barAmount}>{n}</span>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className={styles.actionChip} onClick={() => navigate('/reklam')}>
              Reklam sonuçlarını aç
            </button>
          </>
        )
      }
      case 'kar':
        return (
          <>
            <span className={styles.answerText}>
              {periodPhrase} {currency.format(current.revenue)} tahsil ettin; giderler ve kesintiler sonrası net kâr{' '}
              <b>{currency.format(current.netProfit)}</b>.
            </span>
            <div className={styles.kpiGrid}>
              {kpis.map((k) => (
                <div className={styles.kpiTile} key={k.label}>
                  <span className={styles.kpiLabel}>{k.label}</span>
                  <span className={styles.kpiValue}>{k.value}</span>
                  {k.delta !== null && (
                    <span className={k.delta >= 0 ? styles.kpiDeltaUp : styles.kpiDeltaDown}>
                      {k.delta >= 0 ? '↑' : '↓'} %{Math.abs(k.delta).toFixed(0)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.legend}>
              <span className={styles.legendRow}>
                <span className={`${styles.legendDot} ${styles.legendSignal}`} />
                Tahsilat
              </span>
              <span className={styles.legendRow}>
                <span className={`${styles.legendDot} ${styles.legendAccent}`} />
                Net kâr
              </span>
            </div>
            <LineChart
              series={[
                { label: 'Tahsilat', color: 'var(--signal)', points: chart.revenueSeries },
                { label: 'Net kâr', color: 'var(--accent)', points: chart.netProfitSeries },
              ]}
              xLabels={chart.xLabels}
              height={150}
            />
          </>
        )
      case 'musteri': {
        const diger = Math.max(0, segmentCounts.total - segmentCounts.yeni - segmentCounts.sadik)
        return (
          <>
            <span className={styles.answerText}>
              Toplam <b>{segmentCounts.total} müşterin</b> var; {periodPhrase.toLocaleLowerCase('tr')} {current.newCustomers} yeni müşteri eklendi.
              İptal oranı %{cancelRate.toFixed(0)}, gelmeme oranı %{noShowRate.toFixed(0)}.
            </span>
            {segmentCounts.total > 0 && (
              <div className={styles.donutRow}>
                <DonutChart
                  segments={[
                    { value: segmentCounts.yeni, color: 'var(--accent)' },
                    { value: segmentCounts.sadik, color: 'var(--signal)' },
                    { value: diger, color: '#e2e5ea' },
                  ]}
                  size={96}
                  strokeWidth={10}
                  centerLabel={`${segmentCounts.total}`}
                  centerSubLabel="müşteri"
                />
                <div className={styles.legendCol}>
                  <span className={styles.legendRow}>
                    <span className={`${styles.legendDot} ${styles.legendAccent}`} />
                    Yeni <strong>{segmentCounts.yeni}</strong>
                  </span>
                  <span className={styles.legendRow}>
                    <span className={`${styles.legendDot} ${styles.legendSignal}`} />
                    Sadık <strong>{segmentCounts.sadik}</strong>
                  </span>
                  <span className={styles.legendRow}>
                    <span className={`${styles.legendDot} ${styles.legendMuted}`} />
                    Diğer <strong>{diger}</strong>
                  </span>
                </div>
              </div>
            )}
          </>
        )
      }
      case 'iyi':
      case 'risk':
      case 'oneri': {
        if (!insight) {
          return (
            <>
              <span className={styles.answerText}>
                Bunun için rakamlarına bakıp yazılı bir değerlendirme hazırlamam gerekiyor. Hazırlamak 30 saniye kadar sürer.
              </span>
              {generateChip}
            </>
          )
        }
        const items = key === 'iyi' ? insight.highlights : key === 'risk' ? insight.risks : insight.recommendations
        return items.length === 0 ? (
          <span className={styles.answerText}>Bu dönem için söyleyecek özel bir şey bulamadım.</span>
        ) : (
          <ul className={styles.bubbleList}>
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )
      }
      default:
        return (
          <>
            <span className={styles.answerText}>
              Bunu henüz kendi kayıtlarından cevaplayamıyorum. Şunlardan birini sorabilirsin:
            </span>
            <div className={styles.inlineChips}>
              {ASK_ORDER.map((k) => (
                <button type="button" key={k} className={styles.suggestChip} onClick={() => ask(k)}>
                  {ASK_TEXT[k]}
                </button>
              ))}
            </div>
          </>
        )
    }
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Salonuna sor"
        sub="Kendi kayıtlarından cevaplar"
        action={
          <div className={styles.periodWrap}>
            <button
              type="button"
              className={styles.periodBtn}
              onClick={() => setPeriodMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={periodMenuOpen}
            >
              {PRESETS.find((p) => p.value === preset)?.label} ▾
            </button>
            {periodMenuOpen && (
              <>
                <div className={styles.menuScrim} onClick={() => setPeriodMenuOpen(false)} />
                <div className={styles.periodMenu} role="menu">
                  {PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.value}
                      className={styles.periodMenuItem}
                      onClick={() => {
                        applyPreset(p.value)
                        setPeriodMenuOpen(false)
                      }}
                    >
                      {p.long}
                      {preset === p.value && <CheckCircleIcon width={14} height={14} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        }
      />

      <div className={styles.aiBubble}>
        <span className={styles.answerText}>
          İşletme sağlığı <b>{healthLabel}</b> · {healthScore}/100.{' '}
          {insight ? insight.summary : 'Aşağıdan bir soru seç ya da kendin yaz; cevapları kendi kayıtlarından hesaplarım.'}
        </span>
        {insight && (
          <span className={styles.source}>
            Yazılı analiz:{' '}
            {new Date(insight.generated_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {generateChip}
        {generating && <span className={styles.source}>Analiz hazırlanıyor, 30 saniye kadar sürebilir…</span>}
        {error && <p className={styles.error}>{error}</p>}
      </div>

      {thread.map((t) => (
        <div className={styles.exchange} key={t.id}>
          <div className={styles.userBubble}>{t.text}</div>
          <div className={styles.aiBubble}>{renderAnswer(t.key)}</div>
        </div>
      ))}
      <div ref={threadEndRef} />

      <div className={styles.composer}>
        {remaining.length > 0 && (
          <div className={styles.suggestRow}>
            {remaining.map((k) => (
              <button type="button" key={k} className={styles.suggestChip} onClick={() => ask(k)}>
                {ASK_TEXT[k]}
              </button>
            ))}
          </div>
        )}
        <form
          className={styles.inputPill}
          onSubmit={(e) => {
            e.preventDefault()
            submitDraft()
          }}
        >
          <input
            className={styles.input}
            placeholder="Bir şey sor…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Soru"
          />
          <button type="submit" className={styles.sendBtn} disabled={!draft.trim()} aria-label="Gönder">
            <SendIcon width={18} height={18} />
          </button>
        </form>
      </div>
    </div>
  )
}
