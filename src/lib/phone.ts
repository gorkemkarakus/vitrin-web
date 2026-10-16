// Turkiye cep numarasi yardimcilari.

// Musteri kaydinda numara "05xx..." ya da "5xx...", WhatsApp kayitlarinda
// "905xx..." olarak durabiliyor; karsilastirma icin hepsi 90'li bicime cevrilir.
export function normalizeTrPhone(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('90')) return d
  if (d.length === 11 && d.startsWith('0')) return '9' + d
  if (d.length === 10 && d.startsWith('5')) return '90' + d
  return d
}

// Form alanlari icin: 0 ile 11 hane (05xx xxx xx xx). Fazlasi hata.
export const PHONE_MAX_DIGITS = 11

export function phoneLengthError(digits: string): string | null {
  return digits.length > PHONE_MAX_DIGITS
    ? `Telefon en fazla ${PHONE_MAX_DIGITS} rakam olabilir (05xx xxx xx xx) — şu an ${digits.length} rakam.`
    : null
}
