import { describe, expect, it } from 'vitest'
import { allocatePayment } from './paymentAllocation'

const debts = [
  { target: 'pkg:p1', date: '2026-10-05T00:00:00Z', remaining: 400 },
  { target: 'appt:a1', date: '2026-10-01T10:00:00Z', remaining: 300 },
]

describe('allocatePayment', () => {
  it('en eski borctan baslayarak dagitir', () => {
    expect(allocatePayment(500, debts)).toEqual([
      { target: 'appt:a1', amount: 300 },
      { target: 'pkg:p1', amount: 200 },
    ])
  })

  it('borcu asan kisim hedefsiz kalir', () => {
    expect(allocatePayment(1000, debts)).toEqual([
      { target: 'appt:a1', amount: 300 },
      { target: 'pkg:p1', amount: 400 },
      { target: null, amount: 300 },
    ])
  })

  it('borc yoksa tamami hedefsiz', () => {
    expect(allocatePayment(250, [])).toEqual([{ target: null, amount: 250 }])
  })

  it('kurusta yuvarlama hatasi birakmaz', () => {
    const parts = allocatePayment(100.3, [
      { target: 'appt:a', date: '1', remaining: 33.1 },
      { target: 'appt:b', date: '2', remaining: 33.1 },
      { target: 'appt:c', date: '3', remaining: 33.1 },
    ])
    expect(parts.map((p) => p.amount)).toEqual([33.1, 33.1, 33.1, 1])
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(100.3, 10)
  })
})
