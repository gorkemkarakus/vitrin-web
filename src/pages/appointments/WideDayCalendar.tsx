import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { timeToMinutes } from '../../lib/date'
import type { Appointment, Profile, Schedule, TimeBlock } from './types'
import styles from './WideDayCalendar.module.css'

// Genis ekran gun takvimi: her calisan bir sutun, randevular saat bloklari.
// Bloga tikla = detay; surukle = saat / calisan degistir (15 dk adim); bos
// alana tikla = o saat ve calisanla yeni randevu. Mesai disi ve izinler gri.

const PX_PER_MIN = 1.2
const SNAP = 15
const UNASSIGNED = '__atanmamis__'

const STATUS_LABEL: Record<Appointment['status'], string> = {
  bekliyor: 'Bekliyor',
  onaylandi: 'Onaylandı',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
  gelmedi: 'Gelmedi',
}

interface Props {
  date: string
  appointments: Appointment[]
  profiles: Profile[]
  schedules: Schedule[]
  timeBlocks: TimeBlock[]
  employeeFilter: string
  // Herkesin randevularini gorme izni olmayan calisan: yalniz kendi sutunu
  // (+ randevusunu gorebildigi sutunlar); digerleri yaniltici sekilde bos gorunurdu.
  ownOnly?: string | null
  customerName: (id: string | null) => string
  serviceName: (id: string | null) => string
  serviceDuration: (id: string | null) => number
  canEdit: (a: Appointment) => boolean
  onOpen: (a: Appointment) => void
  onMove: (a: Appointment, employeeId: string | null, start: Date) => void
  onCreate: (employeeId: string | null, date: string, time: string) => void
}

interface Drag {
  id: string
  startX: number
  startY: number
  moved: boolean
  deltaMin: number
  col: number
}

function hhmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export default function WideDayCalendar({
  date,
  appointments,
  profiles,
  schedules,
  timeBlocks,
  employeeFilter,
  ownOnly,
  customerName,
  serviceName,
  serviceDuration,
  canEdit,
  onOpen,
  onMove,
  onCreate,
}: Props) {
  const weekday = new Date(`${date}T00:00:00`).getDay()
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const dayAppts = useMemo(
    () =>
      appointments.filter((a) => {
        if (a.status === 'iptal') return false
        const d = new Date(a.scheduled_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return key === date
      }),
    [appointments, date],
  )

  // Sutunlar: o gun calisanlar + randevusu olanlar (+ atanmamis randevu varsa).
  const columns = useMemo(() => {
    const working = new Set(schedules.filter((s) => s.day_of_week === weekday).map((s) => s.profile_id))
    const withAppts = new Set(dayAppts.map((a) => a.employee_id).filter(Boolean) as string[])
    let cols = profiles
      .filter((p) => working.has(p.id) || withAppts.has(p.id))
      .map((p) => ({ id: p.id, name: p.full_name ?? 'Çalışan' }))
    if (ownOnly) cols = cols.filter((c) => c.id === ownOnly || withAppts.has(c.id))
    if (employeeFilter) cols = cols.filter((c) => c.id === employeeFilter)
    if (!employeeFilter && dayAppts.some((a) => !a.employee_id)) cols.push({ id: UNASSIGNED, name: 'Atanmamış' })
    return cols
  }, [profiles, schedules, weekday, dayAppts, employeeFilter, ownOnly])

  // Gun araligi: mesailerin ve randevularin kapsadigi saatler (en az 09–20).
  const [dayStart, dayEnd] = useMemo(() => {
    let start = 9 * 60
    let end = 20 * 60
    for (const s of schedules.filter((x) => x.day_of_week === weekday)) {
      start = Math.min(start, timeToMinutes(s.starts_at))
      end = Math.max(end, timeToMinutes(s.ends_at))
    }
    for (const a of dayAppts) {
      const d = new Date(a.scheduled_at)
      const m = d.getHours() * 60 + d.getMinutes()
      start = Math.min(start, m)
      end = Math.max(end, m + (a.duration_minutes ?? serviceDuration(a.service_id)))
    }
    return [Math.floor(start / 60) * 60, Math.min(24 * 60, Math.ceil(end / 60) * 60)]
  }, [schedules, weekday, dayAppts, serviceDuration])

  const height = (dayEnd - dayStart) * PX_PER_MIN
  const hours = Array.from({ length: (dayEnd - dayStart) / 60 + 1 }, (_, i) => dayStart + i * 60)

  // Calisanin o gun calismadigi araliklar (gri).
  function offRanges(profileId: string): [number, number][] {
    if (profileId === UNASSIGNED) return []
    const sched = schedules.filter((s) => s.profile_id === profileId && s.day_of_week === weekday)
    const ranges: [number, number][] = []
    if (sched.length === 0) ranges.push([dayStart, dayEnd])
    else {
      const work = sched
        .map((s) => [timeToMinutes(s.starts_at), timeToMinutes(s.ends_at)] as [number, number])
        .sort((a, b) => a[0] - b[0])
      let cursor = dayStart
      for (const [s, e] of work) {
        if (s > cursor) ranges.push([cursor, s])
        cursor = Math.max(cursor, e)
      }
      if (cursor < dayEnd) ranges.push([cursor, dayEnd])
    }
    for (const b of timeBlocks.filter((t) => t.profile_id === profileId)) {
      const applies =
        (b.block_date && b.block_date <= date && (b.end_date ?? b.block_date) >= date) ||
        (!b.block_date && b.day_of_week === weekday)
      if (applies) ranges.push([timeToMinutes(b.starts_at), timeToMinutes(b.ends_at)])
    }
    return ranges
  }

  // Bugunse simdiki saat cizgisi; ilk acilista mesai basina / simdiye kaydir.
  const now = new Date()
  const isToday =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` ===
    date
  const nowMin = now.getHours() * 60 + now.getMinutes()
  useEffect(() => {
    const target = isToday ? Math.max(dayStart, nowMin - 90) : dayStart
    scrollRef.current?.scrollTo({ top: (target - dayStart) * PX_PER_MIN })
  }, [date, dayStart, isToday, nowMin])

  function colIndexAt(clientX: number) {
    const grid = gridRef.current
    if (!grid || columns.length === 0) return -1
    const rect = grid.getBoundingClientRect()
    const w = rect.width / columns.length
    return Math.max(0, Math.min(columns.length - 1, Math.floor((clientX - rect.left) / w)))
  }

  function onBlockDown(e: ReactPointerEvent, a: Appointment, col: number) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: a.id, startX: e.clientX, startY: e.clientY, moved: false, deltaMin: 0, col })
  }

  function onBlockMove(e: ReactPointerEvent, a: Appointment) {
    if (!drag || drag.id !== a.id) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const moved = drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4
    if (!moved || !canEdit(a) || a.status === 'tamamlandi') return
    setDrag({
      ...drag,
      moved: true,
      deltaMin: Math.round(dy / PX_PER_MIN / SNAP) * SNAP,
      col: colIndexAt(e.clientX),
    })
  }

  function onBlockUp(a: Appointment, origCol: number, startMin: number) {
    const d = drag
    setDrag(null)
    if (!d || d.id !== a.id) return
    if (!d.moved) {
      onOpen(a)
      return
    }
    const newStartMin = startMin + d.deltaMin
    if (d.col === origCol && d.deltaMin === 0) return
    const target = columns[d.col]
    const start = new Date(`${date}T${hhmm(newStartMin)}:00`)
    onMove(a, !target || target.id === UNASSIGNED ? null : target.id, start)
  }

  function onColumnClick(e: React.MouseEvent<HTMLDivElement>, colId: string) {
    if (e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = dayStart + Math.floor((e.clientY - rect.top) / PX_PER_MIN / SNAP) * SNAP
    onCreate(colId === UNASSIGNED ? null : colId, date, hhmm(min))
  }

  if (columns.length === 0) {
    return (
      <div className={styles.empty}>
        Bu gün çalışan yok. Çalışma saatlerini Ekip &gt; çalışan &gt; Çalışma saatleri’nden girebilirsin.
      </div>
    )
  }

  return (
    <div className={styles.calendar} onKeyDown={(e) => e.key === 'Escape' && setDrag(null)}>
      <div
        className={styles.head}
        style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(140px, 1fr))` }}
      >
        <span />
        {columns.map((c) => {
          const count = dayAppts.filter((a) => (a.employee_id ?? UNASSIGNED) === c.id).length
          return (
            <div key={c.id} className={styles.colHead}>
              <span className={styles.colName}>{c.name}</span>
              <span className={styles.colCount}>{count > 0 ? `${count} randevu` : 'Boş'}</span>
            </div>
          )
        })}
      </div>
      <div className={styles.scroll} ref={scrollRef}>
        <div
          className={styles.body}
          style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(140px, 1fr))` }}
        >
          <div className={styles.gutter} style={{ height }}>
            {hours.map((h) => (
              <span key={h} className={styles.hour} style={{ top: (h - dayStart) * PX_PER_MIN }}>
                {hhmm(h)}
              </span>
            ))}
          </div>
          <div
            className={styles.columns}
            ref={gridRef}
            style={{
              gridColumn: `2 / span ${columns.length}`,
              gridTemplateColumns: `repeat(${columns.length}, minmax(140px, 1fr))`,
            }}
          >
            {columns.map((c, colIdx) => (
              <div
                key={c.id}
                className={styles.column}
                style={{ height }}
                onClick={(e) => onColumnClick(e, c.id)}
                title="Boş alana tıkla: bu saatte yeni randevu"
              >
                {hours.slice(1).map((h) => (
                  <span key={h} className={styles.hourLine} style={{ top: (h - dayStart) * PX_PER_MIN }} />
                ))}
                {offRanges(c.id).map(([s, e], i) => (
                  <span
                    key={i}
                    className={styles.off}
                    style={{
                      top: (Math.max(s, dayStart) - dayStart) * PX_PER_MIN,
                      height: (Math.min(e, dayEnd) - Math.max(s, dayStart)) * PX_PER_MIN,
                    }}
                  />
                ))}
                {isToday && nowMin >= dayStart && nowMin <= dayEnd && (
                  <span className={styles.now} style={{ top: (nowMin - dayStart) * PX_PER_MIN }} />
                )}
                {dayAppts
                  .filter((a) => (a.employee_id ?? UNASSIGNED) === c.id)
                  .map((a) => {
                    const d = new Date(a.scheduled_at)
                    const startMin = d.getHours() * 60 + d.getMinutes()
                    const dur = a.duration_minutes ?? serviceDuration(a.service_id)
                    const editable = canEdit(a) && a.status !== 'tamamlandi'
                    const dragging = drag?.id === a.id && drag.moved
                    const top = (startMin + (dragging ? drag.deltaMin : 0) - dayStart) * PX_PER_MIN
                    const shiftCols = dragging ? drag.col - colIdx : 0
                    return (
                      <button
                        type="button"
                        key={a.id}
                        className={`${styles.block} ${styles[`st_${a.status}`]} ${dragging ? styles.dragging : ''} ${editable ? styles.movable : ''}`}
                        style={{
                          top,
                          height: Math.max(26, dur * PX_PER_MIN - 2),
                          // Blok sutundan 2x4px dar, sutunlar arasi 8px: sutun basina %100 + 16px.
                          transform: shiftCols
                            ? `translateX(calc(${shiftCols * 100}% + ${shiftCols * 16}px))`
                            : undefined,
                        }}
                        onPointerDown={(e) => onBlockDown(e, a, colIdx)}
                        onPointerMove={(e) => onBlockMove(e, a)}
                        onPointerUp={() => onBlockUp(a, colIdx, startMin)}
                        onPointerCancel={() => setDrag(null)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onOpen(a)
                          }
                        }}
                        aria-label={`${hhmm(startMin)} ${customerName(a.customer_id)}, ${serviceName(a.service_id)}, ${STATUS_LABEL[a.status]}`}
                      >
                        {dur < 40 ? (
                          // Kisa randevu: saat ve ad tek satirda (iki satir sigmiyor).
                          <span className={styles.blockLine}>
                            <span className={styles.blockTime}>{hhmm(startMin + (dragging ? drag.deltaMin : 0))}</span>{' '}
                            <span className={styles.blockName}>{customerName(a.customer_id)}</span>
                          </span>
                        ) : (
                          <>
                            <span className={styles.blockTime}>
                              {dragging ? hhmm(startMin + drag.deltaMin) : hhmm(startMin)}–
                              {hhmm(startMin + (dragging ? drag.deltaMin : 0) + dur)}
                            </span>
                            <span className={styles.blockName}>{customerName(a.customer_id)}</span>
                            <span className={styles.blockService}>{serviceName(a.service_id)}</span>
                          </>
                        )}
                      </button>
                    )
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
