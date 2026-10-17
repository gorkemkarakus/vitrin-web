import { expect, test } from '@playwright/test'
import { bookAppointment, createCustomer, login, openCard, uniqueName } from './helpers.ts'

test.describe('Borc / odeme', () => {
  test('odemesiz tamamlanan randevu borc yazar, odeme alininca kalan sifirlanir', async ({ page }) => {
    await login(page)
    const name = uniqueName('Borç Müşterisi')
    const customerId = await createCustomer(page, name)
    const { date } = await bookAppointment(page, name)

    // Tamamla: kaydirmali onay klavyeyle de calisir.
    await openCard(page, date, name)
    await page.getByRole('button', { name: 'Tamamlamak için kaydır' }).press('Enter')
    await page.getByRole('button', { name: /Şimdi ödeme yok/ }).tap()
    const submit = page.locator('button[class*=fsSubmit]')
    await expect(submit).toBeEnabled()
    await submit.tap()
    await expect(submit).toBeHidden({ timeout: 20_000 })

    const remaining = () => page.locator('[class*=balanceCol]').nth(1)
    await page.goto(`/musteriler/${customerId}`)
    await expect(remaining()).not.toContainText('Borç yok')
    const due = (await remaining().innerText()).match(/[\d.]+/)?.[0]?.replace(/\./g, '')
    expect(Number(due)).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Ödeme', exact: true }).tap()
    await page.fill('input[type=number]', due!)
    await page.tap('#payMethod')
    await page.getByRole('option', { name: 'Nakit' }).tap()
    await page.locator('form button[type=submit]').last().tap()
    await expect(remaining()).toContainText('Borç yok')
  })
})
