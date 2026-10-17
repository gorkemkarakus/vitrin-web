import { phoneLengthError } from '../lib/phone'
import { friendlyDbError } from '../lib/dbErrors'
import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPersonName } from '../lib/formatName'
import { CloseIcon } from './icons'
import styles from './QuickAddCustomerModal.module.css'
import { FIELD_LIMITS } from '../lib/fieldLimits'
import ConsentToggle from './ConsentToggle'

interface QuickAddCustomerModalProps {
  onClose: () => void
  onCreated?: (customer: { id: string; full_name: string }) => void
}

export default function QuickAddCustomerModal({ onClose, onCreated }: QuickAddCustomerModalProps) {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !profile?.business_id) return
    if (phoneLengthError(phone)) return
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('customers')
      .insert({
        business_id: profile.business_id,
        full_name: formatPersonName(name),
        phone: phone.trim() || null,
        ...(consent ? { marketing_consent: true, marketing_consent_source: 'manual' } : {}),
      })
      .select('id, full_name')
      .single()
    setSubmitting(false)
    if (err || !data) {
      const isDupPhone = err?.code === '23505' && err.message.includes('phone')
      setError(
        isDupPhone
          ? 'Bu telefon numarası zaten başka bir müşteriye kayıtlı.'
          : friendlyDbError(err, 'Müşteri oluşturulamadı.'),
      )
      return
    }
    onCreated?.(data)
    onClose()
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={`card ${styles.card}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2>Yeni müşteri</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Kapat">
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="quickCustomerName">Ad Soyad</label>
            <input
              maxLength={FIELD_LIMITS.customersFullName}
              id="quickCustomerName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ayşe Yılmaz"
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="quickCustomerPhone">Telefon (opsiyonel)</label>
            <input
              maxLength={FIELD_LIMITS.customersContactPhone}
              id="quickCustomerPhone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="05xx xxx xx xx"
              aria-invalid={!!phoneLengthError(phone)}
              style={phoneLengthError(phone) ? { borderColor: 'var(--danger-text)' } : undefined}
            />
            {phoneLengthError(phone) && (
              <span role="alert" className="field-error">
                {phoneLengthError(phone)}
              </span>
            )}
          </div>
          <ConsentToggle checked={consent} onChange={setConsent} />
          <button type="submit" className="btn-primary" disabled={submitting || !!phoneLengthError(phone)}>
            {submitting ? 'Ekleniyor…' : 'Müşteri Ekle'}
          </button>
        </form>
      </div>
    </div>
  )
}
