import { cleanCode } from '../lib/signup'
import styles from '../pages/LoginPage.module.css'

// E-postayla gelen tek kullanimlik kod. autoComplete="one-time-code":
// iOS klavyesi Mail'deki kodu oneri olarak gosterir.
export default function CodeField({
  id,
  value,
  onChange,
  label = 'E-postadaki kod',
}: {
  id: string
  value: string
  onChange: (v: string) => void
  label?: string
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`${styles.inputWhite} ${styles.codeInput}`}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
        maxLength={10}
        value={value}
        onChange={(e) => onChange(cleanCode(e.target.value))}
        required
      />
    </div>
  )
}
