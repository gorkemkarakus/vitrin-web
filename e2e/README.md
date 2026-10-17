# Uçtan uca (E2E) testler

Playwright ile uygulamanın web derlemesi telefon boyutunda (390×844, dokunmatik, `tr-TR`, `Europe/Istanbul`) **gerçek Supabase projesine** karşı çalıştırılır. Capacitor uygulaması aynı web kodunu WebView'de çalıştırdığı için akışlar telefondakiyle aynıdır; yalnızca yerel eklentiler (paylaş sayfası, güvenli depolama, bildirim) tarayıcıdaki karşılıklarıyla çalışır.

```bash
npm run test:e2e                 # hepsi (geliştirme sunucusunu kendisi açar/yeniden kullanır)
npx playwright test e2e/debts.e2e.ts
npx playwright show-report e2e/.report
```

## Gereksinimler

- Google Chrome kurulu (`E2E_CHROME_PATH` ile başka yol verilebilir).
- Test hesabı: `salon_admin@test.com` / `Adapptiv2026!` (Güzel Salon). Değiştirmek için `E2E_ADMIN_EMAIL`, `E2E_PASSWORD`.
- Temizlik için Supabase CLI bu projeye bağlı olmalı (`npx supabase link --project-ref …`). Bağlı değilse testler çalışır ama veriler kalır.

## Kapsanan akışlar

| Dosya | Akış |
|---|---|
| `auth.e2e.ts` | Yanlış şifre hatası, giriş, çıkış, oturumsuz yasal sayfalar |
| `customers.e2e.ts` | Müşteri ekleme, Türkçe/aksansız arama, kampanya izni kaydı |
| `appointments.e2e.ts` | Randevu oluştur → düzenle (not) → iptal |
| `debts.e2e.ts` | Ödemesiz tamamlama → borç → ödeme al → "Borç yok" |
| `bulk-message.e2e.ts` | Toplu mesaj yalnız izinli müşteriye; RET satırı önizlemede |
| `exports.e2e.ts` | Excel (xlsx) ve kasa/performans PDF'leri |
| `account-deletion.e2e.ts` | Yeni çalışan hesabı açılır, kendi hesabını siler; web silme talebi |

## Test verisi

Testler `E2E ` önekli müşteri/grup ve `e2e-…@test.com` hesapları oluşturur. `global-teardown.ts` hepsini siler (`E2E_SKIP_CLEANUP=1` ile kapatılır). `global-setup.ts` yalnızca silme-talebi formunun saatlik IP sınırını sıfırlar — **canlı (production) projeye karşı çalıştırmayın.**

Toplu mesaj testi yalnızca kendi oluşturduğu iki müşteriden oluşan bir gruba gönderir; işletmenin WhatsApp bağlantısı varsa sahte numaraya bir başarısız gönderim denemesi yapılır.
