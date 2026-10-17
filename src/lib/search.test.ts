import { describe, expect, it } from 'vitest'
import { matchesSearch, normalizeForSearch } from './search'

describe('Turkce arama', () => {
  it('buyuk İ ve I harflerini dogru kucultur', () => {
    expect(normalizeForSearch('İpek IŞIK')).toBe('ipek isik')
  })

  it('aksansiz yazilan sorgu Turkce harfli ismi bulur', () => {
    expect(matchesSearch('sule', 'Şule Öztürk')).toBe(true)
    expect(matchesSearch('cigdem', 'Çiğdem')).toBe(true)
    expect(matchesSearch('ozturk', 'Şule Öztürk')).toBe(true)
    expect(matchesSearch('ipek', 'İpek Yılmaz')).toBe(true)
  })

  it('Turkce harfli sorgu da calisir, birden cok alana bakar', () => {
    expect(matchesSearch('Yılmaz', 'Ayşe Yılmaz')).toBe(true)
    expect(matchesSearch('0532', 'Ayşe', '05321234567')).toBe(true)
    expect(matchesSearch('zeynep', 'Ayşe', null)).toBe(false)
  })

  it('bos sorgu her seyle eslesir', () => {
    expect(matchesSearch('  ', 'herhangi')).toBe(true)
  })
})
