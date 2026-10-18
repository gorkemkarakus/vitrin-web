import { strFromU8, unzipSync } from 'fflate'
import { parseCsv } from './customerImport'

// Excel (.xlsx) ve CSV okuyucu — tarayicida calisir (DOMParser). .xlsx bir
// zip; ilk sayfa + paylasilan metinler okunur. SheetJS kullanilmiyor (npm
// surumunde duzeltilmemis guvenlik acigi var, bkz. lib/xlsx.ts).

export class SpreadsheetError extends Error {}

const MAX_ROWS = 5000

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function readXlsx(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new SpreadsheetError('Dosya açılamadı. Excel’de .xlsx olarak yeniden kaydedip deneyin.')
  }
  const parser = new DOMParser()
  const xml = (path: string) => (files[path] ? parser.parseFromString(strFromU8(files[path]), 'application/xml') : null)

  // Ilk sayfanin dosya yolu: workbook.xml -> ilk <sheet r:id> -> rels hedefi
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const workbook = xml('xl/workbook.xml')
  const rels = xml('xl/_rels/workbook.xml.rels')
  const firstSheet = workbook?.getElementsByTagName('sheet')[0]
  const rid = firstSheet?.getAttribute('r:id')
  if (rid && rels) {
    for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
      if (rel.getAttribute('Id') === rid) {
        const target = rel.getAttribute('Target') ?? ''
        sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`
      }
    }
  }
  const sheet = xml(sheetPath)
  if (!sheet) throw new SpreadsheetError('Dosyada sayfa bulunamadı.')

  const shared: string[] = []
  const sst = xml('xl/sharedStrings.xml')
  if (sst) {
    for (const si of Array.from(sst.getElementsByTagName('si'))) {
      shared.push(
        Array.from(si.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join(''),
      )
    }
  }

  const rows: string[][] = []
  for (const r of Array.from(sheet.getElementsByTagName('row'))) {
    if (rows.length >= MAX_ROWS + 1) break
    const row: string[] = []
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const idx = colIndex(c.getAttribute('r') ?? 'A')
      const type = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      let value = v
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr')
        value = Array.from(c.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join('')
      else if (type === 'b') value = v === '1' ? 'Evet' : 'Hayır'
      row[idx] = value
    }
    rows.push(Array.from(row, (x) => x ?? ''))
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  // Eski Turkce Excel CSV'leri windows-1254 kaydeder; UTF-8 bozulursa onu dene.
  if (utf8.includes('�')) {
    try {
      return new TextDecoder('windows-1254').decode(bytes)
    } catch {
      return utf8
    }
  }
  return utf8
}

export async function readSpreadsheet(file: File): Promise<string[][]> {
  const name = file.name.toLocaleLowerCase('tr')
  if (file.size > 10 * 1024 * 1024) throw new SpreadsheetError('Dosya 10 MB’tan büyük.')
  if (name.endsWith('.xls')) {
    throw new SpreadsheetError(
      'Eski Excel biçimi (.xls) okunamıyor. Dosyayı Excel’de “.xlsx” ya da “CSV” olarak kaydedin.',
    )
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const rows = name.endsWith('.xlsx') ? readXlsx(bytes) : parseCsv(decodeText(bytes))
  if (rows.length === 0) throw new SpreadsheetError('Dosyada satır bulunamadı.')
  if (rows.length > MAX_ROWS + 1) throw new SpreadsheetError(`Tek seferde en fazla ${MAX_ROWS} müşteri aktarılabilir.`)
  return rows
}
