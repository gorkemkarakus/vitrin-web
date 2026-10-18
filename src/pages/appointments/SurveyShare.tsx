import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { createSurvey, surveyMessage, surveyUrl, whatsappUrl } from '../../lib/surveys'
import styles from './SurveyShare.module.css'

// Tamamlanan randevunun detayinda: "Memnuniyet sorusu gonder". Baglanti ilk
// tiklamada olusur (gonderilmeyen randevular istatistigi sisirmesin), sonra
// WhatsApp'ta hazir mesajla acilir ya da kopyalanir.
export default function SurveyShare({
  appointmentId,
  customerName,
  phone,
}: {
  appointmentId: string
  customerName: string
  phone: string | null
}) {
  const { profile } = useAuth()
  const [status, setStatus] = useState<{ rating: number | null; sent: boolean } | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [link, setLink] = useState<{ url: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('surveys')
      .select('rating')
      .eq('appointment_id', appointmentId)
      .maybeSingle()
      .then(({ data }) =>
        setStatus(data ? { rating: data.rating as number | null, sent: true } : { rating: null, sent: false }),
      )
    if (profile?.business_id)
      supabase
        .from('businesses')
        .select('name')
        .eq('id', profile.business_id)
        .maybeSingle()
        .then(({ data }) => setBusinessName((data?.name as string | undefined) ?? ''))
  }, [appointmentId, profile?.business_id])

  async function prepare() {
    setBusy(true)
    setNote(null)
    try {
      const token = await createSurvey(appointmentId)
      const url = surveyUrl(token)
      if (!url) {
        setNote('Site adresi ayarlanmadığı için bağlantı oluşturulamadı.')
        return
      }
      const firstName = customerName.trim().split(/\s+/)[0] || null
      setLink({ url, text: surveyMessage({ firstName, businessName: businessName || 'Salonumuz', url }) })
      setStatus((s) => ({ rating: s?.rating ?? null, sent: true }))
    } catch {
      setNote('Bağlantı oluşturulamadı.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.text)
      setNote('Mesaj kopyalandı.')
    } catch {
      setNote(link.url)
    }
  }

  if (!status) return null

  if (status.rating != null) {
    return (
      <div className={styles.box}>
        <span className={styles.title}>Memnuniyet</span>
        <span className={status.rating >= 4 ? styles.good : status.rating <= 2 ? styles.bad : styles.mid}>
          {status.rating}/5
        </span>
      </div>
    )
  }

  return (
    <div className={styles.box}>
      <span className={styles.title}>
        Memnuniyet sorusu
        <span className={styles.sub}>{status.sent ? 'Gönderildi, yanıt bekleniyor' : 'Müşteri 1-5 puan verir'}</span>
      </span>
      {link ? (
        <span className={styles.actions}>
          {phone && (
            <a
              className={styles.primary}
              href={whatsappUrl(phone, link.text)}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp’ta gönder
            </a>
          )}
          <button type="button" className={styles.secondary} onClick={copy}>
            Kopyala
          </button>
        </span>
      ) : (
        <button type="button" className={styles.primary} disabled={busy} onClick={prepare}>
          {busy ? 'Hazırlanıyor…' : status.sent ? 'Tekrar gönder' : 'Gönder'}
        </button>
      )}
      {note && <span className={styles.note}>{note}</span>}
    </div>
  )
}
