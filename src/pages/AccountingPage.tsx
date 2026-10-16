import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'
import { useAuth } from '../contexts/AuthContext'
import PdfProgressModal from '../components/PdfProgressModal'
import { ReceiptIcon } from '../components/icons'
import PageHeader from '../components/PageHeader'
import { computeCustomerDebts } from '../lib/customerDebts'
import { generateAccountingReportPdf } from '../lib/pdf/accountingReportPdf'
import { currency } from '../lib/currency'
import { toLocalDateString, presetDateRange, type DateRangePreset } from '../lib/date'
import styles from './AccountingPage.module.css'

interface Appointment {
  id: string
  customer_id: string | null
  service_id: string | null
  employee_id: string | null
  scheduled_at: string
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
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

interface Expense {
  id: string
  description: string
  amount: number
  expense_date: string
  due_date: string | null
  is_recurring: boolean
  is_paid: boolean
  payment_method?: string | null
}

interface ServicePackage {
  id: string
  customer_id: string
  service_id: string | null
  total_sessions: number
  session_offset: number
}

type PaymentMethod = 'nakit' | 'kart' | 'havale' | 'diger' | 'bakiye'

interface Payment {
  id: string
  customer_id: string
  amount: number
  appointment_id: string | null
  package_id: string | null
  method: PaymentMethod
  paid_at: string
}

const METHOD_ORDER: PaymentMethod[] = ['kart', 'nakit', 'havale', 'diger', 'bakiye']
const METHOD_LABEL: Record<PaymentMethod, string> = {
  kart: 'Kart',
  nakit: 'Nakit',
  havale: 'Havale',
  diger: 'Diğer',
  bakiye: 'Bakiye',
}

type Preset = DateRangePreset
// Kasa basligindaki "Yil" secenegi icin ek donem.
type AccPreset = Preset | 'yil'
function presetRange(p: AccPreset) {
  if (p === 'yil') {
    const today = new Date()
    return { start: toLocalDateString(new Date(today.getFullYear(), 0, 1)), end: toLocalDateString(today) }
  }
  return presetDateRange(p)
}

export default function AccountingPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [preset, setPreset] = useState<AccPreset>('bu_ay')
  const [rangeStart, setRangeStart] = useState(() => presetRange('bu_ay').start)
  const [rangeEnd, setRangeEnd] = useState(() => presetRange('bu_ay').end)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [commissionPct, setCommissionPct] = useState(0)
  const [taxPct, setTaxPct] = useState(0)
  const [rateInput, setRateInput] = useState('0')
  const [taxInput, setTaxInput] = useState('0')
  const [loading, setLoading] = useState(true)
  const [savedHint, setSavedHint] = useState(false)
  const [allPayments, setAllPayments] = useState<{ customer_id: string; amount: number; appointment_id: string | null; package_id: string | null }[]>([])
  const [customerNames, setCustomerNames] = useState<{ id: string; full_name: string }[]>([])
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false)
  const [showAllMoves, setShowAllMoves] = useState(false)
  const periodMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!periodMenuOpen) return
    function handleDown(e: PointerEvent) {
      if (periodMenuRef.current && !periodMenuRef.current.contains(e.target as Node)) setPeriodMenuOpen(false)
    }
    document.addEventListener('pointerdown', handleDown)
    return () => document.removeEventListener('pointerdown', handleDown)
  }, [periodMenuOpen])
  const [pdfState, setPdfState] = useState<{ progress: number; step: string; error: string | null } | null>(null)

  function applyPreset(p: AccPreset) {
    setPreset(p)
    const { start, end } = presetRange(p)
    setRangeStart(start)
    setRangeEnd(end)
  }

  async function loadAll() {
    setLoading(true)
    const [{ data: appts }, { data: svcs }, { data: profs }, { data: settings }, { data: exps }, { data: pkgs }, { data: pays }, { data: allPays }, { data: custs }] =
      await Promise.all([
        // Tarihle SINIRLANMIYOR: bir odeme, aralik disindaki bir randevu/paketi
        // referans alabilir (ör. onceki ay yapilan seansin bu ay tahsil edilen
        // bakiyesi) — calisan/hizmet atfi icin randevunun kendisine her zaman
        // erisebilmemiz lazim.
        fetchAll(() => supabase.from('appointments').select('id, customer_id, service_id, employee_id, scheduled_at, status, package_id, price_override').order('id')),
        supabase.from('services').select('id, name, price'),
        supabase.from('profiles').select('id, full_name'),
        supabase.from('business_finance_settings').select('commission_pct, tax_pct').maybeSingle(),
        supabase
          .from('business_expenses')
          .select('*')
          .gte('expense_date', rangeStart)
          .lte('expense_date', rangeEnd)
          .order('expense_date', { ascending: false }),
        fetchAll(() => supabase.from('service_packages').select('id, customer_id, service_id, total_sessions, session_offset').order('id')),
        // Ciro artik GERCEK tahsilata dayanir (nakit bazli) — odemenin
        // paid_at'i secili aralikta olanlar sayilir, alttaki randevunun
        // tarihi degil (giderlerin expense_date'e gore sayilmasiyla ayni
        // mantik).
        fetchAll(() => supabase
          .from('payments')
          .select('id, customer_id, amount, appointment_id, package_id, method, paid_at')
          .is('voided_at', null)
          .gte('paid_at', rangeStart)
          .lte('paid_at', rangeEnd).order('id')),
        // Alacaklar (musteri borclari) tum zamanlarin odemeleriyle hesaplanir.
        fetchAll(() =>
          supabase.from('payments').select('customer_id, amount, appointment_id, package_id').is('voided_at', null).order('id'),
        ),
        fetchAll(() => supabase.from('customers').select('id, full_name').order('id')),
      ])
    setAppointments(appts ?? [])
    setServices(svcs ?? [])
    setProfiles(profs ?? [])
    setExpenses(exps ?? [])
    setPackages(pkgs ?? [])
    setPayments(pays ?? [])
    setAllPayments(allPays ?? [])
    setCustomerNames(custs ?? [])
    const cPct = settings?.commission_pct ?? 0
    const tPct = settings?.tax_pct ?? 0
    setCommissionPct(cPct)
    setTaxPct(tPct)
    setRateInput(String(cPct))
    setTaxInput(String(tPct))
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd])

  async function saveSettings() {
    if (!profile?.business_id) return
    const cPct = Math.min(100, Math.max(0, Number(rateInput) || 0))
    const tPct = Math.min(100, Math.max(0, Number(taxInput) || 0))
    await supabase
      .from('business_finance_settings')
      .upsert({ business_id: profile.business_id, commission_pct: cPct, tax_pct: tPct })
    setCommissionPct(cPct)
    setTaxPct(tPct)
    setSavedHint(true)
    setTimeout(() => setSavedHint(false), 2000)
  }

  if (loading) return <p className={styles.empty}>Yükleniyor…</p>

  const profileNameById = new Map(profiles.map((p) => [p.id, p.full_name ?? 'Bilinmeyen']))
  const serviceNameById = new Map(services.map((s) => [s.id, s.name]))
  const appointmentById = new Map(appointments.map((a) => [a.id, a]))
  const packageServiceById = new Map(packages.map((p) => [p.id, p.service_id]))
  const todayStr = toLocalDateString(new Date())

  // scheduled_at bir timestamptz kolonu — dogru karsilastirma icin gercek
  // Date nesneleri kullaniyoruz (duz string karsilastirmasi saat dilimi
  // kaymasina yol acar, ör. yerel 00:00-03:00 arasi randevular yanlis
  // donemde sayilir).
  const rangeStartDate = new Date(`${rangeStart}T00:00:00`)
  const rangeEndDate = new Date(`${rangeEnd}T23:59:59.999`)

  // "Tamamlanan Randevu" sayaci ve tablolardaki "Randevu" sutunu — durum
  // bazli, odemeden bagimsiz bir is yuku olcusu (kac seans yapildi).
  const rangedCompleted = appointments.filter((a) => {
    if (a.status !== 'tamamlandi') return false
    const d = new Date(a.scheduled_at)
    return d >= rangeStartDate && d <= rangeEndDate
  })

  // Ciro artik GERCEK tahsilata (payments, secili araliktaki paid_at) dayanir
  // — "tamamlandi × hizmet fiyati" varsayimi degil. Bir odeme dogrudan bir
  // randevuya (appointment_id) ya da bir pakete (package_id, o an tek bir
  // seansa baglanmamis olabilir) bagli olabilir; calisan atfi sadece randevu
  // uzerinden mumkun oldugu icin randevusuz (sadece paket/serbest) odemeler
  // "Calisan Bazli Ciro" tablosuna girmez, ama toplam ciroya ve "Islem Bazli
  // Ciro"ya (paketin hizmeti uzerinden) girer.
  const employeeStatsMap = new Map<string, { id: string; name: string; count: number; revenue: number }>()
  for (const a of rangedCompleted) {
    if (!a.employee_id) continue
    const entry = employeeStatsMap.get(a.employee_id) ?? {
      id: a.employee_id,
      name: profileNameById.get(a.employee_id) ?? 'Bilinmeyen',
      count: 0,
      revenue: 0,
    }
    entry.count += 1
    employeeStatsMap.set(a.employee_id, entry)
  }
  for (const p of payments) {
    const employeeId = p.appointment_id ? appointmentById.get(p.appointment_id)?.employee_id : null
    if (!employeeId) continue
    const entry = employeeStatsMap.get(employeeId) ?? {
      id: employeeId,
      name: profileNameById.get(employeeId) ?? 'Bilinmeyen',
      count: 0,
      revenue: 0,
    }
    entry.revenue += p.amount
    employeeStatsMap.set(employeeId, entry)
  }
  const allEmployeeStats = Array.from(employeeStatsMap.values()).sort((a, b) => b.revenue - a.revenue)

  const serviceStatsMap = new Map<string, { id: string; name: string; count: number; revenue: number }>()
  for (const a of rangedCompleted) {
    if (!a.service_id) continue
    const entry = serviceStatsMap.get(a.service_id) ?? {
      id: a.service_id,
      name: serviceNameById.get(a.service_id) ?? 'Silinmiş hizmet',
      count: 0,
      revenue: 0,
    }
    entry.count += 1
    serviceStatsMap.set(a.service_id, entry)
  }
  for (const p of payments) {
    const serviceId = p.appointment_id
      ? appointmentById.get(p.appointment_id)?.service_id
      : p.package_id
        ? packageServiceById.get(p.package_id)
        : null
    if (!serviceId) continue
    const entry = serviceStatsMap.get(serviceId) ?? {
      id: serviceId,
      name: serviceNameById.get(serviceId) ?? 'Silinmiş hizmet',
      count: 0,
      revenue: 0,
    }
    entry.revenue += p.amount
    serviceStatsMap.set(serviceId, entry)
  }
  const serviceStats = Array.from(serviceStatsMap.values()).sort((a, b) => b.revenue - a.revenue)

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0)
  const taxAmount = totalRevenue * (taxPct / 100)
  const afterTax = totalRevenue - taxAmount
  const commissionAmount = afterTax * (commissionPct / 100)
  const afterCommission = afterTax - commissionAmount
  // Odenmemis giderler (henuz fiilen kasadan cikmamis) Net Kar'a girmez —
  // sadece is_paid=true olanlar dusulur. Odenmemisler Giderler listesinde
  // gorunmeye devam eder, "Odendi" isaretlenince buraya dahil olur.
  const paidExpenses = expenses.filter((e) => e.is_paid)
  const unpaidExpenses = expenses.filter((e) => !e.is_paid)
  const overdueExpenses = unpaidExpenses.filter((e) => e.due_date && e.due_date < todayStr)
  const totalExpenses = paidExpenses.reduce((sum, e) => sum + e.amount, 0)
  const netProfit = afterCommission - totalExpenses

  async function handleExportPdf() {
    if (!profile?.business_id) return
    setPdfState({ progress: 0, step: 'Başlatılıyor…', error: null })
    try {
      await generateAccountingReportPdf({
        businessId: profile.business_id,
        rangeStart,
        rangeEnd,
        kpis: { totalRevenue, completedCount: rangedCompleted.length, totalExpenses, netProfit },
        waterfall: { totalRevenue, taxPct, taxAmount, afterTax, commissionPct, commissionAmount, afterCommission, totalExpenses, netProfit },
        employeeStats: allEmployeeStats,
        serviceStats,
        expenses,
        appointmentById,
        packageServiceById,
        profileNameById,
        serviceNameById,
        onProgress: (progress, step) => setPdfState({ progress, step, error: null }),
      })
      setPdfState(null)
    } catch (err) {
      setPdfState({ progress: 0, step: '', error: err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu.' })
    }
  }

  // Tahsilatin odeme yontemine gore dagilimi (ustteki cubuklar).
  const methodTotals = METHOD_ORDER.map((m) => ({
    method: m,
    label: METHOD_LABEL[m],
    total: payments.filter((p) => p.method === m).reduce((sum, p) => sum + p.amount, 0),
  })).filter((m) => m.total > 0)
  const methodMax = Math.max(1, ...methodTotals.map((m) => m.total))
  // Kasadaki nakit = nakit tahsilat − nakitle odenen giderler (odeme sekli
  // girilmemis eski giderler hesaba katilmaz).
  const cashIncome = methodTotals.find((m) => m.method === 'nakit')?.total ?? 0
  const cashExpenses = paidExpenses.filter((e) => e.payment_method === 'nakit').reduce((sum, e) => sum + e.amount, 0)
  const cashTotal = cashIncome - cashExpenses
  const unpaidTotal = unpaidExpenses.reduce((sum, e) => sum + e.amount, 0)

  const servicePriceById = new Map(services.map((s) => [s.id, s.price ?? 0]))
  const debts = computeCustomerDebts(packages, appointments, allPayments, servicePriceById)
  const debtTotal = Array.from(debts.values()).reduce((sum, v) => sum + v, 0)
  const debtorCount = Array.from(debts.values()).filter((v) => v > 0).length
  const customerNameById = new Map(customerNames.map((c) => [c.id, c.full_name]))

  function dayText(dateStr: string) {
    const d = dateStr.slice(0, 10)
    if (d === todayStr) return 'Bugün'
    const y = new Date()
    y.setDate(y.getDate() - 1)
    if (d === toLocalDateString(y)) return 'Dün'
    return new Date(`${d}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
  }

  // Son hareketler: donemdeki tahsilatlar (+) ve odenmis giderler (−).
  const allMovements = [
    ...payments.map((p) => {
      const serviceId = p.appointment_id
        ? appointmentById.get(p.appointment_id)?.service_id
        : p.package_id
          ? packageServiceById.get(p.package_id)
          : null
      const who = customerNameById.get(p.customer_id) ?? 'Müşteri'
      const what = serviceId ? serviceNameById.get(serviceId) : null
      return {
        key: `p:${p.id}`,
        title: what ? `${who} · ${what}` : who,
        sub: `${dayText(p.paid_at)} · ${METHOD_LABEL[p.method] ?? 'Tahsilat'}`,
        date: p.paid_at,
        amount: p.amount,
      }
    }),
    ...paidExpenses.map((e) => ({
      key: `e:${e.id}`,
      title: e.description,
      sub: `${dayText(e.expense_date)} · Gider`,
      date: e.expense_date,
      amount: -e.amount,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  const movements = showAllMoves ? allMovements : allMovements.slice(0, 4)

  const monthName = new Date().toLocaleDateString('tr-TR', { month: 'long' })
  const monthLabel = monthName.charAt(0).toLocaleUpperCase('tr') + monthName.slice(1)

  return (
    <div className={styles.wrap}>
      <PageHeader
        title="Kasa"
        action={
          <div className={styles.headSegWrap} ref={periodMenuRef}>
            <div className={styles.headSeg}>
              {(
                [
                  { value: 'bugun', label: 'Bugün' },
                  { value: 'bu_ay', label: monthLabel },
                  { value: 'yil', label: 'Yıl' },
                ] as { value: AccPreset; label: string }[]
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={preset === o.value ? styles.headSegActive : styles.headSegBtn}
                  onClick={() => applyPreset(o.value)}
                >
                  {o.label}
                </button>
              ))}
              <button
                type="button"
                className={['bu_hafta', 'gecen_ay', 'ozel'].includes(preset) ? styles.headSegActive : styles.headSegBtn}
                onClick={() => setPeriodMenuOpen((v) => !v)}
                aria-label="Başka dönem"
              >
                ⋯
              </button>
            </div>
            {periodMenuOpen && (
              <div className={styles.periodMenu}>
                {(
                  [
                    { value: 'bu_hafta', label: 'Bu hafta' },
                    { value: 'gecen_ay', label: 'Geçen ay' },
                  ] as { value: AccPreset; label: string }[]
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={styles.periodMenuItem}
                    onClick={() => {
                      applyPreset(o.value)
                      setPeriodMenuOpen(false)
                    }}
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.periodMenuItem}
                  onClick={() => {
                    setPreset('ozel')
                    setPeriodMenuOpen(false)
                  }}
                >
                  Tarih aralığı seç
                </button>
              </div>
            )}
          </div>
        }
      />

      {preset === 'ozel' && (
        <div className={styles.customRangeRow}>
          <div className="field field-flush">
            <label htmlFor="rangeStart">Başlangıç</label>
            <input
              id="rangeStart"
              type="date"
              value={rangeStart}
              max={rangeEnd}
              onChange={(e) => {
                if (e.target.value) setRangeStart(e.target.value)
              }}
            />
          </div>
          <div className="field field-flush">
            <label htmlFor="rangeEnd">Bitiş</label>
            <input
              id="rangeEnd"
              type="date"
              value={rangeEnd}
              min={rangeStart}
              onChange={(e) => {
                if (e.target.value) setRangeEnd(e.target.value)
              }}
            />
          </div>
        </div>
      )}

      <div className={styles.totalCard}>
        <div className={styles.totalHead}>
          <span className={styles.totalLabel}>Toplam tahsilat</span>
          <span className={styles.totalValue}>{currency.format(totalRevenue)}</span>
        </div>
        {methodTotals.length > 0 ? (
          <div className={styles.methodList}>
            {methodTotals.map((m) => (
              <div key={m.method} className={styles.methodRow}>
                <div className={styles.methodTop}>
                  <span className={styles.methodLabel}>{m.label}</span>
                  <span className={styles.methodAmount}>{currency.format(m.total)}</span>
                </div>
                <span className={styles.methodTrack}>
                  <span className={styles.methodFill} style={{ width: `${(m.total / methodMax) * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className={styles.totalHint}>Bu dönemde tahsilat yok · {rangedCompleted.length} randevu tamamlandı</span>
        )}
      </div>

      <div className={styles.tiles}>
        <div className={`${styles.tile} ${styles.tileNavy}`}>
          <span className={styles.tileLabel}>Kasadaki nakit</span>
          <span className={styles.tileValue}>{currency.format(cashTotal)}</span>
          <span className={styles.tileHint}>Nakit gelir − nakit gider</span>
        </div>
        <button
          type="button"
          className={styles.tile}
          onClick={() => navigate(`/giderler?start=${rangeStart}&end=${rangeEnd}`)}
        >
          <span className={styles.tileLabel}>Giderler</span>
          <span className={`${styles.tileValue} ${styles.textWarm}`}>{currency.format(totalExpenses)}</span>
          <span className={styles.tileHint}>
            {expenses.length} kayıt
            {overdueExpenses.length > 0
              ? ` · ${overdueExpenses.length} gecikti`
              : unpaidTotal > 0
                ? ` · ${currency.format(unpaidTotal)} ödenmedi`
                : ''}{' '}
            ›
          </span>
        </button>
        <button type="button" className={styles.tile} onClick={() => navigate('/musteriler?sekme=borclu')}>
          <span className={styles.tileLabel}>Alacaklar</span>
          <span className={styles.tileValue}>{currency.format(debtTotal)}</span>
          <span className={styles.tileHint}>{debtorCount} müşteri ›</span>
        </button>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Net</span>
          <span className={netProfit < 0 ? `${styles.tileValue} ${styles.textDanger}` : `${styles.tileValue} ${styles.textOk}`}>
            {currency.format(netProfit)}
          </span>
          <span className={styles.tileHint}>Gelir − gider</span>
        </div>
      </div>

      <div className={styles.actionRow}>
        <button type="button" className={styles.actionPrimary} onClick={() => navigate('/musteriler?sekme=borclu')}>
          Gelir ekle
        </button>
        <button type="button" className={styles.action} onClick={() => navigate('/giderler?yeni=1')}>
          Gider ekle
        </button>
      </div>

      <button type="button" className={styles.closureCard} onClick={() => navigate('/kasa/gun-sonu')}>
        <span className={styles.closureText}>
          <span className={styles.closureTitle}>Gün sonu kasa kapanışı</span>
          <span className={styles.closureSub}>Kasayı say, farkı gör, PDF olarak indir</span>
        </span>
        <span className={styles.closureArrow}>›</span>
      </button>

      <div className={styles.movesCard}>
        <div className={styles.movesHead}>
          <span className={styles.movesTitle}>Son hareketler</span>
          {allMovements.length > 4 && (
            <button type="button" className={styles.link} onClick={() => setShowAllMoves((v) => !v)}>
              {showAllMoves ? 'Daha az' : 'Tümü'}
            </button>
          )}
        </div>
        {movements.length === 0 ? (
          <p className={styles.empty}>Bu dönemde tahsilat ya da gider yok.</p>
        ) : (
          movements.map((m) => (
            <div key={m.key} className={styles.moveRow}>
              <span className={styles.moveText}>
                <span className={styles.moveTitle}>{m.title}</span>
                <span className={styles.moveSub}>{m.sub}</span>
              </span>
              <span className={m.amount < 0 ? `${styles.moveAmount} ${styles.textWarm}` : `${styles.moveAmount} ${styles.textOk}`}>
                {m.amount < 0 ? '−' : '+'}
                {currency.format(Math.abs(m.amount))}
              </span>
            </div>
          ))
        )}
      </div>

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>Net nasıl hesaplandı</h2>
        <div className={styles.listCard}>
          <div className={styles.waterfallRow}>
            <span>Toplam tahsilat</span>
            <span>{currency.format(totalRevenue)}</span>
          </div>
          <div className={styles.waterfallRow}>
            <span>Vergi (%{taxPct})</span>
            <span className={styles.waterfallMinus}>−{currency.format(taxAmount)}</span>
          </div>
          <div className={styles.waterfallRow}>
            <span>Çalışan primi (%{commissionPct})</span>
            <span className={styles.waterfallMinus}>−{currency.format(commissionAmount)}</span>
          </div>
          <div className={styles.waterfallRow}>
            <span>Salon giderleri</span>
            <span className={styles.waterfallMinus}>−{currency.format(totalExpenses)}</span>
          </div>
          <div className={`${styles.waterfallRow} ${styles.waterfallNet}`}>
            <span>Net</span>
            <span className={netProfit < 0 ? styles.textDanger : undefined}>{currency.format(netProfit)}</span>
          </div>
        </div>
      </div>

      {/* Oranlar yalnizca yoneticide (Kasa yetkili calisan sadece gorur). */}
      {profile?.role === 'admin' && (
      <div className={styles.block}>
        <h2 className={styles.blockTitle}>Vergi ve prim oranı</h2>
        <div className={styles.rateCard}>
          <div className={styles.rateField}>
            <label htmlFor="taxRate">Vergi (%)</label>
            <input
              id="taxRate"
              type="number"
              min={0}
              max={100}
              step={1}
              value={taxInput}
              onChange={(e) => setTaxInput(e.target.value)}
            />
          </div>
          <div className={styles.rateField}>
            <label htmlFor="commissionRate">Genel prim (%)</label>
            <input
              id="commissionRate"
              type="number"
              min={0}
              max={100}
              step={1}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
            />
          </div>
          <button type="button" className={styles.saveBtn} onClick={saveSettings}>
            {savedHint ? 'Kaydedildi' : 'Kaydet'}
          </button>
        </div>
      </div>
      )}

      <div className={styles.block}>
        <h2 className={styles.blockTitle}>Hizmete göre tahsilat</h2>
        {serviceStats.length === 0 ? (
          <p className={styles.empty}>Bu aralıkta randevu veya ödeme kaydı yok.</p>
        ) : (
          <div className={styles.listCard}>
            {serviceStats.map((s) => (
              <div className={styles.moveRow} key={s.id}>
                <span className={styles.moveText}>
                  <span className={styles.moveTitle}>{s.name}</span>
                  <span className={styles.moveSub}>{s.count} randevu</span>
                </span>
                <span className={styles.moveAmount}>{currency.format(s.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" className={styles.exportBtn} onClick={handleExportPdf}>
        <ReceiptIcon width={16} height={16} />
        Detaylı özeti PDF olarak al
      </button>

      {pdfState && (
        <PdfProgressModal
          progress={pdfState.progress}
          step={pdfState.step}
          error={pdfState.error}
          onClose={() => setPdfState(null)}
        />
      )}
    </div>
  )
}
