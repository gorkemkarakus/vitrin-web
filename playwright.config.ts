import { defineConfig } from '@playwright/test'

// Uctan uca testler: uygulamanin web derlemesi telefon boyutunda, gercek
// (paylasilan) Supabase projesine karsi. Test verisi "E2E " onekiyle
// olusturulur ve e2e/global-teardown.ts siler. Ayrintilar: e2e/README.md
const PORT = 5199

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // Ayni test isletmesini paylasiyorlar: sirayla.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  outputDir: 'e2e/.results',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Ek tarayici indirmeden sistemdeki Chrome (CI'da E2E_CHROME_PATH ile).
    launchOptions: {
      executablePath: process.env.E2E_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    },
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
