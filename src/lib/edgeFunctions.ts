import { supabase } from './supabase'
import { SESSION_EXPIRED } from './messages'

// Supabase Edge Function cagrilari. Fonksiyonlarimiz basarida { data },
// hatada { error } doner.
//
// Token React context'inden degil her cagrida istemciden alinir: getSession()
// suresi dolmus token'i once yeniler, boylece yenileme aninda yapilan istek
// 401 almaz.
//
// Oturum sunucuda iptal edilmis olabilir (ör. ayni hesap baska cihazdan
// "tum cihazlardan" cikis yapti): token imzasi gecerli oldugu icin veritabani
// sorgulari calismaya devam eder ama fonksiyonlar 401 doner. Bu durumda
// oturum bir kez yenilenip istek tekrarlanir; yenilenemiyorsa bu cihazdaki
// oturum kapatilir ve kullanici giris ekranina doner.
//
// Ag hatasi firlatilir (cagiran "Sunucuya ulasilamadi" der); sunucu hatasi
// { ok: false, error } olarak doner.

export type EdgeResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string | null }

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

async function post(name: string, accessToken: string | undefined, payload: unknown) {
  const headers: Record<string, string> = { apikey: ANON_KEY }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (payload !== undefined) headers['Content-Type'] = 'application/json'
  return fetch(`${BASE_URL}/${name}`, {
    method: 'POST',
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
}

export async function callEdgeFunction<T = unknown>(name: string, payload?: unknown): Promise<EdgeResult<T>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  let res = await post(name, session?.access_token, payload)

  if (res.status === 401 && session) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr || !refreshed.session) {
      await supabase.auth.signOut({ scope: 'local' })
      return { ok: false, status: 401, error: SESSION_EXPIRED }
    }
    res = await post(name, refreshed.session.access_token, payload)
  }

  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok) return { ok: false, status: res.status, error: body.error ?? null }
  return { ok: true, data: body.data as T }
}

// OAuth akisinda Meta'nin geri donecegi adres (fonksiyonun kendisi).
export function edgeFunctionUrl(name: string) {
  return `${BASE_URL}/${name}`
}
