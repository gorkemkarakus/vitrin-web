import { supabase } from './supabase'
import { publicSiteBase } from './bookingUrl'
import { normalizeTrPhone } from './phone'

// Memnuniyet anketi (bkz. migration 20261018000012_surveys.sql).

export interface SurveyInfo {
  business_name: string
  first_name: string | null
  service_name: string | null
  visit_date: string
  state: 'acik' | 'yanitlandi' | 'suresi_doldu'
}

export interface SurveyRow {
  id: string
  appointment_id: string
  customer_id: string
  rating: number | null
  comment: string | null
  responded_at: string | null
  task_id: string | null
  created_at: string
}

export interface SurveySettings {
  business_id: string
  google_review_url: string | null
  low_rating: number
  assignee_id: string | null
}

export const RATING_LABELS: Record<number, string> = {
  1: 'Hiç memnun kalmadım',
  2: 'Memnun kalmadım',
  3: 'Fena değil',
  4: 'Memnun kaldım',
  5: 'Çok memnun kaldım',
}

export function surveyUrl(token: string): string | null {
  const base = publicSiteBase()
  return base ? `${base}/anket/${token}` : null
}

// Musteriye gidecek mesaj; ad yoksa selamsiz baslar.
export function surveyMessage(opts: { firstName: string | null; businessName: string; url: string }): string {
  const hi = opts.firstName ? `Merhaba ${opts.firstName}, ` : ''
  return `${hi}${opts.businessName} ziyaretiniz için teşekkürler! Hizmetimizi 10 saniyede puanlar mısınız? ${opts.url}`
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${normalizeTrPhone(phone)}?text=${encodeURIComponent(text)}`
}

export async function createSurvey(appointmentId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_survey', { p_appointment: appointmentId })
  if (error || !data) throw error ?? new Error('no token')
  return data as string
}

export async function fetchSurveyInfo(token: string): Promise<SurveyInfo | null> {
  const { data, error } = await supabase.rpc('survey_info', { p_token: token })
  if (error) throw error
  return ((data ?? []) as SurveyInfo[])[0] ?? null
}

export async function submitSurvey(
  token: string,
  rating: number,
  comment: string,
): Promise<{ ok: boolean; googleReviewUrl: string | null }> {
  const { data, error } = await supabase.rpc('submit_survey', {
    p_token: token,
    p_rating: rating,
    p_comment: comment.trim() || null,
  })
  if (error) throw error
  const row = ((data ?? []) as { ok: boolean; google_review_url: string | null }[])[0]
  return { ok: row?.ok === true, googleReviewUrl: row?.google_review_url ?? null }
}

// Ortalama ve dagilim (yanitlananlar uzerinden).
export function surveyStats(rows: Pick<SurveyRow, 'rating'>[]) {
  const rated = rows.filter((r) => r.rating != null).map((r) => r.rating as number)
  const dist = [1, 2, 3, 4, 5].map((n) => rated.filter((r) => r === n).length)
  const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null
  return {
    sent: rows.length,
    answered: rated.length,
    responseRate: rows.length ? Math.round((rated.length / rows.length) * 100) : 0,
    avg,
    dist,
    happyShare: rated.length ? Math.round((rated.filter((r) => r >= 4).length / rated.length) * 100) : 0,
  }
}
