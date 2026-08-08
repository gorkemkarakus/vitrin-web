import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { TIME_OPTIONS } from '../lib/timeOptions'
import Avatar, { colorForName } from '../components/Avatar'
import { CalendarIcon, ChevronRightIcon, CloseIcon, PhoneIcon, PlusIcon, TrashIcon } from '../components/icons'
import styles from './EmployeeDetailPage.module.css'

interface Category {
  id: string
  name: string
}

interface Employee {
  id: string
  full_name: string | null
  role: 'admin' | 'user'
  is_active: boolean
  whatsapp_phone: string | null
}

interface EmployeeCategory {
  profile_id: string
  category_id: string
}

interface Schedule {
  id: string
  profile_id: string
  day_of_week: number
  starts_at: string
  ends_at: string
}

interface TimeBlock {
  id: string
  profile_id: string
  day_of_week: number | null
  block_date: string | null
  end_date: string | null
  starts_at: string
  ends_at: string
  label: string | null
}

// Ogle molasi (BreakDraft) icin "id" sadece istemci tarafinda React key +
// duzenleme takibi amacli — "blockId" doluysa DB'deki mevcut bir
// employee_time_blocks satirina karsilik gelir (kaydet'te update), bos ise
// henuz kaydedilmemis yeni bir moladir (kaydet'te insert).
interface BreakDraft {
  id: string
  blockId?: string
  start: string
  end: string
}

interface DayDraft {
  enabled: boolean
  start: string
  end: string
  breaks: BreakDraft[]
}

// LeaveDraft de BreakDraft ile ayni mantik: "blockId" doluysa mevcut bir
// employee_time_blocks satirina karsilik gelir, bos ise henuz kaydedilmemis
// yeni bir izindir. Haftalik programdan farkli olarak izinler day_of_week
// DEGIL block_date/end_date ile tutulur (tek gunluk ya da tarih araligi).
interface LeaveDraft {
  id: string
  blockId?: string
  mode: 'day' | 'range'
  date: string
  endDate: string
  allDay: boolean
  start: string
  end: string
  label: string
}

const LEAVE_REASON_OPTIONS: { value: 'yillik' | 'mazeret'; label: string }[] = [
  { value: 'yillik', label: 'Yıllık İzin' },
  { value: 'mazeret', label: 'Mazeret İzni' },
]

const BREAK_LABEL = 'Öğle molası'

// Zaman cizelgesi (timeline) varsayilan olarak 06:00-19:00 araligini
// gosterir — cogu gunun mesai saati bu aralikta kaldigi icin bar daha
// okunakli/genis gorunur. Bir gunun saatleri bu araligin disina tasarsa
// (ör. 05:00'te baslama ya da 21:00'e kadar calisma) eksen sadece o kadar
// genisler, digerleri yine varsayilan 06-19 penceresinde kalir.
const DEFAULT_AXIS_START_MIN = 6 * 60
const DEFAULT_AXIS_END_MIN = 19 * 60

const DAY_LABELS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [6, 0]

const STATUS_LABEL: Record<'aktif' | 'izinli' | 'pasif', string> = {
  aktif: 'Aktif',
  izinli: 'İzinli',
  pasif: 'Pasif',
}

function todayLocalDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function roleLabel(role: Employee['role']) {
  return role === 'admin' ? 'Yönetici' : 'Çalışan'
}

function formatPhone(raw: string) {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length === 12) digits = digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1)
  if (digits.length !== 10) return raw
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function dayHours(draft: DayDraft): number {
  if (!draft.enabled) return 0
  let minutes = timeToMinutes(draft.end) - timeToMinutes(draft.start)
  for (const b of draft.breaks) minutes -= Math.max(0, timeToMinutes(b.end) - timeToMinutes(b.start))
  return Math.max(0, minutes) / 60
}

function formatHours(n: number): string {
  const rounded = Math.round(n * 2) / 2
  return rounded % 1 === 0 ? String(rounded) : String(rounded).replace('.', ',')
}

// Eksen (axis) araligini 5 esit parcaya bolup her noktayi en yakin saate
// yuvarlayarak "06 09 12 16 19" gibi okunakli etiketler uretir.
function axisTickLabels(axisStartMin: number, axisEndMin: number): string[] {
  const span = axisEndMin - axisStartMin
  const labels: string[] = []
  for (let i = 0; i <= 4; i++) {
    const minute = axisStartMin + (span * i) / 4
    const hour = Math.round(minute / 60) % 24
    labels.push(String(hour).padStart(2, '0'))
  }
  return labels
}

function buildDayDrafts(schedules: Schedule[], timeBlocks: TimeBlock[]): Record<number, DayDraft> {
  const map: Record<number, DayDraft> = {}
  for (const day of WEEK_ORDER) {
    const s = schedules.find((x) => x.day_of_week === day)
    const breaks = timeBlocks
      .filter((b) => b.day_of_week === day && b.label === BREAK_LABEL)
      .map((b) => ({ id: b.id, blockId: b.id, start: b.starts_at.slice(0, 5), end: b.ends_at.slice(0, 5) }))
    map[day] = {
      enabled: !!s,
      start: s ? s.starts_at.slice(0, 5) : '09:00',
      end: s ? s.ends_at.slice(0, 5) : '18:00',
      breaks,
    }
  }
  return map
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [employeeCategories, setEmployeeCategories] = useState<EmployeeCategory[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)

  // Haftalik Calisma Saatleri karti artik "duzenle -> Kaydet" mantigiyla
  // calisiyor (eskiden her tiklamada aninda kaydediliyordu). dayDrafts
  // sunucudan sadece BIR KERE (scheduleReady false iken) dolduruluyor ki
  // sayfadaki baska bir aksiyonun (kategori checkbox'i gibi) tetikledigi
  // loadData(true) kaydedilmemis taslagi silip suzmesin.
  const [dayDrafts, setDayDrafts] = useState<Record<number, DayDraft>>({})
  const [scheduleReady, setScheduleReady] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [jsonCopied, setJsonCopied] = useState(false)
  const [copiedDay, setCopiedDay] = useState<number | null>(null)

  // Izinli Gunler karti da haftalik program gibi "duzenle -> Kaydet"
  // mantigiyla calisiyor — leaveDrafts sunucudan sadece BIR KERE
  // (leaveReady false iken) dolduruluyor.
  const [leaveDrafts, setLeaveDrafts] = useState<LeaveDraft[]>([])
  const [leaveReady, setLeaveReady] = useState(false)
  const [savingLeaves, setSavingLeaves] = useState(false)
  const [leaveJsonCopied, setLeaveJsonCopied] = useState(false)

  const [leaveMode, setLeaveMode] = useState<'day' | 'range'>('day')
  const [leaveDate, setLeaveDate] = useState(todayLocalDateString())
  const [leaveEndDate, setLeaveEndDate] = useState('')
  const [leaveAllDay, setLeaveAllDay] = useState(true)
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState<'yillik' | 'mazeret'>('yillik')
  const [leaveLabel, setLeaveLabel] = useState('Yıllık İzin')

  async function loadData(silent = false) {
    if (!id) return
    if (!silent) setLoading(true)
    const [{ data: emp }, { data: cats }, { data: empCats }, { data: scheds }, { data: blocks }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, is_active, whatsapp_phone').eq('id', id).maybeSingle(),
      supabase.from('service_categories').select('id, name').order('name'),
      supabase.from('employee_categories').select('profile_id, category_id').eq('profile_id', id),
      supabase.from('employee_schedules').select('id, profile_id, day_of_week, starts_at, ends_at').eq('profile_id', id),
      supabase
        .from('employee_time_blocks')
        .select('id, profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label')
        .eq('profile_id', id),
    ])
    setEmployee(emp ?? null)
    setCategories(cats ?? [])
    setEmployeeCategories(empCats ?? [])
    setSchedules(scheds ?? [])
    setTimeBlocks(blocks ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (loading || scheduleReady) return
    setDayDrafts(buildDayDrafts(schedules, timeBlocks))
    setScheduleReady(true)
  }, [loading, scheduleReady, schedules, timeBlocks])

  useEffect(() => {
    if (loading || leaveReady) return
    setLeaveDrafts(
      timeBlocks
        .filter((b) => b.day_of_week === null)
        .map((b) => ({
          id: b.id,
          blockId: b.id,
          mode: b.end_date && b.end_date !== b.block_date ? 'range' : 'day',
          date: b.block_date ?? '',
          endDate: b.end_date ?? b.block_date ?? '',
          allDay: b.starts_at.slice(0, 5) <= '00:05' && b.ends_at.slice(0, 5) >= '23:55',
          start: b.starts_at.slice(0, 5),
          end: b.ends_at.slice(0, 5),
          label: b.label ?? '',
        })),
    )
    setLeaveReady(true)
  }, [loading, leaveReady, timeBlocks])

  const today = useMemo(() => todayLocalDateString(), [])

  async function toggleActive(active: boolean) {
    if (!id) return
    await supabase.from('profiles').update({ is_active: active }).eq('id', id)
    await loadData(true)
  }

  async function toggleCategory(categoryId: string, checked: boolean) {
    if (!id) return
    if (checked) {
      await supabase.from('employee_categories').insert({ profile_id: id, category_id: categoryId })
    } else {
      await supabase.from('employee_categories').delete().eq('profile_id', id).eq('category_id', categoryId)
    }
    await loadData(true)
  }

  function updateDay(day: number, patch: Partial<Pick<DayDraft, 'start' | 'end'>>) {
    setDayDrafts((prev) => {
      const current = prev[day]
      if (!current) return prev
      return { ...prev, [day]: { ...current, ...patch } }
    })
  }

  function toggleDayEnabled(day: number) {
    setDayDrafts((prev) => {
      const current = prev[day]
      if (!current) return prev
      return { ...prev, [day]: { ...current, enabled: !current.enabled } }
    })
  }

  function applyPreset(target: 'weekdays' | 'weekend' | 'all' | 'none') {
    const activeDays = target === 'weekdays' ? WEEKDAYS : target === 'weekend' ? WEEKEND : target === 'all' ? WEEK_ORDER : []
    setDayDrafts((prev) => {
      const next = { ...prev }
      for (const day of WEEK_ORDER) {
        if (!next[day]) continue
        next[day] = { ...next[day], enabled: activeDays.includes(day) }
      }
      return next
    })
  }

  function addBreak(day: number) {
    setDayDrafts((prev) => {
      const current = prev[day]
      if (!current) return prev
      const newBreak: BreakDraft = { id: crypto.randomUUID(), start: '12:00', end: '13:00' }
      return { ...prev, [day]: { ...current, breaks: [...current.breaks, newBreak] } }
    })
  }

  function removeBreak(day: number, breakId: string) {
    setDayDrafts((prev) => {
      const current = prev[day]
      if (!current) return prev
      return { ...prev, [day]: { ...current, breaks: current.breaks.filter((b) => b.id !== breakId) } }
    })
  }

  function updateBreak(day: number, breakId: string, patch: Partial<Pick<BreakDraft, 'start' | 'end'>>) {
    setDayDrafts((prev) => {
      const current = prev[day]
      if (!current) return prev
      return { ...prev, [day]: { ...current, breaks: current.breaks.map((b) => (b.id === breakId ? { ...b, ...patch } : b)) } }
    })
  }

  // Bir gunun program+mola duzenini, o an ACIK olan diger tum gunlere kopyalar.
  function copyDayToOthers(day: number) {
    setDayDrafts((prev) => {
      const source = prev[day]
      if (!source) return prev
      const next = { ...prev }
      for (const d of WEEK_ORDER) {
        if (d === day || !next[d]?.enabled) continue
        next[d] = {
          ...next[d],
          start: source.start,
          end: source.end,
          breaks: source.breaks.map((b) => ({ id: crypto.randomUUID(), start: b.start, end: b.end })),
        }
      }
      return next
    })
    setCopiedDay(day)
    setTimeout(() => setCopiedDay((v) => (v === day ? null : v)), 1200)
  }

  async function saveWeeklySchedule() {
    if (!id) return
    setSavingSchedule(true)
    const ops: PromiseLike<unknown>[] = []

    for (const day of WEEK_ORDER) {
      const draft = dayDrafts[day]
      if (!draft) continue
      const existingSchedule = schedules.find((s) => s.day_of_week === day)
      const existingBreaks = timeBlocks.filter((b) => b.day_of_week === day && b.label === BREAK_LABEL)

      if (!draft.enabled) {
        if (existingSchedule) ops.push(supabase.from('employee_schedules').delete().eq('id', existingSchedule.id))
        for (const b of existingBreaks) ops.push(supabase.from('employee_time_blocks').delete().eq('id', b.id))
        continue
      }

      if (existingSchedule) {
        ops.push(
          supabase.from('employee_schedules').update({ starts_at: draft.start, ends_at: draft.end }).eq('id', existingSchedule.id),
        )
      } else {
        ops.push(
          supabase.from('employee_schedules').insert({ profile_id: id, day_of_week: day, starts_at: draft.start, ends_at: draft.end }),
        )
      }

      const keepIds = new Set(draft.breaks.filter((b) => b.blockId).map((b) => b.blockId))
      for (const b of existingBreaks) {
        if (!keepIds.has(b.id)) ops.push(supabase.from('employee_time_blocks').delete().eq('id', b.id))
      }
      for (const b of draft.breaks) {
        if (b.blockId) {
          const existing = existingBreaks.find((x) => x.id === b.blockId)
          if (existing && (existing.starts_at.slice(0, 5) !== b.start || existing.ends_at.slice(0, 5) !== b.end)) {
            ops.push(supabase.from('employee_time_blocks').update({ starts_at: b.start, ends_at: b.end }).eq('id', b.blockId))
          }
        } else {
          ops.push(
            supabase.from('employee_time_blocks').insert({
              profile_id: id,
              day_of_week: day,
              block_date: null,
              end_date: null,
              starts_at: b.start,
              ends_at: b.end,
              label: BREAK_LABEL,
            }),
          )
        }
      }
    }

    await Promise.all(ops)
    setScheduleReady(false)
    await loadData(true)
    setSavingSchedule(false)
  }

  function scheduleJson() {
    return JSON.stringify(
      WEEK_ORDER.map((day) => {
        const draft = dayDrafts[day]
        return {
          gun: DAY_LABELS[day],
          acik: draft?.enabled ?? false,
          baslangic: draft?.enabled ? draft.start : null,
          bitis: draft?.enabled ? draft.end : null,
          molalar: draft?.enabled ? draft.breaks.map((b) => ({ baslangic: b.start, bitis: b.end })) : [],
        }
      }),
      null,
      2,
    )
  }

  function copyJson() {
    navigator.clipboard.writeText(scheduleJson())
    setJsonCopied(true)
    setTimeout(() => setJsonCopied(false), 2000)
  }

  function addLeaveDraft() {
    if (!leaveDate) return
    if (!leaveAllDay && (!leaveStart || !leaveEnd)) return
    const newDraft: LeaveDraft = {
      id: crypto.randomUUID(),
      mode: leaveMode,
      date: leaveDate,
      endDate: leaveMode === 'range' ? leaveEndDate || leaveDate : leaveDate,
      allDay: leaveAllDay,
      start: leaveAllDay ? '00:00' : leaveStart,
      end: leaveAllDay ? '23:59' : leaveEnd,
      label: leaveLabel.trim(),
    }
    setLeaveDrafts((prev) => [...prev, newDraft])
    setLeaveMode('day')
    setLeaveDate(todayLocalDateString())
    setLeaveEndDate('')
    setLeaveAllDay(true)
    setLeaveStart('')
    setLeaveEnd('')
    setLeaveReason('yillik')
    setLeaveLabel('Yıllık İzin')
  }

  function removeLeaveDraft(draftId: string) {
    setLeaveDrafts((prev) => prev.filter((d) => d.id !== draftId))
  }

  function leavesJson() {
    return JSON.stringify(
      leaveDrafts.map((d) => ({
        baslangic: d.date,
        bitis: d.mode === 'range' ? d.endDate : d.date,
        tumGunKapali: d.allDay,
        baslangicSaati: d.allDay ? null : d.start,
        bitisSaati: d.allDay ? null : d.end,
        etiket: d.label || null,
      })),
      null,
      2,
    )
  }

  function copyLeavesJson() {
    navigator.clipboard.writeText(leavesJson())
    setLeaveJsonCopied(true)
    setTimeout(() => setLeaveJsonCopied(false), 2000)
  }

  async function saveLeaves() {
    if (!id) return
    setSavingLeaves(true)
    const keepIds = new Set(leaveDrafts.filter((d) => d.blockId).map((d) => d.blockId))
    const existingLeaveBlocks = timeBlocks.filter((b) => b.day_of_week === null)
    const ops: PromiseLike<unknown>[] = []
    for (const b of existingLeaveBlocks) {
      if (!keepIds.has(b.id)) ops.push(supabase.from('employee_time_blocks').delete().eq('id', b.id))
    }
    for (const d of leaveDrafts) {
      if (d.blockId) continue
      ops.push(
        supabase.from('employee_time_blocks').insert({
          profile_id: id,
          day_of_week: null,
          block_date: d.date,
          end_date: d.endDate || d.date,
          starts_at: d.start,
          ends_at: d.end,
          label: d.label || null,
        }),
      )
    }
    await Promise.all(ops)
    setLeaveReady(false)
    await loadData(true)
    setSavingLeaves(false)
  }

  if (loading) return <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>
  if (!employee) return <p style={{ color: 'var(--text-dim)' }}>Ekip üyesi bulunamadı.</p>

  const status: 'aktif' | 'izinli' | 'pasif' = !employee.is_active
    ? 'pasif'
    : timeBlocks.some((b) => b.block_date !== null && b.block_date <= today && today <= (b.end_date ?? b.block_date))
      ? 'izinli'
      : 'aktif'

  const empCategoryIds = new Set(employeeCategories.map((ec) => ec.category_id))

  const totalWeeklyHours = WEEK_ORDER.reduce((sum, day) => sum + (dayDrafts[day] ? dayHours(dayDrafts[day]) : 0), 0)
  const openDaysCount = WEEK_ORDER.filter((day) => dayDrafts[day]?.enabled).length

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate('/ekip')}>
        <ChevronRightIcon width={14} height={14} className={styles.backIcon} />
        Ekibe Dön
      </button>

      <div className={`card ${styles.headerCard}`}>
        <Avatar name={employee.full_name ?? '?'} size={56} />
        <div className={styles.headerInfo}>
          <span className={styles.headerName}>{employee.full_name ?? '—'}</span>
          <span className={styles.headerLine}>{roleLabel(employee.role)}</span>
          {employee.whatsapp_phone && (
            <span className={styles.headerLine}>
              <PhoneIcon width={12} height={12} />
              {formatPhone(employee.whatsapp_phone)}
            </span>
          )}
        </div>
        <span className={`${styles.statusPill} ${styles[`statusPill_${status}`]}`}>{STATUS_LABEL[status]}</span>
      </div>

      {employee.id !== profile?.id && employee.role !== 'admin' && (
        <div className={`card ${styles.activeToggleRow}`}>
          <span>
            Durum: <strong>{employee.is_active ? 'Aktif' : 'Pasif'}</strong>
          </span>
          <button type="button" className="btn-secondary" onClick={() => toggleActive(!employee.is_active)}>
            {employee.is_active ? 'Pasife Al' : 'Aktifleştir'}
          </button>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Alanlar</h2>
        <div className={styles.categoryCheckboxes}>
          {categories.map((c) => {
            const active = empCategoryIds.has(c.id)
            return (
              <button
                type="button"
                key={c.id}
                className={active ? styles.categoryChipActive : styles.categoryChip}
                onClick={() => toggleCategory(c.id, !active)}
              >
                {active ? '✓ ' : ''}
                {c.name}
              </button>
            )
          })}
          {categories.length === 0 && <span className={styles.empty}>Önce bir alan ekleyin.</span>}
        </div>

        {empCategoryIds.size > 0 && (
          <div className={styles.employeeTags}>
            {categories
              .filter((c) => empCategoryIds.has(c.id))
              .map((c) => (
                <span key={c.id} className={styles.hashtag} style={{ color: colorForName(c.name) }}>
                  #{c.name.replace(/\s+/g, '')}
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className={styles.scheduleHeader}>
          <div>
            <h2 style={{ marginBottom: 4 }}>Haftalık Çalışma Saatleri</h2>
            <p className={styles.scheduleSubtitle}>Müşterilerin randevu alabileceği gün ve saatleri belirle.</p>
          </div>
          <div className={styles.scheduleTotalBlock}>
            <span className={styles.scheduleTotalValue}>{formatHours(totalWeeklyHours)}</span>
            <span className={styles.scheduleTotalLabel}>saat / hafta</span>
          </div>
        </div>

        <div className={styles.presetRow}>
          <button type="button" className={styles.presetPill} onClick={() => applyPreset('weekdays')}>
            Hafta içi
          </button>
          <button type="button" className={styles.presetPill} onClick={() => applyPreset('weekend')}>
            Hafta sonu
          </button>
          <button type="button" className={styles.presetPill} onClick={() => applyPreset('all')}>
            Her gün
          </button>
          <button type="button" className={styles.presetPill} onClick={() => applyPreset('none')}>
            Temizle
          </button>
        </div>

        {!scheduleReady ? (
          <p style={{ color: 'var(--text-dim)', marginTop: 16 }}>Yükleniyor…</p>
        ) : (
          <>
            <div className={styles.dayList}>
              {WEEK_ORDER.map((day) => {
                const draft = dayDrafts[day]
                if (!draft) return null
                const hours = dayHours(draft)

                if (!draft.enabled) {
                  return (
                    <div className={styles.dayOffRow} key={day}>
                      <label className={styles.switch}>
                        <input type="checkbox" checked={false} onChange={() => toggleDayEnabled(day)} />
                        <span className={styles.switchTrack} />
                      </label>
                      <div className={styles.dayInfo}>
                        <span className={styles.dayName}>{DAY_LABELS[day]}</span>
                        <span className={styles.dayHours}>Kapalı</span>
                      </div>
                    </div>
                  )
                }

                const barStartMin = timeToMinutes(draft.start)
                const barEndMin = timeToMinutes(draft.end)
                const barSpan = Math.max(1, barEndMin - barStartMin)
                const axisStartMin = Math.min(DEFAULT_AXIS_START_MIN, barStartMin)
                const axisEndMin = Math.max(DEFAULT_AXIS_END_MIN, barEndMin)
                const axisSpan = Math.max(1, axisEndMin - axisStartMin)
                const axisTicks = axisTickLabels(axisStartMin, axisEndMin)

                return (
                  <div className={styles.dayRow} key={day}>
                    <div className={styles.dayRowTop}>
                      <label className={styles.switch}>
                        <input type="checkbox" checked={draft.enabled} onChange={() => toggleDayEnabled(day)} />
                        <span className={styles.switchTrack} />
                      </label>
                      <div className={styles.dayInfo}>
                        <span className={styles.dayName}>{DAY_LABELS[day]}</span>
                        <span className={styles.dayHours}>{formatHours(hours)} saat</span>
                      </div>

                      <div className={styles.dayTimesRow}>
                        <input
                          type="time"
                          className={styles.timeInput}
                          value={draft.start}
                          onChange={(e) => updateDay(day, { start: e.target.value })}
                        />
                        <span className={styles.timeSep}>–</span>
                        <input
                          type="time"
                          className={styles.timeInput}
                          value={draft.end}
                          onChange={(e) => updateDay(day, { end: e.target.value })}
                        />

                        {draft.breaks.map((b) => (
                          <div className={styles.breakTag} key={b.id}>
                            <div className={styles.breakTagHead}>
                              <span className={styles.breakTagIcon}>☕</span>
                              <span className={styles.breakTagLabel}>{BREAK_LABEL}</span>
                              <button
                                type="button"
                                className={styles.breakRemoveBtn}
                                onClick={() => removeBreak(day, b.id)}
                                aria-label="Molayı kaldır"
                              >
                                <CloseIcon width={10} height={10} />
                              </button>
                            </div>
                            <div className={styles.breakTagTimes}>
                              <input
                                type="time"
                                className={styles.breakTimeInput}
                                value={b.start}
                                onChange={(e) => updateBreak(day, b.id, { start: e.target.value })}
                              />
                              <span className={styles.timeSep}>–</span>
                              <input
                                type="time"
                                className={styles.breakTimeInput}
                                value={b.end}
                                onChange={(e) => updateBreak(day, b.id, { end: e.target.value })}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.scheduleActionsRow}>
                      <button type="button" className={styles.addBreakBtn} onClick={() => addBreak(day)}>
                        + Öğle molası ekle
                      </button>
                      <button
                        type="button"
                        className={copiedDay === day ? styles.copyAllBtnCopied : styles.copyAllBtn}
                        onClick={() => copyDayToOthers(day)}
                      >
                        {copiedDay === day ? 'Kopyalandı ✓' : 'Tüm günlere kopyala'}
                      </button>
                    </div>

                    <div className={styles.timelineTrackWrap}>
                      <div className={styles.timelineTrack}>
                        <div
                          className={styles.timelineBar}
                          style={{
                            left: `${((barStartMin - axisStartMin) / axisSpan) * 100}%`,
                            width: `${(barSpan / axisSpan) * 100}%`,
                          }}
                        >
                          {draft.breaks.map((b) => {
                            const bStart = Math.max(barStartMin, timeToMinutes(b.start))
                            const bEnd = Math.min(barEndMin, timeToMinutes(b.end))
                            if (bEnd <= bStart) return null
                            return (
                              <span
                                key={b.id}
                                className={styles.timelineBreak}
                                style={{
                                  left: `${((bStart - barStartMin) / barSpan) * 100}%`,
                                  width: `${((bEnd - bStart) / barSpan) * 100}%`,
                                }}
                              />
                            )
                          })}
                        </div>
                      </div>
                      <div className={styles.timelineTicks}>
                        {axisTicks.map((t, i) => (
                          <span key={i}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className={styles.scheduleFooter}>
              <span className={styles.scheduleFooterSummary}>
                {openDaysCount} gün açık • haftada {formatHours(totalWeeklyHours)} saat
              </span>
              <div className={styles.scheduleFooterActions}>
                <button type="button" className={styles.jsonLink} onClick={copyJson}>
                  {jsonCopied ? 'Kopyalandı ✓' : 'JSON çıktısı'}
                </button>
                <button
                  type="button"
                  className={`btn-primary ${styles.saveBtn}`}
                  onClick={saveWeeklySchedule}
                  disabled={savingSchedule}
                >
                  {savingSchedule ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 4 }}>İzinli Günler</h2>
        <p className={styles.scheduleSubtitle} style={{ marginBottom: 16 }}>
          Yıllık izin veya tek günlük kapanışları buradan tanımla. Bu günlerde randevu alınamaz.
        </p>

        <div className={styles.leaveModeToggle}>
          <button
            type="button"
            className={leaveMode === 'day' ? styles.leaveModeTabActive : styles.leaveModeTab}
            onClick={() => setLeaveMode('day')}
          >
            Tek gün
          </button>
          <button
            type="button"
            className={leaveMode === 'range' ? styles.leaveModeTabActive : styles.leaveModeTab}
            onClick={() => setLeaveMode('range')}
          >
            Tarih aralığı
          </button>
        </div>

        <div className={styles.leaveField}>
          <label>{leaveMode === 'range' ? 'Başlangıç Tarihi' : 'Tarih'}</label>
          <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
        </div>

        {leaveMode === 'range' && (
          <div className={styles.leaveField}>
            <label>Bitiş Tarihi</label>
            <input
              type="date"
              min={leaveDate || undefined}
              value={leaveEndDate}
              onChange={(e) => setLeaveEndDate(e.target.value)}
            />
          </div>
        )}

        <div className={styles.leaveAllDayRow}>
          <label className={styles.switch}>
            <input type="checkbox" checked={leaveAllDay} onChange={() => setLeaveAllDay((v) => !v)} />
            <span className={styles.switchTrack} />
          </label>
          <span>Tüm gün kapalı</span>
        </div>

        {!leaveAllDay && (
          <div className={styles.timeRow} style={{ marginBottom: 16 }}>
            <div className={styles.timeField}>
              <label>Başlangıç</label>
              <select value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)}>
                <option value="">--:--</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <span className={styles.timeSep}>–</span>
            <div className={styles.timeField}>
              <label>Bitiş</label>
              <select value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)}>
                <option value="">--:--</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className={styles.leaveReasonRow}>
          {LEAVE_REASON_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={leaveReason === opt.value ? styles.leaveReasonChipActive : styles.leaveReasonChip}
              onClick={() => {
                setLeaveReason(opt.value)
                setLeaveLabel(opt.label)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className={styles.leaveLabelField}>
          <label>Etiket (opsiyonel)</label>
          <input value={leaveLabel} onChange={(e) => setLeaveLabel(e.target.value)} placeholder="ör. Yıllık İzin" />
        </div>

        <button type="button" className={`btn-primary ${styles.addLeaveBtn}`} onClick={addLeaveDraft}>
          <PlusIcon width={15} height={15} /> İzin Ekle
        </button>

        <div className={styles.leaveListLabel}>Tanımlı İzinler</div>

        {leaveDrafts.length === 0 ? (
          <div className={styles.leaveEmpty}>
            <CalendarIcon width={22} height={22} />
            Henüz izin günü eklenmedi.
          </div>
        ) : (
          <div className={styles.leaveList}>
            {leaveDrafts.map((d) => (
              <div className={styles.leaveRow} key={d.id}>
                <div>
                  <div className={styles.leaveRowDate}>
                    {d.mode === 'range' && d.endDate !== d.date
                      ? `${new Date(d.date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${new Date(d.endDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`
                      : new Date(d.date + 'T00:00:00').toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                  </div>
                  <div className={styles.leaveRowMeta}>
                    {d.allDay ? 'Tüm gün kapalı' : `${d.start} – ${d.end}`}
                    {d.label ? ` • ${d.label}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.leaveRemoveBtn}
                  onClick={() => removeLeaveDraft(d.id)}
                  aria-label="İzni kaldır"
                >
                  <TrashIcon width={13} height={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.scheduleFooter}>
          <span className={styles.scheduleFooterSummary}>
            {leaveDrafts.length === 0 ? 'İzin tanımlı değil' : `${leaveDrafts.length} izin tanımlı`}
          </span>
          <div className={styles.scheduleFooterActions}>
            <button type="button" className={styles.jsonLink} onClick={copyLeavesJson}>
              {leaveJsonCopied ? 'Kopyalandı ✓' : 'JSON çıktısı'}
            </button>
            <button type="button" className={`btn-primary ${styles.saveBtn}`} onClick={saveLeaves} disabled={savingLeaves}>
              {savingLeaves ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
