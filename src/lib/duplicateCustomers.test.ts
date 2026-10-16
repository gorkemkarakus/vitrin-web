import { describe, expect, it } from 'vitest'
import { findDuplicateGroups, phoneKey, type DupCustomer } from './duplicateCustomers'

function c(id: string, full_name: string, phone: string | null = null, contact_phone: string | null = null): DupCustomer {
  return { id, full_name, phone, contact_phone, created_at: '2026-10-01T00:00:00Z' }
}

describe('phoneKey', () => {
  it('Turkiye cep numarasini 10 haneye indirger', () => {
    expect(phoneKey('905321234567')).toBe('5321234567')
    expect(phoneKey('0532 123 45 67')).toBe('5321234567')
    expect(phoneKey('5321234567')).toBe('5321234567')
  })

  it('numara olmayan kimlikleri eslestirmez', () => {
    expect(phoneKey('17841400000000000')).toBeNull()
    expect(phoneKey(null)).toBeNull()
  })
})

describe('findDuplicateGroups', () => {
  it('farkli bicimde yazilmis ayni numarayi bulur', () => {
    const groups = findDuplicateGroups([c('1', 'Ayşe Demir', '05321234567'), c('2', 'Ayse D.', '905321234567')])
    expect(groups).toHaveLength(1)
    expect(groups[0].reason).toBe('Aynı telefon · 0532 123 45 67')
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['1', '2'])
  })

  it('phone ile contact_phone arasindaki eslesmeyi de yakalar ve zincirler', () => {
    const groups = findDuplicateGroups([
      c('1', 'A B', '05321234567'),
      c('2', 'C D', '17841400000000000', '5321234567'),
      c('3', 'E F', '05329999999', '0532 123 45 67'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].members).toHaveLength(3)
  })

  it('ayni tam ad ayri bir grup olur; tek kelimelik ve varsayilan adlar sayilmaz', () => {
    const groups = findDuplicateGroups([
      c('1', 'Ayşe Demir'),
      c('2', 'ayşe  demir'),
      c('3', 'Ayşe'),
      c('4', 'Ayşe'),
      c('5', 'Müşteri'),
      c('6', 'Müşteri'),
    ])
    expect(groups.map((g) => g.reason)).toEqual(['Aynı ad'])
    expect(groups[0].members.map((m) => m.id)).toEqual(['1', '2'])
  })

  it('zaten ayni telefon grubunda olanlar icin ad grubu tekrar edilmez', () => {
    const groups = findDuplicateGroups([c('1', 'Ayşe Demir', '05321234567'), c('2', 'Ayşe Demir', '905321234567')])
    expect(groups.map((g) => g.reason)).toEqual(['Aynı telefon · 0532 123 45 67'])
  })

  it('grup anahtari uye sirasindan bagimsizdir', () => {
    const a = findDuplicateGroups([c('1', 'X Y', '05321234567'), c('2', 'Z W', '05321234567')])
    const b = findDuplicateGroups([c('2', 'Z W', '05321234567'), c('1', 'X Y', '05321234567')])
    expect(a[0].key).toBe(b[0].key)
  })
})
