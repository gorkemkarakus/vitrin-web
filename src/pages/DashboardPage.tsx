import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SetupCard from '../components/SetupCard'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'
import { useAuth } from '../contexts/AuthContext'
import { WalletIcon, ReceiptIcon, ChevronRightIcon, CreditCardIcon } from '../components/icons'
import { currency, currencyWhole } from '../lib/currency'
import { toLocalDateString, timeOf } from '../lib/date'
import { bookingUrl as bookingLink } from '../lib/bookingUrl'
import styles from './DashboardPage.module.css'
import { initials } from '../lib/formatName'

interface Appointment {
  id: string
  customer_id: string | null
  service_id: string | null
  employee_id: string | null
  created_by_user_id: string | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
  source: string
  scheduled_at: string
  duration_minutes: number | null
  package_id: string | null
  price_override: number | null
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
  phone: string | null
  contact_phone: string | null
}

interface Expense {
  id: string
  description: string
  amount: number
  expense_date: string
  due_date: string | null
  is_paid: boolean
}

interface ServicePackage {
  id: string
  customer_id: string
  service_id: string | null
  total_sessions: number
  session_offset: number
}

interface Payment {
  id: string
  customer_id: string
  amount: number
  appointment_id: string | null
  package_id: string | null
  paid_at: string
}

type DateFilter = 'bugun' | 'hafta' | 'ay' | 'ozel'

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'bugun', label: 'Bugün' },
  { value: 'hafta', label: 'Bu hafta' },
  { value: 'ay', label: 'Bu ay' },
  { value: 'ozel', label: 'Özel' },
]

const REVENUE_LABEL: Record<DateFilter, string> = {
  bugun: 'Bugünkü tahsilat',
  hafta: 'Bu haftaki tahsilat',
  ay: 'Bu ayki tahsilat',
  ozel: 'Seçili aralıkta tahsilat',
}

// Ozet blogundaki ilerleme seridi randevu basina bir parca cizer; bu sayinin
// ustunde parcalar okunmayacak kadar inceldigi icin tek bir cubuga doner.
const MAX_PROGRESS_SEGMENTS = 14

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

function money(n: number) {
  return Number.isInteger(n) ? currencyWhole.format(n) : currency.format(n)
}

function relativeLabel(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000)
  if (mins <= 0) return 'şimdi'
  if (mins < 60) return `${mins} dk sonra`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} sa sonra` : `${h} sa ${m} dk sonra`
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
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

  useEffect(() => {
    async function load() {
      const [{ data: appts }, { data: svcs }, { data: profs }, { data: custs }, { data: exps }, { data: pkgs }, { data: pays }] =
        await Promise.all([
          fetchAll(() => supabase
            .from('appointments')
            .select(
              'id, customer_id, service_id, employee_id, created_by_user_id, status, source, scheduled_at, duration_minutes, package_id, price_override',
            ).order('id')),
          supabase.from('services').select('id, name, price'),
          supabase.from('profiles').select('id, full_name'),
          fetchAll(() => supabase.from('customers').select('id, full_name, phone, contact_phone').order('id')),
          fetchAll(() => supabase.from('business_expenses').select('id, description, amount, expense_date, due_date, is_paid').order('id')),
          fetchAll(() => supabase.from('service_packages').select('id, customer_id, service_id, total_sessions, session_offset').order('id')),
          fetchAll(() => supabase.from('payments').select('id, customer_id, amount, appointment_id, package_id, paid_at').is('voided_at', null).order('id')),
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

  const bookingUrl = bookingLink(bookingSlug)

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

  if (loading) return <p className="muted">Yükleniyor…</p>

  const servicePriceById = new Map(services.map((s) => [s.id, s.price ?? 0]))
  const serviceNameById = new Map(services.map((s) => [s.id, s.name]))
  const profileNameById = new Map(profiles.map((p) => [p.id, p.full_name ?? '—']))
  const customerById = new Map(customers.map((c) => [c.id, c]))
  const customerNameById = new Map(customers.map((c) => [c.id, c.full_name ?? 'Müşteri']))

  // ---- Tarih filtresine bagli ozet ----
  const rangedAppointments = appointments.filter((a) => dateWithinRange(a.scheduled_at, rangeStart, rangeEnd))
  const rangedCompleted = rangedAppointments.filter((a) => a.status === 'tamamlandi')
  // Iptal edilenler "bitecek" randevu sayisina girmez.
  const rangedActive = rangedAppointments.filter((a) => a.status !== 'iptal')
  // Kazanc, tamamlanan randevu sayisindan degil gercek odemelerden (payments,
  // paid_at secili araliktaysa) hesaplanir — Muhasebe sayfasiyla ayni mantik.
  const rangeRevenue = payments
    .filter((p) => dateWithinRange(`${p.paid_at}T00:00:00`, rangeStart, rangeEnd))
    .reduce((sum, p) => sum + p.amount, 0)
  // Sadece fiilen odenmis giderler kasadan cikmis sayilir — odenmemisler
  // bu bakiyeyi etkilemez, Yaklasan Odemeler'de gorunmeye devam eder.
  const rangeExpenses = expenses
    .filter((e) => e.is_paid && dateWithinRange(`${e.expense_date}T00:00:00`, rangeStart, rangeEnd))
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
    const standardPrice = pkg.service_id ? (servicePriceById.get(pkg.service_id) ?? 0) : 0
    // Paketin seans basi ucreti ILK seansta belirlenen ozel fiyata
    // kilitlidir (bkz. AppointmentsPage tamamlama akisi) — standart hizmet
    // fiyati sadece hic seans acilmamissa yedek olarak kullanilir.
    const sortedSessions = sessions.slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const price = sortedSessions[0]?.price_override ?? standardPrice
    const knownSessionsTotal = sessions.reduce((sum, a) => sum + (a.price_override ?? price), 0)
    const remainingSessionsEstimate = Math.max(0, pkg.total_sessions - pkg.session_offset - sessions.length) * price
    const expected = knownSessionsTotal + remainingSessionsEstimate
    const paid = payments.filter((p) => p.package_id === pkg.id).reduce((sum, p) => sum + p.amount, 0)
    const remaining = Math.max(0, expected - paid)
    if (remaining > 0) debtByCustomerInRange.set(pkg.customer_id, (debtByCustomerInRange.get(pkg.customer_id) ?? 0) + remaining)
  }
  for (const a of rangedCompleted) {
    if (a.package_id || !a.customer_id) continue
    const expected = a.price_override ?? (a.service_id ? (servicePriceById.get(a.service_id) ?? 0) : 0)
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

  // Odenmemis TUM giderler — tarihi gectiyse bile listeden dusmez, odenene
  // kadar hatirlatmaya devam eder. En cok geciken/en yakin en ustte.
  // Son odeme tarihi (due_date) girilmisse hatirlatma ONA gore yapilir —
  // girilmemisse eskisi gibi expense_date kullanilir.
  function reminderDate(e: Expense) {
    return e.due_date ?? e.expense_date
  }
  const allUnpaidExpenses = expenses
    .filter((e) => !e.is_paid)
    .sort((a, b) => reminderDate(a).localeCompare(reminderDate(b)))
  const upcomingExpenses = allUnpaidExpenses.slice(0, 4)
  const unpaidExpensesTotal = allUnpaidExpenses.reduce((sum, e) => sum + e.amount, 0)

  function daysUntil(dateStr: string) {
    const d = atMidnight(new Date(`${dateStr}T00:00:00`))
    return Math.round((d.getTime() - today.getTime()) / 86400000)
  }

  const todaysAppointments = appointments
    .filter((a) => toLocalDateString(new Date(a.scheduled_at)) === todayStr)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  // "Siradaki": bugunun henuz bitmemis (bekleyen/onayli) ilk randevusu.
  // Baslamis ama suresi dolmamis randevu da siradaki sayilir.
  const nowMs = Date.now()
  const upcomingToday = todaysAppointments.filter(
    (a) =>
      (a.status === 'bekliyor' || a.status === 'onaylandi') &&
      new Date(a.scheduled_at).getTime() + (a.duration_minutes ?? 30) * 60000 > nowMs,
  )
  const nextAppt = upcomingToday[0] ?? null
  const laterAppts = upcomingToday.slice(1, 5)

  const nextCustomer = nextAppt?.customer_id ? customerById.get(nextAppt.customer_id) : undefined
  const nextName = nextCustomer?.full_name ?? 'Müşteri'
  const nextPhone = nextCustomer?.phone ?? nextCustomer?.contact_phone ?? null
  const nextPrice = nextAppt
    ? (nextAppt.price_override ?? (nextAppt.service_id ? (servicePriceById.get(nextAppt.service_id) ?? 0) : 0))
    : 0
  const nextDetail = nextAppt
    ? [
        nextAppt.service_id ? serviceNameById.get(nextAppt.service_id) : null,
        nextAppt.employee_id ? profileNameById.get(nextAppt.employee_id) : null,
        nextPrice > 0 ? money(nextPrice) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  const segTotal = rangedActive.length
  const segDone = rangedCompleted.length

  return (
    <div className={styles.wrap}>
      {/* ---- Lacivert ozet blogu (ust bar ile ayni renk, onun devami) ---- */}
      <section className={styles.hero}>
        <div className={styles.heroRow}>
          <div className={styles.heroMain}>
            <span className={styles.heroLabel}>{REVENUE_LABEL[dateFilter]}</span>
            <span className={styles.heroValue}>{money(rangeRevenue)}</span>
          </div>
          <div className={styles.heroSide}>
            <span className={styles.heroCount}>
              {segDone}
              <span className={styles.heroCountTotal}>/{segTotal}</span>
            </span>
            <span className={styles.heroLabel}>randevu bitti</span>
          </div>
        </div>
        {segTotal === 0 && (
          <div className={styles.heroBar} aria-hidden="true">
            <span style={{ width: 0 }} />
          </div>
        )}
        {segTotal > 0 && segTotal <= MAX_PROGRESS_SEGMENTS && (
          <div className={styles.heroSegs} aria-hidden="true">
            {Array.from({ length: segTotal }, (_, i) => (
              <span key={i} className={i < segDone ? styles.heroSegDone : styles.heroSeg} />
            ))}
          </div>
        )}
        {segTotal > MAX_PROGRESS_SEGMENTS && (
          <div className={styles.heroBar} aria-hidden="true">
            <span style={{ width: `${Math.round((segDone / segTotal) * 100)}%` }} />
          </div>
        )}
        {revenueChangePct !== null && (
          <span className={styles.heroHint}>
            Önceki döneme göre %{Math.abs(revenueChangePct)} {revenueChangePct >= 0 ? 'fazla' : 'az'}
          </span>
        )}
      </section>

      <div className={styles.sheet}>
        <SetupCard />

        {/* ---- Donem secimi ---- */}
        <div className={styles.segmented} role="group" aria-label="Dönem">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={dateFilter === f.value ? styles.segmentActive : styles.segment}
              aria-pressed={dateFilter === f.value}
              onClick={() => setDateFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {dateFilter === 'ozel' && (
          <div className={`card ${styles.customRangeRow}`}>
            <div className="field field-flush">
              <label htmlFor="homeRangeStart">Başlangıç</label>
              <input id="homeRangeStart" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div className="field field-flush">
              <label htmlFor="homeRangeEnd">Bitiş</label>
              <input id="homeRangeEnd" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </div>
        )}

        {/* ---- Siradaki randevu ---- */}
        {nextAppt ? (
          <div className={styles.nextCard}>
            <div className={styles.nextTop}>
              <span className={styles.nextEyebrow}>Sıradaki · {relativeLabel(nextAppt.scheduled_at)}</span>
              <span className={styles.nextTime}>{timeOf(nextAppt.scheduled_at)}</span>
            </div>
            <div className={styles.nextWho}>
              <span className={styles.nextAvatar}>{initials(nextName)}</span>
              <div className={styles.nextText}>
                <span className={styles.nextName}>{nextName}</span>
                {nextDetail && <span className={styles.nextSub}>{nextDetail}</span>}
              </div>
            </div>
            <div className={styles.nextActions}>
              {/* Geldi: musteri geldi, randevuyu kapatma (tamamla + odeme)
                  ekranini acar. */}
              <button
                type="button"
                className={styles.nextBtnPrimary}
                onClick={() => navigate(`/randevular?tarih=${todayStr}&tamamla=${nextAppt.id}`)}
              >
                Geldi
              </button>
              <button
                type="button"
                className={styles.nextBtn}
                disabled={!nextAppt.customer_id}
                onClick={() => navigate(`/musteriler/${nextAppt.customer_id}`)}
              >
                Ödeme al
              </button>
              {nextPhone ? (
                <a className={styles.nextBtn} href={`tel:${nextPhone}`}>
                  Ara
                </a>
              ) : (
                <button type="button" className={styles.nextBtn} disabled>
                  Ara
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.nextEmpty}>
            <div className={styles.nextText}>
              <span className={styles.nextName}>Bugün sırada randevu yok</span>
              <span className={styles.nextSub}>
                {todaysAppointments.length > 0 ? 'Bugünün randevuları tamamlandı.' : 'Bugün için kayıtlı randevu bulunmuyor.'}
              </span>
            </div>
            <button type="button" className={styles.nextBtnPrimary} onClick={() => navigate('/randevular?yeni=1')}>
              Yeni randevu
            </button>
          </div>
        )}

        {/* ---- Bekleyen tahsilat seridi ---- */}
        {totalDebtInRange > 0 && (
          <button type="button" className={styles.debtBanner} onClick={() => navigate('/musteriler')}>
            <span className={styles.debtIcon}>
              <CreditCardIcon width={18} height={18} />
            </span>
            <span className={styles.debtText}>
              <span className={styles.debtMain}>{money(totalDebtInRange)} bekleyen tahsilat</span>
              <span className={styles.debtSub}>{debtByCustomerInRange.size} müşteriden</span>
            </span>
            <ChevronRightIcon width={18} height={18} />
          </button>
        )}

        {/* ---- Gunun kalan randevulari ---- */}
        {laterAppts.length > 0 && (
          <div className={styles.block}>
            <div className={styles.blockHead}>
              <h2>Sonrası</h2>
              <button type="button" className={styles.blockLink} onClick={() => navigate(`/randevular?tarih=${todayStr}`)}>
                Takvim
              </button>
            </div>
            <div className={styles.laterGrid}>
              {laterAppts.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className={styles.laterCard}
                  onClick={() => navigate(`/randevular?tarih=${todayStr}`)}
                >
                  <span className={styles.laterTime}>{timeOf(a.scheduled_at)}</span>
                  <span className={styles.laterName}>{customerNameById.get(a.customer_id ?? '') ?? 'Müşteri'}</span>
                  <span className={styles.laterService}>{a.service_id ? (serviceNameById.get(a.service_id) ?? '—') : '—'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- Kazanc + odenmemis giderler ---- */}
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <span className={styles.tileLabel}>Kazanç</span>
            <span className={styles.tileValue}>{money(rangeBalance)}</span>
            <span className={styles.tileHint}>Gelir − gider</span>
          </div>
          <button type="button" className={styles.tile} onClick={() => navigate('/giderler')}>
            <span className={styles.tileLabel}>Yaklaşan ödemeler</span>
            <span className={`${styles.tileValue} ${allUnpaidExpenses.length > 0 ? styles.tileValueWarm : ''}`}>
              {money(unpaidExpensesTotal)}
            </span>
            <span className={styles.tileHint}>{allUnpaidExpenses.length} ödeme</span>
          </button>
        </div>

        {/* ---- Yaklasan odemeler ---- */}
        <div className={styles.listCard}>
          <div className={styles.blockHead}>
            <h2>Yaklaşan ödemeler</h2>
            <button type="button" className={styles.blockLink} onClick={() => navigate('/giderler')}>
              Tümü
            </button>
          </div>
          {upcomingExpenses.length === 0 ? (
            <p className={styles.empty}>Ödenmemiş gider yok.</p>
          ) : (
            <div className={styles.paymentList}>
              {upcomingExpenses.map((e) => {
                const left = daysUntil(reminderDate(e))
                return (
                  <div className={styles.paymentRow} key={e.id}>
                    <span className={styles.paymentIcon}>
                      <ReceiptIcon width={16} height={16} />
                    </span>
                    <span className={styles.paymentText}>
                      <span className={styles.paymentDesc}>{e.description}</span>
                      <span className={left <= 3 ? styles.paymentDaysUrgent : styles.paymentDays}>
                        {e.due_date ? 'Son ödeme ' : ''}
                        {new Date(`${reminderDate(e)}T00:00:00`).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'long',
                        })}
                        {' · '}
                        {left < 0 ? `${Math.abs(left)} gün geçti` : left === 0 ? 'bugün' : `${left} gün kaldı`}
                      </span>
                    </span>
                    <span className={styles.paymentAmount}>{money(e.amount)}</span>
                  </div>
                )
              })}
            </div>
          )}
          <button type="button" className={`btn-secondary ${styles.addPaymentBtn}`} onClick={() => navigate('/giderler?yeni=1')}>
            Ödeme ekle
          </button>
        </div>

        {/* ---- Bekleyen tahsilatlar (musteri borclari) ---- */}
        <div className={styles.listCard}>
          <div className={styles.blockHead}>
            <h2>Bekleyen tahsilatlar</h2>
            <button type="button" className={styles.blockLink} onClick={() => navigate('/musteriler')}>
              Tümü
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
                >
                  <span className={`${styles.paymentIcon} ${styles.paymentIconWarm}`}>
                    <WalletIcon width={16} height={16} />
                  </span>
                  <span className={styles.paymentText}>
                    <span className={styles.paymentDesc}>{customerNameById.get(customerId) ?? 'Müşteri'}</span>
                  </span>
                  <span className={styles.paymentAmountWarm}>{money(amount)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {bookingUrl && (
          <div className={styles.linkCard}>
            <div className={styles.linkCardText}>
              <span className={styles.linkCardLabel}>Randevu linkiniz</span>
              <span className={styles.linkCardUrl}>{bookingUrl}</span>
            </div>
            <button type="button" className={styles.linkCardBtn} onClick={copyBookingLink}>
              {linkCopied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
