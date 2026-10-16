import { supabase } from './supabase'

// Supabase Edge Function cagrilari. Fonksiyonlarimiz basarida { data },
// hatada { error } doner.
//
// Token React context'inden degil her cagrida istemciden alinir: getSession()
// suresi dolmus token'i once yeniler, boylece yenileme aninda yapilan istek
// 401 almaz.
//
// Ag hatasi firlatilir (cagiran "Sunucuya ulasilamadi" der); sunucu hatasi
// { ok: false, error } olarak doner.

export type EdgeResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string | null }

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export async function callEdgeFunction<T = unknown>(name: string, payload?: unknown): Promise<EdgeResult<T>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers: Record<string, string> = { apikey: ANON_KEY }
  if (session) headers.Authorization = `Bearer ${session.access_token}`
  if (payload !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE_URL}/${name}`, {
    method: 'POST',
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string }

  if (!res.ok) return { ok: false, status: res.status, error: body.error ?? null }
  return { ok: true, data: body.data as T }
}

// OAuth akisinda Meta'nin geri donecegi adres (fonksiyonun kendisi).
export function edgeFunctionUrl(name: string) {
  return `${BASE_URL}/${name}`
}
