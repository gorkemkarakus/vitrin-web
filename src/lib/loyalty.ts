import { supabase } from './supabase'

// Sadakat karti (bkz. migration 20261018000011_loyalty.sql). Ziyaret =
// tamamlanan randevusu olan gun; her `visits_required` ziyarette bir odul.

export interface LoyaltyProgram {
  business_id: string
  enabled: boolean
  visits_required: number
  reward: string
  counts_from: string
}

export interface LoyaltyCard {
  customer_id: string
  full_name: string
  visits: number
  used: number
  available: number
  progress: number
  last_visit: string | null
}

export async function fetchProgram(): Promise<LoyaltyProgram | null> {
  const { data } = await supabase
    .from('loyalty_programs')
    .select('business_id, enabled, visits_required, reward, counts_from')
    .maybeSingle()
  return (data as LoyaltyProgram | null) ?? null
}

export async function fetchCards(customerId?: string): Promise<LoyaltyCard[]> {
  const { data, error } = await supabase.rpc('loyalty_cards', customerId ? { p_customer: customerId } : {})
  if (error) throw error
  return (data ?? []) as LoyaltyCard[]
}

export async function redeem(customerId: string): Promise<string | null> {
  const { error } = await supabase.rpc('redeem_loyalty', { p_customer: customerId })
  if (!error) return null
  return /Hazır ödül yok/.test(error.message) ? 'Bu müşterinin hazır ödülü yok.' : 'Ödül kullandırılamadı.'
}

// Kartta gosterilecek damga sayisi: odul hazirsa kart dolu gorunur.
export function filledStamps(card: Pick<LoyaltyCard, 'available' | 'progress'> | null, required: number): number {
  if (!card) return 0
  return card.available > 0 ? required : Math.min(card.progress, required)
}

export function cardSummary(card: Pick<LoyaltyCard, 'available' | 'progress'> | null, program: LoyaltyProgram): string {
  const progress = card?.progress ?? 0
  const available = card?.available ?? 0
  if (available > 1) return `${available} ödül hazır: ${program.reward}`
  if (available === 1) return `Ödül hazır: ${program.reward}`
  const left = program.visits_required - progress
  return left === 1 ? `Bir ziyaret sonra: ${program.reward}` : `${left} ziyaret sonra: ${program.reward}`
}
