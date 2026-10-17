export const DAY_MS = 24 * 60 * 60 * 1000

export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export type DateRangePreset = 'bugun' | 'bu_hafta' | 'bu_ay' | 'gecen_ay' | 'ozel'

// AccountingPage/ExpensesPage/PerformanceReportPage'in ortak tarih preset
// mantığı — 'ozel' (ozel tarih araligi) her sayfada kendi input'larindan
// okundugu icin bu fonksiyona hic ulaşmaz, buradaki default sadece
// tip-tamlik guvencesi.
export function presetDateRange(preset: DateRangePreset, today: Date = new Date()): { start: string; end: string } {
  switch (preset) {
    case 'bugun':
      return { start: toLocalDateString(today), end: toLocalDateString(today) }
    case 'bu_hafta': {
      const day = today.getDay()
      const diffToMonday = day === 0 ? -6 : 1 - day
      const monday = new Date(today)
      monday.setDate(today.getDate() + diffToMonday)
      return { start: toLocalDateString(monday), end: toLocalDateString(today) }
    }
    case 'bu_ay':
      return { start: toLocalDateString(firstOfMonth(today)), end: toLocalDateString(today) }
    case 'gecen_ay': {
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      const lastMonthStart = firstOfMonth(lastMonthEnd)
      return { start: toLocalDateString(lastMonthStart), end: toLocalDateString(lastMonthEnd) }
    }
    default:
      return { start: toLocalDateString(firstOfMonth(today)), end: toLocalDateString(today) }
  }
}

export function todayLocalDateString(): string {
  return toLocalDateString(new Date())
}

// "HH:MM" -> gun basindan itibaren dakika
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// ISO zaman damgasindan yerel saat ("14:30")
export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

// Date.getDay() sirasiyla (0 = Pazar)
export const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
export const DAY_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
// Pazartesiden baslayan hafta (getDay degerleri)
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

// "17 Ekim 2026" — Istanbul takvimine gore (cihaz saat diliminden bagimsiz).
export function formatTrDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  })
}
