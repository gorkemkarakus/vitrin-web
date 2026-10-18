import { useEffect, useMemo, useRef, useState } from 'react'
import { matchesSearch } from '../lib/search'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'
import { useAuth } from '../contexts/AuthContext'
import { TIME_OPTIONS } from '../lib/timeOptions'
import { toLocalDateString, todayLocalDateString, timeToMinutes, DAY_SHORT, DAY_MS } from '../lib/date'
import Avatar from '../components/Avatar'
import StatusDropdown from '../components/StatusDropdown'
import { ChevronRightIcon, PencilIcon } from '../components/icons'
import type { LayoutOutletContext } from '../layouts/DashboardLayout'
import PageHeader from '../components/PageHeader'
import styles from './AppointmentsPage.module.css'
import EditAppointmentModal from './appointments/EditAppointmentModal'
import AppointmentDetailView from './appointments/AppointmentDetailView'
import CompleteAppointmentScreen from './appointments/CompleteAppointmentScreen'
import NewAppointmentForm from './appointments/NewAppointmentForm'
import WideDayCalendar from './appointments/WideDayCalendar'
import { useLayout } from '../lib/layout'
import { friendlyDbError } from '../lib/dbErrors'
import { STATUS_DROPDOWN_OPTIONS, STATUS_OPTIONS } from './appointments/constants'
import {
  SLOT_MINUTES,
  type Appointment,
  type Customer,
  type EmployeeServiceRow,
  type Profile,
  type Schedule,
  type Service,
  type ServicePackage,
  type TimeBlock,
} from './appointments/types'

const STATUS_CLASS: Record<Appointment['status'], string> = {
  bekliyor: styles.statusBekliyor,
  onaylandi: styles.statusOnaylandi,
  tamamlandi: styles.statusTamamlandi,
  iptal: styles.statusIptal,
  gelmedi: styles.statusGelmedi,
}

type ViewMode = 'gunluk' | 'liste' | 'haftalik' | 'ozel'

export default function AppointmentsPage() {
  const { profile, can } = useAuth()
  // Calisan yetkileri (yoneticide hepsi acik) — bkz. lib/permissions.ts.
  const navigate = useNavigate()
  const { searchQuery, setSearchPlaceholder } = useOutletContext<LayoutOutletContext>()
  const [searchParams, setSearchParams] = useSearchParams()

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [servicePackages, setServicePackages] = useState<ServicePackage[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [employeeServices, setEmployeeServices] = useState<EmployeeServiceRow[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('gunluk')
  const [viewDate, setViewDate] = useState(todayLocalDateString())
  const [customRangeStart, setCustomRangeStart] = useState(todayLocalDateString())
  const [customRangeEnd, setCustomRangeEnd] = useState(todayLocalDateString())
  const [now] = useState(new Date())
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [dailyDisplay, setDailyDisplay] = useState<'zaman' | 'liste'>('zaman')
  // Genis ekranda gun gorunumu calisan sutunlu takvim (WideDayCalendar).
  const { isWide } = useLayout()
  const [prefill, setPrefill] = useState<{ date: string; time: string; employeeId: string | null; key: number } | null>(
    null,
  )
  const dateInputRef = useRef<HTMLInputElement>(null)

  const [showForm, setShowForm] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const weekSwipeX = useRef<number | null>(null)

  // Gorunum menusu disina dokununca kapansin.
  useEffect(() => {
    if (!viewMenuOpen) return
    function handleDown(e: PointerEvent) {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setViewMenuOpen(false)
    }
    document.addEventListener('pointerdown', handleDown)
    return () => document.removeEventListener('pointerdown', handleDown)
  }, [viewMenuOpen])

  useEffect(() => {
    setSearchPlaceholder('Müşteri veya randevu ara…')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let changed = false
    if (searchParams.get('yeni') === '1') {
      setShowForm(true)
      setError(null)
      searchParams.delete('yeni')
      changed = true
    }
    const tarih = searchParams.get('tarih')
    if (tarih) {
      setViewDate(tarih)
      setViewMode('gunluk')
      searchParams.delete('tarih')
      changed = true
    }
    const tamamla = searchParams.get('tamamla')
    if (tamamla && !loading) {
      const target = appointments.find((a) => a.id === tamamla)
      if (target) handleStatusChange(target, 'tamamlandi')
      searchParams.delete('tamamla')
      changed = true
    }
    if (changed) setSearchParams(searchParams, { replace: true })
    // "yeni"/"tarih" sorgu parametreleri sayfa ZATEN acikken de gelebilir
    // (ör. Takvim'deyken alt navigasyondaki + > "Yeni Randevu"ya basmak) —
    // bos bagimlilik dizisi sadece ilk mount'ta calisirdi, o durumda hicbir
    // sey olmuyordu. searchParams degistikce yeniden calismali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading])

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // "Tamamlandi" isaretlenince acilan odeme + sonraki seans ekrani (CompleteAppointmentScreen).
  const [completingAppt, setCompletingAppt] = useState<Appointment | null>(null)

  // Randevu duzenleme mini-formu — hizmet, calisan, tarih/saat, not ve
  // musteri telefonunu degistirmeye izin verir. Paket/musteri degisikligi
  // KAPSAM DISI tutuldu (ayri, daha riskli akislar; istenmedi).
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null)

  // Satira/karta tiklaninca acilan detay: kompakt satirda yer olmayan not,
  // kaynak gibi alanlar burada gorunur.
  const [viewingAppt, setViewingAppt] = useState<Appointment | null>(null)

  // "silent=true" bir mutasyondan sonra cagrilir — veriyi arka planda
  // tazeler ama "loading" bayragini geri true yapmaz, boylece sayfa her
  // islemden sonra bos "Yükleniyor…" yazisina donup yeniden cizilmiyor.
  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    // Randevular 3 yillik bir pencereyle cekilir (2 yil geri, 1 yil ileri) ki
    // sorgu yillar icinde sinirsiz buyumesin. Gorunumler bu pencerenin
    // disina pratikte cikmaz; 'ozel' aralik disina tasarsa sonuclar eksik
    // gorunur (bilinen sinir).
    const windowStart = new Date()
    windowStart.setFullYear(windowStart.getFullYear() - 2)
    const windowEnd = new Date()
    windowEnd.setFullYear(windowEnd.getFullYear() + 1)
    const [
      { data: appts },
      { data: custs },
      { data: pkgs },
      { data: svcs },
      { data: profs },
      { data: empSvcs },
      { data: scheds },
      { data: blocks },
    ] = await Promise.all([
      fetchAll(() =>
        supabase
          .from('appointments')
          .select(
            'id, customer_id, service_id, employee_id, created_by_user_id, scheduled_at, duration_minutes, status, source, source_note, notes, package_id, price_override, created_at, reminder_sent_at',
          )
          .gte('scheduled_at', windowStart.toISOString())
          .lte('scheduled_at', windowEnd.toISOString())
          .order('scheduled_at', { ascending: true })
          .order('id'),
      ),
      fetchAll(() =>
        supabase.from('customers').select('id, full_name, phone, contact_phone, notes').order('full_name').order('id'),
      ),
      fetchAll(() =>
        supabase
          .from('service_packages')
          .select('id, customer_id, service_id, total_sessions, session_offset, status')
          .order('id'),
      ),
      supabase.from('services').select('*').eq('is_active', true).order('name'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('employee_services').select('profile_id, service_id'),
      supabase.from('employee_schedules').select('profile_id, day_of_week, starts_at, ends_at'),
      supabase.from('employee_time_blocks').select('profile_id, day_of_week, block_date, end_date, starts_at, ends_at'),
    ])
    setAppointments(appts ?? [])
    setCustomers(custs ?? [])
    setServicePackages(pkgs ?? [])
    setServices(svcs ?? [])
    setProfiles(profs ?? [])
    setEmployeeServices(empSvcs ?? [])
    setSchedules(scheds ?? [])
    setTimeBlocks(blocks ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.full_name ?? '—'
  // "phone" bazen chatbot kanal kimligi olabilir (ör. Instagram IGSID) —
  // gercek numara varsa (contact_phone) her zaman ona oncelik ver.
  const customerPhone = (id: string | null) => {
    const c = customers.find((c) => c.id === id)
    return c?.contact_phone || c?.phone || null
  }
  const serviceName = (id: string | null) => services.find((s) => s.id === id)?.name ?? '—'
  const rawCustomerPhone = (id: string | null) => customers.find((c) => c.id === id)?.phone ?? null
  const customerNote = (id: string | null) => customers.find((c) => c.id === id)?.notes ?? null
  const employeeName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? '—'

  // Calisan: kendi actigi randevular + kendisine atanmis olanlar (bot, online
  // sayfa ya da yoneticinin actigi) — appointments_update_assigned politikasi.
  function canEdit(appt: Appointment) {
    return (
      profile?.role === 'admin' ||
      can('randevu_tumu_duzenle') ||
      appt.created_by_user_id === profile?.id ||
      appt.employee_id === profile?.id
    )
  }

  function openDetail(a: Appointment) {
    setViewingAppt(a)
  }

  // Takvimde surukle-birak: EditAppointmentModal ile ayni kurallar (musaitlik,
  // hatirlatma isaretinin sifirlanmasi, cakisma / yetki mesajlari).
  async function moveAppointment(a: Appointment, employeeId: string | null, start: Date) {
    setError(null)
    setSuccess(null)
    if (!canEdit(a)) {
      setError('Bu randevuyu taşıma yetkin yok.')
      return
    }
    const duration = a.duration_minutes ?? services.find((s) => s.id === a.service_id)?.duration_minutes ?? SLOT_MINUTES
    if (employeeId && !isEmployeeAvailable(employeeId, start, duration, a.id)) {
      setError(`${employeeName(employeeId)} bu saatte müsait değil (mesai dışı, izinli veya dolu).`)
      return
    }
    const timeChanged = new Date(a.scheduled_at).getTime() !== start.getTime()
    const { error: err } = await supabase
      .from('appointments')
      .update({
        employee_id: employeeId,
        scheduled_at: start.toISOString(),
        ...(timeChanged ? { reminder_sent_at: null } : {}),
      })
      .eq('id', a.id)
    if (err) {
      setError(
        /exclusion|conflicting key|deadlock/i.test(err.message)
          ? 'Seçilen saat dolu. Farklı bir saat seçin.'
          : /row-level security/i.test(err.message)
            ? 'Bu randevuyu başka bir çalışana yalnızca yönetici aktarabilir.'
            : friendlyDbError(err, 'Randevu taşınamadı, tekrar deneyin.'),
      )
    } else {
      const at = start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      setSuccess(
        `${customerName(a.customer_id)} randevusu ${at} · ${employeeId ? employeeName(employeeId) : 'atanmamış'} olarak taşındı.`,
      )
    }
    await loadData(true)
  }

  function openEdit(a: Appointment) {
    setEditingAppt(a)
  }

  // Randevu bir paketin parcasiysa "3/8" gibi ilerleme bilgisini dondurur —
  // seans numarasi ayri bir sutunda tutulmuyor, paketteki randevular tarihe
  // gore siralanip bu randevunun kacinci sirada oldugu buradan hesaplaniyor.
  function packageProgress(a: Appointment): { current: number; total: number } | null {
    if (!a.package_id) return null
    const pkg = servicePackages.find((p) => p.id === a.package_id)
    if (!pkg) return null
    const siblings = appointments
      .filter((x) => x.package_id === a.package_id)
      .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
    const idx = siblings.findIndex((x) => x.id === a.id)
    return { current: idx + 1 + pkg.session_offset, total: pkg.total_sessions }
  }

  function isEmployeeAvailable(employeeId: string, start: Date, durationMinutes: number, excludeApptId?: string) {
    const dayOfWeek = start.getDay()
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = startMinutes + durationMinutes

    const worksThen = schedules.some(
      (s) =>
        s.profile_id === employeeId &&
        s.day_of_week === dayOfWeek &&
        timeToMinutes(s.starts_at.slice(0, 5)) <= startMinutes &&
        timeToMinutes(s.ends_at.slice(0, 5)) >= endMinutes,
    )
    if (!worksThen) return false

    const dateStr = toLocalDateString(start)
    const isBlocked = timeBlocks.some(
      (b) =>
        b.profile_id === employeeId &&
        (b.day_of_week === dayOfWeek ||
          (b.block_date !== null && b.block_date <= dateStr && dateStr <= (b.end_date ?? b.block_date))) &&
        timeToMinutes(b.starts_at.slice(0, 5)) < endMinutes &&
        timeToMinutes(b.ends_at.slice(0, 5)) > startMinutes,
    )
    if (isBlocked) return false

    const end = new Date(start.getTime() + durationMinutes * 60000)
    const hasConflict = appointments.some((a) => {
      if (a.employee_id !== employeeId || a.status === 'iptal' || a.status === 'gelmedi' || a.id === excludeApptId)
        return false
      const aStart = new Date(a.scheduled_at)
      const aEnd = new Date(aStart.getTime() + (a.duration_minutes ?? SLOT_MINUTES) * 60000)
      return aStart < end && aEnd > start
    })
    return !hasConflict
  }

  // Verilen tarihte, aday calisanlardan EN AZ birinin o gun (haftanin o
  // gunu icin) tanimli bir calisma saati var mi? Hicbirinin yoksa o gun
  // hicbir sekilde randevu alinamaz — "isletme kapali" sayilir. Aday
  // listesi bossa (ör. randevuya henuz calisan atanmamis) kisitlama
  // uygulanmaz, her gun acik sayilir — mevcut isEmployeeAvailable
  // kontrolundeki "calisan atanmamissa kontrolu atla" davranisiyla tutarli.
  function isDayOpenForCandidates(dateStr: string, candidateIds: string[]) {
    if (candidateIds.length === 0) return true
    const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay()
    return schedules.some((s) => candidateIds.includes(s.profile_id) && s.day_of_week === dayOfWeek)
  }

  // TIME_OPTIONS listesindeki her saat icin, aday calisanlardan en az biri
  // musaitse secilebilir, hicbiri musait degilse "disabled" (soluk/
  // secilemez) olarak isaretlenir; dolu saat hic secilemedigi icin kayit
  // aninda cakisma hatasi olusmaz.
  function buildTimeOptions(dateStr: string, candidateIds: string[], durationMinutes: number, excludeApptId?: string) {
    return TIME_OPTIONS.map((t) => {
      if (candidateIds.length === 0 || !dateStr) return { value: t, label: t }
      const start = new Date(`${dateStr}T${t}`)
      const available = candidateIds.some((id) => isEmployeeAvailable(id, start, durationMinutes, excludeApptId))
      return { value: t, label: t, disabled: !available }
    })
  }

  async function updateStatus(appt: Appointment, status: Appointment['status']) {
    await supabase.from('appointments').update({ status }).eq('id', appt.id)
    await loadData(true)
  }

  async function handleStatusChange(appt: Appointment, status: Appointment['status']) {
    if (status === 'tamamlandi') {
      setCompletingAppt(appt)
    } else {
      updateStatus(appt, status)
    }
  }

  function shiftWeek(weeks: number) {
    const d = new Date(viewDate + 'T00:00:00')
    d.setDate(d.getDate() + weeks * 7)
    setViewDate(toLocalDateString(d))
  }

  const diffDays = Math.round(
    (new Date(viewDate + 'T00:00:00').getTime() - new Date(todayLocalDateString() + 'T00:00:00').getTime()) / DAY_MS,
  )
  const viewWeekday = new Date(viewDate + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long' })
  let dayLabel: string
  if (diffDays === 0) dayLabel = 'Bugün'
  else if (diffDays === 1) dayLabel = 'Yarın'
  else if (diffDays === -1) dayLabel = 'Dün'
  else if (Math.abs(diffDays) <= 7)
    dayLabel = `${viewWeekday} · ${diffDays > 0 ? `${diffDays} gün sonra` : `${Math.abs(diffDays)} gün önce`}`
  else dayLabel = viewWeekday

  // Arama sorgusuna göre süzülmüş randevu listesi (müşteri/hizmet/çalışan adına göre).
  const searchFiltered = searchQuery.trim()
    ? appointments.filter((a) =>
        matchesSearch(searchQuery, customerName(a.customer_id), serviceName(a.service_id), employeeName(a.employee_id)),
      )
    : appointments

  // Çalışan filtresi (Takvim'deki "Tüm Çalışanlar" seçici).
  const employeeFiltered = employeeFilter
    ? searchFiltered.filter((a) => a.employee_id === employeeFilter)
    : searchFiltered

  // Hafta seridinde randevusu olan gunlerin altina nokta koymak icin.
  const apptDayKeys = new Set(
    employeeFiltered.filter((a) => a.status !== 'iptal').map((a) => toLocalDateString(new Date(a.scheduled_at))),
  )

  // Bugunun henuz bitmemis ilk randevusu — kartinda "Sırada" etiketi ve
  // hizli islem dugmeleri gosterilir.
  const nextApptId =
    employeeFiltered
      .filter(
        (a) =>
          (a.status === 'bekliyor' || a.status === 'onaylandi') &&
          toLocalDateString(new Date(a.scheduled_at)) === todayLocalDateString() &&
          new Date(a.scheduled_at).getTime() + (a.duration_minutes ?? SLOT_MINUTES) * 60000 > now.getTime(),
      )
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0]?.id ?? null

  // Gunun 7-gunluk seridi (Pazartesi-Pazar), gun secici icin.
  const dayStripDates = useMemo(() => {
    const anchor = new Date(`${viewDate}T00:00:00`)
    const isoDay = (anchor.getDay() + 6) % 7
    const monday = new Date(anchor)
    monday.setDate(anchor.getDate() - isoDay)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return d
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate])

  // --- Görünüm moduna göre gösterilecek randevuları hesapla ---
  let visible: Appointment[] = []
  let groupedByDate: { dateKey: string; label: string; items: Appointment[] }[] = []

  if (viewMode === 'gunluk') {
    visible = employeeFiltered.filter((a) => toLocalDateString(new Date(a.scheduled_at)) === viewDate)
  } else if (viewMode === 'liste') {
    // "Ay": icinde bulunulan takvim ayinin tamami.
    const monthStart = new Date()
    monthStart.setDate(1)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
    const monthStartStr = toLocalDateString(monthStart)
    const monthEndStr = toLocalDateString(monthEnd)
    visible = employeeFiltered.filter((a) => {
      const dk = toLocalDateString(new Date(a.scheduled_at))
      return dk >= monthStartStr && dk <= monthEndStr
    })
    const byDate = new Map<string, Appointment[]>()
    for (const a of visible) {
      const dk = toLocalDateString(new Date(a.scheduled_at))
      const list = byDate.get(dk) ?? []
      list.push(a)
      byDate.set(dk, list)
    }
    groupedByDate = Array.from(byDate.keys())
      .sort()
      .map((dateKey) => ({
        dateKey,
        label: new Date(dateKey + 'T00:00:00').toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'long',
          weekday: 'long',
        }),
        items: byDate.get(dateKey)!,
      }))
  } else if (viewMode === 'ozel') {
    // "Özel": kullanicinin sectigi serbest tarih araligi.
    visible = employeeFiltered.filter((a) => {
      const dk = toLocalDateString(new Date(a.scheduled_at))
      return dk >= customRangeStart && dk <= customRangeEnd
    })
    const byDate = new Map<string, Appointment[]>()
    for (const a of visible) {
      const dk = toLocalDateString(new Date(a.scheduled_at))
      const list = byDate.get(dk) ?? []
      list.push(a)
      byDate.set(dk, list)
    }
    groupedByDate = Array.from(byDate.keys())
      .sort()
      .map((dateKey) => ({
        dateKey,
        label: new Date(dateKey + 'T00:00:00').toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'long',
          weekday: 'long',
        }),
        items: byDate.get(dateKey)!,
      }))
  } else {
    // haftalik: viewDate'in içinde bulunduğu Pazartesi-Pazar aralığı
    const anchor = new Date(viewDate + 'T00:00:00')
    const isoDay = (anchor.getDay() + 6) % 7
    const monday = new Date(anchor)
    monday.setDate(anchor.getDate() - isoDay)
    const days: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      days.push(toLocalDateString(d))
    }
    const byDate = new Map<string, Appointment[]>(days.map((d) => [d, []]))
    for (const a of employeeFiltered) {
      const dk = toLocalDateString(new Date(a.scheduled_at))
      if (byDate.has(dk)) byDate.get(dk)!.push(a)
    }
    groupedByDate = days.map((dateKey) => ({
      dateKey,
      label: new Date(dateKey + 'T00:00:00').toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        weekday: 'long',
      }),
      items: byDate.get(dateKey) ?? [],
    }))
    visible = groupedByDate.flatMap((g) => g.items)
  }

  function renderRow(a: Appointment) {
    const d = new Date(a.scheduled_at)
    const isPast = new Date(d.getTime() + (a.duration_minutes ?? SLOT_MINUTES) * 60000) < now
    // "bekliyor" durumunda kalıp saati geçmiş randevular unutulmuş olabilir —
    // bunları soluklaştırmak (diğer geçmiş randevularda yaptığımız gibi) tam
    // tersi etki yaratır, gözden daha da kaçarlar. Bu yüzden ayrı, dikkat
    // çeken bir durum olarak işaretliyoruz; zaten sonuçlanmış (onaylandı/
    // tamamlandı/iptal) geçmiş randevular soluklaşmaya devam eder.
    const isOverdue = isPast && a.status === 'bekliyor'
    const rowClass = [styles.apptRow, isOverdue ? styles.apptRowOverdue : isPast ? styles.apptRowPast : '']
      .filter(Boolean)
      .join(' ')
    return (
      <div
        className={rowClass}
        key={a.id}
        role="button"
        tabIndex={0}
        onClick={() => openDetail(a)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') openDetail(a)
        }}
      >
        <div className={styles.apptTime}>{d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
        <div className={styles.apptCustomer}>
          <Avatar name={customerName(a.customer_id)} size={32} />
          <div className={styles.apptCustomerText}>
            <span className={styles.apptCustomerName}>{customerName(a.customer_id)}</span>
            {customerPhone(a.customer_id) && (
              <span className={styles.apptCustomerPhone}>{customerPhone(a.customer_id)}</span>
            )}
          </div>
        </div>
        <div className={styles.apptService}>
          <span className={styles.serviceTag}>{serviceName(a.service_id)}</span>
          {packageProgress(a) && (
            <span className={styles.packageTag}>
              {packageProgress(a)!.current}/{packageProgress(a)!.total} seans
            </span>
          )}
        </div>
        <div className={styles.apptEmployee}>{employeeName(a.employee_id)}</div>
        <div className={styles.apptStatus}>
          <div className={styles.apptStatusRow} onClick={(e) => e.stopPropagation()}>
            {canEdit(a) && (
              <button
                type="button"
                className={styles.editApptBtn}
                onClick={() => openEdit(a)}
                aria-label="Randevuyu düzenle"
              >
                <PencilIcon width={13} height={13} />
              </button>
            )}
            {canEdit(a) ? (
              <StatusDropdown
                value={a.status}
                options={STATUS_DROPDOWN_OPTIONS}
                urgent={isOverdue}
                onChange={(v) => handleStatusChange(a, v as Appointment['status'])}
              />
            ) : (
              <span className={`${styles.statusBadge} ${STATUS_CLASS[a.status]}`}>
                {STATUS_OPTIONS.find((o) => o.value === a.status)?.label ?? a.status}
              </span>
            )}
          </div>
          {isOverdue && <span className={styles.overdueHint}>Süresi geçti, güncelle</span>}
        </div>
      </div>
    )
  }

  // Zaman cizelgesi karti (tasarim: H2-Randevular). Durum degistirme/duzenleme
  // karttan kaldirildi; karta dokununca acilan detay ekraninda.
  function renderTimelineCard(a: Appointment) {
    const d = new Date(a.scheduled_at)
    const durMin = a.duration_minutes ?? SLOT_MINUTES
    const isPast = new Date(d.getTime() + durMin * 60000) < now
    const isOverdue = isPast && a.status === 'bekliyor'
    const isNext = a.id === nextApptId
    const isClosed = a.status === 'tamamlandi' || a.status === 'iptal' || a.status === 'gelmedi'
    const phone = customerPhone(a.customer_id)
    const pkg = packageProgress(a)
    const subParts = [serviceName(a.service_id), employeeName(a.employee_id)]
    if (isNext) subParts.push(`${durMin} dk`)
    if (pkg) subParts.push(`${pkg.current}/${pkg.total} seans`)

    const statusText =
      a.status === 'tamamlandi'
        ? { text: 'Bitti', cls: styles.cardStateOk }
        : a.status === 'iptal'
          ? { text: 'İptal', cls: styles.cardStateDanger }
          : a.status === 'gelmedi'
            ? { text: 'Gelmedi', cls: styles.cardStateMuted }
            : isOverdue
              ? { text: 'Saati geçti', cls: styles.cardStateWarm }
              : a.status === 'bekliyor' && !isNext
                ? { text: 'Onay bekliyor', cls: styles.cardStateWarm }
                : null

    const open = () => openDetail(a)

    if (isNext) {
      return (
        <div
          className={`${styles.timelineCard} ${styles.timelineCardNext}`}
          role="button"
          tabIndex={0}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter') open()
          }}
        >
          <div className={styles.timelineCardHead}>
            <div className={styles.timelineCardText}>
              <span className={styles.timelineCardCustomer}>{customerName(a.customer_id)}</span>
              <span className={styles.timelineCardService}>{subParts.join(' · ')}</span>
            </div>
            <span className={styles.nextPill}>Sırada</span>
          </div>
          <div className={styles.timelineCardActions} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.cardBtnPrimary}
              disabled={!canEdit(a)}
              onClick={() => handleStatusChange(a, 'tamamlandi')}
            >
              Geldi
            </button>
            {phone ? (
              <a className={styles.cardBtn} href={`tel:${phone}`}>
                Ara
              </a>
            ) : (
              <button type="button" className={styles.cardBtn} disabled>
                Ara
              </button>
            )}
          </div>
        </div>
      )
    }

    return (
      <div
        className={isClosed ? `${styles.timelineCard} ${styles.timelineCardClosed}` : styles.timelineCard}
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter') open()
        }}
      >
        <div className={styles.timelineCardRow}>
          <div className={styles.timelineCardText}>
            <span className={styles.timelineCardCustomer}>{customerName(a.customer_id)}</span>
            <span className={styles.timelineCardService}>{subParts.join(' · ')}</span>
          </div>
          {statusText && <span className={`${styles.cardState} ${statusText.cls}`}>{statusText.text}</span>}
        </div>
      </div>
    )
  }

  function renderTimelineRow(a: Appointment) {
    const start = new Date(a.scheduled_at)
    const ended = start.getTime() + (a.duration_minutes ?? SLOT_MINUTES) * 60000 < now.getTime()
    const gutterClass = [
      styles.timelineRowGutter,
      a.id === nextApptId ? styles.timelineRowGutterNext : ended ? styles.timelineRowGutterPast : '',
    ]
      .filter(Boolean)
      .join(' ')
    return (
      <div key={a.id} className={styles.timelineRow}>
        <span className={gutterClass}>{start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
        {renderTimelineCard(a)}
      </div>
    )
  }

  const employeeChips = (
    <div className={styles.chipRow}>
      <button
        type="button"
        className={employeeFilter === '' ? styles.chipActive : styles.chip}
        onClick={() => setEmployeeFilter('')}
      >
        Tümü
      </button>
      {profiles.map((p) => (
        <button
          type="button"
          key={p.id}
          className={employeeFilter === p.id ? styles.chipActive : styles.chip}
          onClick={() => setEmployeeFilter(p.id)}
        >
          {(p.full_name ?? '—').trim().split(/\s+/)[0]}
        </button>
      ))}
    </div>
  )

  const viewAnchor = new Date(`${viewDate}T00:00:00`)
  const headerPillLabel =
    viewMode === 'gunluk' || viewMode === 'haftalik'
      ? viewAnchor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
      : viewMode === 'liste'
        ? new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
        : 'Özel aralık'

  return (
    <div className={styles.wrap}>
      <PageHeader
        title="Randevular"
        action={
          <div className={styles.viewMenuWrap} ref={viewMenuRef}>
            <button
              type="button"
              className="hdr-pill"
              onClick={() => setViewMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
            >
              {headerPillLabel}
              <ChevronRightIcon width={12} height={12} className={styles.pillChevron} />
            </button>
            {viewMenuOpen && (
              <div className={styles.viewMenu} role="menu">
                <span className={styles.viewMenuTitle}>Görünüm</span>
                <div className={styles.viewMenuSeg}>
                  {(
                    [
                      { value: 'gunluk', label: 'Gün' },
                      { value: 'haftalik', label: 'Hafta' },
                      { value: 'liste', label: 'Ay' },
                      { value: 'ozel', label: 'Özel' },
                    ] as { value: ViewMode; label: string }[]
                  ).map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      className={viewMode === v.value ? styles.viewMenuSegActive : styles.viewMenuSegBtn}
                      onClick={() => {
                        setViewMode(v.value)
                        if (v.value !== 'ozel') setViewMenuOpen(false)
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                {viewMode === 'gunluk' && (
                  <button
                    type="button"
                    className={styles.viewMenuItem}
                    onClick={() => {
                      setDailyDisplay(dailyDisplay === 'zaman' ? 'liste' : 'zaman')
                      setViewMenuOpen(false)
                    }}
                  >
                    {dailyDisplay === 'zaman' ? 'Liste olarak göster' : 'Zaman çizelgesi olarak göster'}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.viewMenuItem}
                  onClick={() => {
                    setViewMenuOpen(false)
                    dateInputRef.current?.showPicker?.()
                  }}
                >
                  Tarihe git
                </button>
                {viewDate !== todayLocalDateString() && (
                  <button
                    type="button"
                    className={styles.viewMenuItem}
                    onClick={() => {
                      setViewDate(todayLocalDateString())
                      setViewMenuOpen(false)
                    }}
                  >
                    Bugüne dön
                  </button>
                )}
              </div>
            )}
            <input
              ref={dateInputRef}
              type="date"
              value={viewDate}
              onChange={(e) => {
                if (e.target.value) setViewDate(e.target.value)
              }}
              className={styles.hiddenDateInput}
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
        }
      />

      {(error || success) && (
        <div className={`${styles.banner} ${error ? styles.bannerError : styles.bannerSuccess}`}>
          <span>{error ?? success}</span>
          <button
            type="button"
            className={styles.bannerClose}
            onClick={() => {
              setError(null)
              setSuccess(null)
            }}
          >
            ✕
          </button>
        </div>
      )}

      {viewMode === 'ozel' && (
        <div className={styles.customRangeRow}>
          <div className="field field-flush">
            <label htmlFor="calRangeStart">Başlangıç</label>
            <input
              id="calRangeStart"
              type="date"
              value={customRangeStart}
              max={customRangeEnd}
              onChange={(e) => setCustomRangeStart(e.target.value)}
            />
          </div>
          <div className="field field-flush">
            <label htmlFor="calRangeEnd">Bitiş</label>
            <input
              id="calRangeEnd"
              type="date"
              value={customRangeEnd}
              min={customRangeStart}
              onChange={(e) => setCustomRangeEnd(e.target.value)}
            />
          </div>
        </div>
      )}

      <NewAppointmentForm
        open={showForm}
        setShowForm={setShowForm}
        appointments={appointments}
        customers={customers}
        services={services}
        profiles={profiles}
        employeeServices={employeeServices}
        schedules={schedules}
        employeeName={employeeName}
        isEmployeeAvailable={isEmployeeAvailable}
        isDayOpenForCandidates={isDayOpenForCandidates}
        buildTimeOptions={buildTimeOptions}
        error={error}
        setError={setError}
        setSuccess={setSuccess}
        loadData={loadData}
        prefill={prefill}
      />

      {completingAppt && (
        <CompleteAppointmentScreen
          key={completingAppt.id}
          appointment={completingAppt}
          appointments={appointments}
          services={services}
          servicePackages={servicePackages}
          customerName={customerName}
          serviceName={serviceName}
          employeeName={employeeName}
          isEmployeeAvailable={isEmployeeAvailable}
          isDayOpenForCandidates={isDayOpenForCandidates}
          buildTimeOptions={buildTimeOptions}
          setError={setError}
          onClose={() => setCompletingAppt(null)}
          loadData={loadData}
        />
      )}

      {viewingAppt && (
        <AppointmentDetailView
          key={viewingAppt.id}
          appointment={viewingAppt}
          customerName={customerName(viewingAppt.customer_id)}
          customerNote={customerNote(viewingAppt.customer_id)}
          phone={customerPhone(viewingAppt.customer_id)}
          rawPhone={rawCustomerPhone(viewingAppt.customer_id)}
          serviceName={serviceName(viewingAppt.service_id)}
          employeeName={employeeName(viewingAppt.employee_id)}
          servicePrice={services.find((s) => s.id === viewingAppt.service_id)?.price ?? null}
          pkg={packageProgress(viewingAppt)}
          canEdit={canEdit(viewingAppt)}
          onClose={() => setViewingAppt(null)}
          onStatusChange={async (status) => {
            const appt = viewingAppt
            setViewingAppt(null)
            await handleStatusChange(appt, status)
          }}
          onComplete={() => {
            const appt = viewingAppt
            setViewingAppt(null)
            handleStatusChange(appt, 'tamamlandi')
          }}
          onEdit={() => {
            const appt = viewingAppt
            setViewingAppt(null)
            openEdit(appt)
          }}
          onOpenCustomer={() => {
            setViewingAppt(null)
            navigate(`/musteriler/${viewingAppt.customer_id}`)
          }}
          onOpenConversation={() => {
            setViewingAppt(null)
            navigate(`/mesajlar?telefon=${encodeURIComponent(rawCustomerPhone(viewingAppt.customer_id) ?? '')}`)
          }}
        />
      )}

      {editingAppt && (
        <EditAppointmentModal
          key={editingAppt.id}
          appointment={editingAppt}
          customerName={customerName(editingAppt.customer_id)}
          customerPhone={customerPhone(editingAppt.customer_id)}
          services={services}
          profiles={profiles}
          isEmployeeAvailable={isEmployeeAvailable}
          isDayOpenForCandidates={isDayOpenForCandidates}
          buildTimeOptions={buildTimeOptions}
          onClose={() => setEditingAppt(null)}
          onSaved={async (warning) => {
            if (warning) setError(warning)
            setEditingAppt(null)
            await loadData(true)
          }}
        />
      )}

      {viewMode === 'gunluk' && (
        <>
          {/* Dokunmatik ekranda serit kaydirilir; farede hafta okla degisir. */}
          {isWide && (
            <div className={styles.weekNavRow}>
              <button
                type="button"
                className={styles.dateNavBtn}
                onClick={() => shiftWeek(-1)}
                aria-label="Önceki hafta"
              >
                ‹
              </button>
              <span className={styles.weekNavLabel}>
                {dayStripDates[0]?.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} –{' '}
                {dayStripDates[dayStripDates.length - 1]?.toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
              {viewDate !== todayLocalDateString() && (
                <button type="button" className="hdr-pill" onClick={() => setViewDate(todayLocalDateString())}>
                  Bugün
                </button>
              )}
              <button
                type="button"
                className={styles.dateNavBtn}
                onClick={() => shiftWeek(1)}
                aria-label="Sonraki hafta"
              >
                ›
              </button>
            </div>
          )}
          <div
            className={styles.weekStrip}
            onTouchStart={(e) => {
              weekSwipeX.current = e.touches[0].clientX
            }}
            onTouchEnd={(e) => {
              // Seridi saga/sola kaydirmak bir onceki/sonraki haftaya gecer.
              const start = weekSwipeX.current
              weekSwipeX.current = null
              if (start === null) return
              const dx = e.changedTouches[0].clientX - start
              if (Math.abs(dx) > 50) shiftWeek(dx < 0 ? 1 : -1)
            }}
          >
            {dayStripDates.map((d) => {
              const dk = toLocalDateString(d)
              const active = dk === viewDate
              const dayClass = [
                active ? styles.weekDayActive : styles.weekDay,
                d.getDay() === 0 && !active ? styles.weekDayOff : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button type="button" key={dk} className={dayClass} onClick={() => setViewDate(dk)}>
                  <span className={styles.weekDayName}>{DAY_SHORT[d.getDay()]}</span>
                  <span className={styles.weekDayNum}>{d.getDate()}</span>
                  <span className={apptDayKeys.has(dk) ? styles.weekDayDot : styles.weekDayDotEmpty} />
                </button>
              )
            })}
          </div>

          {employeeChips}

          {loading ? (
            <p className={styles.emptyNote}>Yükleniyor…</p>
          ) : isWide && dailyDisplay === 'zaman' ? (
            <WideDayCalendar
              date={viewDate}
              appointments={appointments}
              profiles={profiles}
              schedules={schedules}
              timeBlocks={timeBlocks}
              employeeFilter={employeeFilter}
              ownOnly={can('randevu_tumu_gor') ? null : (profile?.id ?? null)}
              customerName={customerName}
              serviceName={serviceName}
              serviceDuration={(id) => services.find((s) => s.id === id)?.duration_minutes ?? SLOT_MINUTES}
              canEdit={canEdit}
              onOpen={openDetail}
              onMove={moveAppointment}
              onCreate={(employeeId, date, time) => {
                setError(null)
                setPrefill({ date, time, employeeId, key: Date.now() })
                setShowForm(true)
              }}
            />
          ) : visible.length === 0 ? (
            <div className={styles.emptyCard}>
              <span className={styles.emptyTitle}>
                {diffDays === 0 ? 'Bugün randevu yok' : `${dayLabel} için randevu yok`}
              </span>
              <span className={styles.emptySub}>Eklemek için “Yeni randevu”yu seç.</span>
            </div>
          ) : dailyDisplay === 'liste' ? (
            <div className={styles.apptList}>
              <div className={styles.apptListHead}>
                <span>Saat</span>
                <span>Müşteri</span>
                <span>Hizmet</span>
                <span>Uzman</span>
                <span>Durum</span>
              </div>
              {visible.map((a) => renderRow(a))}
            </div>
          ) : (
            <div className={styles.timelineList}>{visible.map((a) => renderTimelineRow(a))}</div>
          )}
        </>
      )}

      {viewMode !== 'gunluk' && (
        <>
          {viewMode === 'haftalik' && (
            <div className={styles.weekNavRow}>
              <button
                type="button"
                className={styles.dateNavBtn}
                onClick={() => shiftWeek(-1)}
                aria-label="Önceki hafta"
              >
                ‹
              </button>
              <span className={styles.weekNavLabel}>
                {groupedByDate[0]?.label} – {groupedByDate[6]?.label}
              </span>
              <button
                type="button"
                className={styles.dateNavBtn}
                onClick={() => shiftWeek(1)}
                aria-label="Sonraki hafta"
              >
                ›
              </button>
            </div>
          )}

          {employeeChips}

          {loading ? (
            <p className={styles.emptyNote}>Yükleniyor…</p>
          ) : groupedByDate.length === 0 ? (
            <div className={styles.emptyCard}>
              <span className={styles.emptyTitle}>Bu aralıkta randevu yok</span>
              <span className={styles.emptySub}>
                Başka bir dönem seçebilir ya da “Yeni randevu” ile randevu ekleyebilirsin.
              </span>
            </div>
          ) : (
            groupedByDate.map((group) => (
              <div key={group.dateKey} className={styles.dateGroup}>
                <div className={styles.dateGroupLabel}>{group.label}</div>
                {group.items.length === 0 ? (
                  <p className={styles.sourceNote}>Randevu yok.</p>
                ) : (
                  <div className={styles.timelineList}>{group.items.map((a) => renderTimelineRow(a))}</div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
