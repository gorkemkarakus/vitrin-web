import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { NETWORK_ERROR } from '../../lib/messages'
import { useAuth } from '../../contexts/AuthContext'
import { formatPersonName } from '../../lib/formatName'
import { currency } from '../../lib/currency'
import { toLocalDateString, todayLocalDateString, DAY_SHORT } from '../../lib/date'
import PickerSheet from '../../components/PickerSheet'
import styles from '../AppointmentsPage.module.css'
import { rankEligibleByFairness } from '../../lib/fairness'
import {
  SLOT_MINUTES,
  type Appointment,
  type Customer,
  type EmployeeServiceRow,
  type Profile,
  type Schedule,
  type Service,
} from './types'
import { FIELD_LIMITS } from '../../lib/fieldLimits'

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

// "Yeni randevu" alt penceresi: musteri, hizmet, calisan, gun/saat, ucret,
// kaynak ve not. Durumu kendisi tasir; kapaliyken de bagli kalir ki "Vazgec"
// ile kapatilan taslak tekrar acilinca dursun (yalnizca basarili kayit temizler).
interface Props {
  open: boolean
  setShowForm: (open: boolean) => void
  appointments: Appointment[]
  customers: Customer[]
  services: Service[]
  profiles: Profile[]
  employeeServices: EmployeeServiceRow[]
  schedules: Schedule[]
  employeeName: (id: string | null) => string
  isEmployeeAvailable: (employeeId: string, start: Date, durationMinutes: number, excludeApptId?: string) => boolean
  isDayOpenForCandidates: (dateStr: string, candidateIds: string[]) => boolean
  buildTimeOptions: (
    dateStr: string,
    candidateIds: string[],
    durationMinutes: number,
    excludeApptId?: string,
  ) => { value: string; label: string; disabled?: boolean }[]
  // Sayfanin hata/basari bandi (form icinde de gosterilir).
  error: string | null
  setError: (message: string | null) => void
  setSuccess: (message: string | null) => void
  loadData: (silent?: boolean) => Promise<void>
  // Genis ekran takviminde bos saate tiklaninca: o gun, saat ve calisanla acilir.
  // key her tiklamada degisir (ayni saate tekrar tiklama da uygulansin).
  prefill?: { date: string; time: string; employeeId: string | null; key: number } | null
}

export default function NewAppointmentForm({
  open,
  setShowForm,
  appointments,
  customers,
  services,
  profiles,
  employeeServices,
  schedules,
  employeeName,
  isEmployeeAvailable,
  isDayOpenForCandidates,
  buildTimeOptions,
  error,
  setError,
  setSuccess,
  loadData,
  prefill,
}: Props) {
  const { profile, can } = useAuth()
  const navigate = useNavigate()
  const canSeeAll = can('randevu_tumu_gor')
  const showForm = open
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerListOpen, setCustomerListOpen] = useState(false)
  const [showAllServices, setShowAllServices] = useState(false)
  // Form uzun; kayit hatasi en ustte kalip gorunmeyebilir, hataya kaydirilir.
  const formErrorRef = useRef<HTMLDivElement>(null)
  const [formWeekOffset, setFormWeekOffset] = useState(0)
  const [noteOpen, setNoteOpen] = useState(false)
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const otherDateRef = useRef<HTMLInputElement>(null)

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
  // Takvimden acildiysa hizmet secimi saati/calisani sifirlamaz.
  const [fromSlot, setFromSlot] = useState(false)
  useEffect(() => {
    if (!prefill) return
    setApptDate(prefill.date)
    const days = Math.round(
      (new Date(`${prefill.date}T00:00:00`).getTime() - new Date(`${todayLocalDateString()}T00:00:00`).getTime()) /
        86_400_000,
    )
    setFormWeekOffset(Math.max(0, Math.floor(days / 6)))
    setEmployeeId(prefill.employeeId ?? '')
    setApptTime(prefill.time)
    setFromSlot(true)
  }, [prefill])
  const [source, setSource] = useState(SOURCE_OPTIONS[0].value)
  const [sourceNote, setSourceNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (error) formErrorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [error])

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

  if (!showForm) return null

  return (
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
              value={useNewCustomer ? newCustomerName : selectedCustomer ? selectedCustomer.full_name : customerQuery}
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
              <span className={styles.custPhone}>{selectedCustomer.contact_phone || selectedCustomer.phone || ''}</span>
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
          {formServices.length === 0 &&
            (canSeeAll ? (
              // Hizmet yokken saat de secilemiyor: kullanici formda takili kalmasin.
              <div className={styles.formNoteRow}>
                <p className={styles.formNote}>Randevu için önce hizmetlerini eklemen gerekiyor.</p>
                <button type="button" className={styles.formNoteBtn} onClick={() => navigate('/hizmetler?hazir=1')}>
                  Hizmet ekle
                </button>
              </div>
            ) : (
              <p className={styles.formNote}>Sana atanmış hizmet yok. Yöneticin Ekip sayfasından ekleyebilir.</p>
            ))}
          <div className={styles.serviceChips}>
            {visibleFormServices.map((s) => (
              <button
                type="button"
                key={s.id}
                className={s.id === serviceId ? styles.serviceChipActive : styles.serviceChip}
                onClick={() => {
                  setServiceId(s.id)
                  if (fromSlot) {
                    // Takvimden secilen saat korunur; calisan bu hizmeti vermiyorsa birakilir.
                    if (
                      employeeId &&
                      !employeeServices.some((es) => es.profile_id === employeeId && es.service_id === s.id)
                    )
                      setEmployeeId('')
                    return
                  }
                  setEmployeeId('')
                  setApptTime('')
                }}
              >
                {s.id === serviceId ? `${s.name} · ${s.duration_minutes} dk` : s.name}
              </button>
            ))}
            {formServices.length > FORM_SERVICE_LIMIT && (
              <button type="button" className={styles.serviceChipMore} onClick={() => setShowAllServices((v) => !v)}>
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
          <span className={styles.infoRowLabel}>Nereden geldi?</span>
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
  )
}
