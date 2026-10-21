import { expect, test } from '@playwright/test'
import { login } from './helpers.ts'
import { runSql } from './supabase-sql.ts'

// Sadakat karti: Guzel Salon'da program yoksa acilir (5 ziyaret, gecmis
// randevular sayilir). Odulu hazir bir musteriye odul kullandirilir; test
// sonunda bu kullanim geri alinir (kart eski haline doner).
const ADMIN_BUSINESS = `(select business_id from public.profiles where id = (select id from auth.users where email = 'salon_admin@test.com'))`

test.describe('Sadakat karti', () => {
  test.beforeAll(() => {
    runSql(
      `insert into public.loyalty_programs (business_id, visits_required, reward, counts_from)
       values (${ADMIN_BUSINESS}, 5, 'Ücretsiz fön', now() - interval '1 year')
       on conflict (business_id) do update set enabled = true;`,
      'Sadakat programi',
    )
  })

  test.afterAll(() => {
    runSql(
      `delete from public.loyalty_redemptions
       where business_id = ${ADMIN_BUSINESS} and redeemed_at > now() - interval '10 minutes';`,
      'Odul kullanimini geri alma',
    )
  })

  test('odulu hazir musteriye odul kullandirilir', async ({ page }) => {
    await login(page)
    await page.goto('/sadakat')
    const ready = page.getByRole('region', { name: /Ödülü hazır/ })
    const first = ready.locator('button[class*=name]').first()
    await expect(first).toBeVisible({ timeout: 20_000 })
    await first.tap()

    await expect(page).toHaveURL(/\/musteriler\//)
    const card = page.getByRole('region', { name: 'Sadakat kartı' })
    await expect(card.getByText(/ödül hazır/i)).toBeVisible({ timeout: 20_000 })
    await card.getByRole('button', { name: 'Ödülü kullandır' }).tap()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Kullandır' }).tap()
    await expect(card.getByText('Ödül kullanıldı.')).toBeVisible()
  })
})
