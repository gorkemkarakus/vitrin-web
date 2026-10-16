# Adapptiv — Mobil Uygulama

Güzellik salonları için randevu, müşteri, kasa ve ekip yönetimi uygulaması. React + TypeScript ile yazılmış bir web uygulaması olarak geliştirilir, Capacitor ile Android ve iOS uygulamasına paketlenir. Aynı kod tabanı, müşterilerin kullandığı herkese açık online randevu sayfasını (`/randevu-al/:slug`) da içerir.

Arka uç Supabase'dir (PostgreSQL, Auth, Edge Functions). Veritabanı göçleri ve edge function'lar web paneli deposundan (`isletme_oto/admin-panel/supabase`) yönetilir ve yayınlanır; bu depodaki `supabase/` klasörü onun aynasıdır.

## Gereksinimler

- Node.js 22+
- Android derlemesi için JDK 21 ve Android SDK (Android Studio ile gelir)
- iOS derlemesi için macOS ve Xcode

## Kurulum

```bash
npm install
cp .env.example .env   # değerleri doldurun
npm run dev            # http://localhost:5173
```

## Ortam değişkenleri

| Değişken | Açıklama |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase proje adresi |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (publishable) anahtarı. Herkese açıktır; yetki satır düzeyi güvenlik (RLS) ile sağlanır. |
| `VITE_PUBLIC_SITE_URL` | Online randevu sayfasının yayındaki adresi. Telefonda müşteriye gönderilen randevu linki ve şifre sıfırlama bağlantısı bununla kurulur. |
| `VITE_TURNSTILE_SITE_KEY` | Online randevu formundaki Cloudflare Turnstile doğrulaması. Boşsa doğrulama gösterilmez. |
| `VITE_META_APP_ID`, `VITE_META_CONFIG_ID` | Meta reklam hesabı bağlantısı (OAuth). Gizli değildir; uygulama sırrı yalnızca sunucuda durur. |
| `VITE_PUSH_ENABLED` | `1` ise telefon bildirimleri açılır. Önce `android/app/google-services.json` eklenmelidir. |

Gizli anahtarlar (servis rolü, OpenAI, Meta uygulama sırrı, Firebase servis hesabı) istemciye girmez; Supabase'de edge function secret'ı olarak tutulur.

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Tip denetimi ve üretim derlemesi (`dist/`) |
| `npm test` | Birim testler (Vitest) |
| `npm run lint` | Oxlint |
| `npm run format` | Prettier ile biçimlendirme |
| `npm run check` | Tip, lint, test ve biçim denetimi birlikte |
| `npm run icons` | Uygulama ve açılış ekranı ikonlarını yeniden üretir |
| `npm run icons:notification` | Android bildirim ikonunu yeniden üretir |

## Telefon uygulamasını derleme

```bash
npm run build
npx cap sync            # web kodunu ve eklentileri android/ ve ios/ projelerine kopyalar
```

**Android:** `cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/Adapptiv-debug.apk`. Mağaza sürümü imzalı AAB ile alınır (`./gradlew bundleRelease`); imza anahtarı depoda tutulmaz.

**iOS:** `npx cap open ios` ile Xcode'da açılır. Bildirimler için Xcode'da *Push Notifications* yeteneği, `GoogleService-Info.plist` ve Firebase'e yüklenmiş bir APNs anahtarı gerekir.

**Telefonda canlı yenileme ile geliştirme:** `capacitor.config.ts` içine geçici olarak aşağıdaki satırı ekleyip `npx cap sync` çalıştırın. Bu ayarla derlenen uygulama yalnızca aynı Wi-Fi ağında çalışır; sürüm almadan önce kaldırın.

```ts
server: { url: 'http://<bilgisayarın-yerel-ip-adresi>:5173', cleartext: true },
```

## Telefon bildirimleri

Firebase Cloud Messaging kullanılır. `android/app/google-services.json` git'e eklenmez; her makinede ayrıca konur. Randevu oluşturulunca veya iptal edilince bir veritabanı tetikleyicisi `send-push-notification` fonksiyonunu çağırır. Firebase servis hesabı Supabase'de `FCM_SERVICE_ACCOUNT` secret'ı olarak durur.

## Proje yapısı

```
src/
  pages/          Ekranlar (her biri kendi CSS modülüyle)
  components/     Paylaşılan arayüz bileşenleri
  public/         Herkese açık online randevu sayfası
  layouts/        Alt menülü ana iskelet
  contexts/       Oturum ve yetki (AuthContext)
  hooks/          Paylaşılan React hook'ları
  lib/            İş mantığı ve yardımcılar: borç hesabı, tarih, telefon,
                  Supabase ve edge function istemcileri, Excel/PDF üretimi
  styles/         Tema değişkenleri (theme.css) ve ortak sınıflar
resources/        İkon kaynakları ve üretim betikleri
supabase/         Göçler ve edge function'lar (web panelinden ayna)
```

Testler test ettikleri dosyanın yanında durur (`lib/*.test.ts`).

## Güvenlik notları

- Telefonda oturum Android Keystore / iOS Keychain'de saklanır (`lib/secureStorage.ts`); tarayıcıda Supabase'in varsayılan depolaması kullanılır.
- Tüm tablolarda RLS açıktır; çalışan yetkileri hem arayüzde (`can()`) hem veritabanında (`has_perm()`) denetlenir.
- Üretim derlemesinde tanılama günlükleri yazılmaz (`lib/logger.ts`).
- Ayrıntılı denetim ve açık kalan maddeler: `AUDIT_REPORT.md`.
