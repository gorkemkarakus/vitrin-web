import { describe, expect, it } from 'vitest'
import { customerPhone, normalizeTrPhone, phoneLengthError } from './phone'

describe('normalizeTrPhone', () => {
  it.each([
    ['05321234567', '905321234567'],
    ['5321234567', '905321234567'],
    ['905321234567', '905321234567'],
    ['+90 532 123 45 67', '905321234567'],
    ['0532 123 45 67', '905321234567'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeTrPhone(raw)).toBe(expected)
  })

  it('taninmayan bicimleri yalnizca rakamlara indirger', () => {
    expect(normalizeTrPhone('12345')).toBe('12345')
    expect(normalizeTrPhone(null)).toBe('')
  })
})

describe('phoneLengthError', () => {
  it('11 haneye kadar gecerli', () => {
    expect(phoneLengthError('')).toBeNull()
    expect(phoneLengthError('05321234567')).toBeNull()
  })

  it('11 haneden uzunsa hata mesaji doner', () => {
    expect(phoneLengthError('053212345678')).toMatch(/en fazla 11 rakam/)
  })
})

describe('customerPhone', () => {
  it('iletisim numarasi varsa onu tercih eder', () => {
    expect(customerPhone({ phone: '17841400000000000', contact_phone: '05321234567' })).toBe('05321234567')
  })

  it('yoksa phone, o da yoksa null', () => {
    expect(customerPhone({ phone: '05321234567', contact_phone: null })).toBe('05321234567')
    expect(customerPhone({ phone: null, contact_phone: null })).toBeNull()
  })
})
