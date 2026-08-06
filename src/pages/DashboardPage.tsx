import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import DonutChart from '../components/DonutChart'
import Avatar from '../components/Avatar'
import QuickAddCustomerModal from '../components/QuickAddCustomerModal'
import {
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  WalletIcon,
  ReceiptIcon,
  CashIcon,
  PlusIcon,
  UserPlusIcon,
  ChevronRightIcon,
} from '../components/icons'
import type { LayoutOutletContext } from '../layouts/DashboardLayout'
import styles from './DashboardPage.module.css'

const SLOT_MINUTES = 30

interface Appointment {
  id: string
  customer_id: string | null
  service_id: string | null
  employee_id: string | null
  created_by_user_id: string | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal'
  source: string
  scheduled_at: string
  duration_minutes: number | null
  package_id: string | null
}

interface Service {
  id: string
  name: string
  price: number | null
}

interface Profile {
  id: string
  full_name: string | null
}

interface Customer {
  id: string
  full_name: string | null
}

interface Expense {
  id: string
  description: string
  amount: number
  expense_date: string
}

interface ServicePackage {
  id: string
  customer_id: string
  service_id: string | null
  total_sessions: number
}

interface Payment {
  id: string
  customer_id: string
  amount: number
  appointment_id: string | null
  package_id: string | null
  paid_at: string
}

const STATUS_LABEL: Record<Appointment['status'], string> = {
  bekliyor: 'Bekliyor',
  onaylandi: 'Onaylandı',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
}

type DateFilter = 'bugun' | 'hafta' | 'ay' | 'ozel'

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

function toLocalDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfWeekMonday(d: Date) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const r = new Date(d)
  r.setDate(d.getDate() + diff)
  return r
}

function atMidnight(d: Date) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { registerSearchResultsAnchor } = useOutletContext<LayoutOutletContext>()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingSlug, setBookingSlug] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilter>('bugun')
  const [customStart, setCustomStart] = useState(() => toLocalDateString(new Date()))
  const [customEnd, setCustomEnd] = useState(() => toLocalDateString(new Date()))
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false)

  const analyticsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const [{ data: appts }, { data: svcs }, { data: profs }, { data: custs }, { data: exps }, { data: pkgs }, { data: pays }] =
        await Promise.all([
          supabase
            .from('appointments')
            .select(
              'id, customer_id, service_id, employee_id, created_by_user_id, status, source, scheduled_at, duration_minutes, package_id',
            ),
          supabase.from('services').select('id, name, price'),
          supabase.from('profiles').select('id, full_name'),
          supabase.from('customers').select('id, full_name'),
          supabase.from('business_expenses').select('id, description, amount, expense_date'),
          supabase.from('service_packages').select('id, customer_id, service_id, total_sessions'),
          supabase.from('payments').select('id, customer_id, amount, appointment_id, package_id, paid_at'),
        ])
      setAppointments(appts ?? [])
      setServices(svcs ?? [])
      setProfiles(profs ?? [])
      setCustomers(custs ?? [])
      setExpenses(exps ?? [])
      setPackages(pkgs ?? [])
      setPayments(pays ?? [])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!profile?.business_id) return
    supabase
      .from('businesses')
      .select('slug')
      .eq('id', profile.business_id)
      .maybeSingle()
      .then(({ data }) => setBookingSlug(data?.slug ?? null))
  }, [profile?.business_id])

  const bookingUrl = bookingSlug ? `${window.location.origin}/randevu-al/${bookingSlug}` : null

  function copyBookingLink() {
    if (!bookingUrl) return
    navigator.clipboard.writeText(bookingUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const today = useMemo(() => atMidnight(new Date()), [])
  const todayStr = useMemo(() => toLocalDateString(today), [today])

  const rangeStart = useMemo(() => {
    if (dateFilter === 'bugun') return today
    if (dateFilter === 'hafta') return startOfWeekMonday(today)
    if (dateFilter === 'ay') return new Date(today.getFullYear(), today.getMonth(), 1)
    return customStart ? atMidnight(new Date(`${customStart}T00:00:00`)) : today
  }, [dateFilter, customStart, today])

  const rangeEnd = useMemo(() => {
    if (dateFilter === 'ozel') return customEnd ? atMidnight(new Date(`${customEnd}T00:00:00`)) : today
    return today
  }, [dateFilter, customEnd, today])

  function dateWithinRange(iso: string, start: Date, end: Date) {
    const d = atMidnight(new Date(iso))
    return d >= start && d <= end
  }

  if (loading) return <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>

  const servicePriceById = new Map(services.map((s) => [s.id, s.price ?? 0]))
  const serviceNameById = new Map(services.map((s) => [s.id, s.name]))
  const profileNameById = new Map(profiles.map((p) => [p.id, p.full_name ?? '—']))
  const customerNameById = new Map(customers.map((c) => [c.id, c.full_name ?? 'Müşteri']))

  // ---- Tarih filtresine bagli ozet kartlari ----
  const rangedAppointments = appointments.filter((a) => dateWithinRange(a.scheduled_at, rangeStart, rangeEnd))
  const rangedCompleted = rangedAppointments.filter((a) => a.status === 'tamamlandi')
  // Kazanc, tamamlanan randevu sayisindan degil gercek odemelerden (payments,
  // paid_at secili araliktaysa) hesaplanir — Muhasebe sayfasiyla ayni mantik.
  const rangeRevenue = payments
    .filter((p) => dateWithinRange(`${p.paid_at}T00:00:00`, rangeStart, rangeEnd))
    .reduce((sum, p) => sum + p.amount, 0)
  const rangeExpenses = expenses
    .filter((e) => dateWithinRange(`${e.expense_date}T00:00:00`, rangeStart, rangeEnd))
    .reduce((sum, e) => sum + e.amount, 0)
  const rangeBalance = rangeRevenue - rangeExpenses

  // ---- Bekleyen tahsilatlar (secili tarih araligindaki tamamlanan
  // randevu/paket seanslarindan dogup henuz tahsil edilmemis tutar) ----
  const debtByCustomerInRange = new Map<string, number>()
  for (const pkg of packages) {
    const sessions = appointments.filter((a) => a.package_id === pkg.id)
    const hasSessionInRange = sessions.some(
      (a) => a.status === 'tamamlandi' && dateWithinRange(a.scheduled_at, rangeStart, rangeEnd),
    )
    if (!hasSessionInRange) continue
    const price = pkg.service_id ? (servicePriceById.get(pkg.service_id) ?? 0) : 0
    const expected = pkg.total_sessions * price
    const paid = payments.filter((p) => p.package_id === pkg.id).reduce((sum, p) => sum + p.amount, 0)
    const remaining = Math.max(0, expected - paid)
    if (remaining > 0) debtByCustomerInRange.set(pkg.customer_id, (debtByCustomerInRange.get(pkg.customer_id) ?? 0) + remaining)
  }
  for (const a of rangedCompleted) {
    if (a.package_id || !a.customer_id) continue
    const expected = a.service_id ? (servicePriceById.get(a.service_id) ?? 0) : 0
    const paid = payments.filter((p) => p.appointment_id === a.id).reduce((sum, p) => sum + p.amount, 0)
    const remaining = Math.max(0, expected - paid)
    if (remaining > 0) debtByCustomerInRange.set(a.customer_id, (debtByCustomerInRange.get(a.customer_id) ?? 0) + remaining)
  }
  const totalDebtInRange = Array.from(debtByCustomerInRange.values()).reduce((sum, v) => sum + v, 0)
  const topDebtors = Array.from(debtByCustomerInRange.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  const periodDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1)
  const prevEnd = new Date(rangeStart)
  prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevEnd.getDate() - periodDays + 1)
  const prevRevenue = payments
    .filter((p) => dateWithinRange(`${p.paid_at}T00:00:00`, prevStart, prevEnd))
    .reduce((sum, p) => sum + p.amount, 0)
  const revenueChangePct = prevRevenue > 0 ? Math.round(((rangeRevenue - prevRevenue) / prevRevenue) * 100) : null

  const upcomingExpenses = expenses
    .filter((e) => e.expense_date >= todayStr)
    .sort((a, b) => a.expense_date.localeCompare(b.expense_date))
    .slice(0, 4)

  function daysUntil(dateStr: string) {
    const d = atMidnight(new Date(`${dateStr}T00:00:00`))
    return Math.round((d.getTime() - today.getTime()) / 86400000)
  }

  const todaysAppointments = appointments
    .filter((a) => toLocalDateString(new Date(a.scheduled_at)) === todayStr)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  // ---- Mevcut (korunan) analiz bolumu — tum zamanlar, filtreden bagimsiz ----
  const total = appointments.length
  const statusCounts = {
    bekliyor: appointments.filter((a) => a.status === 'bekliyor').length,
    onaylandi: appointments.filter((a) => a.status === 'onaylandi').length,
    tamamlandi: appointments.filter((a) => a.status === 'tamamlandi').length,
    iptal: appointments.filter((a) => a.status === 'iptal').length,
  }
  const now = Date.now()
  const overdueCount = appointments.filter(
    (a) =>
      a.status === 'bekliyor' &&
      new Date(a.scheduled_at).getTime() + (a.duration_minutes ?? SLOT_MINUTES) * 60000 < now,
  ).length

  const counted = appointments.filter((a) => a.status !== 'iptal')

  const creatorStatsMap = new Map<string, number>()
  for (const a of counted) {
    const key = a.created_by_user_id ?? 'bot'
    creatorStatsMap.set(key, (creatorStatsMap.get(key) ?? 0) + 1)
  }
  const botCount = creatorStatsMap.get('bot') ?? 0
  const staffCount = counted.length - botCount
  const botPct = counted.length > 0 ? Math.round((botCount / counted.length) * 100) : 0

  const DATE_FILTERS: { value: DateFilter; label: string }[] = [
    { value: 'bugun', label: 'Bugün' },
    { value: 'hafta', label: 'Bu Hafta' },
    { value: 'ay', label: 'Bu Ay' },
    { value: 'ozel', label: 'Özel Tarih' },
  ]

  return (
    <div className={styles.wrap}>
      {/* ---- Tarih filtresi ---- */}
      <h2 className={styles.sectionLabel}>Tarih Filtresi</h2>
      <div className={styles.filterRow}>
        {DATE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={dateFilter === f.value ? styles.filterBtnActive : styles.filterBtn}
            onClick={() => setDateFilter(f.value)}
          >
            {f.value === 'ozel' && <CalendarIcon width={14} height={14} />}
            {f.label}
          </button>
        ))}
      </div>

      {dateFilter === 'ozel' && (
        <div className={`card ${styles.customRangeRow}`}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="homeRangeStart">Başlangıç</label>
            <input id="homeRangeStart" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="homeRangeEnd">Bitiş</label>
            <input id="homeRangeEnd" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        </div>
      )}

      {/* ---- Ozet kartlari ---- */}
      <h2 className={styles.sectionLabel}>Genel Bakış</h2>
      <div className={styles.summaryRow}>
        <div className={`card ${styles.summaryTile} ${styles.summaryTileSignal}`}>
          <div className={styles.summaryTopRow}>
            <span className={styles.summaryLabel}>Randevular</span>
            <span className={`${styles.summaryIcon} ${styles.summaryIconSignal}`}>
              <CalendarIcon width={16} height={16} />
            </span>
          </div>
          <span className={styles.summaryValue}>{rangedAppointments.length}</span>
          <span className={styles.summaryHint}>{rangedCompleted.length} tamamlandı</span>
        </div>
        <div className={`card ${styles.summaryTile} ${styles.summaryTileOk}`}>
          <div className={styles.summaryTopRow}>
            <span className={styles.summaryLabel}>Kazanç</span>
            <span className={`${styles.summaryIcon} ${styles.summaryIconOk}`}>
              <WalletIcon width={16} height={16} />
            </span>
          </div>
          <span className={`${styles.summaryValue} ${styles.summaryValueOk}`}>{currency.format(rangeRevenue)}</span>
          {revenueChangePct !== null ? (
            <span className={styles.summaryHint}>
              {revenueChangePct >= 0 ? '↑' : '↓'} %{Math.abs(revenueChangePct)} önceki döneme göre
            </span>
          ) : (
            <span className={styles.summaryHint}>Önceki dönem verisi yok</span>
          )}
        </div>
        <div className={`card ${styles.summaryTile} ${styles.summaryTileSignal}`}>
          <div className={styles.summaryTopRow}>
            <span className={styles.summaryLabel}>Kalan Bakiye</span>
            <span className={`${styles.summaryIcon} ${styles.summaryIconSignal}`}>
              <CashIcon width={16} height={16} />
            </span>
          </div>
          <span className={styles.summaryValue}>{currency.format(rangeBalance)}</span>
          <span className={styles.summaryHint}>Gelir − Gider</span>
        </div>
        <div className={`card ${styles.summaryTile} ${styles.summaryTileDanger}`}>
          <div className={styles.summaryTopRow}>
            <span className={styles.summaryLabel}>Yaklaşan Ödemeler</span>
            <span className={`${styles.summaryIcon} ${styles.summaryIconDanger}`}>
              <ReceiptIcon width={16} height={16} />
            </span>
          </div>
          <span className={`${styles.summaryValue} ${styles.summaryValueDanger}`}>
            {currency.format(upcomingExpenses.reduce((sum, e) => sum + e.amount, 0))}
          </span>
          <span className={styles.summaryHint}>{upcomingExpenses.length} ödeme</span>
        </div>
      </div>

      {/* ---- Hizli islemler ---- */}
      <div>
        <h2 className={styles.quickTitle}>Hızlı İşlemler</h2>
        <div className={styles.quickRow}>
          <button type="button" className={styles.quickBtn} onClick={() => navigate('/randevular?yeni=1')}>
            <span className={`${styles.quickIcon} ${styles.quickIconSignal}`}>
              <PlusIcon width={19} height={19} />
            </span>
            Randevu
          </button>
          <button type="button" className={styles.quickBtn} onClick={() => setShowQuickAddCustomer(true)}>
            <span className={`${styles.quickIcon} ${styles.quickIconPink}`}>
              <UserPlusIcon width={19} height={19} />
            </span>
            Müşteri
          </button>
          <button type="button" className={styles.quickBtn} disabled>
            <span className={styles.quickIcon}>
              <CashIcon width={19} height={19} />
            </span>
            Kasa
            <span className={styles.quickBadge}>Yakında</span>
          </button>
          <button type="button" className={styles.quickBtn} onClick={() => navigate('/randevular')}>
            <span className={`${styles.quickIcon} ${styles.quickIconOk}`}>
              <CalendarIcon width={19} height={19} />
            </span>
            Takvim
          </button>
          <button type="button" className={styles.quickBtn} onClick={() => navigate('/muhasebe?yeni=1')}>
            <span className={`${styles.quickIcon} ${styles.quickIconInfo}`}>
              <ReceiptIcon width={19} height={19} />
            </span>
            Ödeme Ekle
          </button>
          <button
            type="button"
            className={styles.quickBtn}
            onClick={() => analyticsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            <span className={styles.quickIcon}>
              <AlertTriangleIcon width={19} height={19} />
            </span>
            Raporlar
          </button>
        </div>
      </div>

      {/* ---- Bugunku randevular ---- */}
      <div className="card">
        <div className={styles.sectionHead}>
          <h2>Bugünkü Randevular</h2>
          <button type="button" className={styles.sectionLink} onClick={() => navigate(`/randevular?tarih=${todayStr}`)}>
            Tümünü Gör <ChevronRightIcon width={14} height={14} />
          </button>
        </div>
        {todaysAppointments.length === 0 ? (
          <p className={styles.empty}>Bugün için randevu yok.</p>
        ) : (
          <div className={styles.apptList}>
            {todaysAppointments.slice(0, 5).map((a) => (
              <div className={styles.apptRow} key={a.id}>
                <span className={styles.apptTime}>
                  {new Date(a.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <Avatar name={customerNameById.get(a.customer_id ?? '') ?? '?'} size={32} />
                <span className={styles.apptText}>
                  <span className={styles.apptCustomer}>{customerNameById.get(a.customer_id ?? '') ?? 'Müşteri'}</span>
                  <span className={styles.apptService}>{a.service_id ? serviceNameById.get(a.service_id) : '—'}</span>
                </span>
                <span className={styles.apptEmployee}>
                  {a.employee_id ? profileNameById.get(a.employee_id) : '—'}
                </span>
                <span className={`${styles.apptStatus} ${styles[`apptStatus_${a.status}`]}`}>
                  {STATUS_LABEL[a.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Yaklasan odemeler ---- */}
      <div className="card">
        <div className={styles.sectionHead}>
          <h2>Yaklaşan Ödemeler</h2>
          <button type="button" className={styles.sectionLink} onClick={() => navigate('/muhasebe')}>
            Tümü <ChevronRightIcon width={14} height={14} />
          </button>
        </div>
        {upcomingExpenses.length === 0 ? (
          <p className={styles.empty}>Yaklaşan planlı ödeme yok.</p>
        ) : (
          <div className={styles.paymentList}>
            {upcomingExpenses.map((e) => {
              const left = daysUntil(e.expense_date)
              return (
                <div className={styles.paymentRow} key={e.id}>
                  <span className={styles.paymentIcon}>
                    <ReceiptIcon width={16} height={16} />
                  </span>
                  <span className={styles.paymentText}>
                    <span className={styles.paymentDesc}>{e.description}</span>
                    <span className={styles.paymentDate}>
                      {new Date(`${e.expense_date}T00:00:00`).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: 'long',
                      })}
                    </span>
                  </span>
                  <span className={styles.paymentAmount}>{currency.format(e.amount)}</span>
                  <span className={left <= 3 ? styles.paymentDaysUrgent : styles.paymentDays}>
                    {left === 0 ? 'Bugün' : `${left} gün kaldı`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        <button type="button" className={`btn-secondary ${styles.addPaymentBtn}`} onClick={() => navigate('/muhasebe?yeni=1')}>
          + Ödeme Ekle
        </button>
      </div>

      {/* ---- Bekleyen tahsilatlar (musteri borclari) ---- */}
      <div className="card">
        <div className={styles.sectionHead}>
          <h2>Bekleyen Tahsilatlar</h2>
          <button type="button" className={styles.sectionLink} onClick={() => navigate('/musteriler')}>
            Tümü <ChevronRightIcon width={14} height={14} />
          </button>
        </div>
        {topDebtors.length === 0 ? (
          <p className={styles.empty}>Bu aralıkta bekleyen tahsilat yok.</p>
        ) : (
          <div className={styles.paymentList}>
            {topDebtors.map(([customerId, amount]) => (
              <button
                type="button"
                className={styles.paymentRow}
                key={customerId}
                onClick={() => navigate(`/musteriler/${customerId}`)}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <span className={`${styles.paymentIcon} ${styles.paymentIconDanger}`}>
                  <WalletIcon width={16} height={16} />
                </span>
                <span className={styles.paymentText}>
                  <span className={styles.paymentDesc}>{customerNameById.get(customerId) ?? 'Müşteri'}</span>
                </span>
                <span className={styles.paymentAmountDanger}>{currency.format(amount)}</span>
              </button>
            ))}
          </div>
        )}
        {totalDebtInRange > 0 && (
          <p className={styles.debtTotalHint}>
            Toplam bekleyen: <strong>{currency.format(totalDebtInRange)}</strong>
          </p>
        )}
      </div>

      {/* ---- Detayli analiz (mevcut, korunan icerik) ---- */}
      <div ref={(el) => { analyticsRef.current = el; registerSearchResultsAnchor(el) }} className={styles.analyticsSection}>
        <h2 className={styles.analyticsTitle}>Detaylı Analiz</h2>

        <div className={styles.statRow}>
          <div className={`card ${styles.statTile}`}>
            <span className={`${styles.statIcon} ${styles.statIconNeutral}`}>
              <CalendarIcon width={18} height={18} />
            </span>
            <span className={styles.statValue}>{total}</span>
            <span className={styles.statLabel}>Toplam randevu</span>
          </div>
          <div className={`card ${styles.statTile}`}>
            <span className={`${styles.statIcon} ${styles.statIconWarn}`}>
              <ClockIcon width={18} height={18} />
            </span>
            <span className={styles.statValue}>{statusCounts.bekliyor}</span>
            <span className={styles.statLabel}>Bekliyor</span>
          </div>
          <button
            type="button"
            className={`card ${styles.statTile} ${styles.statTileClickable} ${overdueCount > 0 ? styles.statTileAlert : ''}`}
            onClick={() => navigate('/randevular')}
          >
            <span className={`${styles.statIcon} ${styles.statIconDanger}`}>
              <AlertTriangleIcon width={18} height={18} />
            </span>
            <span className={styles.statValue}>{overdueCount}</span>
            <span className={styles.statLabel}>Süresi geçti, güncelleme bekliyor</span>
          </button>
          <div className={`card ${styles.statTile}`}>
            <span className={`${styles.statIcon} ${styles.statIconOk}`}>
              <CheckCircleIcon width={18} height={18} />
            </span>
            <span className={styles.statValue}>{statusCounts.tamamlandi}</span>
            <span className={styles.statLabel}>Tamamlandı</span>
          </div>
          <div className={`card ${styles.statTile}`}>
            <span className={`${styles.statIcon} ${styles.statIconDanger}`}>
              <XCircleIcon width={18} height={18} />
            </span>
            <span className={styles.statValue}>{statusCounts.iptal}</span>
            <span className={styles.statLabel}>İptal</span>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 4 }}>Randevuyu kim oluşturdu</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
            Müşteriyi/randevuyu kim sisteme kaydetti — çalışan iş yükünden farklı, bot üzerinden
            gelenler burada "Bot" olarak görünür.
          </p>
          {counted.length === 0 ? (
            <p className={styles.empty}>Henüz veri yok.</p>
          ) : (
            <div className={styles.donutRow}>
              <DonutChart
                segments={[
                  { value: botCount, color: 'var(--signal)' },
                  { value: staffCount, color: 'var(--line)' },
                ]}
                centerLabel={`%${botPct}`}
                centerSubLabel="Bot"
              />
              <div className={styles.donutLegend}>
                <div className={styles.legendRow}>
                  <span className={`${styles.legendDot} ${styles.legendDotSignal}`} />
                  <span>Bot / Online</span>
                  <strong>{botCount}</strong>
                </div>
                <div className={styles.legendRow}>
                  <span className={`${styles.legendDot} ${styles.legendDotLine}`} />
                  <span>Personel (manuel giriş)</span>
                  <strong>{staffCount}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {bookingUrl && (
          <div className={`card ${styles.linkCard}`}>
            <div className={styles.linkCardText}>
              <span className={styles.linkCardLabel}>Randevu linkiniz</span>
              <span className={styles.linkCardUrl}>{bookingUrl}</span>
            </div>
            <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={copyBookingLink}>
              {linkCopied ? 'Kopyalandı ✓' : 'Kopyala'}
            </button>
          </div>
        )}
      </div>

      {showQuickAddCustomer && <QuickAddCustomerModal onClose={() => setShowQuickAddCustomer(false)} />}
    </div>
  )
}
