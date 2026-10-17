import { expect, test } from '@playwright/test'
import { ADMIN, login, logout } from './helpers.ts'

test.describe('Giris / cikis', () => {
  test('yanlis sifre Turkce hata gosterir, dogru sifreyle girilir ve cikilir', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[class*=introBtn]').tap()
    await page.fill('input[type=email]', ADMIN)
    await page.fill('input[type=password]', 'yanlis-sifre-123')
    await page.locator('form button[type=submit]').tap()
    await expect(page.locator('p[class*=error]')).toBeVisible()
    await expect(page).not.toHaveURL(/dashboard/)

    await login(page)
    await expect(page.getByText('Bugünkü tahsilat')).toBeVisible()

    await logout(page)
    // Oturum kapandiktan sonra korumali sayfa giris ekranina doner.
    await page.goto('/musteriler')
    await expect(page.locator('button[class*=introBtn]')).toBeVisible()
  })

  test('yasal sayfalar oturumsuz acilir', async ({ page }) => {
    for (const [path, title] of [
      ['/gizlilik', 'Gizlilik Politikası'],
      ['/kvkk', 'KVKK Aydınlatma Metni'],
      ['/kullanim-kosullari', 'Kullanım Koşulları'],
      ['/hesap-silme', 'Hesap ve veri silme'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    }
  })
})
