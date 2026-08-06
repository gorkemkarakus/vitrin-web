import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { TIME_OPTIONS } from '../lib/timeOptions'
import Avatar from '../components/Avatar'
import StatusDropdown, { type StatusDropdownOption } from '../components/StatusDropdown'
import Select from '../components/Select'
import {
  CalendarIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  PhoneIcon,
  PencilIcon,
} from '../components/icons'
import type { LayoutOutletContext } from '../layouts/DashboardLayout'
import styles from './AppointmentsPage.module.css'

interface Customer {
  id: string
  full_name: string
  phone: string | null
  contact_phone: string | null
  credit_balance: number
}

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number | null
  category_id: string | null
}

interface Profile {
  id: string
  full_name: string | null
}

interface EmployeeCategory {
  profile_id: string
  category_id: string
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
  starts_at: string
  ends_at: string
}

interface Appointment {
  id: string
  customer_id: string | null
  service_id: string | null
  employee_id: string | null
  created_by_user_id: string | null
  scheduled_at: string
  duration_minutes: number | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal'
  source: string
  source_note: string | null
  package_id: string | null
  price_override: number | null
}

interface ServicePackage {
  id: string
  customer_id: string
  service_id: string | null
  total_sessions: number
}

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

const PAYMENT_METHOD_OPTIONS = [
  { value: 'nakit', label: 'Nakit' },
  { value: 'kart', label: 'Kart' },
  { value: 'diger', label: 'Diğer' },
]

const SOURCE_OPTIONS = [
  { value: 'kullanici_uzerinden', label: 'Çalışan Üzerinden' },
  { value: 'dogrudan_musteri', label: 'Doğrudan Müşteri' },
  { value: 'chatbot', label: 'Chatbot' },
  { value: 'online_randevu', label: 'Online Randevu' },
  { value: 'diger', label: 'Diğer' },
]

const STATUS_OPTIONS: { value: Appointment['status']; label: string }[] = [
  { value: 'bekliyor', label: 'Bekliyor' },
  { value: 'onaylandi', label: 'Onaylandı' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
  { value: 'iptal', label: 'İptal' },
]

const STATUS_CLASS: Record<Appointment['status'], string> = {
  bekliyor: styles.statusBekliyor,
  onaylandi: styles.statusOnaylandi,
  tamamlandi: styles.statusTamamlandi,
  iptal: styles.statusIptal,
}

const STATUS_DROPDOWN_OPTIONS: StatusDropdownOption[] = [
  { value: 'bekliyor', label: 'Bekliyor', color: 'var(--warn-text)', bg: 'var(--warn-bg)' },
  { value: 'onaylandi', label: 'Onaylandı', color: 'var(--info-text)', bg: 'var(--info-bg)' },
  { value: 'tamamlandi', label: 'Tamamlandı', color: 'var(--ok-text)', bg: 'var(--ok-bg)' },
  { value: 'iptal', label: 'İptal', color: 'var(--danger-text)', bg: 'var(--danger-bg)' },
]

const SLOT_MINUTES = 30
const WEEKDAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

type ViewMode = 'gunluk' | 'liste' | 'haftalik' | 'ozel'

function todayLocalDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toLocalDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timeStringToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const TIMELINE_COLORS = [
  styles.timelineColor0,
  styles.timelineColor1,
  styles.timelineColor2,
  styles.timelineColor3,
  styles.timelineColor4,
  styles.timelineColor5,
]

// Chatbot (book-appointment) ve herkese açık randevu sayfasındaki
// (public-book-appointment) rankEligibleByFairness ile AYNI algoritma —
// "fark etmez" seçildiğinde her zaman ilk müsait çalışanı seçmek prim/
// komisyon adaletsizliği yaratıyordu. Bu kaynaklardan (chatbot, online
// randevu, personel "fark etmez") en son randevusu en eski olan (veya hiç
// olmayan) çalışan öne çıkar.
const ROTATION_SOURCES = ['chatbot', 'online_randevu', 'kullanici_uzerinden']

function rankEligibleByFairness(eligibleIds: string[], appointments: Appointment[]): string[] {
  const lastBookingByEmployee = new Map<string, number>()
  for (const a of appointments) {
    if (!a.source || !ROTATION_SOURCES.includes(a.source) || !a.employee_id) continue
    const t = new Date(a.scheduled_at).getTime()
    const prev = lastBookingByEmployee.get(a.employee_id) ?? -Infinity
    if (t > prev) lastBookingByEmployee.set(a.employee_id, t)
  }
  return eligibleIds
    .slice()
    .sort((a, b) => (lastBookingByEmployee.get(a) ?? -Infinity) - (lastBookingByEmployee.get(b) ?? -Infinity))
}

export default function AppointmentsPage() {
  const { profile } = useAuth()
  const { searchQuery, setSearchPlaceholder } = useOutletContext<LayoutOutletContext>()
  const [searchParams, setSearchParams] = useSearchParams()

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [servicePackages, setServicePackages] = useState<ServicePackage[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [employeeCategories, setEmployeeCategories] = useState<EmployeeCategory[]>([])
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
    if (changed) setSearchParams(searchParams, { replace: true })
    // "yeni"/"tarih" sorgu parametreleri sayfa ZATEN acikken de gelebilir
    // (ör. Takvim'deyken alt navigasyondaki + > "Yeni Randevu"ya basmak) —
    // bos bagimlilik dizisi sadece ilk mount'ta calisirdi, o durumda hicbir
    // sey olmuyordu. searchParams degistikce yeniden calismali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const [employeeMenuOpen, setEmployeeMenuOpen] = useState(false)
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false)
  const employeeMenuRef = useRef<HTMLDivElement>(null)
  const displayMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!employeeMenuOpen && !displayMenuOpen) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (employeeMenuOpen && employeeMenuRef.current && !employeeMenuRef.current.contains(target)) {
        setEmployeeMenuOpen(false)
      }
      if (displayMenuOpen && displayMenuRef.current && !displayMenuRef.current.contains(target)) {
        setDisplayMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [employeeMenuOpen, displayMenuOpen])

  const [useNewCustomer, setUseNewCustomer] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [apptDate, setApptDate] = useState(todayLocalDateString())
  const [apptTime, setApptTime] = useState('')
  const [source, setSource] = useState(SOURCE_OPTIONS[0].value)
  const [sourceNote, setSourceNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Yeni randevu formu — paket (seans) secenekleri.
  const [packageMode, setPackageMode] = useState<'yok' | 'yeni' | 'mevcut'>('yok')
  const [packageTotalSessions, setPackageTotalSessions] = useState('8')
  const [existingPackageId, setExistingPackageId] = useState('')

  // "Tamamlandi" isaretlenince acilan odeme + devam randevusu mini-sihirbazi.
  const [completingAppt, setCompletingAppt] = useState<Appointment | null>(null)
  const [completeRecordPayment, setCompleteRecordPayment] = useState(true)
  // Standart hizmet fiyatindan farkli olabilecek, BU randevuya ozel gercek
  // ucret (ör. ekstra bakim/boya ile pahalanmis) — "Alınan Tutar"dan ayri,
  // cunku tutar kismi odenmis olabilir. Degistirilince Alınan Tutar da
  // otomatik ona esitlenir (cogu zaman tam tahsil edilir varsayimiyla), ama
  // sonrasinda bagimsiz duzenlenebilir kalir (kismi odeme icin).
  const [completePriceOverride, setCompletePriceOverride] = useState('')
  // Musterinin mevcut bakiyesinden bu randevu icin dusulmek istenen tutar —
  // bakiye tum ucreti karsiliyorsa nakit/kart alanlarina hic gerek kalmaz.
  const [completeBalanceAmount, setCompleteBalanceAmount] = useState('')
  const [completePaymentAmount, setCompletePaymentAmount] = useState('')
  const [completePaymentMethod, setCompletePaymentMethod] = useState('nakit')
  const [completeFollowup, setCompleteFollowup] = useState(false)
  const [completeFollowupDate, setCompleteFollowupDate] = useState('')
  const [completeFollowupTime, setCompleteFollowupTime] = useState('')
  const [completeBusy, setCompleteBusy] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

  // Randevu duzenleme mini-formu — hizmet, calisan, tarih/saat, not ve
  // musteri telefonunu degistirmeye izin verir. Paket/musteri degisikligi
  // KAPSAM DISI tutuldu (ayri, daha riskli akislar; istenmedi).
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null)
  const [editServiceId, setEditServiceId] = useState('')
  const [editEmployeeId, setEditEmployeeId] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Satira/karta tiklaninca acilan detay gorunumu — kompakt satirda yer
  // olmadigi icin not/kaynak gibi alanlar hic gorunmuyordu (bildirildi).
  const [viewingAppt, setViewingAppt] = useState<Appointment | null>(null)

  // "silent=true" bir mutasyondan sonra cagrilir — veriyi arka planda
  // tazeler ama "loading" bayragini geri true yapmaz, boylece sayfa her
  // islemden sonra bos "Yükleniyor…" yazisina donup yeniden cizilmiyor.
  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    const [
      { data: appts },
      { data: custs },
      { data: pkgs },
      { data: svcs },
      { data: profs },
      { data: empCats },
      { data: scheds },
      { data: blocks },
    ] = await Promise.all([
      supabase
        .from('appointments')
        .select(
          'id, customer_id, service_id, employee_id, created_by_user_id, scheduled_at, duration_minutes, status, source, source_note, package_id, price_override',
        )
        .order('scheduled_at', { ascending: true }),
      supabase.from('customers').select('id, full_name, phone, contact_phone, credit_balance').order('full_name'),
      supabase.from('service_packages').select('id, customer_id, service_id, total_sessions'),
      supabase
        .from('services')
        .select('id, name, duration_minutes, price, category_id')
        .eq('is_active', true)
        .order('name'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('employee_categories').select('profile_id, category_id'),
      supabase.from('employee_schedules').select('profile_id, day_of_week, starts_at, ends_at'),
      supabase.from('employee_time_blocks').select('profile_id, day_of_week, block_date, starts_at, ends_at'),
    ])
    setAppointments(appts ?? [])
    setCustomers(custs ?? [])
    setServicePackages(pkgs ?? [])
    setServices(svcs ?? [])
    setProfiles(profs ?? [])
    setEmployeeCategories(empCats ?? [])
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
  const employeeName = (id: string | null) => profiles.find((p) => p.id === id)?.full_name ?? '—'

  function canEdit(appt: Appointment) {
    return profile?.role === 'admin' || appt.created_by_user_id === profile?.id
  }

  function openDetail(a: Appointment) {
    setViewingAppt(a)
  }

  function openEdit(a: Appointment) {
    setEditingAppt(a)
    setEditServiceId(a.service_id ?? '')
    setEditEmployeeId(a.employee_id ?? '')
    const d = new Date(a.scheduled_at)
    setEditDate(toLocalDateString(d))
    setEditTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    setEditNote(a.source_note ?? '')
    setEditPhone(customerPhone(a.customer_id) ?? '')
    setEditError(null)
  }

  async function submitEdit() {
    if (!editingAppt) return
    setEditError(null)
    if (!editServiceId || !editDate || !editTime) {
      setEditError('Hizmet ve tarih/saat zorunlu.')
      return
    }

    const svc = services.find((s) => s.id === editServiceId)
    const start = new Date(`${editDate}T${editTime}`)
    const duration = svc?.duration_minutes ?? SLOT_MINUTES

    if (editEmployeeId && !isEmployeeAvailable(editEmployeeId, start, duration, editingAppt.id)) {
      setEditError('Seçilen çalışan bu saatte müsait değil (mesai dışı, izinli veya dolu).')
      return
    }

    setEditBusy(true)
    try {
      const { error: apptErr } = await supabase
        .from('appointments')
        .update({
          service_id: editServiceId,
          employee_id: editEmployeeId || null,
          scheduled_at: start.toISOString(),
          duration_minutes: duration,
          source_note: editNote.trim() || null,
        })
        .eq('id', editingAppt.id)
      if (apptErr) {
        const isOverlap = /exclusion|conflicting key|deadlock/i.test(apptErr.message)
        setEditError(
          isOverlap
            ? 'Seçilen saat az önce başka bir randevuyla dolmuş. Farklı bir saat seçin.'
            : 'Randevu güncellenemedi: ' + apptErr.message,
        )
        return
      }

      const trimmedPhone = editPhone.trim()
      if (editingAppt.customer_id && trimmedPhone !== (customerPhone(editingAppt.customer_id) ?? '')) {
        const { error: custErr } = await supabase
          .from('customers')
          .update({ contact_phone: trimmedPhone || null })
          .eq('id', editingAppt.customer_id)
        if (custErr) {
          // Randevu zaten guncellendi — telefon hatasi ayri banner'da gosterilip
          // modal kapatilir, "hicbir sey olmamis gibi" hissettirmez.
          setError('Randevu güncellendi ama telefon numarası kaydedilemedi: ' + custErr.message)
          setEditingAppt(null)
          await loadData(true)
          return
        }
      }

      setEditingAppt(null)
      await loadData(true)
    } finally {
      setEditBusy(false)
    }
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
    return { current: idx + 1, total: pkg.total_sessions }
  }

  function closeForm() {
    setShowForm(false)
    setPackageMode('yok')
    setPackageTotalSessions('8')
    setExistingPackageId('')
    setError(null)
  }

  const selectedService = services.find((s) => s.id === serviceId) ?? null

  const eligibleEmployees = useMemo(() => {
    if (!selectedService?.category_id) return profiles
    const ids = new Set(
      employeeCategories.filter((ec) => ec.category_id === selectedService.category_id).map((ec) => ec.profile_id),
    )
    return profiles.filter((p) => ids.has(p.id))
  }, [selectedService, employeeCategories, profiles])

  function isEmployeeAvailable(employeeId: string, start: Date, durationMinutes: number, excludeApptId?: string) {
    const dayOfWeek = start.getDay()
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = startMinutes + durationMinutes

    const worksThen = schedules.some(
      (s) =>
        s.profile_id === employeeId &&
        s.day_of_week === dayOfWeek &&
        timeStringToMinutes(s.starts_at.slice(0, 5)) <= startMinutes &&
        timeStringToMinutes(s.ends_at.slice(0, 5)) >= endMinutes,
    )
    if (!worksThen) return false

    const dateStr = toLocalDateString(start)
    const isBlocked = timeBlocks.some(
      (b) =>
        b.profile_id === employeeId &&
        (b.day_of_week === dayOfWeek || b.block_date === dateStr) &&
        timeStringToMinutes(b.starts_at.slice(0, 5)) < endMinutes &&
        timeStringToMinutes(b.ends_at.slice(0, 5)) > startMinutes,
    )
    if (isBlocked) return false

    const end = new Date(start.getTime() + durationMinutes * 60000)
    const hasConflict = appointments.some((a) => {
      if (a.employee_id !== employeeId || a.status === 'iptal' || a.id === excludeApptId) return false
      const aStart = new Date(a.scheduled_at)
      const aEnd = new Date(aStart.getTime() + (a.duration_minutes ?? SLOT_MINUTES) * 60000)
      return aStart < end && aEnd > start
    })
    return !hasConflict
  }

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
    if (packageMode === 'yeni' && (!Number(packageTotalSessions) || Number(packageTotalSessions) < 1)) {
      setError('Paket için geçerli bir toplam seans sayısı girin.')
      return
    }
    if (packageMode === 'mevcut' && !existingPackageId) {
      setError('Eklemek istediğiniz paketi seçin.')
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
      const candidates = eligibleEmployees.filter((p) => isEmployeeAvailable(p.id, start, duration))
      if (candidates.length === 0) {
        setError('Bu saatte bu hizmet için uygun çalışan yok. Başka bir saat deneyin.')
        return
      }
      const ranked = rankEligibleByFairness(candidates.map((p) => p.id), appointments)
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
            full_name: newCustomerName.trim(),
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

      let finalPackageId: string | null = null
      if (packageMode === 'yeni') {
        const { data: newPackage, error: pkgErr } = await supabase
          .from('service_packages')
          .insert({
            business_id: profile?.business_id,
            customer_id: finalCustomerId,
            service_id: serviceId,
            total_sessions: Math.max(1, Math.round(Number(packageTotalSessions))),
            created_by_user_id: profile?.id,
          })
          .select('id')
          .single()
        if (pkgErr || !newPackage) {
          setError('Paket oluşturulamadı: ' + (pkgErr?.message ?? ''))
          setSubmitting(false)
          return
        }
        finalPackageId = newPackage.id
      } else if (packageMode === 'mevcut') {
        finalPackageId = existingPackageId
      }

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
        package_id: finalPackageId,
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
      setPackageMode('yok')
      setPackageTotalSessions('8')
      setExistingPackageId('')
      await loadData(true)
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function updateStatus(appt: Appointment, status: Appointment['status']) {
    await supabase.from('appointments').update({ status }).eq('id', appt.id)
    await loadData(true)
  }

  function handleStatusChange(appt: Appointment, status: Appointment['status']) {
    if (status === 'tamamlandi') {
      const svc = services.find((s) => s.id === appt.service_id)
      const price = appt.price_override ?? svc?.price ?? 0
      const customer = customers.find((c) => c.id === appt.customer_id)
      const suggestedFromBalance = customer ? Math.min(customer.credit_balance, price) : 0
      setCompletingAppt(appt)
      setCompleteRecordPayment(true)
      setCompletePriceOverride(String(price))
      setCompleteBalanceAmount(suggestedFromBalance > 0 ? String(suggestedFromBalance) : '')
      setCompletePaymentAmount(String(Math.max(0, price - suggestedFromBalance)))
      setCompletePaymentMethod('nakit')
      setCompleteFollowup(false)
      setCompleteFollowupDate('')
      setCompleteFollowupTime('')
      setCompleteError(null)
    } else {
      updateStatus(appt, status)
    }
  }

  async function submitCompletion() {
    if (!completingAppt) return
    setCompleteError(null)

    const svc = services.find((s) => s.id === completingAppt.service_id)
    const followupDuration = svc?.duration_minutes ?? SLOT_MINUTES
    let followupStart: Date | null = null
    if (completeFollowup && completeFollowupDate && completeFollowupTime) {
      followupStart = new Date(`${completeFollowupDate}T${completeFollowupTime}`)
      // Ana "Yeni Randevu" formuyla AYNI kontrol (isEmployeeAvailable): calisan
      // atanmissa mesai saatleri/izin/cakisma burada da uygulanmali — daha
      // once bu kontrol atlanip her saat kabul ediliyordu (test edilip
      // bildirildi). Kontrol basarisiz olursa hicbir sey kaydedilmeden
      // (randevu tamamlanmadan) modal acik kalip hata gosterilir.
      if (completingAppt.employee_id && !isEmployeeAvailable(completingAppt.employee_id, followupStart, followupDuration)) {
        setCompleteError('Seçilen çalışan bu saatte müsait değil (mesai dışı, izinli veya dolu). Farklı bir saat seçin.')
        return
      }
    }

    setCompleteBusy(true)
    try {
      const priceOverrideValue = Number(completePriceOverride)
      const { error: statusErr } = await supabase
        .from('appointments')
        .update({
          status: 'tamamlandi',
          price_override: Number.isFinite(priceOverrideValue) && priceOverrideValue >= 0 ? priceOverrideValue : null,
        })
        .eq('id', completingAppt.id)
      if (statusErr) {
        setCompleteError('Randevu tamamlanamadı: ' + statusErr.message)
        return
      }

      // Tamamlanan randevu bir pakete ait degilse ("tek seferlik" acilmisti
      // ama is bitmedi/devami var), devam randevusu istendiginde geriye
      // donuk 2 seanslik bir paket olusturup HER IKI randevuyu da buna
      // baglıyoruz — boylece "2. seans" ilerlemesi mevcut paket
      // altyapisiyla (packageProgress) otomatik gorunur, ayri bir kavram
      // icat etmeye gerek kalmiyor. BU ISLEM odeme kaydindan ONCE yapiliyor
      // — aksi halde odeme eski (bos) package_id ile kaydolup pakete hic
      // baglanmiyor, paket "hic odenmemis" gibi gorunuyordu (bildirildi).
      let effectivePackageId = completingAppt.package_id
      if (completeFollowup && followupStart && !effectivePackageId) {
        const { data: newPackage, error: pkgErr } = await supabase
          .from('service_packages')
          .insert({
            business_id: profile?.business_id,
            customer_id: completingAppt.customer_id,
            service_id: completingAppt.service_id,
            total_sessions: 2,
            created_by_user_id: profile?.id,
          })
          .select('id')
          .single()
        if (pkgErr || !newPackage) {
          setError('Randevu tamamlandı ama devam randevusu için paket oluşturulamadı: ' + (pkgErr?.message ?? ''))
          setCompletingAppt(null)
          await loadData(true)
          return
        }
        effectivePackageId = newPackage.id
        await supabase.from('appointments').update({ package_id: effectivePackageId }).eq('id', completingAppt.id)
      }

      // Ucret: bakiyeden dusulen + nakit/kart ile alinan kismin toplami.
      // Paketli randevularda fazla odeme (giris > kalan) eskisi gibi
      // paketin KENDI kalan bakiyesini dusurur (bakiyeye AKTARILMAZ —
      // aksi halde ayni tutar iki kere sayilirdi); paketsiz randevularda
      // ise ucreti asan yeni fazla odeme dogrudan musteri bakiyesine gider.
      const price = Number(completePriceOverride) || 0
      const customer = customers.find((c) => c.id === completingAppt.customer_id)
      const balanceAvailable = customer?.credit_balance ?? 0
      const balanceRequested = Math.min(Number(completeBalanceAmount) || 0, balanceAvailable, price)
      const remainingDue = Math.max(0, price - balanceRequested)
      const entered = completeRecordPayment ? Number(completePaymentAmount) || 0 : 0
      const cashForThisAppt = effectivePackageId ? entered : Math.min(entered, remainingDue)
      const overflowToBalance = effectivePackageId ? 0 : Math.max(0, entered - remainingDue)
      const creditBalanceDelta = overflowToBalance - balanceRequested

      if (balanceRequested > 0) {
        const { error: balPayErr } = await supabase.from('payments').insert({
          business_id: profile?.business_id,
          customer_id: completingAppt.customer_id,
          appointment_id: completingAppt.id,
          package_id: effectivePackageId,
          amount: balanceRequested,
          method: 'bakiye',
          created_by_user_id: profile?.id,
        })
        if (balPayErr) {
          setError('Randevu tamamlandı ama bakiyeden düşülemedi: ' + balPayErr.message)
          setCompletingAppt(null)
          await loadData(true)
          return
        }
      }

      if (cashForThisAppt > 0) {
        const { error: payErr } = await supabase.from('payments').insert({
          business_id: profile?.business_id,
          customer_id: completingAppt.customer_id,
          appointment_id: completingAppt.id,
          package_id: effectivePackageId,
          amount: cashForThisAppt,
          method: completePaymentMethod,
          created_by_user_id: profile?.id,
        })
        if (payErr) {
          // Randevu zaten tamamlandi olarak isaretlendi (geri alinamaz) —
          // modal kapatilip hata ana sayfadaki banner'da gosterilir, boylece
          // "hicbir sey olmamis gibi" hissettirmez.
          setError('Randevu tamamlandı ama ödeme kaydedilemedi: ' + payErr.message)
          setCompletingAppt(null)
          await loadData(true)
          return
        }
      }

      if (creditBalanceDelta !== 0 && completingAppt.customer_id) {
        const { error: creditErr } = await supabase
          .from('customers')
          .update({ credit_balance: Math.max(0, balanceAvailable + creditBalanceDelta) })
          .eq('id', completingAppt.customer_id)
        if (creditErr) {
          setError('Randevu tamamlandı ama müşteri bakiyesi güncellenemedi: ' + creditErr.message)
          setCompletingAppt(null)
          await loadData(true)
          return
        }
      }

      if (completeFollowup && followupStart) {
        const { error: followupErr } = await supabase.from('appointments').insert({
          business_id: profile?.business_id,
          customer_id: completingAppt.customer_id,
          service_id: completingAppt.service_id,
          employee_id: completingAppt.employee_id,
          created_by_user_id: profile?.id,
          scheduled_at: followupStart.toISOString(),
          duration_minutes: followupDuration,
          source: completingAppt.source,
          package_id: effectivePackageId,
        })
        if (followupErr) {
          const isOverlap = /exclusion|conflicting key|deadlock/i.test(followupErr.message)
          setError(
            'Randevu tamamlandı ama devam randevusu oluşturulamadı: ' +
              (isOverlap
                ? 'seçilen saat az önce başka bir randevuyla dolmuş. Farklı bir saati "Mevcut Pakete Ekle" ile ekleyin.'
                : followupErr.message),
          )
          setCompletingAppt(null)
          await loadData(true)
          return
        }
      }

      setCompletingAppt(null)
      await loadData(true)
    } finally {
      setCompleteBusy(false)
    }
  }

  function shiftDate(days: number) {
    const d = new Date(viewDate + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setViewDate(toLocalDateString(d))
  }

  function shiftWeek(weeks: number) {
    const d = new Date(viewDate + 'T00:00:00')
    d.setDate(d.getDate() + weeks * 7)
    setViewDate(toLocalDateString(d))
  }

  const diffDays = Math.round(
    (new Date(viewDate + 'T00:00:00').getTime() - new Date(todayLocalDateString() + 'T00:00:00').getTime()) /
      86400000,
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
  const q = searchQuery.trim().toLowerCase()
  const searchFiltered = q
    ? appointments.filter(
        (a) =>
          customerName(a.customer_id).toLowerCase().includes(q) ||
          serviceName(a.service_id).toLowerCase().includes(q) ||
          employeeName(a.employee_id).toLowerCase().includes(q),
      )
    : appointments

  // Çalışan filtresi (Takvim'deki "Tüm Çalışanlar" seçici).
  const employeeFiltered = employeeFilter
    ? searchFiltered.filter((a) => a.employee_id === employeeFilter)
    : searchFiltered

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
      label: new Date(dateKey + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }),
      items: byDate.get(dateKey) ?? [],
    }))
    visible = groupedByDate.flatMap((g) => g.items)
  }

  // Gunluk Gorunum: randevular sirali, esit bosluklu bir kart listesi olarak
  // akar (gercek saatle orantili yukseklik/konum YOK) — "su an" cizgisi,
  // kronolojik olarak dogru sıraya senkron bir satir gibi eklenir.
  const timelineEntries: ({ kind: 'appt'; appt: Appointment; colorIdx: number } | { kind: 'now' })[] = []
  if (viewMode === 'gunluk' && dailyDisplay === 'zaman') {
    const showNow = viewDate === todayLocalDateString()
    let nowInserted = !showNow
    visible.forEach((a, i) => {
      if (!nowInserted && new Date(a.scheduled_at).getTime() >= now.getTime()) {
        timelineEntries.push({ kind: 'now' })
        nowInserted = true
      }
      timelineEntries.push({ kind: 'appt', appt: a, colorIdx: i })
    })
    if (!nowInserted) timelineEntries.push({ kind: 'now' })
  }

  // Alt istatistik satiri — su an ekranda gorunen (secili gun/hafta/ay,
  // calisan filtresi uygulanmis) randevularin durum dagilimi.
  const statusStats = {
    total: visible.length,
    onaylandi: visible.filter((a) => a.status === 'onaylandi').length,
    bekliyor: visible.filter((a) => a.status === 'bekliyor').length,
    tamamlandi: visible.filter((a) => a.status === 'tamamlandi').length,
    iptal: visible.filter((a) => a.status === 'iptal').length,
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
        <div className={styles.apptTime}>
          {d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </div>
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

  // Gunluk Gorunum karti — "birebir ayni" istegi geregi durum, sabit kucuk
  // bir rozet olarak gosteriliyor (Liste Gorunumu'ndeki tikla-degistir
  // StatusDropdown'dan farkli, daha sade); durum degistirmek icin Liste
  // Gorunumu'ne gecilir.
  function renderTimelineCard(a: Appointment, colorIdx: number) {
    const d = new Date(a.scheduled_at)
    const durMin = a.duration_minutes ?? SLOT_MINUTES
    const isPast = new Date(d.getTime() + durMin * 60000) < now
    const isOverdue = isPast && a.status === 'bekliyor'

    return (
      <div
        className={`${styles.timelineCard} ${TIMELINE_COLORS[colorIdx % TIMELINE_COLORS.length]} ${isOverdue ? styles.timelineCardOverdue : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => openDetail(a)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') openDetail(a)
        }}
      >
        <div className={styles.timelineCardHead}>
          <div className={styles.timelineCardCustomerCol}>
            <span className={styles.timelineCardCustomer}>{customerName(a.customer_id)}</span>
            {customerPhone(a.customer_id) && (
              <span className={styles.timelineCardPhone}>
                <PhoneIcon width={10} height={10} />
                {customerPhone(a.customer_id)}
              </span>
            )}
          </div>
          <Avatar name={employeeName(a.employee_id)} size={30} />
        </div>
        <div className={styles.timelineCardServiceRow}>
          <span className={styles.timelineCardService}>{serviceName(a.service_id)}</span>
          {packageProgress(a) && (
            <span className={styles.packageTag}>
              {packageProgress(a)!.current}/{packageProgress(a)!.total} seans
            </span>
          )}
        </div>
        <div className={styles.timelineCardFoot}>
          <span className={styles.timelineCardEmployee}>👤 {employeeName(a.employee_id)}</span>
          <div className={styles.apptStatusRow} onClick={(e) => e.stopPropagation()}>
            {canEdit(a) && (
              <button
                type="button"
                className={styles.editApptBtn}
                onClick={() => openEdit(a)}
                aria-label="Randevuyu düzenle"
              >
                <PencilIcon width={12} height={12} />
              </button>
            )}
            {canEdit(a) ? (
              <StatusDropdown
                compact
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
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.statBar}>
        <div className={styles.statBarItem}>
          <CalendarIcon width={15} height={15} className={styles.statBarIconSignal} />
          <span className={styles.statBarValue}>{statusStats.total}</span>
          <span className={styles.statBarLabel}>Toplam Randevu</span>
        </div>
        <div className={styles.statBarItem}>
          <CheckCircleIcon width={15} height={15} className={styles.statBarIconOk} />
          <span className={`${styles.statBarValue} ${styles.statBarValueOk}`}>{statusStats.onaylandi}</span>
          <span className={styles.statBarLabel}>Onaylandı</span>
        </div>
        <div className={styles.statBarItem}>
          <ClockIcon width={15} height={15} className={styles.statBarIconWarn} />
          <span className={`${styles.statBarValue} ${styles.statBarValueWarn}`}>{statusStats.bekliyor}</span>
          <span className={styles.statBarLabel}>Bekliyor</span>
        </div>
        <div className={styles.statBarItem}>
          <CheckCircleIcon width={15} height={15} className={styles.statBarIconInfo} />
          <span className={`${styles.statBarValue} ${styles.statBarValueInfo}`}>{statusStats.tamamlandi}</span>
          <span className={styles.statBarLabel}>Tamamlandı</span>
        </div>
        <div className={styles.statBarItem}>
          <XCircleIcon width={15} height={15} className={styles.statBarIconDanger} />
          <span className={`${styles.statBarValue} ${styles.statBarValueDanger}`}>{statusStats.iptal}</span>
          <span className={styles.statBarLabel}>İptal Edildi</span>
        </div>
      </div>

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

      <div className={styles.viewToggle}>
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
            className={viewMode === v.value ? styles.viewToggleBtnActive : styles.viewToggleBtn}
            onClick={() => setViewMode(v.value)}
          >
            <CalendarIcon width={14} height={14} />
            {v.label}
          </button>
        ))}
      </div>

      {viewMode === 'ozel' && (
        <div className={`card ${styles.customRangeRow}`}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="calRangeStart">Başlangıç</label>
            <input
              id="calRangeStart"
              type="date"
              value={customRangeStart}
              max={customRangeEnd}
              onChange={(e) => setCustomRangeStart(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
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

      <div className={styles.topRow}>
        <button
          type="button"
          className="btn-primary"
          style={{ width: 'auto' }}
          onClick={() => {
            setError(null)
            setShowForm(true)
          }}
        >
          + Yeni Randevu
        </button>
      </div>

      {showForm && (
        <div className={styles.modalBackdrop} onClick={closeForm}>
          <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Yeni randevu</h2>
              <button type="button" className={styles.bannerClose} onClick={closeForm}>
                ✕
              </button>
            </div>

            {error && (
              <div className={`${styles.banner} ${styles.bannerError}`} style={{ marginBottom: 16 }}>
                <span>{error}</span>
                <button type="button" className={styles.bannerClose} onClick={() => setError(null)}>
                  ✕
                </button>
              </div>
            )}

            <form className={styles.form} onSubmit={handleCreate}>
              {!useNewCustomer ? (
                <div className="field">
                  <label htmlFor="customer">Müşteri</label>
                  <Select
                    id="customer"
                    value={customerId}
                    onChange={setCustomerId}
                    options={customers.map((c) => ({
                      value: c.id,
                      label: c.full_name,
                      sub: c.contact_phone || c.phone || undefined,
                    }))}
                  />
                  <button type="button" className={styles.newCustomerToggle} onClick={() => setUseNewCustomer(true)}>
                    + Yeni müşteri ekle
                  </button>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="newCustomerName">Yeni müşteri</label>
                  <input
                    id="newCustomerName"
                    placeholder="Ad Soyad"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="05xx xxx xx xx"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value.replace(/\D/g, ''))}
                  />
                  <button type="button" className={styles.newCustomerToggle} onClick={() => setUseNewCustomer(false)}>
                    Mevcut müşteri seç
                  </button>
                </div>
              )}

              <div className="field">
                <label htmlFor="service">Hizmet</label>
                <Select
                  id="service"
                  value={serviceId}
                  onChange={(v) => {
                    setServiceId(v)
                    setEmployeeId('')
                  }}
                  options={services.map((s) => ({ value: s.id, label: s.name, sub: `${s.duration_minutes} dk` }))}
                />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Paket (seans)</label>
                <div className={styles.packageModeRow}>
                  <button
                    type="button"
                    className={packageMode === 'yok' ? styles.packageModeBtnActive : styles.packageModeBtn}
                    onClick={() => setPackageMode('yok')}
                  >
                    Hayır
                  </button>
                  <button
                    type="button"
                    className={packageMode === 'yeni' ? styles.packageModeBtnActive : styles.packageModeBtn}
                    onClick={() => setPackageMode('yeni')}
                  >
                    Yeni Paket
                  </button>
                  {!useNewCustomer && customerId && (
                    <button
                      type="button"
                      className={packageMode === 'mevcut' ? styles.packageModeBtnActive : styles.packageModeBtn}
                      onClick={() => setPackageMode('mevcut')}
                    >
                      Mevcut Pakete Ekle
                    </button>
                  )}
                </div>
                {packageMode === 'yeni' && (
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={packageTotalSessions}
                    onChange={(e) => setPackageTotalSessions(e.target.value)}
                    placeholder="Toplam seans sayısı (ör. 8)"
                    style={{ marginTop: 8 }}
                  />
                )}
                {packageMode === 'mevcut' && (
                  <div style={{ marginTop: 8 }}>
                    <Select
                      value={existingPackageId}
                      onChange={setExistingPackageId}
                      options={servicePackages
                        .filter((p) => p.customer_id === customerId)
                        .map((p) => {
                          const used = appointments.filter((a) => a.package_id === p.id).length
                          const svcName = services.find((s) => s.id === p.service_id)?.name ?? 'Hizmet'
                          return { value: p.id, label: `${svcName} — ${used}/${p.total_sessions} seans` }
                        })}
                    />
                    {servicePackages.filter((p) => p.customer_id === customerId).length === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                        Bu müşterinin açık bir paketi yok.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="field">
                <label htmlFor="employee">Çalışan</label>
                <Select
                  id="employee"
                  value={employeeId}
                  onChange={setEmployeeId}
                  options={[
                    { value: '', label: 'Farketmez' },
                    ...eligibleEmployees.map((p) => ({ value: p.id, label: p.full_name ?? '—' })),
                  ]}
                />
              </div>

              <div className="field">
                <label htmlFor="apptDate">Tarih</label>
                <input id="apptDate" type="date" value={apptDate} onChange={(e) => setApptDate(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="apptTime">Saat</label>
                <Select
                  id="apptTime"
                  value={apptTime}
                  onChange={setApptTime}
                  options={TIME_OPTIONS.map((t) => ({ value: t, label: t }))}
                />
              </div>

              <div className="field">
                <label htmlFor="source">Kaynak</label>
                <Select id="source" value={source} onChange={setSource} options={SOURCE_OPTIONS} />
              </div>

              <div className="field">
                <label htmlFor="sourceNote">Not (opsiyonel)</label>
                <input
                  id="sourceNote"
                  placeholder="ör. kampanya adı"
                  value={sourceNote}
                  onChange={(e) => setSourceNote(e.target.value)}
                />
              </div>

              <div className={styles.formActions}>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Oluşturuluyor…' : 'Randevu oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {completingAppt && (
        <div className={styles.modalBackdrop} onClick={() => setCompletingAppt(null)}>
          <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Randevu Tamamlandı</h2>
              <button type="button" className={styles.bannerClose} onClick={() => setCompletingAppt(null)}>
                ✕
              </button>
            </div>

            {completeError && (
              <div className={`${styles.banner} ${styles.bannerError}`} style={{ marginBottom: 16 }}>
                <span>{completeError}</span>
                <button type="button" className={styles.bannerClose} onClick={() => setCompleteError(null)}>
                  ✕
                </button>
              </div>
            )}

            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
              {customerName(completingAppt.customer_id)} — {serviceName(completingAppt.service_id)}
            </p>

            <div className={styles.form}>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="completePriceOverride">
                  Bu Randevunun Ücreti (TL)
                  {(() => {
                    const svc = services.find((s) => s.id === completingAppt.service_id)
                    return svc?.price != null ? ` — standart ücret: ${currency.format(svc.price)}` : ''
                  })()}
                </label>
                <input
                  id="completePriceOverride"
                  type="number"
                  min={0}
                  step="0.01"
                  value={completePriceOverride}
                  onChange={(e) => {
                    const newPrice = Number(e.target.value) || 0
                    const balance = Number(completeBalanceAmount) || 0
                    setCompletePriceOverride(e.target.value)
                    setCompletePaymentAmount(String(Math.max(0, newPrice - balance)))
                  }}
                />
              </div>

              {(() => {
                const price = Number(completePriceOverride) || 0
                const customer = customers.find((c) => c.id === completingAppt.customer_id)
                const balanceAvailable = customer?.credit_balance ?? 0
                if (balanceAvailable <= 0) return null
                const balanceRequested = Math.min(Number(completeBalanceAmount) || 0, balanceAvailable, price)
                return (
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="completeBalanceAmount">
                      Müşteri Bakiyesi: {currency.format(balanceAvailable)} — Bakiyeden Al (TL)
                    </label>
                    <input
                      id="completeBalanceAmount"
                      type="number"
                      min={0}
                      max={Math.min(balanceAvailable, price)}
                      step="0.01"
                      value={completeBalanceAmount}
                      onChange={(e) => {
                        const requested = Math.min(Number(e.target.value) || 0, balanceAvailable, price)
                        setCompleteBalanceAmount(e.target.value)
                        setCompletePaymentAmount(String(Math.max(0, price - requested)))
                      }}
                    />
                    {balanceRequested >= price && price > 0 && (
                      <p style={{ color: 'var(--ok-text)', fontSize: 12.5, marginTop: 6 }}>
                        Bakiye bu randevunun tamamını karşılıyor, ek ödeme gerekmiyor.
                      </p>
                    )}
                  </div>
                )
              })()}

              {(() => {
                const price = Number(completePriceOverride) || 0
                const customer = customers.find((c) => c.id === completingAppt.customer_id)
                const balanceAvailable = customer?.credit_balance ?? 0
                const balanceRequested = Math.min(Number(completeBalanceAmount) || 0, balanceAvailable, price)
                const remainingDue = Math.max(0, price - balanceRequested)
                if (remainingDue <= 0) return null
                return (
                  <>
                    <div className="field" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={completeRecordPayment}
                          onChange={(e) => setCompleteRecordPayment(e.target.checked)}
                        />
                        Ödeme alındı {balanceRequested > 0 ? `(Kalan ${currency.format(remainingDue)})` : ''}
                      </label>
                    </div>

                    {completeRecordPayment && (
                      <>
                        <div className="field">
                          <label htmlFor="completeAmount">Alınan Tutar (TL)</label>
                          <input
                            id="completeAmount"
                            type="number"
                            min={0}
                            step="0.01"
                            value={completePaymentAmount}
                            onChange={(e) => setCompletePaymentAmount(e.target.value)}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="completeMethod">Ödeme Yöntemi</label>
                          <Select
                            id="completeMethod"
                            value={completePaymentMethod}
                            onChange={setCompletePaymentMethod}
                            options={PAYMENT_METHOD_OPTIONS}
                          />
                        </div>
                      </>
                    )}
                  </>
                )
              })()}

              <div className="field" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={completeFollowup}
                    onChange={(e) => setCompleteFollowup(e.target.checked)}
                  />
                  {completingAppt.package_id
                    ? `Devam randevusu oluştur (${packageProgress(completingAppt)?.current ?? 1}/${packageProgress(completingAppt)?.total ?? '?'} tamamlanıyor)`
                    : 'İş bitmedi, devam randevusu oluştur'}
                </label>
              </div>
              {completeFollowup && (
                <>
                  <div className="field">
                    <label htmlFor="followupDate">Sonraki Seans Tarihi</label>
                    <input
                      id="followupDate"
                      type="date"
                      value={completeFollowupDate}
                      onChange={(e) => setCompleteFollowupDate(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="followupTime">Saat</label>
                    <Select
                      id="followupTime"
                      value={completeFollowupTime}
                      onChange={setCompleteFollowupTime}
                      options={TIME_OPTIONS.map((t) => ({ value: t, label: t }))}
                    />
                  </div>
                </>
              )}

              <div className={styles.formActions}>
                <button type="button" className="btn-primary" disabled={completeBusy} onClick={submitCompletion}>
                  {completeBusy ? 'Kaydediliyor…' : 'Tamamla'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingAppt && (
        <div className={styles.modalBackdrop} onClick={() => setViewingAppt(null)}>
          <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Randevu Detayı</h2>
              <button type="button" className={styles.bannerClose} onClick={() => setViewingAppt(null)}>
                ✕
              </button>
            </div>

            <div className={styles.detailList}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Müşteri</span>
                <span className={styles.detailValue}>
                  {customerName(viewingAppt.customer_id)}
                  {customerPhone(viewingAppt.customer_id) && ` · ${customerPhone(viewingAppt.customer_id)}`}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Hizmet</span>
                <span className={styles.detailValue}>
                  {serviceName(viewingAppt.service_id)}
                  {packageProgress(viewingAppt) &&
                    ` · ${packageProgress(viewingAppt)!.current}/${packageProgress(viewingAppt)!.total} seans`}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Çalışan</span>
                <span className={styles.detailValue}>{employeeName(viewingAppt.employee_id)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Tarih / Saat</span>
                <span className={styles.detailValue}>
                  {new Date(viewingAppt.scheduled_at).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {` · ${viewingAppt.duration_minutes ?? SLOT_MINUTES} dk`}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Durum</span>
                <span className={`${styles.statusBadge} ${STATUS_CLASS[viewingAppt.status]}`}>
                  {STATUS_OPTIONS.find((o) => o.value === viewingAppt.status)?.label ?? viewingAppt.status}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Kaynak</span>
                <span className={styles.detailValue}>
                  {SOURCE_OPTIONS.find((o) => o.value === viewingAppt.source)?.label ?? viewingAppt.source}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Not</span>
                <span className={styles.detailValue}>{viewingAppt.source_note || 'Not eklenmemiş.'}</span>
              </div>
            </div>

            <div className={styles.formActions}>
              {canEdit(viewingAppt) && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: 'auto' }}
                  onClick={() => {
                    const a = viewingAppt
                    setViewingAppt(null)
                    openEdit(a)
                  }}
                >
                  Düzenle
                </button>
              )}
              <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={() => setViewingAppt(null)}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {editingAppt && (
        <div className={styles.modalBackdrop} onClick={() => setEditingAppt(null)}>
          <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Randevuyu Düzenle</h2>
              <button type="button" className={styles.bannerClose} onClick={() => setEditingAppt(null)}>
                ✕
              </button>
            </div>

            {editError && (
              <div className={`${styles.banner} ${styles.bannerError}`} style={{ marginBottom: 16 }}>
                <span>{editError}</span>
                <button type="button" className={styles.bannerClose} onClick={() => setEditError(null)}>
                  ✕
                </button>
              </div>
            )}

            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
              {customerName(editingAppt.customer_id)}
            </p>

            <div className={styles.form}>
              <div className="field">
                <label htmlFor="editService">Hizmet</label>
                <Select
                  id="editService"
                  value={editServiceId}
                  onChange={setEditServiceId}
                  options={services.map((s) => ({ value: s.id, label: s.name, sub: `${s.duration_minutes} dk` }))}
                />
              </div>

              <div className="field">
                <label htmlFor="editEmployee">Çalışan</label>
                <Select
                  id="editEmployee"
                  value={editEmployeeId}
                  onChange={setEditEmployeeId}
                  options={[
                    { value: '', label: 'Farketmez' },
                    ...profiles.map((p) => ({ value: p.id, label: p.full_name ?? '—' })),
                  ]}
                />
              </div>

              <div className="field">
                <label htmlFor="editDate">Tarih</label>
                <input id="editDate" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>

              <div className="field">
                <label htmlFor="editTime">Saat</label>
                <Select
                  id="editTime"
                  value={editTime}
                  onChange={setEditTime}
                  options={TIME_OPTIONS.map((t) => ({ value: t, label: t }))}
                />
              </div>

              {editingAppt.customer_id && (
                <div className="field">
                  <label htmlFor="editPhone">Müşteri Telefonu</label>
                  <input
                    id="editPhone"
                    type="tel"
                    inputMode="numeric"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="05xx xxx xx xx"
                  />
                </div>
              )}

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="editNote">Not (opsiyonel)</label>
                <input
                  id="editNote"
                  placeholder="ör. kampanya adı"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              <div className={styles.formActions}>
                <button type="button" className="btn-primary" disabled={editBusy} onClick={submitEdit}>
                  {editBusy ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'gunluk' && (
        <div className="card">
          <div className={styles.dateHeaderRow}>
            <button type="button" className={styles.dateNavBtn} onClick={() => shiftDate(-1)} aria-label="Önceki gün">
              ‹
            </button>
            <button
              type="button"
              className={styles.dateHeaderLabel}
              onClick={() => dateInputRef.current?.showPicker?.()}
            >
              {new Date(`${viewDate}T00:00:00`).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              , {viewWeekday}
              <ChevronRightIcon width={13} height={13} className={styles.dateHeaderChevron} />
            </button>
            <button type="button" className={styles.dateNavBtn} onClick={() => shiftDate(1)} aria-label="Sonraki gün">
              ›
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={viewDate}
              onChange={(e) => setViewDate(e.target.value)}
              className={styles.hiddenDateInput}
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>

          <div className={styles.dayStrip}>
            {dayStripDates.map((d) => {
              const dk = toLocalDateString(d)
              const active = dk === viewDate
              return (
                <button
                  type="button"
                  key={dk}
                  className={active ? styles.dayStripBtnActive : styles.dayStripBtn}
                  onClick={() => setViewDate(dk)}
                >
                  <span className={styles.dayStripWeekday}>{WEEKDAY_SHORT[d.getDay()]}</span>
                  <span className={styles.dayStripNum}>{d.getDate()}</span>
                </button>
              )
            })}
          </div>

          {diffDays !== 0 && (
            <div className={styles.dayNavHint}>
              <span className={styles.dayLabel}>{dayLabel}</span>
              <button type="button" className={styles.todayButton} onClick={() => setViewDate(todayLocalDateString())}>
                Bugüne dön
              </button>
            </div>
          )}

          <div className={styles.dayControlsRow}>
            <div className={styles.plainDropdown} ref={employeeMenuRef}>
              <button
                type="button"
                className={styles.plainDropdownTrigger}
                onClick={() => setEmployeeMenuOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={employeeMenuOpen}
              >
                <CalendarIcon width={14} height={14} />
                {employeeFilter ? employeeName(employeeFilter) : 'Tüm Çalışanlar'}
                <ChevronRightIcon width={12} height={12} className={styles.plainDropdownChevron} />
              </button>
              {employeeMenuOpen && (
                <div className={styles.plainDropdownMenu} role="listbox">
                  <button
                    type="button"
                    className={styles.plainDropdownMenuItem}
                    onClick={() => {
                      setEmployeeFilter('')
                      setEmployeeMenuOpen(false)
                    }}
                  >
                    Tüm Çalışanlar
                  </button>
                  {profiles.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={styles.plainDropdownMenuItem}
                      onClick={() => {
                        setEmployeeFilter(p.id)
                        setEmployeeMenuOpen(false)
                      }}
                    >
                      {p.full_name ?? '—'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={`${styles.plainDropdown} ${styles.plainDropdownRight}`} ref={displayMenuRef}>
              <button
                type="button"
                className={`${styles.plainDropdownTrigger} ${styles.plainDropdownTriggerSignal}`}
                onClick={() => setDisplayMenuOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={displayMenuOpen}
              >
                {dailyDisplay === 'zaman' ? 'Günlük Görünüm' : 'Liste Görünümü'}
                <ChevronRightIcon width={12} height={12} className={styles.plainDropdownChevron} />
              </button>
              {displayMenuOpen && (
                <div className={`${styles.plainDropdownMenu} ${styles.plainDropdownMenuRight}`} role="listbox">
                  <button
                    type="button"
                    className={styles.plainDropdownMenuItem}
                    onClick={() => {
                      setDailyDisplay('zaman')
                      setDisplayMenuOpen(false)
                    }}
                  >
                    Günlük Görünüm
                  </button>
                  <button
                    type="button"
                    className={styles.plainDropdownMenuItem}
                    onClick={() => {
                      setDailyDisplay('liste')
                      setDisplayMenuOpen(false)
                    }}
                  >
                    Liste Görünümü
                  </button>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>
          ) : visible.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>Bu tarihte randevu yok.</p>
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
            <div className={styles.timelineList}>
              {timelineEntries.map((entry, i) =>
                entry.kind === 'now' ? (
                  <div key="now" className={styles.timelineRow}>
                    <div className={styles.timelineRowGutter}>
                      <span className={styles.timelineNowTime}>
                        {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className={styles.timelineNowLine} />
                  </div>
                ) : (
                  <div key={entry.appt.id} className={styles.timelineRow}>
                    <span
                      className={`${styles.timelineRowGutter} ${styles[`timelineText${i % TIMELINE_COLORS.length}`]}`}
                    >
                      {new Date(entry.appt.scheduled_at).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {renderTimelineCard(entry.appt, i)}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {viewMode !== 'gunluk' && (
        <div className="card">
          {viewMode === 'haftalik' && (
            <div className={styles.dateHeaderRow}>
              <button
                type="button"
                className={styles.dateNavBtn}
                onClick={() => shiftWeek(-1)}
                aria-label="Önceki hafta"
              >
                ‹
              </button>
              <span className={styles.dayLabel}>
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

          {loading ? (
            <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>
          ) : (
            groupedByDate.map((group) => (
              <div key={group.dateKey} className={styles.dateGroup}>
                <div className={styles.dateGroupLabel}>
                  {WEEKDAY_SHORT[new Date(group.dateKey + 'T00:00:00').getDay()]} · {group.label}
                </div>
                {group.items.length === 0 ? (
                  <p className={styles.sourceNote}>Randevu yok.</p>
                ) : (
                  <div className={styles.timelineList}>
                    {group.items.map((a, i) => (
                      <div key={a.id} className={styles.timelineRow}>
                        <span
                          className={`${styles.timelineRowGutter} ${styles[`timelineText${i % TIMELINE_COLORS.length}`]}`}
                        >
                          {new Date(a.scheduled_at).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {renderTimelineCard(a, i)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
