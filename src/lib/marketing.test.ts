import { describe, expect, it } from 'vitest'
import { OPT_OUT_FOOTER, withOptOutFooter } from './marketing'

describe('withOptOutFooter', () => {
  it('mesajin sonuna ret bilgisini bir bos satirla ekler', () => {
    expect(withOptOutFooter('Merhaba!  ')).toBe(`Merhaba!\n\n${OPT_OUT_FOOTER}`)
  })

  it('zaten varsa ikinci kez eklemez', () => {
    const once = withOptOutFooter('Kampanya')
    expect(withOptOutFooter(once)).toBe(once)
  })
})
