import { describe, expect, it } from 'vitest'
import { rankEligibleByFairness } from './fairness'

const appt = (employee_id: string, scheduled_at: string, source = 'chatbot') => ({ employee_id, scheduled_at, source })

describe('rankEligibleByFairness', () => {
  it('en son randevusu en eski olan calisani one alir', () => {
    const ranked = rankEligibleByFairness(
      ['ayse', 'zeynep', 'elif'],
      [
        appt('ayse', '2026-10-17T10:00:00Z'),
        appt('zeynep', '2026-10-15T10:00:00Z'),
        appt('elif', '2026-10-16T10:00:00Z'),
      ],
    )
    expect(ranked).toEqual(['zeynep', 'elif', 'ayse'])
  })

  it('hic randevusu olmayan once gelir, esitlikte sira korunur', () => {
    expect(rankEligibleByFairness(['a', 'b', 'c'], [appt('a', '2026-10-17T10:00:00Z')])).toEqual(['b', 'c', 'a'])
  })

  it('dagitim disi kaynaklari (or. dogrudan musteri) saymaz', () => {
    const ranked = rankEligibleByFairness(
      ['a', 'b'],
      [
        appt('a', '2026-10-10T10:00:00Z'),
        appt('b', '2026-10-01T10:00:00Z'),
        appt('b', '2026-10-20T10:00:00Z', 'dogrudan_musteri'),
      ],
    )
    expect(ranked).toEqual(['b', 'a'])
  })
})
