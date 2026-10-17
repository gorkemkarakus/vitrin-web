import { useId } from 'react'
import styles from './ConsentToggle.module.css'

// Ticari ileti (kampanya mesaji) izni anahtari. Varsayilan KAPALI olmali:
// izin yalnizca musteri acikca istediginde verilir (6563 sayili Kanun).
export default function ConsentToggle({
  checked,
  onChange,
  label = 'Kampanya mesajı izni var',
  hint = 'Müşteri, kampanya ve fırsat mesajı almayı açıkça kabul etti.',
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
  hint?: string
}) {
  const id = useId()
  return (
    <label className={styles.row} htmlFor={id}>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
      <span className={styles.switch}>
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={styles.track} />
      </span>
    </label>
  )
}
