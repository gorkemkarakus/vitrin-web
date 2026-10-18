import { expect, test } from '@playwright/test'
import { login, uniquePhone } from './helpers.ts'

// Excel/CSV'den musteri ice aktarma (yalnizca genis ekran). Turkce Excel
// CSV'si (noktali virgul, BOM): 2 yeni, 1 dosyada tekrar, 1 hatali (adsiz).
// Musteriler "E2E " onekli; teardown siler.
test.use({ viewport: { width: 1280, height: 860 }, hasTouch: false, isMobile: false })

test.describe('Musteri ice aktarma', () => {
  test('CSV okunur, satirlar siniflanir, yeniler eklenir', async ({ page }) => {
    await login(page)
    const p1 = uniquePhone()
    const p2 = `0533${String(Date.now() + 7).slice(-7)}`
    const csv =
      '﻿Ad Soyad;Telefon;Doğum Tarihi\n' +
      `E2E Şule Öztürk;${p1};12.05.1991\n` +
      `E2E Işıl Çağlar;${p2};\n` +
      `E2E Şule Öztürk;${p1};\n` +
      ';05320000000;\n'

    await page.goto('/musteriler/ice-aktar')
    await page.locator('input[type=file]').setInputFiles({
      name: 'musteriler.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    })
    await expect(page.getByText('2 eklenecek')).toBeVisible()
    await expect(page.getByText('1 tekrar')).toBeVisible()
    await expect(page.getByText('1 hatalı')).toBeVisible()

    await page.getByRole('button', { name: '2 müşteriyi içe aktar' }).click()
    await expect(page.getByRole('heading', { name: '2 müşteri eklendi' })).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Müşterilere git' }).click()
    await page.fill('input[placeholder="İsim veya telefon ara"]', 'e2e isil caglar')
    await expect(page.getByText('E2E Işıl Çağlar').first()).toBeVisible()
  })
})
