import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { RATING_LABELS, fetchSurveyInfo, submitSurvey, type SurveyInfo } from '../lib/surveys'
import styles from './SurveyPage.module.css'

type Done = { googleReviewUrl: string | null; rating: number }

// Musterinin acitigi tek kullanimlik anket sayfasi (giris gerektirmez).
export default function SurveyPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [info, setInfo] = useState<SurveyInfo | null | undefined>(undefined)
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)

  useEffect(() => {
    fetchSurveyInfo(token)
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [token])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!rating) return
    setSending(true)
    setError(null)
    try {
      const res = await submitSurvey(token, rating, comment)
      if (!res.ok) {
        setError('Bu anket daha önce yanıtlanmış ya da süresi dolmuş.')
        return
      }
      setDone({ googleReviewUrl: res.googleReviewUrl, rating })
    } catch {
      setError('Gönderilemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.')
    } finally {
      setSending(false)
    }
  }

  const date = info?.visit_date
    ? new Date(`${info.visit_date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
    : ''

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        {info === undefined && <p className={styles.muted}>Yükleniyor…</p>}

        {info === null && (
          <div className={styles.center}>
            <h1 className={styles.title}>Anket bulunamadı</h1>
            <p className={styles.muted}>Bağlantı hatalı ya da kaldırılmış olabilir.</p>
          </div>
        )}

        {info && done && (
          <div className={styles.center}>
            <span className={styles.bigMark} aria-hidden="true">
              {done.rating >= 4 ? '♥' : '✓'}
            </span>
            <h1 className={styles.title}>Teşekkürler!</h1>
            {done.rating >= 4 ? (
              <p className={styles.lead}>Yeniden görüşmek üzere. {info.business_name} ekibi sizi bekliyor.</p>
            ) : (
              <p className={styles.lead}>
                Görüşünüz {info.business_name} yöneticisine iletildi. Sizi arayıp neyi daha iyi yapabileceğimizi
                konuşmak istiyoruz.
              </p>
            )}
            {done.googleReviewUrl && (
              <a className={styles.google} href={done.googleReviewUrl} target="_blank" rel="noopener noreferrer">
                Google’da yorum bırak
              </a>
            )}
            {done.googleReviewUrl && (
              <p className={styles.small}>Yorumunuz, bizi arayan yeni müşterilere çok yardımcı oluyor.</p>
            )}
          </div>
        )}

        {info && !done && info.state !== 'acik' && (
          <div className={styles.center}>
            <h1 className={styles.title}>
              {info.state === 'yanitlandi' ? 'Bu anket yanıtlandı' : 'Anketin süresi doldu'}
            </h1>
            <p className={styles.muted}>
              {info.state === 'yanitlandi'
                ? 'Görüşünüz için teşekkür ederiz.'
                : `${info.business_name} ile doğrudan iletişime geçebilirsiniz.`}
            </p>
          </div>
        )}

        {info && !done && info.state === 'acik' && (
          <form onSubmit={send} className={styles.form}>
            <span className={styles.brand}>{info.business_name}</span>
            <h1 className={styles.title}>
              {info.first_name ? `${info.first_name}, ` : ''}
              {date} tarihindeki {info.service_name ? info.service_name.toLocaleLowerCase('tr') : 'randevunuz'} nasıldı?
            </h1>

            <div className={styles.scale} role="radiogroup" aria-label="Puanınız">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} — ${RATING_LABELS[n]}`}
                  className={rating === n ? `${styles.point} ${styles.pointOn}` : styles.point}
                  data-tone={n <= 2 ? 'low' : n === 3 ? 'mid' : 'high'}
                  onClick={() => setRating(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className={styles.scaleEnds} aria-hidden="true">
              <span>Hiç memnun değilim</span>
              <span>Çok memnunum</span>
            </div>
            <p className={styles.choice} aria-live="polite">
              {rating ? RATING_LABELS[rating] : ' '}
            </p>

            <label className={styles.label} htmlFor="surveyComment">
              {rating && rating <= 3
                ? 'Neyi daha iyi yapabilirdik?'
                : 'Eklemek istediğiniz bir şey var mı? (isteğe bağlı)'}
            </label>
            <textarea
              id="surveyComment"
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={styles.textarea}
            />
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.submit} disabled={!rating || sending}>
              {sending ? 'Gönderiliyor…' : 'Gönder'}
            </button>
            <p className={styles.small}>Yanıtınız yalnızca {info.business_name} ile paylaşılır.</p>
          </form>
        )}
      </main>
      <span className={styles.footer}>Adapptiv</span>
    </div>
  )
}
