import { describe, expect, it } from 'vitest'
import { PROCESSORS } from './documents'
import { salonNoticeComplete, salonNoticeSections } from './salonNotice'

const base = {
  businessName: 'Güzel Salon',
  legalName: 'Ayşe Yılmaz Güzellik Hizmetleri',
  address: 'Moda Cd. No:1 Kadıköy/İstanbul',
  contactEmail: 'info@guzelsalon.com',
  contactPhone: null,
  hasBot: false,
}

describe('salon aydinlatma metni', () => {
  it('veri sorumlusu, iletisim ve tum saglayicilar metinde', () => {
    const text = JSON.stringify(salonNoticeSections(base))
    expect(text).toContain('Ayşe Yılmaz Güzellik Hizmetleri')
    expect(text).toContain('Moda Cd. No:1')
    expect(text).toContain('info@guzelsalon.com')
    for (const p of PROCESSORS) expect(text).toContain(p.name)
    expect(text).toContain('11. maddesi')
    expect(text).toContain('yurt dışındadır')
  })

  it('asistan yoksa WhatsApp yazismasi gecmez, varsa gecer', () => {
    expect(JSON.stringify(salonNoticeSections(base))).not.toContain('WhatsApp yazışmaları')
    expect(JSON.stringify(salonNoticeSections({ ...base, hasBot: true }))).toContain('WhatsApp yazışmaları')
  })

  it('unvan girilmemisse salon adi kullanilir; eksik bilgi tespit edilir', () => {
    const text = JSON.stringify(salonNoticeSections({ ...base, legalName: null }))
    expect(text).toContain('sıfatıyla Güzel Salon')
    expect(salonNoticeComplete(base)).toBe(true)
    expect(salonNoticeComplete({ ...base, address: ' ' })).toBe(false)
    expect(salonNoticeComplete({ ...base, contactEmail: null, contactPhone: null })).toBe(false)
  })
})
