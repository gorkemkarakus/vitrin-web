import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildXlsx } from './xlsx'

function files(sheets: Parameters<typeof buildXlsx>[0]) {
  const zip = unzipSync(buildXlsx(sheets))
  return Object.fromEntries(Object.entries(zip).map(([k, v]) => [k, strFromU8(v)]))
}

describe('buildXlsx', () => {
  it('Excel paketinin zorunlu parcalarini uretir', () => {
    const f = files([{ name: 'Müşteriler', columns: [{ header: 'Ad' }], rows: [['Ayşe']] }])
    expect(Object.keys(f).sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ].sort(),
    )
    expect(f['xl/workbook.xml']).toContain('<sheet name="Müşteriler" sheetId="1" r:id="rId1"/>')
  })

  it('metni XML icin kacirir, sayi ve tarihi gercek deger olarak yazar', () => {
    const f = files([
      {
        name: 'S',
        columns: [
          { header: 'Ad' },
          { header: 'Tutar', type: 'money' },
          { header: 'Gün', type: 'date' },
          { header: 'Aktif' },
        ],
        rows: [['A & <B>', 1250.5, new Date(2026, 9, 16), true]],
      },
    ])
    const xml = f['xl/worksheets/sheet1.xml']
    expect(xml).toContain('A &amp; &lt;B&gt;')
    expect(xml).toContain('<c r="B2" s="2"><v>1250.5</v></c>')
    // 2026-10-16 Excel seri numarasi 46311
    expect(xml).toContain('<c r="C2" s="3"><v>46311</v></c>')
    expect(xml).toContain('Evet')
    expect(xml).toContain('<autoFilter ref="A1:D2"/>')
  })

  it('bos hucreleri atlar', () => {
    const xml = files([{ name: 'S', columns: [{ header: 'A' }, { header: 'B' }], rows: [[null, '']] }])[
      'xl/worksheets/sheet1.xml'
    ]
    expect(xml).toContain('<row r="2"></row>')
  })

  it('gecersiz ve tekrar eden sayfa adlarini duzeltir', () => {
    const wb = files([
      { name: 'Rapor/2026', columns: [], rows: [] },
      { name: 'Rapor/2026', columns: [], rows: [] },
    ])['xl/workbook.xml']
    expect(wb).toContain('name="Rapor 2026"')
    expect(wb).toContain('name="Rapor 2026 2"')
  })

  it('uzun ve cakisan adlar 31 karakteri asmaz', () => {
    const long = 'Çok uzun bir sayfa adı ki otuz bir karakteri geçer'
    const wb = files([
      { name: long, columns: [], rows: [] },
      { name: long, columns: [], rows: [] },
    ])['xl/workbook.xml']
    const names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1])
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2)
    for (const n of names) expect(n.length).toBeLessThanOrEqual(31)
  })
})
