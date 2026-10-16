import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import PageHeader from './PageHeader'
import { dismissDuplicateGroup, type DupGroup } from '../lib/duplicateCustomers'
import styles from './DuplicateCustomers.module.css'

interface Props {
  groups: DupGroup[]
  apptCount: Map<string, number>
  onClose: () => void
  onChanged: () => void
}

export default function DuplicateCustomers({ groups, apptCount, onClose, onChanged }: Props) {
  // Grup basina korunacak kayit: varsayilan en cok randevusu olan (esitse en eski).
  const defaults = useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups) {
      const best = [...g.members].sort(
        (a, b) => (apptCount.get(b.id) ?? 0) - (apptCount.get(a.id) ?? 0) || a.created_at.localeCompare(b.created_at),
      )[0]
      m.set(g.key, best.id)
    }
    return m
  }, [groups, apptCount])
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({})
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  async function merge(g: DupGroup) {
    const keepId = keepByGroup[g.key] ?? defaults.get(g.key)
    if (!keepId) return
    const keep = g.members.find((m) => m.id === keepId)
    const drops = g.members.filter((m) => m.id !== keepId)
    const ok = window.confirm(
      `${drops.length} kayıt “${keep?.full_name}” kaydına taşınıp silinecek. Randevular, ödemeler ve paketler korunur.\n\nBu işlem geri alınamaz.`,
    )
    if (!ok) return
    setBusyKey(g.key)
    setError(null)
    for (const d of drops) {
      const { error: err } = await supabase.rpc('merge_customers', { p_keep: keepId, p_drop: d.id })
      if (err) {
        const missing = /could not find|does not exist/i.test(err.message)
        setError(missing ? 'Bu özellik için veritabanı güncellemesi bekleniyor.' : `Birleştirilemedi: ${err.message}`)
        setBusyKey(null)
        onChanged()
        return
      }
    }
    setBusyKey(null)
    setHidden((h) => new Set(h).add(g.key))
    onChanged()
  }

  function dismiss(g: DupGroup) {
    dismissDuplicateGroup(g.key)
    setHidden((h) => new Set(h).add(g.key))
  }

  const shown = groups.filter((g) => !hidden.has(g.key))

  return (
    <div className={styles.wrap}>
      <PageHeader back={onClose} title="Mükerrer kayıtlar" sub="Aynı kişi birden fazla kaydedilmiş olabilir" />
      {error && <p className={styles.error}>{error}</p>}
      {shown.length === 0 ? (
        <div className={styles.emptyCard}>
          <span className={styles.emptyTitle}>Temiz</span>
          <span className={styles.hint}>Birleştirilecek kayıt kalmadı.</span>
        </div>
      ) : (
        shown.map((g) => {
          const keepId = keepByGroup[g.key] ?? defaults.get(g.key)
          return (
            <div className={styles.card} key={g.key}>
              <span className={styles.reason}>{g.reason}</span>
              <span className={styles.hint}>Hangisi kalsın? Diğerlerinin randevu ve ödemeleri ona taşınır.</span>
              <div className={styles.list}>
                {g.members.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className={styles.row}
                    onClick={() => setKeepByGroup((prev) => ({ ...prev, [g.key]: m.id }))}
                    aria-pressed={keepId === m.id}
                  >
                    <span className={keepId === m.id ? styles.radioOn : styles.radio} />
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>{m.full_name}</span>
                      <span className={styles.rowSub}>
                        {m.contact_phone || m.phone || 'Telefon yok'} · {apptCount.get(m.id) ?? 0} randevu · eklendi{' '}
                        {new Date(m.created_at).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => dismiss(g)}
                  disabled={busyKey !== null}
                >
                  Farklı kişiler
                </button>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => merge(g)}
                  disabled={busyKey !== null}
                >
                  {busyKey === g.key ? 'Birleştiriliyor…' : 'Birleştir'}
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
