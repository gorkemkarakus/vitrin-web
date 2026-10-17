import { describe, expect, it } from 'vitest'
import { isIstanbulOffset } from './date'

describe('isIstanbulOffset', () => {
  it('UTC+3 disindaki ofsetleri yakalar', () => {
    const fake = (offset: number) => ({ getTimezoneOffset: () => offset }) as Date
    expect(isIstanbulOffset(fake(-180))).toBe(true)
    expect(isIstanbulOffset(fake(0))).toBe(false)
    expect(isIstanbulOffset(fake(-120))).toBe(false)
  })
})
