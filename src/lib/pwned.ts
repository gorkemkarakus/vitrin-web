// Sizdirilmis sifre kontrolu (Have I Been Pwned, k-anonimlik): yalnizca
// SHA-1 ozetinin ilk 5 karakteri gonderilir; sifre cihazdan cikmaz.
// Sunucudaki karsiligi: supabase/functions/_shared/pwned.ts. Servise
// ulasilamazsa kontrol atlanir.
export const PWNED_PASSWORD_MESSAGE =
  'Bu şifre daha önce internette sızdırılmış şifre listelerinde görülmüş. Lütfen başka bir şifre seçin.'

export async function isPwnedPassword(password: string): Promise<boolean> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return false
    const suffix = hex.slice(5)
    return (await res.text()).split('\n').some((line) => {
      const [hash, count] = line.trim().split(':')
      return hash === suffix && Number(count) > 0
    })
  } catch {
    return false
  }
}
