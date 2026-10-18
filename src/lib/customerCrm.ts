import { supabase } from './supabase'

// 360° musteri karti: kaynak, dogum gunu, etiketler, isletmenin tanimladigi
// alanlar, aktivite kaydi ve zaman cizelgesi (bkz. migration
// 20261018000003_customer_crm.sql).

export type CustomerSource = 'instagram' | 'tavsiye' | 'google' | 'yoldan' | 'whatsapp' | 'online' | 'reklam' | 'diger'

export const SOURCE_LABEL: Record<CustomerSource, string> = {
  instagram: 'Instagram',
  tavsiye: 'Tavsiye',
  google: 'Google',
  yoldan: 'Yoldan geçerken',
  whatsapp: 'WhatsApp',
  online: 'Online randevu',
  reklam: 'Reklam',
  diger: 'Diğer',
}

export const SOURCE_OPTIONS = (Object.keys(SOURCE_LABEL) as CustomerSource[]).map((value) => ({
  value,
  label: SOURCE_LABEL[value],
}))

export type ActivityKind = 'not' | 'arama' | 'mesaj' | 'ziyaret' | 'sikayet'

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  not: 'Not',
  arama: 'Arama',
  mesaj: 'Mesaj',
  ziyaret: 'Ziyaret',
  sikayet: 'Şikâyet',
}

export const ACTIVITY_KINDS = Object.keys(ACTIVITY_LABEL) as ActivityKind[]

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox'

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Yazı',
  number: 'Sayı',
  date: 'Tarih',
  select: 'Seçenek listesi',
  checkbox: 'Evet / hayır',
}

export interface FieldDefinition {
  id: string
  label: string
  type: FieldType
  options: string[]
  sensitive: boolean
  sort: number
}

export type CustomFieldValues = Record<string, string | number | boolean | null>

export async function fetchFieldDefinitions(): Promise<FieldDefinition[]> {
  const { data, error } = await supabase
    .from('customer_field_definitions')
    .select('id, label, type, options, sensitive, sort')
    .order('sort')
    .order('label')
  if (error) throw error
  return (data ?? []) as FieldDefinition[]
}

// Kayitli degerin ekranda gosterimi; bos ise null.
export function formatFieldValue(def: FieldDefinition, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  switch (def.type) {
    case 'checkbox':
      return value === true ? 'Evet' : value === false ? 'Hayır' : null
    case 'date': {
      const d = new Date(`${String(value)}T00:00:00`)
      return Number.isNaN(d.getTime())
        ? null
        : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
    }
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('tr-TR') : String(value)
    default:
      return String(value)
  }
}

// Bir sonraki dogum gunune kac gun var (bugunse 0). Dogum gunu yoksa null.
export function daysUntilBirthday(birthday: string | null, today = new Date()): number | null {
  if (!birthday) return null
  const [, m, d] = birthday.split('-').map(Number)
  if (!m || !d) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let next = new Date(today.getFullYear(), m - 1, d)
  if (next < start) next = new Date(today.getFullYear() + 1, m - 1, d)
  return Math.round((next.getTime() - start.getTime()) / 86_400_000)
}

export function birthdayLabel(birthday: string | null, today = new Date()): string | null {
  if (!birthday) return null
  const date = new Date(`${birthday}T00:00:00`)
  const base = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
  const days = daysUntilBirthday(birthday, today)
  if (days === 0) return `${base} · bugün doğum günü`
  if (days !== null && days <= 30) return `${base} · ${days} gün sonra`
  return base
}

// Etiket: bastaki/sondaki bosluk ve ust uste bosluklar temizlenir, en fazla 30 karakter.
export function cleanTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 30)
}

// ---- Zaman cizelgesi ----

export type TimelineKind =
  'kayit' | 'randevu' | 'odeme' | 'odeme_iptal' | 'paket' | 'izin' | 'bildirim' | 'whatsapp' | ActivityKind

export interface TimelineItem {
  at: string
  kind: TimelineKind
  title: string | null
  detail: string | null
  amount: number | null
  status: string | null
  ref_id: string | null
  actor: string | null
}

export async function fetchTimeline(customerId: string): Promise<TimelineItem[]> {
  const { data, error } = await supabase.rpc('customer_timeline', { p_customer: customerId, p_limit: 300 })
  if (error) throw error
  return (data ?? []) as TimelineItem[]
}

export function isActivityKind(kind: string): kind is ActivityKind {
  return (ACTIVITY_KINDS as string[]).includes(kind)
}
