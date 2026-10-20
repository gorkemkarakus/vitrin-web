import { describe, expect, it } from 'vitest'
import { currencySmart } from './currency'

describe('currencySmart', () => {
  it('tam tutarda kurus yazmaz, kuruslu tutarda yazar', () => {
    expect(currencySmart.format(71221)).not.toContain(',')
    expect(currencySmart.format(71221.5)).toContain(',50')
    expect(currencySmart.format(0.1 + 0.2)).toContain(',30')
  })
})
