import { supabase } from './supabase'
import { publicSiteBase } from './bookingUrl'
import { NETWORK_ERROR } from './messages'

// Kendi kendine kayit (supabase/functions/register-business). Hesap e-posta
// onaylanana kadar giris yapamaz; onay baglantisi /eposta-dogrulandi'ya doner.

export type SignupResult = { ok: true; email: string } | { ok: false; error: string }

function redirectTo() {
  // Telefonda origin "https://localhost" oldugu icin site adresi tercih edilir.
  return `${publicSiteBase() ?? window.location.origin}/eposta-dogrulandi`
}

async function call(body: Record<string, unknown>): Promise<SignupResult> {
  const { data, error } = await supabase.functions.invoke<{ data?: { email: string } }>('register-business', {
    body: { ...body, redirect_to: redirectTo() },
  })
  if (!error) return { ok: true, email: data?.data?.email ?? String(body.email) }
  // 4xx yanitlarinin govdesinde Turkce hata mesaji var; ag hatasinda govde yok.
  const res = (error as { context?: Response }).context
  const parsed = (await res?.json?.().catch(() => null)) as { error?: string } | null
  if (parsed?.error) return { ok: false, error: parsed.error }
  return { ok: false, error: res ? 'Hesap oluşturulamadı, lütfen tekrar deneyin.' : NETWORK_ERROR }
}

export function registerBusiness(params: {
  businessName: string
  fullName: string
  email: string
  password: string
  acceptTerms: boolean
  turnstileToken: string
}) {
  return call({
    business_name: params.businessName,
    full_name: params.fullName,
    email: params.email,
    password: params.password,
    accept_terms: params.acceptTerms,
    turnstile_token: params.turnstileToken,
  })
}

export function resendConfirmation(email: string) {
  return call({ action: 'resend', email })
}
