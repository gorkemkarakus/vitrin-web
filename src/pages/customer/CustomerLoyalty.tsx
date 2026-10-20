import { useCallback, useEffect, useState } from 'react'
import {
  cardSummary,
  fetchCards,
  fetchProgram,
  filledStamps,
  redeem,
  type LoyaltyCard,
  type LoyaltyProgram,
} from '../../lib/loyalty'
import styles from './Crm.module.css'

// Musteri kartindaki sadakat karti: damgalar + "Odulu kullandir".
// Program kapaliysa hic gorunmez.
export default function CustomerLoyalty({ customerId }: { customerId: string }) {
  const [program, setProgram] = useState<LoyaltyProgram | null>(null)
  const [card, setCard] = useState<LoyaltyCard | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const p = await fetchProgram()
    setProgram(p)
    if (p?.enabled) {
      const cards = await fetchCards(customerId).catch(() => [])
      setCard(cards[0] ?? null)
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  if (!program?.enabled) return null

  const filled = filledStamps(card, program.visits_required)
  const ready = (card?.available ?? 0) > 0

  async function use() {
    if (!window.confirm(`“${program!.reward}” şimdi kullandırılsın mı?`)) return
    setBusy(true)
    setMessage(null)
    const err = await redeem(customerId)
    setBusy(false)
    setMessage(err ? { ok: false, text: err } : { ok: true, text: 'Ödül kullanıldı.' })
    void load()
  }

  return (
    <section className={styles.card} aria-labelledby="loyaltyTitle">
      <div className={styles.cardHead}>
        <h2 id="loyaltyTitle" className={styles.cardTitle}>
          Sadakat kartı
        </h2>
      </div>
      <div
        className={styles.stamps}
        role="img"
        aria-label={`${program.visits_required} ziyaretin ${filled} tanesi tamamlandı`}
      >
        {Array.from({ length: program.visits_required }, (_, i) => (
          <span key={i} className={i < filled ? `${styles.stamp} ${styles.stampOn}` : styles.stamp} />
        ))}
      </div>
      <p className={ready ? `${styles.loyaltyText} ${styles.loyaltyReady}` : styles.loyaltyText}>
        {cardSummary(card, program)}
      </p>
      {ready && (
        <button type="button" className="btn-secondary" disabled={busy} onClick={use}>
          {busy ? 'Kaydediliyor…' : 'Ödülü kullandır'}
        </button>
      )}
      {message && <p className={message.ok ? styles.loyaltyOk : styles.loyaltyErr}>{message.text}</p>}
    </section>
  )
}
