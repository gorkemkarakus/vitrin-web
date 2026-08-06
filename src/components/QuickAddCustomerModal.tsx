import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPersonName } from '../lib/formatName'
import { CloseIcon } from './icons'
import styles from './QuickAddCustomerModal.module.css'

interface QuickAddCustomerModalProps {
  onClose: () => void
  onCreated?: (customer: { id: string; full_name: string }) => void
}

export default function QuickAddCustomerModal({ onClose, onCreated }: QuickAddCustomerModalProps) {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !profile?.business_id) return
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('customers')
      .insert({
        business_id: profile.business_id,
        full_name: formatPersonName(name),
        phone: phone.trim() || null,
      })
      .select('id, full_name')
      .single()
    setSubmitting(false)
    if (err || !data) {
      const isDupPhone = err?.code === '23505' && err.message.includes('phone')
      setError(
        isDupPhone
          ? 'Bu telefon numarası zaten başka bir müşteriye kayıtlı.'
          : 'Müşteri oluşturulamadı: ' + (err?.message ?? ''),
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
              id="quickCustomerPhone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="05xx xxx xx xx"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Ekleniyor…' : 'Müşteri Ekle'}
          </button>
        </form>
      </div>
    </div>
  )
}
