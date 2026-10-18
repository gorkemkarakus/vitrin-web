import { describe, expect, it } from 'vitest'
import { buildCrmReport, type ReportAppointment } from './crmReport'

const now = new Date('2026-10-18T12:00:00')
const day = (offset: number, hour = 11) => {
  const d = new Date(now)
  d.setDate(d.getDate() + offset)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const appt = (
  id: string,
  customer: string,
  offset: number,
  status = 'tamamlandi',
  source = 'chatbot',
): ReportAppointment => ({
  id,
  customer_id: customer,
  service_id: 's1',
  scheduled_at: day(offset),
  status,
  source,
})

describe('CRM raporu', () => {
  const customers = [
    { id: 'a', full_name: 'Ayşe' },
    { id: 'b', full_name: 'Burak' },
    { id: 'c', full_name: 'Can' },
  ]
  const appointments = [
    // Ayse: 120 gun once ilk, 100 gun once tekrar (60 gun icinde dondu) -> kayip riski (100 gun > 2x20, >45)
    appt('1', 'a', -120),
    appt('2', 'a', -100),
    // Burak: 80 gun once ilk, donmedi
    appt('3', 'b', -80),
    // Can: donemde yeni, bir de gelmedi
    appt('4', 'c', -10, 'tamamlandi', 'online_randevu'),
    appt('5', 'c', -5, 'gelmedi'),
  ]
  const payments = [
    { customer_id: 'a', amount: 1000, paid_at: day(-100) },
    { customer_id: 'c', amount: 400, paid_at: day(-10) },
  ]
  const period = { start: new Date(day(-30, 0)), end: new Date(day(1, 0)) }
  const r = buildCrmReport(appointments, payments, customers, period, now)

  it('donem ozetleri', () => {
    expect(r.visits).toBe(1)
    expect(r.activeCustomers).toBe(1)
    expect(r.newCustomers).toBe(1)
    expect(r.revenue).toBe(400)
    expect(r.noShows).toBe(1)
    expect(r.noShowRate).toBe(0.5)
  })

  it('tekrar gelme yalnizca ilk ziyareti 60 gunden eski olanlarda (donem icinde ilk ziyaret yoksa hesaplanmaz)', () => {
    expect(r.returnBase).toBe(0)
    const all = buildCrmReport(
      appointments,
      payments,
      customers,
      { start: new Date(day(-365, 0)), end: new Date(day(1, 0)) },
      now,
    )
    expect(all.returnBase).toBe(2) // Ayse + Burak (Can 60 gunden yeni)
    expect(all.returnRate).toBe(0.5)
  })

  it('kaybolma riski ve kaynak', () => {
    expect(r.atRisk.map((x) => x.id)).toEqual(['a'])
    expect(r.atRisk[0].spent).toBe(1000)
    expect(r.bySource).toEqual([{ source: 'online_randevu', visits: 1, customers: 1 }])
  })
})
