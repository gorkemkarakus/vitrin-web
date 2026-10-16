import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import styles from './PickerSheet.module.css'

interface PickerOption {
  value: string
  label: string
  sub?: string
}

interface PickerSheetProps {
  open: boolean
  title: string
  options: PickerOption[]
  value: string
  onSelect: (value: string) => void
  onClose: () => void
}

// Alttan acilan secim penceresi. Gizli native <select> telefonda Android'in
// gri varsayilan listesini aciyordu; bu pencere uygulama temasinda.
export default function PickerSheet({ open, title, options, value, onSelect, onClose }: PickerSheetProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className={styles.grabber} aria-hidden="true" />
        <span className={styles.title}>{title}</span>
        <div className={styles.list} role="listbox">
          {options.map((o) => {
            const active = o.value === value
            return (
              <button
                type="button"
                key={o.value}
                role="option"
                aria-selected={active}
                className={active ? styles.optionActive : styles.option}
                onClick={() => {
                  onSelect(o.value)
                  onClose()
                }}
              >
                <span className={styles.text}>
                  <span className={styles.label}>{o.label}</span>
                  {o.sub && <span className={styles.sub}>{o.sub}</span>}
                </span>
                <span className={active ? styles.radioOn : styles.radio} aria-hidden="true">
                  {active && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
