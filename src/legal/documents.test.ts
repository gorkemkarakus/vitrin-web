import { describe, expect, it } from 'vitest'
import { LEGAL_DOCUMENTS, PROCESSORS, getLegalDocument } from './documents'

describe('yasal metinler', () => {
  it('her belge benzersiz slug ve dolu bolumlere sahip', () => {
    const slugs = LEGAL_DOCUMENTS.map((d) => d.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.sections.length).toBeGreaterThan(0)
      for (const s of doc.sections) {
        const texts = [...(s.paragraphs ?? []), ...(s.items ?? []), ...(s.after ?? [])]
        expect(texts.length, `${doc.slug} / ${s.heading}`).toBeGreaterThan(0)
        expect(texts.every((t) => t.trim().length > 0)).toBe(true)
      }
    }
  })

  it('gizlilik politikasi tum ucuncu taraf saglayicilari listeler', () => {
    const privacy = getLegalDocument('gizlilik')!
    const all = privacy.sections.flatMap((s) => s.items ?? []).join('\n')
    for (const p of PROCESSORS) expect(all).toContain(p.name)
  })

  it('KVKK md. 11 haklari ve silme yolu metinde yer alir', () => {
    const kvkk = getLegalDocument('kvkk')!
    const text = JSON.stringify(kvkk)
    expect(text).toContain('md. 11')
    expect(text).toContain('/hesap-silme')
  })
})
