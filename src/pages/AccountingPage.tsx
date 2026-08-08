import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar from '../components/Avatar'
import PdfProgressModal from '../components/PdfProgressModal'
import ConfirmModal from '../components/ConfirmModal'
import {
  SearchIcon,
  WalletIcon,
  CheckCircleIcon,
  ReceiptIcon,
  TrendingUpIcon,
  TrashIcon,
} from '../components/icons'
import { generateAccountingReportPdf } from '../lib/pdf/accountingReportPdf'
import styles from './AccountingPage.module.css'

interface Appointment {
  id: string
  service_id: string | null
  employee_id: string | null
  scheduled_at: string
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal'
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
  is_recurring: boolean
  is_paid: boolean
}

interface ServicePackage {
  id: string
  service_id: string | null
}

interface Payment {
  id: string
  amount: number
  appointment_id: string | null
  package_id: string | null
}

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

function toLocalDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

type Preset = 'bugun' | 'bu_hafta' | 'bu_ay' | 'gecen_ay' | 'ozel'

function presetRange(preset: Preset): { start: string; end: string } {
  const today = new Date()
  switch (preset) {
    case 'bugun':
      return { start: toLocalDateString(today), end: toLocalDateString(today) }
    case 'bu_hafta': {
      // Pazartesiden bugune kadar — tam takvim haftasi degil, "bu hafta simdiye
      // kadar kac gun gectiyse" (ör. sali ise Pazartesi+Sali).
      const day = today.getDay()
      const diffToMonday = day === 0 ? -6 : 1 - day
      const monday = new Date(today)
      monday.setDate(today.getDate() + diffToMonday)
      return { start: toLocalDateString(monday), end: toLocalDateString(today) }
    }
    case 'bu_ay':
      return { start: toLocalDateString(firstOfMonth(today)), end: toLocalDateString(today) }
    case 'gecen_ay': {
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      const lastMonthStart = firstOfMonth(lastMonthEnd)
      return { start: toLocalDateString(lastMonthStart), end: toLocalDateString(lastMonthEnd) }
    }
    default:
      return { start: toLocalDateString(firstOfMonth(today)), end: toLocalDateString(today) }
  }
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'bugun', label: 'Bugün' },
  { value: 'bu_hafta', label: 'Bu Hafta' },
  { value: 'bu_ay', label: 'Bu Ay' },
  { value: 'gecen_ay', label: 'Geçen Ay' },
]

export default function AccountingPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const expenseDescRef = useRef<HTMLInputElement>(null)
  const [preset, setPreset] = useState<Preset>('bu_ay')
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
  const [search, setSearch] = useState('')
  const [pdfState, setPdfState] = useState<{ progress: number; step: string; error: string | null } | null>(null)
  const [paidConfirm, setPaidConfirm] = useState<{ id: string; description: string; next: boolean } | null>(null)

  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => toLocalDateString(new Date()))
  const [expenseRecurring, setExpenseRecurring] = useState(false)
  const [expensePaid, setExpensePaid] = useState(true)
  const [addingExpense, setAddingExpense] = useState(false)

  function applyPreset(p: Preset) {
    setPreset(p)
    const { start, end } = presetRange(p)
    setRangeStart(start)
    setRangeEnd(end)
  }

  async function loadAll() {
    setLoading(true)
    const [{ data: appts }, { data: svcs }, { data: profs }, { data: settings }, { data: exps }, { data: pkgs }, { data: pays }] =
      await Promise.all([
        // Tarihle SINIRLANMIYOR: bir odeme, aralik disindaki bir randevu/paketi
        // referans alabilir (ör. onceki ay yapilan seansin bu ay tahsil edilen
        // bakiyesi) — calisan/hizmet atfi icin randevunun kendisine her zaman
        // erisebilmemiz lazim.
        supabase.from('appointments').select('id, service_id, employee_id, scheduled_at, status'),
        supabase.from('services').select('id, name, price'),
        supabase.from('profiles').select('id, full_name'),
        supabase.from('business_finance_settings').select('commission_pct, tax_pct').maybeSingle(),
        supabase
          .from('business_expenses')
          .select('id, description, amount, expense_date, is_recurring, is_paid')
          .gte('expense_date', rangeStart)
          .lte('expense_date', rangeEnd)
          .order('expense_date', { ascending: false }),
        supabase.from('service_packages').select('id, service_id'),
        // Ciro artik GERCEK tahsilata dayanir (nakit bazli) — odemenin
        // paid_at'i secili aralikta olanlar sayilir, alttaki randevunun
        // tarihi degil (giderlerin expense_date'e gore sayilmasiyla ayni
        // mantik).
        supabase
          .from('payments')
          .select('id, amount, appointment_id, package_id')
          .gte('paid_at', rangeStart)
          .lte('paid_at', rangeEnd),
      ])
    setAppointments(appts ?? [])
    setServices(svcs ?? [])
    setProfiles(profs ?? [])
    setExpenses(exps ?? [])
    setPackages(pkgs ?? [])
    setPayments(pays ?? [])
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

  // Ana Sayfa'daki "+ Ödeme Ekle" / "Ödeme Ekle" kisayollari buraya
  // ?yeni=1 ile dusuyor — sayfanin ortasindaki gider formuna doğrudan
  // kaydirip odak veriyoruz, kullanici Muhasebe sayfasinda formu aramasin.
  useEffect(() => {
    if (searchParams.get('yeni') === '1') {
      expenseDescRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      expenseDescRef.current?.focus()
      searchParams.delete('yeni')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

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

  async function addExpense(e: FormEvent) {
    e.preventDefault()
    if (!profile?.business_id) return
    const amount = Number(expenseAmount)
    if (!expenseDesc.trim() || !amount || amount < 0) return
    setAddingExpense(true)
    await supabase.from('business_expenses').insert({
      business_id: profile.business_id,
      description: expenseDesc.trim(),
      amount,
      expense_date: expenseDate,
      is_recurring: expenseRecurring,
      is_paid: expensePaid,
    })
    setExpenseDesc('')
    setExpenseAmount('')
    setExpenseRecurring(false)
    setExpensePaid(true)
    await loadAll()
    setAddingExpense(false)
  }

  async function deleteExpense(id: string) {
    await supabase.from('business_expenses').delete().eq('id', id)
    await loadAll()
  }

  function requestToggleExpensePaid(id: string, description: string, next: boolean) {
    setPaidConfirm({ id, description, next })
  }

  async function confirmToggleExpensePaid() {
    if (!paidConfirm) return
    await supabase.from('business_expenses').update({ is_paid: paidConfirm.next }).eq('id', paidConfirm.id)
    setPaidConfirm(null)
    await loadAll()
  }

  if (loading) return <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>

  const profileNameById = new Map(profiles.map((p) => [p.id, p.full_name ?? 'Bilinmeyen']))
  const serviceNameById = new Map(services.map((s) => [s.id, s.name]))
  const appointmentById = new Map(appointments.map((a) => [a.id, a]))
  const packageServiceById = new Map(packages.map((p) => [p.id, p.service_id]))

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
  const q = search.trim().toLowerCase()
  const employeeStats = q ? allEmployeeStats.filter((e) => e.name.toLowerCase().includes(q)) : allEmployeeStats
  const visibleExpenses = q ? expenses.filter((e) => e.description.toLowerCase().includes(q)) : expenses

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

  return (
    <div className={styles.wrap}>
      <h2 className={styles.sectionLabel}>Tarih Aralığı</h2>
      <div className={styles.filterRow}>
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={preset === p.value ? styles.filterBtnActive : styles.filterBtn}
            onClick={() => applyPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={`card ${styles.customRangeRow}`}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="rangeStart">Başlangıç</label>
          <input
            id="rangeStart"
            type="date"
            value={rangeStart}
            max={rangeEnd}
            onChange={(e) => {
              setPreset('ozel')
              setRangeStart(e.target.value)
            }}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="rangeEnd">Bitiş</label>
          <input
            id="rangeEnd"
            type="date"
            value={rangeEnd}
            min={rangeStart}
            onChange={(e) => {
              setPreset('ozel')
              setRangeEnd(e.target.value)
            }}
          />
        </div>
      </div>

      <button type="button" className={`btn-secondary ${styles.exportBtn}`} onClick={handleExportPdf}>
        <ReceiptIcon width={15} height={15} />
        Detaylı Özet (PDF)
      </button>

      <h2 className={styles.sectionLabel}>Dönem Özeti</h2>
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardSignal}`}>
          <span className={`${styles.statIcon} ${styles.statIconSignal}`}>
            <WalletIcon width={14} height={14} />
          </span>
          <span className={styles.statValue}>{currency.format(totalRevenue)}</span>
          <span className={styles.statLabel}>Toplam Ciro</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardInfo}`}>
          <span className={`${styles.statIcon} ${styles.statIconInfo}`}>
            <CheckCircleIcon width={14} height={14} />
          </span>
          <span className={styles.statValue}>{rangedCompleted.length}</span>
          <span className={styles.statLabel}>Tamamlanan Randevu</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardDanger}`}>
          <span className={`${styles.statIcon} ${styles.statIconDanger}`}>
            <ReceiptIcon width={14} height={14} />
          </span>
          <span className={styles.statValue}>{currency.format(totalExpenses)}</span>
          <span className={styles.statLabel}>Toplam Gider</span>
        </div>
        <div className={`${styles.statCard} ${netProfit >= 0 ? styles.statCardOk : styles.statCardDanger}`}>
          <span className={`${styles.statIcon} ${netProfit >= 0 ? styles.statIconOk : styles.statIconDanger}`}>
            <TrendingUpIcon width={14} height={14} />
          </span>
          <span className={styles.statValue}>{currency.format(netProfit)}</span>
          <span className={styles.statLabel}>Net Kâr</span>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Bu Dönem Nasıl Hesaplandı</h2>
        <div className={styles.waterfall}>
          <div className={styles.waterfallRow}>
            <span>Toplam ciro</span>
            <span>{currency.format(totalRevenue)}</span>
          </div>
          <div className={styles.waterfallRow}>
            <span>− Vergi (%{taxPct})</span>
            <span className={styles.waterfallMinus}>−{currency.format(taxAmount)}</span>
          </div>
          <div className={`${styles.waterfallRow} ${styles.waterfallSubtotal}`}>
            <span>Vergi sonrası kalan</span>
            <span>{currency.format(afterTax)}</span>
          </div>
          <div className={styles.waterfallRow}>
            <span>− Çalışan primi (%{commissionPct})</span>
            <span className={styles.waterfallMinus}>−{currency.format(commissionAmount)}</span>
          </div>
          <div className={`${styles.waterfallRow} ${styles.waterfallSubtotal}`}>
            <span>Prim sonrası kalan</span>
            <span>{currency.format(afterCommission)}</span>
          </div>
          <div className={styles.waterfallRow}>
            <span>− Salon giderleri</span>
            <span className={styles.waterfallMinus}>−{currency.format(totalExpenses)}</span>
          </div>
          <div className={`${styles.waterfallRow} ${styles.waterfallNet} ${netProfit < 0 ? styles.waterfallNetDanger : ''}`}>
            <span>Net kâr</span>
            <span>{currency.format(netProfit)}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Vergi &amp; Prim Ayarları</h2>
        <div className={styles.rateRow}>
          <div className={styles.rateField}>
            <label htmlFor="taxRate">Vergi oranı (%)</label>
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
            <label htmlFor="commissionRate">Genel prim oranı (%)</label>
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
          <button type="button" className={`btn-primary ${styles.saveBtn}`} onClick={saveSettings}>
            Kaydet
          </button>
          {savedHint && <span className={styles.savedHint}>Kaydedildi ✓</span>}
        </div>
      </div>

      <div className={styles.searchBox}>
        <SearchIcon width={16} height={16} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="Çalışan veya gider ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 4 }}>Giderler</h2>
        {unpaidExpenses.length > 0 && (
          <p className={styles.unpaidHint}>
            {unpaidExpenses.length} ödenmemiş gider — toplam {currency.format(unpaidExpenses.reduce((sum, e) => sum + e.amount, 0))} (Net Kâr'a dahil değil)
          </p>
        )}
        <form className={styles.expenseForm} onSubmit={addExpense} style={{ marginTop: 14 }}>
          <div className={styles.expenseField}>
            <label htmlFor="expenseDesc">Açıklama</label>
            <input
              id="expenseDesc"
              ref={expenseDescRef}
              type="text"
              value={expenseDesc}
              onChange={(e) => setExpenseDesc(e.target.value)}
              placeholder="Kira, fatura, sarf malzeme…"
              required
            />
          </div>
          <div className={styles.expenseField} style={{ width: 120 }}>
            <label htmlFor="expenseAmount">Tutar</label>
            <input
              id="expenseAmount"
              type="number"
              min={0}
              step="0.01"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>
          <div className={styles.expenseField} style={{ width: 150 }}>
            <label htmlFor="expenseDate">Tarih</label>
            <input
              id="expenseDate"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
          <div className={styles.expenseField}>
            <label>Tekrar</label>
            <div className={styles.recurringToggle}>
              <button
                type="button"
                className={!expenseRecurring ? styles.recurringBtnActive : styles.recurringBtn}
                onClick={() => setExpenseRecurring(false)}
              >
                Tek Seferlik
              </button>
              <button
                type="button"
                className={expenseRecurring ? styles.recurringBtnActive : styles.recurringBtn}
                onClick={() => setExpenseRecurring(true)}
              >
                Aylık
              </button>
            </div>
          </div>
          <div className={styles.expenseField}>
            <label>Ödeme Durumu</label>
            <div className={styles.recurringToggle}>
              <button
                type="button"
                className={expensePaid ? styles.recurringBtnActive : styles.recurringBtn}
                onClick={() => setExpensePaid(true)}
              >
                Ödendi
              </button>
              <button
                type="button"
                className={!expensePaid ? styles.recurringBtnActive : styles.recurringBtn}
                onClick={() => setExpensePaid(false)}
              >
                Ödenmedi
              </button>
            </div>
          </div>
          <button type="submit" className={`btn-primary ${styles.saveBtn}`} disabled={addingExpense}>
            {addingExpense ? 'Ekleniyor…' : 'Ekle'}
          </button>
        </form>

        {visibleExpenses.length === 0 ? (
          <p className={styles.empty}>{q ? 'Eşleşen gider yok.' : 'Bu aralıkta gider kaydı yok.'}</p>
        ) : (
          <div className={styles.list}>
            {visibleExpenses.map((e) => (
              <div className={styles.expenseRow} key={e.id}>
                <div className={styles.expenseRowMain}>
                  <span className={styles.expenseDescRow}>
                    <span className={styles.expenseDesc}>{e.description}</span>
                    {e.is_recurring && <span className={styles.recurringBadge}>Aylık</span>}
                    {!e.is_paid && <span className={styles.unpaidBadge}>Ödenmedi</span>}
                  </span>
                  <span className={styles.expenseDate}>
                    {new Date(e.expense_date + 'T00:00:00').toLocaleDateString('tr-TR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <span className={styles.expenseAmount}>{currency.format(e.amount)}</span>
                <button
                  type="button"
                  className={e.is_paid ? styles.paidToggleBtnActive : styles.paidToggleBtn}
                  onClick={() => requestToggleExpensePaid(e.id, e.description, !e.is_paid)}
                  aria-label={e.is_paid ? `${e.description} giderini ödenmedi işaretle` : `${e.description} giderini ödendi işaretle`}
                  title={e.is_paid ? 'Ödendi — ödenmedi işaretlemek için tıkla' : 'Ödendi olarak işaretle'}
                >
                  <CheckCircleIcon width={16} height={16} />
                </button>
                <button
                  type="button"
                  className={styles.rowDeleteBtn}
                  onClick={() => deleteExpense(e.id)}
                  aria-label={`${e.description} giderini sil`}
                >
                  <TrashIcon width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Çalışan Bazlı Ciro</h2>
        {employeeStats.length === 0 ? (
          <p className={styles.empty}>Bu aralıkta randevu veya ödeme kaydı yok.</p>
        ) : (
          <div className={styles.list}>
            {employeeStats.map((e, i) => (
              <div className={styles.employeeRow} key={e.id}>
                <span className={styles.rank}>{i + 1}</span>
                <Avatar name={e.name} size={36} />
                <span className={styles.employeeName}>{e.name}</span>
                <div className={styles.employeeStats}>
                  <div className={styles.employeeStatBlock}>
                    <span className={styles.employeeStatLabel}>Randevu</span>
                    <span className={styles.employeeStatValue}>{e.count}</span>
                  </div>
                  <div className={styles.employeeStatBlock}>
                    <span className={styles.employeeStatLabel}>Ciro</span>
                    <span className={styles.employeeStatValueSignal}>{currency.format(e.revenue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>İşlem Bazlı Ciro</h2>
        {serviceStats.length === 0 ? (
          <p className={styles.empty}>Bu aralıkta randevu veya ödeme kaydı yok.</p>
        ) : (
          <div className={styles.list}>
            {serviceStats.map((s, i) => (
              <div className={styles.employeeRow} key={s.id}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.employeeName}>{s.name}</span>
                <div className={styles.employeeStats}>
                  <div className={styles.employeeStatBlock}>
                    <span className={styles.employeeStatLabel}>Randevu</span>
                    <span className={styles.employeeStatValue}>{s.count}</span>
                  </div>
                  <div className={styles.employeeStatBlock}>
                    <span className={styles.employeeStatLabel}>Ciro</span>
                    <span className={styles.employeeStatValueSignal}>{currency.format(s.revenue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pdfState && (
        <PdfProgressModal
          progress={pdfState.progress}
          step={pdfState.step}
          error={pdfState.error}
          onClose={() => setPdfState(null)}
        />
      )}

      {paidConfirm && (
        <ConfirmModal
          title={paidConfirm.next ? 'Ödendi Olarak İşaretle' : 'Ödenmedi Olarak İşaretle'}
          message={
            <>
              "{paidConfirm.description}" giderini{' '}
              <strong style={{ color: paidConfirm.next ? 'var(--ok-text)' : 'var(--danger-text)' }}>
                {paidConfirm.next ? 'ödendi' : 'ödenmedi'}
              </strong>{' '}
              olarak işaretlemek istediğinize emin misiniz?
            </>
          }
          confirmLabel="Evet, İşaretle"
          onConfirm={confirmToggleExpensePaid}
          onCancel={() => setPaidConfirm(null)}
        />
      )}
    </div>
  )
}
