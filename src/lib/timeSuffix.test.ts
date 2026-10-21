import { describe, expect, it } from 'vitest'
import { withTimeSuffix } from './timeSuffix'

describe('withTimeSuffix', () => {
  it('bulunma eki saatin okunusuna uyar', () => {
    expect(withTimeSuffix('10:00', 'de')).toBe('10:00’da')
    expect(withTimeSuffix('09:00', 'de')).toBe('09:00’da')
    expect(withTimeSuffix('08:00', 'de')).toBe('08:00’de')
    expect(withTimeSuffix('15:00', 'de')).toBe('15:00’te')
    expect(withTimeSuffix('13:00', 'de')).toBe('13:00’te')
    expect(withTimeSuffix('14:00', 'de')).toBe('14:00’te')
    expect(withTimeSuffix('20:00', 'de')).toBe('20:00’de')
    expect(withTimeSuffix('10:30', 'de')).toBe('10:30’da')
    expect(withTimeSuffix('09:15', 'de')).toBe('09:15’te')
    expect(withTimeSuffix('11:40', 'de')).toBe('11:40’ta')
    expect(withTimeSuffix('06:00', 'de')).toBe('06:00’da')
  })

  it('yonelme ve ayrilma eki', () => {
    expect(withTimeSuffix('10:00', 'e')).toBe('10:00’a')
    expect(withTimeSuffix('12:00', 'e')).toBe('12:00’ye')
    expect(withTimeSuffix('18:00', 'e')).toBe('18:00’e')
    expect(withTimeSuffix('16:00', 'e')).toBe('16:00’ya')
    expect(withTimeSuffix('09:00', 'den')).toBe('09:00’dan')
    expect(withTimeSuffix('17:00', 'den')).toBe('17:00’den')
    expect(withTimeSuffix('13:00', 'den')).toBe('13:00’ten')
    expect(withTimeSuffix('22.10 14:00', 'e')).toBe('22.10 14:00’e')
  })
})
