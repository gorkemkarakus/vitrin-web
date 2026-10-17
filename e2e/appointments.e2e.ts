import { expect, test } from '@playwright/test'
import { bookAppointment, createCustomer, login, openCard, uniqueName } from './helpers.ts'

test.describe('Randevu', () => {
  test('olustur, duzenle (not), iptal et', async ({ page }) => {
    await login(page)
    const name = uniqueName('Randevu Müşterisi')
    await createCustomer(page, name)

    const { date } = await bookAppointment(page, name)

    // Duzenle: not ekle
    await openCard(page, date, name)
    await page.getByRole('button', { name: 'Düzenle' }).tap()
    await page.fill('#editNote', 'E2E notu')
    await page.getByRole('button', { name: 'Kaydet', exact: true }).tap()
    await expect(page.locator('#editNote')).toBeHidden()

    // Iptal
    await openCard(page, date, name)
    await page.getByRole('button', { name: 'Durumu değiştir' }).tap()
    await page.getByRole('button', { name: 'İptal', exact: true }).tap()
    await page.goto(`/randevular?tarih=${date}`)
    await expect(page.locator('[role=button]', { hasText: name }).first()).toContainText(/İptal/)
  })
})
