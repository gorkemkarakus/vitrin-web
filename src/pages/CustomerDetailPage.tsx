import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPersonName, initials } from '../lib/formatName'
import { currency } from '../lib/currency'
import Select from '../components/Select'
import { phoneLengthError, customerPhone } from '../lib/phone'
import { ChevronRightIcon, PhoneIcon, WalletIcon, PencilIcon, TrashIcon, CalendarIcon, MessagesIcon } from '../components/icons'
import { segmentForStats } from '../lib/customerSegments'
import { toLocalDateString } from '../lib/date'
import styles from './CustomerDetailPage.module.css'
import { PAYMENT_METHOD_OPTIONS } from '../lib/paymentMethods'

interface Customer {
  id: string
  full_name: string
  phone: string | null
  contact_phone: string | null
  email: string | null
  notes: string | null
  created_at: string
}

interface Service {
  id: string
  name: string
  price: number | null
}

interface Appointment {
  id: string
  service_id: string | null
  employee_id: string | null
  scheduled_at: string
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
  package_id: string | null
  price_override: number | null
}

interface Employee {
  id: string
  full_name: string | null
}

interface ServicePackage {
  id: string
  service_id: string | null
  total_sessions: number
  session_offset: number
  status: 'aktif' | 'tamamlandi'
  created_at: string
}

interface Payment {
  id: string
  amount: number
  method: 'nakit' | 'kart' | 'havale' | 'diger' | 'bakiye'
  paid_at: string
  appointment_id: string | null
  package_id: string | null
  note: string | null
  created_by_user_id: string | null
  voided_at: string | null
}

const METHOD_LABEL: Record<Payment['method'], string> = {
  nakit: 'Nakit',
  kart: 'Kredi Kartı',
  havale: 'Havale / EFT',
  diger: 'Diğer',
  bakiye: 'Bakiyeden',
}
const SESSION_STATUS_LABEL: Record<Appointment['status'], string> = {
  bekliyor: 'Bekliyor',
  onaylandi: 'Onaylandı',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
  gelmedi: 'Gelmedi',
}

type DetailTab = 'ozet' | 'randevular' | 'odemeler' | 'paket'

const DETAIL_TABS: { value: DetailTab; label: string }[] = [
  { value: 'ozet', label: 'Özet' },
  { value: 'randevular', label: 'Randevular' },
  { value: 'odemeler', label: 'Ödemeler' },
  { value: 'paket', label: 'Paket' },
]

// remaining = beklenen - odenen. Pozitifse borc, negatifse musteri fazla
// odemis (alacakli) — bu durum sessizce "Ödendi" diye gosterilmek yerine
// acikca "+X fazla odendi" olarak isaretleniyor (bildirilen sorun).
function remainingLabel(remaining: number): { text: string; positive: boolean } {
  if (remaining > 0) return { text: `Kalan ${currency.format(remaining)}`, positive: false }
  if (remaining < 0) return { text: `+${currency.format(-remaining)} fazla ödendi`, positive: true }
  return { text: 'Ödendi', positive: true }
}

function humanizeDuration(days: number): string {
  if (days < 1) return 'Bugün'
  if (days < 30) return `${Math.round(days)} gün`
  if (days < 365) return `${Math.round(days / 30)} ay`
  const years = Math.floor(days / 365)
  const months = Math.round((days % 365) / 30)
  return months > 0 ? `${years} yıl ${months} ay` : `${years} yıl`
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, can } = useAuth()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payTarget, setPayTarget] = useState('')
  const [payNote, setPayNote] = useState('')
  const [paySubmitting, setPaySubmitting] = useState(false)

  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editMethod, setEditMethod] = useState('nakit')
  const [editDate, setEditDate] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [editCustomerOpen, setEditCustomerOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editCustomerSubmitting, setEditCustomerSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('ozet')

  async function loadData() {
    if (!id) return
    setLoading(true)
    const [{ data: cust }, { data: appts }, { data: pkgs }, { data: pays }, { data: svcs }, { data: emps }] = await Promise.all([
      supabase
        .from('customers')
        .select('id, full_name, phone, contact_phone, email, notes, created_at')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('appointments')
        .select('id, service_id, employee_id, scheduled_at, status, package_id, price_override')
        .eq('customer_id', id)
        .order('scheduled_at', { ascending: false }),
      supabase
        .from('service_packages')
        .select('id, service_id, total_sessions, session_offset, status, created_at')
        .eq('customer_id', id),
      supabase
        .from('payments')
        .select('id, amount, method, paid_at, appointment_id, package_id, note, created_by_user_id, voided_at')
        .eq('customer_id', id)
        .order('paid_at', { ascending: false }),
      supabase.from('services').select('id, name, price'),
      supabase.from('profiles').select('id, full_name'),
    ])
    setCustomer(cust ?? null)
    setAppointments(appts ?? [])
    setPackages(pkgs ?? [])
    setPayments(pays ?? [])
    setServices(svcs ?? [])
    setEmployees(emps ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])
  const now = useMemo(() => new Date(), [])

  // Iptal edilen (voided_at dolu) odemeler listede "Silindi" olarak kalir
  // ama tum mali hesaplardan (kalan odeme, paket ilerlemesi, toplam odenen)
  // haric tutulur — sanki hic yapilmamis gibi.
  const activePayments = useMemo(() => payments.filter((p) => !p.voided_at), [payments])

  // Paket bazinda: beklenen = ZATEN olusturulmus seanslarin gercek ucretleri
  // (price_override varsa o, yoksa hizmet fiyati) + henuz randevusu
  // acilmamis kalan seanslar icin standart fiyat tahmini. Boylece bir
  // seansta ekstra bakim/boya gibi sebeplerle fiyat degisirse (bildirilen
  // ihtiyac) paketin toplam beklenen tutari da buna gore guncelleniyor.
  // Odenen = o pakete bagli tum odemelerin toplami, kalan = beklenen - odenen.
  const packageStats = useMemo(
    () =>
      packages.map((pkg) => {
        const svc = pkg.service_id ? serviceById.get(pkg.service_id) : undefined
        const sessions = appointments.filter((a) => a.package_id === pkg.id)
        // session_offset: paket, tamamlama ekraninda "kaçıncı seans" 1'den
        // buyuk girilerek olusturulmus olabilir (musteri sistem disinda
        // zaten bazi seanslari yapmis) — tamamlanan/kalan seans sayilari bu
        // offset'i de icermeli, yoksa "kalan" hem seans hem tutar olarak
        // fazla gorunur.
        const completed = sessions.filter((a) => a.status === 'tamamlandi').length + pkg.session_offset
        // Paketin seans basi ucreti ILK seansta belirlenen ozel fiyata
        // kilitlidir (bkz. AppointmentsPage tamamlama akisi) — standart
        // hizmet fiyati sadece hic seans acilmamissa yedek olarak kullanilir.
        const sortedSessions = sessions.slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
        const sessionPrice = sortedSessions[0]?.price_override ?? svc?.price ?? 0
        const knownSessionsTotal = sessions.reduce((sum, a) => sum + (a.price_override ?? sessionPrice), 0)
        const remainingSessionsEstimate =
          Math.max(0, pkg.total_sessions - pkg.session_offset - sessions.length) * sessionPrice
        const expected = knownSessionsTotal + remainingSessionsEstimate
        const paid = activePayments.filter((p) => p.package_id === pkg.id).reduce((s, p) => s + p.amount, 0)
        return {
          pkg,
          svc,
          sessions: sortedSessions,
          sessionCount: sessions.length,
          completed,
          expected,
          paid,
          remaining: expected - paid,
        }
      }),
    [packages, appointments, activePayments, serviceById],
  )

  // Pakete bagli olmayan ama tamamlanmis randevular icin de bakiye takibi.
  const standaloneAppts = useMemo(
    () =>
      appointments
        .filter((a) => !a.package_id && a.status === 'tamamlandi')
        .map((a) => {
          const svc = a.service_id ? serviceById.get(a.service_id) : undefined
          const expected = a.price_override ?? svc?.price ?? 0
          const paid = activePayments.filter((p) => p.appointment_id === a.id).reduce((s, p) => s + p.amount, 0)
          return { appt: a, svc, expected, paid, remaining: expected - paid }
        }),
    [appointments, activePayments, serviceById],
  )

  const totalPaid = useMemo(() => activePayments.reduce((s, p) => s + p.amount, 0), [activePayments])
  const totalRemaining = useMemo(
    () =>
      packageStats.reduce((s, p) => s + Math.max(0, p.remaining), 0) +
      standaloneAppts.reduce((s, a) => s + Math.max(0, a.remaining), 0),
    [packageStats, standaloneAppts],
  )

  const paymentTargetOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = []
    for (const p of packageStats) {
      if (p.remaining > 0) {
        opts.push({
          value: `pkg:${p.pkg.id}`,
          label: `${p.svc?.name ?? 'Paket'} (${p.completed}/${p.pkg.total_sessions} seans) — kalan ${currency.format(p.remaining)}`,
        })
      }
    }
    for (const a of standaloneAppts) {
      if (a.remaining > 0) {
        opts.push({
          value: `appt:${a.appt.id}`,
          label: `${a.svc?.name ?? 'Randevu'} — ${new Date(a.appt.scheduled_at).toLocaleDateString('tr-TR')} — kalan ${currency.format(a.remaining)}`,
        })
      }
    }
    return opts
  }, [packageStats, standaloneAppts])

  const insights = useMemo(() => {
    // appointments sorgusu scheduled_at'e gore azalan sirali geliyor, yani
    // index 0 = en yeni
    const completedAppts = appointments.filter((a) => a.status === 'tamamlandi')
    const totalVisits = completedAppts.length

    let avgIntervalDays: number | null = null
    if (completedAppts.length >= 2) {
      const mostRecent = new Date(completedAppts[0].scheduled_at).getTime()
      const oldest = new Date(completedAppts[completedAppts.length - 1].scheduled_at).getTime()
      avgIntervalDays = (mostRecent - oldest) / (completedAppts.length - 1) / 86400000
    }

    function pickFavorite(getKey: (a: Appointment) => string | null): string | null {
      const tally = new Map<string, { count: number; mostRecentIndex: number }>()
      completedAppts.forEach((a, i) => {
        const key = getKey(a)
        if (!key) return
        const cur = tally.get(key)
        if (cur) cur.count++
        else tally.set(key, { count: 1, mostRecentIndex: i })
      })
      let bestId: string | null = null
      let best: { count: number; mostRecentIndex: number } | null = null
      for (const [key, v] of tally) {
        if (!best || v.count > best.count || (v.count === best.count && v.mostRecentIndex < best.mostRecentIndex)) {
          best = v
          bestId = key
        }
      }
      return bestId
    }

    const favoriteServiceId = pickFavorite((a) => a.service_id)
    const favoriteEmployeeId = pickFavorite((a) => a.employee_id)
    const favoriteServiceName = favoriteServiceId ? serviceById.get(favoriteServiceId)?.name ?? null : null
    const favoriteEmployeeName = favoriteEmployeeId ? employeeById.get(favoriteEmployeeId)?.full_name ?? null : null

    const lastRelevantAppt = appointments.find((a) => a.status !== 'iptal' && a.status !== 'gelmedi') ?? null
    let lastVisitLabel = '—'
    if (lastRelevantAppt) {
      const t = new Date(lastRelevantAppt.scheduled_at).getTime()
      if (t > now.getTime()) lastVisitLabel = 'Yaklaşan randevu var'
      else {
        const daysAgo = (now.getTime() - t) / 86400000
        lastVisitLabel = daysAgo < 1 ? 'Bugün' : `${humanizeDuration(daysAgo)} önce`
      }
    }

    const tenureLabel = customer ? humanizeDuration((now.getTime() - new Date(customer.created_at).getTime()) / 86400000) : '—'

    return {
      lastVisitLabel,
      favoriteServiceName,
      favoriteEmployeeName,
      avgIntervalLabel: avgIntervalDays !== null ? `${Math.round(avgIntervalDays)} gün` : '—',
      totalVisits,
      tenureLabel,
    }
  }, [appointments, customer, serviceById, employeeById, now])

  async function submitPayment(e: FormEvent) {
    e.preventDefault()
    const amount = Number(payAmount)
    if (!amount || amount <= 0 || !id || !payMethod) return
    setError(null)
    setPaySubmitting(true)
    try {
      const package_id = payTarget.startsWith('pkg:') ? payTarget.slice(4) : null
      const appointment_id = payTarget.startsWith('appt:') ? payTarget.slice(5) : null
      const { error: insertErr } = await supabase.from('payments').insert({
        // paid_at bir date kolonu; varsayilani sunucunun (UTC) CURRENT_DATE'i —
        // Turkiye'de 00:00-03:00 arasi alinan odeme bir onceki gune yazilirdi.
        paid_at: toLocalDateString(new Date()),
        business_id: profile?.business_id,
        customer_id: id,
        appointment_id,
        package_id,
        amount,
        method: payMethod,
        note: payNote.trim() || null,
        created_by_user_id: profile?.id,
      })
      if (insertErr) {
        setError('Ödeme kaydedilemedi, tekrar deneyin.')
        return
      }
      setPayModalOpen(false)
      setPayAmount('')
      setPayMethod('')
      setPayTarget('')
      setPayNote('')
      await loadData()
    } catch {
      setError('Sunucuya ulaşılamadı, tekrar deneyin.')
    } finally {
      setPaySubmitting(false)
    }
  }

  // Iptal edilen bir odeme hicbir yerde tekrar duzenlenemez/iptal
  // edilemez — voided_at set edildikten sonra bu satirin tek gorevi
  // gecmiste var oldugunu gostermek.
  async function voidPayment(p: Payment) {
    const ok = window.confirm(
      `${currency.format(p.amount)} tutarındaki ödemeyi iptal etmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz; ödeme "Silindi" olarak listede kalır ama tüm bakiye hesaplarından düşer.`,
    )
    if (!ok) return
    try {
      const { error: updateErr } = await supabase
        .from('payments')
        .update({ voided_at: new Date().toISOString() })
        .eq('id', p.id)
      if (updateErr) {
        window.alert('Ödeme iptal edilemedi, tekrar deneyin.')
        return
      }
      await loadData()
    } catch {
      window.alert('Sunucuya ulaşılamadı, tekrar deneyin.')
    }
  }

  // Admin herhangi bir odemeyi duzenleyebilir; normal kullanici sadece
  // kendi kaydettigi odemeyi (RLS'teki payments_update_user ile ayni kural).
  // "bakiye" turu odemeler musteri kredi bakiyesinden otomatik dusulen
  // sistem kayitlari — elle duzenlemeye acmiyoruz.
  function canEditPayment(p: Payment) {
    if (p.method === 'bakiye') return false
    return profile?.role === 'admin' || p.created_by_user_id === profile?.id
  }

  function openEditPayment(p: Payment) {
    setError(null)
    setEditingPayment(p)
    setEditAmount(String(p.amount))
    setEditMethod(p.method === 'bakiye' ? 'nakit' : p.method)
    setEditDate(p.paid_at)
    setEditNote(p.note ?? '')
  }

  async function submitEditPayment(e: FormEvent) {
    e.preventDefault()
    if (!editingPayment) return
    const amount = Number(editAmount)
    if (!amount || amount <= 0) return
    setError(null)
    setEditSubmitting(true)
    try {
      const { error: updateErr } = await supabase
        .from('payments')
        .update({ amount, method: editMethod, paid_at: editDate, note: editNote.trim() || null })
        .eq('id', editingPayment.id)
      if (updateErr) {
        setError('Ödeme güncellenemedi, tekrar deneyin.')
        return
      }
      setEditingPayment(null)
      await loadData()
    } catch {
      setError('Sunucuya ulaşılamadı, tekrar deneyin.')
    } finally {
      setEditSubmitting(false)
    }
  }

  function openEditCustomer() {
    if (!customer) return
    setError(null)
    setEditName(customer.full_name)
    setEditPhone(customerPhone(customer) ?? '')
    setEditEmail(customer.email ?? '')
    setEditNotes(customer.notes ?? '')
    setEditCustomerOpen(true)
  }

  async function submitEditCustomer(e: FormEvent) {
    e.preventDefault()
    if (!editName.trim() || !id) return
    if (phoneLengthError(editPhone)) return
    setError(null)
    setEditCustomerSubmitting(true)
    try {
      const { error: updateErr } = await supabase
        .from('customers')
        .update({
          full_name: formatPersonName(editName),
          contact_phone: editPhone.trim() || null,
          email: editEmail.trim() || null,
          notes: editNotes.trim() || null,
        })
        .eq('id', id)
      if (updateErr) {
        setError('Müşteri güncellenemedi, tekrar deneyin.')
        return
      }
      setEditCustomerOpen(false)
      await loadData()
    } catch {
      setError('Sunucuya ulaşılamadı, tekrar deneyin.')
    } finally {
      setEditCustomerSubmitting(false)
    }
  }

  // KVKK silme talebi: kayit silinmez (odeme/paket gecmisi CASCADE ile
  // giderdi), ad/telefon/e-posta/not temizlenir; randevu ve odemeler isimsiz
  // kalir. Tek islemde anonymize_customer RPC'siyle.
  async function anonymizeCustomer() {
    if (!id || !customer) return
    const ok = window.confirm(
      `${customer.full_name} adlı müşterinin kişisel verileri (ad, telefon, e-posta, not) silinsin mi?\n\n` +
        'Randevu ve ödeme kayıtları kasa geçmişi bozulmasın diye isimsiz olarak kalır. Bu işlem geri alınamaz.',
    )
    if (!ok) return
    setEditCustomerSubmitting(true)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('anonymize_customer', { p_customer_id: id })
    setEditCustomerSubmitting(false)
    if (rpcErr) {
      const missing = /could not find|does not exist/i.test(rpcErr.message)
      setError(missing ? 'Bu özellik için veritabanı güncellemesi bekleniyor.' : 'Silinemedi: ' + rpcErr.message)
      return
    }
    setEditCustomerOpen(false)
    await loadData()
  }

  if (loading) return <p className={styles.empty}>Yükleniyor…</p>
  if (!customer) return <p className={styles.empty}>Müşteri bulunamadı.</p>

  const phone = customerPhone(customer)
  const activePackages = packageStats.filter((p) => p.pkg.status !== 'tamamlandi')

  function renderPackage(p: (typeof packageStats)[number], withSessions: boolean) {
    const total = Math.max(1, p.pkg.total_sessions)
    const rem = remainingLabel(Math.max(0, p.remaining))
    return (
      <div key={p.pkg.id} className={styles.packageCard}>
        <div className={styles.packageTop}>
          <span className={styles.packageName}>
            {p.svc?.name ?? 'Hizmet'}
            {p.pkg.status === 'tamamlandi' && <span className={styles.packageDoneBadge}>Bitti</span>}
          </span>
          <span className={styles.packageCount}>
            {p.completed}/{p.pkg.total_sessions} seans
          </span>
        </div>
        <div className={styles.packageBar}>
          <span style={{ width: `${Math.min(100, (p.completed / total) * 100)}%` }} />
        </div>
        <div className={styles.packageBottom}>
          <span>Toplam {currency.format(p.expected)}</span>
          <span className={rem.positive ? styles.textOk : styles.textWarm}>{rem.text}</span>
        </div>
        {withSessions && p.sessions.length > 0 && (
          <div className={styles.sessionList}>
            {p.sessions.map((s, i) => (
              <div key={s.id} className={styles.sessionRow}>
                <span className={styles.sessionRowLabel}>{i + 1 + p.pkg.session_offset}. seans</span>
                <span className={styles.sessionRowDate}>
                  {new Date(s.scheduled_at).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <span className={`${styles.statusPill} ${styles[`status_${s.status}`]}`}>
                  {SESSION_STATUS_LABEL[s.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const segment = segmentForStats({
    isNewThisMonth: new Date(customer.created_at) >= monthStart,
    completedCount: insights.totalVisits,
  })
  const rawPhone = customer.phone

  return (
    <div className={styles.wrap}>
      <div className={styles.topRow}>
        <button type="button" className={styles.backLink} onClick={() => navigate('/musteriler')}>
          <ChevronRightIcon width={16} height={16} className={styles.backIcon} />
          Müşteriler
        </button>
        <button type="button" className="hdr-pill" onClick={openEditCustomer}>
          Düzenle
        </button>
      </div>

      <div className={styles.hero}>
        <span className={styles.heroAvatar}>{initials(customer.full_name)}</span>
        <span className={styles.heroName}>{customer.full_name}</span>
        <span className={styles.heroSub}>
          {[phone, customer.email].filter(Boolean).join(' · ') || 'İletişim bilgisi yok'}
        </span>
        {segment && (
          <span className={styles.heroBadge}>{segment === 'sadik' ? 'Sadık müşteri' : 'Yeni müşteri'}</span>
        )}
      </div>

      <div className={styles.actions}>
        {phone ? (
          <a className={styles.actionBtn} href={`tel:${phone}`}>
            <PhoneIcon width={18} height={18} />
            Ara
          </a>
        ) : (
          <button type="button" className={styles.actionBtn} onClick={openEditCustomer}>
            <PhoneIcon width={18} height={18} />
            Ara
          </button>
        )}
        <button
          type="button"
          className={styles.actionBtn}
          disabled={!(rawPhone || phone) || !can('mesajlar')}
          onClick={() => navigate(`/mesajlar?musteri=${customer.id}`)}
        >
          <MessagesIcon width={18} height={18} />
          Mesaj
        </button>
        <button type="button" className={styles.actionBtn} onClick={() => navigate('/randevular?yeni=1')}>
          <CalendarIcon width={18} height={18} />
          Randevu
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          disabled={!can('odeme_al')}
          onClick={() => {
            setError(null)
            setPayModalOpen(true)
          }}
        >
          <WalletIcon width={18} height={18} />
          Ödeme
        </button>
      </div>

      <div className={styles.tabs}>
        {DETAIL_TABS.map((t) => (
          <button
            type="button"
            key={t.value}
            className={tab === t.value ? styles.tabActive : styles.tab}
            onClick={() => setTab(t.value)}
          >
            {t.label}
            {t.value === 'randevular' && appointments.length > 0 && (
              <span className={styles.tabCount}> {appointments.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'ozet' && (
        <>
          <div className={styles.balanceCard}>
            <div className={styles.balanceCol}>
              <span className={styles.balanceLabel}>Toplam ödenen</span>
              <span className={styles.balanceValue}>{currency.format(totalPaid)}</span>
            </div>
            <div className={`${styles.balanceCol} ${styles.balanceColDivided}`}>
              <span className={styles.balanceLabel}>Kalan ödeme</span>
              <span className={totalRemaining > 0 ? `${styles.balanceValue} ${styles.textWarm}` : `${styles.balanceValue} ${styles.textOk}`}>
                {totalRemaining > 0 ? currency.format(totalRemaining) : 'Borç yok'}
              </span>
            </div>
          </div>

          <div className={styles.listCard}>
            <div className={styles.insightRow}>
              <span className={styles.insightLabel}>Son ziyaret</span>
              <span className={styles.insightValue}>{insights.lastVisitLabel}</span>
            </div>
            <div className={styles.insightRow}>
              <span className={styles.insightLabel}>Favori hizmet</span>
              <span className={styles.insightValue}>{insights.favoriteServiceName ?? '—'}</span>
            </div>
            <div className={styles.insightRow}>
              <span className={styles.insightLabel}>Favori çalışan</span>
              <span className={styles.insightValue}>
                {insights.favoriteEmployeeName ? insights.favoriteEmployeeName.split(' ')[0] : '—'}
              </span>
            </div>
            <div className={styles.insightRow}>
              <span className={styles.insightLabel}>Ziyaret sıklığı</span>
              <span className={styles.insightValue}>
                {insights.avgIntervalLabel === '—' ? '—' : `${insights.avgIntervalLabel.replace(' gün', '')} günde bir`}
              </span>
            </div>
            <div className={styles.insightRow}>
              <span className={styles.insightLabel}>Toplam ziyaret</span>
              <span className={styles.insightValue}>{insights.totalVisits}</span>
            </div>
          </div>

          {activePackages.map((p) => (
            <button type="button" key={p.pkg.id} className={styles.pkgMini} onClick={() => setTab('paket')}>
              <span className={styles.pkgMiniTile}>
                {p.completed}/{p.pkg.total_sessions}
              </span>
              <span className={styles.pkgMiniText}>
                <span className={styles.pkgMiniName}>{p.svc?.name ?? 'Hizmet'} paketi</span>
                <span className={styles.pkgMiniSub}>
                  {Math.max(0, p.pkg.total_sessions - p.completed)} seans kaldı ·{' '}
                  {new Date(p.pkg.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}’da alındı
                </span>
              </span>
            </button>
          ))}

          <button type="button" className={customer.notes ? styles.noteCard : styles.noteCardEmpty} onClick={openEditCustomer}>
            <span className={styles.noteLabel}>Müşteri notu</span>
            <span className={styles.noteText}>
              {customer.notes || 'Alerji, boya formülü, tercihler… Not eklemek için dokun.'}
            </span>
          </button>
        </>
      )}

      {tab === 'randevular' &&
        (appointments.length === 0 ? (
          <p className={styles.empty}>Henüz randevu yok.</p>
        ) : (
          <div className={styles.listCard}>
            {appointments.map((a) => {
              const standalone = standaloneAppts.find((s) => s.appt.id === a.id)
              return (
                <div key={a.id} className={styles.apptRow}>
                  <div className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {(a.service_id ? serviceById.get(a.service_id)?.name : null) ?? 'Hizmet'}
                    </span>
                    <span className={styles.rowMeta}>
                      {new Date(a.scheduled_at).toLocaleDateString('tr-TR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · '}
                      {new Date(a.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      {a.employee_id && employeeById.get(a.employee_id)?.full_name
                        ? ` · ${employeeById.get(a.employee_id)!.full_name}`
                        : ''}
                    </span>
                  </div>
                  <div className={styles.rowSide}>
                    <span className={`${styles.statusPill} ${styles[`status_${a.status}`]}`}>
                      {SESSION_STATUS_LABEL[a.status]}
                    </span>
                    {standalone && (
                      <span className={remainingLabel(standalone.remaining).positive ? styles.textOk : styles.textWarm}>
                        {remainingLabel(standalone.remaining).text}
                      </span>
                    )}
                    {a.package_id && <span className={styles.rowMeta}>Paket seansı</span>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

      {tab === 'odemeler' &&
        (payments.length === 0 ? (
          <p className={styles.empty}>Henüz ödeme kaydı yok.</p>
        ) : (
          <div className={styles.listCard}>
            {payments.map((p) => (
              <div key={p.id} className={p.voided_at ? `${styles.paymentRow} ${styles.paymentRowVoided}` : styles.paymentRow}>
                <div className={styles.rowMain}>
                  <span className={styles.paymentAmount}>{currency.format(p.amount)}</span>
                  <span className={styles.rowMeta}>
                    {METHOD_LABEL[p.method]} · {new Date(p.paid_at).toLocaleDateString('tr-TR')}
                    {p.note ? ` · ${p.note}` : ''}
                  </span>
                </div>
                {p.voided_at ? (
                  <span className={styles.voidedBadge}>Silindi</span>
                ) : (
                  canEditPayment(p) && (
                    <div className={styles.paymentRowActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => openEditPayment(p)}
                        aria-label="Ödemeyi düzenle"
                      >
                        <PencilIcon width={14} height={14} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        onClick={() => voidPayment(p)}
                        aria-label="Ödemeyi iptal et"
                      >
                        <TrashIcon width={14} height={14} />
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        ))}

      {tab === 'paket' &&
        (packageStats.length === 0 ? (
          <p className={styles.empty}>Bu müşterinin paketi yok.</p>
        ) : (
          <div className={styles.block}>{packageStats.map((p) => renderPackage(p, true))}</div>
        ))}

      {payModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setPayModalOpen(false)}>
          <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>Ödeme al</h2>
              <button type="button" className={styles.modalClose} onClick={() => setPayModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={submitPayment}>
              <div className="field">
                <label htmlFor="payAmount">Tutar (TL)</label>
                <input
                  id="payAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="payMethod">Yöntem</label>
                <Select id="payMethod" value={payMethod} onChange={setPayMethod} options={PAYMENT_METHOD_OPTIONS} />
              </div>
              <div className="field">
                <label htmlFor="payTarget">Hangi hizmete/pakete ait</label>
                <Select id="payTarget" value={payTarget} onChange={setPayTarget} options={paymentTargetOptions} />
              </div>
              <div className="field">
                <label htmlFor="payNote">Not (opsiyonel)</label>
                <input id="payNote" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="ör. indirimli ödendi" />
              </div>
              {error && <p className={styles.error}>{error}</p>}
              <button type="submit" className="btn-primary" disabled={paySubmitting || !payMethod}>
                {paySubmitting ? 'Kaydediliyor…' : 'Ödemeyi kaydet'}
              </button>
            </form>
          </div>
        </div>
      )}

      {editingPayment && (
        <div className={styles.modalBackdrop} onClick={() => setEditingPayment(null)}>
          <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>Ödemeyi düzenle</h2>
              <button type="button" className={styles.modalClose} onClick={() => setEditingPayment(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={submitEditPayment}>
              <div className="field">
                <label htmlFor="editAmount">Tutar (TL)</label>
                <input
                  id="editAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="editMethod">Yöntem</label>
                <Select id="editMethod" value={editMethod} onChange={setEditMethod} options={PAYMENT_METHOD_OPTIONS} />
              </div>
              <div className="field">
                <label htmlFor="editDate">Tarih</label>
                <input id="editDate" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="editNote">Not (opsiyonel)</label>
                <input id="editNote" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="ör. indirimli ödendi" />
              </div>
              {error && <p className={styles.error}>{error}</p>}
              <button type="submit" className="btn-primary" disabled={editSubmitting}>
                {editSubmitting ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
              </button>
            </form>
          </div>
        </div>
      )}

      {editCustomerOpen && (
        <div className={styles.modalBackdrop} onClick={() => setEditCustomerOpen(false)}>
          <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>Müşteriyi düzenle</h2>
              <button type="button" className={styles.modalClose} onClick={() => setEditCustomerOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={submitEditCustomer}>
              <div className="field">
                <label htmlFor="editCustomerName">Ad Soyad</label>
                <input
                  id="editCustomerName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="editCustomerPhone">Telefon</label>
                <input
                  id="editCustomerPhone"
                  type="tel"
                  inputMode="numeric"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="05xx xxx xx xx"
                  aria-invalid={!!phoneLengthError(editPhone)}
                  style={phoneLengthError(editPhone) ? { borderColor: 'var(--danger-text)' } : undefined}
                />
                {phoneLengthError(editPhone) && <span role="alert" className="field-error">{phoneLengthError(editPhone)}</span>}
              </div>
              <div className="field">
                <label htmlFor="editCustomerEmail">E-posta</label>
                <input
                  id="editCustomerEmail"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="ornek@eposta.com"
                />
              </div>
              <div className="field">
                <label htmlFor="editCustomerNotes">Müşteri notu</label>
                <textarea
                  id="editCustomerNotes"
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="ör. Amonyak alerjisi var · boya 7.1 + %6 · kısa sohbet sever"
                />
              </div>
              {error && <p className={styles.error}>{error}</p>}
              <button type="submit" className="btn-primary" disabled={editCustomerSubmitting || !!phoneLengthError(editPhone)}>
                {editCustomerSubmitting ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
              </button>
              {profile?.role === 'admin' && (
                <button
                  type="button"
                  className={styles.anonymizeBtn}
                  onClick={anonymizeCustomer}
                  disabled={editCustomerSubmitting}
                >
                  Kişisel verilerini sil (KVKK)
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
