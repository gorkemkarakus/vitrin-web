// "Fark etmez" secildiginde is calisanlar arasinda dengeli dagilsin diye
// (prim adaleti) bu kaynaklardan en son randevusu en eski olan calisan one
// cikar. Sunucudaki _shared/availability.ts rankEligibleByFairness ile ayni
// algoritma (chatbot, online randevu); degisirse ikisi birlikte degismeli.
export const ROTATION_SOURCES = ['chatbot', 'online_randevu', 'kullanici_uzerinden']

interface BookingLike {
  source: string | null
  employee_id: string | null
  scheduled_at: string
}

export function rankEligibleByFairness(eligibleIds: string[], appointments: BookingLike[]): string[] {
  const lastBookingByEmployee = new Map<string, number>()
  for (const a of appointments) {
    if (!a.source || !ROTATION_SOURCES.includes(a.source) || !a.employee_id) continue
    const t = new Date(a.scheduled_at).getTime()
    const prev = lastBookingByEmployee.get(a.employee_id) ?? -Infinity
    if (t > prev) lastBookingByEmployee.set(a.employee_id, t)
  }
  const last = (id: string) => lastBookingByEmployee.get(id) ?? -Infinity
  // Hic randevusu olmayanlar (-Infinity) one; esitlikte gelen sira korunur.
  return eligibleIds.slice().sort((a, b) => (last(a) === last(b) ? 0 : last(a) < last(b) ? -1 : 1))
}
