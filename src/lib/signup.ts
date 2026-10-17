import { supabase } from './supabase'
import { NETWORK_ERROR } from './messages'

// Kendi kendine kayit (supabase/functions/register-business). Hesap e-posta
// onaylanana kadar giris yapamaz. Uygulama yalnizca mobilde oldugu icin
// e-postada baglanti degil 6 haneli kod gider; kod uygulamada girilir
// (verifyEmailCode) — web sayfasi gerekmez. Sifre sifirlama da ayni yolla.

export type SignupResult = { ok: true; email: string } | { ok: false; error: string }

async function call(body: Record<string, unknown>): Promise<SignupResult> {
  const { data, error } = await supabase.functions.invoke<{ data?: { email: string } }>('register-business', {
    body,
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

// Supabase'in kod uzunlugu ayarlanabilir (varsayilan 6); 6-10 hane kabul edilir.
export function cleanCode(raw: string) {
  return raw.replace(/\D/g, '').slice(0, 10)
}

// E-postadaki kodu dogrular; basariliysa oturum acilir. Hata metni ya da null.
export async function verifyEmailCode(email: string, code: string, type: 'signup' | 'recovery') {
  if (code.length < 6) return 'E-postadaki kodun tamamını yazın.'
  try {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type })
    if (!error) return null
    if (error.code === 'otp_expired' || /expired|invalid|not found/i.test(error.message)) {
      return 'Kod hatalı ya da süresi dolmuş. Kontrol edin ya da yeni kod isteyin.'
    }
    if (error.status === 429) return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.'
    return 'Doğrulanamadı, lütfen tekrar deneyin.'
  } catch {
    return NETWORK_ERROR
  }
}
