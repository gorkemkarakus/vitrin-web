import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { friendlyDbError } from '../lib/dbErrors'
import { SERVICE_TEMPLATE_GROUPS, serviceNameKey } from '../lib/serviceTemplates'
import { CloseIcon } from './icons'
import styles from './ServiceTemplatePicker.module.css'

interface Props {
  // Zaten ekli hizmet adlari: listede "ekli" gorunur, tekrar eklenmez.
  existingNames: string[]
  // Eklenen hizmetler bu calisanlara atanir ("kimse atanmadi" kalmasin).
  staffIds: string[]
  onClose: () => void
  onAdded: (count: number) => void
}

interface Pick {
  duration: string
  price: string
}

// Yeni salon: hizmetleri tek tek yazmak yerine hazir listeden isaretleyip
// sure ve fiyatiyla bir seferde ekler.
export default function ServiceTemplatePicker({ existingNames, staffIds, onClose, onAdded }: Props) {
  const { profile } = useAuth()
  const existing = useMemo(() => new Set(existingNames.map(serviceNameKey)), [existingNames])
  const [picked, setPicked] = useState<Map<string, Pick>>(new Map())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(name: string, duration: number) {
    setPicked((prev) => {
      const next = new Map(prev)
      if (next.has(name)) next.delete(name)
      else next.set(name, { duration: String(duration), price: '' })
      return next
    })
  }

  function update(name: string, field: keyof Pick, value: string) {
    setPicked((prev) => {
      const cur = prev.get(name)
      if (!cur) return prev
      const next = new Map(prev)
      next.set(name, { ...cur, [field]: value.replace(/[^\d]/g, '') })
      return next
    })
  }

  async function save() {
    if (!profile?.business_id || picked.size === 0) return
    setSaving(true)
    setError(null)
    const rows = [...picked].map(([name, p]) => ({
      business_id: profile.business_id,
      name,
      duration_minutes: Math.min(480, Math.max(5, Number(p.duration) || 30)),
      price: p.price === '' ? null : Number(p.price),
      online_bookable: true,
    }))
    const { data, error: err } = await supabase.from('services').insert(rows).select('id')
    if (err || !data) {
      setSaving(false)
      setError(friendlyDbError(err, 'Hizmetler eklenemedi.'))
      return
    }
    if (staffIds.length) {
      await supabase
        .from('employee_services')
        .insert(data.flatMap((s) => staffIds.map((profile_id) => ({ profile_id, service_id: s.id }))))
    }
    setSaving(false)
    onAdded(data.length)
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-label="Hazır hizmet listesi"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h2>Hazır listeden seç</h2>
            <p className={styles.sub}>Yaptığın hizmetleri işaretle, fiyatını yaz. Sonra istediğin zaman düzenlersin.</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Kapat">
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        <div className={styles.body}>
          {SERVICE_TEMPLATE_GROUPS.map((g) => (
            <section key={g.title} className={styles.group}>
              <h3 className={styles.groupTitle}>{g.title}</h3>
              {g.items.map((t) => {
                const added = existing.has(serviceNameKey(t.name))
                const p = picked.get(t.name)
                return (
                  <div key={t.name} className={p ? `${styles.row} ${styles.rowOn}` : styles.row}>
                    <label className={styles.rowMain}>
                      <input
                        type="checkbox"
                        checked={!!p || added}
                        disabled={added}
                        onChange={() => toggle(t.name, t.duration)}
                      />
                      <span className={styles.rowName}>{t.name}</span>
                      {added && <span className={styles.rowAdded}>ekli</span>}
                    </label>
                    {p && (
                      <div className={styles.rowInputs}>
                        <label className={styles.inputBox}>
                          <input
                            inputMode="numeric"
                            value={p.duration}
                            onChange={(e) => update(t.name, 'duration', e.target.value)}
                            aria-label={`${t.name} süresi (dakika)`}
                          />
                          <span>dk</span>
                        </label>
                        <label className={styles.inputBox}>
                          <input
                            inputMode="numeric"
                            value={p.price}
                            placeholder="Fiyat"
                            onChange={(e) => update(t.name, 'price', e.target.value)}
                            aria-label={`${t.name} fiyatı (TL)`}
                          />
                          <span>₺</span>
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>

        <div className={styles.foot}>
          {error && <p className={styles.error}>{error}</p>}
          <button type="button" className="btn-primary" disabled={picked.size === 0 || saving} onClick={save}>
            {saving ? 'Ekleniyor…' : picked.size === 0 ? 'Hizmet seç' : `${picked.size} hizmeti ekle`}
          </button>
        </div>
      </div>
    </div>
  )
}
