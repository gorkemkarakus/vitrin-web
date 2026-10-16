import { describe, expect, it } from 'vitest'
import { presetDateRange, timeToMinutes, toLocalDateString } from './date'

describe('toLocalDateString', () => {
  it('yerel tarihi YYYY-MM-DD bicimine cevirir', () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('timeToMinutes', () => {
  it('saat:dakika -> gun basindan dakika', () => {
    expect(timeToMinutes('00:00')).toBe(0)
    expect(timeToMinutes('09:30')).toBe(570)
    expect(timeToMinutes('23:45')).toBe(1425)
  })
})

describe('presetDateRange', () => {
  const wednesday = new Date(2026, 9, 14) // 14 Ekim 2026 Carsamba

  it('bu hafta pazartesiden baslar', () => {
    expect(presetDateRange('bu_hafta', wednesday)).toEqual({ start: '2026-10-12', end: '2026-10-14' })
  })

  it('pazar gunu bir onceki pazartesiye gider', () => {
    expect(presetDateRange('bu_hafta', new Date(2026, 9, 18))).toEqual({ start: '2026-10-12', end: '2026-10-18' })
  })

  it('bu ay ve gecen ay', () => {
    expect(presetDateRange('bu_ay', wednesday)).toEqual({ start: '2026-10-01', end: '2026-10-14' })
    expect(presetDateRange('gecen_ay', wednesday)).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  it('ocakta gecen ay bir onceki yilin araligidir', () => {
    expect(presetDateRange('gecen_ay', new Date(2026, 0, 10))).toEqual({ start: '2025-12-01', end: '2025-12-31' })
  })
})
