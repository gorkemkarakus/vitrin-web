import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Select from '../components/Select'
import HandoverAppointments from '../components/HandoverAppointments'
import PermissionEditor from '../components/PermissionEditor'
import { DEFAULT_PERMISSIONS, type PermKey } from '../lib/permissions'
import { ChevronRightIcon } from '../components/icons'
import { toLocalDateString } from '../lib/date'
import { currency } from '../lib/currency'
import styles from './EmployeeDetailPage.module.css'

const GENDER_OPTIONS = [
  { value: '', label: 'Belirtilmesin' },
  { value: 'kadin', label: 'Kadın' },
  { value: 'erkek', label: 'Erkek' },
]

interface Employee {
  id: string
  full_name: string | null
  role: 'admin' | 'user'
  is_active: boolean
  whatsapp_phone: string | null
  gender: 'kadin' | 'erkek' | null
  updated_at: string
}

interface ServiceLite {
  id: string
  name: string
  duration_minutes: number
  price: number | null
}

interface WeekAppt {
  id: string
  status: string
  scheduled_at: string
  customer_id: string | null
  duration_minutes: number | null
  service_id: string | null
  price_override: number | null
}

interface EmployeeServiceRow {
  profile_id: string
  service_id: string
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
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
  scheduled_at: string
  customer_id: string | null
  duration_minutes: number | null
}

const BREAK_LABEL = 'Öğle molası'
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

function todayLocalDateString() {
  return toLocalDateString(new Date())
}

function roleLabel(role: Employee['role']) {
  return role === 'admin' ? 'Yönetici' : 'Çalışan'
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
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


// Sayfa icindeki alt ekranlar (ayri rota acmadan).
type Section = 'ana' | 'saatler' | 'hizmetler' | 'kazanc' | 'erisim'


export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session, profile, can } = useAuth()
  // Hesap/yetki/pasife alma yalnizca yoneticide; para bilgisi Kasa ya da
  // Performans yetkisiyle gorunur (ekip_yonet yetkili calisan da bu sayfaya girer).
  const isAdmin = profile?.role === 'admin'
  const canMoney = can('kasa') || can('raporlar')

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [services, setServices] = useState<ServiceLite[]>([])
  const [employeeServices, setEmployeeServices] = useState<EmployeeServiceRow[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [todayCustomerNames, setTodayCustomerNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  const [section, setSection] = useState<Section>('ana')
  const [myPayments, setMyPayments] = useState<{ amount: number; paid_at: string; service_id: string | null }[]>([])
  const [weekAppts, setWeekAppts] = useState<WeekAppt[]>([])
  const [weekCustomerNames, setWeekCustomerNames] = useState<Map<string, string>>(new Map())
  const [otherEmployees, setOtherEmployees] = useState<{ id: string; full_name: string | null }[]>([])
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [copyMenuOpen, setCopyMenuOpen] = useState(false)
  // Gunluk cizelgede secili gun: bu haftanin Pazartesi'sinden itibaren indeks.
  const [selectedDayIdx, setSelectedDayIdx] = useState(() => (new Date().getDay() + 6) % 7)
  const [monthCollected, setMonthCollected] = useState(0)
  const [commissionPct, setCommissionPct] = useState(0)

  // Ad soyad + telefon duzenleme alani da diger kartlar gibi "duzenle ->
  // Kaydet" mantigiyla calisiyor; taslak sunucudan sadece BIR KERE
  // (profileReady false iken) dolduruluyor ki baska bir aksiyonun
  // tetikledigi loadData(true) yazilmakta olan taslagi silip suzmesin.
  const [nameDraft, setNameDraft] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [genderDraft, setGenderDraft] = useState<'' | 'kadin' | 'erkek'>('')
  const [permDraft, setPermDraft] = useState<Set<PermKey>>(new Set(DEFAULT_PERMISSIONS))
  const [permSaving, setPermSaving] = useState(false)
  const [permMsg, setPermMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Calisanin yetkileri (satiri yoksa varsayilanlar gecerli).
  useEffect(() => {
    if (!isAdmin || !id) return
    supabase
      .from('employee_permissions')
      .select('permissions')
      .eq('profile_id', id)
      .maybeSingle()
      .then(({ data }) => setPermDraft(new Set((data?.permissions as PermKey[] | undefined) ?? DEFAULT_PERMISSIONS)))
  }, [isAdmin, id])

  async function savePermissions() {
    if (!id || !profile?.business_id) return
    setPermSaving(true)
    setPermMsg(null)
    const { error: err } = await supabase
      .from('employee_permissions')
      .upsert({ profile_id: id, business_id: profile.business_id, permissions: Array.from(permDraft) })
    setPermSaving(false)
    if (err) {
      const missing = /does not exist|could not find/i.test(err.message)
      setPermMsg({ type: 'err', text: missing ? 'Bu özellik için veritabanı güncellemesi bekleniyor.' : 'Kaydedilemedi: ' + err.message })
      return
    }
    setPermMsg({ type: 'ok', text: 'Yetkiler kaydedildi. Çalışan uygulamayı yeniden açınca geçerli olur.' })
  }
  const [profileReady, setProfileReady] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState('')

  // Hesap bilgileri (e-posta/sifre) profiles tablosunda degil auth.users'ta
  // tutuluyor — bu yuzden normal supabase.from() ile degil, service_role
  // yetkisiyle calisan update-team-member edge function'iyla degistiriliyor.
  // Alanlar bos birakilirsa o alan degistirilmez (mevcut sifre asla
  // gosterilmiyor/on-doldurulmuyor).
  const [accountEmail, setAccountEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [accountSuccess, setAccountSuccess] = useState('')

  async function loadData(silent = false) {
    if (!id) return
    if (!silent) setLoading(true)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
    const [
      { data: emp },
      { data: svcs },
      { data: empSvcs },
      { data: scheds },
      { data: blocks },
      { data: appts },
      { data: monthPays },
      { data: settings },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role, is_active, whatsapp_phone, gender, updated_at')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('services').select('id, name, duration_minutes, price').eq('is_active', true).order('name'),
      supabase.from('employee_services').select('profile_id, service_id').eq('profile_id', id),
      supabase.from('employee_schedules').select('id, profile_id, day_of_week, starts_at, ends_at').eq('profile_id', id),
      supabase
        .from('employee_time_blocks')
        .select('id, profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label')
        .eq('profile_id', id),
      supabase
        .from('appointments')
        .select('id, status, scheduled_at, customer_id, duration_minutes')
        .eq('employee_id', id)
        .gte('scheduled_at', monthStart)
        .lte('scheduled_at', monthEnd),
      // Bu ay tahsil edilen odemeler — calisana, bagli oldugu randevu
      // uzerinden atfedilir (Performans/Muhasebe ile ayni mantik).
      supabase
        .from('payments')
        .select('amount, appointment_id, paid_at')
        .is('voided_at', null)
        .not('appointment_id', 'is', null)
        .gte('paid_at', toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)))
        .lte('paid_at', toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0))),
      supabase.from('business_finance_settings').select('commission_pct').maybeSingle(),
    ])
    const payApptIds = [...new Set((monthPays ?? []).map((p) => p.appointment_id as string))]
    const { data: myPaidAppts } = payApptIds.length
      ? await supabase.from('appointments').select('id, service_id').eq('employee_id', id).in('id', payApptIds)
      : { data: [] as { id: string; service_id: string | null }[] }
    const myIds = new Set((myPaidAppts ?? []).map((a) => a.id))
    setMonthCollected(
      (monthPays ?? []).filter((p) => myIds.has(p.appointment_id as string)).reduce((sum, p) => sum + p.amount, 0),
    )
    setCommissionPct(settings?.commission_pct ?? 0)
    const svcByAppt = new Map((myPaidAppts ?? []).map((a) => [a.id, a.service_id]))
    setMyPayments(
      (monthPays ?? [])
        .filter((p) => myIds.has(p.appointment_id as string))
        .map((p) => ({ amount: p.amount, paid_at: p.paid_at as string, service_id: svcByAppt.get(p.appointment_id as string) ?? null })),
    )

    // Bu haftanin (Pazartesi-Pazar) randevulari — gunluk cizelge icin.
    const monday = new Date()
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const nextMonday = new Date(monday)
    nextMonday.setDate(monday.getDate() + 7)
    const { data: wk } = await supabase
      .from('appointments')
      .select('id, status, scheduled_at, customer_id, duration_minutes, service_id, price_override')
      .eq('employee_id', id)
      .gte('scheduled_at', monday.toISOString())
      .lt('scheduled_at', nextMonday.toISOString())
    setWeekAppts((wk ?? []) as WeekAppt[])
    const wkCust = [...new Set((wk ?? []).map((a) => a.customer_id).filter(Boolean))] as string[]
    if (wkCust.length) {
      const { data: wc } = await supabase.from('customers').select('id, full_name').in('id', wkCust)
      setWeekCustomerNames(new Map((wc ?? []).map((c) => [c.id, c.full_name])))
    }
    const { data: others } = await supabase.from('profiles').select('id, full_name').eq('is_active', true).neq('id', id)
    setOtherEmployees(others ?? [])
    setEmployee(emp ?? null)
    setServices(svcs ?? [])
    setEmployeeServices(empSvcs ?? [])
    setSchedules(scheds ?? [])
    setTimeBlocks(blocks ?? [])
    setAppointments(appts ?? [])
    // Bugunun randevularindaki musteri adlari ("Su an X ile").
    const todayStr = toLocalDateString(new Date())
    const custIds = [
      ...new Set(
        (appts ?? [])
          .filter((a) => toLocalDateString(new Date(a.scheduled_at)) === todayStr)
          .map((a) => a.customer_id)
          .filter(Boolean),
      ),
    ] as string[]
    if (custIds.length) {
      const { data: custs } = await supabase.from('customers').select('id, full_name').in('id', custIds)
      setTodayCustomerNames(new Map((custs ?? []).map((c) => [c.id, c.full_name])))
    }
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
    setGenderDraft(employee.gender ?? '')
    setProfileReady(true)
  }, [loading, profileReady, employee])

  const today = useMemo(() => todayLocalDateString(), [])

  async function saveProfileInfo() {
    if (!id || !nameDraft.trim()) return
    setSavingProfile(true)
    setProfileError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({ full_name: nameDraft.trim(), whatsapp_phone: phoneDraft.trim() || null, gender: genderDraft || null })
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

  async function saveAccountInfo() {
    if (!id) return
    if (!accountEmail.trim() && !accountPassword.trim()) return
    setSavingAccount(true)
    setAccountError('')
    setAccountSuccess('')
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-team-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          id,
          email: accountEmail.trim() || undefined,
          password: accountPassword.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setAccountError(body.error ?? 'Hesap güncellenemedi.')
        return
      }
      setAccountSuccess('Hesap bilgileri güncellendi.')
      setAccountEmail('')
      setAccountPassword('')
    } catch {
      setAccountError('Sunucuya ulaşılamadı, tekrar deneyin.')
    } finally {
      setSavingAccount(false)
    }
  }

  async function setAllServices(on: boolean) {
    if (!id) return
    if (on) {
      const have = new Set(employeeServices.map((es) => es.service_id))
      const rows = services.filter((sv) => !have.has(sv.id)).map((sv) => ({ profile_id: id, service_id: sv.id }))
      if (rows.length) await supabase.from('employee_services').insert(rows)
    } else {
      await supabase.from('employee_services').delete().eq('profile_id', id)
    }
    await loadData(true)
  }

  async function copyServicesFrom(otherId: string) {
    if (!id) return
    setCopyMenuOpen(false)
    const { data } = await supabase.from('employee_services').select('service_id').eq('profile_id', otherId)
    const have = new Set(employeeServices.map((es) => es.service_id))
    const rows = (data ?? []).filter((r) => !have.has(r.service_id)).map((r) => ({ profile_id: id, service_id: r.service_id }))
    if (rows.length) await supabase.from('employee_services').insert(rows)
    await loadData(true)
  }

  async function toggleService(serviceId: string, checked: boolean) {
    if (!id) return
    if (checked) {
      await supabase.from('employee_services').insert({ profile_id: id, service_id: serviceId })
    } else {
      await supabase.from('employee_services').delete().eq('profile_id', id).eq('service_id', serviceId)
    }
    await loadData(true)
  }

  if (loading) return <p className={styles.empty}>Yükleniyor…</p>
  if (!employee) return <p className={styles.empty}>Ekip üyesi bulunamadı.</p>

  const status: 'aktif' | 'izinli' | 'pasif' = !employee.is_active
    ? 'pasif'
    : timeBlocks.some((b) => b.block_date !== null && b.block_date <= today && today <= (b.end_date ?? b.block_date))
      ? 'izinli'
      : 'aktif'

  const empServiceIds = new Set(employeeServices.map((es) => es.service_id))
  const assignedServices = services.filter((s) => empServiceIds.has(s.id))

  const todayInfo = computeDayInfo(new Date().getDay(), schedules, timeBlocks)

  // Tek bir "performans puanı"na indirgemek yerine ayrı ayrı sayılar
  // gösteriliyor — çalışanlar birbiriyle sıralanmıyor/puanlanmıyor.
  const completedThisMonth = appointments.filter((a) => a.status === 'tamamlandi').length

  const nowMs = Date.now()
  const todaysAppts = appointments
    .filter((a) => toLocalDateString(new Date(a.scheduled_at)) === today && a.status !== 'iptal')
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const nextToday = todaysAppts.find(
    (a) => (a.status === 'bekliyor' || a.status === 'onaylandi') && new Date(a.scheduled_at).getTime() > nowMs,
  )

  const upcomingLeaves = timeBlocks
    .filter((b) => b.day_of_week === null && b.block_date && (b.end_date ?? b.block_date) >= today)
    .sort((a, b) => (a.block_date as string).localeCompare(b.block_date as string))

  const primAmount = monthCollected * (commissionPct / 100)
  const weekDates = (() => {
    const monday = new Date()
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return toLocalDateString(d)
    })
  })()
  const name = employee.full_name ?? '—'
  const timeText = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  const subHeader = (title: string) => (
    <div className={styles.subHead}>
      <button type="button" className={styles.backBtn} onClick={() => setSection('ana')} aria-label="Geri">
        <ChevronRightIcon width={16} height={16} className={styles.backIcon} />
      </button>
      <div className={styles.subHeadText}>
        <span className={styles.subHeadTitle}>{title}</span>
        <span className={styles.subHeadName}>{name}</span>
      </div>
    </div>
  )

  if (section === 'saatler') {
    // Secili gunun randevulari + aradaki bosluklar (tasarim: Calisan-3).
    const dayKey = weekDates[selectedDayIdx]
    const dayInfo = computeDayInfo(new Date(`${dayKey}T00:00:00`).getDay(), schedules, timeBlocks)
    const dayAppts = weekAppts
      .filter((a) => toLocalDateString(new Date(a.scheduled_at)) === dayKey && a.status !== 'iptal')
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const priceOf = (a: WeekAppt) => a.price_override ?? services.find((s) => s.id === a.service_id)?.price ?? 0
    type Slot = { kind: 'appt'; a: WeekAppt } | { kind: 'gap'; start: string; minutes: number }
    const slots: Slot[] = []
    if (dayInfo.enabled) {
      let cursor = timeToMinutes(dayInfo.start)
      const endMin = timeToMinutes(dayInfo.end)
      for (const a of dayAppts) {
        const d = new Date(a.scheduled_at)
        const s = d.getHours() * 60 + d.getMinutes()
        if (s - cursor >= 60) {
          slots.push({ kind: 'gap', start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`, minutes: s - cursor })
        }
        slots.push({ kind: 'appt', a })
        cursor = Math.max(cursor, s + (a.duration_minutes ?? 30))
      }
      if (endMin - cursor >= 60) {
        slots.push({ kind: 'gap', start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`, minutes: endMin - cursor })
      }
    } else {
      for (const a of dayAppts) slots.push({ kind: 'appt', a })
    }
    const gapMinutes = slots.reduce((sum, sl) => sum + (sl.kind === 'gap' ? sl.minutes : 0), 0)
    const expected = dayAppts.reduce((sum, a) => sum + priceOf(a), 0)
    const nowMsDay = Date.now()

    return (
      <div className={styles.wrap}>
        <div className={styles.subHead}>
          <button type="button" className={styles.backBtn} onClick={() => setSection('ana')} aria-label="Geri">
            <ChevronRightIcon width={16} height={16} className={styles.backIcon} />
          </button>
          <span className={styles.subAvatar}>{name.trim().charAt(0).toLocaleUpperCase('tr')}</span>
          <div className={styles.subHeadText}>
            <span className={styles.subHeadTitle}>{name}</span>
            <span className={styles.subHeadName}>
              {dayKey === today ? 'Bugün ' : ''}
              {dayInfo.enabled ? `${dayInfo.start} – ${dayInfo.end}` : 'Çalışmıyor'}
            </span>
          </div>
          <button type="button" className="hdr-link" onClick={() => navigate(`/ekip/${id}/saatler`)}>
            Saatleri düzenle
          </button>
        </div>

        <div className={styles.dateStrip}>
          {weekDates.map((dk, i) => {
            const d = new Date(`${dk}T00:00:00`)
            return (
              <button
                type="button"
                key={dk}
                className={i === selectedDayIdx ? styles.dateCellActive : styles.dateCell}
                onClick={() => setSelectedDayIdx(i)}
              >
                <span className={styles.dateCellDay}>{DAY_SHORT[d.getDay()]}</span>
                <b className={styles.dateCellNum}>{d.getDate()}</b>
              </button>
            )
          })}
        </div>

        {slots.length === 0 ? (
          <div className={styles.offCard}>{dayInfo.enabled ? 'Bu gün randevu yok.' : 'Bu gün çalışmıyor.'}</div>
        ) : (
          <div className={styles.daySlots}>
            {slots.map((sl, i) => {
              if (sl.kind === 'gap') {
                return (
                  <div className={styles.slotRow} key={`gap-${i}`}>
                    <span className={styles.slotTime}>{sl.start}</span>
                    <button
                      type="button"
                      className={styles.slotGap}
                      onClick={() => navigate(`/randevular?tarih=${dayKey}&yeni=1`)}
                    >
                      <span>
                        {sl.minutes >= 60 ? `${Math.floor(sl.minutes / 60)} saat` : ''}
                        {sl.minutes % 60 ? ` ${sl.minutes % 60} dk` : ''} boş
                      </span>
                      <span className={styles.slotGapAction}>+ Randevu</span>
                    </button>
                  </div>
                )
              }
              const a = sl.a
              const st = new Date(a.scheduled_at).getTime()
              const live = (a.status === 'bekliyor' || a.status === 'onaylandi') && st <= nowMsDay && nowMsDay < st + (a.duration_minutes ?? 30) * 60000
              const done = a.status === 'tamamlandi' || a.status === 'gelmedi'
              const svc = services.find((s) => s.id === a.service_id)?.name ?? 'Hizmet'
              return (
                <div className={styles.slotRow} key={a.id}>
                  <span className={live ? `${styles.slotTime} ${styles.slotTimeLive}` : styles.slotTime}>
                    {timeText(a.scheduled_at)}
                  </span>
                  <button
                    type="button"
                    className={live ? `${styles.slotCard} ${styles.slotCardLive}` : done ? `${styles.slotCard} ${styles.slotCardDone}` : styles.slotCard}
                    onClick={() => navigate(`/randevular?tarih=${dayKey}`)}
                  >
                    <span className={styles.slotText}>
                      <span className={styles.slotName}>{weekCustomerNames.get(a.customer_id ?? '') ?? 'Müşteri'}</span>
                      <span className={styles.slotSub}>
                        {svc} · {live ? 'şu an' : done ? (a.status === 'gelmedi' ? 'gelmedi' : 'tamamlandı') : `${a.duration_minutes ?? 30} dk`}
                      </span>
                    </span>
                    {live ? (
                      <span className={styles.slotLivePill}>Devam ediyor</span>
                    ) : (
                      <span className={a.status === 'tamamlandi' ? `${styles.slotPrice} ${styles.slotPriceOk}` : styles.slotPrice}>
                        {currency.format(priceOf(a))}
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className={styles.daySummary}>
          <div className={styles.daySummaryItem}>
            <span className={styles.daySummaryValue}>{dayAppts.length}</span>
            <span className={styles.daySummaryLabel}>randevu</span>
          </div>
          <div className={styles.daySummaryItem}>
            <span className={styles.daySummaryValue}>{currency.format(expected)}</span>
            <span className={styles.daySummaryLabel}>beklenen</span>
          </div>
          <div className={styles.daySummaryItem}>
            <span className={styles.daySummaryValue}>
              {gapMinutes >= 60 ? `${Math.round(gapMinutes / 60)} sa` : `${gapMinutes} dk`}
            </span>
            <span className={styles.daySummaryLabel}>boşluk</span>
          </div>
        </div>
      </div>
    )
  }

  if (section === 'hizmetler') {
    const firstName = name.trim().split(/\s+/)[0]
    return (
      <div className={styles.wrap}>
        <div className={styles.subHead}>
          <button type="button" className={styles.backBtn} onClick={() => setSection('ana')} aria-label="Geri">
            <ChevronRightIcon width={16} height={16} className={styles.backIcon} />
          </button>
          <div className={styles.subHeadText}>
            <span className={styles.subHeadTitle}>{firstName} hangi hizmetleri yapıyor?</span>
            <span className={styles.subHeadName}>Sadece işaretlediklerin için randevu alınır</span>
          </div>
        </div>

        <div className={styles.countBar}>
          <span>
            <b className={styles.countBarNum}>{assignedServices.length}</b> / {services.length} hizmet seçili
          </span>
          {otherEmployees.length > 0 && (
            <div className={styles.copyWrap}>
              <button type="button" className={styles.copyBtn} onClick={() => setCopyMenuOpen((v) => !v)}>
                Başkasından kopyala
              </button>
              {copyMenuOpen && (
                <div className={styles.copyMenu}>
                  {otherEmployees.map((o) => (
                    <button key={o.id} type="button" className={styles.copyMenuItem} onClick={() => copyServicesFrom(o.id)}>
                      {o.full_name ?? '—'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {services.length === 0 ? (
          <p className={styles.empty}>Önce Hizmetler sayfasından hizmet ekleyin.</p>
        ) : (
          <>
            <div className={styles.listHead}>
              <span>Hizmetler</span>
              <button
                type="button"
                className={styles.listHeadLink}
                onClick={() => (assignedServices.length === services.length ? setAllServices(false) : setAllServices(true))}
              >
                {assignedServices.length === services.length ? 'Hiçbirini seçme' : 'Hepsini seç'}
              </button>
            </div>
            <div className={styles.listCard}>
              {services.map((s) => {
                const active = empServiceIds.has(s.id)
                return (
                  <button
                    type="button"
                    key={s.id}
                    className={styles.checkRow}
                    onClick={() => toggleService(s.id, !active)}
                    aria-pressed={active}
                  >
                    <span className={active ? styles.checkBoxOn : styles.checkBox}>{active && <CheckIcon />}</span>
                    <span className={active ? styles.checkLabel : `${styles.checkLabel} ${styles.checkLabelOff}`}>{s.name}</span>
                    <span className={styles.checkMeta}>
                      {s.duration_minutes} dk{s.price != null ? ` · ${currency.format(s.price)}` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  if (section === 'kazanc') {
    const firstName = name.trim().split(/\s+/)[0]
    const nowD = new Date()
    const monthLabel = nowD.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
    const daysInMonth = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate()
    const weeks = [
      { label: '1–7', from: 1, to: 7 },
      { label: '8–14', from: 8, to: 14 },
      { label: '15–21', from: 15, to: 21 },
      { label: `22–${daysInMonth}`, from: 22, to: daysInMonth },
    ].map((w) => ({
      ...w,
      total: myPayments
        .filter((p) => {
          const d = Number(p.paid_at.slice(8, 10))
          return d >= w.from && d <= w.to
        })
        .reduce((sum, p) => sum + p.amount, 0),
      current: nowD.getDate() >= w.from && nowD.getDate() <= w.to,
    }))
    const weekMax = Math.max(1, ...weeks.map((w) => w.total))
    const bySvc = new Map<string, { name: string; count: number; total: number }>()
    for (const p of myPayments) {
      const key = p.service_id ?? 'diger'
      const nm = services.find((s) => s.id === p.service_id)?.name ?? 'Diğer'
      const cur = bySvc.get(key) ?? { name: nm, count: 0, total: 0 }
      cur.count++
      cur.total += p.amount
      bySvc.set(key, cur)
    }
    const svcRows = Array.from(bySvc.values()).sort((a, b) => b.total - a.total)
    const thousands = (n: number) => (n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })

    return (
      <div className={styles.wrap}>
        <div className={styles.subHead}>
          <button type="button" className={styles.backBtn} onClick={() => setSection('ana')} aria-label="Geri">
            <ChevronRightIcon width={16} height={16} className={styles.backIcon} />
          </button>
          <div className={styles.subHeadText}>
            <span className={styles.subHeadTitle}>{firstName} · Kazanç</span>
            <span className={styles.subHeadName}>{monthLabel.charAt(0).toLocaleUpperCase('tr') + monthLabel.slice(1)}</span>
          </div>
        </div>

        <div className={styles.earnHero}>
          <div className={styles.earnTop}>
            <span className={styles.earnMain}>
              <span className={styles.earnLabel}>Getirdiği ciro</span>
              <span className={styles.earnValue}>{currency.format(monthCollected)}</span>
            </span>
            <span className={styles.earnSide}>
              {completedThisMonth} randevu
              <br />
              {completedThisMonth > 0 ? `ort. ${currency.format(monthCollected / completedThisMonth)}` : ''}
            </span>
          </div>
          <div className={styles.earnBox}>
            <span className={styles.earnBoxText}>
              <span className={styles.earnBoxLabel}>Hak ettiği prim · %{commissionPct}</span>
              <span className={styles.earnBoxValue}>{currency.format(primAmount)}</span>
            </span>
          </div>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.chartHead}>
            <span className={styles.chartTitle}>Haftalara göre</span>
            <span className={styles.chartUnit}>₺ bin</span>
          </div>
          <div className={styles.barGrid}>
            {weeks.map((w) => (
              <div className={styles.barCol} key={w.label}>
                <span className={w.current ? `${styles.barValue} ${styles.barValueDim}` : styles.barValue}>{thousands(w.total)}</span>
                <span
                  className={w.current ? `${styles.bar} ${styles.barCurrent}` : styles.bar}
                  style={{ height: `${Math.max(4, (w.total / weekMax) * 70)}px` }}
                />
              </div>
            ))}
          </div>
          <div className={styles.barLabels}>
            {weeks.map((w) => (
              <span key={w.label}>{w.current ? 'bu hafta' : w.label}</span>
            ))}
          </div>
        </div>

        {svcRows.length > 0 && (
          <div className={styles.tableCard}>
            <div className={`${styles.tableRow} ${styles.tableHead}`}>
              <span>Hizmet</span>
              <span className={styles.tRight}>Adet</span>
              <span className={styles.tRight}>Ciro</span>
              <span className={styles.tRight}>Prim</span>
            </div>
            {svcRows.map((r) => (
              <div className={styles.tableRow} key={r.name}>
                <span className={styles.tName}>{r.name}</span>
                <span className={styles.tRight}>{r.count}</span>
                <span className={styles.tRight}>{Math.round(r.total).toLocaleString('tr-TR')}</span>
                <span className={`${styles.tRight} ${styles.tBold}`}>
                  {Math.round((r.total * commissionPct) / 100).toLocaleString('tr-TR')}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className={styles.hint}>Prim oranı tüm ekip için Kasa sayfasından değiştirilir.</p>
      </div>
    )
  }

  if (section === 'erisim') {
    return (
      <div className={styles.wrap}>
        {subHeader('Kişisel bilgiler ve erişim')}
        <div className={styles.formCard}>
          <div className="field">
            <label htmlFor="empName">Ad soyad</label>
            <input id="empName" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Ad soyad" />
          </div>
          <div className="field">
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
          <div className="field">
            <label htmlFor="empGender">Cinsiyet</label>
            <Select
              id="empGender"
              value={genderDraft}
              onChange={(v) => setGenderDraft(v as '' | 'kadin' | 'erkek')}
              options={GENDER_OPTIONS}
            />
          </div>
          {profileError && <p className={styles.error}>{profileError}</p>}
          <button
            type="button"
            className="btn-primary"
            onClick={saveProfileInfo}
            disabled={savingProfile || !nameDraft.trim()}
          >
            {savingProfile ? 'Kaydediliyor…' : 'Bilgileri kaydet'}
          </button>
        </div>

        {employee?.role === 'user' && (
          <div className={styles.permBlock}>
            <span className={styles.formTitle}>Neleri görsün, neye müdahale etsin?</span>
            <PermissionEditor value={permDraft} onChange={setPermDraft} disabled={permSaving} />
            {permMsg && <p className={permMsg.type === 'ok' ? styles.success : styles.error}>{permMsg.text}</p>}
            <button type="button" className="btn-primary" onClick={savePermissions} disabled={permSaving}>
              {permSaving ? 'Kaydediliyor…' : 'Yetkileri kaydet'}
            </button>
          </div>
        )}

        <div className={styles.formCard}>
          <span className={styles.formTitle}>Uygulamaya giriş</span>
          <p className={styles.hint} style={{ textAlign: 'left' }}>
            Değiştirmek istemediğin alanı boş bırak.
          </p>
          <div className="field">
            <label htmlFor="empEmail">Yeni e-posta</label>
            <input
              id="empEmail"
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              placeholder="ayse@ornek.com"
            />
          </div>
          <div className="field">
            <label htmlFor="empPassword">Yeni şifre</label>
            <input
              id="empPassword"
              type="text"
              value={accountPassword}
              onChange={(e) => setAccountPassword(e.target.value)}
              placeholder="en az 6 karakter"
            />
          </div>
          {accountError && <p className={styles.error}>{accountError}</p>}
          {accountSuccess && <p className={styles.success}>{accountSuccess}</p>}
          <button
            type="button"
            className="btn-primary"
            onClick={saveAccountInfo}
            disabled={savingAccount || (!accountEmail.trim() && !accountPassword.trim())}
          >
            {savingAccount ? 'Güncelleniyor…' : 'Giriş bilgilerini güncelle'}
          </button>
        </div>
      </div>
    )
  }

  // Calisma saatleri ozeti: ayni saatli ardisik gunler birlestirilir
  // ("Pzt–Cum 09–18 · Cmt 10–16").
  const hoursSummary = (() => {
    const parts: string[] = []
    let i = 0
    while (i < WEEK_ORDER.length) {
      const info = computeDayInfo(WEEK_ORDER[i], schedules, timeBlocks)
      if (!info.enabled) {
        i++
        continue
      }
      let j = i
      while (j + 1 < WEEK_ORDER.length) {
        const nx = computeDayInfo(WEEK_ORDER[j + 1], schedules, timeBlocks)
        if (!nx.enabled || nx.start !== info.start || nx.end !== info.end) break
        j++
      }
      const hh = (t: string) => (t.endsWith(':00') ? t.slice(0, 2) : t)
      const days = i === j ? DAY_SHORT[WEEK_ORDER[i]] : `${DAY_SHORT[WEEK_ORDER[i]]}–${DAY_SHORT[WEEK_ORDER[j]]}`
      parts.push(`${days} ${hh(info.start)}–${hh(info.end)}`)
      i = j + 1
    }
    return parts.join(' · ')
  })()

  // Bu ay kullanilan izin gunleri (tum gun izinler, resmi tatil haric).
  const thisYear = String(new Date().getFullYear())
  const leaveDaysThisYear = timeBlocks
    .filter((b) => b.day_of_week === null && b.block_date?.startsWith(thisYear) && b.label !== 'Resmi Tatil')
    .reduce((sum, b) => {
      const s = new Date(`${b.block_date}T00:00:00`).getTime()
      const e = new Date(`${b.end_date ?? b.block_date}T00:00:00`).getTime()
      return sum + Math.round((e - s) / 86400000) + 1
    }, 0)
  const nextLeave = upcomingLeaves.find((b) => b.label !== 'Resmi Tatil')

  // Doluluk: bu ayki randevu suresi / bu ayin planli mesaisi (bugune kadar).
  const monthUtil = (() => {
    const now = new Date()
    let planned = 0
    for (let d = 1; d <= now.getDate(); d++) {
      const info = computeDayInfo(new Date(now.getFullYear(), now.getMonth(), d).getDay(), schedules, timeBlocks)
      if (!info.enabled) continue
      let m = timeToMinutes(info.end) - timeToMinutes(info.start)
      for (const b of info.breaks) m -= Math.max(0, timeToMinutes(b.end) - timeToMinutes(b.start))
      planned += Math.max(0, m)
    }
    const booked = appointments
      .filter((a) => a.status !== 'iptal' && new Date(a.scheduled_at) <= now)
      .reduce((sum, a) => sum + (a.duration_minutes ?? 30), 0)
    return planned > 0 ? Math.min(100, Math.round((booked / planned) * 100)) : null
  })()
  const monthName = new Date().toLocaleDateString('tr-TR', { month: 'long' })
  const monthCap = monthName.charAt(0).toLocaleUpperCase('tr') + monthName.slice(1)
  const monthApptCount = appointments.filter((a) => a.status !== 'iptal').length

  const currentAppt = todaysAppts.find((a) => {
    const s = new Date(a.scheduled_at).getTime()
    return (a.status === 'bekliyor' || a.status === 'onaylandi') && s <= nowMs && nowMs < s + (a.duration_minutes ?? 30) * 60000
  })
  const nowTitle =
    status === 'pasif'
      ? 'Hesabı pasif'
      : status === 'izinli'
        ? 'Bugün izinli'
        : !todayInfo.enabled
          ? 'Bugün çalışmıyor'
          : currentAppt
            ? `Şu an ${todayCustomerNames.get(currentAppt.customer_id ?? '') ?? 'bir müşteri'} ile`
            : 'Şu an boşta'
  const nowSub = [
    `Bugün ${todaysAppts.length} randevu`,
    nextToday && nextToday.id !== currentAppt?.id ? `sıradaki ${timeText(nextToday.scheduled_at)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  async function setActive(next: boolean) {
    if (!id) return
    const { error: err } = await supabase.from('profiles').update({ is_active: next }).eq('id', id)
    if (err) {
      window.alert('Değiştirilemedi: ' + err.message)
      return
    }
    await loadData(true)
  }

  async function toggleActive() {
    if (!employee || !id) return
    const next = !employee.is_active
    // Pasife alinirken ileri tarihli randevulari varsa once devretme
    // penceresi acilir (sahipsiz kalmasinlar diye).
    if (!next) {
      const { count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', id)
        .in('status', ['bekliyor', 'onaylandi'])
        .gte('scheduled_at', new Date().toISOString())
      if ((count ?? 0) > 0) {
        setHandoverOpen(true)
        return
      }
    }
    const ok = window.confirm(
      next
        ? `${name} tekrar aktif olsun mu? Uygulamaya girebilir ve randevu alabilir.`
        : `${name} pasife alınsın mı? Uygulamaya giremez ve kendisine yeni randevu verilmez. Geçmiş kayıtları silinmez.`,
    )
    if (!ok) return
    await setActive(next)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.topBlock}>
        <div className={styles.topBar}>
          <button type="button" className={styles.backBtnGray} onClick={() => navigate('/ekip')} aria-label="Ekibe dön">
            <ChevronRightIcon width={16} height={16} className={styles.backIcon} />
          </button>
          {isAdmin && (
            <button type="button" className={styles.editBtn} onClick={() => setSection('erisim')}>
              Düzenle
            </button>
          )}
        </div>
        <div className={styles.hero}>
          <span className={styles.heroAvatar}>{name.trim().charAt(0).toLocaleUpperCase('tr')}</span>
          <span className={styles.heroName}>{name}</span>
          <span className={styles.heroSub}>
            {assignedServices.length > 0 ? assignedServices.slice(0, 2).map((s) => s.name).join(', ') : roleLabel(employee.role)}
            {employee.whatsapp_phone ? ` · ${employee.whatsapp_phone}` : ''}
          </span>
        </div>
        <div className={styles.statStrip}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{monthApptCount}</span>
            <span className={styles.statLabel}>randevu · {monthCap}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{canMoney ? currency.format(monthCollected) : '—'}</span>
            <span className={styles.statLabel}>ciro</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{monthUtil === null ? '—' : `%${monthUtil}`}</span>
            <span className={styles.statLabel}>doluluk</span>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.nowCard}>
          <span className={currentAppt ? styles.nowDot : `${styles.nowDot} ${styles.nowDotIdle}`} />
          <span className={styles.nowText}>
            <span className={styles.nowMain}>{nowTitle}</span>
            <span className={styles.nowSub}>{nowSub}</span>
          </span>
          <button
            type="button"
            className="hdr-link"
            onClick={() => navigate(`/randevular?tarih=${today}`)}
          >
            Takvim ›
          </button>
        </div>

        <div className={styles.listCard}>
          <button type="button" className={styles.navRow} onClick={() => setSection('saatler')}>
            <span className={styles.navText}>
              <span className={styles.navTitle}>Çalışma saatleri</span>
              <span className={styles.navSub}>{hoursSummary || 'Tanımlı değil'}</span>
            </span>
            <span className={styles.navChevron}>›</span>
          </button>
          <button type="button" className={styles.navRow} onClick={() => navigate(`/ekip/${id}/izinler`)}>
            <span className={styles.navText}>
              <span className={styles.navTitle}>İzinler</span>
              <span className={styles.navSub}>
                Bu yıl {leaveDaysThisYear} gün kullandı
                {nextLeave
                  ? ` · ${new Date(`${nextLeave.block_date}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} planlı`
                  : ''}
              </span>
            </span>
            <span className={styles.navChevron}>›</span>
          </button>
          <button type="button" className={styles.navRow} onClick={() => setSection('hizmetler')}>
            <span className={styles.navText}>
              <span className={styles.navTitle}>Yaptığı hizmetler</span>
              <span className={styles.navSub}>
                {services.length} hizmetten {assignedServices.length}’i
              </span>
            </span>
            <span className={styles.navChevron}>›</span>
          </button>
          {canMoney && (
            <button type="button" className={styles.navRow} onClick={() => setSection('kazanc')}>
              <span className={styles.navText}>
                <span className={styles.navTitle}>Kazanç ve prim</span>
                <span className={styles.navSub}>
                  %{commissionPct} prim · {monthCap} {currency.format(primAmount)}
                </span>
              </span>
              <span className={styles.navChevron}>›</span>
            </button>
          )}
          {isAdmin && (
            <button type="button" className={styles.navRow} onClick={() => setSection('erisim')}>
              <span className={styles.navText}>
                <span className={styles.navTitle}>Uygulama erişimi ve yetkiler</span>
                <span className={styles.navSub}>
                  {employee.role === 'admin' ? 'Yönetici · her şeyi görür' : `${permDraft.size} / 8 yetki açık`}
                </span>
              </span>
              <span className={styles.navChevron}>›</span>
            </button>
          )}
        </div>

        {isAdmin && profile?.id !== employee.id && (
          <button type="button" className={styles.deactivateBtn} onClick={toggleActive}>
            {employee.is_active ? 'Çalışanı pasife al' : 'Çalışanı tekrar aktif et'}
          </button>
        )}
      </div>

      {handoverOpen && id && (
        <HandoverAppointments
          employeeId={id}
          employeeName={name}
          onCancel={() => setHandoverOpen(false)}
          onDone={async () => {
            setHandoverOpen(false)
            await setActive(false)
          }}
        />
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}
