import { supabase } from './supabase'

// Paketler (Ucretsiz / Salon / Salon + Asistan). Sinirlar ve ozellikler
// veritabanindaki plan_definitions tablosundan okunur — burada sabit sinir
// ya da fiyat YOK (bkz. 20261018000001_plans.sql). Fiyatlar magazadan gelir.

// supabase/functions/_shared/plan.ts ile ayni anahtarlar.
export type PlanFeature =
  | 'staff'
  | 'pdf_reports'
  | 'ai_command'
  | 'ai_insights'
  | 'unbranded_booking'
  | 'whatsapp_bot'
  | 'instagram_bot'
  | 'staff_whatsapp'
  | 'messages'
  | 'bulk_campaign'
  | 'ads'
  | 'own_number_reminders'

export type PlanLimitKey =
  | 'max_users'
  | 'appointments_per_month'
  | 'max_customers'
  | 'reminders_per_month'
  | 'ai_command_per_day'
  | 'ai_insights_per_day'
  | 'ai_campaign_per_day'
  | 'bulk_recipients_per_day'
  | 'bot_messages_per_month'

// null = sinirsiz, 0 = kapali
export type PlanLimits = Partial<Record<PlanLimitKey, number | null>>

export interface PlanDefinition {
  id: string
  name: string
  sort: number
  limits: PlanLimits
  features: PlanFeature[]
}

export interface MyPlan {
  plan: string
  name: string
  stored_plan: string
  expires_at: string | null
  source: string | null
  limits: PlanLimits
  features: PlanFeature[]
  usage: { users: number; appointments_this_month: number; customers: number }
}

export async function fetchMyPlan(): Promise<MyPlan | null> {
  const { data, error } = await supabase.rpc('my_plan')
  if (error || !data) return null
  return data as MyPlan
}

export async function fetchPlanDefinitions(): Promise<PlanDefinition[]> {
  const { data, error } = await supabase
    .from('plan_definitions')
    .select('id, name, sort, limits, features')
    .order('sort')
  if (error) throw error
  return (data ?? []) as PlanDefinition[]
}

// ---- Kilitli ekranlar ----

export const FEATURE_TITLES: Record<PlanFeature, string> = {
  staff: 'Çalışan ekleme',
  pdf_reports: 'PDF raporlar',
  ai_command: 'Yazıyla randevu',
  ai_insights: 'AI işletme analizi',
  unbranded_booking: 'Markasız online randevu sayfası',
  whatsapp_bot: 'WhatsApp asistanı',
  instagram_bot: 'Instagram asistanı',
  staff_whatsapp: 'Personel WhatsApp komutları',
  messages: 'Mesajlar',
  bulk_campaign: 'Toplu mesaj',
  ads: 'Reklam raporu',
  own_number_reminders: 'Kendi numaranızdan hatırlatma',
}

// Ozelligi iceren en ucuz paket (kilit ekraninda "X paketinde" demek icin).
export function cheapestPlanWith(plans: PlanDefinition[], feature: PlanFeature): PlanDefinition | null {
  return [...plans].sort((a, b) => a.sort - b.sort).find((p) => p.features.includes(feature)) ?? null
}

// ---- Planlar sayfasi satirlari (tablodaki degerlerden uretilir) ----

export interface PlanRow {
  label: string
  included: boolean
}

function count(n: number) {
  return n.toLocaleString('tr-TR')
}

export function hasAssistant(plan: Pick<PlanDefinition, 'features'>) {
  return plan.features.includes('whatsapp_bot') || plan.features.includes('instagram_bot')
}

export function planRows(plan: PlanDefinition): PlanRow[] {
  const l = plan.limits
  const has = (f: PlanFeature) => plan.features.includes(f)
  const perDay = (v: number | null | undefined, text: string): PlanRow =>
    v === 0 || v === undefined
      ? { label: text, included: false }
      : { label: v === null ? `${text} (sınırsız)` : `${text} · günde ${count(v)}`, included: true }

  const rows: PlanRow[] = [
    {
      label:
        l.max_users === null
          ? 'Sınırsız kullanıcı'
          : l.max_users === 1 || !has('staff')
            ? 'Yalnızca siz (çalışan eklenemez)'
            : `${count(l.max_users ?? 1)} kullanıcı`,
      included: true,
    },
    {
      label: l.appointments_per_month == null ? 'Sınırsız randevu' : `Ayda ${count(l.appointments_per_month)} randevu`,
      included: true,
    },
    {
      label: l.max_customers == null ? 'Sınırsız müşteri' : `${count(l.max_customers)} müşteriye kadar`,
      included: true,
    },
    {
      label: has('own_number_reminders')
        ? 'Sınırsız hatırlatma, salonun kendi numarasından'
        : l.reminders_per_month == null
          ? 'Sınırsız hatırlatma (Adapptiv numarasından)'
          : `Ayda ${count(l.reminders_per_month)} hatırlatma (Adapptiv numarasından)`,
      included: l.reminders_per_month !== 0,
    },
    {
      label: has('unbranded_booking') ? 'Online randevu sayfası' : 'Online randevu sayfası (“Adapptiv ile” yazar)',
      included: true,
    },
    { label: 'PDF raporlar', included: has('pdf_reports') },
    perDay(has('ai_command') ? l.ai_command_per_day : 0, 'Yazıyla randevu (AI)'),
    perDay(has('ai_insights') ? l.ai_insights_per_day : 0, 'AI işletme analizi'),
    { label: 'Mesajlar ekranı (müşteri konuşmaları)', included: has('messages') },
    { label: 'Personel WhatsApp komutları', included: has('staff_whatsapp') },
    {
      label:
        has('bulk_campaign') && l.bulk_recipients_per_day
          ? `Toplu kampanya + AI metin · günde ${count(l.bulk_recipients_per_day)} alıcı`
          : 'Toplu kampanya + AI metin',
      included: has('bulk_campaign'),
    },
    { label: 'Reklam raporu', included: has('ads') },
  ]
  return rows
}

export function assistantLine(plan: PlanDefinition): string {
  if (!hasAssistant(plan)) return 'WhatsApp + Instagram asistanı YOK'
  const cap = plan.limits.bot_messages_per_month
  return cap ? `WhatsApp + Instagram asistanı DAHİL · ayda ${count(cap)} mesaj` : 'WhatsApp + Instagram asistanı DAHİL'
}
