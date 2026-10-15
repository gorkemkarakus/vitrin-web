import { ROLE_PRESETS, type RolePreset } from '../lib/permissions'
import styles from './RoleCards.module.css'

interface Props {
  // null: hazir rollerden birine uymayan, ince ayarla degistirilmis yetkiler.
  value: RolePreset | null
  onChange: (preset: RolePreset) => void
  disabled?: boolean
}

// Hazir rol secimi (YeniCalisan-5). Bir karta dokununca yetkiler o rolun
// hazir ayarina doner; "Ince ayar" ile tek tek degistirilebilir.
export default function RoleCards({ value, onChange, disabled }: Props) {
  return (
    <div className={styles.list}>
      {ROLE_PRESETS.map((r) => {
        const on = value === r.key
        return (
          <button
            type="button"
            key={r.key}
            className={on ? styles.cardOn : styles.card}
            onClick={() => onChange(r.key)}
            disabled={disabled}
            aria-pressed={on}
          >
            <span className={on ? styles.radioOn : styles.radio} />
            <span className={styles.text}>
              <span className={styles.title}>{r.title}</span>
              <span className={styles.sub}>{r.sub}</span>
            </span>
          </button>
        )
      })}
      {value === null && <span className={styles.custom}>Özel ayar · aşağıdaki yetkiler tek tek seçildi</span>}
    </div>
  )
}
