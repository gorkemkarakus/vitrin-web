import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { TIME_OPTIONS } from '../lib/timeOptions'
import Avatar, { colorForName } from '../components/Avatar'
import {
  TrashIcon,
  SearchIcon,
  FilterIcon,
  CheckCircleIcon,
  UserPlusIcon,
  ClockIcon,
  MailIcon,
  PhoneIcon,
  MoreHorizontalIcon,
} from '../components/icons'
import styles from './TeamPage.module.css'

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

interface Appointment {
  id: string
  employee_id: string | null
  service_id: string | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal'
  scheduled_at: string
}

interface Payment {
  id: string
  amount: number
  appointment_id: string | null
}

const DAY_LABELS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
// Haftanin gorsel sirasi: Pazartesi'den basla, Pazar'la bitir (DAY_LABELS'daki
// index'ler Postgres EXTRACT(DOW) kuralina gore: 0=Pazar).
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [6, 0]

type StatusFilter = 'tumu' | 'aktif' | 'izinli' | 'pasif'
type SortBy = 'ad' | 'randevu' | 'kazanc'

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'tumu', label: 'Tümü' },
  { value: 'aktif', label: 'Aktif' },
  { value: 'izinli', label: 'İzinli' },
  { value: 'pasif', label: 'Pasif' },
]

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'ad', label: 'Ada Göre (A-Z)' },
  { value: 'randevu', label: 'Bugünkü Randevuya Göre' },
  { value: 'kazanc', label: 'Bugünkü Kazanca Göre' },
]

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

function todayLocalDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toLocalDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function roleLabel(role: Employee['role']) {
  return role === 'admin' ? 'Yönetici' : 'Çalışan'
}

// whatsapp_phone ham rakam dizisi olarak saklaniyor (ör. "905413402738")
// — satirda okunakli olmasi icin standart TR cep telefonu bicimine ceviriyor.
function formatPhone(raw: string) {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length === 12) digits = digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1)
  if (digits.length !== 10) return raw
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
}

export default function TeamPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeCategories, setEmployeeCategories] = useState<EmployeeCategory[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('tumu')
  const [sortBy, setSortBy] = useState<SortBy>('ad')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const teamListRef = useRef<HTMLDivElement>(null)

  const [scheduleDraft, setScheduleDraft] = useState<
    Record<string, { days: Set<number>; start: string; end: string }>
  >({})

  const [blockDraft, setBlockDraft] = useState<
    Record<
      string,
      { mode: 'day' | 'date'; day: number; date: string; endDate: string; start: string; end: string; label: string }
    >
  >({})

  function getBlockDraft(profileId: string) {
    return (
      blockDraft[profileId] ??
      { mode: 'day' as const, day: 1, date: '', endDate: '', start: '', end: '', label: '' }
    )
  }

  function setBlockDraftFor(
    profileId: string,
    next: { mode: 'day' | 'date'; day: number; date: string; endDate: string; start: string; end: string; label: string },
  ) {
    setBlockDraft((prev) => ({ ...prev, [profileId]: next }))
  }

  function getDraft(profileId: string) {
    return scheduleDraft[profileId] ?? { days: new Set<number>(), start: '', end: '' }
  }

  function setDraft(profileId: string, next: { days: Set<number>; start: string; end: string }) {
    setScheduleDraft((prev) => ({ ...prev, [profileId]: next }))
  }

  function toggleDraftDay(profileId: string, day: number) {
    const draft = getDraft(profileId)
    const days = new Set(draft.days)
    if (days.has(day)) days.delete(day)
    else days.add(day)
    setDraft(profileId, { ...draft, days })
  }

  function applyDraftPreset(profileId: string, preset: number[]) {
    const draft = getDraft(profileId)
    setDraft(profileId, { ...draft, days: new Set(preset) })
  }

  useEffect(() => {
    if (!sortMenuOpen) return
    function handleClick(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sortMenuOpen])

  // "silent=true" kucuk bir islemden (checkbox, saat ekleme/kaldirma) sonra
  // cagrilir — veriyi arka planda tazeler ama "loading" bayragini geri true
  // yapmaz, boylece tum sayfa her tikta bos "Yükleniyor…" yazisina donup
  // yeniden cizilmiyor (kullanicidan gelen "sayfa yenileniyor gibi" geri
  // bildirimi). Sadece ilk acilista gercek bir yukleme goruntusu gosterilir.
  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    const [
      { data: cats },
      { data: profs },
      { data: empCats },
      { data: scheds },
      { data: blocks },
      { data: appts },
      { data: pays },
    ] = await Promise.all([
      supabase.from('service_categories').select('id, name').order('name'),
      supabase
        .from('profiles')
        .select('id, full_name, role, is_active, whatsapp_phone')
        .order('role', { ascending: false })
        .order('full_name'),
      supabase.from('employee_categories').select('profile_id, category_id'),
      supabase.from('employee_schedules').select('id, profile_id, day_of_week, starts_at, ends_at'),
      supabase
        .from('employee_time_blocks')
        .select('id, profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label'),
      supabase.from('appointments').select('id, employee_id, service_id, status, scheduled_at'),
      supabase.from('payments').select('id, amount, appointment_id').eq('paid_at', todayLocalDateString()),
    ])
    setCategories(cats ?? [])
    setEmployees(profs ?? [])
    setEmployeeCategories(empCats ?? [])
    setSchedules(scheds ?? [])
    setTimeBlocks(blocks ?? [])
    setAppointments(appts ?? [])
    setPayments(pays ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Aktif/Pasif durumu (profiles.is_active) calisma saati/bloke eklemekten
  // TAMAMEN bagimsiz bir anahtar — sadece buradan degistirilir. Daha once bu
  // sayfada hic erisilemiyordu (sadece Kullanicilar sayfasinda vardi),
  // "pasif calisana saat ekliyorum ama aktife gecmiyor" seklinde bildirildi.
  async function toggleEmployeeActive(profileId: string, active: boolean) {
    await supabase.from('profiles').update({ is_active: active }).eq('id', profileId)
    await loadData(true)
  }

  async function toggleEmployeeCategory(profileId: string, categoryId: string, checked: boolean) {
    if (checked) {
      await supabase.from('employee_categories').insert({ profile_id: profileId, category_id: categoryId })
    } else {
      await supabase
        .from('employee_categories')
        .delete()
        .eq('profile_id', profileId)
        .eq('category_id', categoryId)
    }
    await loadData(true)
  }

  async function addSchedules(profileId: string) {
    const draft = getDraft(profileId)
    if (draft.days.size === 0 || !draft.start || !draft.end) return

    const existingForEmployee = schedules.filter((s) => s.profile_id === profileId)

    await Promise.all(
      Array.from(draft.days).map((day) => {
        const existing = existingForEmployee.find((s) => s.day_of_week === day)
        if (existing) {
          return supabase
            .from('employee_schedules')
            .update({ starts_at: draft.start, ends_at: draft.end })
            .eq('id', existing.id)
        }
        return supabase.from('employee_schedules').insert({
          profile_id: profileId,
          day_of_week: day,
          starts_at: draft.start,
          ends_at: draft.end,
        })
      }),
    )
    setDraft(profileId, { days: new Set(), start: '', end: '' })
    await loadData(true)
  }

  async function removeSchedule(id: string) {
    await supabase.from('employee_schedules').delete().eq('id', id)
    await loadData(true)
  }

  async function addBlock(profileId: string) {
    const draft = getBlockDraft(profileId)
    if (!draft.start || !draft.end) return
    if (draft.mode === 'date' && !draft.date) return

    // Bitis tarihi girilmezse baslangicla ayni kabul edilir (tek gunluk
    // blok) — girilirse [baslangic, bitis] araligini (yillik izin gibi)
    // kapsayan bir blok olur.
    await supabase.from('employee_time_blocks').insert({
      profile_id: profileId,
      day_of_week: draft.mode === 'day' ? draft.day : null,
      block_date: draft.mode === 'date' ? draft.date : null,
      end_date: draft.mode === 'date' ? draft.endDate || draft.date : null,
      starts_at: draft.start,
      ends_at: draft.end,
      label: draft.label.trim() || null,
    })
    setBlockDraftFor(profileId, { mode: 'day', day: 1, date: '', endDate: '', start: '', end: '', label: '' })
    await loadData(true)
  }

  async function removeBlock(id: string) {
    await supabase.from('employee_time_blocks').delete().eq('id', id)
    await loadData(true)
  }

  const today = useMemo(() => todayLocalDateString(), [])
  const appointmentById = useMemo(() => new Map(appointments.map((a) => [a.id, a])), [appointments])

  const apptsByEmployeeToday = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const a of appointments) {
      if (!a.employee_id) continue
      if (toLocalDateString(new Date(a.scheduled_at)) !== today) continue
      const list = map.get(a.employee_id) ?? []
      list.push(a)
      map.set(a.employee_id, list)
    }
    return map
  }, [appointments, today])

  // Kazanc artik gercek odemelerden (payments, paid_at = bugun) hesaplaniyor —
  // randevu tamamlandi diye ucretin tamami o an alinmis olmayabiliyor (paket/
  // taksit/gecikmeli odeme). Randevu sayisi ise is yuku gostergesi oldugu icin
  // hala randevu tablosundan (durum bazli) geliyor.
  function todayStatsFor(profileId: string) {
    const list = apptsByEmployeeToday.get(profileId) ?? []
    const count = list.filter((a) => a.status !== 'iptal').length
    const earnings = payments
      .filter((p) => p.appointment_id && appointmentById.get(p.appointment_id)?.employee_id === profileId)
      .reduce((sum, p) => sum + p.amount, 0)
    return { count, earnings }
  }

  function statusFor(emp: Employee): 'aktif' | 'izinli' | 'pasif' {
    if (!emp.is_active) return 'pasif'
    const onLeaveToday = timeBlocks.some(
      (b) => b.profile_id === emp.id && b.block_date !== null && b.block_date <= today && today <= (b.end_date ?? b.block_date),
    )
    return onLeaveToday ? 'izinli' : 'aktif'
  }

  const counts = useMemo(() => {
    const c = { tumu: employees.length, aktif: 0, izinli: 0, pasif: 0 }
    for (const emp of employees) c[statusFor(emp)]++
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, timeBlocks, today])

  const q = search.trim().toLowerCase()
  const filteredSorted = useMemo(() => {
    let list = employees.filter(
      (e) => !q || (e.full_name ?? '').toLowerCase().includes(q) || (e.whatsapp_phone ?? '').toLowerCase().includes(q),
    )
    if (statusFilter !== 'tumu') list = list.filter((e) => statusFor(e) === statusFilter)
    list = [...list].sort((a, b) => {
      if (sortBy === 'ad') return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr')
      const sa = todayStatsFor(a.id)
      const sb = todayStatsFor(b.id)
      return sortBy === 'randevu' ? sb.count - sa.count : sb.earnings - sa.earnings
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, q, statusFilter, sortBy, apptsByEmployeeToday])

  if (loading) return <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>

  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
        <div className={styles.searchBox}>
          <SearchIcon width={16} height={16} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Ekip üyesi ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterWrap} ref={sortMenuRef}>
          <button
            type="button"
            className={styles.filterBtn}
            onClick={() => setSortMenuOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={sortMenuOpen}
          >
            <FilterIcon width={15} height={15} />
            Filtrele
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
            </div>
          )}
        </div>
      </div>

      <div className={styles.segmentRow}>
        {STATUS_TABS.map((tab) => (
          <button
            type="button"
            key={tab.value}
            className={statusFilter === tab.value ? styles.segmentBtnActive : styles.segmentBtn}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label} ({counts[tab.value]})
          </button>
        ))}
      </div>

      <div className="card" ref={teamListRef}>
        <div className={styles.list}>
          {filteredSorted.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>Ekip üyesi bulunamadı.</p>
          ) : (
            filteredSorted.map((emp) => {
              const status = statusFor(emp)
              const stats = todayStatsFor(emp.id)
              const empCategoryIds = new Set(
                employeeCategories.filter((ec) => ec.profile_id === emp.id).map((ec) => ec.category_id),
              )
              const empSchedules = schedules.filter((s) => s.profile_id === emp.id)
              const empBlocks = timeBlocks.filter((b) => b.profile_id === emp.id)
              const draft = getDraft(emp.id)
              const bDraft = getBlockDraft(emp.id)
              const expanded = expandedId === emp.id

              return (
                <div key={emp.id} className={styles.rowWrap}>
                  <div className={styles.row}>
                    <div className={styles.avatarWrap}>
                      <Avatar name={emp.full_name ?? '?'} size={38} />
                      <span className={`${styles.statusDot} ${styles[`statusDot_${status}`]}`} />
                    </div>
                    <div className={styles.rowMain}>
                      <span className={styles.rowName}>{emp.full_name ?? '—'}</span>
                      <span className={styles.rowRole}>{roleLabel(emp.role)}</span>
                      {emp.whatsapp_phone && (
                        <span className={styles.rowPhone}>
                          <PhoneIcon width={11} height={11} />
                          <span className={styles.rowPhoneText}>{formatPhone(emp.whatsapp_phone)}</span>
                        </span>
                      )}
                    </div>
                    <div className={styles.rowStats}>
                      <div className={styles.rowStatBlock}>
                        <span className={styles.rowStatLabel}>Bugünkü Randevu</span>
                        <span className={styles.rowStatValue}>{stats.count}</span>
                      </div>
                      <div className={styles.rowStatBlock}>
                        <span className={styles.rowStatLabel}>Bugünkü Kazanç</span>
                        <span className={styles.rowStatValueOk}>{currency.format(stats.earnings)}</span>
                      </div>
                    </div>
                    <span className={`${styles.statusPill} ${styles[`statusPill_${status}`]}`}>
                      {STATUS_TABS.find((t) => t.value === status)?.label}
                    </span>
                    <button
                      type="button"
                      className={styles.moreBtn}
                      onClick={() => setExpandedId(expanded ? null : emp.id)}
                      aria-label="Ekip üyesi seçenekleri"
                      aria-expanded={expanded}
                    >
                      <MoreHorizontalIcon width={16} height={16} />
                    </button>
                  </div>

                  {expanded && (
                    <div className={styles.expandPanel}>
                      {emp.id !== profile?.id && emp.role !== 'admin' && (
                        <div className={styles.activeToggleRow}>
                          <span>
                            Durum: <strong>{emp.is_active ? 'Aktif' : 'Pasif'}</strong>
                          </span>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => toggleEmployeeActive(emp.id, !emp.is_active)}
                          >
                            {emp.is_active ? 'Pasife Al' : 'Aktifleştir'}
                          </button>
                        </div>
                      )}

                      <div className={styles.categoryCheckboxes}>
                        {categories.map((c) => {
                          const active = empCategoryIds.has(c.id)
                          return (
                            <button
                              type="button"
                              key={c.id}
                              className={active ? styles.categoryChipActive : styles.categoryChip}
                              onClick={() => toggleEmployeeCategory(emp.id, c.id, !active)}
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

                      <div className={styles.addScheduleForm}>
                        <div className={styles.scheduleHeadRow}>
                          <span className={styles.blockSectionTitle}>Haftalık Çalışma Saatleri</span>
                          <div className={styles.presetRow}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => applyDraftPreset(emp.id, WEEKDAYS)}
                            >
                              Hafta İçi
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => applyDraftPreset(emp.id, WEEKEND)}
                            >
                              Hafta Sonu
                            </button>
                          </div>
                        </div>

                        {empSchedules.length > 0 && (
                          <div className={styles.existingSchedules}>
                            {WEEK_ORDER.map((day) => {
                              const s = empSchedules.find((s) => s.day_of_week === day)
                              if (!s) return null
                              return (
                                <div className={styles.scheduleRow} key={s.id}>
                                  <span>
                                    <strong>{DAY_SHORT[s.day_of_week]}</strong> {s.starts_at.slice(0, 5)} –{' '}
                                    {s.ends_at.slice(0, 5)}
                                  </span>
                                  <button onClick={() => removeSchedule(s.id)}>Kaldır</button>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <div className={styles.presetRow}>
                          <button type="button" className="btn-secondary" onClick={() => applyDraftPreset(emp.id, WEEK_ORDER)}>
                            Her Gün
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => applyDraftPreset(emp.id, [])}>
                            Temizle
                          </button>
                        </div>

                        <div className={styles.dayChipRow}>
                          {WEEK_ORDER.map((day) => (
                            <button
                              type="button"
                              key={day}
                              className={draft.days.has(day) ? styles.dayChipActive : styles.dayChip}
                              onClick={() => toggleDraftDay(emp.id, day)}
                            >
                              {DAY_SHORT[day]}
                            </button>
                          ))}
                        </div>

                        <div className={styles.timeRow}>
                          <div className={styles.timeField}>
                            <label>Başlangıç</label>
                            <select value={draft.start} onChange={(e) => setDraft(emp.id, { ...draft, start: e.target.value })}>
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
                            <select value={draft.end} onChange={(e) => setDraft(emp.id, { ...draft, end: e.target.value })}>
                              <option value="">--:--</option>
                              {TIME_OPTIONS.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button type="button" className="btn-primary" onClick={() => addSchedules(emp.id)}>
                            {draft.days.size > 1 ? `${draft.days.size} güne ekle` : 'Ekle'}
                          </button>
                        </div>
                      </div>

                      <div className={styles.blockSection}>
                        <div className={styles.blockSectionTitle}>Bloke Saatler (Mola/Eğitim/İzin)</div>

                        {empBlocks.length > 0 && (
                          <div className={styles.existingSchedules}>
                            {empBlocks.map((b) => (
                              <div className={styles.blockRow} key={b.id}>
                                <span>
                                  <strong>
                                    {b.day_of_week !== null
                                      ? DAY_SHORT[b.day_of_week]
                                      : b.end_date && b.end_date !== b.block_date
                                        ? `${new Date(b.block_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${new Date(b.end_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`
                                        : new Date(b.block_date + 'T00:00:00').toLocaleDateString('tr-TR', {
                                            day: 'numeric',
                                            month: 'short',
                                          })}
                                  </strong>{' '}
                                  {b.starts_at.slice(0, 5)} – {b.ends_at.slice(0, 5)}
                                  {b.label ? ` (${b.label})` : ''}
                                </span>
                                <button className={styles.blockRemove} onClick={() => removeBlock(b.id)} aria-label="Bloke saati kaldır">
                                  <TrashIcon width={13} height={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className={styles.blockForm}>
                          <div className={styles.blockModeRow}>
                            <button
                              type="button"
                              className={bDraft.mode === 'day' ? styles.dayChipActive : styles.dayChip}
                              onClick={() => setBlockDraftFor(emp.id, { ...bDraft, mode: 'day' })}
                            >
                              Her hafta
                            </button>
                            <button
                              type="button"
                              className={bDraft.mode === 'date' ? styles.dayChipActive : styles.dayChip}
                              onClick={() => setBlockDraftFor(emp.id, { ...bDraft, mode: 'date' })}
                            >
                              Tarih Aralığı
                            </button>
                          </div>

                          {bDraft.mode === 'day' ? (
                            <div className={styles.timeField}>
                              <label>Gün</label>
                              <select
                                value={bDraft.day}
                                onChange={(e) => setBlockDraftFor(emp.id, { ...bDraft, day: Number(e.target.value) })}
                              >
                                {WEEK_ORDER.map((day) => (
                                  <option key={day} value={day}>
                                    {DAY_LABELS[day]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className={styles.timeRow}>
                              <div className={styles.timeField}>
                                <label>Başlangıç Tarihi</label>
                                <input
                                  type="date"
                                  value={bDraft.date}
                                  onChange={(e) => setBlockDraftFor(emp.id, { ...bDraft, date: e.target.value })}
                                />
                              </div>
                              <span className={styles.timeSep}>–</span>
                              <div className={styles.timeField}>
                                <label>Bitiş Tarihi (opsiyonel — yıllık izin gibi çok günlük bloklar için)</label>
                                <input
                                  type="date"
                                  min={bDraft.date || undefined}
                                  value={bDraft.endDate}
                                  onChange={(e) => setBlockDraftFor(emp.id, { ...bDraft, endDate: e.target.value })}
                                />
                              </div>
                            </div>
                          )}

                          <div className={styles.timeRow}>
                            <div className={styles.timeField}>
                              <label>Başlangıç</label>
                              <select
                                value={bDraft.start}
                                onChange={(e) => setBlockDraftFor(emp.id, { ...bDraft, start: e.target.value })}
                              >
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
                              <select
                                value={bDraft.end}
                                onChange={(e) => setBlockDraftFor(emp.id, { ...bDraft, end: e.target.value })}
                              >
                                <option value="">--:--</option>
                                {TIME_OPTIONS.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                setBlockDraftFor(emp.id, {
                                  ...bDraft,
                                  start: TIME_OPTIONS[0],
                                  end: TIME_OPTIONS[TIME_OPTIONS.length - 1],
                                })
                              }
                            >
                              Tüm Gün
                            </button>
                          </div>

                          <input
                            className={styles.blockLabelInput}
                            placeholder="Etiket (ör. Öğle Molası, Eğitim)"
                            value={bDraft.label}
                            onChange={(e) => setBlockDraftFor(emp.id, { ...bDraft, label: e.target.value })}
                          />

                          <button type="button" className={styles.dashedAddBtn} onClick={() => addBlock(emp.id)}>
                            + Bloke Saat Ekle
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className={styles.quickRow}>
        <button type="button" className={styles.quickBtn} onClick={() => navigate('/kullanicilar')}>
          <span className={`${styles.quickIcon} ${styles.quickIconSignal}`}>
            <UserPlusIcon width={15} height={15} />
          </span>
          Ekip Üyesi Ekle
        </button>
        <button
          type="button"
          className={styles.quickBtn}
          onClick={() => teamListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <span className={`${styles.quickIcon} ${styles.quickIconOk}`}>
            <ClockIcon width={15} height={15} />
          </span>
          İzin / Mola Ekle
        </button>
        <button type="button" className={styles.quickBtn} disabled>
          <span className={styles.quickIcon}>
            <MailIcon width={15} height={15} />
          </span>
          Toplu Mesaj Gönder
          <span className={styles.quickBadge}>Yakında</span>
        </button>
      </div>
    </div>
  )
}
