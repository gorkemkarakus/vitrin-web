export const MIN_PASSWORD_LENGTH = 8

export function newPasswordError(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`
  if (password !== confirm) return 'Şifreler eşleşmiyor.'
  return null
}

export function passwordChecks(password: string) {
  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  const lettersAndDigits = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(password) && /\d/.test(password)
  const hasUpper = /[A-ZÇĞİÖŞÜ]/.test(password)
  // 0-4 arasi; gostergedeki dolu cubuk sayisi
  const strength = [longEnough, lettersAndDigits, hasUpper, password.length >= 10].filter(Boolean).length
  return { longEnough, lettersAndDigits, hasUpper, strength }
}
