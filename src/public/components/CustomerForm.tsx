import { useState, type FormEvent } from 'react'
import Avatar from '../../components/Avatar'
import TurnstileWidget from './TurnstileWidget'
import styles from '../PublicBookingPage.module.css'
import { FIELD_LIMITS } from '../../lib/fieldLimits'

function isValidTurkishPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 10 || digits.length === 11 || (digits.length === 12 && digits.startsWith('90'))
}

export default function CustomerForm({
  serviceName,
  employeeName,
  dateLabel,
  timeLabel,
  submitting,
  onSubmit,
}: {
  serviceName: string
  employeeName: string
  dateLabel: string
  timeLabel: string
  submitting: boolean
  onSubmit: (name: string, phone: string, turnstileToken: string) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [touched, setTouched] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')

  const phoneValid = isValidTurkishPhone(phone)
  const canSubmit = name.trim().length > 1 && phoneValid

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!canSubmit) return
    onSubmit(name.trim(), phone.trim(), turnstileToken)
  }

  return (
    <div className={styles.stepBody}>
      <div className={styles.summaryCard}>
        <Avatar name={employeeName} size={36} />
        <div className={styles.summaryCardText}>
          <span className={styles.summaryCardLabel}>Randevu Özeti</span>
          <span className={styles.summaryCardMain}>
            {serviceName} · {employeeName}
          </span>
          <span className={styles.summaryCardSub}>
            {dateLabel} · {timeLabel}
          </span>
        </div>
      </div>

      <form className={styles.customerForm} onSubmit={handleSubmit}>
        <h2 className={styles.formHeading}>İletişim Bilgileri</h2>
        <p className={styles.formSubheading}>Randevu onayı ve hatırlatmalar için bilgilerinizi kontrol edin.</p>

        <div className="field">
          <label htmlFor="pbName">Ad Soyad</label>
          <input
            maxLength={FIELD_LIMITS.customersFullName}
            id="pbName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Selin Yılmaz"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pbPhone">Telefon Numarası</label>
          <input
            maxLength={FIELD_LIMITS.customersContactPhone}
            id="pbPhone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0532 123 45 67"
            required
          />
          {touched && !phoneValid && <span className={styles.fieldError}>Geçerli bir telefon numarası giriniz.</span>}
        </div>

        <p className={styles.kvkkNotice}>
          Verileriniz KVKK kapsamında korunmakta olup sadece randevu işlemleriniz için kullanılacaktır.
        </p>

        <TurnstileWidget onToken={setTurnstileToken} />

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Randevu oluşturuluyor…' : 'Randevuyu Onayla →'}
        </button>
      </form>
    </div>
  )
}
