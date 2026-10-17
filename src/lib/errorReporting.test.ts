import { describe, expect, it } from 'vitest'
import { scrub } from './errorReporting'

describe('scrub', () => {
  it('e-posta, telefon ve kimlikleri maskeler', () => {
    const out = scrub(
      'ayse.yilmaz@ornek.com icin 0532 123 45 67 / +90 (532) 123-45-67 /musteriler/3019bf95-2433-49dd-adef-93b920dac0f2',
    )
    expect(out).not.toMatch(/ayse|532|3019bf95/)
    expect(out).toContain('[e-posta]')
    expect(out).toContain('[sayı]')
    expect(out).toContain('/musteriler/:id')
  })

  it('kisa sayilari ve normal metni bozmaz', () => {
    expect(scrub("TypeError: Cannot read properties of undefined (reading 'x') at line 12")).toBe(
      "TypeError: Cannot read properties of undefined (reading 'x') at line 12",
    )
  })
})
