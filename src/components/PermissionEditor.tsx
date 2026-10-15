import { PERMISSIONS, type PermKey } from '../lib/permissions'
import styles from './PermissionEditor.module.css'

interface Props {
  value: Set<PermKey>
  onChange: (next: Set<PermKey>) => void
  disabled?: boolean
}

const GROUPS = ['Randevular', 'Para', 'Yönetim', 'Mesajlar'] as const

// Yoneticinin bir calisan hesabi icin yetkileri tek tek actigi liste.
export default function PermissionEditor({ value, onChange, disabled }: Props) {
  function toggle(key: PermKey) {
    const next = new Set(value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next)
  }

  return (
    <div className={styles.wrap}>
      {GROUPS.map((group) => (
        <div className={styles.group} key={group}>
          <span className={styles.groupLabel}>{group}</span>
          <div className={styles.card}>
            {PERMISSIONS.filter((p) => p.group === group).map((p) => (
              <label className={styles.row} key={p.key}>
                <span className={styles.text}>
                  <span className={styles.title}>{p.title}</span>
                  <span className={styles.sub}>{p.sub}</span>
                </span>
                <span className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={value.has(p.key)}
                    onChange={() => toggle(p.key)}
                    disabled={disabled}
                    aria-label={p.title}
                  />
                  <span className={styles.track} />
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
