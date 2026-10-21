// Saate Turkce hal eki: ek, saatin okunusundaki son kelimeye uyar.
// 10:00 "on" -> 10:00’da, 08:00 "sekiz" -> 08:00’de, 15:00 "on bes" -> 15:00’te,
// 10:30 "on otuz" -> 10:30’da. Dakika 00 ise okunmaz ("saat on").
// Metin saatle bitebilir ("22.10 14:30"): ek sondaki saate gore secilir.
const ONES = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli']

function lastWord(n: number): string {
  if (n === 0) return ONES[0]
  return n % 10 === 0 ? TENS[n / 10] : ONES[n % 10]
}

export type TimeCase = 'de' | 'e' | 'den'

export function withTimeSuffix(time: string, kind: TimeCase): string {
  const match = time.match(/(\d{1,2}):(\d{2})\s*$/)
  if (!match) return time
  const h = Number(match[1])
  const m = Number(match[2])
  const word = lastWord(m ? m : h)
  const vowels = word.match(/[aeıioöuü]/g) ?? ['a']
  const back = 'aıou'.includes(vowels[vowels.length - 1])
  const end = word[word.length - 1]
  const endsVowel = 'aeıioöuü'.includes(end)
  const hard = 'çfhkpsşt'.includes(end)
  const a = back ? 'a' : 'e'
  const suffix = kind === 'e' ? (endsVowel ? 'y' : '') + a : (hard ? 't' : 'd') + a + (kind === 'den' ? 'n' : '')
  return `${time}’${suffix}`
}
