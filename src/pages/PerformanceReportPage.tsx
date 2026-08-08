import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import {
  CalendarIcon,
  WalletIcon,
  UmbrellaIcon,
  UsersIcon,
  ChevronRightIcon,
  TagIcon,
} from '../components/icons'
import styles from './PerformanceReportPage.module.css'

interface Profile {
  id: string
  full_name: string | null
  created_at: string
}

interface Appointment {
  id: string
  employee_id: string | null
  customer_id: string | null
  service_id: string | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal'
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
}

interface Payment {
  amount: number
  paid_at: string
}

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

type Preset = 'bugun' | 'bu_hafta' | 'bu_ay' | 'gecen_ay' | 'ozel'

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'bugun', label: 'Bugün' },
  { value: 'bu_hafta', label: 'Bu Hafta' },
  { value: 'bu_ay', label: 'Bu Ay' },
  { value: 'gecen_ay', label: 'Geçen Ay' },
  { value: 'ozel', label: 'Özel Tarih' },
]

const SOURCE_LABEL: Record<string, string> = {
  reklam_instagram: 'Instagram Reklamı',
  reklam_whatsapp: 'WhatsApp Reklamı',
  kullanici_uzerinden: 'Çalışan Üzerinden',
  dogrudan_musteri: 'Doğrudan Müşteri',
  chatbot: 'Chatbot',
  online_randevu: 'Online Randevu',
  diger: 'Diğer',
}

function toLocalDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function presetRange(preset: Preset): { start: string; end: string } {
  const today = new Date()
  switch (preset) {
    case 'bugun':
      return { start: toLocalDateString(today), end: toLocalDateString(today) }
    case 'bu_hafta': {
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

function timeStringToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function dateStrOf(iso: string) {
  return toLocalDateString(new Date(iso))
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

// Bir calisanin, verilen tarih araligindaki izinli GUN sayisini hesaplar —
// hem haftalik tekrar eden (day_of_week) hem tarih araligi (block_date..
// end_date) bloklari kapsar, ayni gune denk gelen birden fazla blok tek
// gun sayilir (Set).
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

// Bir calisanin, verilen tarih araliginda TOPLAM musait (mesai) dakikasi —
// haftalik programindan, o araliktaki her gun icin uygun gunlerin
// sure toplami. Izin/bloke saatler ayri dusuluyor (kismi blok olsa bile).
function scheduledMinutesInRange(profileId: string, schedules: Schedule[], blocks: TimeBlock[], startStr: string, endStr: string) {
  let total = 0
  const mySchedules = schedules.filter((s) => s.profile_id === profileId)
  const myBlocks = blocks.filter((b) => b.profile_id === profileId)
  for (const d of datesInRange(startStr, endStr)) {
    const dow = new Date(`${d}T00:00:00`).getDay()
    const daySchedules = mySchedules.filter((s) => s.day_of_week === dow)
    for (const s of daySchedules) {
      let minutes = timeStringToMinutes(s.ends_at.slice(0, 5)) - timeStringToMinutes(s.starts_at.slice(0, 5))
      for (const b of myBlocks) {
        const blockAppliesToday =
          b.day_of_week === dow || (b.block_date !== null && b.block_date <= d && d <= (b.end_date ?? b.block_date))
        if (!blockAppliesToday) continue
        const bs = Math.max(timeStringToMinutes(s.starts_at.slice(0, 5)), timeStringToMinutes(b.starts_at.slice(0, 5)))
        const be = Math.min(timeStringToMinutes(s.ends_at.slice(0, 5)), timeStringToMinutes(b.ends_at.slice(0, 5)))
        if (be > bs) minutes -= be - bs
      }
      total += Math.max(0, minutes)
    }
  }
  return total
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const w = 100
  const h = 34
  const stepX = w / (data.length - 1)
  const coords = data.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 4) - 2] as const)
  const linePoints = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
  const areaPoints = [...linePoints, `${w},${h}`, `0,${h}`]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={styles.sparkline} aria-hidden="true">
      <polygon points={areaPoints.join(' ')} fill={color} opacity={0.12} />
      <path d={`M${linePoints.join(' L')}`} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KpiCard({
  icon,
  iconBg,
  color,
  label,
  value,
  deltaPct,
  deltaNeutral,
  sparkData,
}: {
  icon: ReactNode
  iconBg: string
  color: string
  label: string
  value: string
  deltaPct: number | null
  deltaNeutral?: boolean
  sparkData: number[]
}) {
  const up = (deltaPct ?? 0) >= 0
  const deltaClass = deltaNeutral
    ? styles.kpiDeltaNeutral
    : up
      ? styles.kpiDeltaUp
      : styles.kpiDeltaDown
  return (
    <div className={styles.kpiCard}>
      <span className={styles.kpiIcon} style={{ background: iconBg, color }}>
        {icon}
      </span>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
      {deltaPct !== null && (
        <span className={deltaClass}>
          {up ? '↑' : '↓'} %{Math.abs(deltaPct).toFixed(1)} <span className={styles.kpiDeltaSub}>önceki döneme göre</span>
        </span>
      )}
      <div className={styles.kpiSparkWrap}>
        <Sparkline data={sparkData} color={color} />
      </div>
    </div>
  )
}

export default function PerformanceReportPage() {
  const [preset, setPreset] = useState<Preset>('bu_ay')
  const [customStart, setCustomStart] = useState(() => presetRange('bu_ay').start)
  const [customEnd, setCustomEnd] = useState(() => presetRange('bu_ay').end)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { start: rangeStart, end: rangeEnd } = preset === 'ozel' ? { start: customStart, end: customEnd } : presetRange(preset)

  const periodDays = Math.max(
    1,
    Math.round((new Date(`${rangeEnd}T00:00:00`).getTime() - new Date(`${rangeStart}T00:00:00`).getTime()) / 86400000) + 1,
  )
  const prevEndDate = new Date(`${rangeStart}T00:00:00`)
  prevEndDate.setDate(prevEndDate.getDate() - 1)
  const prevStartDate = new Date(prevEndDate)
  prevStartDate.setDate(prevEndDate.getDate() - periodDays + 1)
  const prevStart = toLocalDateString(prevStartDate)
  const prevEnd = toLocalDateString(prevEndDate)

  // Sparkline'lar secili donemden BAGIMSIZ olarak her zaman son 14 gunu
  // gosterir — "Bugün" gibi tek gunluk secimlerde bile anlamli bir egri
  // olsun diye (2 nokta az degil, 14 nokta duzgun bir cizgi verir).
  const sparklineStart = toLocalDateString(new Date(Date.now() - 13 * 86400000))
  const sparklineDates = useMemo(() => datesInRange(sparklineStart, toLocalDateString(new Date())), [sparklineStart])

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      setLoading(true)
      const fetchStart = [sparklineStart, prevStart].sort()[0]
      const [{ data: profs }, { data: appts }, { data: svcs }, { data: scheds }, { data: blocks }, { data: pays }] =
        await Promise.all([
          supabase.from('profiles').select('id, full_name, created_at').order('full_name'),
          supabase
            .from('appointments')
            .select('id, employee_id, customer_id, service_id, status, scheduled_at, duration_minutes, price_override, source')
            .gte('scheduled_at', `${fetchStart}T00:00:00`)
            .lte('scheduled_at', `${rangeEnd}T23:59:59`),
          supabase.from('services').select('id, name, price'),
          supabase.from('employee_schedules').select('profile_id, day_of_week, starts_at, ends_at'),
          supabase.from('employee_time_blocks').select('profile_id, day_of_week, block_date, end_date, starts_at, ends_at'),
          supabase.from('payments').select('amount, paid_at').gte('paid_at', fetchStart).lte('paid_at', rangeEnd),
        ])
      if (cancelled) return
      setProfiles(profs ?? [])
      setAppointments(appts ?? [])
      setServices(svcs ?? [])
      setSchedules(scheds ?? [])
      setTimeBlocks(blocks ?? [])
      setPayments(pays ?? [])
      setLoading(false)
    }
    loadData()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd])

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])

  const currentAppts = useMemo(
    () => appointments.filter((a) => dateStrOf(a.scheduled_at) >= rangeStart && dateStrOf(a.scheduled_at) <= rangeEnd),
    [appointments, rangeStart, rangeEnd],
  )
  const prevAppts = useMemo(
    () => appointments.filter((a) => dateStrOf(a.scheduled_at) >= prevStart && dateStrOf(a.scheduled_at) <= prevEnd),
    [appointments, prevStart, prevEnd],
  )
  const currentPayments = useMemo(
    () => payments.filter((p) => p.paid_at >= rangeStart && p.paid_at <= rangeEnd),
    [payments, rangeStart, rangeEnd],
  )
  const prevPayments = useMemo(
    () => payments.filter((p) => p.paid_at >= prevStart && p.paid_at <= prevEnd),
    [payments, prevStart, prevEnd],
  )

  function pctChange(current: number, prev: number): number | null {
    if (prev === 0) return current === 0 ? null : 100
    return ((current - prev) / prev) * 100
  }

  // ---- Ust ozet KPI kartlari ----
  const totalRandevu = currentAppts.length
  const prevTotalRandevu = prevAppts.length
  const kazandirilanTutar = currentPayments.reduce((s, p) => s + p.amount, 0)
  const prevKazandirilanTutar = prevPayments.reduce((s, p) => s + p.amount, 0)

  const allLeaveDaySet = useMemo(() => {
    const set = new Set<string>()
    for (const p of profiles) {
      for (const d of leaveDaysInRange(p.id, timeBlocks, rangeStart, rangeEnd)) set.add(`${p.id}_${d}`)
    }
    return set
  }, [profiles, timeBlocks, rangeStart, rangeEnd])
  const prevLeaveDaySet = useMemo(() => {
    const set = new Set<string>()
    for (const p of profiles) {
      for (const d of leaveDaysInRange(p.id, timeBlocks, prevStart, prevEnd)) set.add(`${p.id}_${d}`)
    }
    return set
  }, [profiles, timeBlocks, prevStart, prevEnd])

  const sparkRandevu = useMemo(
    () => sparklineDates.map((d) => appointments.filter((a) => dateStrOf(a.scheduled_at) === d).length),
    [appointments, sparklineDates],
  )
  const sparkKazanc = useMemo(
    () => sparklineDates.map((d) => payments.filter((p) => p.paid_at === d).reduce((s, p) => s + p.amount, 0)),
    [payments, sparklineDates],
  )
  const sparkIzin = useMemo(
    () =>
      sparklineDates.map((d) =>
        profiles.reduce((sum, p) => sum + (leaveDaysInRange(p.id, timeBlocks, d, d).size > 0 ? 1 : 0), 0),
      ),
    [profiles, timeBlocks, sparklineDates],
  )
  const sparkCalisan = useMemo(
    () => sparklineDates.map((d) => profiles.filter((p) => dateStrOf(p.created_at) <= d).length),
    [profiles, sparklineDates],
  )

  // ---- Calisan bazinda performans ----
  const employeeStats = useMemo(() => {
    const base = profiles.map((p) => {
      const empAppts = currentAppts.filter((a) => a.employee_id === p.id)
      const completed = empAppts.filter((a) => a.status === 'tamamlandi')
      const notCancelled = empAppts.filter((a) => a.status !== 'iptal')
      const revenue = completed.reduce(
        (sum, a) => sum + (a.price_override ?? serviceById.get(a.service_id ?? '')?.price ?? 0),
        0,
      )
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

      return {
        profile: p,
        totalRandevu: empAppts.length,
        completedCount: completed.length,
        revenue,
        uniqueCustomers,
        leaveDayCount: leaveDays.size,
        utilization,
        completionRate,
        topServiceName: topServiceId ? (serviceById.get(topServiceId)?.name ?? null) : null,
        sourceCounts,
      }
    })

    return base
  }, [profiles, currentAppts, serviceById, timeBlocks, schedules, rangeStart, rangeEnd])

  const toplamCalisan = profiles.length
  const prevToplamCalisan = profiles.filter((p) => dateStrOf(p.created_at) <= prevEnd).length

  return (
    <div className={styles.wrap}>
      <div className={styles.presetRow}>
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={preset === p.value ? styles.presetBtnActive : styles.presetBtn}
            onClick={() => setPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'ozel' && (
        <div className={`card ${styles.customRangeRow}`}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="perfRangeStart">Başlangıç</label>
            <input
              id="perfRangeStart"
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="perfRangeEnd">Bitiş</label>
            <input
              id="perfRangeEnd"
              type="date"
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Yükleniyor…</p>
      ) : (
        <>
          <div className={styles.kpiGrid}>
            <KpiCard
              icon={<CalendarIcon width={16} height={16} />}
              iconBg="#ede9fe"
              color="#8b5cf6"
              label="Toplam Randevu"
              value={totalRandevu.toLocaleString('tr-TR')}
              deltaPct={pctChange(totalRandevu, prevTotalRandevu)}
              sparkData={sparkRandevu}
            />
            <KpiCard
              icon={<WalletIcon width={16} height={16} />}
              iconBg="#d1fae5"
              color="#0e9668"
              label="Kazandırılan Tutar"
              value={currency.format(kazandirilanTutar)}
              deltaPct={pctChange(kazandirilanTutar, prevKazandirilanTutar)}
              sparkData={sparkKazanc}
            />
            <KpiCard
              icon={<UmbrellaIcon width={16} height={16} />}
              iconBg="#fef3c7"
              color="#d97706"
              label="İzin Günleri"
              value={allLeaveDaySet.size.toLocaleString('tr-TR')}
              deltaPct={pctChange(allLeaveDaySet.size, prevLeaveDaySet.size)}
              deltaNeutral
              sparkData={sparkIzin}
            />
            <KpiCard
              icon={<UsersIcon width={16} height={16} />}
              iconBg="#dbeafe"
              color="#2563eb"
              label="Toplam Çalışan"
              value={toplamCalisan.toLocaleString('tr-TR')}
              deltaPct={pctChange(toplamCalisan, prevToplamCalisan)}
              deltaNeutral
              sparkData={sparkCalisan}
            />
          </div>

          <h2 className={styles.sectionLabel}>Çalışan Performansı</h2>
          <div className={styles.employeeList}>
            {employeeStats.length === 0 && <p className={styles.empty}>Bu dönemde veri bulunamadı.</p>}
            {employeeStats.map((e) => {
              const isOpen = expandedId === e.profile.id
              return (
                <div key={e.profile.id} className="card">
                  <button
                    type="button"
                    className={styles.employeeRow}
                    onClick={() => setExpandedId(isOpen ? null : e.profile.id)}
                  >
                    <Avatar name={e.profile.full_name ?? '—'} size={40} />
                    <div className={styles.employeeMain}>
                      <span className={styles.employeeName}>{e.profile.full_name ?? '—'}</span>
                      <div className={styles.employeeStatsRow}>
                        <div className={styles.employeeStat}>
                          <span className={styles.employeeStatValue}>{e.totalRandevu}</span>
                          <span className={styles.employeeStatLabel}>Randevu</span>
                        </div>
                        <div className={styles.employeeStat}>
                          <span className={styles.employeeStatValue}>{currency.format(e.revenue)}</span>
                          <span className={styles.employeeStatLabel}>Kazanç</span>
                        </div>
                        <div className={styles.employeeStat}>
                          <span className={styles.employeeStatValue}>{e.leaveDayCount}</span>
                          <span className={styles.employeeStatLabel}>İzin Günü</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRightIcon
                      width={16}
                      height={16}
                      className={`${styles.employeeChevron} ${isOpen ? styles.employeeChevronOpen : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div className={styles.employeeDetail}>
                      <div className={styles.employeeDetailRow}>
                        <span className={styles.employeeDetailLabel}>Tamamlanma Oranı</span>
                        <span className={styles.employeeDetailValue}>%{e.completionRate.toFixed(0)}</span>
                      </div>
                      <div className={styles.employeeDetailRow}>
                        <span className={styles.employeeDetailLabel}>Doluluk Oranı</span>
                        <span className={styles.employeeDetailValue}>%{e.utilization.toFixed(0)}</span>
                      </div>
                      <div className={styles.employeeDetailRow}>
                        <span className={styles.employeeDetailLabel}>Benzersiz Müşteri</span>
                        <span className={styles.employeeDetailValue}>{e.uniqueCustomers}</span>
                      </div>
                      {e.topServiceName && (
                        <div className={styles.employeeDetailRow}>
                          <span className={styles.employeeDetailLabel}>
                            <TagIcon width={12} height={12} /> En Çok Yapılan Hizmet
                          </span>
                          <span className={styles.employeeDetailValue}>{e.topServiceName}</span>
                        </div>
                      )}
                      {e.sourceCounts.size > 0 && (
                        <div className={styles.employeeSourceRow}>
                          {Array.from(e.sourceCounts.entries()).map(([src, count]) => (
                            <span key={src} className={styles.employeeSourceChip}>
                              {SOURCE_LABEL[src] ?? src} · {count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
