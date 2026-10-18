// Musteri (CRM) raporu hesaplari — saf fonksiyonlar, sayfa: pages/CustomerReportPage.tsx.
//
// Tanimlar (ekranda da yazar):
// - Ziyaret: durumu "tamamlandi" olan randevu.
// - Aktif musteri: donemde en az bir ziyareti olan.
// - Yeni musteri: ilk ziyareti donemde olan.
// - Tekrar gelme: ilk ziyaretinden sonraki 60 gun icinde yeniden gelenlerin
//   orani; yalnizca ilk ziyareti en az 60 gun once olanlar sayilir.
// - Kaybolma riski: en az 2 ziyareti olan, son ziyaretinden bu yana kendi
//   ortalama araliginin 2 katindan ve 45 gunden fazla gecen musteri.
// - Gelmeme orani: gelmedi / (tamamlandi + gelmedi).

export interface ReportAppointment {
  id: string
  customer_id: string | null
  service_id: string | null
  scheduled_at: string
  status: string
  source: string | null
}

export interface ReportPayment {
  customer_id: string | null
  amount: number
  paid_at: string
}

export interface ReportCustomer {
  id: string
  full_name: string
}

const DAY = 86_400_000
const RETURN_WINDOW_DAYS = 60
const CHURN_MIN_DAYS = 45

export interface AtRiskCustomer {
  id: string
  name: string
  visits: number
  daysSince: number
  usualGapDays: number
  spent: number
}

export interface CrmReport {
  activeCustomers: number
  newCustomers: number
  visits: number
  revenue: number
  avgTicket: number | null
  spendPerCustomer: number | null
  returnRate: number | null
  returnBase: number
  noShowRate: number | null
  noShows: number
  atRisk: AtRiskCustomer[]
  bySource: { source: string; visits: number; customers: number }[]
  byService: { serviceId: string; visits: number }[]
  // [gun 0=Pazar..6][saat 0..23] = donemdeki tamamlanan + onayli randevu sayisi
  heatmap: number[][]
  topSpenders: { id: string; name: string; spent: number; visits: number }[]
}

export function buildCrmReport(
  appointments: ReportAppointment[],
  payments: ReportPayment[],
  customers: ReportCustomer[],
  period: { start: Date; end: Date },
  now = new Date(),
): CrmReport {
  const startMs = period.start.getTime()
  const endMs = period.end.getTime()
  const inPeriod = (iso: string) => {
    const t = new Date(iso).getTime()
    return t >= startMs && t < endMs
  }
  const nameOf = new Map(customers.map((c) => [c.id, c.full_name]))

  // Musteri basina tum (donem disi dahil) ziyaret tarihleri — ilk ziyaret ve
  // araliklar icin.
  const visitsByCustomer = new Map<string, number[]>()
  for (const a of appointments) {
    if (a.status !== 'tamamlandi' || !a.customer_id) continue
    const t = new Date(a.scheduled_at).getTime()
    if (t > now.getTime()) continue
    const list = visitsByCustomer.get(a.customer_id) ?? []
    list.push(t)
    visitsByCustomer.set(a.customer_id, list)
  }
  for (const list of visitsByCustomer.values()) list.sort((x, y) => x - y)

  const periodVisits = appointments.filter((a) => a.status === 'tamamlandi' && inPeriod(a.scheduled_at))
  const active = new Set(periodVisits.map((a) => a.customer_id).filter(Boolean) as string[])
  let newCustomers = 0
  for (const [, list] of visitsByCustomer) if (list[0] >= startMs && list[0] < endMs) newCustomers++

  const periodPayments = payments.filter((p) => inPeriod(p.paid_at))
  const revenue = periodPayments.reduce((s, p) => s + p.amount, 0)

  // Tekrar gelme
  let returnBase = 0
  let returned = 0
  const cutoff = now.getTime() - RETURN_WINDOW_DAYS * DAY
  for (const [, list] of visitsByCustomer) {
    const first = list[0]
    if (first < startMs || first > cutoff) continue
    returnBase++
    if (list.some((t) => t > first + DAY / 2 && t <= first + RETURN_WINDOW_DAYS * DAY)) returned++
  }

  // Gelmeme
  const noShows = appointments.filter((a) => a.status === 'gelmedi' && inPeriod(a.scheduled_at)).length

  // Harcama (tum zamanlar) — risk ve en cok harcayanlar icin
  const spentBy = new Map<string, number>()
  for (const p of payments) {
    if (!p.customer_id) continue
    spentBy.set(p.customer_id, (spentBy.get(p.customer_id) ?? 0) + p.amount)
  }

  const atRisk: AtRiskCustomer[] = []
  for (const [id, list] of visitsByCustomer) {
    if (list.length < 2) continue
    const usual = (list[list.length - 1] - list[0]) / (list.length - 1) / DAY
    const since = (now.getTime() - list[list.length - 1]) / DAY
    if (since > Math.max(CHURN_MIN_DAYS, usual * 2)) {
      atRisk.push({
        id,
        name: nameOf.get(id) ?? 'Müşteri',
        visits: list.length,
        daysSince: Math.round(since),
        usualGapDays: Math.round(usual),
        spent: spentBy.get(id) ?? 0,
      })
    }
  }
  atRisk.sort((a, b) => b.spent - a.spent || b.visits - a.visits)

  // Kaynak / hizmet
  const sourceMap = new Map<string, { visits: number; customers: Set<string> }>()
  const serviceMap = new Map<string, number>()
  for (const a of periodVisits) {
    const key = a.source || 'diger'
    const s = sourceMap.get(key) ?? { visits: 0, customers: new Set<string>() }
    s.visits++
    if (a.customer_id) s.customers.add(a.customer_id)
    sourceMap.set(key, s)
    if (a.service_id) serviceMap.set(a.service_id, (serviceMap.get(a.service_id) ?? 0) + 1)
  }

  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const a of appointments) {
    if ((a.status !== 'tamamlandi' && a.status !== 'onaylandi') || !inPeriod(a.scheduled_at)) continue
    const d = new Date(a.scheduled_at)
    heatmap[d.getDay()][d.getHours()]++
  }

  const periodSpend = new Map<string, number>()
  for (const p of periodPayments) {
    if (!p.customer_id) continue
    periodSpend.set(p.customer_id, (periodSpend.get(p.customer_id) ?? 0) + p.amount)
  }
  const periodVisitCount = new Map<string, number>()
  for (const a of periodVisits) {
    if (a.customer_id) periodVisitCount.set(a.customer_id, (periodVisitCount.get(a.customer_id) ?? 0) + 1)
  }

  return {
    activeCustomers: active.size,
    newCustomers,
    visits: periodVisits.length,
    revenue,
    avgTicket: periodVisits.length ? revenue / periodVisits.length : null,
    spendPerCustomer: active.size ? revenue / active.size : null,
    returnRate: returnBase ? returned / returnBase : null,
    returnBase,
    noShowRate: periodVisits.length + noShows ? noShows / (periodVisits.length + noShows) : null,
    noShows,
    atRisk,
    bySource: [...sourceMap.entries()]
      .map(([source, v]) => ({ source, visits: v.visits, customers: v.customers.size }))
      .sort((a, b) => b.visits - a.visits),
    byService: [...serviceMap.entries()]
      .map(([serviceId, visits]) => ({ serviceId, visits }))
      .sort((a, b) => b.visits - a.visits),
    heatmap,
    topSpenders: [...periodSpend.entries()]
      .map(([id, spent]) => ({ id, name: nameOf.get(id) ?? 'Müşteri', spent, visits: periodVisitCount.get(id) ?? 0 }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10),
  }
}
