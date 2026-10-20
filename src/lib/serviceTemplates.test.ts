import { describe, expect, it } from 'vitest'
import { SERVICE_TEMPLATE_GROUPS, serviceNameKey } from './serviceTemplates'

describe('hazir hizmet listesi', () => {
  it('adlar tekrar etmez ve sureler makul', () => {
    const all = SERVICE_TEMPLATE_GROUPS.flatMap((g) => g.items)
    const keys = all.map((s) => serviceNameKey(s.name))
    expect(new Set(keys).size).toBe(keys.length)
    for (const s of all) {
      expect(s.duration).toBeGreaterThanOrEqual(5)
      expect(s.duration).toBeLessThanOrEqual(480)
    }
  })

  it('karsilastirma anahtari harf ve bosluk farkini yok sayar', () => {
    expect(serviceNameKey('  SAÇ   Kesimi ')).toBe(serviceNameKey('saç kesimi'))
    expect(serviceNameKey('Işıl')).toBe('ışıl')
  })
})
