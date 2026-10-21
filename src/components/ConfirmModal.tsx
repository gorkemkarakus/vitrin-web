import { useId, type ReactNode } from 'react'
import { AlertTriangleIcon, HelpCircleIcon } from './icons'
import styles from './ConfirmModal.module.css'

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  danger = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  // uyari: tek "Tamam" dugmesi
  hideCancel?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div
        className={`card ${styles.card}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`${styles.icon} ${danger ? styles.iconDanger : ''}`}>
          {danger || hideCancel ? (
            <AlertTriangleIcon width={22} height={22} />
          ) : (
            <HelpCircleIcon width={22} height={22} />
          )}
        </span>
        <span className={styles.title} id={titleId}>
          {title}
        </span>
        {message && <span className={styles.message}>{message}</span>}
        <div className={styles.actions}>
          {!hideCancel && (
            <button type="button" className={`btn-secondary ${styles.cancelBtn}`} onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`btn-primary ${styles.confirmBtn} ${danger ? styles.confirmBtnDanger : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
