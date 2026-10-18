import { describe, expect, it } from 'vitest'
import { surveyMessage, surveyStats, whatsappUrl } from './surveys'

describe('memnuniyet anketi', () => {
  it('istatistik: yanitlanmayanlar ortalamaya girmez', () => {
    const s = surveyStats([{ rating: 5 }, { rating: 4 }, { rating: 2 }, { rating: null }])
    expect(s.sent).toBe(4)
    expect(s.answered).toBe(3)
    expect(s.responseRate).toBe(75)
    expect(s.avg).toBeCloseTo(11 / 3)
    expect(s.dist).toEqual([0, 1, 0, 1, 1])
    expect(s.happyShare).toBe(67)
  })

  it('bos liste', () => {
    const s = surveyStats([])
    expect(s.avg).toBeNull()
    expect(s.responseRate).toBe(0)
  })

  it('mesaj ve WhatsApp baglantisi', () => {
    const text = surveyMessage({ firstName: 'Ayşe', businessName: 'Güzel Salon', url: 'https://x.co/anket/ab' })
    expect(text).toMatch(/^Merhaba Ayşe, Güzel Salon/)
    expect(text).toContain('https://x.co/anket/ab')
    expect(surveyMessage({ firstName: null, businessName: 'S', url: 'u' })).toMatch(/^S ziyaretiniz/)
    expect(whatsappUrl('0532 111 22 33', 'a b')).toBe('https://wa.me/905321112233?text=a%20b')
  })
})
