import { expect, test } from '@playwright/test'
import { login, uniqueName, uniquePhone } from './helpers.ts'

test.describe('Musteri', () => {
  test('yeni musteri eklenir, Turkce/aksansiz aramayla bulunur, izin kaydedilir', async ({ page }) => {
    await login(page)
    const name = uniqueName('Şule Öztürk')
    await page.goto('/musteriler')
    await page.getByRole('button', { name: 'Ekle' }).tap()
    await page.fill('#quickCustomerName', name)
    await page.fill('#quickCustomerPhone', uniquePhone())
    await page.locator('input[role=switch]').check({ force: true })
    await page.getByRole('button', { name: 'Müşteri Ekle' }).tap()

    await page.waitForURL(/\/musteriler\/[0-9a-f-]{36}$/)
    await expect(page.getByText(name).first()).toBeVisible()

    // Liste aramasi: aksansiz "sule ozturk" Turkce harfli ismi bulmali.
    await page.goto('/musteriler')
    await page.fill('input[placeholder="İsim veya telefon ara"]', `e2e sule ozturk ${name.split(' ').pop()}`)
    await expect(page.getByText(name).first()).toBeVisible()

    // Duzenle ekraninda izin acik ve tarihli gorunur.
    await page.getByText(name).first().tap()
    await page.waitForURL(/\/musteriler\//)
    await page.getByRole('button', { name: 'Düzenle' }).first().tap()
    await expect(page.locator('input[role=switch]')).toBeChecked()
    await expect(page.getByText(/tarihinde salonda verildi/)).toBeVisible()
  })
})
