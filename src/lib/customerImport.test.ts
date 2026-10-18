import { describe, expect, it } from 'vitest'
import {
  buildCandidates,
  guessField,
  normalizeImportPhone,
  parseBirthday,
  parseCsv,
  parseSource,
} from './customerImport'

describe('musteri ice aktarma', () => {
  it('basliklardan alani tahmin eder', () => {
    expect(guessField('Ad Soyad')).toBe('full_name')
    expect(guessField('ADI')).toBe('first_name')
    expect(guessField('Soyadı')).toBe('last_name')
    expect(guessField('Cep Telefonu')).toBe('phone')
    expect(guessField('E-Posta')).toBe('email')
    expect(guessField('Doğum Tarihi')).toBe('birthday')
    expect(guessField('Kan grubu')).toBe('skip')
  })

  it('Turkce Excel CSV (noktali virgul, tirnak) okur', () => {
    const rows = parseCsv(
      '﻿Ad Soyad;Telefon;Not\n"Demir, Ayşe";0532 111 22 33;"Boya ""7.1"""\n\nCan Avcı;5321112234;\n',
    )
    expect(rows).toEqual([
      ['Ad Soyad', 'Telefon', 'Not'],
      ['Demir, Ayşe', '0532 111 22 33', 'Boya "7.1"'],
      ['Can Avcı', '5321112234', ''],
    ])
  })

  it('telefon ve tarihleri donusturur', () => {
    expect(normalizeImportPhone('+90 (532) 111 22 33')).toBe('05321112233')
    expect(normalizeImportPhone('5321112233')).toBe('05321112233')
    expect(parseBirthday('15.03.1990')).toBe('1990-03-15')
    expect(parseBirthday('1990-03-15')).toBe('1990-03-15')
    expect(parseBirthday('32947')).toBe('1990-03-15')
    expect(parseBirthday('31.02.1990')).toBeNull()
    expect(parseSource('Instagram reklamı')).toBe('instagram')
  })

  it('satirlari siniflandirir: yeni, mevcut, tekrar, hatali', () => {
    const rows = [
      ['Ad', 'Soyad', 'Telefon'],
      ['ayşe', 'DEMİR', '0532 111 22 33'],
      ['Can', 'Avcı', '05329998877'],
      ['Ayşe', 'Demir', '+905321112233'],
      ['', '', '0532 000 00 00'],
    ]
    const res = buildCandidates(rows, ['first_name', 'last_name', 'phone'], {
      hasHeader: true,
      existingPhoneKeys: new Set(['5329998877']),
    })
    expect(res.map((r) => r.status)).toEqual(['yeni', 'mevcut', 'tekrar', 'hatali'])
    expect(res[0].full_name).toBe('Ayşe Demir')
    expect(res[0].phone).toBe('05321112233')
  })
})
