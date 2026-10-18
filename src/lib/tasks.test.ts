import { describe, expect, it } from 'vitest'
import { bucketOf, dueLabel } from './tasks'

const today = new Date(2026, 9, 18, 10, 0) // 18 Ekim 2026

describe('gorev tarihleri', () => {
  it('kovalara ayirir', () => {
    expect(bucketOf({ due_date: '2026-10-17' }, today)).toBe('geciken')
    expect(bucketOf({ due_date: '2026-10-18' }, today)).toBe('bugun')
    expect(bucketOf({ due_date: '2026-10-25' }, today)).toBe('yaklasan')
    expect(bucketOf({ due_date: '2026-10-26' }, today)).toBe('sonra')
  })

  it('okunur son tarih yazar', () => {
    expect(dueLabel({ due_date: '2026-10-18', due_time: '14:00:00' }, today)).toBe('Bugün 14:00')
    expect(dueLabel({ due_date: '2026-10-19', due_time: null }, today)).toBe('Yarın')
    expect(dueLabel({ due_date: '2026-10-15', due_time: null }, today)).toBe('3 gün gecikti')
  })
})
