import { describe, expect, it } from 'vitest'
import { cardSummary, filledStamps, type LoyaltyProgram } from './loyalty'

const program: LoyaltyProgram = {
  business_id: 'b',
  enabled: true,
  visits_required: 5,
  reward: 'Ücretsiz fön',
  counts_from: '2026-01-01T00:00:00Z',
}

describe('sadakat karti', () => {
  it('hic ziyareti olmayan icin bos kart', () => {
    expect(filledStamps(null, 5)).toBe(0)
    expect(cardSummary(null, program)).toBe('5 ziyaret sonra: Ücretsiz fön')
  })

  it('ilerleme ve son ziyaret', () => {
    expect(filledStamps({ available: 0, progress: 3 }, 5)).toBe(3)
    expect(cardSummary({ available: 0, progress: 4 }, program)).toBe('Bir ziyaret sonra: Ücretsiz fön')
  })

  it('odul hazirsa kart dolu', () => {
    expect(filledStamps({ available: 1, progress: 2 }, 5)).toBe(5)
    expect(cardSummary({ available: 1, progress: 2 }, program)).toBe('Ödül hazır: Ücretsiz fön')
    expect(cardSummary({ available: 2, progress: 0 }, program)).toBe('2 ödül hazır: Ücretsiz fön')
  })
})
