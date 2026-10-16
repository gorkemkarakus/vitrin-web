import { strToU8, zipSync } from 'fflate'

// Kucuk bir .xlsx yazici: birden cok sayfa, lacivert baslik satiri, sabit
// (dondurulmus) baslik, filtre, kolon genislikleri; para / tarih hucreleri
// gercek sayi/tarih olarak yazilir (Excel'de toplanip siralanabilir).
// SheetJS'in npm surumunde duzeltilmemis guvenlik acigi oldugu icin, jsPDF'in
// zaten getirdigi fflate (zip) ile elle uretiliyor.

export type ColumnType = 'text' | 'int' | 'money' | 'date' | 'datetime'

export interface Column {
  header: string
  width?: number
  type?: ColumnType
}

export type CellValue = string | number | boolean | Date | null | undefined

export interface Sheet {
  name: string
  columns: Column[]
  rows: CellValue[][]
}

// cellXfs sirasi: 0 normal, 1 baslik, 2 para, 3 tarih, 4 tarih+saat
const STYLE: Record<ColumnType, number> = { text: 0, int: 0, money: 2, date: 3, datetime: 4 }

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;₺&quot;"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/><numFmt numFmtId="166" formatCode="dd.mm.yyyy hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF13284F"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function esc(s: string) {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // eslint-disable-line no-control-regex
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function colName(i: number) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

// Excel seri tarihi (yerel saat bilesenleriyle; 1899-12-30 = 0).
function excelSerial(d: Date) {
  const ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())
  return (ms - Date.UTC(1899, 11, 30)) / 86400000
}

function cellXml(ref: string, v: CellValue, type: ColumnType) {
  if (v === null || v === undefined || v === '') return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    return `<c r="${ref}" s="${STYLE[type === 'date' ? 'date' : 'datetime']}"><v>${excelSerial(v)}</v></c>`
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    return `<c r="${ref}" s="${STYLE[type]}"><v>${v}</v></c>`
  }
  const text = typeof v === 'boolean' ? (v ? 'Evet' : 'Hayır') : v
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`
}

function sheetXml(sheet: Sheet) {
  const cols = sheet.columns
  const lastCol = colName(Math.max(0, cols.length - 1))
  const lastRow = sheet.rows.length + 1
  const colsXml = cols
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join('')
  const head = `<row r="1">${cols
    .map((c, i) => `<c r="${colName(i)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${esc(c.header)}</t></is></c>`)
    .join('')}</row>`
  const body = sheet.rows
    .map((row, r) => {
      const rn = r + 2
      return `<row r="${rn}">${row.map((v, i) => cellXml(`${colName(i)}${rn}`, v, cols[i]?.type ?? 'text')).join('')}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${colsXml}</cols>
<sheetData>${head}${body}</sheetData>
<autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`
}

function safeSheetName(name: string, used: Set<string>) {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sayfa'
  let n = 2
  while (used.has(base.toLowerCase())) base = `${name.slice(0, 28)} ${n++}`
  used.add(base.toLowerCase())
  return base
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const used = new Set<string>()
  const names = sheets.map((s) => safeSheetName(s.name, used))
  const files: Record<string, Uint8Array> = {}

  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`)

  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)

  const defined = sheets
    .map((s, i) => {
      const ref = `'${names[i].replace(/'/g, "''")}'!$A$1:$${colName(Math.max(0, s.columns.length - 1))}$${s.rows.length + 1}`
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(ref)}</definedName>`
    })
    .join('')
  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${defined}</definedNames>
</workbook>`)

  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)

  files['xl/styles.xml'] = strToU8(STYLES_XML)
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))
  })
  return zipSync(files, { level: 6 })
}
