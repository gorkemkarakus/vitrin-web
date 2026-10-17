import { describe, expect, it } from 'vitest'
import { friendlyDbError } from './dbErrors'
import { NETWORK_ERROR } from './messages'

describe('friendlyDbError', () => {
  it('bilinen Postgres kodlarini Turkcelestirir', () => {
    expect(friendlyDbError({ code: '23514', message: 'violates check constraint' }, 'x')).toMatch(/çok uzun/)
    expect(friendlyDbError({ code: '23505', message: 'customers_phone_key' }, 'x')).toMatch(/telefon/)
    expect(friendlyDbError({ code: '42501', message: 'permission denied' }, 'x')).toBe('Bu işlem için yetkin yok.')
  })

  it('ag hatasini ve bilinmeyen hatayi ayirir, ham mesaji gostermez', () => {
    expect(friendlyDbError({ message: 'TypeError: Failed to fetch' }, 'x')).toBe(NETWORK_ERROR)
    expect(friendlyDbError({ code: 'XX000', message: 'internal something' }, 'Kaydedilemedi.')).toBe('Kaydedilemedi.')
    expect(friendlyDbError(null, 'Kaydedilemedi.')).toBe('Kaydedilemedi.')
  })
})
