import { expect, test } from '@playwright/test'
import { createCustomer, login, uniqueName } from './helpers.ts'

// 8x8 kirmizi PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
  'base64',
)

// Musteri karti: "Sonrasi" fotografi yuklenir, kucuk resim gorunur, silinir
// (depodaki dosya da gider; musteri teardown'da silinir).
test.describe('Musteri dosyalari', () => {
  test('fotograf yuklenir, gorunur ve silinir', async ({ page }) => {
    await login(page)
    await createCustomer(page, uniqueName('Dosya Testi'))

    const section = page.locator('section[aria-labelledby=customerFilesTitle]')
    await section.getByRole('radio', { name: 'Sonrası' }).click()
    await section.locator('input[type=file]').setInputFiles({ name: 'sonrasi.png', mimeType: 'image/png', buffer: PNG })
    await expect(section.locator('img')).toHaveCount(1, { timeout: 30_000 })
    await expect(section.locator('figure').getByText('Sonrası')).toBeVisible()

    await section.getByRole('button', { name: 'sonrasi.png sil' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click()
    await expect(section.locator('img')).toHaveCount(0)
  })
})
