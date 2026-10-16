import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import styles from './EmployeeSchedulePage.module.css'
import { timeToMinutes, WEEK_ORDER, DAY_LONG } from '../lib/date'
import { BREAK_LABEL } from '../lib/scheduleLabels'

interface Employee {
  id: string
  full_name: string | null
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

function dayHours(draft: DayDraft): number {
  if (!draft.enabled) return 0
  let minutes = timeToMinutes(draft.end) - timeToMinutes(draft.start)
  for (const b of draft.breaks) minutes -= Math.max(0, timeToMinutes(b.end) - timeToMinutes(b.start))
  return Math.max(0, minutes) / 60
}

// 6 saatin altindaki calisma gunleri "Kisa Calisma" olarak etiketlenir —
// ör. Cumartesi 10:00-15:00 gibi yarim gun mesailer icin.
const SHORT_DAY_THRESHOLD_HOURS = 6



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

export default function EmployeeSchedulePage() {
  const { id } = useParams<{ id: string }>()

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)

  // "duzenle -> Kaydet" mantigiyla calisiyor (eskiden her tiklamada aninda
  // kaydediliyordu). dayDrafts sunucudan sadece BIR KERE (scheduleReady
  // false iken) dolduruluyor.
  const [dayDrafts, setDayDrafts] = useState<Record<number, DayDraft>>({})
  const [scheduleReady, setScheduleReady] = useState(false)
  const [savingSchedule, setSavingSchedule] = useState(false)
  // Acik (duzenlenen) gun — digerleri tek satir ozet olarak gorunur.
  const [openDay, setOpenDay] = useState<number>(() => new Date().getDay())

  async function loadData(silent = false) {
    if (!id) return
    if (!silent) setLoading(true)
    const [{ data: emp }, { data: scheds }, { data: blocks }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('id', id).maybeSingle(),
      supabase.from('employee_schedules').select('id, profile_id, day_of_week, starts_at, ends_at').eq('profile_id', id),
      supabase
        .from('employee_time_blocks')
        .select('id, profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label')
        .eq('profile_id', id),
    ])
    setEmployee(emp ?? null)
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

  if (loading) return <p className={styles.empty}>Yükleniyor…</p>
  if (!employee) return <p className={styles.empty}>Ekip üyesi bulunamadı.</p>

  const weekHours = WEEK_ORDER.reduce((sum, day) => sum + (dayDrafts[day] ? dayHours(dayDrafts[day]) : 0), 0)
  const hoursText = (h: number) => h.toLocaleString('tr-TR', { maximumFractionDigits: 1 })

  // Acik gunun saat + molalarini diger acik gunlere kopyala.
  function copyToOtherDays(day: number) {
    const src = dayDrafts[day]
    if (!src) return
    setDayDrafts((prev) => {
      const next = { ...prev }
      for (const d of WEEK_ORDER) {
        if (d === day || !prev[d]?.enabled) continue
        next[d] = {
          ...prev[d],
          start: src.start,
          end: src.end,
          // Var olan molalarin kayit kimlikleri korunur, fazlasi yeni mola olur.
          breaks: src.breaks.map((b, i) => ({
            id: crypto.randomUUID(),
            blockId: prev[d].breaks[i]?.blockId,
            start: b.start,
            end: b.end,
          })),
        }
      }
      return next
    })
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        back={`/ekip/${id}`}
        title="Çalışma saatleri"
        sub={`${employee.full_name ?? '—'} · haftada ${hoursText(weekHours)} saat`}
      />

      {!scheduleReady ? (
        <p className={styles.empty}>Yükleniyor…</p>
      ) : (
        <div className={styles.dayList}>
          {WEEK_ORDER.map((day) => {
            const draft = dayDrafts[day]
            if (!draft) return null
            const isOpen = openDay === day && draft.enabled
            const short = draft.enabled && dayHours(draft) < SHORT_DAY_THRESHOLD_HOURS
            const toggle = (
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={() => {
                    toggleDayEnabled(day)
                    if (!draft.enabled) setOpenDay(day)
                  }}
                  aria-label={`${DAY_LONG[day]} açık`}
                />
                <span className={styles.switchTrack} />
              </label>
            )

            if (!draft.enabled) {
              return (
                <div className={styles.dayRow} key={day}>
                  {toggle}
                  <span className={styles.dayRowNameOff}>{DAY_LONG[day]}</span>
                  <span className={styles.dayRowOff}>Çalışmıyor</span>
                </div>
              )
            }

            if (!isOpen) {
              return (
                <div className={styles.dayRow} key={day}>
                  {toggle}
                  <button type="button" className={styles.dayRowMain} onClick={() => setOpenDay(day)}>
                    <span className={styles.dayRowText}>
                      <span className={styles.dayRowName}>{DAY_LONG[day]}</span>
                      <span className={styles.dayRowSub}>
                        {draft.breaks.length > 0 ? `${draft.breaks.length} mola` : 'molasız'}
                      </span>
                    </span>
                    <span className={short ? `${styles.timeTag} ${styles.timeTagWarm}` : styles.timeTag}>{draft.start}</span>
                    <span className={short ? styles.timeDashWarm : styles.timeDash}>–</span>
                    <span className={short ? `${styles.timeTag} ${styles.timeTagWarm}` : styles.timeTag}>{draft.end}</span>
                  </button>
                </div>
              )
            }

            return (
              <div className={styles.dayCardOpen} key={day}>
                <div className={styles.dayOpenHead}>
                  {toggle}
                  <span className={styles.dayOpenName}>{DAY_LONG[day]}</span>
                  <span className={styles.dayOpenHours}>{hoursText(dayHours(draft))} saat</span>
                </div>

                <div className={styles.rangeRow}>
                  <span className={styles.rangeLabel}>Çalışma</span>
                  <input
                    type="time"
                    className={styles.timeBtn}
                    value={draft.start}
                    onChange={(e) => updateDay(day, { start: e.target.value })}
                    aria-label={`${DAY_LONG[day]} başlangıç`}
                  />
                  <span className={styles.timeDash}>–</span>
                  <input
                    type="time"
                    className={styles.timeBtn}
                    value={draft.end}
                    onChange={(e) => updateDay(day, { end: e.target.value })}
                    aria-label={`${DAY_LONG[day]} bitiş`}
                  />
                </div>

                {draft.breaks.map((b) => (
                  <div className={`${styles.rangeRow} ${styles.rangeRowBreak}`} key={b.id}>
                    <span className={styles.rangeLabel}>Mola</span>
                    <input
                      type="time"
                      className={styles.timeBtn}
                      value={b.start}
                      onChange={(e) => updateBreak(day, b.id, { start: e.target.value })}
                      aria-label="Mola başlangıç"
                    />
                    <span className={styles.timeDashWarm}>–</span>
                    <input
                      type="time"
                      className={styles.timeBtn}
                      value={b.end}
                      onChange={(e) => updateBreak(day, b.id, { end: e.target.value })}
                      aria-label="Mola bitiş"
                    />
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeBreak(day, b.id)}
                      aria-label="Molayı kaldır"
                    >
                      ×
                    </button>
                  </div>
                ))}

                <div className={styles.openActions}>
                  <button type="button" className={styles.addBreakBtn} onClick={() => addBreak(day)}>
                    + Mola ekle
                  </button>
                  <button type="button" className={styles.copyBtn} onClick={() => copyToOtherDays(day)}>
                    Diğer günlere kopyala
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={saveWeeklySchedule}
          disabled={savingSchedule || !scheduleReady}
        >
          {savingSchedule ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </div>
  )
}
