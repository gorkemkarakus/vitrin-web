import { expect, test } from '@playwright/test'

// Kendi kendine kayit: form -> "E-postani kontrol et" (kod ekrani); yanlis
// kod reddedilir; onaylanmamis hesapla giris denenince ayni ekran gelir.
// Adres @example.com: ayrilmis alan adi, Supabase e-posta GONDERMEZ (gercek
// SMTP ile test.com gibi bir adrese gonderilseydi geri donup alan adinin
// gonderici itibarini dusururdu). Olusan hesap ve isletme global-teardown'da
// silinir.
test.describe('Kayit', () => {
  test('yeni salon kaydi e-posta kodu bekler, onaysiz giris yapilamaz', async ({ page }) => {
    const email = `e2e-kayit-${Date.now().toString(36)}@example.com`
    const password = 'Kayit9-deneme-salon'

    await page.goto('/')
    await page.getByRole('button', { name: 'Ücretsiz hesap oluştur' }).tap()
    await page.fill('#regBusiness', 'E2E Kayit Salonu')
    await page.fill('#regName', 'E2E Deneme Kisi')
    await page.fill('#regEmail', email)
    await page.fill('#regPassword', password)
    await page.fill('#regPasswordConfirm', password)

    // Kosullar onaylanmadan gonderilemez.
    await page.getByRole('button', { name: 'Hesabı oluştur' }).tap()
    await expect(page.locator('p[class*=error]')).toContainText('Kullanım Koşulları')

    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Hesabı oluştur' }).tap()
    await expect(page.getByRole('heading', { name: 'E-postanı kontrol et' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(email)).toBeVisible()

    // Yanlis kod: giris yapilmaz, Turkce hata.
    await page.fill('#signupCode', '000000')
    await page.getByRole('button', { name: 'Doğrula ve giriş yap' }).tap()
    await expect(page.locator('p[class*=error]')).toContainText('Kod hatalı', { timeout: 30_000 })
    await expect(page).not.toHaveURL(/dashboard/)

    await page.getByRole('button', { name: 'Girişe dön' }).tap()
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    await page.locator('form button[type=submit]').tap()
    await expect(page.getByRole('heading', { name: 'E-postanı kontrol et' })).toBeVisible({ timeout: 30_000 })
    await expect(page).not.toHaveURL(/dashboard/)
  })
})
