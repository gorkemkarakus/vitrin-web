export function formatDateLabel(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatPeriodLabel(start: string, end: string) {
  return start === end ? formatDateLabel(start) : `${formatDateLabel(start)} – ${formatDateLabel(end)}`
}

export function formatGeneratedLabel() {
  const now = new Date()
  return `Oluşturulma: ${now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
}
