import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AlertTriangleIcon } from '../components/icons'
import PageHeader from '../components/PageHeader'
import { toLocalDateString } from '../lib/date'
import styles from './HolidaysPage.module.css'

// Resmi tatiller ayri bir tablo yerine mevcut employee_time_blocks
// altyapisi uzerinden, HER AKTIF CALISAN icin ayni tarih/etiketle tek tek
// satir eklenerek uygulaniyor — boylece randevu musaitligini kontrol eden
// tum edge function'lar (booking, public-booking-info...) hicbir degisiklik
// gerekmeden bu tatilleri otomatik olarak dikkate aliyor (zaten calisan
// bazli employee_time_blocks okuyorlar). "Resmi Tatil" etiketi bu satirlari
// kisisel izinlerden (Yillik Izin/Mazeret Izni) ayirt etmek icin kullanilir;
// liste bu etikete gore okundugu icin her tatil HEP bu etiketle kaydedilir.
const HOLIDAY_LABEL = 'Resmi Tatil'

// Tarihi her yil ayni olan resmi tatiller. Bayramlar (ay takvimine gore
// her yil kaydigi icin) burada yok — "Başka gün ekle" ile tarih araligi
// olarak eklenir.
const FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: 'Yılbaşı' },
  { month: 4, day: 23, name: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { month: 5, day: 1, name: 'Emek ve Dayanışma Günü' },
  { month: 5, day: 19, name: 'Atatürk’ü Anma, Gençlik ve Spor Bayramı' },
  { month: 7, day: 15, name: 'Demokrasi ve Millî Birlik Günü' },
  { month: 8, day: 30, name: 'Zafer Bayramı' },
  { month: 10, day: 29, name: 'Cumhuriyet Bayramı' },
]

interface Holiday {
  date: string
  endDate: string
}

interface HolidayConflict {
  id: string
  employeeName: string
  customerName: string
  serviceName: string
  scheduled_at: string
}

function todayLocalDateString() {
  return toLocalDateString(new Date())
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// Bugunden itibaren onumuzdeki 12 ay icindeki sabit tatiller, tarih sirasiyla.
function upcomingFixedHolidays() {
  const today = todayLocalDateString()
  const year = new Date().getFullYear()
  return [year, year + 1]
    .flatMap((y) => FIXED_HOLIDAYS.map((h) => ({ name: h.name, date: `${y}-${pad(h.month)}-${pad(h.day)}` })))
    .filter((h) => h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, FIXED_HOLIDAYS.length)
}

function longDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })
}

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [tab, setTab] = useState<'resmi' | 'kendi'>('resmi')
  const [mode, setMode] = useState<'day' | 'range'>('range')
  const [date, setDate] = useState(todayLocalDateString())
  const [endDate, setEndDate] = useState('')

  const [conflictWarningOpen, setConflictWarningOpen] = useState(false)
  const [pendingConflicts, setPendingConflicts] = useState<HolidayConflict[]>([])
  const [pendingRange, setPendingRange] = useState<Holiday | null>(null)

  async function loadData() {
    const [{ data: profs }, { data: blocks }] = await Promise.all([
      supabase.from('profiles').select('id').eq('is_active', true),
      supabase.from('employee_time_blocks').select('block_date, end_date').eq('label', HOLIDAY_LABEL).is('day_of_week', null),
    ])
    setEmployeeIds((profs ?? []).map((p) => p.id))

    const seen = new Map<string, Holiday>()
    for (const b of blocks ?? []) {
      if (!b.block_date) continue
      const end = b.end_date ?? b.block_date
      seen.set(`${b.block_date}|${end}`, { date: b.block_date, endDate: end })
    }
    setHolidays(Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date)))
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Resmi tatil TUM aktif calisana ayni anda uygulandigi icin devredilecek
  // baska bir calisan yok — bu yuzden burada EmployeeLeavesPage ile ayni
  // "aktar/dagit" akisi yerine sadece bir uyari gosterilir; admin
  // Randevular ekranindan elle iptal/tasima yapar.
  async function findHolidayConflicts(range: Holiday): Promise<HolidayConflict[]> {
    if (employeeIds.length === 0) return []
    const { data: appts } = await supabase
      .from('appointments')
      .select('id, employee_id, customer_id, service_id, scheduled_at, duration_minutes, status')
      .in('employee_id', employeeIds)
      .neq('status', 'iptal')
      .gte('scheduled_at', `${range.date}T00:00:00`)
      .lte('scheduled_at', `${range.endDate}T23:59:59`)

    const rows = appts ?? []
    if (rows.length === 0) return []

    const empIds = Array.from(new Set(rows.map((a) => a.employee_id).filter((v): v is string => !!v)))
    const custIds = Array.from(new Set(rows.map((a) => a.customer_id).filter((v): v is string => !!v)))
    const svcIds = Array.from(new Set(rows.map((a) => a.service_id).filter((v): v is string => !!v)))
    const [{ data: profs }, { data: custs }, { data: svcs }] = await Promise.all([
      empIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', empIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      custIds.length
        ? supabase.from('customers').select('id, full_name').in('id', custIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      svcIds.length
        ? supabase.from('services').select('id, name').in('id', svcIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])

    return rows
      .map((a) => ({
        id: a.id,
        employeeName: profs?.find((p) => p.id === a.employee_id)?.full_name ?? 'Çalışan',
        customerName: custs?.find((c) => c.id === a.customer_id)?.full_name ?? 'Müşteri',
        serviceName: svcs?.find((s) => s.id === a.service_id)?.name ?? 'Hizmet',
        scheduled_at: a.scheduled_at,
      }))
      .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
  }

  async function requestHoliday(range: Holiday) {
    if (employeeIds.length === 0) return
    setBusyKey(`${range.date}|${range.endDate}`)
    const found = await findHolidayConflicts(range)
    if (found.length > 0) {
      setPendingRange(range)
      setPendingConflicts(found)
      setConflictWarningOpen(true)
      setBusyKey(null)
      return
    }
    await addHoliday(range)
  }

  async function proceedAnyway() {
    setConflictWarningOpen(false)
    if (pendingRange) await addHoliday(pendingRange)
  }

  async function addHoliday(range: Holiday) {
    setBusyKey(`${range.date}|${range.endDate}`)
    const rows = employeeIds.map((profile_id) => ({
      profile_id,
      day_of_week: null,
      block_date: range.date,
      end_date: range.endDate,
      starts_at: '00:00',
      ends_at: '23:59',
      label: HOLIDAY_LABEL,
    }))
    await supabase.from('employee_time_blocks').insert(rows)
    setFormOpen(false)
    setMode('range')
    setDate(todayLocalDateString())
    setEndDate('')
    await loadData()
    setBusyKey(null)
  }

  async function removeHoliday(h: Holiday) {
    setBusyKey(`${h.date}|${h.endDate}`)
    await supabase.from('employee_time_blocks').delete().eq('label', HOLIDAY_LABEL).eq('block_date', h.date).eq('end_date', h.endDate)
    await loadData()
    setBusyKey(null)
  }

  if (loading) return <p className={styles.empty}>Yükleniyor…</p>

  const fixed = upcomingFixedHolidays()
  const fixedDates = new Set(fixed.map((f) => f.date))
  const today = todayLocalDateString()
  const others = holidays.filter((h) => !(h.date === h.endDate && fixedDates.has(h.date)) && h.endDate >= today)

  return (
    <div className={styles.wrap}>
      <PageHeader back="/ekip" title="Tatiller" />
      <span className={styles.intro}>
        Hangi günlerde salon kapalı? Açık bıraktıkların normal gün gibi çalışır.
      </span>

      <div className={styles.segmented}>
        <button type="button" className={tab === 'resmi' ? styles.segmentActive : styles.segment} onClick={() => setTab('resmi')}>
          Resmi tatiller
        </button>
        <button type="button" className={tab === 'kendi' ? styles.segmentActive : styles.segment} onClick={() => setTab('kendi')}>
          Kendi eklediklerim{others.length > 0 ? ` · ${others.length}` : ''}
        </button>
      </div>

      {tab === 'resmi' ? (
        <div className={styles.listCard}>
          {fixed.map((f) => {
            const existing = holidays.find((h) => h.date === f.date && h.endDate === f.date)
            const key = `${f.date}|${f.date}`
            return (
              <div className={styles.row} key={f.date}>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{f.name}</span>
                  <span className={styles.rowMeta}>{longDate(f.date)}</span>
                </span>
                <span className={existing ? styles.stateClosed : styles.stateOpen}>
                  {busyKey === key ? '…' : existing ? 'Kapalı' : 'Açık'}
                </span>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={!!existing}
                    disabled={busyKey !== null}
                    onChange={() => (existing ? removeHoliday(existing) : requestHoliday({ date: f.date, endDate: f.date }))}
                    aria-label={`${f.name} günü kapalı`}
                  />
                  <span className={styles.switchTrack} />
                </label>
              </div>
            )
          })}
        </div>
      ) : (
        <>
          {others.length === 0 ? (
            <p className={styles.empty}>Ramazan ve Kurban bayramı gibi tarihi her yıl değişen günleri buradan ekle.</p>
          ) : (
            <div className={styles.listCard}>
              {others.map((h) => {
                const days =
                  Math.round((new Date(`${h.endDate}T00:00:00`).getTime() - new Date(`${h.date}T00:00:00`).getTime()) / 86400000) + 1
                return (
                  <div className={styles.row} key={`${h.date}|${h.endDate}`}>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>
                        {h.endDate !== h.date
                          ? `${new Date(`${h.date}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${new Date(`${h.endDate}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`
                          : longDate(h.date)}
                      </span>
                      <span className={styles.rowMeta}>
                        {new Date(`${h.date}T00:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })} · {days} gün
                      </span>
                    </span>
                    <span className={styles.stateClosed}>Kapalı</span>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeHoliday(h)}
                      disabled={busyKey !== null}
                      aria-label="Kapalı günü kaldır"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <button type="button" className={styles.addBtn} onClick={() => setFormOpen(true)}>
            + Kapalı gün ekle
          </button>
        </>
      )}

      {formOpen && (
        <div className={styles.sheetBackdrop} onClick={() => setFormOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHead}>
              <h2>Kapalı gün ekle</h2>
              <button type="button" className={styles.sheetClose} onClick={() => setFormOpen(false)} aria-label="Kapat">
                ✕
              </button>
            </div>
            <div className={styles.segmented}>
              <button type="button" className={mode === 'day' ? styles.segmentActive : styles.segment} onClick={() => setMode('day')}>
                Tek gün
              </button>
              <button
                type="button"
                className={mode === 'range' ? styles.segmentActive : styles.segment}
                onClick={() => setMode('range')}
              >
                Tarih aralığı
              </button>
            </div>
            <div className={mode === 'range' ? styles.twoCol : undefined}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="holidayDate">{mode === 'range' ? 'Başlangıç' : 'Tarih'}</label>
                <input id="holidayDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {mode === 'range' && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="holidayEnd">Bitiş</label>
                  <input
                    id="holidayEnd"
                    type="date"
                    min={date || undefined}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={!date || busyKey !== null}
              onClick={() => requestHoliday({ date, endDate: mode === 'range' ? endDate || date : date })}
            >
              {busyKey !== null ? 'Kontrol ediliyor…' : `Kaydet · ${employeeIds.length} çalışan`}
            </button>
          </div>
        </div>
      )}

      {conflictWarningOpen && (
        <div className={styles.sheetBackdrop}>
          <div className={styles.sheet}>
            <div className={styles.conflictHeader}>
              <span className={styles.conflictHeaderIcon}>
                <AlertTriangleIcon width={20} height={20} />
              </span>
              <div>
                <div className={styles.conflictTitle}>{pendingConflicts.length} randevu bu tarihte var</div>
                <div className={styles.conflictSubtitle}>
                  Bunlar kendiliğinden değişmez; Randevular ekranından iptal etmen ya da taşıman gerekir.
                </div>
              </div>
            </div>
            <div className={styles.listCard}>
              {pendingConflicts.map((c) => (
                <div className={styles.row} key={c.id}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{c.customerName}</span>
                    <span className={styles.rowMeta}>
                      {c.serviceName} · {c.employeeName}
                    </span>
                  </span>
                  <span className={styles.rowMeta}>
                    {new Date(c.scheduled_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}{' '}
                    {new Date(c.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
            <button type="button" className="btn-primary" onClick={proceedAnyway} disabled={busyKey !== null}>
              Yine de kapat
            </button>
            <button type="button" className={styles.skipBtn} onClick={() => setConflictWarningOpen(false)}>
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
