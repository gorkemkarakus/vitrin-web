import { expect, test } from '@playwright/test'
import { login, PASSWORD, uniqueName, uniquePhone } from './helpers.ts'

// Gercek bir hesabi silmemek icin once yonetici yeni bir calisan acar, sonra
// o calisan kendi hesabini uygulama icinden siler (Ayarlar > Hesabimi sil).
test.describe('Hesap silme', () => {
  test('calisan kendi hesabini siler, ayni bilgilerle artik giremez', async ({ page, browser }) => {
    test.setTimeout(150_000)
    const email = `e2e-${Date.now().toString(36)}@test.com`

    await login(page)
    await page.goto('/ekip/yeni')
    await page.fill('#fullName', uniqueName('Silinecek Çalışan'))
    await page.fill('#newPhone', uniquePhone())
    await page.fill('#newEmail', email)
    await page.fill('#newPassword', PASSWORD)
    await page.getByRole('button', { name: /Devam · yetkiler/ }).tap()
    // Ilk giriste sifre degistirme ekrani acilmasin.
    const mustChange = page.locator('label', { hasText: 'İlk girişte kendi şifresini belirlesin' }).locator('input')
    if (await mustChange.isChecked()) await mustChange.uncheck({ force: true })
    await page.getByRole('button', { name: 'Kaydet ve davet hazırla' }).tap()
    await expect(page.getByRole('heading', { name: 'Hesap açıldı' })).toBeVisible({ timeout: 30_000 })

    // Calisan olarak ayri bir oturumda gir ve hesabini sil.
    const ctx = await browser.newContext()
    const emp = await ctx.newPage()
    await login(emp, email, PASSWORD)
    await emp.goto('/ayarlar')
    await emp.getByRole('button', { name: /Hesabımı sil/ }).tap()
    await emp.fill('#deletePassword', PASSWORD)
    await emp.getByRole('button', { name: 'Hesabımı kalıcı olarak sil' }).tap()
    await expect(emp.locator('button[class*=introBtn]')).toBeVisible({ timeout: 30_000 })

    // Ayni bilgilerle giris artik basarisiz.
    await emp.locator('button[class*=introBtn]').tap()
    await emp.fill('input[type=email]', email)
    await emp.fill('input[type=password]', PASSWORD)
    await emp.locator('form button[type=submit]').tap()
    await expect(emp.locator('p[class*=error]')).toBeVisible()
    await ctx.close()
  })

  test('uygulamaya giremeyen kullanici web formundan silme talebi birakir', async ({ page }) => {
    await page.goto('/hesap-silme')
    await page.fill('#delContact', `e2e-talep-${Date.now().toString(36)}@test.com`)
    await page.getByRole('button', { name: 'Silme talebini gönder' }).tap()
    await expect(page.getByRole('status')).toContainText('Talebiniz alındı')
  })
})
