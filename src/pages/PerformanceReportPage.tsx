import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'
import PageHeader from '../components/PageHeader'
import PdfProgressModal from '../components/PdfProgressModal'
import { SearchIcon, RobotIcon, ReceiptIcon, CheckCircleIcon } from '../components/icons'
import { SOURCE_LABEL } from '../lib/sourceLabels'
import { generatePerformanceReportPdf } from '../lib/pdf/performanceReportPdf'
import { currencyWhole as currency } from '../lib/currency'
import { toLocalDateString, presetDateRange, timeToMinutes, WEEK_ORDER, DAY_SHORT, DAY_LONG } from '../lib/date'
import styles from './PerformanceReportPage.module.css'
import { firstName } from '../lib/formatName'
import { AVATAR_TONES } from '../lib/avatarColor'

interface Profile {
  id: string
  full_name: string | null
}

interface Appointment {
  id: string
  employee_id: string | null
  customer_id: string | null
  service_id: string | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
  scheduled_at: string
  duration_minutes: number | null
  price_override: number | null
  source: string
}

interface Service {
  id: string
  name: string
  price: number | null
}

interface Schedule {
  profile_id: string
  day_of_week: number
  starts_at: string
  ends_at: string
}

interface TimeBlock {
  profile_id: string
  day_of_week: number | null
  block_date: string | null
  end_date: string | null
  starts_at: string
  ends_at: string
  label: string | null
}

interface Payment {
  amount: number
  paid_at: string
  appointment_id: string | null
}

interface EmployeeServiceRow {
  profile_id: string
  service_id: string
}

type Preset = 'bugun' | 'bu_hafta' | 'bu_ay' | 'gecen_ay' | 'ozel'
const presetRange = presetDateRange

const PRESETS: { value: Exclude<Preset, 'ozel'>; label: string }[] = [
  { value: 'bugun', label: 'Bugün' },
  { value: 'bu_hafta', label: 'Bu hafta' },
  { value: 'bu_ay', label: 'Bu ay' },
  { value: 'gecen_ay', label: 'Geçen ay' },
]

function monthName(dateStr: string) {
  const s = new Date(`${dateStr}T00:00:00`).toLocaleDateString('tr-TR', { month: 'long' })
  return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1)
}

function shiftDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toLocalDateString(d)
}

// "1 – 12 Ekim" / "28 Eyl – 3 Eki" / "12 Ekim"
function rangeText(start: string, end: string) {
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  if (start === end) return s.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`
  }
  return `${s.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`
}

// Karsilastirma donemi: aylik secimlerde onceki ayin ayni gunleri,
// digerlerinde hemen onceki ayni uzunluktaki aralik.
function previousRange(preset: Preset, start: string, end: string): { start: string; end: string; label: string } {
  if (preset === 'bu_ay' || preset === 'gecen_ay') {
    const s = new Date(`${start}T00:00:00`)
    const e = new Date(`${end}T00:00:00`)
    const prevStart = new Date(s.getFullYear(), s.getMonth() - 1, 1)
    const prevLast = new Date(s.getFullYear(), s.getMonth(), 0)
    const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth(), Math.min(e.getDate(), prevLast.getDate()))
    const ps = toLocalDateString(prevStart)
    return { start: ps, end: toLocalDateString(prevEnd), label: monthName(ps) }
  }
  const len = Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000) + 1
  const prevEnd = shiftDays(start, -1)
  const label = preset === 'bugun' ? 'Dün' : preset === 'bu_hafta' ? 'Geçen hafta' : 'Önceki dönem'
  return { start: shiftDays(prevEnd, -(len - 1)), end: prevEnd, label }
}

function datesInRange(startStr: string, endStr: string): string[] {
  const out: string[] = []
  let cur = new Date(`${startStr}T00:00:00`)
  const end = new Date(`${endStr}T00:00:00`)
  while (cur <= end) {
    out.push(toLocalDateString(cur))
    cur = new Date(cur.getTime() + 86400000)
  }
  return out
}

// Bir calisanin, verilen tarih araligindaki izinli GUN kumesi.
function leaveDaysInRange(profileId: string, blocks: TimeBlock[], startStr: string, endStr: string): Set<string> {
  const days = new Set<string>()
  for (const b of blocks) {
    if (b.profile_id !== profileId) continue
    if (b.block_date !== null) {
      const blockEnd = b.end_date ?? b.block_date
      const s = b.block_date > startStr ? b.block_date : startStr
      const e = blockEnd < endStr ? blockEnd : endStr
      if (s > e) continue
      for (const d of datesInRange(s, e)) days.add(d)
    } else if (b.day_of_week !== null) {
      for (const d of datesInRange(startStr, endStr)) {
        if (new Date(`${d}T00:00:00`).getDay() === b.day_of_week) days.add(d)
      }
    }
  }
  return days
}

function scheduledMinutesInRange(profileId: string, schedules: Schedule[], blocks: TimeBlock[], startStr: string, endStr: string) {
  let total = 0
  const mySchedules = schedules.filter((s) => s.profile_id === profileId)
  const myBlocks = blocks.filter((b) => b.profile_id === profileId)
  for (const d of datesInRange(startStr, endStr)) {
    const dow = new Date(`${d}T00:00:00`).getDay()
    const daySchedules = mySchedules.filter((s) => s.day_of_week === dow)
    for (const s of daySchedules) {
      let minutes = timeToMinutes(s.ends_at.slice(0, 5)) - timeToMinutes(s.starts_at.slice(0, 5))
      for (const b of myBlocks) {
        const blockAppliesToday =
          b.day_of_week === dow || (b.block_date !== null && b.block_date <= d && d <= (b.end_date ?? b.block_date))
        if (!blockAppliesToday) continue
        const bs = Math.max(timeToMinutes(s.starts_at.slice(0, 5)), timeToMinutes(b.starts_at.slice(0, 5)))
        const be = Math.min(timeToMinutes(s.ends_at.slice(0, 5)), timeToMinutes(b.ends_at.slice(0, 5)))
        if (be > bs) minutes -= be - bs
      }
      total += Math.max(0, minutes)
    }
  }
  return total
}

export default function PerformanceReportPage() {
  const { profile } = useAuth()
  const [preset, setPreset] = useState<Preset>('bu_ay')
  const [customStart, setCustomStart] = useState(() => presetRange('bu_ay').start)
  const [customEnd, setCustomEnd] = useState(() => presetRange('bu_ay').end)
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [employeeServices, setEmployeeServices] = useState<EmployeeServiceRow[]>([])
  const [commissionPct, setCommissionPct] = useState(0)
  // Karsilastirma donemi (karnede "Eylül: 26" satiri icin).
  const [prevByEmployee, setPrevByEmployee] = useState<Map<string, { count: number; revenue: number }>>(new Map())
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pdfState, setPdfState] = useState<{ progress: number; step: string; error: string | null } | null>(null)

  const isCustom = preset === 'ozel'
  const { start: rangeStart, end: rangeEnd } = isCustom ? { start: customStart, end: customEnd } : presetRange(preset)
  const prev = useMemo(() => previousRange(preset, rangeStart, rangeEnd), [preset, rangeStart, rangeEnd])

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      setLoading(true)
      const [
        { data: profs },
        { data: appts },
        { data: svcs },
        { data: scheds },
        { data: blocks },
        { data: pays },
        { data: empSvcs },
        { data: settings },
        { data: prevAppts },
        { data: prevPays },
      ] = await Promise.all([
        supabase.from('profiles').select('id, full_name').order('full_name'),
        fetchAll(() =>
          supabase
            .from('appointments')
            .select('id, employee_id, customer_id, service_id, status, scheduled_at, duration_minutes, price_override, source')
            .gte('scheduled_at', `${rangeStart}T00:00:00`)
            .lte('scheduled_at', `${rangeEnd}T23:59:59`)
            .order('id'),
        ),
        supabase.from('services').select('id, name, price'),
        supabase.from('employee_schedules').select('profile_id, day_of_week, starts_at, ends_at'),
        supabase.from('employee_time_blocks').select('profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label'),
        fetchAll(() =>
          supabase
            .from('payments')
            .select('amount, paid_at, appointment_id')
            .is('voided_at', null)
            .gte('paid_at', rangeStart)
            .lte('paid_at', rangeEnd)
            .order('id'),
        ),
        supabase.from('employee_services').select('profile_id, service_id'),
        supabase.from('business_finance_settings').select('commission_pct').maybeSingle(),
        fetchAll(() =>
          supabase
            .from('appointments')
            .select('id, employee_id, status')
            .gte('scheduled_at', `${prev.start}T00:00:00`)
            .lte('scheduled_at', `${prev.end}T23:59:59`)
            .order('id'),
        ),
        fetchAll(() =>
          supabase
            .from('payments')
            .select('amount, appointment_id')
            .is('voided_at', null)
            .gte('paid_at', prev.start)
            .lte('paid_at', prev.end)
            .order('id'),
        ),
      ])
      if (cancelled) return
      setProfiles(profs ?? [])
      setAppointments(appts ?? [])
      setServices(svcs ?? [])
      setSchedules(scheds ?? [])
      setTimeBlocks(blocks ?? [])
      setPayments(pays ?? [])
      setEmployeeServices(empSvcs ?? [])
      setCommissionPct(settings?.commission_pct ?? 0)

      const prevMap = new Map<string, { count: number; revenue: number }>()
      const prevEmpByAppt = new Map((prevAppts ?? []).map((a) => [a.id, a.employee_id as string | null]))
      for (const a of prevAppts ?? []) {
        if (!a.employee_id || a.status !== 'tamamlandi') continue
        const cur = prevMap.get(a.employee_id) ?? { count: 0, revenue: 0 }
        cur.count += 1
        prevMap.set(a.employee_id, cur)
      }
      for (const p of prevPays ?? []) {
        const emp = p.appointment_id ? prevEmpByAppt.get(p.appointment_id) : null
        if (!emp) continue
        const cur = prevMap.get(emp) ?? { count: 0, revenue: 0 }
        cur.revenue += Number(p.amount)
        prevMap.set(emp, cur)
      }
      setPrevByEmployee(prevMap)
      setLoading(false)
    }
    loadData()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd])

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const appointmentById = useMemo(() => new Map(appointments.map((a) => [a.id, a])), [appointments])

  // Tahsilat, o odemenin bagli oldugu randevunun employee_id'sine gore
  // atfedilir — Kasa sayfasindaki calisan bazli ciro ile AYNI mantik,
  // boylece iki sayfadaki rakamlar tutarli olur (beklenen fiyat degil,
  // gercekten tahsil edilen tutar).
  const employeeStats = useMemo(() => {
    return profiles.map((p) => {
      const empAppts = appointments.filter((a) => a.employee_id === p.id)
      const completed = empAppts.filter((a) => a.status === 'tamamlandi')
      const notCancelled = empAppts.filter((a) => a.status !== 'iptal')
      const tahsilat = payments
        .filter((pay) => pay.appointment_id && appointmentById.get(pay.appointment_id)?.employee_id === p.id)
        .reduce((sum, pay) => sum + pay.amount, 0)
      const uniqueCustomers = new Set(empAppts.map((a) => a.customer_id).filter(Boolean)).size
      const leaveDays = leaveDaysInRange(p.id, timeBlocks, rangeStart, rangeEnd)
      const scheduledMinutes = scheduledMinutesInRange(p.id, schedules, timeBlocks, rangeStart, rangeEnd)
      const bookedMinutes = notCancelled.reduce((sum, a) => sum + (a.duration_minutes ?? 30), 0)
      const utilization = scheduledMinutes > 0 ? Math.min(100, (bookedMinutes / scheduledMinutes) * 100) : 0
      const completionRate = empAppts.length > 0 ? (completed.length / empAppts.length) * 100 : 0

      const serviceCounts = new Map<string, number>()
      for (const a of completed) {
        if (!a.service_id) continue
        serviceCounts.set(a.service_id, (serviceCounts.get(a.service_id) ?? 0) + 1)
      }
      const topServiceId = Array.from(serviceCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0]
      const sourceCounts = new Map<string, number>()
      for (const a of empAppts) {
        sourceCounts.set(a.source, (sourceCounts.get(a.source) ?? 0) + 1)
      }
      const myServiceNames = employeeServices
        .filter((es) => es.profile_id === p.id)
        .map((es) => serviceById.get(es.service_id)?.name)
        .filter((n): n is string => !!n)
      const serviceTag =
        myServiceNames.length > 0
          ? myServiceNames.slice(0, 2).join(' • ') + (myServiceNames.length > 2 ? ` +${myServiceNames.length - 2}` : '')
          : null

      return {
        profile: p,
        isBot: false as const,
        serviceTag,
        totalRandevu: empAppts.length,
        completedCount: completed.length,
        revenue: tahsilat,
        primOrani: commissionPct,
        primHakedis: tahsilat * (commissionPct / 100),
        uniqueCustomers,
        leaveDayCount: leaveDays.size,
        scheduledMinutes,
        bookedMinutes,
        utilization,
        completionRate,
        topServiceName: topServiceId ? (serviceById.get(topServiceId)?.name ?? null) : null,
        sourceCounts,
      }
    })
  }, [
    profiles,
    appointments,
    payments,
    appointmentById,
    serviceById,
    employeeServices,
    commissionPct,
    timeBlocks,
    schedules,
    rangeStart,
    rangeEnd,
  ])

  // Sahibi olmayan (employee_id=null) randevu/tahsilatlar — cogunlukla
  // chatbot/online rezervasyondan gelip henuz bir calisana atanmamis
  // kayitlar. Prim hak etmez, sadece bilgi amacli gosterilir.
  const botStats = useMemo(() => {
    const botAppts = appointments.filter((a) => !a.employee_id)
    const completed = botAppts.filter((a) => a.status === 'tamamlandi')
    const tahsilat = payments
      .filter((pay) => pay.appointment_id && !appointmentById.get(pay.appointment_id)?.employee_id)
      .reduce((sum, pay) => sum + pay.amount, 0)
    return { totalRandevu: botAppts.length, completedCount: completed.length, tahsilat }
  }, [appointments, payments, appointmentById])

  const toplamCalisan = profiles.length
  const toplamRandevu = employeeStats.reduce((s, e) => s + e.completedCount, 0) + botStats.completedCount
  const toplamTahsilat = payments.reduce((s, p) => s + p.amount, 0)
  const toplamPrimHakedis = employeeStats.reduce((s, e) => s + e.primHakedis, 0)
  const toplamIzin = employeeStats.reduce((s, e) => s + e.leaveDayCount, 0)

  // Calisanlar birbiriyle kiyaslanmiyor/siralanmiyor — liste her zaman
  // isme gore (alfabetik) gosterilir.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    const filtered = q ? employeeStats.filter((e) => (e.profile.full_name ?? '').toLocaleLowerCase('tr-TR').includes(q)) : employeeStats
    return filtered.slice().sort((a, b) => (a.profile.full_name ?? '').localeCompare(b.profile.full_name ?? '', 'tr-TR'))
  }, [employeeStats, search])

  const showBotRow =
    botStats.completedCount > 0 &&
    (!search.trim() || 'randevu al chatbot online'.includes(search.trim().toLocaleLowerCase('tr-TR')))

  async function handleExportPdf() {
    if (!profile?.business_id) return
    setPdfState({ progress: 0, step: 'Başlatılıyor…', error: null })
    try {
      await generatePerformanceReportPdf({
        businessId: profile.business_id,
        rangeStart,
        rangeEnd,
        kpis: {
          totalRandevu: toplamRandevu,
          kazandirilanTutar: toplamTahsilat,
          izinGunleri: toplamIzin,
          toplamCalisan,
        },
        employeeStats,
        currentAppts: appointments,
        serviceById,
        onProgress: (progress, step) => setPdfState({ progress, step, error: null }),
      })
      setPdfState(null)
    } catch (err) {
      setPdfState({ progress: 0, step: '', error: err instanceof Error ? err.message : 'Bilinmeyen bir hata oluştu.' })
    }
  }

  const periodButtonLabel =
    preset === 'bu_ay' || preset === 'gecen_ay'
      ? monthName(rangeStart)
      : preset === 'ozel'
        ? rangeText(rangeStart, rangeEnd)
        : (PRESETS.find((p) => p.value === preset)?.label ?? '')

  const periodControl = (
    <div className={styles.periodWrap}>
      <button
        type="button"
        className={styles.periodBtn}
        onClick={() => setPeriodMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={periodMenuOpen}
      >
        {periodButtonLabel} ▾
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
                  setPreset(p.value)
                  setPeriodMenuOpen(false)
                }}
              >
                {p.label}
                {preset === p.value && <CheckCircleIcon width={14} height={14} />}
              </button>
            ))}
            <button
              type="button"
              className={styles.periodMenuItem}
              onClick={() => {
                setCustomStart(rangeStart)
                setCustomEnd(rangeEnd)
                setPreset('ozel')
                setPeriodMenuOpen(false)
              }}
            >
              Özel aralık
              {isCustom && <CheckCircleIcon width={14} height={14} />}
            </button>
          </div>
        </>
      )}
    </div>
  )

  const customRange = isCustom && (
    <div className={styles.customRangeRow}>
      <div className={styles.dateField}>
        <label htmlFor="perfRangeStart">Başlangıç</label>
        <input
          id="perfRangeStart"
          type="date"
          value={customStart}
          max={customEnd}
          onChange={(e) => {
            if (e.target.value) setCustomStart(e.target.value)
          }}
        />
      </div>
      <div className={styles.dateField}>
        <label htmlFor="perfRangeEnd">Bitiş</label>
        <input
          id="perfRangeEnd"
          type="date"
          value={customEnd}
          min={customStart}
          onChange={(e) => {
            if (e.target.value) setCustomEnd(e.target.value)
          }}
        />
      </div>
    </div>
  )

  const selected = selectedId ? (employeeStats.find((e) => e.profile.id === selectedId) ?? null) : null

  // Karne: haftanin gunlerine gore doluluk (yalnizca mesaisi olan gunler).
  const weekdayFill = useMemo(() => {
    if (!selectedId) return []
    const sched = new Map<number, number>()
    const booked = new Map<number, number>()
    for (const d of datesInRange(rangeStart, rangeEnd)) {
      const dow = new Date(`${d}T00:00:00`).getDay()
      sched.set(dow, (sched.get(dow) ?? 0) + scheduledMinutesInRange(selectedId, schedules, timeBlocks, d, d))
    }
    for (const a of appointments) {
      if (a.employee_id !== selectedId || a.status === 'iptal') continue
      const dow = new Date(a.scheduled_at).getDay()
      booked.set(dow, (booked.get(dow) ?? 0) + (a.duration_minutes ?? 30))
    }
    return WEEK_ORDER.filter((dow) => (sched.get(dow) ?? 0) > 0).map((dow) => ({
      dow,
      pct: Math.min(100, Math.round(((booked.get(dow) ?? 0) / (sched.get(dow) ?? 1)) * 100)),
    }))
  }, [selectedId, appointments, schedules, timeBlocks, rangeStart, rangeEnd])

  if (selected) {
    const sources = Array.from(selected.sourceCounts.entries()).sort((a, b) => b[1] - a[1])
    const sourceMax = Math.max(1, ...sources.map(([, n]) => n))
    const prevStats = prevByEmployee.get(selected.profile.id) ?? { count: 0, revenue: 0 }
    const name = firstName(selected.profile.full_name)
    const titlePeriod = preset === 'bu_ay' || preset === 'gecen_ay' ? `${monthName(rangeStart)} karnesi` : 'karne'
    const leaves = timeBlocks
      .filter(
        (b) =>
          b.profile_id === selected.profile.id &&
          b.block_date !== null &&
          b.block_date <= rangeEnd &&
          (b.end_date ?? b.block_date) >= rangeStart,
      )
      .sort((a, b) => (a.block_date ?? '').localeCompare(b.block_date ?? ''))
    const firstLeave = leaves[0]
    const leaveDetail = firstLeave
      ? `${rangeText(firstLeave.block_date as string, firstLeave.end_date ?? (firstLeave.block_date as string))}${firstLeave.label ? ` · ${firstLeave.label.toLocaleLowerCase('tr')}` : ''}${leaves.length > 1 ? ` +${leaves.length - 1}` : ''}`
      : 'Bu dönemde izin yok'
    const maxPct = Math.max(0, ...weekdayFill.map((d) => d.pct))
    const best = weekdayFill.reduce<(typeof weekdayFill)[number] | null>((m, d) => (!m || d.pct > m.pct ? d : m), null)
    const worst = weekdayFill.reduce<(typeof weekdayFill)[number] | null>((m, d) => (!m || d.pct < m.pct ? d : m), null)
    let insight: string | null = null
    if (best && worst && weekdayFill.length >= 2) {
      insight =
        best.pct - worst.pct >= 20
          ? `En dolu gün ${DAY_LONG[best.dow]} (%${best.pct}), en boş gün ${DAY_LONG[worst.dow]} (%${worst.pct}). ${DAY_LONG[worst.dow]} için bir kampanya düşünülebilir.`
          : `Günler arasında belirgin bir fark yok; doluluk %${worst.pct} ile %${best.pct} arasında.`
    }

    function compareClass(now: number, before: number) {
      if (now > before) return styles.tileUp
      if (now < before) return styles.tileDown
      return styles.tileHint
    }

    return (
      <div className={styles.wrap}>
        <PageHeader
          back={() => setSelectedId(null)}
          title={`${name} · ${titlePeriod}`}
          sub={`${rangeText(rangeStart, rangeEnd)} arası`}
          action={periodControl}
        />
        {customRange}

        <div className={styles.chips}>
          {employeeStats.map((e) => (
            <button
              type="button"
              key={e.profile.id}
              className={e.profile.id === selected.profile.id ? styles.chipActive : styles.chip}
              onClick={() => setSelectedId(e.profile.id)}
            >
              {firstName(e.profile.full_name)}
            </button>
          ))}
        </div>

        {loading ? (
          <p className={styles.empty}>Yükleniyor…</p>
        ) : (
          <>
            <div className={styles.tiles}>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Randevu</span>
                <span className={styles.tileValue}>{selected.completedCount}</span>
                <span className={compareClass(selected.completedCount, prevStats.count)}>
                  {prev.label}: {prevStats.count}
                </span>
              </div>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Kazanç</span>
                <span className={styles.tileValue}>{currency.format(selected.revenue)}</span>
                <span className={compareClass(selected.revenue, prevStats.revenue)}>
                  {prev.label}: {currency.format(prevStats.revenue)}
                </span>
              </div>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>Doluluk</span>
                <span className={styles.tileValue}>%{Math.round(selected.utilization)}</span>
                <span className={styles.tileHint}>
                  {selected.scheduledMinutes > 0
                    ? `${Math.round(selected.scheduledMinutes / 60)} saat mesai · ${Math.round(selected.bookedMinutes / 60)} saat dolu`
                    : 'Mesai tanımlı değil'}
                </span>
              </div>
              <div className={styles.tile}>
                <span className={styles.tileLabel}>İzin</span>
                <span className={styles.tileValue}>{selected.leaveDayCount} gün</span>
                <span className={styles.tileHint}>{leaveDetail}</span>
              </div>
            </div>

            {weekdayFill.length > 0 && (
              <div className={styles.chartCard}>
                <span className={styles.cardTitle}>Hangi günler dolu?</span>
                <div className={styles.bars} style={{ gridTemplateColumns: `repeat(${weekdayFill.length}, minmax(0, 1fr))` }}>
                  {weekdayFill.map((d) => {
                    const top = d.pct === maxPct && maxPct > 0
                    return (
                      <div className={styles.barCol} key={d.dow}>
                        <span className={top ? styles.barPctTop : styles.barPct}>%{d.pct}</span>
                        <span
                          className={top ? styles.barTop : styles.bar}
                          style={{ height: `${Math.max(4, (d.pct / 100) * 60)}px` }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className={styles.barLabels} style={{ gridTemplateColumns: `repeat(${weekdayFill.length}, minmax(0, 1fr))` }}>
                  {weekdayFill.map((d) => (
                    <span key={d.dow} className={d.pct === maxPct && maxPct > 0 ? styles.barLabelTop : undefined}>
                      {DAY_SHORT[d.dow]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {insight && <div className={styles.insight}>{insight}</div>}

            <div className={styles.listCard}>
              {selected.primOrani > 0 && (
                <div className={styles.kvRow}>
                  <span className={styles.kvLabel}>Prim · %{selected.primOrani}</span>
                  <span className={`${styles.kvValue} ${styles.textWarm}`}>{currency.format(selected.primHakedis)}</span>
                </div>
              )}
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Farklı müşteri</span>
                <span className={styles.kvValue}>{selected.uniqueCustomers}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Tamamlama oranı</span>
                <span className={styles.kvValue}>
                  %{Math.round(selected.completionRate)} · {selected.completedCount}/{selected.totalRandevu}
                </span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>En çok yaptığı hizmet</span>
                <span className={styles.kvValue}>{selected.topServiceName ?? '—'}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Yaptığı hizmetler</span>
                <span className={styles.kvValue}>{selected.serviceTag ?? '—'}</span>
              </div>
            </div>

            {sources.length > 0 && (
              <div className={styles.chartCard}>
                <span className={styles.cardTitle}>Randevular nereden geldi?</span>
                {sources.map(([src, n]) => (
                  <div className={styles.barRow} key={src}>
                    <span className={styles.barRowLabel}>{SOURCE_LABEL[src] ?? src}</span>
                    <span className={styles.barTrack}>
                      <span className={styles.barFill} style={{ width: `${(n / sourceMax) * 100}%` }} />
                    </span>
                    <span className={styles.barValue}>{n}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <PageHeader back="/daha-fazla" title="Performans" action={periodControl} />
      {customRange}

      {loading ? (
        <p className={styles.empty}>Yükleniyor…</p>
      ) : (
        <>
          {profiles.length > 6 && (
            <div className={styles.searchBox}>
              <SearchIcon width={16} height={16} className={styles.searchIcon} />
              <input className={styles.searchInput} placeholder="Çalışan ara" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          )}

          {visibleRows.length === 0 && !showBotRow && <p className={styles.empty}>Sonuç bulunamadı.</p>}
          {visibleRows.map((e, i) => (
            <button type="button" key={e.profile.id} className={styles.card} onClick={() => setSelectedId(e.profile.id)}>
              <span className={styles.cardTop}>
                <span className={`${styles.avatar} ${styles[AVATAR_TONES[i % AVATAR_TONES.length]]}`}>
                  {firstName(e.profile.full_name).charAt(0).toLocaleUpperCase('tr')}
                </span>
                <span className={styles.cardWho}>
                  <span className={styles.cardName}>{e.profile.full_name ?? '—'}</span>
                  <span className={styles.cardSub}>{e.serviceTag ?? 'Hizmet atanmamış'}</span>
                </span>
                <span className={styles.chevron}>›</span>
              </span>
              <span className={styles.cardStats}>
                <span className={styles.cardStat}>
                  <span className={styles.cardStatValue}>{e.completedCount}</span>
                  <span className={styles.cardStatLabel}>randevu</span>
                </span>
                <span className={styles.cardStat}>
                  <span className={styles.cardStatValue}>{currency.format(e.revenue)}</span>
                  <span className={styles.cardStatLabel}>{e.primOrani > 0 ? `kazanç · prim ${currency.format(e.primHakedis)}` : 'kazanç'}</span>
                </span>
                <span className={styles.cardStat}>
                  <span className={styles.cardStatValue}>{e.leaveDayCount} gün</span>
                  <span className={styles.cardStatLabel}>izin</span>
                </span>
              </span>
            </button>
          ))}

          {showBotRow && (
            <div className={styles.card}>
              <span className={styles.cardTop}>
                <span className={`${styles.avatar} ${styles.toneBot}`}>
                  <RobotIcon width={20} height={20} />
                </span>
                <span className={styles.cardWho}>
                  <span className={styles.cardName}>Chatbot ve online randevu</span>
                  <span className={styles.cardSub}>Henüz bir çalışana atanmamış · prim yok</span>
                </span>
              </span>
              <span className={styles.cardStats2}>
                <span className={styles.cardStat}>
                  <span className={styles.cardStatValue}>{botStats.completedCount}</span>
                  <span className={styles.cardStatLabel}>randevu</span>
                </span>
                <span className={styles.cardStat}>
                  <span className={styles.cardStatValue}>{currency.format(botStats.tahsilat)}</span>
                  <span className={styles.cardStatLabel}>kazanç</span>
                </span>
              </span>
            </div>
          )}

          <div className={styles.totals}>
            <div className={styles.totalItem}>
              <span className={styles.totalValue}>{toplamRandevu.toLocaleString('tr-TR')}</span>
              <span className={styles.totalLabel}>toplam randevu</span>
            </div>
            <div className={styles.totalItem}>
              <span className={styles.totalValue}>{currency.format(toplamTahsilat)}</span>
              <span className={styles.totalLabel}>toplam kazanç</span>
            </div>
            <div className={styles.totalItem}>
              <span className={styles.totalValue}>{toplamIzin} gün</span>
              <span className={styles.totalLabel}>toplam izin</span>
            </div>
          </div>
          {commissionPct > 0 && (
            <span className={styles.note}>
              Prim toplamı {currency.format(toplamPrimHakedis)} · tahsilatın %{commissionPct}’i
            </span>
          )}

          <button type="button" className={styles.exportBtn} onClick={handleExportPdf}>
            <ReceiptIcon width={16} height={16} />
            Detaylı raporu PDF olarak al
          </button>
        </>
      )}

      {pdfState && (
        <PdfProgressModal progress={pdfState.progress} step={pdfState.step} error={pdfState.error} onClose={() => setPdfState(null)} />
      )}
    </div>
  )
}
