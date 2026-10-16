import { supabase } from './supabase'
import { toLocalDateString } from './date'

// Gun sonu kasa kapanisi icin bir gunun ozeti (ekran ve PDF ayni veriyi kullanir).

export type PayMethod = 'nakit' | 'kart' | 'havale' | 'diger' | 'bakiye'

export const METHOD_LABEL: Record<string, string> = {
  nakit: 'Nakit',
  kart: 'Kart',
  havale: 'Havale',
  diger: 'Diğer',
  bakiye: 'Bakiye',
}

export interface DayPayment {
  id: string
  time: string
  customer: string
  service: string
  method: string
  amount: number
  by: string
}

export interface DayExpense {
  id: string
  description: string
  category: string
  method: string | null
  amount: number
}

export interface DaySummary {
  date: string
  payments: DayPayment[]
  byMethod: Record<PayMethod, number>
  total: number
  expenses: DayExpense[]
  cashExpense: number
  expenseTotal: number
  completed: number
  cancelled: number
  noShow: number
  open: number
  unpaidCount: number
  unpaidAmount: number
}

export interface CashClosure {
  id: string
  closure_date: string
  opening_cash: number
  counted_cash: number
  expected_cash: number
  difference: number
  totals: Record<string, number>
  note: string | null
  closed_by: string | null
  created_at: string
  updated_at: string
}

export function longDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
}

export async function loadDaySummary(date: string): Promise<DaySummary> {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start.getTime() + 86400000)
  const [{ data: pays }, { data: exps }, { data: appts }] = await Promise.all([
    supabase
      .from('payments')
      .select('id, amount, method, created_at, customer_id, appointment_id, package_id, created_by_user_id')
      .eq('paid_at', date)
      .is('voided_at', null)
      .order('created_at'),
    supabase.from('business_expenses').select('*').eq('expense_date', date).eq('is_paid', true),
    supabase
      .from('appointments')
      .select('id, status, service_id, price_override, package_id, customer_id')
      .gte('scheduled_at', start.toISOString())
      .lt('scheduled_at', end.toISOString()),
  ])

  const apptIds = [...new Set((pays ?? []).map((p) => p.appointment_id).filter((v): v is string => !!v))]
  const pkgIds = [...new Set((pays ?? []).map((p) => p.package_id).filter((v): v is string => !!v))]
  const custIds = [...new Set((pays ?? []).map((p) => p.customer_id).filter((v): v is string => !!v))]
  const userIds = [...new Set((pays ?? []).map((p) => p.created_by_user_id).filter((v): v is string => !!v))]
  const completedIds = (appts ?? []).filter((a) => a.status === 'tamamlandi' && !a.package_id).map((a) => a.id)

  const [{ data: payAppts }, { data: pkgs }, { data: custs }, { data: users }, { data: services }, { data: completedPays }] =
    await Promise.all([
      apptIds.length ? supabase.from('appointments').select('id, service_id').in('id', apptIds) : Promise.resolve({ data: [] }),
      pkgIds.length ? supabase.from('service_packages').select('id, service_id').in('id', pkgIds) : Promise.resolve({ data: [] }),
      custIds.length ? supabase.from('customers').select('id, full_name').in('id', custIds.slice(0, 300)) : Promise.resolve({ data: [] }),
      userIds.length ? supabase.from('profiles').select('id, full_name').in('id', userIds) : Promise.resolve({ data: [] }),
      supabase.from('services').select('id, name, price'),
      completedIds.length
        ? supabase.from('payments').select('appointment_id, amount').is('voided_at', null).in('appointment_id', completedIds.slice(0, 300))
        : Promise.resolve({ data: [] }),
    ])

  const svcById = new Map((services ?? []).map((s: { id: string; name: string; price: number | null }) => [s.id, s]))
  const apptSvc = new Map((payAppts ?? []).map((a: { id: string; service_id: string | null }) => [a.id, a.service_id]))
  const pkgSvc = new Map((pkgs ?? []).map((p: { id: string; service_id: string | null }) => [p.id, p.service_id]))
  const custName = new Map((custs ?? []).map((c: { id: string; full_name: string }) => [c.id, c.full_name]))
  const userName = new Map((users ?? []).map((u: { id: string; full_name: string | null }) => [u.id, u.full_name ?? '']))

  const byMethod: Record<PayMethod, number> = { nakit: 0, kart: 0, havale: 0, diger: 0, bakiye: 0 }
  const payments: DayPayment[] = (pays ?? []).map((p) => {
    const amount = Number(p.amount)
    const m = (p.method ?? 'diger') as PayMethod
    byMethod[m] = (byMethod[m] ?? 0) + amount
    const svcId = p.appointment_id ? apptSvc.get(p.appointment_id) : p.package_id ? pkgSvc.get(p.package_id) : null
    const svcName = svcId ? (svcById.get(svcId)?.name ?? 'Hizmet') : 'Ödeme'
    return {
      id: p.id,
      time: new Date(p.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      customer: custName.get(p.customer_id) ?? 'Müşteri',
      service: p.package_id ? `${svcName} (paket)` : svcName,
      method: METHOD_LABEL[m] ?? m,
      amount,
      by: (userName.get(p.created_by_user_id ?? '') ?? '').split(' ')[0],
    }
  })

  const expenses: DayExpense[] = (exps ?? []).map(
    (e: { id: string; description: string; category?: string | null; payment_method?: string | null; amount: number }) => ({
      id: e.id,
      description: e.description,
      category: e.category ?? 'Diğer',
      method: e.payment_method ?? null,
      amount: Number(e.amount),
    }),
  )
  const cashExpense = expenses.filter((e) => e.method === 'nakit').reduce((s, e) => s + e.amount, 0)

  // Bugun tamamlanip ucreti (tamami) alinmayan tek seferlik randevular.
  const paidByAppt = new Map<string, number>()
  for (const p of completedPays ?? []) {
    paidByAppt.set(p.appointment_id, (paidByAppt.get(p.appointment_id) ?? 0) + Number(p.amount))
  }
  let unpaidCount = 0
  let unpaidAmount = 0
  for (const a of appts ?? []) {
    if (a.status !== 'tamamlandi' || a.package_id) continue
    const price = Number(a.price_override ?? (a.service_id ? (svcById.get(a.service_id)?.price ?? 0) : 0))
    const rest = Math.max(0, price - (paidByAppt.get(a.id) ?? 0))
    if (rest > 0) {
      unpaidCount++
      unpaidAmount += rest
    }
  }

  const count = (st: string) => (appts ?? []).filter((a) => a.status === st).length
  return {
    date,
    payments,
    byMethod,
    total: payments.reduce((s, p) => s + p.amount, 0),
    expenses,
    cashExpense,
    expenseTotal: expenses.reduce((s, e) => s + e.amount, 0),
    completed: count('tamamlandi'),
    cancelled: count('iptal'),
    noShow: count('gelmedi'),
    open: count('bekliyor') + count('onaylandi'),
    unpaidCount,
    unpaidAmount,
  }
}

export function todayString() {
  return toLocalDateString(new Date())
}
