import { normalizeForSearch } from './search'
import type { CustomerSource } from './customerCrm'

// Excel / CSV'den musteri ice aktarma — saf (tarayicisiz) kisim: sutun
// tahmini, CSV ayristirma, satir dogrulama ve siniflandirma. Dosya okuma
// lib/spreadsheetReader.ts'te.

export type ImportField =
  'full_name' | 'first_name' | 'last_name' | 'phone' | 'email' | 'birthday' | 'notes' | 'tags' | 'source' | 'skip'

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  full_name: 'Ad soyad',
  first_name: 'Ad',
  last_name: 'Soyad',
  phone: 'Telefon',
  email: 'E-posta',
  birthday: 'Doğum tarihi',
  notes: 'Not',
  tags: 'Etiketler',
  source: 'Nereden geldi',
  skip: 'Alma',
}

// Baslik metni -> alan. Siralama onemli: once daha ozgul eslesmeler.
const SYNONYMS: [ImportField, string[]][] = [
  [
    'full_name',
    ['ad soyad', 'adi soyadi', 'ad-soyad', 'isim soyisim', 'musteri adi', 'musteri', 'full name', 'name', 'isim'],
  ],
  ['first_name', ['ad', 'adi', 'first name', 'firstname']],
  ['last_name', ['soyad', 'soyadi', 'soyisim', 'last name', 'lastname', 'surname']],
  ['phone', ['telefon', 'tel', 'gsm', 'cep', 'cep telefonu', 'telefon no', 'phone', 'mobile', 'numara']],
  ['email', ['e-posta', 'eposta', 'email', 'e-mail', 'mail']],
  ['birthday', ['dogum tarihi', 'dogum gunu', 'birthday', 'dogum']],
  ['notes', ['not', 'notlar', 'aciklama', 'note', 'notes']],
  ['tags', ['etiket', 'etiketler', 'grup', 'tags', 'tag']],
  ['source', ['kaynak', 'nereden', 'nereden geldi', 'source']],
]

export function guessField(header: string): ImportField {
  const h = normalizeForSearch(header).replace(/[_.]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!h) return 'skip'
  for (const [field, words] of SYNONYMS) if (words.includes(h)) return field
  for (const [field, words] of SYNONYMS) if (words.some((w) => w.length > 3 && h.includes(w))) return field
  return 'skip'
}

// ---- CSV ----
// Turkce Excel CSV'yi ';' ile kaydeder; ayirici ilk satira bakilarak secilir.
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const)
  const delim = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

// ---- Deger donusumleri ----

// Turkiye cep numarasi "05xx..." bicimine (uygulamanin kaydettigi gibi);
// diger numaralar yalnizca rakamlariyla. Bos ise null.
export function normalizeImportPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('0090')) d = d.slice(2)
  if (d.length === 12 && d.startsWith('90')) return '0' + d.slice(2)
  if (d.length === 10 && d.startsWith('5')) return '0' + d
  return d
}

export function phoneKey(phone: string | null | undefined): string {
  const d = (phone ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : d
}

// "15.03.1990", "15/03/1990", "1990-03-15", Excel seri sayisi (32947) -> "1990-03-15"
export function parseBirthday(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  let y: number, m: number, d: number
  let match = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  else if ((match = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/))) {
    ;[d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])]
  } else if (/^\d{4,5}(\.0+)?$/.test(v)) {
    // Excel tarihi: 1899-12-30'dan bu yana gun
    const date = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000)
    ;[y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
  } else return null
  if (y < 1900 || y > new Date().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) return null
  const check = new Date(Date.UTC(y, m - 1, d))
  if (check.getUTCMonth() !== m - 1) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const SOURCE_WORDS: [CustomerSource, string[]][] = [
  ['instagram', ['instagram', 'insta', 'ig']],
  ['tavsiye', ['tavsiye', 'referans', 'arkadas', 'oneri']],
  ['google', ['google', 'harita', 'maps']],
  ['yoldan', ['yoldan', 'vitrin', 'gecerken']],
  ['whatsapp', ['whatsapp', 'wp']],
  ['online', ['online', 'web', 'internet']],
  ['reklam', ['reklam', 'facebook', 'meta']],
]

export function parseSource(raw: string): CustomerSource | null {
  const v = normalizeForSearch(raw)
  if (!v) return null
  for (const [source, words] of SOURCE_WORDS) if (words.some((w) => v.includes(w))) return source
  return 'diger'
}

export function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,;|]/)
        .map((t) => t.trim().replace(/\s+/g, ' ').slice(0, 30))
        .filter(Boolean),
    ),
  ].slice(0, 20)
}

function cap(text: string, max: number) {
  return text.trim().replace(/\s+/g, ' ').slice(0, max)
}

// Kelime bas harfleri buyuk (Turkce): "AYŞE DEMİR" / "ayşe demir" -> "Ayşe Demir".
// Yalnizca tamami buyuk ya da tamami kucuk yazilmis kelimelere dokunulur;
// "McLaren", "E2E" gibi bilerek karisik yazilanlar oldugu gibi kalir.
function titleCase(text: string) {
  return text
    .split(' ')
    .map((w) => {
      if (!w) return w
      const upper = w.toLocaleUpperCase('tr')
      const lower = w.toLocaleLowerCase('tr')
      if (w !== upper && w !== lower) return w
      if (/\d/.test(w)) return w
      return lower[0].toLocaleUpperCase('tr') + lower.slice(1)
    })
    .join(' ')
}

// ---- Satirlar -> adaylar ----

export interface ImportCandidate {
  line: number // dosyadaki satir numarasi (1'den)
  full_name: string
  phone: string | null
  email: string | null
  birthday: string | null
  notes: string | null
  tags: string[]
  source: CustomerSource | null
  status: 'yeni' | 'mevcut' | 'tekrar' | 'hatali'
  problem: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function buildCandidates(
  rows: string[][],
  mapping: ImportField[],
  opts: { hasHeader: boolean; existingPhoneKeys: Set<string> },
): ImportCandidate[] {
  const out: ImportCandidate[] = []
  const seen = new Set<string>()
  const start = opts.hasHeader ? 1 : 0
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]
    const get = (field: ImportField) =>
      mapping
        .map((f, idx) => (f === field ? (row[idx] ?? '').trim() : ''))
        .filter(Boolean)
        .join(' ')
    const name = cap(
      titleCase(get('full_name') || [get('first_name'), get('last_name')].filter(Boolean).join(' ')),
      120,
    )
    const rawPhone = get('phone')
    const phone = normalizeImportPhone(rawPhone)
    const emailRaw = get('email').toLocaleLowerCase('tr')
    const birthdayRaw = get('birthday')
    const c: ImportCandidate = {
      line: i + 1,
      full_name: name,
      phone: phone ? phone.slice(0, 32) : null,
      email: emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw.slice(0, 254) : null,
      birthday: parseBirthday(birthdayRaw),
      notes: get('notes') ? cap(get('notes'), 2000) : null,
      tags: parseTags(get('tags')),
      source: parseSource(get('source')),
      status: 'yeni',
      problem: null,
    }
    if (!name) {
      c.status = 'hatali'
      c.problem = 'Ad yok'
    } else if (phone && (phone.length < 10 || phone.length > 15)) {
      c.status = 'hatali'
      c.problem = `Telefon geçersiz (${rawPhone})`
    } else {
      const key = phone ? phoneKey(phone) : `ad:${normalizeForSearch(name)}`
      if (phone && opts.existingPhoneKeys.has(key)) {
        c.status = 'mevcut'
        c.problem = 'Bu telefonla kayıtlı müşteri var'
      } else if (seen.has(key)) {
        c.status = 'tekrar'
        c.problem = 'Dosyada iki kez geçiyor'
      }
      seen.add(key)
    }
    out.push(c)
  }
  return out
}
