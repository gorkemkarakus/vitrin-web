import { expect, test, type Page } from '@playwright/test'
import { login, uniqueName, uniquePhone } from './helpers.ts'

// Potansiyel musteriler: telefonda asama secimiyle, genis ekranda surukle-birak.
// "E2E " onekli adaylar (ve donusen musteriler) global-teardown'da silinir.
async function addLead(page: Page, name: string, phone: string) {
  await page.goto('/potansiyel')
  await page.getByRole('button', { name: '+ Ekle' }).click()
  await page.fill('#leadName', name)
  await page.fill('#leadPhone', phone)
  await page.fill('#leadInterest', 'Lazer epilasyon')
  await page.getByRole('dialog').getByRole('button', { name: 'Takibe al' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

test.describe('Potansiyel musteriler (telefon)', () => {
  test('aday eklenir, asamasi degisir, nedeniyle kaybedilir', async ({ page }) => {
    await login(page)
    const name = uniqueName('aday')
    await addLead(page, name, uniquePhone())

    const card = page.locator('article', { hasText: name })
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: `${name} aşaması` }).tap()
    await page.getByRole('option', { name: 'Teklif verildi' }).tap()
    await expect(card).toBeHidden()

    await page.getByRole('tab', { name: /Teklif verildi/ }).tap()
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: `${name} aşaması` }).tap()
    await page.getByRole('option', { name: 'Kaybedildi' }).tap()
    await page.getByRole('dialog').getByRole('button', { name: 'Fiyat yüksek bulundu' }).tap()

    await page.getByRole('tab', { name: /Kaybedildi/ }).tap()
    await expect(card.getByText('Fiyat yüksek bulundu')).toBeVisible()
  })
})

test.describe('Potansiyel musteriler (genis ekran)', () => {
  test.use({ viewport: { width: 1280, height: 860 }, hasTouch: false, isMobile: false })

  test('kart surukle-birakla ilerler, kazanilinca musteri olur', async ({ page }) => {
    await login(page)
    const name = uniqueName('aday genis')
    await addLead(page, name, uniquePhone())

    const card = page.locator('article', { hasText: name })
    const column = (label: string) => page.getByRole('region', { name: label })
    await expect(column('Yeni').locator('article', { hasText: name })).toBeVisible()

    await card.dragTo(column('İletişime geçildi'))
    await expect(column('İletişime geçildi').locator('article', { hasText: name })).toBeVisible()

    await card.dragTo(column('Kazanıldı'))
    await expect(page.getByText(`${name} müşteri olarak kaydedildi.`)).toBeVisible()
    await column('Kazanıldı')
      .locator('article', { hasText: name })
      .getByRole('button', { name: 'Müşteri kartı' })
      .click()
    await expect(page).toHaveURL(/\/musteriler\/[0-9a-f-]{36}$/)
    await expect(page.getByText(name).first()).toBeVisible()
  })
})
