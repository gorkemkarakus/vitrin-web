import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { matchesSearch } from '../lib/search'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { NETWORK_ERROR } from '../lib/messages'
import { fetchAll } from '../lib/fetchAll'
import { useAuth } from '../contexts/AuthContext'
import { TIME_OPTIONS } from '../lib/timeOptions'
import { formatPersonName } from '../lib/formatName'
import { currency } from '../lib/currency'
import { toLocalDateString, todayLocalDateString, timeToMinutes, DAY_SHORT, DAY_MS } from '../lib/date'
import Avatar from '../components/Avatar'
import StatusDropdown from '../components/StatusDropdown'
import PickerSheet from '../components/PickerSheet'
import { ChevronRightIcon, PencilIcon } from '../components/icons'
import type { LayoutOutletContext } from '../layouts/DashboardLayout'
import PageHeader from '../components/PageHeader'
import styles from './AppointmentsPage.module.css'
import EditAppointmentModal from './appointments/EditAppointmentModal'
import AppointmentDetailView from './appointments/AppointmentDetailView'
import CompleteAppointmentScreen from './appointments/CompleteAppointmentScreen'
import { rankEligibleByFairness } from '../lib/fairness'
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
import { FIELD_LIMITS } from '../lib/fieldLimits'

// Yeni randevu penceresinde ilk anda gosterilen hizmet cipi sayisi.
const FORM_SERVICE_LIMIT = 5

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toLocaleUpperCase('tr') ?? '')
      .join('') || '?'
  )
}

const SOURCE_OPTIONS = [
  { value: 'kullanici_uzerinden', label: 'Çalışan Üzerinden' },
  { value: 'dogrudan_musteri', label: 'Doğrudan Müşteri' },
  { value: 'chatbot', label: 'Chatbot' },
  { value: 'online_randevu', label: 'Online Randevu' },
  { value: 'diger', label: 'Diğer' },
]

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
  const canSeeAll = can('randevu_tumu_gor')
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
  const dateInputRef = useRef<HTMLInputElement>(null)

  const [showForm, setShowForm] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const weekSwipeX = useRef<number | null>(null)
  // Yeni randevu penceresi
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerListOpen, setCustomerListOpen] = useState(false)
  const [showAllServices, setShowAllServices] = useState(false)
  // Form uzun; kayit hatasi en ustte kalip gorunmeyebilir, hataya kaydirilir.
  const formErrorRef = useRef<HTMLDivElement>(null)
  const [formWeekOffset, setFormWeekOffset] = useState(0)
  const [noteOpen, setNoteOpen] = useState(false)
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const otherDateRef = useRef<HTMLInputElement>(null)

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

  const [useNewCustomer, setUseNewCustomer] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [serviceId, setServiceId] = useState('')
  // Yeni randevunun ucreti: hizmet secilince fiyatiyla dolar, degistirilebilir.
  const [apptPrice, setApptPrice] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [apptDate, setApptDate] = useState(todayLocalDateString())
  const [apptTime, setApptTime] = useState('')
  const [source, setSource] = useState(SOURCE_OPTIONS[0].value)
  const [sourceNote, setSourceNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (error) formErrorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])
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

  function closeForm() {
    setCustomerQuery('')
    setCustomerListOpen(false)
    setShowAllServices(false)
    setFormWeekOffset(0)
    setNoteOpen(false)
    setShowForm(false)
    setError(null)
  }

  const selectedService = services.find((s) => s.id === serviceId) ?? null
  const selectedServicePrice = selectedService?.price ?? null
  useEffect(() => {
    setApptPrice(selectedServicePrice != null ? String(selectedServicePrice) : '')
  }, [serviceId, selectedServicePrice])
  const apptPriceValue = apptPrice.trim() === '' ? null : Math.max(0, Number(apptPrice))
  const effectiveApptPrice =
    apptPriceValue != null && Number.isFinite(apptPriceValue) ? apptPriceValue : selectedServicePrice

  // Bir hizmete hic kimse atanmamissa (bkz. EmployeeDetailPage.tsx "Verdigi
  // Hizmetler") o hizmete kimse randevu alamaz — kasitli, fallback yok.
  // "Herkesin randevularini gor" yetkisi olmayan calisan diger calisanlarin
  // doluluğunu goremedigi icin yalnizca kendine randevu acar.
  const eligibleEmployees = useMemo(() => {
    const pool = canSeeAll ? profiles : profiles.filter((p) => p.id === profile?.id)
    if (!selectedService) return pool
    const ids = new Set(
      employeeServices.filter((es) => es.service_id === selectedService.id).map((es) => es.profile_id),
    )
    return pool.filter((p) => ids.has(p.id))
  }, [selectedService, employeeServices, profiles, canSeeAll, profile?.id])

  // Yalnizca kendine randevu acabilen calisana yapamadigi hizmetler gosterilmez.
  const formServices = useMemo(
    () =>
      canSeeAll
        ? services
        : services.filter((s) =>
            employeeServices.some((es) => es.profile_id === profile?.id && es.service_id === s.id),
          ),
    [canSeeAll, services, employeeServices, profile?.id],
  )

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

  // Yeni randevu penceresi verisi (tasarim: Sec-YeniRandevu).
  const formCandidateIds = employeeId ? [employeeId] : eligibleEmployees.map((p) => p.id)
  // Bos aday listesi isDayOpenForCandidates/buildTimeOptions'ta "kisitlama yok"
  // demektir (calisansiz eski randevular icin); yeni randevuda ise hizmeti yapan
  // kimse yoksa hicbir gun/saat acik degildir.
  const formNoEligible = !!selectedService && eligibleEmployees.length === 0
  const formUnscheduled =
    !!selectedService &&
    formCandidateIds.length > 0 &&
    formCandidateIds.every((id) => !schedules.some((sc) => sc.profile_id === id))
  const formOnlySelf = formCandidateIds.length === 1 && formCandidateIds[0] === profile?.id
  const formEmptyMessage = !serviceId
    ? 'Önce hizmeti seç.'
    : formNoEligible
      ? canSeeAll
        ? 'Bu hizmeti yapan çalışan yok. Ekip sayfasından bir çalışana bu hizmeti ata.'
        : 'Bu hizmet sana atanmamış.'
      : formUnscheduled
        ? formOnlySelf
          ? 'Çalışma saatlerin girilmemiş. Yöneticin Ekip sayfasından ekleyebilir.'
          : `${employeeName(formCandidateIds[0]).split(' ')[0]} için çalışma saati girilmemiş. Ekip sayfasından ekleyebilirsin.`
        : 'Bu gün için müsait saat yok, başka bir gün seç.'
  const formDuration = selectedService?.duration_minutes ?? SLOT_MINUTES
  const selectedCustomer = customerId ? (customers.find((c) => c.id === customerId) ?? null) : null
  const cq = customerQuery.trim().toLocaleLowerCase('tr')
  const customerMatches = cq
    ? customers
        .filter(
          (c) =>
            c.full_name.toLocaleLowerCase('tr').includes(cq) ||
            (c.contact_phone ?? '').includes(cq) ||
            (c.phone ?? '').includes(cq),
        )
        .slice(0, 6)
    : []
  const visibleFormServices = (() => {
    if (showAllServices || formServices.length <= FORM_SERVICE_LIMIT) return formServices
    const first = formServices.slice(0, FORM_SERVICE_LIMIT)
    const sel = formServices.find((x) => x.id === serviceId)
    return sel && !first.includes(sel) ? [sel, ...first.slice(0, FORM_SERVICE_LIMIT - 1)] : first
  })()
  // 6'li gun izgarasi: bugunden itibaren, oklarla 6'sar gun ileri.
  const formDayOptions = showForm
    ? Array.from({ length: 6 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() + formWeekOffset * 6 + i)
        const key = toLocalDateString(d)
        const open = !formNoEligible && isDayOpenForCandidates(key, formCandidateIds)
        const free =
          selectedService && open
            ? buildTimeOptions(key, formCandidateIds, formDuration).filter((o) => !('disabled' in o && o.disabled))
                .length
            : null
        const isToday = formWeekOffset === 0 && i === 0
        return { key, weekday: isToday ? 'Bugün' : DAY_SHORT[d.getDay()], day: d.getDate(), open, free }
      })
    : []
  const formMonthLabel = formDayOptions.length
    ? new Date(`${formDayOptions[0].key}T00:00:00`).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    : ''
  // Saat izgarasi: ilk ve son musait saat arasi; aradaki dolu saatler soluk.
  const formTimeOptions = (() => {
    if (!showForm || !serviceId || formNoEligible) return [] as { value: string; disabled: boolean }[]
    const all = buildTimeOptions(apptDate, formCandidateIds, formDuration).map((o) => ({
      value: o.value,
      disabled: 'disabled' in o ? !!o.disabled : false,
    }))
    const first = all.findIndex((o) => !o.disabled)
    if (first < 0) return []
    let last = all.length - 1
    while (last > first && all[last].disabled) last--
    return all.slice(first, last + 1)
  })()

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!serviceId || !apptDate || !apptTime) {
      setError('Hizmet ve tarih/saat zorunlu.')
      return
    }
    if (!useNewCustomer && !customerId) {
      setError('Bir müşteri seçin veya yeni müşteri ekleyin.')
      return
    }
    if (useNewCustomer && !newCustomerName.trim()) {
      setError('Yeni müşteri için ad soyad zorunlu.')
      return
    }

    const service = services.find((s) => s.id === serviceId)
    const start = new Date(`${apptDate}T${apptTime}`)
    const duration = service?.duration_minutes ?? SLOT_MINUTES

    let finalEmployeeId = employeeId
    if (employeeId) {
      if (!isEmployeeAvailable(employeeId, start, duration)) {
        setError('Seçilen çalışan bu saatte müsait değil (mesai dışı veya dolu).')
        return
      }
    } else {
      if (eligibleEmployees.length === 0) {
        setError(formEmptyMessage)
        return
      }
      const candidates = eligibleEmployees.filter((p) => isEmployeeAvailable(p.id, start, duration))
      if (candidates.length === 0) {
        setError('Bu saatte bu hizmet için uygun çalışan yok. Başka bir saat deneyin.')
        return
      }
      const ranked = rankEligibleByFairness(
        candidates.map((p) => p.id),
        appointments,
      )
      finalEmployeeId = ranked[0]
    }

    setSubmitting(true)
    try {
      let finalCustomerId = customerId

      if (useNewCustomer) {
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({
            business_id: profile?.business_id,
            full_name: formatPersonName(newCustomerName),
            phone: newCustomerPhone.trim() || null,
          })
          .select('id')
          .single()
        if (custErr || !newCustomer) {
          const isDupPhone = custErr?.code === '23505' && custErr.message.includes('phone')
          setError(
            isDupPhone
              ? 'Bu telefon numarası zaten başka bir müşteriye kayıtlı. "Mevcut müşteri seç" ile arayıp seçebilirsiniz.'
              : 'Müşteri oluşturulamadı: ' + (custErr?.message ?? ''),
          )
          setSubmitting(false)
          return
        }
        finalCustomerId = newCustomer.id
      }

      // Paket (seans) bilgisi randevu tamamlanirken sorulur ("İşlem Türü:
      // Seanslı İşlem", bkz. submitCompletion); yeni randevu her zaman
      // package_id: null ile olusturulur.
      const { error: apptErr } = await supabase.from('appointments').insert({
        business_id: profile?.business_id,
        customer_id: finalCustomerId,
        service_id: serviceId,
        employee_id: finalEmployeeId,
        created_by_user_id: profile?.id,
        scheduled_at: start.toISOString(),
        duration_minutes: duration,
        source,
        source_note: sourceNote.trim() || null,
        package_id: null,
        price_override:
          effectiveApptPrice != null && effectiveApptPrice !== selectedServicePrice ? effectiveApptPrice : null,
      })

      if (apptErr) {
        const isOverlap = /exclusion|conflicting key|deadlock/i.test(apptErr.message)
        setError(
          isOverlap
            ? 'Seçilen çalışan bu saatte az önce başka bir randevuyla dolmuş. Lütfen farklı bir saat seçin.'
            : 'Randevu oluşturulamadı: ' + apptErr.message,
        )
        return
      }

      setSuccess(`Randevu oluşturuldu (${employeeName(finalEmployeeId)}).`)
      setCustomerId('')
      setNewCustomerName('')
      setNewCustomerPhone('')
      setUseNewCustomer(false)
      setServiceId('')
      setEmployeeId('')
      setApptTime('')
      setSourceNote('')
      await loadData(true)
      setShowForm(false)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
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

      {showForm && (
        <div className={styles.sheetBackdrop} onClick={closeForm}>
          <form className={styles.sheet} onSubmit={handleCreate} onClick={(e) => e.stopPropagation()}>
            <span className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetHead}>
              <h1 className={styles.sheetTitle}>Yeni randevu</h1>
              <button type="button" className={styles.sheetCancel} onClick={closeForm}>
                Vazgeç
              </button>
            </div>

            {error && (
              <div className={`${styles.banner} ${styles.bannerError}`} ref={formErrorRef} role="alert">
                <span>{error}</span>
                <button type="button" className={styles.bannerClose} onClick={() => setError(null)}>
                  ✕
                </button>
              </div>
            )}

            {/* ---- Musteri ---- */}
            <div className={styles.fGroup}>
              <span className={styles.fLabel}>Müşteri</span>
              <div className={styles.custField}>
                <span className={styles.custAvatar}>
                  {useNewCustomer
                    ? initialsOf(newCustomerName || '?')
                    : selectedCustomer
                      ? initialsOf(selectedCustomer.full_name)
                      : '?'}
                </span>
                <input
                  maxLength={FIELD_LIMITS.customersFullName}
                  className={styles.custInput}
                  placeholder="Ad ya da telefon yaz"
                  value={
                    useNewCustomer ? newCustomerName : selectedCustomer ? selectedCustomer.full_name : customerQuery
                  }
                  onFocus={() => setCustomerListOpen(true)}
                  onChange={(e) => {
                    const v = e.target.value
                    if (useNewCustomer) {
                      setNewCustomerName(v)
                      return
                    }
                    setCustomerId('')
                    setCustomerQuery(v)
                    setCustomerListOpen(true)
                  }}
                />
                {selectedCustomer && !useNewCustomer && (
                  <span className={styles.custPhone}>
                    {selectedCustomer.contact_phone || selectedCustomer.phone || ''}
                  </span>
                )}
                {(selectedCustomer || useNewCustomer || customerQuery) && (
                  <button
                    type="button"
                    className={styles.custClear}
                    aria-label="Müşteri seçimini temizle"
                    onClick={() => {
                      setCustomerId('')
                      setCustomerQuery('')
                      setUseNewCustomer(false)
                      setNewCustomerName('')
                      setNewCustomerPhone('')
                      setCustomerListOpen(true)
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              {customerListOpen && !selectedCustomer && !useNewCustomer && customerQuery.trim() && (
                <div className={styles.custList}>
                  {customerMatches.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className={styles.custOption}
                      onClick={() => {
                        setCustomerId(c.id)
                        setCustomerListOpen(false)
                      }}
                    >
                      <span className={styles.custOptionName}>{c.full_name}</span>
                      <span className={styles.custOptionPhone}>{c.contact_phone || c.phone || ''}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`${styles.custOption} ${styles.custOptionNew}`}
                    onClick={() => {
                      setUseNewCustomer(true)
                      setNewCustomerName(customerQuery.trim())
                      setCustomerListOpen(false)
                    }}
                  >
                    + “{customerQuery.trim()}” yeni müşteri olarak ekle
                  </button>
                </div>
              )}
              {useNewCustomer && (
                <input
                  maxLength={FIELD_LIMITS.customersContactPhone}
                  className={styles.fInput}
                  type="tel"
                  inputMode="numeric"
                  placeholder="Telefon (isteğe bağlı) · 05xx xxx xx xx"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </div>

            {/* ---- Hizmet ---- */}
            <div className={styles.fGroup}>
              <span className={styles.fLabel}>Hizmet</span>
              {formServices.length === 0 && (
                <p className={styles.formNote}>
                  {canSeeAll ? 'Henüz hizmet yok.' : 'Sana atanmış hizmet yok. Yöneticin Ekip sayfasından ekleyebilir.'}
                </p>
              )}
              <div className={styles.serviceChips}>
                {visibleFormServices.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={s.id === serviceId ? styles.serviceChipActive : styles.serviceChip}
                    onClick={() => {
                      setServiceId(s.id)
                      setEmployeeId('')
                      setApptTime('')
                    }}
                  >
                    {s.id === serviceId ? `${s.name} · ${s.duration_minutes} dk` : s.name}
                  </button>
                ))}
                {formServices.length > FORM_SERVICE_LIMIT && (
                  <button
                    type="button"
                    className={styles.serviceChipMore}
                    onClick={() => setShowAllServices((v) => !v)}
                  >
                    {showAllServices ? 'Daha az' : 'Tümü'}
                  </button>
                )}
              </div>
            </div>

            {/* ---- Calisan ---- */}
            <div className={styles.fGroup}>
              <span className={styles.fLabel}>Çalışan</span>
              <div className={styles.staffRow}>
                {/* Yalnizca kendine randevu acabilen calisanda secim yok: randevu ona yazilir. */}
                {canSeeAll && (
                  <button
                    type="button"
                    className={employeeId === '' ? styles.staffBtnActive : styles.staffBtn}
                    onClick={() => {
                      setEmployeeId('')
                      setApptTime('')
                    }}
                  >
                    <span className={`${styles.staffAvatar} ${styles.staffAvatarAny}`}>Hepsi</span>
                    Fark etmez
                  </button>
                )}
                {eligibleEmployees.map((p, i) => (
                  <button
                    type="button"
                    key={p.id}
                    className={employeeId === p.id || !canSeeAll ? styles.staffBtnActive : styles.staffBtn}
                    onClick={() => {
                      setEmployeeId(p.id)
                      setApptTime('')
                    }}
                  >
                    <span
                      className={`${styles.staffAvatar} ${employeeId === p.id || !canSeeAll ? styles.staffAvatarActive : styles[`staffTone${i % 3}`]}`}
                    >
                      {(p.full_name ?? '?').trim().charAt(0).toLocaleUpperCase('tr')}
                    </span>
                    {(p.full_name ?? '—').trim().split(/\s+/)[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* ---- Gun ---- */}
            <div className={styles.fGroup}>
              <div className={styles.fRowHead}>
                <span className={styles.fLabel}>Gün</span>
                <span className={styles.monthNav}>
                  <button
                    type="button"
                    className={styles.monthNavBtn}
                    disabled={formWeekOffset === 0}
                    onClick={() => setFormWeekOffset((v) => Math.max(0, v - 1))}
                    aria-label="Önceki günler"
                  >
                    ‹
                  </button>
                  {formMonthLabel}
                  <button
                    type="button"
                    className={styles.monthNavBtn}
                    onClick={() => setFormWeekOffset((v) => v + 1)}
                    aria-label="Sonraki günler"
                  >
                    ›
                  </button>
                </span>
              </div>
              <div className={styles.formDayGrid}>
                {formDayOptions.map((d) => (
                  <button
                    type="button"
                    key={d.key}
                    className={!d.open ? styles.formDayOff : d.key === apptDate ? styles.formDayActive : styles.formDay}
                    disabled={!d.open}
                    onClick={() => {
                      setError(null)
                      setApptDate(d.key)
                      setApptTime('')
                    }}
                  >
                    <span className={styles.formDayName}>{d.weekday}</span>
                    <span className={styles.formDayNum}>{d.day}</span>
                    <span className={!d.open || d.free === 0 ? styles.formDayStateMuted : styles.formDayState}>
                      {!d.open ? 'kapalı' : d.free === null ? '' : d.free === 0 ? 'dolu' : `${d.free} boş`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ---- Saat ---- */}
            <div className={styles.fGroup}>
              <div className={styles.fRowHead}>
                <span className={styles.fLabel}>Saat</span>
                <span className={styles.fHint}>
                  {new Date(`${apptDate}T00:00:00`).toLocaleDateString('tr-TR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                  {employeeId ? ` · ${employeeName(employeeId).split(' ')[0]}` : ''}
                </span>
              </div>
              {formTimeOptions.length === 0 ? (
                <p className={styles.formNote}>{formEmptyMessage}</p>
              ) : (
                <div className={styles.timeGrid}>
                  {formTimeOptions.map((t) => (
                    <button
                      type="button"
                      key={t.value}
                      disabled={t.disabled}
                      className={
                        t.value === apptTime ? styles.timeCellActive : t.disabled ? styles.timeCellOff : styles.timeCell
                      }
                      onClick={() => setApptTime(t.value)}
                    >
                      {t.value}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.timeCellOther}
                    onClick={() => otherDateRef.current?.showPicker?.()}
                  >
                    Başka
                  </button>
                </div>
              )}
              <input
                ref={otherDateRef}
                type="date"
                className={styles.hiddenDateInput}
                tabIndex={-1}
                aria-hidden="true"
                value={apptDate}
                onChange={(e) => {
                  const newDate = e.target.value
                  if (!newDate) return
                  if (!isDayOpenForCandidates(newDate, formCandidateIds)) {
                    setError(
                      employeeId ? 'Seçilen çalışan bu gün çalışmıyor.' : 'İşletme bu gün kapalı, uygun çalışan yok.',
                    )
                    return
                  }
                  setError(null)
                  setApptDate(newDate)
                  setApptTime('')
                }}
              />
            </div>

            {/* ---- Ucret ---- */}
            {selectedService && (
              <label className={styles.infoRow}>
                <span className={styles.infoRowLabel}>Ücret</span>
                <span className={styles.priceField}>
                  ₺
                  <input
                    className={styles.priceInput}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={apptPrice}
                    onChange={(e) => setApptPrice(e.target.value)}
                    aria-label="Ücret"
                  />
                </span>
              </label>
            )}

            {/* ---- Kaynak + not ---- */}
            <button type="button" className={styles.infoRow} onClick={() => setSourcePickerOpen(true)}>
              <span className={styles.infoRowLabel}>Kaynak</span>
              <span className={styles.infoRowValue}>
                {SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? 'Seç'} ›
              </span>
            </button>
            <PickerSheet
              open={sourcePickerOpen}
              title="Randevu nereden geldi?"
              options={SOURCE_OPTIONS}
              value={source}
              onSelect={setSource}
              onClose={() => setSourcePickerOpen(false)}
            />
            {noteOpen || sourceNote ? (
              <input
                maxLength={FIELD_LIMITS.appointmentsSourceNote}
                className={styles.fInput}
                placeholder="Not (ör. kampanya adı)"
                value={sourceNote}
                autoFocus={noteOpen && !sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
              />
            ) : (
              <button type="button" className={styles.infoRow} onClick={() => setNoteOpen(true)}>
                <span className={styles.infoRowLabel}>Not</span>
                <span className={styles.infoRowValue}>Ekle ›</span>
              </button>
            )}

            <button type="submit" className={styles.sheetSubmit} disabled={submitting}>
              {submitting
                ? 'Kaydediliyor…'
                : `Randevuyu kaydet${effectiveApptPrice ? ` · ${currency.format(effectiveApptPrice)}` : ''}`}
            </button>
          </form>
        </div>
      )}

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
          ) : visible.length === 0 ? (
            <div className={styles.emptyCard}>
              <span className={styles.emptyTitle}>
                {diffDays === 0 ? 'Bugün randevu yok' : `${dayLabel} için randevu yok`}
              </span>
              <span className={styles.emptySub}>Eklemek için alttaki + düğmesinden “Yeni randevu”yu seç.</span>
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
                Başka bir dönem seçebilir ya da + düğmesinden randevu ekleyebilirsin.
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
