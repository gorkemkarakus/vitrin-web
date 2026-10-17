import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { NETWORK_ERROR } from '../../lib/messages'
import { friendlyDbError } from '../../lib/dbErrors'
import { toLocalDateString } from '../../lib/date'
import { FIELD_LIMITS } from '../../lib/fieldLimits'
import Select from '../../components/Select'
import styles from '../AppointmentsPage.module.css'
import { SLOT_MINUTES, type Appointment, type Profile, type Service } from './types'

interface Props {
  appointment: Appointment
  customerName: string
  // Musterinin su anki iletisim telefonu (degistiyse musteri kaydi da guncellenir).
  customerPhone: string | null
  services: Service[]
  profiles: Profile[]
  isEmployeeAvailable: (employeeId: string, start: Date, durationMinutes: number, excludeApptId?: string) => boolean
  isDayOpenForCandidates: (dateStr: string, candidateIds: string[]) => boolean
  buildTimeOptions: (
    dateStr: string,
    candidateIds: string[],
    durationMinutes: number,
    excludeApptId?: string,
  ) => { value: string; label: string; disabled?: boolean }[]
  onClose: () => void
  // Kaydedildi; `warning` doluysa randevu guncellendi ama ek bir adim basarisiz.
  onSaved: (warning?: string) => void
}

function initialTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function EditAppointmentModal({
  appointment: a,
  customerName,
  customerPhone,
  services,
  profiles,
  isEmployeeAvailable,
  isDayOpenForCandidates,
  buildTimeOptions,
  onClose,
  onSaved,
}: Props) {
  const [serviceId, setServiceId] = useState(a.service_id ?? '')
  const [employeeId, setEmployeeId] = useState(a.employee_id ?? '')
  const [date, setDate] = useState(toLocalDateString(new Date(a.scheduled_at)))
  const [time, setTime] = useState(initialTime(a.scheduled_at))
  const [note, setNote] = useState(a.source_note ?? '')
  const [phone, setPhone] = useState(customerPhone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidateIds = employeeId ? [employeeId] : profiles.map((p) => p.id)

  async function submit() {
    setError(null)
    if (!serviceId || !date || !time) {
      setError('Hizmet ve tarih/saat zorunlu.')
      return
    }

    const svc = services.find((s) => s.id === serviceId)
    const start = new Date(`${date}T${time}`)
    const duration = svc?.duration_minutes ?? SLOT_MINUTES

    if (employeeId && !isEmployeeAvailable(employeeId, start, duration, a.id)) {
      setError('Seçilen çalışan bu saatte müsait değil (mesai dışı, izinli veya dolu).')
      return
    }

    // Saat degistiyse eski saat icin gonderilmis hatirlatma isareti
    // sifirlanir — yoksa process-appointment-reminders yeni saat icin bir daha
    // hatirlatma gondermez (reschedule-appointment edge function'i da ayni
    // sekilde sifirliyor).
    const timeChanged = new Date(a.scheduled_at).getTime() !== start.getTime()

    setBusy(true)
    try {
      const { error: apptErr } = await supabase
        .from('appointments')
        .update({
          service_id: serviceId,
          employee_id: employeeId || null,
          scheduled_at: start.toISOString(),
          duration_minutes: duration,
          source_note: note.trim() || null,
          ...(timeChanged ? { reminder_sent_at: null } : {}),
        })
        .eq('id', a.id)
      if (apptErr) {
        const isOverlap = /exclusion|conflicting key|deadlock/i.test(apptErr.message)
        // Calisan kendisine atanmis (kendi acmadigi) randevuyu baskasina
        // devredemez; politika bunu reddeder.
        const isRls = /row-level security/i.test(apptErr.message)
        setError(
          isOverlap
            ? 'Seçilen saat az önce başka bir randevuyla dolmuş. Farklı bir saat seçin.'
            : isRls
              ? 'Bu randevuyu başka bir çalışana yalnızca yönetici aktarabilir.'
              : friendlyDbError(apptErr, 'Randevu güncellenemedi, tekrar deneyin.'),
        )
        return
      }

      const trimmedPhone = phone.trim()
      if (a.customer_id && trimmedPhone !== (customerPhone ?? '')) {
        const { error: custErr } = await supabase
          .from('customers')
          .update({ contact_phone: trimmedPhone || null })
          .eq('id', a.customer_id)
        if (custErr) {
          // Randevu zaten guncellendi — telefon hatasi ayri banner'da gosterilip
          // modal kapatilir, "hicbir sey olmamis gibi" hissettirmez.
          onSaved(
            'Randevu güncellendi ama telefon numarası kaydedilemedi. ' + friendlyDbError(custErr, 'Tekrar deneyin.'),
          )
          return
        }
      }

      onSaved()
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Randevuyu Düzenle</h2>
          <button type="button" className={styles.bannerClose} onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {error && (
          <div className={`${styles.banner} ${styles.bannerError} ${styles.bannerSpaced}`}>
            <span>{error}</span>
            <button type="button" className={styles.bannerClose} onClick={() => setError(null)} aria-label="Kapat">
              ✕
            </button>
          </div>
        )}

        <p className={styles.editCustomerName}>{customerName}</p>

        <div className={styles.form}>
          <div className="field">
            <label htmlFor="editService">Hizmet</label>
            <Select
              id="editService"
              value={serviceId}
              onChange={setServiceId}
              options={services.map((s) => ({ value: s.id, label: s.name, sub: `${s.duration_minutes} dk` }))}
            />
          </div>

          <div className="field">
            <label htmlFor="editEmployee">Çalışan</label>
            <Select
              id="editEmployee"
              value={employeeId}
              onChange={setEmployeeId}
              options={[
                { value: '', label: 'Farketmez' },
                ...profiles.map((p) => ({ value: p.id, label: p.full_name ?? '—' })),
              ]}
            />
          </div>

          <div className="field">
            <label htmlFor="editDate">Tarih</label>
            <input
              id="editDate"
              type="date"
              value={date}
              onChange={(e) => {
                const newDate = e.target.value
                if (newDate && !isDayOpenForCandidates(newDate, candidateIds)) {
                  setError(
                    employeeId ? 'Seçilen çalışan bu gün çalışmıyor.' : 'İşletme bu gün kapalı, uygun çalışan yok.',
                  )
                  return
                }
                setError(null)
                setDate(newDate)
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="editTime">Saat</label>
            <Select
              id="editTime"
              value={time}
              onChange={setTime}
              options={buildTimeOptions(
                date,
                candidateIds,
                services.find((s) => s.id === serviceId)?.duration_minutes ?? SLOT_MINUTES,
                a.id,
              )}
            />
          </div>

          {a.customer_id && (
            <div className="field">
              <label htmlFor="editPhone">Müşteri Telefonu</label>
              <input
                maxLength={FIELD_LIMITS.customersContactPhone}
                id="editPhone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="05xx xxx xx xx"
              />
            </div>
          )}

          <div className="field field-full">
            <label htmlFor="editNote">Not (opsiyonel)</label>
            <input
              maxLength={FIELD_LIMITS.appointmentsNotes}
              id="editNote"
              placeholder="ör. kampanya adı"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className={styles.formActions}>
            <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
