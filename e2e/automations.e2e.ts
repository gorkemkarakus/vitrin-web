import { expect, test } from '@playwright/test'
import { login } from './helpers.ts'

// Otomasyonlar (yalnizca genis ekran): bir kural acilir, sayfa yenilenince acik
// kalir, sonra eski haline (kapali) dondurulur. Calistirma yapilmaz.
test.use({ viewport: { width: 1280, height: 860 }, hasTouch: false, isMobile: false })

test.describe('Otomasyonlar', () => {
  test('kural acilip kapatilir ve kayitli kalir', async ({ page }) => {
    await login(page)
    await page.goto('/otomasyonlar')
    const card = page.locator('section', { has: page.getByRole('heading', { name: 'Yeni müşteri takibi' }) })
    const toggle = card.getByRole('switch')
    const before = await toggle.isChecked()

    await toggle.setChecked(!before, { force: true })
    await expect(toggle).toBeChecked({ checked: !before })
    await page.waitForTimeout(1000)
    await page.reload()
    await expect(
      page.locator('section', { has: page.getByRole('heading', { name: 'Yeni müşteri takibi' }) }).getByRole('switch'),
    ).toBeChecked({ checked: !before, timeout: 20_000 })

    const again = page
      .locator('section', { has: page.getByRole('heading', { name: 'Yeni müşteri takibi' }) })
      .getByRole('switch')
    await again.setChecked(before, { force: true })
    await expect(again).toBeChecked({ checked: before })
    await page.waitForTimeout(1000)
  })
})
