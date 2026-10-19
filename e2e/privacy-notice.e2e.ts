import { expect, test } from '@playwright/test'
import { login } from './helpers.ts'

// Salon aydinlatma metni: yonetici bilgileri girer, metin herkese acik
// /aydinlatma/<slug> sayfasinda gorunur. Guzel Salon'a her calistirmada ayni
// ornek bilgiler yazilir (test verisi).
test.describe('Salon aydinlatma metni', () => {
  test('bilgiler kaydedilir ve herkese acik sayfada gorunur', async ({ page, browser }) => {
    await login(page)
    await page.goto('/ayarlar/aydinlatma')
    await page.fill('#noticeLegalName', 'Güzel Salon Güzellik Hizmetleri (örnek)')
    await page.fill('#noticeAddress', 'Örnek Mah. Test Sok. No:1 Kadıköy/İstanbul')
    await page.fill('#noticeEmail', 'kvkk@example.com')
    await page.fill('#noticePhone', '')
    await page.getByRole('button', { name: 'Kaydet' }).tap()
    await expect(page.getByText(/Kaydedildi/)).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Önizleme' }).getByText(/Güzel Salon Güzellik Hizmetleri/),
    ).toBeVisible()

    // Giris yapmamis bir ziyaretci olarak
    const anon = await browser.newContext()
    const pub = await anon.newPage()
    await pub.goto('/aydinlatma/guzel-salon')
    await expect(pub.getByRole('heading', { name: /Aydınlatma Metni/ })).toBeVisible({ timeout: 20_000 })
    await expect(pub.getByText(/Güzel Salon Güzellik Hizmetleri \(örnek\)/).first()).toBeVisible()
    await expect(pub.getByText(/kvkk@example.com/).first()).toBeVisible()
    await expect(pub.getByText('Supabase (Supabase Inc.)', { exact: false }).first()).toBeVisible()

    await pub.goto('/aydinlatma/boyle-bir-salon-yok')
    await expect(pub.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeVisible({ timeout: 20_000 })
    await anon.close()
  })
})
