import { expect, test } from '@playwright/test'
import { createCustomer, login, uniqueName } from './helpers.ts'

// 360° musteri karti (telefon gorunumu): Bilgiler (etiket, dogum gunu) ve
// Gecmis sekmesinde arama kaydi. Musteri "E2E " onekli; teardown siler
// (aktiviteler musteriyle birlikte kademeli gider).
test.describe('Musteri karti (CRM)', () => {
  test('etiket ve dogum gunu kaydedilir, arama notu gecmiste gorunur', async ({ page }) => {
    await login(page)
    await createCustomer(page, uniqueName('Kart Testi'))

    // Bilgiler: bos kartta "Ekle"
    await page.getByRole('heading', { name: 'Bilgiler' }).waitFor()
    await page.getByRole('button', { name: 'Ekle', exact: true }).tap()
    await page.fill('#crmBirthday', '1990-03-15')
    await page.fill('#crmTag', 'E2E etiket')
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Bilgileri kaydet' }).tap()
    await expect(page.getByRole('heading', { name: 'Bilgileri düzenle' })).toBeHidden()
    await expect(page.getByText('E2E etiket')).toBeVisible()
    await expect(page.getByText(/15 Mart/)).toBeVisible()

    // Gecmis: arama kaydi
    await page.getByRole('button', { name: 'Geçmiş' }).tap()
    await page.getByRole('radio', { name: 'Arama' }).tap()
    await page.getByLabel('Arama yaz').fill('E2E arandı, Cuma için randevu istiyor')
    await page.getByRole('button', { name: 'Kaydet', exact: true }).tap()
    await expect(page.getByText('E2E arandı, Cuma için randevu istiyor')).toBeVisible()
    // Kayit olusturma da gecmiste
    await expect(page.getByText('Müşteri kaydı oluşturuldu')).toBeVisible()
  })
})
