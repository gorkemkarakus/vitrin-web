import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'
import QuickAddCustomerModal from '../components/QuickAddCustomerModal'
import DuplicateCustomers from '../components/DuplicateCustomers'
import { visibleDuplicateGroups } from '../lib/duplicateCustomers'
import { useAuth } from '../contexts/AuthContext'
import { SearchIcon, CheckCircleIcon, PlusIcon, FilterIcon } from '../components/icons'
import PageHeader from '../components/PageHeader'
import { currencyWhole as currency } from '../lib/currency'
import { toLocalDateString } from '../lib/date'
import { computeCustomerDebts } from '../lib/customerDebts'
import { segmentForStats, type CustomerSegment } from '../lib/customerSegments'
import styles from './CustomersPage.module.css'

interface Customer {
  id: string
  full_name: string
  phone: string | null
  contact_phone: string | null
  email: string | null
  created_at: string
}

interface Appointment {
  id: string
  customer_id: string | null
  service_id: string | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
  scheduled_at: string
  package_id: string | null
  price_override: number | null
}

interface Service {
  id: string
  price: number | null
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

type Segment = CustomerSegment
type SegmentFilter = 'tumu' | Segment | 'borclu'
type SortBy = 'ad' | 'son_randevu' | 'harcama'
type StatsPeriod = 'tumu' | 'hafta' | 'ay'

const STATS_PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: 'tumu', label: 'tüm zamanlar' },
  { value: 'hafta', label: 'son hafta' },
  { value: 'ay', label: 'son ay' },
]

// Yuzlerce musteriyi tek seferde DOM'a basmak her arama tuş vuruşunda/segment
// degisiminde gozle gorulur bir gecikmeye (yeniden cizim maliyeti) yol
// aciyordu — liste bu sayida parca parca aciliyor.
const PAGE_SIZE = 60

const SEGMENT_TABS: { value: SegmentFilter; label: string }[] = [
  { value: 'tumu', label: 'Tümü' },
  { value: 'borclu', label: 'Borçlu' },
  { value: 'sadik', label: 'Sadık' },
  { value: 'yeni', label: 'Yeni' },
]

const SORT_OPTIONS: { value: SortBy; label: string; short: string }[] = [
  { value: 'ad', label: 'Ada göre (A–Z)', short: 'A-Z' },
  { value: 'son_randevu', label: 'Son randevuya göre', short: 'Son' },
  { value: 'harcama', label: 'Harcamaya göre', short: '₺' },
]

const SEGMENT_BADGE: Record<Segment, { label: string; className: string }> = {
  sadik: { label: 'Sadık', className: 'badgeSadik' },
  yeni: { label: 'Yeni', className: 'badgeYeni' },
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toLocaleUpperCase('tr') ?? '')
      .join('') || '?'
  )
}

function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

// "phone" bazen chatbot kanal kimligi olabilir (ör. Instagram IGSID) —
// gercek numara varsa (contact_phone) her zaman ona oncelik ver.
function customerPhone(c: Customer) {
  return c.contact_phone || c.phone || null
}

export default function CustomersPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [customers, setCustomers] = useState<Customer[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('ay')
  const [searchParams] = useSearchParams()
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>(() =>
    searchParams.get('sekme') === 'borclu' ? 'borclu' : 'tumu',
  )
  const [sortBy, setSortBy] = useState<SortBy>('ad')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [addOpen, setAddOpen] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  // Birlestirmeden sonra listeyi yeniden yuklemek icin.
  const [reloadKey, setReloadKey] = useState(0)

  const sortMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortMenuOpen) return
    function handleClick(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sortMenuOpen])

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const [{ data: custs }, { data: appts }, { data: pkgs }, { data: pays }, { data: svcs }] = await Promise.all([
        fetchAll(() => supabase
          .from('customers')
          .select('id, full_name, phone, contact_phone, email, created_at')
          .order('full_name').order('id')),
        fetchAll(() => supabase
          .from('appointments')
          .select('id, customer_id, service_id, status, scheduled_at, package_id, price_override').order('id')),
        fetchAll(() => supabase.from('service_packages').select('id, customer_id, service_id, total_sessions, session_offset').order('id')),
        fetchAll(() => supabase.from('payments').select('id, customer_id, amount, appointment_id, package_id, paid_at').is('voided_at', null).order('id')),
        supabase.from('services').select('id, price'),
      ])
      setCustomers(custs ?? [])
      setAppointments(appts ?? [])
      setPackages(pkgs ?? [])
      setPayments(pays ?? [])
      setServices(svcs ?? [])
      setLoading(false)
    }
    loadData()
  }, [reloadKey])

  const now = useMemo(() => new Date(), [])
  const currentMonthStart = useMemo(() => monthStart(now), [now])

  const servicePriceById = useMemo(() => new Map(services.map((s) => [s.id, s.price ?? 0])), [services])

  const apptsByCustomer = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const a of appointments) {
      if (!a.customer_id) continue
      const list = map.get(a.customer_id) ?? []
      list.push(a)
      map.set(a.customer_id, list)
    }
    return map
  }, [appointments])

  const paymentsByCustomer = useMemo(() => {
    const map = new Map<string, Payment[]>()
    for (const p of payments) {
      const list = map.get(p.customer_id) ?? []
      list.push(p)
      map.set(p.customer_id, list)
    }
    return map
  }, [payments])

  // Her musteri icin: tamamlanan randevu sayisi, gercek odemelerden toplam
  // harcama, son randevu tarihi (iptal haric) ve bu ay eklenip eklenmedigi —
  // segment siniflandirmasi ve satirdaki "Son Randevu"/"Toplam Harcama"
  // degerleri buradan geliyor.
  const statsByCustomer = useMemo(() => {
    const map = new Map<
      string,
      {
        totalSpend: number
        completedCount: number
        lastApptAt: Date | null
        isNewThisMonth: boolean
      }
    >()
    for (const c of customers) {
      const appts = apptsByCustomer.get(c.id) ?? []
      const completed = appts.filter((a) => a.status === 'tamamlandi')
      const totalSpend = (paymentsByCustomer.get(c.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
      const relevant = appts.filter((a) => a.status !== 'iptal' && a.status !== 'gelmedi')
      const lastApptAt = relevant.length
        ? new Date(Math.max(...relevant.map((a) => new Date(a.scheduled_at).getTime())))
        : null
      const isNewThisMonth = new Date(c.created_at) >= currentMonthStart
      map.set(c.id, {
        totalSpend,
        completedCount: completed.length,
        lastApptAt,
        isNewThisMonth,
      })
    }
    return map
  }, [customers, apptsByCustomer, paymentsByCustomer, currentMonthStart])

  // Musteri basina kalan bakiye: paketler icin, ZATEN olusturulmus seanslarin
  // gercek ucretleri (price_override varsa o, yoksa hizmet fiyati) + henuz
  // acilmamis kalan seanslar icin standart fiyat tahmini, eksi o pakete
  // yapilan odemeler; pakete bagli olmayan tamamlanmis randevular icin de
  // ayni mantik (randevunun gercek ucreti - o randevuya yapilan odemeler).
  const debtByCustomer = useMemo(
    () => computeCustomerDebts(packages, appointments, payments, servicePriceById),
    [packages, payments, appointments, servicePriceById],
  )
  // Yeni (bu ay eklendi) > Sadik (3+ tamamlanan randevu) onceligiyle TEK bir
  // segmente atanir; hicbirine uymayan musteriler sadece "Tumu" sekmesinde
  // gorunur, satirda rozet tasimaz.
  function segmentFor(customerId: string): Segment | null {
    const s = statsByCustomer.get(customerId)
    if (!s) return null
    return segmentForStats(s)
  }

  const counts = useMemo(() => {
    const c = { tumu: customers.length, sadik: 0, yeni: 0, borclu: 0 }
    for (const cust of customers) {
      const seg = segmentFor(cust.id)
      if (seg) c[seg]++
      if ((debtByCustomer.get(cust.id) ?? 0) > 0) c.borclu++
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, statsByCustomer, debtByCustomer])

  // Ust bilgi kartlarindaki "Yeni Musteri" / "Toplam Harcama" icin secilebilir
  // donem — Tumu/Sadik segment rozetleri ve sekme sayaclari bundan BAGIMSIZ
  // (onlar hep tum-zamanlar), sadece bu iki kart donem secimine gore degisir.
  const statsPeriodStart = useMemo(() => {
    if (statsPeriod === 'tumu') return null
    const d = new Date(now)
    d.setDate(d.getDate() - (statsPeriod === 'hafta' ? 7 : 30))
    return d
  }, [statsPeriod, now])

  const newCustomerCountForPeriod = useMemo(
    () => customers.filter((c) => !statsPeriodStart || new Date(c.created_at) >= statsPeriodStart).length,
    [customers, statsPeriodStart],
  )

  const totalSpendForPeriod = useMemo(() => {
    const startStr = statsPeriodStart ? toLocalDateString(statsPeriodStart) : null
    return payments
      .filter((p) => !startStr || p.paid_at >= startStr)
      .reduce((sum, p) => sum + p.amount, 0)
  }, [payments, statsPeriodStart])

  const statsPeriodLabel = STATS_PERIODS.find((p) => p.value === statsPeriod)?.label ?? ''

  // Harcama / yeni musteri kutularina dokununca donem sirayla degisir.
  function cyclePeriod() {
    const i = STATS_PERIODS.findIndex((p) => p.value === statsPeriod)
    setStatsPeriod(STATS_PERIODS[(i + 1) % STATS_PERIODS.length].value)
  }

  const totalDebt = useMemo(() => {
    let sum = 0
    for (const v of debtByCustomer.values()) sum += v
    return sum
  }, [debtByCustomer])

  const q = search.trim().toLowerCase()
  const filteredSorted = useMemo(() => {
    let list = customers.filter(
      (c) => !q || c.full_name.toLowerCase().includes(q) || (customerPhone(c) ?? '').toLowerCase().includes(q),
    )
    if (segmentFilter === 'borclu') list = list.filter((c) => (debtByCustomer.get(c.id) ?? 0) > 0)
    else if (segmentFilter !== 'tumu') list = list.filter((c) => segmentFor(c.id) === segmentFilter)
    list = [...list].sort((a, b) => {
      if (segmentFilter === 'borclu') return (debtByCustomer.get(b.id) ?? 0) - (debtByCustomer.get(a.id) ?? 0)
      if (sortBy === 'ad') return a.full_name.localeCompare(b.full_name, 'tr')
      const sa = statsByCustomer.get(a.id)
      const sb = statsByCustomer.get(b.id)
      if (sortBy === 'harcama') return (sb?.totalSpend ?? 0) - (sa?.totalSpend ?? 0)
      const ta = sa?.lastApptAt?.getTime() ?? -Infinity
      const tb = sb?.lastApptAt?.getTime() ?? -Infinity
      return tb - ta
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, q, segmentFilter, sortBy, statsByCustomer, debtByCustomer])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [q, segmentFilter, sortBy])

  const visibleCustomers = filteredSorted.slice(0, visibleCount)

  // Olasi mukerrer kayitlar (ayni telefon / ayni tam ad) — sadece yonetici
  // birlestirebilir (merge_customers RPC'si de yonetici ister).
  // dupOpen: ekran kapaninca "Farkli kisiler" ile gizlenenler yeniden okunsun.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const duplicateGroups = useMemo(() => (isAdmin ? visibleDuplicateGroups(customers) : []), [customers, isAdmin, dupOpen])
  const apptCountByCustomer = useMemo(
    () => new Map(Array.from(apptsByCustomer.entries()).map(([id, list]) => [id, list.length])),
    [apptsByCustomer],
  )

  if (dupOpen) {
    return (
      <DuplicateCustomers
        groups={duplicateGroups}
        apptCount={apptCountByCustomer}
        onClose={() => setDupOpen(false)}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    )
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        title="Müşteriler"
        action={
          <button type="button" className="hdr-pill-navy" onClick={() => setAddOpen(true)}>
            <PlusIcon width={14} height={14} />
            Ekle
          </button>
        }
      />

      <div className={styles.searchRow}>
        <label className={styles.searchBox}>
          <SearchIcon width={16} height={16} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="İsim veya telefon ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className={styles.filterWrap} ref={sortMenuRef}>
          <button
            type="button"
            className={styles.filterBtn}
            onClick={() => setSortMenuOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={sortMenuOpen}
            aria-label="Sıralama"
          >
            <FilterIcon width={15} height={15} />
            {SORT_OPTIONS.find((o) => o.value === sortBy)?.short}
          </button>
          {sortMenuOpen && (
            <div className={styles.filterMenu} role="listbox">
              {SORT_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={styles.filterMenuItem}
                  onClick={() => {
                    setSortBy(opt.value)
                    setSortMenuOpen(false)
                  }}
                >
                  {opt.label}
                  {sortBy === opt.value && <CheckCircleIcon width={14} height={14} />}
                </button>
              ))}
              <span className={styles.filterMenuTitle}>Harcama / yeni dönemi</span>
              {STATS_PERIODS.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  className={styles.filterMenuItem}
                  onClick={() => {
                    setStatsPeriod(p.value)
                    setSortMenuOpen(false)
                  }}
                >
                  {p.label.charAt(0).toLocaleUpperCase('tr') + p.label.slice(1)}
                  {statsPeriod === p.value && <CheckCircleIcon width={14} height={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{customers.length}</span>
          <span className={styles.statLabel}>Toplam müşteri</span>
        </div>
        <button type="button" className={styles.statCard} onClick={cyclePeriod}>
          <span className={styles.statValue}>{currency.format(totalSpendForPeriod)}</span>
          <span className={styles.statLabel}>Harcama · {statsPeriodLabel}</span>
        </button>
        <button type="button" className={styles.statCard} onClick={cyclePeriod}>
          <span className={styles.statValue}>{newCustomerCountForPeriod}</span>
          <span className={styles.statLabel}>Yeni · {statsPeriodLabel}</span>
        </button>
        <button
          type="button"
          className={`${styles.statCard} ${styles.statCardWarm}`}
          onClick={() => setSegmentFilter('borclu')}
        >
          <span className={styles.statValue}>{currency.format(totalDebt)}</span>
          <span className={styles.statLabel}>{counts.borclu} müşteride borç</span>
        </button>
      </div>

      {!loading && duplicateGroups.length > 0 && (
        <button type="button" className={styles.dupBanner} onClick={() => setDupOpen(true)}>
          <span>{duplicateGroups.length} olası mükerrer kayıt — aynı kişi iki kez kaydedilmiş olabilir</span>
          <span className={styles.dupBannerAction}>İncele ›</span>
        </button>
      )}

      <div className={styles.segmentRow}>
        {SEGMENT_TABS.map((tab) => (
          <button
            type="button"
            key={tab.value}
            className={segmentFilter === tab.value ? styles.segmentBtnActive : styles.segmentBtn}
            onClick={() => setSegmentFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.note}>Yükleniyor…</p>
      ) : filteredSorted.length === 0 ? (
        <div className={styles.emptyCard}>
          <span className={styles.emptyTitle}>{q ? 'Aramana uyan müşteri yok' : 'Bu listede müşteri yok'}</span>
          <span className={styles.emptySub}>
            {q ? 'Adı ya da telefonu farklı yazmayı dene.' : 'Yeni müşteri eklemek için “Ekle”ye dokun.'}
          </span>
        </div>
      ) : (
        <>
          <div className={styles.list}>
            {visibleCustomers.map((c, i) => {
              const seg = segmentFor(c.id)
              const s = statsByCustomer.get(c.id)
              const debt = debtByCustomer.get(c.id) ?? 0
              const phone = customerPhone(c)
              return (
                <button
                  type="button"
                  key={c.id}
                  className={styles.row}
                  onClick={() => navigate(`/musteriler/${c.id}`)}
                >
                  <span className={`${styles.rowInitials} ${styles[`tone${i % 3}`]}`}>{initials(c.full_name)}</span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{c.full_name}</span>
                    {debt > 0 ? (
                      <span className={`${styles.rowPill} ${styles.rowPillWarm}`}>{currency.format(debt)} borç</span>
                    ) : seg ? (
                      <span className={`${styles.rowPill} ${styles[SEGMENT_BADGE[seg].className]}`}>
                        {SEGMENT_BADGE[seg].label}
                      </span>
                    ) : (
                      <span className={styles.rowSub}>{phone ?? 'Telefon yok'}</span>
                    )}
                  </span>
                  <span className={styles.rowSide}>
                    <span className={styles.rowAmount}>{currency.format(s?.totalSpend ?? 0)}</span>
                    <span className={styles.rowDate}>
                      {s?.lastApptAt ? s.lastApptAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          {filteredSorted.length > visibleCustomers.length && (
            <button
              type="button"
              className={styles.loadMoreBtn}
              onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            >
              Daha fazla göster ({filteredSorted.length - visibleCustomers.length} kaldı)
            </button>
          )}
        </>
      )}

      {addOpen && (
        <QuickAddCustomerModal
          onClose={() => setAddOpen(false)}
          onCreated={(created) => navigate(`/musteriler/${created.id}`)}
        />
      )}
    </div>
  )
}
