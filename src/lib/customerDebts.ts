// Musteri basina kalan bakiye (alacak). Musteriler ve Kasa sayfalari ayni
// rakami gostersin diye tek yerde.
//
// Paketler icin: ZATEN olusturulmus seanslarin gercek ucretleri
// (price_override varsa o, yoksa paketin ilk seansinda kilitlenen fiyat) +
// henuz acilmamis kalan seanslar icin ayni fiyat tahmini, eksi o pakete
// yapilan odemeler. Pakete bagli olmayan tamamlanmis randevular icin de ayni
// mantik (randevunun gercek ucreti - o randevuya yapilan odemeler).
export interface DebtAppointment {
  id: string
  customer_id: string | null
  service_id: string | null
  status: string
  scheduled_at: string
  package_id: string | null
  price_override: number | null
}

export interface DebtPackage {
  id: string
  customer_id: string
  service_id: string | null
  total_sessions: number
  session_offset: number
}

export interface DebtPayment {
  customer_id: string
  amount: number
  appointment_id: string | null
  package_id: string | null
}

// Borcun kalem kalem dokumu: odeme alirken hangi pakete / randevuya
// yazilacagini bilmek icin (randevu kapanisinda "eski borcu da kapat").
export interface DebtItem {
  kind: 'package' | 'appointment'
  id: string
  customerId: string
  remaining: number
}

export function computeDebtItems(
  packages: DebtPackage[],
  appointments: DebtAppointment[],
  payments: DebtPayment[],
  servicePriceById: Map<string, number>,
): DebtItem[] {
  const items: DebtItem[] = []
  for (const pkg of packages) {
    const standardPrice = pkg.service_id ? (servicePriceById.get(pkg.service_id) ?? 0) : 0
    // Paketin seans basi ucreti, ILK seansta belirlenen ozel fiyata
    // kilitlidir (bkz. AppointmentsPage tamamlama akisi) — standart
    // hizmet fiyati sadece hic seans acilmamissa yedek olarak kullanilir.
    const sessions = appointments
      .filter((a) => a.package_id === pkg.id)
      .slice()
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const price = sessions[0]?.price_override ?? standardPrice
    const knownSessionsTotal = sessions.reduce((sum, a) => sum + (a.price_override ?? price), 0)
    const remainingSessionsEstimate = Math.max(0, pkg.total_sessions - pkg.session_offset - sessions.length) * price
    const expected = knownSessionsTotal + remainingSessionsEstimate
    const paid = payments.filter((p) => p.package_id === pkg.id).reduce((sum, p) => sum + p.amount, 0)
    const remaining = Math.max(0, expected - paid)
    if (remaining > 0) items.push({ kind: 'package', id: pkg.id, customerId: pkg.customer_id, remaining })
  }
  for (const a of appointments) {
    if (!a.customer_id || a.package_id || a.status !== 'tamamlandi') continue
    const expected = a.price_override ?? (a.service_id ? (servicePriceById.get(a.service_id) ?? 0) : 0)
    const paid = payments.filter((p) => p.appointment_id === a.id).reduce((sum, p) => sum + p.amount, 0)
    const remaining = Math.max(0, expected - paid)
    if (remaining > 0) items.push({ kind: 'appointment', id: a.id, customerId: a.customer_id, remaining })
  }
  return items
}

export function computeCustomerDebts(
  packages: DebtPackage[],
  appointments: DebtAppointment[],
  payments: DebtPayment[],
  servicePriceById: Map<string, number>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const it of computeDebtItems(packages, appointments, payments, servicePriceById)) {
    map.set(it.customerId, (map.get(it.customerId) ?? 0) + it.remaining)
  }
  return map
}
