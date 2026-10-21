// Telefonun gri standart penceresi (window.confirm / window.alert) yerine
// uygulamanin kendi onay penceresi. Her yerden cagrilir, sonucu bekletir:
//   if (!(await askConfirm({ title: 'Silinsin mi?', danger: true }))) return
//   await showAlert('Kaydedilemedi, tekrar deneyin.')
// Pencereyi uygulamanin kokundeki DialogHost cizer.

export interface DialogRequest {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  alertOnly?: boolean
  resolve: (ok: boolean) => void
}

let queue: DialogRequest[] = []
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function push(req: Omit<DialogRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...req, resolve }]
    emit()
  })
}

export function askConfirm(opts: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return push(opts)
}

export async function showAlert(message: string, title = 'Bilgi'): Promise<void> {
  await push({ title, message, alertOnly: true, confirmLabel: 'Tamam' })
}

export function subscribeDialogs(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function currentDialog(): DialogRequest | undefined {
  return queue[0]
}

export function closeDialog(ok: boolean) {
  const current = queue[0]
  if (!current) return
  queue = queue.slice(1)
  emit()
  current.resolve(ok)
}
