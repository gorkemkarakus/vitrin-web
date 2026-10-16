import { describe, expect, it } from 'vitest'
import { computeCustomerDebts, computeDebtItems, type DebtAppointment, type DebtPackage } from './customerDebts'

const prices = new Map([
  ['sac', 400],
  ['lazer', 1200],
])

function appt(p: Partial<DebtAppointment> & { id: string }): DebtAppointment {
  return {
    customer_id: 'c1',
    service_id: 'sac',
    status: 'tamamlandi',
    scheduled_at: '2026-10-01T10:00:00Z',
    package_id: null,
    price_override: null,
    ...p,
  }
}

describe('computeDebtItems — tek seferlik randevular', () => {
  it('tamamlanan randevunun odenmeyen kismi borc olur', () => {
    const items = computeDebtItems([], [appt({ id: 'a1' })], [{ customer_id: 'c1', amount: 150, appointment_id: 'a1', package_id: null }], prices)
    expect(items).toEqual([{ kind: 'appointment', id: 'a1', customerId: 'c1', remaining: 250 }])
  })

  it('ozel fiyat hizmet fiyatinin yerine gecer', () => {
    const items = computeDebtItems([], [appt({ id: 'a1', price_override: 300 })], [], prices)
    expect(items[0].remaining).toBe(300)
  })

  it('tamamlanmamis, iptal ve musterisiz randevular borc yazmaz', () => {
    const items = computeDebtItems(
      [],
      [appt({ id: 'a1', status: 'bekliyor' }), appt({ id: 'a2', status: 'iptal' }), appt({ id: 'a3', customer_id: null })],
      [],
      prices,
    )
    expect(items).toEqual([])
  })

  it('fazla odeme negatif borc uretmez', () => {
    const items = computeDebtItems([], [appt({ id: 'a1' })], [{ customer_id: 'c1', amount: 900, appointment_id: 'a1', package_id: null }], prices)
    expect(items).toEqual([])
  })
})

describe('computeDebtItems — paketler', () => {
  const pkg: DebtPackage = { id: 'p1', customer_id: 'c1', service_id: 'lazer', total_sessions: 4, session_offset: 0 }

  it('hic seans yoksa standart fiyatla tum seanslar beklenir', () => {
    const items = computeDebtItems([pkg], [], [{ customer_id: 'c1', amount: 1000, appointment_id: null, package_id: 'p1' }], prices)
    expect(items).toEqual([{ kind: 'package', id: 'p1', customerId: 'c1', remaining: 4 * 1200 - 1000 }])
  })

  it('seans ucreti ilk seanstaki ozel fiyata kilitlenir', () => {
    const sessions = [
      appt({ id: 's2', package_id: 'p1', service_id: 'lazer', scheduled_at: '2026-10-08T10:00:00Z' }),
      appt({ id: 's1', package_id: 'p1', service_id: 'lazer', scheduled_at: '2026-10-01T10:00:00Z', price_override: 1000 }),
    ]
    // s1 (ilk seans) 1000'e kilitler: 2 acilmis seans + 2 tahmini seans, hepsi 1000
    const items = computeDebtItems([pkg], sessions, [], prices)
    expect(items[0].remaining).toBe(4000)
  })

  it('daha once kullanilmis seanslar (session_offset) beklenene eklenmez', () => {
    const items = computeDebtItems([{ ...pkg, session_offset: 3 }], [], [], prices)
    expect(items[0].remaining).toBe(1200)
  })

  it('paket seanslari tek seferlik randevu borcu olarak ayrica sayilmaz', () => {
    const items = computeDebtItems([pkg], [appt({ id: 's1', package_id: 'p1', service_id: 'lazer' })], [], prices)
    expect(items.map((i) => i.kind)).toEqual(['package'])
  })
})

describe('computeCustomerDebts', () => {
  it('ayni musterinin kalemlerini toplar', () => {
    const debts = computeCustomerDebts(
      [{ id: 'p1', customer_id: 'c1', service_id: 'sac', total_sessions: 1, session_offset: 0 }],
      [appt({ id: 'a1' }), appt({ id: 'a2', customer_id: 'c2' })],
      [],
      prices,
    )
    expect(debts.get('c1')).toBe(800)
    expect(debts.get('c2')).toBe(400)
  })
})
