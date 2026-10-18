import { expect, test } from '@playwright/test'
import { login } from './helpers.ts'

// Bilgisayar duzeni: musteri tablosu baslikla siralanir, satir musteri kartini
// acar; mesajlar liste + konusma yan yana. Veri degistirmez.
test.use({ viewport: { width: 1280, height: 860 }, hasTouch: false, isMobile: false })

test.describe('Web duzeni', () => {
  test('musteri tablosu harcamaya gore siralanir ve satir karti acar', async ({ page }) => {
    await login(page)
    await page.goto('/musteriler')
    const table = page.getByRole('table', { name: 'Müşteriler' })
    await expect(table).toBeVisible({ timeout: 20_000 })

    await table.getByRole('button', { name: /Harcama/ }).click()
    await expect(table.locator('th[aria-sort="descending"]')).toHaveText(/Harcama/)
    const amounts = await table
      .locator('tbody tr')
      .evaluateAll((rows) =>
        rows.slice(0, 5).map((r) => Number((r.children[5].textContent ?? '').replace(/[^\d]/g, ''))),
      )
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a))

    const first = table.locator('tbody tr').first()
    const name = (await first.getAttribute('aria-label')) ?? ''
    await first.click()
    await expect(page).toHaveURL(/\/musteriler\/[0-9a-f-]{36}$/)
    await expect(page.getByText(name).first()).toBeVisible()
  })

  test('mesajlar iki panel: konusma listenin yaninda acilir', async ({ page }) => {
    await login(page)
    await page.goto('/mesajlar')
    const list = page.getByRole('complementary', { name: 'Konuşmalar' })
    const thread = page.getByRole('region', { name: 'Konuşma' })
    await expect(thread.getByText('Okumak için soldan bir konuşma seç.')).toBeVisible({ timeout: 20_000 })
    const rows = list.locator('button[class*=convRow]')
    if ((await rows.count()) === 0) return
    await rows.first().click()
    await expect(list).toBeVisible()
    await expect(thread.getByRole('button', { name: 'Konuşmayı kapat' })).toBeVisible()
    await thread.getByRole('button', { name: 'Konuşmayı kapat' }).click()
    await expect(thread.getByText('Okumak için soldan bir konuşma seç.')).toBeVisible()
  })
})
