import { useSyncExternalStore } from 'react'
import ConfirmModal from './ConfirmModal'
import { closeDialog, currentDialog, subscribeDialogs } from '../lib/dialog'

// askConfirm / showAlert pencerelerini cizer; uygulamanin kokunde bir kez durur.
export default function DialogHost() {
  const current = useSyncExternalStore(subscribeDialogs, currentDialog, () => undefined)
  if (!current) return null
  return (
    // acik alt sayfa / modalin (z 80-130) ustunde, acilis ekraninin (1000) altinda
    <div style={{ position: 'relative', zIndex: 300 }}>
      <ConfirmModal
        title={current.title}
        message={current.message ?? ''}
        confirmLabel={current.confirmLabel}
        cancelLabel={current.cancelLabel}
        danger={current.danger}
        hideCancel={current.alertOnly}
        onConfirm={() => closeDialog(true)}
        onCancel={() => closeDialog(false)}
      />
    </div>
  )
}
