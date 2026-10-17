import { expect, test } from '@playwright/test'
import { createCustomer, login, uniqueName } from './helpers.ts'

// Gercek musterilere dokunmamak icin yalnizca iki test musterisinden olusan
// bir grup kurulur; biri kampanya izinli, digeri izinsiz.
test.describe('Toplu mesaj', () => {
  test('yalnizca kampanya izni olan musteriye gider, ret satiri eklenir', async ({ page }) => {
    await login(page)
    const tag = Date.now().toString(36)
    const withConsent = uniqueName(`İzinli ${tag}`)
    const without = uniqueName(`İzinsiz ${tag}`)
    await createCustomer(page, withConsent, { consent: true })
    await createCustomer(page, without)

    await page.goto('/toplu-mesaj')
    await page.getByRole('button', { name: 'Kendin seç' }).tap()
    const groupName = `E2E grup ${tag}`
    await page.fill('#groupName', groupName)
    await page.fill('input[placeholder="Müşteri ara…"]', tag)
    for (const row of await page.locator('button[class*=pickerRow]').all()) await row.tap()
    await page.getByRole('button', { name: 'Grubu Oluştur' }).tap()

    await page.locator('button', { hasText: new RegExp(`^${groupName} · 2$`, 'i') }).tap()
    await expect(page.getByText('Kampanya izni yok')).toBeVisible()
    await expect(page.getByText('1 kişiye gitmez')).toBeVisible()

    await page.fill('#campaignText', 'E2E kampanya: bu hafta %10 indirim')
    await page.getByRole('button', { name: 'Önizle' }).tap()
    await expect(page.getByText(/RET yazın/)).toBeVisible()
    await page.getByRole('button', { name: 'Kapat' }).tap()

    await page.getByRole('button', { name: '1 kişiye gönder' }).tap()
    await expect(page.getByText(/— 1 kişi/)).toBeVisible()
    await page.getByRole('button', { name: 'Gönder', exact: true }).tap()
    await expect(page.getByText(/1<\/strong>|1 müşteri için mesaj kaydedildi/)).toBeVisible({ timeout: 30_000 })
  })
})
