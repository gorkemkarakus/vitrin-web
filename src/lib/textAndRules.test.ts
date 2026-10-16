import { describe, expect, it } from 'vitest'
import { firstName, formatPersonName, initials } from './formatName'
import { newPasswordError, passwordChecks } from './passwordRules'
import { presetFor } from './permissions'
import { segmentForStats } from './customerSegments'

describe('formatPersonName', () => {
  it('bosluklari toparlar ve Turkce buyuk harf kurallarina uyar', () => {
    expect(formatPersonName('  ışıl   İNCE ')).toBe('Işıl İnce')
    expect(formatPersonName('ayşe-nur demir')).toBe('Ayşe-Nur Demir')
  })
})

describe('initials / firstName', () => {
  it('ilk iki kelimenin bas harfleri, Turkce buyuk harfle', () => {
    expect(initials('ilknur yılmaz')).toBe('İY')
    expect(initials('Ayşe Nur Demir')).toBe('AN')
    expect(initials('   ')).toBe('?')
  })

  it('ilk ad, yoksa tire', () => {
    expect(firstName('Ayşe Demir')).toBe('Ayşe')
    expect(firstName(null)).toBe('—')
  })
})

describe('newPasswordError / passwordChecks', () => {
  it('kisa ve eslesmeyen sifreyi reddeder', () => {
    expect(newPasswordError('Abc12', 'Abc12')).toMatch(/en az 8/)
    expect(newPasswordError('Deneme123', 'Deneme12')).toBe('Şifreler eşleşmiyor.')
    expect(newPasswordError('Deneme123', 'Deneme123')).toBeNull()
  })

  it('guc gostergesi 0-4 arasi', () => {
    expect(passwordChecks('').strength).toBe(0)
    expect(passwordChecks('deneme12').strength).toBe(2)
    expect(passwordChecks('Deneme1234').strength).toBe(4)
    expect(passwordChecks('Çiçek123').hasUpper).toBe(true)
  })
})

describe('presetFor', () => {
  it('yonetici rolu her zaman Yonetici', () => {
    expect(presetFor('admin', new Set())).toBe('yonetici')
  })

  it('yetkiler hazir role birebir uyuyorsa o rol, degilse null', () => {
    expect(presetFor('user', new Set(['odeme_al', 'kendi_kazanc']))).toBe('calisan')
    expect(presetFor('user', new Set(['randevu_tumu_gor', 'randevu_tumu_duzenle', 'odeme_al', 'mesajlar']))).toBe('resepsiyon')
    expect(presetFor('user', new Set(['odeme_al']))).toBeNull()
  })
})

describe('segmentForStats', () => {
  it('bu ay eklenen Yeni, 3+ tamamlanan Sadik; Yeni onceliklidir', () => {
    expect(segmentForStats({ isNewThisMonth: true, completedCount: 5 })).toBe('yeni')
    expect(segmentForStats({ isNewThisMonth: false, completedCount: 3 })).toBe('sadik')
    expect(segmentForStats({ isNewThisMonth: false, completedCount: 2 })).toBeNull()
  })
})
