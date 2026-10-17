import { readFileSync } from 'node:fs'
import { expect, test, type Download, type Page } from '@playwright/test'
import { login } from './helpers.ts'

async function bytesOf(download: Download) {
  const path = await download.path()
  return readFileSync(path!)
}

async function downloadFrom(page: Page, trigger: () => Promise<void>) {
  const pending = page.waitForEvent('download', { timeout: 90_000 })
  await trigger()
  return pending
}

test.describe('Disari aktarma', () => {
  test('Verilerimi indir gecerli bir Excel dosyasi uretir', async ({ page }) => {
    await login(page)
    await page.goto('/ayarlar')
    await page.getByRole('button', { name: /Verilerimi indir/ }).tap()
    const d = await downloadFrom(page, () => page.locator('button[class*=footerBtn]').tap())
    expect(d.suggestedFilename()).toMatch(/\.xlsx$/)
    const bytes = await bytesOf(d)
    // xlsx = zip: "PK" imzasi ve icinde calisma kitabi.
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(bytes.includes(Buffer.from('xl/workbook.xml'))).toBe(true)
    expect(bytes.length).toBeGreaterThan(2_000)
  })

  test('Kasa ve performans raporlari PDF olarak iner', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    for (const url of ['/muhasebe', '/performans-raporu']) {
      await page.goto(url)
      const btn = page.locator('button[class*=exportBtn]').first()
      await btn.scrollIntoViewIfNeeded()
      const d = await downloadFrom(page, () => btn.click())
      expect(d.suggestedFilename()).toMatch(/\.pdf$/)
      const bytes = await bytesOf(d)
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
      expect(bytes.length).toBeGreaterThan(5_000)
    }
  })
})
