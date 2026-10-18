import { expect, test } from '@playwright/test'
import { login } from './helpers.ts'
import { runSql } from './supabase-sql.ts'

// Memnuniyet anketi: Guzel Salon'un tamamlanmis iki randevusuna bilinen
// jetonlarla anket acilir (e0e0 onekli). Musteri giris yapmadan puan verir;
// dusuk puan gorev acar ve sonuc ekraninda gorunur. Sonunda hepsi silinir.
const rand = () => Array.from({ length: 60 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
const LOW = `e0e0${rand()}`
const HIGH = `e0e0${rand()}`
const COMMENT = `E2E bekleme uzundu ${Date.now().toString(36)}`

function surveyInsert(token: string) {
  return `insert into public.surveys (business_id, appointment_id, customer_id, token)
    select a.business_id, a.id, a.customer_id, '${token}' from public.appointments a
    where a.business_id = (select business_id from public.profiles where id = (select id from auth.users where email = 'salon_admin@test.com'))
      and a.status = 'tamamlandi' and a.customer_id is not null
      and a.id not in (select appointment_id from public.surveys)
    order by a.scheduled_at desc limit 1;`
}

test.describe('Memnuniyet anketi', () => {
  test.beforeAll(() => {
    runSql(surveyInsert(LOW) + surveyInsert(HIGH), 'Test anketi')
  })

  test.afterAll(() => {
    runSql(
      `delete from public.tasks where id in (select task_id from public.surveys where token like 'e0e0%');
       delete from public.surveys where token like 'e0e0%';`,
      'Test anketini silme',
    )
  })

  test('dusuk puan: tesekkur, ikinci kez yanitlanamaz, sonuclarda gorunur', async ({ page }) => {
    await page.goto(`/anket/${LOW}`)
    await expect(page.getByRole('heading', { name: /nasıldı\?/ })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('radio', { name: /^2 —/ }).tap()
    await expect(page.getByText('Neyi daha iyi yapabilirdik?')).toBeVisible()
    await page.fill('#surveyComment', COMMENT)
    await page.getByRole('button', { name: 'Gönder' }).tap()
    await expect(page.getByText(/yöneticisine iletildi/)).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Bu anket yanıtlandı' })).toBeVisible({ timeout: 20_000 })

    await login(page)
    await page.goto('/memnuniyet')
    const answer = page.locator('div', { hasText: COMMENT }).last()
    await expect(answer).toBeVisible({ timeout: 20_000 })
    await expect(answer.getByText(/görev açıldı/)).toBeVisible()
  })

  test('yuksek puan: tesekkur ekrani', async ({ page }) => {
    await page.goto(`/anket/${HIGH}`)
    await page.getByRole('radio', { name: /^5 —/ }).tap()
    await page.getByRole('button', { name: 'Gönder' }).tap()
    await expect(page.getByRole('heading', { name: 'Teşekkürler!' })).toBeVisible()
    await expect(page.getByText(/ekibi sizi bekliyor/)).toBeVisible()
  })

  test('uydurma baglanti', async ({ page }) => {
    await page.goto(`/anket/${'0'.repeat(64)}`)
    await expect(page.getByRole('heading', { name: 'Anket bulunamadı' })).toBeVisible({ timeout: 20_000 })
  })
})
