import { expect, type Page } from '@playwright/test'

// Test hesaplari (e2e/README.md). Sifre ortam degiskeniyle degistirilebilir.
export const PASSWORD = process.env.E2E_PASSWORD ?? 'Adapptiv2026!'
export const ADMIN = process.env.E2E_ADMIN_EMAIL ?? 'salon_admin@test.com'

// Test verisi oneki: global-teardown bunlari siler.
export const PREFIX = 'E2E '

export function uniqueName(label: string): string {
  return `${PREFIX}${label} ${Date.now().toString(36)}`
}

export async function login(page: Page, email = ADMIN, password = PASSWORD) {
  await page.goto('/')
  // Acilis animasyonu (AppSplash) bitene kadar.
  const intro = page.locator('button[class*=introBtn]')
  await intro.waitFor({ timeout: 20_000 })
  await intro.tap()
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.locator('form button[type=submit]').tap()
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
}

export async function logout(page: Page) {
  await page.goto('/ayarlar')
  await page.getByRole('button', { name: 'Çıkış yap' }).tap()
  await expect(page.locator('button[class*=introBtn]')).toBeVisible({ timeout: 20_000 })
}

// Turkce telefon: her calistirmada farkli (benzersiz telefon kisiti icin).
export function uniquePhone(): string {
  return `0555${String(Date.now()).slice(-7)}`
}

// Musteriler > Ekle ile musteri olusturur, detay sayfasinda birakir; id doner.
export async function createCustomer(page: Page, name: string, opts: { consent?: boolean } = {}) {
  await page.goto('/musteriler')
  await page.getByRole('button', { name: 'Ekle' }).tap()
  await page.fill('#quickCustomerName', name)
  await page.fill('#quickCustomerPhone', uniquePhone())
  if (opts.consent) await page.locator('input[role=switch]').check({ force: true })
  await page.getByRole('button', { name: 'Müşteri Ekle' }).tap()
  await page.waitForURL(/\/musteriler\/[0-9a-f-]{36}$/)
  return page.url().split('/').pop()!
}

const TR_MONTHS = [
  'ocak',
  'şubat',
  'mart',
  'nisan',
  'mayıs',
  'haziran',
  'temmuz',
  'ağustos',
  'eylül',
  'ekim',
  'kasım',
  'aralık',
]

// "Pazartesi, 26 Ekim" -> "2026-10-26" (yil donumunu hesaba katar).
export function isoFromTrDayLabel(label: string, today = new Date()): string {
  const m = label.toLocaleLowerCase('tr').match(/(\d{1,2})\s+([a-zçğıöşü]+)/)
  if (!m) throw new Error(`Tarih okunamadi: ${label}`)
  const month = TR_MONTHS.indexOf(m[2])
  let year = today.getFullYear()
  if (month < today.getMonth()) year += 1
  return `${year}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Yeni randevu formunda musteriyi secer, gelecek haftanin ilk acik gunu ve
// ilk bos saatini secip kaydeder. Randevunun tarihini (YYYY-MM-DD) doner.
export async function bookAppointment(page: Page, customerName: string) {
  await page.goto('/randevular?yeni=1')
  await page.locator('input[placeholder*="Ad ya da telefon"]').fill(customerName)
  // Isim kayitta Turkce bas harfe cevrilir (E2E -> E2e): buyuk/kucuk harf duyarsiz.
  await page
    .getByRole('button', { name: new RegExp('^' + escapeRe(customerName), 'i') })
    .first()
    .tap()
  await page.locator('[class*=serviceChips] button').first().tap()
  await page.getByRole('button', { name: 'Sonraki günler' }).tap()
  // Gecmis/bugun ile karismasin: gelecek haftanin ilk acik gunu.
  const day = page.locator('button[class*=formDay]:not([disabled]):not([class*=formDayActive])').first()
  const dayNum = (await day.locator('[class*=formDayNum]').innerText()).trim()
  await day.tap()
  await expect(page.locator('button[class*=formDayActive] [class*=formDayNum]')).toHaveText(dayNum)
  const hint = page
    .locator('[class*=fHint]')
    .filter({ hasText: new RegExp(`\\b${dayNum}\\b`) })
    .first()
  const dayLabel = (await hint.innerText()).trim()
  const time = page
    .locator('button[class*=timeCell]:not([disabled]):not([class*=timeCellOff])')
    .filter({ hasText: /^\d\d:\d\d$/ })
    .first()
  const timeText = (await time.innerText()).trim()
  await time.tap()
  await expect(page.locator('button[class*=timeCellActive]')).toHaveText(timeText)
  const saved = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/appointments') && r.request().method() === 'POST',
    { timeout: 20_000 },
  )
  await page.locator('button[type=submit]', { hasText: 'Randevuyu kaydet' }).tap()
  const res = await saved.catch(async () => {
    const err = await page.locator('[class*=error], [role=alert]').allInnerTexts()
    throw new Error(`Randevu kaydi gonderilmedi. Ekrandaki hata: ${err.join(' | ') || '(yok)'}`)
  })
  expect(res.status(), await res.text()).toBe(201)
  return { date: isoFromTrDayLabel(dayLabel), time: timeText }
}

export async function openCard(page: Page, date: string, customerName: string) {
  await page.goto(`/randevular?tarih=${date}`)
  await page.locator('[role=button]', { hasText: customerName }).first().tap()
  await expect(page.getByRole('button', { name: 'Durumu değiştir' })).toBeVisible()
}
