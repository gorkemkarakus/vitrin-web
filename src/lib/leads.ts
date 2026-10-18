import { supabase } from './supabase'

// Potansiyel musteri hunisi (bkz. migration 20261018000010_leads.sql).

export type LeadStage = 'yeni' | 'iletisim' | 'teklif' | 'kazanildi' | 'kaybedildi'
export type LeadSource = 'whatsapp' | 'instagram' | 'telefon' | 'tavsiye' | 'online' | 'reklam' | 'yoldan' | 'diger'

export const STAGES: { value: LeadStage; label: string; hint: string }[] = [
  { value: 'yeni', label: 'Yeni', hint: 'Henüz dönüş yapılmadı' },
  { value: 'iletisim', label: 'İletişime geçildi', hint: 'Arandı ya da yazıldı' },
  { value: 'teklif', label: 'Teklif verildi', hint: 'Fiyat / saat önerildi' },
  { value: 'kazanildi', label: 'Kazanıldı', hint: 'Müşteri oldu' },
  { value: 'kaybedildi', label: 'Kaybedildi', hint: 'Nedeniyle birlikte' },
]

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.value, s.label])) as Record<LeadStage, string>

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  telefon: 'Telefon',
  tavsiye: 'Tavsiye',
  online: 'Online',
  reklam: 'Reklam',
  yoldan: 'Yoldan geçerken',
  diger: 'Diğer',
}

export const LOST_REASONS = ['Fiyat yüksek bulundu', 'Uygun saat yok', 'Başka salonu seçti', 'Ulaşılamadı', 'Vazgeçti']

export interface Lead {
  id: string
  full_name: string
  phone: string | null
  source: LeadSource
  interest: string | null
  note: string | null
  stage: LeadStage
  lost_reason: string | null
  assignee_id: string | null
  customer_id: string | null
  created_by: string | null
  stage_changed_at: string
  created_at: string
}

export interface LeadSuggestion {
  phone: string
  last_message_at: string
  message_count: number
  customer_name: string | null
  last_text: string | null
}

export async function fetchLeads(): Promise<Lead[]> {
  // Kazanilan / kaybedilenler 90 gun gosterilir; acik olanlarin hepsi.
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('leads')
    .select(
      'id, full_name, phone, source, interest, note, stage, lost_reason, assignee_id, customer_id, created_by, stage_changed_at, created_at',
    )
    .or(`stage.in.(yeni,iletisim,teklif),stage_changed_at.gte.${since}`)
    .order('stage_changed_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return (data ?? []) as Lead[]
}

export async function fetchLeadSuggestions(): Promise<LeadSuggestion[]> {
  const { data, error } = await supabase.rpc('lead_suggestions')
  if (error) return []
  return (data ?? []) as LeadSuggestion[]
}

// "Kazanildi": ayni telefonla musteri varsa ona baglanir, yoksa musteri acilir.
export async function convertLead(lead: Lead, businessId: string): Promise<{ customerId: string } | { error: string }> {
  let customerId = lead.customer_id
  if (!customerId && lead.phone) {
    const digits = lead.phone.replace(/\D/g, '').slice(-10)
    const { data: existing } = await supabase
      .from('customers')
      .select('id, phone')
      .ilike('phone', `%${digits}`)
      .limit(1)
    customerId = existing?.[0]?.id ?? null
  }
  if (!customerId) {
    const { data, error } = await supabase
      .from('customers')
      .insert({
        business_id: businessId,
        full_name: lead.full_name,
        phone: lead.phone,
        source: lead.source === 'telefon' ? 'diger' : lead.source,
        notes: lead.interest ? `İlgilendiği: ${lead.interest}` : null,
      })
      .select('id')
      .single()
    if (error || !data) return { error: 'Müşteri oluşturulamadı.' }
    customerId = data.id as string
  }
  const { error } = await supabase
    .from('leads')
    .update({ stage: 'kazanildi', customer_id: customerId })
    .eq('id', lead.id)
  return error ? { error: 'Aşama güncellenemedi.' } : { customerId }
}
