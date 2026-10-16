import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { TIME_OPTIONS } from '../lib/timeOptions'
import { toLocalDateString, todayLocalDateString, timeToMinutes } from '../lib/date'
import PageHeader from '../components/PageHeader'
import PickerSheet from '../components/PickerSheet'
import styles from './EmployeeLeavesPage.module.css'

interface Employee {
  id: string
  full_name: string | null
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

// Cakisma cozumu icin: izne cikan calisan disindaki aktif calisanlar +
// onlarin musaitligini hesaplamaya yarayan veriler ("aktar"/"esit dagit"
// secenekleri icin ortak aday havuzu — bkz. isCandidateAvailable).
interface OtherProfile {
  id: string
  full_name: string | null
}

interface EmployeeServiceRow {
  profile_id: string
  service_id: string
}

interface ScheduleRow {
  profile_id: string
  day_of_week: number
  starts_at: string
  ends_at: string
}

interface OtherTimeBlockRow {
  profile_id: string
  day_of_week: number | null
  block_date: string | null
  end_date: string | null
  starts_at: string
  ends_at: string
}

interface OtherAppointmentRow {
  id: string
  employee_id: string | null
  scheduled_at: string
  duration_minutes: number | null
}

interface ConflictAppointment {
  id: string
  customer_id: string | null
  service_id: string | null
  scheduled_at: string
  duration_minutes: number | null
  customerName: string
  serviceName: string
}

// LeaveDraft'ta "id" sadece istemci tarafinda React key + duzenleme takibi
// amacli — "blockId" doluysa DB'deki mevcut bir employee_time_blocks
// satirina karsilik gelir (kaydet'te update), bos ise henuz kaydedilmemis
// yeni bir izindir. Izinler day_of_week DEGIL block_date/end_date ile
// tutulur (tek gunluk ya da tarih araligi).
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

const LEAVE_REASON_OPTIONS = ['Yıllık izin', 'Kişisel', 'Rapor', 'Doktor', 'Mazeret izni', 'Diğer']

// Ekleme penceresindeki uc secenek: tek gun tam gun, tek gun birkac saat,
// birden fazla gun (tam gun).
type LeaveKind = 'tam' | 'saat' | 'gun'

interface UpcomingAppt {
  id: string
  employee_id: string | null
  customer_id: string | null
  scheduled_at: string
  duration_minutes: number | null
}


export default function EmployeeLeavesPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)

  // "duzenle -> Kaydet" mantigiyla calisiyor — leaveDrafts sunucudan sadece
  // BIR KERE (leaveReady false iken) dolduruluyor.
  const [leaveDrafts, setLeaveDrafts] = useState<LeaveDraft[]>([])
  const [leaveReady, setLeaveReady] = useState(false)
  const [savingLeaves, setSavingLeaves] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  // Ekleme/silme sonrasi taslak listesi guncellenince kaydi tetiklemek icin.
  const [autoSave, setAutoSave] = useState(false)

  const [leaveDate, setLeaveDate] = useState(todayLocalDateString())
  const [leaveEndDate, setLeaveEndDate] = useState('')
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveKind, setLeaveKind] = useState<LeaveKind>('tam')
  // Liste filtresi: 'herkes' ya da bir calisan id'si (varsayilan bu sayfanin calisani).
  const [who, setWho] = useState<string>(id ?? 'herkes')
  const [allProfiles, setAllProfiles] = useState<Employee[]>([])
  const [allLeaves, setAllLeaves] = useState<TimeBlock[]>([])
  const [upcomingAppts, setUpcomingAppts] = useState<UpcomingAppt[]>([])
  const [upcomingCustomerNames, setUpcomingCustomerNames] = useState<Map<string, string>>(new Map())
  // Cakisma ekraninda her randevu icin secim: 'to:<calisanId>' | 'cancel' | 'keep'
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [leaveLabel, setLeaveLabel] = useState('Yıllık izin')
  const [reasonPickerOpen, setReasonPickerOpen] = useState(false)

  // Cakisma kontrolu + cozum modali
  const [checkingConflicts, setCheckingConflicts] = useState(false)
  const [conflictModalOpen, setConflictModalOpen] = useState(false)
  const [conflicts, setConflicts] = useState<ConflictAppointment[]>([])
  const [resolving, setResolving] = useState(false)
  const [otherProfiles, setOtherProfiles] = useState<OtherProfile[]>([])
  const [employeeServices, setEmployeeServices] = useState<EmployeeServiceRow[]>([])
  const [otherSchedules, setOtherSchedules] = useState<ScheduleRow[]>([])
  const [otherTimeBlocks, setOtherTimeBlocks] = useState<OtherTimeBlockRow[]>([])
  const [otherAppointments, setOtherAppointments] = useState<OtherAppointmentRow[]>([])

  async function loadData(silent = false) {
    if (!id) return
    if (!silent) setLoading(true)
    const [{ data: emp }, { data: blocks }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('id', id).maybeSingle(),
      supabase
        .from('employee_time_blocks')
        .select('id, profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label')
        .eq('profile_id', id),
    ])
    setEmployee(emp ?? null)
    setTimeBlocks(blocks ?? [])

    // Tum ekibin izinleri (resmi tatil haric) + bugunden sonraki randevular
    // (listede "N randevu cakisiyor" ve ekleme penceresi onizlemesi icin).
    const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    const [{ data: profs }, { data: leaves }, { data: appts }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase
        .from('employee_time_blocks')
        .select('id, profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label')
        .is('day_of_week', null)
        .neq('label', 'Resmi Tatil'),
      supabase
        .from('appointments')
        .select('id, employee_id, customer_id, scheduled_at, duration_minutes')
        .neq('status', 'iptal')
        .gte('scheduled_at', todayIso)
        .limit(1000),
    ])
    setAllProfiles(profs ?? [])
    setAllLeaves((leaves ?? []).filter((b) => b.block_date) as TimeBlock[])
    setUpcomingAppts((appts ?? []) as UpcomingAppt[])
    const custIds = [...new Set((appts ?? []).map((a) => a.customer_id).filter(Boolean))] as string[]
    if (custIds.length) {
      const { data: custs } = await supabase.from('customers').select('id, full_name').in('id', custIds.slice(0, 300))
      setUpcomingCustomerNames(new Map((custs ?? []).map((c) => [c.id, c.full_name])))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

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

  function addLeaveDraft() {
    if (!leaveDate) return
    const allDay = leaveKind !== 'saat'
    if (!allDay && (!leaveStart || !leaveEnd)) return
    const newDraft: LeaveDraft = {
      id: crypto.randomUUID(),
      mode: leaveKind === 'gun' ? 'range' : 'day',
      date: leaveDate,
      endDate: leaveKind === 'gun' ? leaveEndDate || leaveDate : leaveDate,
      allDay,
      start: allDay ? '00:00' : leaveStart,
      end: allDay ? '23:59' : leaveEnd,
      label: leaveLabel.trim(),
    }
    setLeaveDrafts((prev) => [...prev, newDraft])
    setLeaveDate(todayLocalDateString())
    setLeaveEndDate('')
    setLeaveStart('')
    setLeaveEnd('')
    setLeaveKind('tam')
    setLeaveLabel('Yıllık izin')
  }

  function removeLeaveDraft(draftId: string) {
    setLeaveDrafts((prev) => prev.filter((d) => d.id !== draftId))
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

  // Sadece henuz kaydedilmemis (blockId'siz) yeni taslaklarin tarih/saat
  // araligini kapsayan tek bir pencere dondurur — mevcut/dokunulmayan
  // izinler icin cakisma tekrar kontrol edilmez.
  function draftDateRange() {
    const newDrafts = leaveDrafts.filter((d) => !d.blockId)
    if (newDrafts.length === 0) return null
    const dates = newDrafts.flatMap((d) => [d.date, d.endDate || d.date])
    return { min: dates.reduce((a, b) => (b < a ? b : a)), max: dates.reduce((a, b) => (b > a ? b : a)) }
  }

  async function findConflicts(range: { min: string; max: string }): Promise<ConflictAppointment[]> {
    if (!id) return []
    const newDrafts = leaveDrafts.filter((d) => !d.blockId)

    const { data: appts } = await supabase
      .from('appointments')
      .select('id, customer_id, service_id, scheduled_at, duration_minutes, status')
      .eq('employee_id', id)
      .neq('status', 'iptal')
      .gte('scheduled_at', `${range.min}T00:00:00`)
      .lte('scheduled_at', `${range.max}T23:59:59`)

    const inRange = (appts ?? []).filter((a) => {
      const start = new Date(a.scheduled_at)
      const dateStr = toLocalDateString(start)
      const startMinutes = start.getHours() * 60 + start.getMinutes()
      const endMinutes = startMinutes + (a.duration_minutes ?? 30)
      return newDrafts.some((d) => {
        const dEnd = d.endDate || d.date
        if (dateStr < d.date || dateStr > dEnd) return false
        return timeToMinutes(d.start) < endMinutes && timeToMinutes(d.end) > startMinutes
      })
    })
    if (inRange.length === 0) return []

    const customerIds = Array.from(new Set(inRange.map((a) => a.customer_id).filter((v): v is string => !!v)))
    const serviceIds = Array.from(new Set(inRange.map((a) => a.service_id).filter((v): v is string => !!v)))
    const [{ data: custs }, { data: svcs }] = await Promise.all([
      customerIds.length
        ? supabase.from('customers').select('id, full_name').in('id', customerIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      serviceIds.length
        ? supabase.from('services').select('id, name').in('id', serviceIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])

    return inRange
      .map((a) => ({
        id: a.id,
        customer_id: a.customer_id,
        service_id: a.service_id,
        scheduled_at: a.scheduled_at,
        duration_minutes: a.duration_minutes,
        customerName: custs?.find((c) => c.id === a.customer_id)?.full_name ?? 'Müşteri',
        serviceName: svcs?.find((s) => s.id === a.service_id)?.name ?? 'Hizmet',
      }))
      .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
  }

  // Aktarma/dagitma secenekleri icin aday havuzu: izne cikan disindaki
  // aktif calisanlar + onlarin musaitligini hesaplamak icin gereken veriler.
  // Cakisma yoksa hic cagrilmiyor (gereksiz sorgu yok).
  async function loadResolutionPool(range: { min: string; max: string }) {
    const [{ data: profs }, { data: svcAssignments }, { data: scheds }, { data: blocks }, { data: appts }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('is_active', true).neq('id', id ?? ''),
      supabase.from('employee_services').select('profile_id, service_id'),
      supabase.from('employee_schedules').select('profile_id, day_of_week, starts_at, ends_at'),
      supabase.from('employee_time_blocks').select('profile_id, day_of_week, block_date, end_date, starts_at, ends_at'),
      supabase
        .from('appointments')
        .select('id, employee_id, scheduled_at, duration_minutes, status')
        .neq('status', 'iptal')
        .gte('scheduled_at', `${range.min}T00:00:00`)
        .lte('scheduled_at', `${range.max}T23:59:59`),
    ])
    setOtherProfiles(profs ?? [])
    setEmployeeServices(svcAssignments ?? [])
    setOtherSchedules(scheds ?? [])
    setOtherTimeBlocks(blocks ?? [])
    setOtherAppointments(appts ?? [])
  }

  // AppointmentsPage.tsx'teki isEmployeeAvailable'in ayni uc kontrolunun
  // (calisma saati / izin-mola / mevcut randevu cakismasi) bu sayfaya
  // ozel, salt-okunur bir kopyasi — burada baska bir calisanin belirli bir
  // randevu saatini devralip devralamayacagini test etmek icin kullanilir.
  function isCandidateAvailable(profileId: string, scheduledAt: string, durationMinutes: number | null) {
    const start = new Date(scheduledAt)
    const dayOfWeek = start.getDay()
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = startMinutes + (durationMinutes ?? 30)

    const worksThen = otherSchedules.some(
      (s) =>
        s.profile_id === profileId &&
        s.day_of_week === dayOfWeek &&
        timeToMinutes(s.starts_at.slice(0, 5)) <= startMinutes &&
        timeToMinutes(s.ends_at.slice(0, 5)) >= endMinutes,
    )
    if (!worksThen) return false

    const dateStr = toLocalDateString(start)
    const isBlocked = otherTimeBlocks.some(
      (b) =>
        b.profile_id === profileId &&
        (b.day_of_week === dayOfWeek ||
          (b.block_date !== null && b.block_date <= dateStr && dateStr <= (b.end_date ?? b.block_date))) &&
        timeToMinutes(b.starts_at.slice(0, 5)) < endMinutes &&
        timeToMinutes(b.ends_at.slice(0, 5)) > startMinutes,
    )
    if (isBlocked) return false

    const end = new Date(start.getTime() + (durationMinutes ?? 30) * 60000)
    const hasConflict = otherAppointments.some((a) => {
      if (a.employee_id !== profileId) return false
      const aStart = new Date(a.scheduled_at)
      const aEnd = new Date(aStart.getTime() + (a.duration_minutes ?? 30) * 60000)
      return aStart < end && aEnd > start
    })
    return !hasConflict
  }

  // Randevunun hizmetine (employee_services) atanmis calisanlara daraltir —
  // AppointmentsPage.tsx'teki eligibleEmployees ile ayni desen: bu hizmete
  // hic kimse atanmamissa aday havuzu bos kalir (fallback yok, kasitli).
  function candidatesFor(conflict: ConflictAppointment) {
    if (!conflict.service_id) return otherProfiles
    const matchIds = new Set(
      employeeServices.filter((es) => es.service_id === conflict.service_id).map((es) => es.profile_id),
    )
    return otherProfiles.filter((p) => matchIds.has(p.id))
  }

  function availableCandidatesFor(conflict: ConflictAppointment) {
    return candidatesFor(conflict).filter((p) => isCandidateAvailable(p.id, conflict.scheduled_at, conflict.duration_minutes))
  }

  async function handleSaveClick() {
    const range = draftDateRange()
    if (!range) {
      await saveLeaves()
      return
    }
    setCheckingConflicts(true)
    const found = await findConflicts(range)
    if (found.length === 0) {
      setCheckingConflicts(false)
      await saveLeaves()
      return
    }
    await loadResolutionPool(range)
    setConflicts(found)
    setChoices({})
    setCheckingConflicts(false)
    setConflictModalOpen(true)
  }

  // Her randevu icin secilen islemi uygula, sonra izni kaydet.
  async function confirmResolution() {
    setResolving(true)
    for (const c of conflicts) {
      const choice = choices[c.id] ?? 'keep'
      if (choice.startsWith('to:')) {
        await supabase.from('appointments').update({ employee_id: choice.slice(3) }).eq('id', c.id)
      } else if (choice === 'cancel') {
        await supabase.from('appointments').update({ status: 'iptal' }).eq('id', c.id)
      }
    }
    setConflictModalOpen(false)
    await saveLeaves()
    setResolving(false)
  }

  // Baska bir calisanin sayfasindan "Kim izinli?" ile gelindiyse formu ac.
  useEffect(() => {
    if (searchParams.get('ekle') === '1') {
      setFormOpen(true)
      searchParams.delete('ekle')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Rota degisince (baska calisana gecis) liste filtresi o calisana donsun.
  useEffect(() => {
    if (id) setWho(id)
    setLeaveReady(false)
  }, [id])

  useEffect(() => {
    if (!autoSave) return
    setAutoSave(false)
    handleSaveClick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, leaveDrafts])

  if (loading) return <p className={styles.empty}>Yükleniyor…</p>
  if (!employee) return <p className={styles.empty}>Ekip üyesi bulunamadı.</p>

  const busy = savingLeaves || checkingConflicts
  const todayStr = todayLocalDateString()
  const nameOf = (pid: string) => (allProfiles.find((p) => p.id === pid)?.full_name ?? '—').trim().split(/\s+/)[0]
  const employeeFirst = (employee.full_name ?? '—').trim().split(/\s+/)[0]

  // Liste: "Herkes" secilirse tum ekibin izinleri, degilse secili calisaninki.
  // Secili calisan bu sayfanin calisaniysa taslaklar (henuz kaydedilmemis
  // degisiklikler dahil) gosterilir.
  type Row = { key: string; pid: string; date: string; endDate: string; allDay: boolean; start: string; end: string; label: string; draftId?: string }
  const ownRows: Row[] = leaveDrafts.map((d) => ({
    key: d.id,
    pid: id as string,
    date: d.date,
    endDate: d.endDate || d.date,
    allDay: d.allDay,
    start: d.start,
    end: d.end,
    label: d.label,
    draftId: d.id,
  }))
  const otherRows: Row[] = allLeaves
    .filter((b) => b.profile_id !== id)
    .map((b) => ({
      key: b.id,
      pid: b.profile_id,
      date: b.block_date as string,
      endDate: (b.end_date ?? b.block_date) as string,
      allDay: b.starts_at.slice(0, 5) <= '00:05' && b.ends_at.slice(0, 5) >= '23:55',
      start: b.starts_at.slice(0, 5),
      end: b.ends_at.slice(0, 5),
      label: b.label ?? '',
    }))
  const rows = (who === 'herkes' ? [...ownRows, ...otherRows] : who === id ? ownRows : otherRows.filter((r) => r.pid === who)).sort(
    (a, b) => a.date.localeCompare(b.date),
  )
  const upcoming = rows.filter((r) => r.endDate >= todayStr)
  const past = rows.filter((r) => r.endDate < todayStr).reverse()

  function rowDays(r: Row) {
    return Math.round((new Date(`${r.endDate}T00:00:00`).getTime() - new Date(`${r.date}T00:00:00`).getTime()) / 86400000) + 1
  }

  function conflictCount(r: Row) {
    return upcomingAppts.filter((a) => {
      if (a.employee_id !== r.pid) return false
      const d = new Date(a.scheduled_at)
      const ds = toLocalDateString(d)
      if (ds < r.date || ds > r.endDate) return false
      if (r.allDay) return true
      const s = d.getHours() * 60 + d.getMinutes()
      return timeToMinutes(r.start) < s + (a.duration_minutes ?? 30) && timeToMinutes(r.end) > s
    }).length
  }

  // Ekleme penceresinde secili tarihlerdeki randevular (onizleme).
  const formEnd = leaveKind === 'gun' ? leaveEndDate || leaveDate : leaveDate
  const formConflicts = upcomingAppts
    .filter((a) => {
      if (a.employee_id !== id || !leaveDate) return false
      const d = new Date(a.scheduled_at)
      const ds = toLocalDateString(d)
      if (ds < leaveDate || ds > formEnd) return false
      if (leaveKind !== 'saat') return true
      if (!leaveStart || !leaveEnd) return false
      const s = d.getHours() * 60 + d.getMinutes()
      return timeToMinutes(leaveStart) < s + (a.duration_minutes ?? 30) && timeToMinutes(leaveEnd) > s
    })
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  const resolvedCount = conflicts.filter((c) => choices[c.id] && choices[c.id] !== 'keep').length

  // Cakisma cozum ekrani (tasarim: Izinler-5)
  if (conflictModalOpen) {
    const first = leaveDrafts.find((d) => !d.blockId)
    return (
      <div className={styles.wrap}>
        <PageHeader
          back={() => setConflictModalOpen(false)}
          title={`${employeeFirst} izinli olacak`}
          sub={
            first
              ? `${new Date(`${first.date}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}${
                  first.endDate && first.endDate !== first.date
                    ? ` – ${new Date(`${first.endDate}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`
                    : ''
                } · ${first.allDay ? 'tam gün' : `${first.start} – ${first.end}`}`
              : undefined
          }
        />

        <div className={styles.resolveHero}>
          <span className={styles.resolveTitle}>
            O tarihte {conflicts.length} randevusu var. Ne yapalım?
          </span>
          <div className={styles.resolveProgress}>
            <span className={styles.resolveTrack}>
              <span style={{ width: `${conflicts.length ? (resolvedCount / conflicts.length) * 100 : 0}%` }} />
            </span>
            <span className={styles.resolveCount}>
              {resolvedCount} / {conflicts.length} çözüldü
            </span>
          </div>
        </div>

        {conflicts.map((c) => {
          const cands = availableCandidatesFor(c)
          const choice = choices[c.id] ?? 'keep'
          const set = (v: string) => setChoices((prev) => ({ ...prev, [c.id]: v }))
          return (
            <div className={choice === 'keep' ? `${styles.resolveCard} ${styles.resolveCardOpen}` : styles.resolveCard} key={c.id}>
              <span className={styles.resolveWho}>
                <span className={styles.resolveName}>{c.customerName}</span>
                <span className={styles.resolveMeta}>
                  {new Date(c.scheduled_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}{' '}
                  {new Date(c.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {c.serviceName} ·{' '}
                  {c.duration_minutes ?? 30} dk
                </span>
              </span>
              <div className={styles.optionList}>
                {cands.slice(0, 2).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={choice === `to:${p.id}` ? styles.optionActive : styles.option}
                    onClick={() => set(`to:${p.id}`)}
                  >
                    <span className={choice === `to:${p.id}` ? styles.radioOn : styles.radio} />
                    <span className={styles.optionText}>
                      <span className={styles.optionTitle}>{(p.full_name ?? '—').split(' ')[0]} yapsın</span>
                      <span className={styles.optionSub}>Aynı saat boş, bu hizmeti yapabiliyor</span>
                    </span>
                  </button>
                ))}
                {cands.length === 0 && <span className={styles.optionNote}>Bu saatte bu hizmeti yapabilecek boş kimse yok.</span>}
                <button
                  type="button"
                  className={choice === 'cancel' ? styles.optionActive : styles.option}
                  onClick={() => set('cancel')}
                >
                  <span className={choice === 'cancel' ? styles.radioOn : styles.radio} />
                  <span className={styles.optionText}>
                    <span className={styles.optionTitle}>İptal et</span>
                    <span className={styles.optionSub}>Randevu iptal olarak işaretlenir</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={choice === 'keep' ? styles.optionActive : styles.option}
                  onClick={() => set('keep')}
                >
                  <span className={choice === 'keep' ? styles.radioOn : styles.radio} />
                  <span className={styles.optionText}>
                    <span className={styles.optionTitle}>Şimdilik dokunma</span>
                    <span className={styles.optionSub}>Sonra Randevular ekranından taşırsın</span>
                  </span>
                </button>
              </div>
            </div>
          )
        })}

        <div className={styles.footer}>
          <button type="button" className={styles.footerBtn} onClick={confirmResolution} disabled={resolving}>
            {resolving ? 'Kaydediliyor…' : 'Uygula ve izni kaydet'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <PageHeader back={`/ekip/${id}`} title="İzinler" />

      <div className={styles.whoChips}>
        <button type="button" className={who === 'herkes' ? styles.whoChipActive : styles.whoChip} onClick={() => setWho('herkes')}>
          Herkes
        </button>
        {allProfiles.map((p) => (
          <button
            type="button"
            key={p.id}
            className={who === p.id ? styles.whoChipActive : styles.whoChip}
            onClick={() => (p.id === id ? setWho(p.id) : navigate(`/ekip/${p.id}/izinler`))}
          >
            {(p.full_name ?? '—').trim().split(/\s+/)[0]}
          </button>
        ))}
      </div>

      {busy && <p className={styles.empty}>{checkingConflicts ? 'Randevular kontrol ediliyor…' : 'Kaydediliyor…'}</p>}

      <span className={styles.groupLabel}>Yaklaşan</span>
      {upcoming.length === 0 ? (
        <div className={styles.emptyCard}>Planlanmış izin yok.</div>
      ) : (
        <div className={styles.listCard}>
          {upcoming.map((r) => {
            const start = new Date(`${r.date}T00:00:00`)
            const days = rowDays(r)
            const cc = conflictCount(r)
            return (
              <div className={styles.leaveRow} key={r.key}>
                <span className={cc > 0 ? `${styles.dateTile} ${styles.dateTileWarm}` : styles.dateTile}>
                  <span className={styles.dateTileDay}>{start.getDate()}</span>
                  <span className={styles.dateTileMonth}>
                    {start.toLocaleDateString('tr-TR', { month: 'short' }).toLocaleUpperCase('tr')}
                  </span>
                </span>
                <span className={styles.leaveText}>
                  <span className={styles.leaveTitle}>
                    {nameOf(r.pid)} · {r.allDay ? `${days} gün` : 'birkaç saat'}
                  </span>
                  <span className={styles.leaveMeta}>
                    {days > 1
                      ? `${start.getDate()} – ${new Date(`${r.endDate}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`
                      : start.toLocaleDateString('tr-TR', { weekday: 'long' })}
                    {' · '}
                    {r.allDay ? 'tam gün' : `${r.start} – ${r.end}`}
                    {r.label ? ` · ${r.label.toLocaleLowerCase('tr')}` : ''}
                  </span>
                </span>
                {cc > 0 && <span className={styles.conflictPill}>{cc} randevu çakışıyor</span>}
                {r.draftId && (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => {
                      if (!window.confirm('Bu izni silmek istiyor musun?')) return
                      removeLeaveDraft(r.draftId!)
                      setAutoSave(true)
                    }}
                    disabled={busy}
                    aria-label="İzni sil"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {past.length > 0 && (
        <>
          <span className={styles.groupLabel}>Geçmiş</span>
          <div className={styles.listCard}>
            {past.map((r) => {
              const start = new Date(`${r.date}T00:00:00`)
              const days = rowDays(r)
              return (
                <div className={styles.pastRow} key={r.key}>
                  <span>
                    <b>{nameOf(r.pid)}</b>{' '}
                    <span className={styles.pastMeta}>
                      · {start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                      {days > 1 ? ` – ${new Date(`${r.endDate}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}` : ''}
                      {r.label ? ` · ${r.label.toLocaleLowerCase('tr')}` : ''}
                    </span>
                  </span>
                  <span className={styles.pastMeta}>{r.allDay ? `${days} gün` : 'saatlik'}</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.footerBtn} onClick={() => setFormOpen(true)} disabled={busy}>
          İzin ekle
        </button>
      </div>

      {formOpen && (
        <div className={styles.sheetBackdrop} onClick={() => setFormOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <span className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetHead}>
              <h1 className={styles.sheetTitle}>İzin ekle</h1>
              <button type="button" className={styles.sheetCancel} onClick={() => setFormOpen(false)}>
                Vazgeç
              </button>
            </div>

            <div className={styles.fGroup}>
              <span className={styles.fLabel}>Kim izinli?</span>
              <div className={styles.personRow}>
                {allProfiles.map((p, i) => (
                  <button
                    type="button"
                    key={p.id}
                    className={p.id === id ? styles.personActive : styles.person}
                    onClick={() => {
                      if (p.id === id) return
                      setFormOpen(false)
                      navigate(`/ekip/${p.id}/izinler?ekle=1`)
                    }}
                  >
                    <span className={`${styles.personAvatar} ${styles[`tone${i % 3}`]}`}>
                      {(p.full_name ?? '?').trim().charAt(0).toLocaleUpperCase('tr')}
                    </span>
                    {(p.full_name ?? '—').trim().split(/\s+/)[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.segmented}>
              {(
                [
                  { value: 'tam', label: 'Tam gün' },
                  { value: 'saat', label: 'Birkaç saat' },
                  { value: 'gun', label: 'Birkaç gün' },
                ] as { value: LeaveKind; label: string }[]
              ).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={leaveKind === o.value ? styles.segmentActive : styles.segment}
                  onClick={() => setLeaveKind(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div className={styles.rowsCard}>
              <label className={styles.formRow}>
                <span className={styles.formRowLabel}>{leaveKind === 'gun' ? 'Başlangıç' : 'Gün'}</span>
                <span className={styles.formRowValue}>
                  {leaveDate
                    ? new Date(`${leaveDate}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
                    : 'Seç'}{' '}
                  ›
                </span>
                <input className={styles.formRowInput} type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
              </label>
              {leaveKind === 'gun' && (
                <label className={styles.formRow}>
                  <span className={styles.formRowLabel}>Bitiş</span>
                  <span className={styles.formRowValue}>
                    {leaveEndDate
                      ? new Date(`${leaveEndDate}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })
                      : 'Seç'}{' '}
                    ›
                  </span>
                  <input
                    className={styles.formRowInput}
                    type="date"
                    min={leaveDate || undefined}
                    value={leaveEndDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                  />
                </label>
              )}
              {leaveKind === 'saat' && (
                <div className={styles.formRow}>
                  <span className={styles.formRowLabel}>Saat</span>
                  <span className={styles.timePair}>
                    <select className={styles.timeSelect} value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)}>
                      <option value="">--:--</option>
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    –
                    <select className={styles.timeSelect} value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)}>
                      <option value="">--:--</option>
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
              )}
              <button type="button" className={`${styles.formRow} ${styles.formRowBtn}`} onClick={() => setReasonPickerOpen(true)}>
                <span className={styles.formRowLabel}>Sebep</span>
                <span className={styles.formRowValue}>{leaveLabel || 'Seç'} ›</span>
              </button>
              <PickerSheet
                open={reasonPickerOpen}
                title="İzin sebebi"
                options={LEAVE_REASON_OPTIONS.map((o) => ({ value: o, label: o }))}
                value={leaveLabel}
                onSelect={setLeaveLabel}
                onClose={() => setReasonPickerOpen(false)}
              />
            </div>

            {formConflicts.length > 0 && (
              <div className={styles.warnBox}>
                <span className={styles.warnTitle}>
                  O {leaveKind === 'gun' ? 'tarihlerde' : 'gün'} {employeeFirst}’in {formConflicts.length} randevusu var
                </span>
                <div className={styles.warnList}>
                  {formConflicts.slice(0, 4).map((a) => (
                    <span key={a.id}>
                      {new Date(a.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {upcomingCustomerNames.get(a.customer_id ?? '') ?? 'Müşteri'}
                    </span>
                  ))}
                </div>
                <span className={styles.warnSub}>Bir sonraki adımda her biri için ne yapılacağını seçeceksin.</span>
              </div>
            )}

            <span className={styles.infoNote}>İzinli olduğu saatlerde bot ve online sayfa {employeeFirst}’e randevu vermez.</span>

            <button
              type="button"
              className={styles.footerBtn}
              disabled={!leaveDate || (leaveKind === 'saat' && (!leaveStart || !leaveEnd))}
              onClick={() => {
                addLeaveDraft()
                setFormOpen(false)
                setAutoSave(true)
              }}
            >
              {formConflicts.length > 0 ? `Devam · ${formConflicts.length} randevuyu çöz` : 'İzni kaydet'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
