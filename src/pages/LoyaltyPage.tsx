import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { friendlyDbError } from '../lib/dbErrors'
import { fetchCards, fetchProgram, redeem, type LoyaltyCard, type LoyaltyProgram } from '../lib/loyalty'
import autoStyles from './AutomationsPage.module.css'
import styles from './LoyaltyPage.module.css'

const YEAR_MS = 365 * 86_400_000

// Sadakat karti ayari (yonetici) + odulu hazir / odule yakin musteriler.
// Damgalar elle basilmaz: tamamlanan randevular sayilir.
export default function LoyaltyPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [program, setProgram] = useState<LoyaltyProgram | null>(null)
  const [cards, setCards] = useState<LoyaltyCard[]>([])
  const [loaded, setLoaded] = useState(false)
  const [visits, setVisits] = useState(5)
  const [reward, setReward] = useState('')
  const [countPast, setCountPast] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const p = await fetchProgram()
    setProgram(p)
    if (p) {
      setVisits(p.visits_required)
      setReward(p.reward)
    }
    setCards(p?.enabled ? await fetchCards().catch(() => []) : [])
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile?.business_id || !reward.trim()) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const row = {
      business_id: profile.business_id,
      enabled: true,
      visits_required: Math.min(50, Math.max(2, visits)),
      reward: reward.trim().slice(0, 120),
    }
    const { error: err } = program
      ? await supabase.from('loyalty_programs').update(row).eq('business_id', profile.business_id)
      : await supabase.from('loyalty_programs').insert({
          ...row,
          counts_from: new Date(Date.now() - (countPast ? YEAR_MS : 0)).toISOString(),
        })
    setSaving(false)
    if (err) {
      setError(friendlyDbError(err, 'Kaydedilemedi.'))
      return
    }
    setNotice(program ? 'Kaydedildi.' : 'Sadakat kartı açıldı.')
    void load()
  }

  async function toggle(enabled: boolean) {
    if (!program || !profile?.business_id) return
    setProgram({ ...program, enabled })
    const { error: err } = await supabase
      .from('loyalty_programs')
      .update({ enabled })
      .eq('business_id', profile.business_id)
    if (err) setError(friendlyDbError(err, 'Kaydedilemedi.'))
    void load()
  }

  async function use(card: LoyaltyCard) {
    if (!program || !window.confirm(`${card.full_name}: “${program.reward}” şimdi kullandırılsın mı?`)) return
    setBusyId(card.customer_id)
    const err = await redeem(card.customer_id)
    setBusyId(null)
    if (err) setError(err)
    else setNotice(`${card.full_name} ödülünü kullandı.`)
    void load()
  }

  const ready = cards.filter((c) => c.available > 0).sort((a, b) => b.available - a.available)
  const close = program
    ? cards
        .filter((c) => c.available === 0 && c.progress === program.visits_required - 1)
        .sort((a, b) => (b.last_visit ?? '').localeCompare(a.last_visit ?? ''))
    : []

  const fmtDay = (d: string | null) =>
    d ? new Date(`${d}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : ''

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Sadakat kartı"
        sub={
          program?.enabled
            ? `Her ${program.visits_required} ziyarette: ${program.reward}`
            : 'Düzenli gelen müşteriyi ödüllendir'
        }
      />
      {error && <p className={autoStyles.error}>{error}</p>}
      {notice && <p className={autoStyles.ok}>{notice}</p>}

      {loaded && (
        <section className={program?.enabled ? `${autoStyles.card} ${autoStyles.cardOn}` : autoStyles.card}>
          <div className={autoStyles.cardHead}>
            <h2 className={autoStyles.cardTitle}>Kart ayarı</h2>
            {program && (
              <label className={autoStyles.switch}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={program.enabled}
                  onChange={(e) => toggle(e.target.checked)}
                  aria-label={`Sadakat kartı ${program.enabled ? 'açık' : 'kapalı'}`}
                />
                <span className={autoStyles.track} aria-hidden="true" />
              </label>
            )}
          </div>
          <p className={autoStyles.desc}>
            Her tamamlanan ziyarette karta bir damga düşer; kart dolunca ödül kullandırılır.
          </p>
          <form className={styles.form} onSubmit={save}>
            <label className={styles.field}>
              <span>Kaç ziyarette bir</span>
              <input
                type="number"
                min={2}
                max={50}
                value={visits}
                onChange={(e) => setVisits(Number(e.target.value) || 2)}
                aria-label="Kaç ziyarette bir ödül"
              />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Ödül</span>
              <input
                value={reward}
                maxLength={120}
                onChange={(e) => setReward(e.target.value)}
                placeholder="ör. Ücretsiz fön ya da %20 indirim"
                aria-label="Ödül"
                required
              />
            </label>
            {!program && (
              <fieldset className={styles.choice}>
                <legend>Eski ziyaretler</legend>
                <label>
                  <input type="radio" checked={countPast} onChange={() => setCountPast(true)} /> Son 12 ay da sayılsın
                </label>
                <label>
                  <input type="radio" checked={!countPast} onChange={() => setCountPast(false)} /> Bugünden başlasın
                </label>
              </fieldset>
            )}
            <button type="submit" className="btn-primary" disabled={saving || !reward.trim()}>
              {saving ? 'Kaydediliyor…' : program ? 'Kaydet' : 'Kartı aç'}
            </button>
          </form>
        </section>
      )}

      {program?.enabled && (
        <div className={styles.lists}>
          <section className={styles.list} aria-labelledby="readyTitle">
            <h2 id="readyTitle" className={styles.listTitle}>
              Ödülü hazır <span>{ready.length}</span>
            </h2>
            {ready.length === 0 ? (
              <p className={styles.muted}>Şu an kartı dolan müşteri yok.</p>
            ) : (
              ready.map((c) => (
                <div key={c.customer_id} className={styles.item}>
                  <button
                    type="button"
                    className={styles.name}
                    onClick={() => navigate(`/musteriler/${c.customer_id}`)}
                  >
                    {c.full_name}
                  </button>
                  <span className={styles.meta}>
                    {c.available > 1 ? `${c.available} ödül · ` : ''}son ziyaret {fmtDay(c.last_visit)}
                  </span>
                  <button
                    type="button"
                    className={styles.useBtn}
                    disabled={busyId === c.customer_id}
                    onClick={() => use(c)}
                  >
                    Kullandır
                  </button>
                </div>
              ))
            )}
          </section>
          <section className={styles.list} aria-labelledby="closeTitle">
            <h2 id="closeTitle" className={styles.listTitle}>
              Ödüle bir ziyaret kaldı <span>{close.length}</span>
            </h2>
            {close.length === 0 ? (
              <p className={styles.muted}>Kimse ödülün bir adım gerisinde değil.</p>
            ) : (
              close.map((c) => (
                <div key={c.customer_id} className={styles.item}>
                  <button
                    type="button"
                    className={styles.name}
                    onClick={() => navigate(`/musteriler/${c.customer_id}`)}
                  >
                    {c.full_name}
                  </button>
                  <span className={styles.meta}>son ziyaret {fmtDay(c.last_visit)}</span>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  )
}
