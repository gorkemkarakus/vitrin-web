import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { friendlyDbError } from '../lib/dbErrors'
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
import { computeDebtItems, type DebtItem } from '../lib/customerDebts'
import Avatar from '../components/Avatar'
import StatusDropdown, { type StatusDropdownOption } from '../components/StatusDropdown'
import Select from '../components/Select'
import PickerSheet from '../components/PickerSheet'
import {
  ChevronRightIcon,
  CheckCircleIcon,
  PencilIcon,
  UserIcon,
  MoreHorizontalIcon,
  MessagesIcon,
} from '../components/icons'
import type { LayoutOutletContext } from '../layouts/DashboardLayout'
import PageHeader from '../components/PageHeader'
import styles from './AppointmentsPage.module.css'
import SwipeToConfirm from './appointments/SwipeToConfirm'
import EditAppointmentModal from './appointments/EditAppointmentModal'
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
import { PAYMENT_METHOD_OPTIONS } from '../lib/paymentMethods'
import { FIELD_LIMITS } from '../lib/fieldLimits'

// Kapanis ekranindaki odeme yontemi cipleri ve alt dugme metni icin kisa adlar.
const METHOD_SHORT: Record<string, string> = { nakit: 'Nakit', kart: 'Kart', havale: 'Havale', diger: 'Diğer' }

// Randevu detayindaki "hikaye" icin kim olusturdu.
const SOURCE_STORY: Record<string, string> = {
  chatbot: 'Chatbot',
  online_randevu: 'Online randevu sayfası',
  kullanici_uzerinden: 'Salon',
  dogrudan_musteri: 'Salon',
  reklam_instagram: 'Instagram reklamı',
  reklam_whatsapp: 'WhatsApp reklamı',
  diger: 'Salon',
}

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

const STATUS_OPTIONS: { value: Appointment['status']; label: string }[] = [
  { value: 'bekliyor', label: 'Bekliyor' },
  { value: 'onaylandi', label: 'Onaylandı' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
  { value: 'iptal', label: 'İptal' },
  { value: 'gelmedi', label: 'Gelmedi' },
]

const STATUS_CLASS: Record<Appointment['status'], string> = {
  bekliyor: styles.statusBekliyor,
  onaylandi: styles.statusOnaylandi,
  tamamlandi: styles.statusTamamlandi,
  iptal: styles.statusIptal,
  gelmedi: styles.statusGelmedi,
}

const STATUS_DROPDOWN_OPTIONS: StatusDropdownOption[] = [
  { value: 'bekliyor', label: 'Bekliyor', color: 'var(--warn-text)', bg: 'var(--warn-bg)' },
  { value: 'onaylandi', label: 'Onaylandı', color: 'var(--info-text)', bg: 'var(--info-bg)' },
  { value: 'tamamlandi', label: 'Tamamlandı', color: 'var(--ok-text)', bg: 'var(--ok-bg)' },
  { value: 'iptal', label: 'İptal', color: 'var(--danger-text)', bg: 'var(--danger-bg)' },
  { value: 'gelmedi', label: 'Gelmedi', color: 'var(--text-dim)', bg: 'var(--panel-2)' },
]

type ViewMode = 'gunluk' | 'liste' | 'haftalik' | 'ozel'

// "Fark etmez" secildiginde is calisanlar arasinda dengeli dagilsin diye
// (prim adaleti) bu kaynaklardan en son randevusu en eski olan calisan one
// cikar. Chatbot ve online randevudaki rankEligibleByFairness ile ayni
// algoritma; degisirse ucu birlikte degismeli.
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
  const { profile, can } = useAuth()
  // Calisan yetkileri (yoneticide hepsi acik) — bkz. lib/permissions.ts.
  const canPay = can('odeme_al')
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
  const [detailMenuOpen, setDetailMenuOpen] = useState(false)
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
  // Kapanis ekrani
  const [completeTypeOpen, setCompleteTypeOpen] = useState(false)
  const [completePayMode, setCompletePayMode] = useState<'full' | 'custom' | 'none'>('full')
  // Musterinin bu randevu/paket disindaki onceki borcu ("Hepsini kapat").
  const [oldDebtItems, setOldDebtItems] = useState<DebtItem[]>([])
  const [includeOldDebt, setIncludeOldDebt] = useState(true)

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

  // "Tamamlandi" isaretlenince acilan odeme + sonraki seans mini-sihirbazi.
  const [completingAppt, setCompletingAppt] = useState<Appointment | null>(null)
  // Randevu henuz bir pakete bagli degilse (ilk tamamlama), zorunlu olarak
  // sorulan "Tek Seferlik / Seanslı" karari — paket zaten varsa bu soru hic
  // sorulmuyor (asagida completingAppt.package_id kontrolu ile atlaniyor).
  const [completeTransactionType, setCompleteTransactionType] = useState<'tek' | 'seansli' | null>(null)
  const [completePackageTotalSessions, setCompletePackageTotalSessions] = useState('8')
  const [completePackageSessionNumber, setCompletePackageSessionNumber] = useState('1')
  // Randevu zaten bir pakete bagliysa, o paketin TUM seanslari+odemeleri
  // taze cekilip (handleStatusChange icinde) paketin GUNCEL beklenen/odenen
  // toplami onceden hesaplanir — "Paket Tutarı"/"Kalan Borç" onizlemesi ve
  // "zaten tamamen tahsil edilmis mi" (completeFullyPaid) bundan turetilir.
  const [completeScopeExpected, setCompleteScopeExpected] = useState(0)
  const [completeScopePaid, setCompleteScopePaid] = useState(0)
  const [completeFullyPaid, setCompleteFullyPaid] = useState(false)
  const [completeLoadingScope, setCompleteLoadingScope] = useState(false)
  // Standart hizmet fiyatindan farkli olabilecek, BU seansa ozel gercek
  // ucret (ör. ekstra bakim/boya ile pahalanmis) — "Tahsil Edilen Tutar"dan
  // ayri, cunku tutar kismi odenmis olabilir. Degistirilince Tahsil Edilen
  // Tutar da otomatik ona esitlenir (cogu zaman tam tahsil edilir
  // varsayimiyla), ama sonrasinda bagimsiz duzenlenebilir kalir.
  const [completePriceOverride, setCompletePriceOverride] = useState('')
  // "Esnek Fiyat" ile acilip kapanan duzenleme modu — varsayilan olarak
  // ucret salt-okunur buyuk yazi ile gosterilir, degistirmek icin once
  // "Esnek Fiyat" dokunulur.
  const [completePriceEditing, setCompletePriceEditing] = useState(false)
  // "Paket Tutarı" da (Düzenle ile) dogrudan toplam olarak girilebilir —
  // girilen toplam, seans basi fiyati (completePriceOverride = toplam /
  // seans sayisi) geriye donuk hesaplayarak gunceller, boylece tek bir
  // kaynak (seans basi fiyat) her zaman dogru kalir.
  const [completePackageAmountEditing, setCompletePackageAmountEditing] = useState(false)
  const [completePaymentAmount, setCompletePaymentAmount] = useState('')
  // Bos birakiliyor (varsayilan yontem YOK) — bir tutar girildiyse yontem
  // secilmeden Tamamla butonu acilmiyor (zorunlu secim).
  const [completePaymentMethod, setCompletePaymentMethod] = useState('')
  const [completeFollowupDate, setCompleteFollowupDate] = useState('')
  const [completeFollowupTime, setCompleteFollowupTime] = useState('')
  // "Tarih Seç" dokunulana kadar tarih/saat alanlari gizli kalir (amber
  // kartta sadece bir buton gorunur) — dokununca acilir.
  const [, setCompleteNextSessionExpanded] = useState(false)
  const [completeNote, setCompleteNote] = useState('')
  const [completeBusy, setCompleteBusy] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

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
      setCompleteTransactionType(appt.package_id ? 'seansli' : 'tek')
      setCompleteTypeOpen(false)
      setCompletePayMode('full')
      setCompletePackageTotalSessions('8')
      setCompletePackageSessionNumber('1')
      setCompleteScopeExpected(0)
      setCompleteScopePaid(0)
      setCompleteFullyPaid(false)
      setCompletePriceEditing(false)
      setCompletePackageAmountEditing(false)
      setCompletePaymentMethod('')
      setCompleteFollowupDate('')
      setCompleteFollowupTime('')
      setCompleteNextSessionExpanded(false)
      setCompleteNote('')
      setCompleteError(null)
      setOldDebtItems([])
      setIncludeOldDebt(true)
      if (appt.customer_id && canPay) loadOldDebt(appt)

      if (appt.package_id) {
        // Paket zaten varsa (ilk seans degil), fiyat ILK SEANSTA belirlenmis
        // ozel ucrete KILITLENIR — bu seansta ayrica sorulmaz/degistirilemez,
        // sadece paketin GUNCEL kalan bakiyesi gosterilir. Ayni sorguyla
        // "zaten tamamen tahsil edilmis mi?" (completeFullyPaid) de burada
        // onceden hesaplanir.
        setCompleteLoadingScope(true)
        const pkg = servicePackages.find((p) => p.id === appt.package_id)
        const standardPrice = pkg?.service_id ? (services.find((s) => s.id === pkg.service_id)?.price ?? 0) : 0
        const [{ data: sessions }, { data: pkgPayments }] = await Promise.all([
          supabase.from('appointments').select('price_override, scheduled_at').eq('package_id', appt.package_id),
          supabase.from('payments').select('amount').eq('package_id', appt.package_id).is('voided_at', null),
        ])
        const sortedSessions = (sessions ?? []).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
        const pkgSessionPrice = sortedSessions[0]?.price_override ?? standardPrice
        const knownSessionsTotal = sortedSessions.reduce((sum, s) => sum + (s.price_override ?? pkgSessionPrice), 0)
        const remainingSessionsEstimate =
          Math.max(0, (pkg?.total_sessions ?? 0) - (pkg?.session_offset ?? 0) - sortedSessions.length) * pkgSessionPrice
        const scopeExpected = knownSessionsTotal + remainingSessionsEstimate
        const scopePaid = (pkgPayments ?? []).reduce((sum, p) => sum + p.amount, 0)
        setCompleteScopeExpected(scopeExpected)
        setCompleteScopePaid(scopePaid)
        setCompleteFullyPaid(scopePaid >= scopeExpected)
        setCompletePriceOverride(String(appt.price_override ?? pkgSessionPrice))
        setCompletePaymentAmount(String(Math.max(0, scopeExpected - scopePaid)))
        setCompleteLoadingScope(false)
      } else {
        const svc = services.find((s) => s.id === appt.service_id)
        const price = appt.price_override ?? svc?.price ?? 0
        setCompletePriceOverride(String(price))
        setCompletePaymentAmount(String(price))
      }
    } else {
      updateStatus(appt, status)
    }
  }

  // Musterinin bu kapanisin disindaki borclari (kalem kalem): Musteriler ve
  // Kasa ile ayni hesap (computeDebtItems). Bu randevu ve bagli oldugu paket
  // haric tutulur — onlar kapanisin kendi odeme adiminda.
  async function loadOldDebt(appt: Appointment) {
    const cid = appt.customer_id
    if (!cid) return
    const [{ data: apps }, { data: pkgs }, { data: pays }, { data: svcs }] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, customer_id, service_id, status, scheduled_at, package_id, price_override')
        .eq('customer_id', cid),
      supabase
        .from('service_packages')
        .select('id, customer_id, service_id, total_sessions, session_offset')
        .eq('customer_id', cid),
      supabase
        .from('payments')
        .select('customer_id, amount, appointment_id, package_id')
        .eq('customer_id', cid)
        .is('voided_at', null),
      supabase.from('services').select('id, price'),
    ])
    const priceById = new Map((svcs ?? []).map((x) => [x.id as string, Number(x.price ?? 0)]))
    const items = computeDebtItems(pkgs ?? [], apps ?? [], pays ?? [], priceById).filter(
      (it) =>
        !(it.kind === 'appointment' && it.id === appt.id) && !(it.kind === 'package' && it.id === appt.package_id),
    )
    setOldDebtItems(items)
  }

  // Islem turu degisince fiyat/seans: hizmetin paket sablonu varsa seansli
  // secimde seans sayisi ve seans basi ucret oradan gelir; tek seferlige
  // donulunce normal ucrete geri doner. "Hepsini al" secili ise tahsil
  // edilecek tutar da yeni toplama esitlenir.
  function chooseCompleteType(type: 'tek' | 'seansli') {
    setCompleteTransactionType(type)
    if (!completingAppt || completingAppt.package_id) return
    const svc = services.find((x) => x.id === completingAppt.service_id)
    if (type === 'seansli' && svc?.package_sessions && svc.package_price != null) {
      const perSession = Math.round((svc.package_price / svc.package_sessions) * 100) / 100
      setCompletePackageTotalSessions(String(svc.package_sessions))
      setCompletePriceOverride(String(perSession))
      if (completePayMode === 'full')
        setCompletePaymentAmount(String(Math.round(perSession * svc.package_sessions * 100) / 100))
      return
    }
    const single = completingAppt.price_override ?? svc?.price ?? 0
    setCompletePriceOverride(String(single))
    if (completePayMode === 'full') {
      const sessions = type === 'seansli' ? Number(completePackageTotalSessions) || 1 : 1
      setCompletePaymentAmount(String(single * sessions))
    }
  }

  async function submitCompletion() {
    if (!completingAppt) return
    setCompleteError(null)

    // 1) Islem turu zorunlu (paket henuz yoksa).
    const isNewPackageDecision = !completingAppt.package_id
    if (isNewPackageDecision && !completeTransactionType) {
      setCompleteError('Lütfen işlem türünü seçin.')
      return
    }
    const creatingPackage = isNewPackageDecision && completeTransactionType === 'seansli'

    let packageTotalSessionsValue = 0
    let packageSessionNumberValue = 0
    if (creatingPackage) {
      packageTotalSessionsValue = Math.round(Number(completePackageTotalSessions))
      packageSessionNumberValue = Math.round(Number(completePackageSessionNumber))
      if (!packageTotalSessionsValue || packageTotalSessionsValue < 1) {
        setCompleteError('Geçerli bir toplam seans sayısı girin.')
        return
      }
      if (
        !packageSessionNumberValue ||
        packageSessionNumberValue < 1 ||
        packageSessionNumberValue > packageTotalSessionsValue
      ) {
        setCompleteError('Geçerli bir "kaçıncı seans" girin (1 ile toplam seans sayısı arasında).')
        return
      }
    }

    const svc = services.find((s) => s.id === completingAppt.service_id)
    const isPackageFlow = !!completingAppt.package_id || creatingPackage

    // 2) Bu seans kacinci/son seans mi? (mevcut paketse siblings'ten,
    // yeni olusturuluyorsa girilen degerlerden hesaplanir).
    let currentSessionNumber = 0
    let totalSessionsForCheck = 0
    if (creatingPackage) {
      currentSessionNumber = packageSessionNumberValue
      totalSessionsForCheck = packageTotalSessionsValue
    } else if (completingAppt.package_id) {
      const pkg = servicePackages.find((p) => p.id === completingAppt.package_id)
      totalSessionsForCheck = pkg?.total_sessions ?? 0
      const siblings = appointments
        .filter((x) => x.package_id === completingAppt.package_id)
        .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
      const idx = siblings.findIndex((x) => x.id === completingAppt.id)
      currentSessionNumber = idx + 1 + (pkg?.session_offset ?? 0)
    }
    const isLastSession = isPackageFlow && totalSessionsForCheck > 0 && currentSessionNumber >= totalSessionsForCheck
    const needsNextSession = isPackageFlow && !isLastSession

    // 3) Sonraki seans tarihi zorunlu (paket akisinda, son seans degilse).
    const followupDuration = svc?.duration_minutes ?? SLOT_MINUTES
    let followupStart: Date | null = null
    if (needsNextSession) {
      if (!completeFollowupDate || !completeFollowupTime) {
        setCompleteError('Bir sonraki seans tarihini seçiniz.')
        return
      }
      followupStart = new Date(`${completeFollowupDate}T${completeFollowupTime}`)
      // Yeni randevu formundaki musaitlik kontrolu (mesai, izin, cakisma)
      // takip randevusu icin de gecerli. Basarisizsa hicbir sey kaydedilmez
      // (randevu tamamlanmaz), pencere acik kalir.
      if (
        completingAppt.employee_id &&
        !isEmployeeAvailable(completingAppt.employee_id, followupStart, followupDuration)
      ) {
        setCompleteError(
          'Seçilen çalışan bu saatte müsait değil (mesai dışı, izinli veya dolu). Farklı bir saat seçin.',
        )
        return
      }
    }

    // Ucret: paket akisinda bu seansin fiyati ilk seansta kilitlenen ozel
    // ucrettir (completePriceOverride; sonraki seanslarda sorulmaz). Tahsil
    // edilen tutar paketin guncel kalan bakiyesine, paket yoksa bu islemin
    // ucretine gore kirpilir; girilen tutar kalan borcu asamaz.
    const price = Number(completePriceOverride) || 0
    let packageExpected = 0
    let packagePaidSoFar = 0
    if (creatingPackage) {
      packageExpected = packageTotalSessionsValue * price
    } else if (completingAppt.package_id) {
      packageExpected = completeScopeExpected
      packagePaidSoFar = completeScopePaid
    }
    const remainingDue = isPackageFlow ? Math.max(0, packageExpected - packagePaidSoFar) : Math.max(0, price)
    // Odeme alma yetkisi yoksa tutar ne girilmis olursa olsun kaydedilmez.
    const rawEntered = canPay ? Number(completePaymentAmount) || 0 : 0
    if (!completeFullyPaid && rawEntered > remainingDue) {
      setCompleteError('Kalan borçtan fazla tutar girilemez.')
      return
    }
    const entered = completeFullyPaid ? 0 : Math.min(rawEntered, remainingDue)

    // Paketin SON seansi kismi odemeyle kapatilamaz — o seansta paketin
    // tum kalan bakiyesi tahsil edilmis olmali (sonraki seans olmayacagi
    // icin kalan borcu tahsil edecek baska bir firsat kalmaz).
    if (isLastSession && !completeFullyPaid && Math.max(0, remainingDue - entered) > 0) {
      setCompleteError(
        canPay
          ? 'Son seansta paketin tüm tutarı ödenmelidir.'
          : 'Paketin son seansını ödeme alma yetkisi olan biri kapatmalı.',
      )
      return
    }

    const oldDebtTotal = oldDebtItems.reduce((sum, it) => sum + it.remaining, 0)
    const oldDebtApplies =
      canPay && !completeFullyPaid && includeOldDebt && completePayMode !== 'none' && oldDebtTotal > 0

    // 4) Odeme yontemi zorunlu (bir tutar tahsil ediliyorsa).
    if ((entered > 0 || oldDebtApplies) && !completePaymentMethod) {
      setCompleteError('Ödeme yöntemini seçin.')
      return
    }

    setCompleteBusy(true)
    try {
      const priceOverrideValue = Number(completePriceOverride)
      const { error: statusErr } = await supabase
        .from('appointments')
        .update({
          status: 'tamamlandi',
          price_override: Number.isFinite(priceOverrideValue) && priceOverrideValue >= 0 ? priceOverrideValue : null,
          // Islem notu notes kolonuna yazilir; source_note randevu alinirken
          // girilen nottur (kampanya adi, bot notu) ve korunmalidir.
          ...(completeNote.trim() ? { notes: completeNote.trim() } : {}),
        })
        .eq('id', completingAppt.id)
      if (statusErr) {
        setCompleteError('Randevu tamamlanamadı: ' + statusErr.message)
        return
      }

      // "Seanslı İşlem" ilk kez secildiyse paket burada olusturulup randevu
      // ona baglanir. Bu, odeme kaydindan ONCE olmali; yoksa odeme bos
      // package_id ile kaydolur ve paket odenmemis gorunur.
      let effectivePackageId = completingAppt.package_id
      if (creatingPackage) {
        const { data: newPackage, error: pkgErr } = await supabase
          .from('service_packages')
          .insert({
            business_id: profile?.business_id,
            customer_id: completingAppt.customer_id,
            service_id: completingAppt.service_id,
            total_sessions: packageTotalSessionsValue,
            session_offset: Math.max(0, packageSessionNumberValue - 1),
            created_by_user_id: profile?.id,
          })
          .select('id')
          .single()
        if (pkgErr || !newPackage) {
          setError('Randevu tamamlandı ama paket oluşturulamadı. ' + friendlyDbError(pkgErr, 'Tekrar deneyin.'))
          setCompletingAppt(null)
          await loadData(true)
          return
        }
        effectivePackageId = newPackage.id
        await supabase.from('appointments').update({ package_id: effectivePackageId }).eq('id', completingAppt.id)
      }

      if (entered > 0) {
        const { error: payErr } = await supabase.from('payments').insert({
          // paid_at bir date kolonu; varsayilani sunucunun (UTC) CURRENT_DATE'i —
          // Turkiye'de 00:00-03:00 arasi alinan odeme bir onceki gune yazilirdi.
          paid_at: toLocalDateString(new Date()),
          business_id: profile?.business_id,
          customer_id: completingAppt.customer_id,
          appointment_id: completingAppt.id,
          package_id: effectivePackageId,
          amount: entered,
          method: completePaymentMethod,
          created_by_user_id: profile?.id,
        })
        if (payErr) {
          // Randevu zaten tamamlandi olarak isaretlendi (geri alinamaz) —
          // modal kapatilip hata ana sayfadaki banner'da gosterilir, boylece
          // "hicbir sey olmamis gibi" hissettirmez.
          setError('Randevu tamamlandı ama ödeme kaydedilemedi. ' + friendlyDbError(payErr, 'Tekrar deneyin.'))
          setCompletingAppt(null)
          await loadData(true)
          return
        }
      }

      // "Hepsini kapat": onceki borclarin her biri kendi paketine/randevusuna
      // ayri odeme olarak yazilir (borc hesabi kalem bazli eslestiriyor).
      if (oldDebtApplies) {
        const { error: oldErr } = await supabase.from('payments').insert(
          oldDebtItems.map((it) => ({
            paid_at: toLocalDateString(new Date()),
            business_id: profile?.business_id,
            customer_id: completingAppt.customer_id,
            appointment_id: it.kind === 'appointment' ? it.id : null,
            package_id: it.kind === 'package' ? it.id : null,
            amount: it.remaining,
            method: completePaymentMethod,
            created_by_user_id: profile?.id,
          })),
        )
        if (oldErr) {
          setError(
            'Randevu kapandı ama önceki borcun ödemesi kaydedilemedi. ' + friendlyDbError(oldErr, 'Tekrar deneyin.'),
          )
          setCompletingAppt(null)
          await loadData(true)
          return
        }
      }

      // Son seansta paket otomatik "tamamlandi" durumuna geciyor — bir daha
      // "Mevcut Pakete Ekle" listesinde gorunmuyor, sonraki seans da hic
      // istenmiyor (asagida needsNextSession zaten false).
      if (effectivePackageId && isLastSession) {
        await supabase.from('service_packages').update({ status: 'tamamlandi' }).eq('id', effectivePackageId)
      }

      if (needsNextSession && followupStart) {
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
            'Randevu tamamlandı ama sonraki seans oluşturulamadı: ' +
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
    } catch {
      setCompleteError(NETWORK_ERROR)
    } finally {
      setCompleteBusy(false)
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

  // Tamamlama modalinin "onizlemesi" — modalin hangi bolumlerinin
  // gosterilecegini, "Paket Tutarı"/"Kalan Borç" gibi ozet rakamlarin ne
  // olacagini ve Tamamla butonunun ne zaman acilacagini belirler.
  // submitCompletion icindeki AYNI hesaplama gercek kaydi yapar; burasi
  // sadece render/disabled durumunu onceden bilmek icin.
  let completionPreview: {
    isPackageFlow: boolean
    isLastSession: boolean
    needsNextSession: boolean
    creatingPackage: boolean
    currentSessionNumber: number
    totalSessionsForCheck: number
    previewExpected: number
    previewPaidSoFar: number
  } | null = null
  let completePaymentSummary = {
    price: 0,
    remainingDue: 0,
    entered: 0,
    stillOwed: 0,
  }
  if (completingAppt) {
    const isNewPackageDecision = !completingAppt.package_id
    const creatingPackage = isNewPackageDecision && completeTransactionType === 'seansli'
    const isPackageFlow = !!completingAppt.package_id || creatingPackage
    // Paket akisinda "price" seans basi kilitli ozel ucrettir — Esnek
    // Fiyat'la degistirilince Paket Tutarı da ANINDA buna gore yeniden
    // hesaplanir (bkz. asagida previewExpected).
    const price = Number(completePriceOverride) || 0
    let currentSessionNumber = 0
    let totalSessionsForCheck = 0
    let previewExpected = 0
    let previewPaidSoFar = 0
    if (creatingPackage) {
      currentSessionNumber = Math.round(Number(completePackageSessionNumber)) || 0
      totalSessionsForCheck = Math.round(Number(completePackageTotalSessions)) || 0
      previewExpected = totalSessionsForCheck * price
    } else if (completingAppt.package_id) {
      const pkg = servicePackages.find((p) => p.id === completingAppt.package_id)
      totalSessionsForCheck = pkg?.total_sessions ?? 0
      const siblings = appointments
        .filter((x) => x.package_id === completingAppt.package_id)
        .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
      const idx = siblings.findIndex((x) => x.id === completingAppt.id)
      currentSessionNumber = idx + 1 + (pkg?.session_offset ?? 0)
      previewExpected = completeScopeExpected
      previewPaidSoFar = completeScopePaid
    }
    const isLastSession = isPackageFlow && totalSessionsForCheck > 0 && currentSessionNumber >= totalSessionsForCheck
    completionPreview = {
      isPackageFlow,
      isLastSession,
      needsNextSession: isPackageFlow && !isLastSession,
      creatingPackage,
      currentSessionNumber,
      totalSessionsForCheck,
      previewExpected,
      previewPaidSoFar,
    }

    if (!completeFullyPaid) {
      // Musteri bakiyesi/fazla odeme kavrami kaldirildi — girilen tutar
      // hicbir zaman kalan borcu asamaz, dogrudan buna gore kirpilir.
      const remainingDue = isPackageFlow ? Math.max(0, previewExpected - previewPaidSoFar) : Math.max(0, price)
      const entered = canPay ? Math.min(Number(completePaymentAmount) || 0, remainingDue) : 0
      const stillOwed = Math.max(0, remainingDue - entered)
      completePaymentSummary = { price, remainingDue, entered, stillOwed }
    }
  }

  // Eksik zorunlu alanlar — hem "Tamamla" butonunu kilitlemek hem de
  // kullaniciya NEDEN ilerleyemedigini acikca gostermek icin tek yerden.
  const completeMissing: string[] = []
  if (completingAppt) {
    if (!completingAppt.package_id && !completeTransactionType) {
      completeMissing.push('İşlem türünü seçin.')
    }
    if (completionPreview?.creatingPackage) {
      const total = Math.round(Number(completePackageTotalSessions))
      const sessionNo = Math.round(Number(completePackageSessionNumber))
      if (!total || total < 1) completeMissing.push('Geçerli bir toplam seans sayısı girin.')
      else if (!sessionNo || sessionNo < 1 || sessionNo > total)
        completeMissing.push('Geçerli bir "kaçıncı seans" girin.')
    }
    if (!completeFullyPaid && completePaymentSummary.entered > 0 && !completePaymentMethod) {
      completeMissing.push('Ödeme yöntemini seçin.')
    }
    if (!completeFullyPaid && (Number(completePaymentAmount) || 0) > completePaymentSummary.remainingDue) {
      completeMissing.push('Kalan borçtan fazla tutar girilemez.')
    }
    // Paketin SON seansinda kismi odemeyle kapatilamaz — o ana kadar
    // biriken tum paket bakiyesi bu seansta tahsil edilmis olmali,
    // aksi halde bir sonraki seans olmayacagi icin kalan borc hic
    // tahsil edilme sansi bulamadan unutulur.
    if (completionPreview?.isLastSession && !completeFullyPaid && completePaymentSummary.stillOwed > 0) {
      completeMissing.push('Son seansta paketin tüm tutarı ödenmelidir.')
    }
    if (completionPreview?.needsNextSession && (!completeFollowupDate || !completeFollowupTime)) {
      completeMissing.push('Bir sonraki seans tarihini seçiniz.')
    }
  }
  const completeTotalSteps = completionPreview?.needsNextSession ? 3 : 2
  const completeDoneSteps =
    1 +
    (completeFullyPaid || completePaymentSummary.entered > 0 || completePayMode === 'none' || !canPay ? 1 : 0) +
    (completionPreview?.needsNextSession && completeFollowupDate && completeFollowupTime ? 1 : 0)
  const canSubmitCompletion = completingAppt !== null && !completeLoadingScope && completeMissing.length === 0

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
        <div className={styles.fullScreen}>
          <div className={styles.fullScroll}>
            <div className={styles.fsHead}>
              <button type="button" className={styles.fsBack} onClick={() => setCompletingAppt(null)} aria-label="Geri">
                <ChevronRightIcon width={18} height={18} className={styles.backIcon} />
              </button>
              <span className={styles.fsHeadText}>
                <span className={styles.fsTitle}>Kapanış</span>
                <span className={styles.fsSub}>
                  {customerName(completingAppt.customer_id)} ·{' '}
                  {new Date(completingAppt.scheduled_at).toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {completingAppt.employee_id ? ` · ${employeeName(completingAppt.employee_id).split(' ')[0]}` : ''}
                </span>
              </span>
              <span className={styles.stepPill}>
                {completeDoneSteps} / {completeTotalSteps}
              </span>
            </div>

            {completeError && (
              <div className={`${styles.banner} ${styles.bannerError}`}>
                <span>{completeError}</span>
                <button type="button" className={styles.bannerClose} onClick={() => setCompleteError(null)}>
                  ✕
                </button>
              </div>
            )}

            {/* ---- 1. Hizmet ---- */}
            <div className={styles.stepCard}>
              <div className={styles.stepCardHead}>
                <span className={styles.stepDone}>
                  <CheckCircleIcon width={16} height={16} />
                </span>
                <span className={styles.stepText}>
                  <span className={styles.stepTitle}>Hizmet yapıldı</span>
                  <span className={styles.stepSub}>
                    {serviceName(completingAppt.service_id)}
                    {completionPreview?.isPackageFlow
                      ? ` · paketten ${completionPreview.currentSessionNumber || '?'}. seans`
                      : ' · tek seferlik'}
                  </span>
                </span>
                {!completingAppt.package_id && (
                  <button type="button" className={styles.stepLink} onClick={() => setCompleteTypeOpen((v) => !v)}>
                    {completeTypeOpen ? 'Kapat' : 'Düzenle'}
                  </button>
                )}
              </div>

              {!completingAppt.package_id && completeTypeOpen && (
                <div className={styles.miniSeg}>
                  <button
                    type="button"
                    className={completeTransactionType === 'tek' ? styles.miniSegActive : styles.miniSegBtn}
                    onClick={() => chooseCompleteType('tek')}
                  >
                    Tek seferlik
                  </button>
                  <button
                    type="button"
                    className={completeTransactionType === 'seansli' ? styles.miniSegActive : styles.miniSegBtn}
                    onClick={() => chooseCompleteType('seansli')}
                  >
                    Seanslı (paket)
                  </button>
                </div>
              )}

              {completionPreview?.isPackageFlow && (
                <div className={styles.pkgBox}>
                  <div className={styles.pkgRow}>
                    <span className={styles.pkgLabel}>Toplam seans</span>
                    {completionPreview.creatingPackage ? (
                      <span className={styles.stepper}>
                        <button
                          type="button"
                          className={styles.stepperBtn}
                          disabled={(Number(completePackageTotalSessions) || 1) <= 1}
                          onClick={() =>
                            setCompletePackageTotalSessions(
                              String(Math.max(1, (Number(completePackageTotalSessions) || 1) - 1)),
                            )
                          }
                        >
                          −
                        </button>
                        <span className={styles.stepperValue}>{completePackageTotalSessions || 0}</span>
                        <button
                          type="button"
                          className={styles.stepperBtn}
                          onClick={() =>
                            setCompletePackageTotalSessions(String((Number(completePackageTotalSessions) || 0) + 1))
                          }
                        >
                          +
                        </button>
                      </span>
                    ) : (
                      <span className={styles.pkgValue}>{completionPreview.totalSessionsForCheck}</span>
                    )}
                  </div>
                  {completionPreview.creatingPackage && (
                    <div className={styles.pkgRow}>
                      <span className={styles.pkgLabel}>Bugünkü kaçıncı seans</span>
                      <input
                        className={styles.pkgInput}
                        type="number"
                        min={1}
                        step={1}
                        value={completePackageSessionNumber}
                        onChange={(e) => setCompletePackageSessionNumber(e.target.value)}
                      />
                    </div>
                  )}
                  <div className={styles.pkgRow}>
                    <span className={styles.pkgLabel}>Paket tutarı</span>
                    {completePackageAmountEditing ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        autoFocus
                        className={styles.pkgInput}
                        defaultValue={completionPreview.previewExpected}
                        onChange={(e) => {
                          const newTotal = Number(e.target.value) || 0
                          const sessionCount = Math.max(1, Math.round(Number(completePackageTotalSessions)) || 1)
                          setCompletePriceOverride(String(newTotal / sessionCount))
                        }}
                        onBlur={() => setCompletePackageAmountEditing(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        className={styles.pkgValueBtn}
                        disabled={!completionPreview.creatingPackage}
                        onClick={() => setCompletePackageAmountEditing(true)}
                      >
                        {currency.format(completionPreview.previewExpected)}
                      </button>
                    )}
                  </div>
                  <div className={styles.pkgBar}>
                    {Array.from({ length: Math.min(completionPreview.totalSessionsForCheck, 30) }).map((_, i) => (
                      <span
                        key={i}
                        className={i < completionPreview!.currentSessionNumber ? styles.pkgSegDone : styles.pkgSeg}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ---- 2. Odeme ---- */}
            <div className={`${styles.stepCard} ${styles.stepCardActive}`}>
              <div className={styles.stepCardHead}>
                <span className={styles.stepNum}>2</span>
                <span className={styles.stepTitleBig}>Ödeme</span>
                {!completeFullyPaid && completePaymentSummary.remainingDue > 0 && (
                  <span className={styles.stepWarm}>
                    {currency.format(completePaymentSummary.remainingDue)} alınacak
                  </span>
                )}
              </div>
              {completeLoadingScope ? (
                <p className={styles.emptyNote}>Yükleniyor…</p>
              ) : completeFullyPaid ? (
                <p className={styles.stepOk}>Bu paket daha önce tamamen tahsil edildi.</p>
              ) : null}
              {!completeLoadingScope && !completeFullyPaid && canPay && oldDebtItems.length > 0 && (
                <div className={styles.oldDebtBox}>
                  <span className={styles.oldDebtTitle}>
                    Müşterinin önceki borcu: {currency.format(oldDebtItems.reduce((sum, it) => sum + it.remaining, 0))}
                  </span>
                  <div className={styles.payOptions}>
                    <button
                      type="button"
                      className={includeOldDebt ? styles.payOptionActive : styles.payOption}
                      onClick={() => setIncludeOldDebt(true)}
                    >
                      <span className={includeOldDebt ? styles.radioOn : styles.radio} />
                      <span className={styles.payOptionLabel}>Hepsini kapat</span>
                      <span className={styles.payOptionAmount}>
                        {currency.format(
                          completePaymentSummary.remainingDue + oldDebtItems.reduce((sum, it) => sum + it.remaining, 0),
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={!includeOldDebt ? styles.payOptionActive : styles.payOption}
                      onClick={() => setIncludeOldDebt(false)}
                    >
                      <span className={!includeOldDebt ? styles.radioOn : styles.radio} />
                      <span className={styles.payOptionLabel}>Sadece bugünkü</span>
                      <span className={styles.payOptionAmount}>
                        {currency.format(completePaymentSummary.remainingDue)}
                      </span>
                    </button>
                  </div>
                </div>
              )}
              {completeLoadingScope ? null : completeFullyPaid ? null : !canPay ? (
                <p className={styles.emptyNote}>
                  Ödeme alma yetkin yok; {currency.format(completePaymentSummary.remainingDue)} müşterinin borcu olarak
                  kalır, yetkili biri tahsil eder.
                </p>
              ) : (
                <>
                  <div className={styles.payOptions}>
                    <button
                      type="button"
                      className={completePayMode === 'full' ? styles.payOptionActive : styles.payOption}
                      onClick={() => {
                        setCompletePayMode('full')
                        setCompletePaymentAmount(String(completePaymentSummary.remainingDue))
                      }}
                    >
                      <span className={completePayMode === 'full' ? styles.radioOn : styles.radio} />
                      <span className={styles.payOptionLabel}>Hepsini al</span>
                      <span className={styles.payOptionAmount}>
                        {currency.format(completePaymentSummary.remainingDue)}
                      </span>
                    </button>
                    <div className={completePayMode === 'custom' ? styles.payOptionActive : styles.payOption}>
                      <button
                        type="button"
                        className={styles.payOptionInner}
                        onClick={() => {
                          setCompletePayMode('custom')
                          setCompletePaymentAmount('')
                        }}
                      >
                        <span className={completePayMode === 'custom' ? styles.radioOn : styles.radio} />
                        <span className={styles.payOptionLabel}>Farklı tutar</span>
                      </button>
                      {completePayMode === 'custom' ? (
                        <input
                          className={styles.payInput}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={completePaymentSummary.remainingDue}
                          step="0.01"
                          placeholder="₺ tutar"
                          autoFocus
                          value={completePaymentAmount}
                          onChange={(e) => setCompletePaymentAmount(e.target.value)}
                        />
                      ) : (
                        <span className={styles.payOptionMuted}>₺ —</span>
                      )}
                    </div>
                    {!completionPreview?.isLastSession && (
                      <button
                        type="button"
                        className={completePayMode === 'none' ? styles.payOptionActive : styles.payOption}
                        onClick={() => {
                          setCompletePayMode('none')
                          setCompletePaymentAmount('0')
                        }}
                      >
                        <span className={completePayMode === 'none' ? styles.radioOn : styles.radio} />
                        <span className={styles.payOptionLabel}>Şimdi ödeme yok</span>
                        <span className={styles.payOptionMuted}>borç kalır</span>
                      </button>
                    )}
                  </div>

                  {(completePaymentSummary.entered > 0 ||
                    (includeOldDebt && completePayMode !== 'none' && oldDebtItems.length > 0)) && (
                    <div className={styles.methodChips}>
                      {PAYMENT_METHOD_OPTIONS.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          className={completePaymentMethod === m.value ? styles.methodChipActive : styles.methodChip}
                          onClick={() => setCompletePaymentMethod(m.value)}
                        >
                          {METHOD_SHORT[m.value] ?? m.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {!completionPreview?.isPackageFlow && (
                    <div className={styles.priceLine}>
                      <span>Hizmet ücreti</span>
                      {completePriceEditing ? (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          autoFocus
                          className={styles.pkgInput}
                          value={completePriceOverride}
                          onChange={(e) => {
                            setCompletePriceOverride(e.target.value)
                            if (completePayMode === 'full') setCompletePaymentAmount(e.target.value)
                          }}
                          onBlur={() => setCompletePriceEditing(false)}
                        />
                      ) : (
                        <button type="button" className={styles.stepLink} onClick={() => setCompletePriceEditing(true)}>
                          {currency.format(completePaymentSummary.price)} · değiştir
                        </button>
                      )}
                    </div>
                  )}

                  {completePaymentSummary.stillOwed > 0 && (
                    <span className={styles.stepWarmNote}>
                      {currency.format(completePaymentSummary.stillOwed)} borç olarak kalacak
                    </span>
                  )}
                </>
              )}
            </div>

            {/* ---- 3. Sonraki randevu ---- */}
            <div
              className={
                completionPreview?.needsNextSession ? styles.stepCard : `${styles.stepCard} ${styles.stepCardDim}`
              }
            >
              <div className={styles.stepCardHead}>
                <span className={styles.stepNumMuted}>3</span>
                <span className={styles.stepText}>
                  <span className={styles.stepTitle}>Sonraki randevu</span>
                  <span className={styles.stepSub}>
                    {completionPreview?.isLastSession
                      ? 'Paketin son seansı — tamamlanınca paket kapanır.'
                      : completionPreview?.needsNextSession
                        ? completeFollowupDate && completeFollowupTime
                          ? `${new Date(`${completeFollowupDate}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} · ${completeFollowupTime}`
                          : 'Paketin sonraki seansı için tarih seç (zorunlu)'
                        : 'Tek seferlik işlem — gerekirse sonra yeni randevu aç'}
                  </span>
                </span>
              </div>
              {completionPreview?.needsNextSession && (
                <div className={styles.twoCol}>
                  <div className="field field-flush">
                    <label htmlFor="followupDate">Tarih</label>
                    <input
                      id="followupDate"
                      type="date"
                      value={completeFollowupDate}
                      onChange={(e) => {
                        const newDate = e.target.value
                        const candidateIds = completingAppt.employee_id ? [completingAppt.employee_id] : []
                        if (newDate && !isDayOpenForCandidates(newDate, candidateIds)) {
                          setCompleteError('Seçilen çalışan bu gün çalışmıyor.')
                          return
                        }
                        setCompleteError(null)
                        setCompleteFollowupDate(newDate)
                      }}
                    />
                  </div>
                  <div className="field field-flush">
                    <label htmlFor="followupTime">Saat</label>
                    <Select
                      id="followupTime"
                      value={completeFollowupTime}
                      onChange={setCompleteFollowupTime}
                      options={buildTimeOptions(
                        completeFollowupDate,
                        completingAppt.employee_id ? [completingAppt.employee_id] : [],
                        services.find((s) => s.id === completingAppt.service_id)?.duration_minutes ?? SLOT_MINUTES,
                      )}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ---- Not ---- */}
            <div className={styles.stepCard}>
              <textarea
                className={styles.noteBox}
                placeholder="İşlem notu (isteğe bağlı) — ör. kullanılan renk, müşterinin isteği"
                maxLength={250}
                value={completeNote}
                onChange={(e) => setCompleteNote(e.target.value)}
              />
            </div>

            {completeMissing.length > 0 && (
              <div className={styles.missingList}>
                {completeMissing.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.fsFooter}>
            <button
              type="button"
              className={styles.fsSubmit}
              disabled={completeBusy || !canSubmitCompletion}
              onClick={submitCompletion}
            >
              {completeBusy
                ? 'Kaydediliyor…'
                : completePaymentSummary.entered > 0
                  ? `${currency.format(completePaymentSummary.entered)} ${METHOD_SHORT[completePaymentMethod]?.toLocaleLowerCase('tr') ?? ''} alındı · tamamla`.replace(
                      '  ',
                      ' ',
                    )
                  : 'İşlemi tamamla'}
            </button>
          </div>
        </div>
      )}

      {viewingAppt &&
        (() => {
          const a = viewingAppt
          const start = new Date(a.scheduled_at)
          const durMin = a.duration_minutes ?? SLOT_MINUTES
          const phone = customerPhone(a.customer_id)
          const isOpen = a.status === 'bekliyor' || a.status === 'onaylandi'
          const price = a.price_override ?? services.find((s) => s.id === a.service_id)?.price ?? null
          const pkg = packageProgress(a)
          const statusLabel = STATUS_OPTIONS.find((o) => o.value === a.status)?.label ?? a.status
          const fmt = (iso: string) =>
            new Date(iso).toLocaleString('tr-TR', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })
          // "Randevunun hikayesi": kaydin bilinen olaylari sirayla.
          const story: {
            key: string
            title: string
            sub: string
            tone: 'purple' | 'navy' | 'ok' | 'danger' | 'muted'
          }[] = []
          if (a.created_at) {
            story.push({
              key: 'created',
              title: `${SOURCE_STORY[a.source] ?? 'Salon'} oluşturdu`,
              sub: fmt(a.created_at) + (a.source_note ? ` · ${a.source_note}` : ''),
              tone: a.source === 'chatbot' || a.source === 'online_randevu' ? 'purple' : 'navy',
            })
          }
          if (a.reminder_sent_at) {
            story.push({
              key: 'reminder',
              title: 'Hatırlatma gönderildi',
              sub: `${fmt(a.reminder_sent_at)} · WhatsApp`,
              tone: 'navy',
            })
          }
          if (a.status === 'onaylandi') story.push({ key: 'st', title: 'Onaylandı', sub: 'Randevu onaylı', tone: 'ok' })
          if (a.status === 'tamamlandi')
            story.push({
              key: 'st',
              title: 'Tamamlandı',
              sub: a.notes ? `İşlem notu: ${a.notes}` : 'İşlem kapandı',
              tone: 'ok',
            })
          if (a.status === 'iptal')
            story.push({ key: 'st', title: 'İptal edildi', sub: 'Randevu iptal', tone: 'danger' })
          if (a.status === 'gelmedi')
            story.push({ key: 'st', title: 'Gelmedi', sub: 'Müşteri gelmedi olarak işaretlendi', tone: 'muted' })

          return (
            <div className={styles.fullScreen}>
              <div className={styles.fullScroll}>
                <div className={styles.fsHeadSplit}>
                  <button
                    type="button"
                    className={styles.fsBack}
                    onClick={() => setViewingAppt(null)}
                    aria-label="Geri"
                  >
                    <ChevronRightIcon width={18} height={18} className={styles.backIcon} />
                  </button>
                  {canEdit(a) && (
                    <div className={styles.viewMenuWrap}>
                      <button
                        type="button"
                        className={styles.fsBack}
                        onClick={() => setDetailMenuOpen((v) => !v)}
                        aria-label="Durumu değiştir"
                        aria-expanded={detailMenuOpen}
                      >
                        <MoreHorizontalIcon width={18} height={18} />
                      </button>
                      {detailMenuOpen && (
                        <div className={styles.viewMenu} role="menu">
                          <span className={styles.viewMenuTitle}>Durumu değiştir</span>
                          {STATUS_DROPDOWN_OPTIONS.filter((o) => o.value !== a.status && o.value !== 'tamamlandi').map(
                            (o) => (
                              <button
                                key={o.value}
                                type="button"
                                className={styles.viewMenuItem}
                                onClick={async () => {
                                  setDetailMenuOpen(false)
                                  setViewingAppt(null)
                                  await handleStatusChange(a, o.value as Appointment['status'])
                                }}
                              >
                                {o.label}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className={styles.detailHero}>
                  <div className={styles.detailDate}>
                    <span className={styles.detailDateWeekday}>
                      {start.toLocaleDateString('tr-TR', { weekday: 'short' }).toLocaleUpperCase('tr')}
                    </span>
                    <span className={styles.detailDateDay}>{start.getDate()}</span>
                    <span className={styles.detailDateMonth}>
                      {start.toLocaleDateString('tr-TR', { month: 'long' })}
                    </span>
                  </div>
                  <div className={styles.detailHeroText}>
                    <span className={styles.detailHeroTitle}>
                      {start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                      {customerName(a.customer_id)}
                    </span>
                    <span className={styles.detailHeroSub}>
                      {serviceName(a.service_id)} · {employeeName(a.employee_id)} · {durMin} dk
                      {pkg ? ` · ${pkg.current}/${pkg.total} seans` : ''}
                    </span>
                    <span className={`${styles.detailHeroStatus} ${styles[`detailStatus_${a.status}`]}`}>
                      {statusLabel}
                      {price != null ? ` · ${currency.format(price)}` : ''}
                    </span>
                  </div>
                </div>

                {customerNote(a.customer_id) && (
                  <div className={styles.customerNote}>
                    <span className={styles.customerNoteLabel}>Müşteri notu</span>
                    {customerNote(a.customer_id)}
                  </div>
                )}

                <div className={styles.storyCard}>
                  <span className={styles.storyTitle}>Randevunun hikâyesi</span>
                  {story.map((s, i) => (
                    <div className={styles.storyRow} key={s.key}>
                      <span className={styles.storyRail}>
                        <span className={`${styles.storyDot} ${styles[`storyDot_${s.tone}`]}`} />
                        {(i < story.length - 1 || isOpen) && <span className={styles.storyLine} />}
                      </span>
                      <span className={styles.storyText}>
                        <span className={styles.storyItemTitle}>{s.title}</span>
                        <span className={styles.storyItemSub}>{s.sub}</span>
                      </span>
                    </div>
                  ))}
                  {isOpen && (
                    <div className={styles.storyRow}>
                      <span className={styles.storyRail}>
                        <span className={`${styles.storyDot} ${styles.storyDot_pending}`} />
                      </span>
                      <span className={styles.storyText}>
                        <span className={`${styles.storyItemTitle} ${styles.storyItemWarm}`}>
                          Tamamlanmayı bekliyor
                        </span>
                        <span className={styles.storyItemSub}>Ödeme ve seans kaydı</span>
                      </span>
                    </div>
                  )}
                </div>

                <div className={styles.detailActions}>
                  <button
                    type="button"
                    className={styles.detailAction}
                    disabled={!a.customer_id}
                    onClick={() => {
                      setViewingAppt(null)
                      navigate(`/musteriler/${a.customer_id}`)
                    }}
                  >
                    <UserIcon width={18} height={18} />
                    Müşteri
                  </button>
                  <button
                    type="button"
                    className={styles.detailAction}
                    disabled={!rawCustomerPhone(a.customer_id)}
                    onClick={() => {
                      setViewingAppt(null)
                      navigate(`/mesajlar?telefon=${encodeURIComponent(rawCustomerPhone(a.customer_id) ?? '')}`)
                    }}
                  >
                    <MessagesIcon width={18} height={18} />
                    Konuşma
                  </button>
                  <button
                    type="button"
                    className={styles.detailAction}
                    disabled={!canEdit(a)}
                    onClick={() => {
                      setViewingAppt(null)
                      openEdit(a)
                    }}
                  >
                    <PencilIcon width={18} height={18} />
                    Düzenle
                  </button>
                </div>
                {phone && (
                  <a className={styles.detailCall} href={`tel:${phone}`}>
                    {phone} · Ara
                  </a>
                )}
              </div>

              {canEdit(a) && isOpen && (
                <SwipeToConfirm
                  label="Tamamlamak için kaydır"
                  onConfirm={() => {
                    setViewingAppt(null)
                    handleStatusChange(a, 'tamamlandi')
                  }}
                />
              )}
            </div>
          )
        })()}

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
