import { expect, test } from '@playwright/test'
import { login, uniqueName } from './helpers.ts'

// Gorevler: ekle (varsayilan yarin, bana atanmis), listede gor, tamamla.
// "E2E " onekli gorevler global-teardown'da silinir.
test.describe('Gorevler', () => {
  test('gorev eklenir, bana dusenlerde gorunur, tamamlaninca listeden cikar', async ({ page }) => {
    await login(page)
    const title = uniqueName('müşteriyi ara')
    await page.goto('/gorevler')
    await page.getByRole('button', { name: '+ Görev' }).tap()
    await page.fill('#taskTitle', title)
    await page.getByRole('button', { name: 'Yarın', exact: true }).tap()
    await page.getByRole('button', { name: 'Görevi ekle' }).tap()

    const row = page.getByText(title)
    await expect(row).toBeVisible()
    await expect(page.getByText('Yarın').first()).toBeVisible()

    await page.getByRole('button', { name: `${title}: tamamlandı olarak işaretle` }).tap()
    await expect(page.getByRole('button', { name: `${title}: tamamlandı olarak işaretle` })).toBeHidden()
    await page.getByRole('button', { name: /tamamlanan/ }).tap()
    await expect(page.getByRole('button', { name: `${title}: tamamlanmadı olarak işaretle` })).toBeVisible()
  })
})
