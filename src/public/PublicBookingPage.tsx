import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ServicePicker from './components/ServicePicker'
import EmployeePicker from './components/EmployeePicker'
import DateStrip from './components/DateStrip'
import SlotGrid from './components/SlotGrid'
import CustomerForm from './components/CustomerForm'
import BookingConfirmation from './components/BookingConfirmation'
import { fetchBookingInfo, submitBooking, type PublicService, type PublicEmployee } from './lib/publicBookingApi'
import { todayLocalDateString } from '../lib/date'
import styles from './PublicBookingPage.module.css'

type Step = 'loading' | 'not_found' | 'service' | 'employee' | 'datetime' | 'details' | 'confirmed'

const STEP_TITLES: Record<Step, string> = {
  loading: '',
  not_found: '',
  service: 'Randevu Al',
  employee: 'Uzman Seçin',
  datetime: 'Tarih & Saat',
  details: 'Bilgileriniz',
  confirmed: 'Adapptiv',
}

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>()
  const [step, setStep] = useState<Step>('loading')
  // Salon online randevuyu Ayarlar'dan kapattiysa (fonksiyon 403 + closed).
  const [bookingClosed, setBookingClosed] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [services, setServices] = useState<PublicService[]>([])
  const [selectedService, setSelectedService] = useState<PublicService | null>(null)
  const [employees, setEmployees] = useState<PublicEmployee[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayLocalDateString())
  const [slots, setSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    fetchBookingInfo(slug)
      .then((info) => {
        if (info.error) {
          setStep('not_found')
          return
        }
        setBusinessName(info.business.name)
        setServices(info.services)
        setStep('service')
      })
      .catch(async (err) => {
        try {
          const body = await err?.context?.json()
          if (body?.closed) setBookingClosed(true)
        } catch {
          // Govde okunamadiysa genel "bulunamadi" mesaji kalir.
        }
        setStep('not_found')
      })
  }, [slug])

  async function loadEmployees(service: PublicService) {
    if (!slug) return
    const info = await fetchBookingInfo(slug, service.id)
    setEmployees(info.employees ?? [])
  }

  async function loadSlots(date: string, service: PublicService, employeeId: string | null) {
    if (!slug) return
    setSlotsLoading(true)
    setSelectedSlot(null)
    try {
      const info = await fetchBookingInfo(slug, service.id, employeeId ?? undefined, date)
      setSlots(info.slots ?? [])
    } finally {
      setSlotsLoading(false)
    }
  }

  function handleSelectService(service: PublicService) {
    setSelectedService(service)
  }

  function handleContinueFromService() {
    if (!selectedService) return
    setSelectedEmployeeId(null)
    loadEmployees(selectedService)
    setStep('employee')
  }

  function handleContinueFromEmployee() {
    if (!selectedService) return
    setStep('datetime')
    loadSlots(selectedDate, selectedService, selectedEmployeeId)
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date)
    if (selectedService) loadSlots(date, selectedService, selectedEmployeeId)
  }

  function handleSelectSlot(slot: string) {
    setSelectedSlot(slot)
    setStep('details')
  }

  const employeeName = selectedEmployeeId
    ? (employees.find((e) => e.id === selectedEmployeeId)?.full_name ?? 'Uzman')
    : 'Fark Etmez'

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  })

  async function handleSubmit(name: string, phone: string, turnstileToken: string, marketingConsent: boolean) {
    if (!slug || !selectedService || !selectedSlot) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const scheduledAt = `${selectedDate}T${selectedSlot}:00+03:00`
      const result = await submitBooking({
        slug,
        service_id: selectedService.id,
        employee_id: selectedEmployeeId ?? undefined,
        scheduled_at: scheduledAt,
        customer_name: name,
        customer_phone: phone,
        turnstile_token: turnstileToken,
        marketing_consent: marketingConsent,
      })
      if (result.status === 'booked' && result.appointment) {
        setConfirmedAt(result.appointment.scheduled_at)
        setStep('confirmed')
      } else if (result.status === 'conflict') {
        setSubmitError('Bu saat az önce dolmuş, lütfen başka bir saat seçin.')
        setStep('datetime')
        loadSlots(selectedDate, selectedService, selectedEmployeeId)
      } else {
        setSubmitError(result.error ?? 'Randevu oluşturulamadı, lütfen tekrar deneyin.')
      }
    } catch {
      setSubmitError('Bağlantı hatası, lütfen tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  function renderHeader() {
    if (step === 'loading' || step === 'not_found') return null
    const backAction =
      step === 'employee'
        ? { label: 'Hizmeti değiştir', onClick: () => setStep('service') }
        : step === 'datetime'
          ? { label: 'Uzmanı değiştir', onClick: () => setStep('employee') }
          : step === 'details'
            ? { label: 'Saati değiştir', onClick: () => setStep('datetime') }
            : null

    return (
      <div className={styles.header}>
        {backAction ? (
          <button type="button" className={styles.headerBack} onClick={backAction.onClick}>
            ←
          </button>
        ) : (
          <span className={styles.headerBack} />
        )}
        <span className={styles.headerTitle}>{step === 'service' ? businessName : STEP_TITLES[step]}</span>
        <span className={styles.headerSpacer} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {renderHeader()}

        {step === 'loading' && <p className={styles.empty}>Yükleniyor…</p>}

        {step === 'not_found' && (
          <div className={styles.notFound}>
            {bookingClosed ? (
              <>
                <h1>Online randevu şu an kapalı</h1>
                <p>
                  Bu salon şu anda internetten randevu almıyor. Randevu için salonu arayabilir ya da mesaj
                  atabilirsiniz.
                </p>
              </>
            ) : (
              <>
                <h1>İşletme bulunamadı</h1>
                <p>Bu randevu linki geçersiz olabilir. Lütfen linki gönderen işletmeyle iletişime geçin.</p>
              </>
            )}
          </div>
        )}

        {step === 'service' && (
          <>
            <ServicePicker
              services={services}
              selectedId={selectedService?.id ?? null}
              onSelect={handleSelectService}
            />
            <div className={styles.continueBar}>
              <span className={styles.continueBarText}>
                {selectedService ? selectedService.name : 'Henüz seçim yapılmadı'}
              </span>
              <button
                type="button"
                className="btn-primary btn-inline"
                disabled={!selectedService}
                onClick={handleContinueFromService}
              >
                Devam Et
              </button>
            </div>
          </>
        )}

        {step === 'employee' && (
          <>
            <EmployeePicker employees={employees} selectedId={selectedEmployeeId} onSelect={setSelectedEmployeeId} />
            <div className={styles.continueBar}>
              <span className={styles.continueBarText}>{employeeName}</span>
              <button type="button" className="btn-primary btn-inline" onClick={handleContinueFromEmployee}>
                Devam Et
              </button>
            </div>
          </>
        )}

        {step === 'datetime' && selectedService && (
          <div className={styles.stepBody}>
            <DateStrip selectedDate={selectedDate} onSelect={handleSelectDate} />
            <SlotGrid slots={slots} loading={slotsLoading} selectedSlot={selectedSlot} onSelect={handleSelectSlot} />
          </div>
        )}

        {step === 'details' && selectedService && selectedSlot && (
          <>
            {submitError && <p className={styles.fieldError}>{submitError}</p>}
            <CustomerForm
              serviceName={selectedService.name}
              employeeName={employeeName}
              dateLabel={dateLabel}
              timeLabel={selectedSlot}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
          </>
        )}

        {step === 'confirmed' && selectedService && confirmedAt && (
          <BookingConfirmation
            businessName={businessName}
            serviceName={selectedService.name}
            employeeName={employeeName}
            scheduledAt={confirmedAt}
            durationMinutes={selectedService.duration_minutes}
            price={selectedService.price}
          />
        )}
      </div>
    </div>
  )
}
