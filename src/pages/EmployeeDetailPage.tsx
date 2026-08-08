import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar, { colorForName } from '../components/Avatar'
import {
  CalendarIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TrophyIcon,
  UmbrellaIcon,
  UsersIcon,
} from '../components/icons'
import styles from './EmployeeDetailPage.module.css'

interface Employee {
  id: string
  full_name: string | null
  role: 'admin' | 'user'
  is_active: boolean
  whatsapp_phone: string | null
  updated_at: string
}

interface Category {
  id: string
  name: string
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
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal'
  scheduled_at: string
}

const BREAK_LABEL = 'Öğle molası'
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
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

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function formatHoursMinutes(totalHours: number): string {
  const totalMinutes = Math.max(0, Math.round(totalHours * 60))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}s ${String(m).padStart(2, '0')}d`
}

interface DayInfo {
  enabled: boolean
  start: string
  end: string
  breaks: { start: string; end: string }[]
}

function computeDayInfo(day: number, schedules: Schedule[], timeBlocks: TimeBlock[]): DayInfo {
  const s = schedules.find((x) => x.day_of_week === day)
  if (!s) return { enabled: false, start: '', end: '', breaks: [] }
  const breaks = timeBlocks
    .filter((b) => b.day_of_week === day && b.label === BREAK_LABEL)
    .map((b) => ({ start: b.starts_at.slice(0, 5), end: b.ends_at.slice(0, 5) }))
  return { enabled: true, start: s.starts_at.slice(0, 5), end: s.ends_at.slice(0, 5), breaks }
}

function weeklyPlannedHours(schedules: Schedule[], timeBlocks: TimeBlock[]): number {
  let total = 0
  for (const day of WEEK_ORDER) {
    const info = computeDayInfo(day, schedules, timeBlocks)
    if (!info.enabled) continue
    let minutes = timeToMinutes(info.end) - timeToMinutes(info.start)
    for (const b of info.breaks) minutes -= Math.max(0, timeToMinutes(b.end) - timeToMinutes(b.start))
    total += Math.max(0, minutes) / 60
  }
  return total
}

interface LeaveSummary {
  mode: 'day' | 'range'
  date: string
  endDate: string
  label: string
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
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDay())
  const [leaveFilter, setLeaveFilter] = useState<'day' | 'range'>('range')

  // Ad soyad + telefon duzenleme alani da diger kartlar gibi "duzenle ->
  // Kaydet" mantigiyla calisiyor; taslak sunucudan sadece BIR KERE
  // (profileReady false iken) dolduruluyor ki baska bir aksiyonun
  // tetikledigi loadData(true) yazilmakta olan taslagi silip suzmesin.
  const [nameDraft, setNameDraft] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [profileReady, setProfileReady] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')

  async function loadData(silent = false) {
    if (!id) return
    if (!silent) setLoading(true)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
    const [{ data: emp }, { data: cats }, { data: empCats }, { data: scheds }, { data: blocks }, { data: appts }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, is_active, whatsapp_phone, updated_at').eq('id', id).maybeSingle(),
      supabase.from('service_categories').select('id, name').order('name'),
      supabase.from('employee_categories').select('profile_id, category_id').eq('profile_id', id),
      supabase.from('employee_schedules').select('id, profile_id, day_of_week, starts_at, ends_at').eq('profile_id', id),
      supabase
        .from('employee_time_blocks')
        .select('id, profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label')
        .eq('profile_id', id),
      supabase
        .from('appointments')
        .select('id, status, scheduled_at')
        .eq('employee_id', id)
        .gte('scheduled_at', monthStart)
        .lte('scheduled_at', monthEnd),
    ])
    setEmployee(emp ?? null)
    setCategories(cats ?? [])
    setEmployeeCategories(empCats ?? [])
    setSchedules(scheds ?? [])
    setTimeBlocks(blocks ?? [])
    setAppointments(appts ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (loading || profileReady || !employee) return
    setNameDraft(employee.full_name ?? '')
    setPhoneDraft(employee.whatsapp_phone ?? '')
    setProfileReady(true)
  }, [loading, profileReady, employee])

  const today = useMemo(() => todayLocalDateString(), [])

  async function toggleActive(active: boolean) {
    if (!id) return
    await supabase.from('profiles').update({ is_active: active }).eq('id', id)
    await loadData(true)
  }

  async function saveProfileInfo() {
    if (!id || !nameDraft.trim()) return
    setSavingProfile(true)
    setProfileError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: nameDraft.trim(), whatsapp_phone: phoneDraft.trim() || null })
      .eq('id', id)
    if (err) {
      const isDupPhone = err.code === '23505' && err.message.includes('whatsapp_phone')
      setProfileError(isDupPhone ? 'Bu telefon numarası başka bir ekip üyesine kayıtlı.' : 'Kaydedilemedi: ' + err.message)
      setSavingProfile(false)
      return
    }
    setProfileReady(false)
    await loadData(true)
    setSavingProfile(false)
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

  if (loading) return <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>
  if (!employee) return <p style={{ color: 'var(--text-dim)' }}>Ekip üyesi bulunamadı.</p>

  const status: 'aktif' | 'izinli' | 'pasif' = !employee.is_active
    ? 'pasif'
    : timeBlocks.some((b) => b.block_date !== null && b.block_date <= today && today <= (b.end_date ?? b.block_date))
      ? 'izinli'
      : 'aktif'

  const empCategoryIds = new Set(employeeCategories.map((ec) => ec.category_id))
  const assignedCategories = categories.filter((c) => empCategoryIds.has(c.id))
  const specialty = assignedCategories.length > 0 ? assignedCategories.map((c) => c.name).join(' • ') : roleLabel(employee.role)

  const canToggleActive = employee.id !== profile?.id && employee.role !== 'admin'

  const selectedDayInfo = computeDayInfo(selectedDay, schedules, timeBlocks)
  const weeklyHours = weeklyPlannedHours(schedules, timeBlocks)

  const completedThisMonth = appointments.filter((a) => a.status === 'tamamlandi').length
  const cancelledThisMonth = appointments.filter((a) => a.status === 'iptal').length
  const performanceDenominator = completedThisMonth + cancelledThisMonth
  const performancePct = performanceDenominator > 0 ? Math.round((completedThisMonth / performanceDenominator) * 100) : null

  const leaves: LeaveSummary[] = timeBlocks
    .filter((b) => b.day_of_week === null && b.block_date)
    .map((b) => ({
      mode: (b.end_date && b.end_date !== b.block_date ? 'range' : 'day') as 'day' | 'range',
      date: b.block_date as string,
      endDate: b.end_date ?? (b.block_date as string),
      label: b.label ?? '',
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const visibleLeaves = leaves.filter((l) => l.mode === leaveFilter)

  return (
    <div className={styles.wrap}>
      <div className={styles.topRow}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/ekip')} aria-label="Ekibe dön">
          <ChevronRightIcon width={16} height={16} className={styles.backIcon} />
        </button>
        <Avatar name={employee.full_name ?? '?'} size={40} />
        <div className={styles.topInfo}>
          <span className={styles.topName}>{employee.full_name ?? '—'}</span>
          <span className={styles.topSpecialty}>{specialty}</span>
        </div>
        <button type="button" className={styles.moreBtn} aria-label="Diğer">
          <MoreHorizontalIcon width={18} height={18} />
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Kişisel Bilgiler</h2>
        <div className={styles.profileField}>
          <label htmlFor="empName">Ad Soyad</label>
          <input id="empName" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Ad Soyad" />
        </div>
        <div className={styles.profileField}>
          <label htmlFor="empPhone">Telefon</label>
          <input
            id="empPhone"
            type="tel"
            inputMode="numeric"
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value.replace(/\D/g, ''))}
            placeholder="05xx xxx xx xx"
          />
        </div>
        {profileError && <p className={styles.profileError}>{profileError}</p>}
        <button
          type="button"
          className={`btn-primary ${styles.profileSaveBtn}`}
          onClick={saveProfileInfo}
          disabled={savingProfile || !nameDraft.trim()}
        >
          {savingProfile ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>

      <div className={styles.tabBar}>
        <span className={styles.tabActive}>Genel Bakış</span>
        <button type="button" className={styles.tab} onClick={() => navigate(`/ekip/${id}/saatler`)}>
          Çalışma Saatleri
        </button>
        <button type="button" className={styles.tab} onClick={() => navigate(`/ekip/${id}/izinler`)}>
          İzinler
        </button>
        <button type="button" className={styles.tab} onClick={() => navigate('/performans-raporu')}>
          İstatistikler
        </button>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statCardHead}>
            <CalendarIcon width={14} height={14} />
            <span>Durum</span>
          </div>
          <span className={`${styles.statusPill} ${styles[`statusPill_${status}`]}`}>{STATUS_LABEL[status]}</span>
          <span className={styles.statCardSub}>
            Son güncelleme
            <br />
            {new Date(employee.updated_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardHead}>
            <ClockIcon width={14} height={14} />
            <span>Bu Hafta</span>
          </div>
          <span className={styles.statCardValue}>{formatHoursMinutes(weeklyHours)}</span>
          <span className={styles.statCardSub}>Planlanan Süre</span>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardHead}>
            <TrophyIcon width={14} height={14} />
            <span>Performans</span>
          </div>
          <span className={styles.statCardValue}>{performancePct !== null ? `%${performancePct}` : '—'}</span>
          <span className={styles.statCardSub}>Bu Ay</span>
        </div>
      </div>

      <div className="card">
        <div className={styles.sectionHead}>
          <h2>Çalışma Saatleri</h2>
          <button type="button" className={styles.editLink} onClick={() => navigate(`/ekip/${id}/saatler`)}>
            Düzenle
            <PencilIcon width={13} height={13} />
          </button>
        </div>

        <div className={styles.dayPillRow}>
          {WEEK_ORDER.map((day) => (
            <button
              type="button"
              key={day}
              className={day === selectedDay ? styles.dayPillActive : styles.dayPill}
              onClick={() => setSelectedDay(day)}
            >
              {DAY_SHORT[day]}
            </button>
          ))}
        </div>

        {selectedDayInfo.enabled ? (
          <div className={styles.rangeList}>
            <button type="button" className={styles.rangeRow} onClick={() => navigate(`/ekip/${id}/saatler`)}>
              <span className={`${styles.rangeDot} ${styles.rangeDotWork}`} />
              <span className={styles.rangeText}>
                {selectedDayInfo.start} – {selectedDayInfo.end}
              </span>
              <span className={`${styles.rangeBadge} ${styles.rangeBadgeWork}`}>Çalışma</span>
              <ChevronRightIcon width={15} height={15} className={styles.rangeChevron} />
            </button>
            {selectedDayInfo.breaks.map((b, i) => (
              <button type="button" className={styles.rangeRow} key={i} onClick={() => navigate(`/ekip/${id}/saatler`)}>
                <span className={`${styles.rangeDot} ${styles.rangeDotBreak}`} />
                <span className={styles.rangeTextCol}>
                  <span className={styles.rangeText}>
                    {b.start} – {b.end}
                  </span>
                  <span className={styles.rangeSub}>{timeToMinutes(b.end) - timeToMinutes(b.start)} dk mola</span>
                </span>
                <span className={`${styles.rangeBadge} ${styles.rangeBadgeBreak}`}>Mola</span>
                <ChevronRightIcon width={15} height={15} className={styles.rangeChevron} />
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.emptyDay}>Bu gün için çalışma saati tanımlı değil.</p>
        )}

        <button type="button" className={styles.outlineAddBtn} onClick={() => navigate(`/ekip/${id}/saatler`)}>
          <PlusIcon width={15} height={15} /> Saat Ekle
        </button>

        <div className={styles.infoBanner}>
          <InfoIcon width={16} height={16} />
          Haftalık çalışma saatleri tüm randevuların planlanmasında kullanılır.
        </div>
      </div>

      <div className="card">
        <div className={styles.sectionHead}>
          <h2>İzinler</h2>
          <button type="button" className={styles.editLink} onClick={() => navigate(`/ekip/${id}/izinler`)}>
            Düzenle
            <PencilIcon width={13} height={13} />
          </button>
        </div>

        <div className={styles.leaveFilterToggle}>
          <button
            type="button"
            className={leaveFilter === 'day' ? styles.leaveFilterTabActive : styles.leaveFilterTab}
            onClick={() => setLeaveFilter('day')}
          >
            Günlük İzin
          </button>
          <button
            type="button"
            className={leaveFilter === 'range' ? styles.leaveFilterTabActive : styles.leaveFilterTab}
            onClick={() => setLeaveFilter('range')}
          >
            Yıllık İzin / Tarih Aralığı
          </button>
        </div>

        {visibleLeaves.length === 0 ? (
          <p className={styles.emptyDay}>Bu türde tanımlı izin yok.</p>
        ) : (
          <div className={styles.leaveSummaryList}>
            {visibleLeaves.map((l, i) => {
              const dateObj = new Date(l.date + 'T00:00:00')
              const endObj = new Date(l.endDate + 'T00:00:00')
              const dayCount = Math.round((endObj.getTime() - dateObj.getTime()) / 86400000) + 1
              return (
                <button type="button" className={styles.leaveSummaryRow} key={i} onClick={() => navigate(`/ekip/${id}/izinler`)}>
                  <span className={styles.leaveSummaryIcon}>
                    <CalendarIcon width={16} height={16} />
                  </span>
                  <span className={styles.leaveSummaryText}>
                    <span className={styles.leaveSummaryDate}>
                      {l.mode === 'range'
                        ? `${dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })} - ${endObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    <span className={styles.leaveSummarySub}>
                      {l.mode === 'range' ? `${dayCount} Gün` : dateObj.toLocaleDateString('tr-TR', { weekday: 'long' })}
                    </span>
                  </span>
                  <span className={styles.leaveSummaryBadge}>{l.mode === 'day' ? 'Günlük İzin' : 'Yıllık İzin'}</span>
                  <MoreHorizontalIcon width={16} height={16} className={styles.leaveSummaryMore} />
                </button>
              )
            })}
          </div>
        )}

        <button type="button" className={styles.outlineAddBtn} onClick={() => navigate(`/ekip/${id}/izinler`)}>
          <PlusIcon width={15} height={15} /> İzin Ekle
        </button>

        <div className={styles.infoBanner}>
          <InfoIcon width={16} height={16} />
          İzinli olduğu günlerde randevu atanamaz.
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Hızlı Durum</h2>
        <div className={styles.quickStatusRow}>
          <button
            type="button"
            className={status === 'aktif' ? styles.quickStatusBtnActiveAktif : styles.quickStatusBtn}
            onClick={() => toggleActive(true)}
          >
            <UsersIcon width={15} height={15} />
            Aktif
            {status === 'aktif' && <CheckCircleIcon width={14} height={14} />}
          </button>
          <button
            type="button"
            className={status === 'izinli' ? styles.quickStatusBtnActiveIzinli : styles.quickStatusBtn}
            onClick={() => navigate(`/ekip/${id}/izinler`)}
          >
            <UmbrellaIcon width={15} height={15} />
            İzinli
          </button>
          <button
            type="button"
            className={status === 'pasif' ? styles.quickStatusBtnActivePasif : styles.quickStatusBtn}
            onClick={() => toggleActive(false)}
            disabled={!canToggleActive}
          >
            <UsersIcon width={15} height={15} />
            Pasif
          </button>
        </div>
      </div>

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

        {assignedCategories.length > 0 && (
          <div className={styles.employeeTags}>
            {assignedCategories.map((c) => (
              <span key={c.id} className={styles.hashtag} style={{ color: colorForName(c.name) }}>
                #{c.name.replace(/\s+/g, '')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
