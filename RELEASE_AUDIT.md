# Yayın Öncesi Denetim — Adapptiv 1.0.0

Tarih: 2026-10-17 · Dal: `release/store-prep` (güncel `main`'den)
Kapsam: mobil uygulama (`isletme_oto_mobil`), ortak Supabase projesi (`rllvmyriopaulcmmynbe`, Frankfurt / eu-central-1), edge function'lar (`isletme_oto/admin-panel/supabase`).

Durum: **tamam** · **eksik** · **sorunlu** — Önem: **K** kritik · **Y** yüksek · **O** orta · **D** düşük

Bu dosya iş başında yazıldı; her maddenin son durumu dosyanın sonundaki "Sonuç" tablosunda güncellenir.

## 1. Güvenlik

| # | Madde | Durum | Önem | Bulgu / yapılacak |
| --- | --- | --- | --- | --- |
| G1 | WhatsApp bot fonksiyonları | sorunlu | K | `book/cancel/reschedule-appointment`, `chatbot-context`, `chatbot-log-message` işletmeyi API anahtarıyla **ya da yalnızca gövdedeki `phone_number_id` ile** buluyor; ikinci yolda sır yok. n8n bugün API anahtarı yolunu kullanıyor (kimlik bilgisi header'ı). → Numara kimliği yolu için paylaşılan gizli başlık (`x-bot-secret`) zorunlu; anahtarsız istek 401. Meta imzası doğrulanmış `whatsapp-webhook` içinden yapılan çağrı güvenilir sayılır. |
| G2 | Edge function envanteri | tamam (doğrulanacak) | Y | 32 fonksiyon: 13 yönetici JWT, 5 operatör, 2 kullanıcı JWT, 5 webhook sırrı, 5 API anahtarı, 2 herkese açık (randevu sayfası). Kimliksiz çağrı testi tekrar çalıştırılacak, sonuç tabloya işlenecek. |
| G3 | RLS | tamam (test eksik) | Y | 38 tablonun hepsinde RLS açık; politikasız 10 tablo yalnızca sunucuya açık (bilinçli). Tekrar çalıştırılabilir işletmeler arası izolasyon testi yok → `supabase/tests/rls_isolation.sql` (geri alınan işlem içinde okuma/yazma/silme denemeleri). |
| G4 | Online randevu formu: Turnstile + hız sınırı | eksik | Y | İstemci ve sunucu kodu var ama anahtarlar tanımlı değil → doğrulama atlanıyor. Randevu oluşturmada IP başı sınır var; `public-booking-info`'da yok. → Bilgi uç noktasına da sınır; Turnstile anahtarı tanımlandığında token zorunlu (kullanıcı Cloudflare'de anahtar oluşturacak). |
| G5 | Herkese açık uç noktalarda kötüye kullanım | kısmen | Y | Randevu oluşturma, personel WhatsApp, AI komut, kampanya: sınır var. Randevu bilgisi ve hesap silme talebi (yeni): yok → eklenecek. |
| G6 | Form uzunluk/format sınırları | eksik | O | 112 alandan 2'sinde `maxLength`; veritabanında yalnızca 1 tabloda uzunluk kısıtı. → İstemcide `maxLength`, veritabanında `CHECK (char_length(...) <= n)` (mevcut veri kontrol edilerek). |
| G7 | Maliyet doğuran özelliklere kota | kısmen | O | AI analizinde dönem başı bekleme, kampanya mesajı yazmada ve toplu gönderimde dakika bazlı sınır var; **günlük işletme kotası yok**. → Günlük kota tablosu + fonksiyonlarda kontrol. |
| G8 | Android release sertleştirme | eksik | Y | `minifyEnabled false`; `allowBackup=false` (tamam); cleartext açıkça kapatılmamış (API 28+ varsayılanı kapalı). → R8 + kaynak küçültme, Capacitor için ProGuard kuralları, `usesCleartextTraffic="false"`, `debuggable` release'de kapalı (varsayılan, açıkça doğrulanacak). |
| G9 | iOS ATS | tamam | — | `NSAppTransportSecurity` istisnası yok. |
| G10 | service_role istemcide | tamam | — | `src`, derlenmiş `dist` ve git geçmişinde yok. |
| G11 | Google Fonts çalışma anında yükleniyor | sorunlu | O | Her açılışta Google'a istek (IP aktarımı, internetsiz açılışta bozuk yazı). → Yazı tipleri pakete gömülecek. |

## 2. Mağaza zorunlulukları

| # | Madde | Durum | Önem | Bulgu / yapılacak |
| --- | --- | --- | --- | --- |
| M1 | Uygulama içi hesap silme | tamam | K | Ayarlar → Hesabımı sil (şifre doğrulamalı, sunucuda gerçek silme; tek yöneticide işletme ve tüm veri). |
| M2 | Web'den hesap silme talebi (Google Play) | eksik | K | → Herkese açık `/hesap-silme` sayfası: giriş yapıp silme ya da giriş yapamayanlar için talep formu (sunucuda kayıt + hız sınırı). |
| M3 | Gizlilik politikası / kullanım koşulları | eksik | K | → `legal/` altında web'de yayınlanacak HTML taslakları + uygulama içi `/gizlilik`, `/kullanim-kosullari`; Ayarlar ve giriş ekranından bağlantı. |
| M4 | Veri envanteri | eksik | K | → `DATA_INVENTORY.md` (Play "Veri güvenliği", App Store "Gizlilik etiketleri" için). |
| M5 | İzin açıklamaları / ihtiyaç anında isteme | sorunlu | O | Tek izin bildirim; giriş yapılır yapılmaz sistem penceresi açılıyor. → Önce sade bir açıklama, kullanıcı kabul ederse sistem penceresi. |
| M6 | targetSdk / compileSdk | tamam | — | 36 / 36. Google Play yeni uygulamalar için 31 Ağustos 2026'dan beri API 36 istiyor. |
| M7 | Release imzalama | eksik | K | → `keystore.properties` / ortam değişkenlerinden okunan `signingConfig` (depoda anahtar yok); oluşturma ve yedekleme talimatı. |
| M8 | AAB üretimi | eksik | K | → `bundleRelease` ve `npm run release:android`. |
| M9 | Sürüm stratejisi | eksik | O | `versionName "1.0"`, `versionCode 1`. → 1.0.0; versionCode `package.json` sürümünden türetilen tek kaynak. |
| M10 | iOS PrivacyInfo.xcprivacy | eksik | K | → Uygulama manifesti (toplanan veri türleri, izleme yok, kullanılan "required reason" API'ler). |
| M11 | iOS bildirimleri (APNs) | eksik | Y | AppDelegate'te token iletimi yok; sunucu FCM kullanıyor, iOS'ta FCM token için Firebase Messaging gerekiyor. → AppDelegate kodu (`canImport` ile Firebase eklenmeden de derlenir) + Apple Developer adımları. |
| M12 | Info.plist / sürüm / şifreleme beyanı | kısmen | O | Ad ve bundle id doğru; `ITSAppUsesNonExemptEncryption` yok (her yüklemede soru). → Eklenecek; sürüm 1.0.0. |
| M13 | Apple red sebepleri | sorunlu | Y | WhatsApp bağlı değilken Toplu Mesaj ve Mesajlar gerçek gönderim yapmıyor ("henüz aktif değil" metinleri); Meta reklam bağlantısı App Review'dan geçmeden çalışmıyor. Bu ekranlar "çalışmayan özellik" olarak reddedilebilir. → Özellik bayrakları (kaldırma yok); varsayılan ve öneri "Karar bekleyenler"de. İnceleme hesabı talimatı. |

## 3. Türkiye yasal gereklilikleri

| # | Madde | Durum | Önem | Bulgu / yapılacak |
| --- | --- | --- | --- | --- |
| H1 | KVKK aydınlatma metni | kısmen | Y | Randevu formunda tek satırlık not var, aydınlatma metni yok. → Metin taslağı + randevu formunda bağlantı. |
| H2 | Yurt dışına aktarım | sorunlu | Y | Supabase (Frankfurt, AB), OpenAI (ABD; chatbot, AI analiz, kampanya metni, randevu komutu), Google Firebase (bildirim), Meta (WhatsApp, reklam), Cloudflare (Turnstile), Google Fonts (giderilecek). → Raporda ve aydınlatma metninde açıkça; açık rıza/standart sözleşme gerekliliği avukat kontrolüne. |
| H3 | Ticari elektronik ileti / İYS | eksik | Y | Müşteride ticari ileti onayı alanı yok; toplu mesaj herkese gidebilir; ret (opt-out) yok. → `marketing_consent` (onay, tarih, kaynak, ret tarihi), müşteri ekranında onay, toplu mesajda yalnızca onaylılar, mesaj sonuna ret talimatı, "RET" yanıtıyla ret kaydı (WhatsApp kurulunca). |
| H4 | Hukuki kontrol | — | — | Tüm metinler taslaktır; avukat kontrolü gerekir. |

## 4. Kararlılık ve hata takibi

| # | Madde | Durum | Önem | Bulgu / yapılacak |
| --- | --- | --- | --- | --- |
| S1 | Çökme raporlama | eksik | Y | → Firebase Crashlytics (Firebase zaten kurulu); JS hataları kişisel veri ayıklanarak kaydedilir. |
| S2 | Beyaz ekran / sonsuz yükleme | sorunlu | Y | Hata sınırı (ErrorBoundary) yok; çoğu sorgu hatası yutulup boş liste gösteriliyor. → Genel hata sınırı + "Tekrar dene"; kritik ekranlarda hata durumu. |
| S3 | İnternetsiz / zayıf bağlantı | eksik | O | → Çevrimdışı bandı, ağ hatasında anlaşılır mesaj. |
| S4 | Oturum süresi / yenileme | tamam | — | 2026-10-17'de düzeltildi (yalnızca bu cihazdan çıkış, 401'de yenileme). |
| S5 | Çift tıklama | denetlenecek | O | Formlarda `submitting` kilidi örnekleniyor. |
| S6 | Saat dilimi | sorunlu | O | Randevu saatleri cihazın saat dilimiyle kuruluyor; sunucu Europe/Istanbul. Cihaz başka dilimdeyse kayma. → Randevu oluşturma/düzenlemede İstanbul saatine sabitleme. |
| S7 | Türkçe karakter | sorunlu | O | Bazı aramalar `toLowerCase()` kullanıyor ("İ" eşleşmiyor). → `toLocaleLowerCase('tr')`. |

## 5. Test altyapısı ve refaktör

| # | Madde | Durum | Önem | Yapılacak |
| --- | --- | --- | --- | --- |
| T1 | Uçtan uca testler | eksik | Y | → Playwright (Capacitor web katmanı aynı kod; emülatör gerektirmez): giriş/çıkış, randevu oluştur/düzenle/iptal, müşteri ekle, borç/ödeme, toplu mesaj, Excel/PDF, hesap silme. |
| T2 | Uzun sayfaların bölünmesi | eksik | O | E2E testler geçtikten sonra `AppointmentsPage` (3.000+ satır) ve diğerleri. |
| T3 | Birim test kapsamı | kısmen | O | 65 test; tarih/saat dilimi, ödeme, kota hesapları eklenecek. |

## 6. Kalite

| # | Madde | Durum | Önem | Yapılacak |
| --- | --- | --- | --- | --- |
| Q1 | Performans PDF düzeni | sorunlu | O | Başlıklar/isimler kelime ortasından bölünüyor. |
| Q2 | Metinlerin tek dosyada toplanması | eksik | D | ~1.500 metin. |
| Q3 | Performans | kısmen | O | Ana paket tek parça (Vite uyarısı); PDF yazı tipleri ilk yüklemede. → Ekran bazlı kod bölme, PDF modülünü ihtiyaç anında yükleme. |
| Q4 | Erişilebilirlik | kısmen | O | Yalnızca ikonlu düğmelerde etiket, dokunma alanı, kontrast. |
| Q5 | Ekran boyutları | denetlenecek | O | 320 px, 360 px, 430 px, tablet 768 px taşma taraması. |
| Q6 | İkon / açılış ekranı / ad | sorunlu | D | Açılış ekranı eski krem zemin (`#f4f1ea`), uygulama zemini `#f5f6f8`. |

## 7. Yayın hazırlığı

| # | Madde | Durum | Önem | Yapılacak |
| --- | --- | --- | --- | --- |
| R1 | Geliştirme / production ayrımı | sorunlu | Y | Tek Supabase projesi; test hesapları ve demo işletme production veritabanında. → Ortam dosyaları ve derleme koruması; ayrı test projesi kararı. |
| R2 | Yedekleme / migration bütünlüğü | denetlenecek | Y | Free planda otomatik yedek indirilemiyor; migration geçmişi dosyalarla karşılaştırılacak. |
| R3 | CHANGELOG / 1.0.0 | eksik | D | |
| R4 | Mağaza metinleri | eksik | O | `STORE_LISTING.md`. |

## Karar bekleyenler

12 madde (K1–K12) — seçilen varsayılanlarla birlikte `RELEASE_CHECKLIST.md` → "Karar bekleyenler".

## Sonuç (2026-10-17, iş sonu)

| # | Son durum | Nasıl doğrulandı / not |
| --- | --- | --- |
| G1 | tamam | `x-bot-secret` zorunlu; başlıksız/yanlış 401, doğru 200. n8n API anahtarı yolu etkilenmedi. |
| G2 | tamam | `npm run test:edge-auth`: 28 fonksiyon, kimliksiz 2xx yok. |
| G3 | tamam | `npm run test:rls`: 102 kontrol geçti (negatif kontrolle etkinliği doğrulandı). |
| G4 | kısmen | Hız sınırları devrede; Turnstile anahtarı Cloudflare'de oluşturulunca zorunlu olur (kod hazır, `_app_secrets` yedeği). |
| G5 | tamam | `public-booking-info` 120/10 dk/IP, `account-deletion-request` 5/saat/IP. |
| G6 | tamam | 29 DB kısıtı + 50 `maxLength`; kısıt hataları Türkçe gösteriliyor. |
| G7 | tamam | Günlük kota (`consume_quota`); varsayılan değerler K2. |
| G8 | tamam | R8 + shrinkResources, cleartext/yedek kapalı, `debuggable false`; release derlemesi emülatörde çalıştı. |
| G9–G10 | tamam | Değişiklik gerekmedi. |
| G11 | tamam | `@fontsource-variable`; harici istek yok (tarayıcıda doğrulandı). |
| M1 | tamam | E2E: çalışan kendi hesabını siliyor. |
| M2 | tamam | `/hesap-silme` + `legal/hesap-silme.html` + sunucu ucu; E2E. |
| M3 | tamam (taslak) | Uygulama içi 3 sayfa + HTML; şirket bilgileri yer tutucu, avukat onayı bekliyor. |
| M4 | tamam | `DATA_INVENTORY.md` (Play ve Apple form cevapları dahil). |
| M5 | tamam | Açıklama ekranı → sistem izni; emülatörde doğrulandı. |
| M6 | tamam | — |
| M7 | tamam (anahtar bekliyor) | `keystore.properties` / ortam değişkeni; anahtar kullanıcı tarafından oluşturulacak. |
| M8 | tamam | `npm run android:aab`; imzasız AAB üretildi. |
| M9 | tamam | 1.0.0 / versionCode 1; `check:release` uyumu denetliyor. |
| M10 | tamam | `PrivacyInfo.xcprivacy` kaynaklara eklendi (FileTimestamp C617.1). |
| M11 | kısmen | AppDelegate köprüsü hazır; Firebase SDK, APNs anahtarı ve Xcode yetenekleri Mac'te (kontrol listesi §4). |
| M12 | tamam | `ITSAppUsesNonExemptEncryption=false`, 1.0.0, arm64, dikey. |
| M13 | karar | K5 (ekranlar görünür bırakıldı); inceleme notu hazır. |
| H1 | tamam (taslak) | Aydınlatma metni + randevu formunda bağlantı. |
| H2 | kısmen | Metinlerde açık; standart sözleşmeler ve Kurul bildirimi avukat işi. |
| H3 | tamam | İzin + kanıt + RET + toplu mesaj filtresi + sunucu tarafı ret satırı; İYS kaydı salonların işi. |
| H4 | bekliyor | Avukat kontrolü. |
| S1 | tamam (varsayılan) | Kendi hata raporu tablomuz, kişisel veri maskeli; servis seçimi K1. |
| S2 | tamam | ErrorBoundary (rota değişince sıfırlanır). |
| S3 | tamam | Çevrimdışı şeridi (tarayıcıda doğrulandı). |
| S4 | tamam | — |
| S5 | tamam | Kayıt butonları zaten kilitliydi; grup/şablon silme-adlandırmaya kilit eklendi. |
| S6 | kısmen | Uyarı şeridi; tam İstanbul sabitlemesi K9. |
| S7 | tamam | `matchesSearch` (Türkçe + aksansız), baş harfler `toLocaleUpperCase('tr')`. |
| T1 | tamam | 10 Playwright testi, ard arda çalıştırmalarda kararlı. |
| T2 | tamam (ana sayfa) | AppointmentsPage 3113 → 1023 satır: NewAppointmentForm, CompleteAppointmentScreen, AppointmentDetailView, EditAppointmentModal; E2E + görsel karşılaştırma ile doğrulandı. Diğer uzun sayfalar bakım için ileride. |
| T3 | tamam | 65 → 82 birim test (arama, hata çevirici, yasal metin, kampanya, saat dilimi, adil dağıtım). |
| Q1 | tamam | PDF görsel olarak kontrol edildi. |
| Q2 | ertelendi | K8. |
| Q3 | tamam | Açılış paketi 1826 → 263 KB. |
| Q4 | tamam | Adsız öğe yok, küçük dokunma alanları büyütüldü; soluk metin kontrastı bilinen risk. |
| Q5 | tamam | 28 ekran × 320/360/430/768 px: yatay taşma yok. |
| Q6 | tamam | Splash `#f5f6f8`; ad her platformda "Adapptiv". |
| R1 | kısmen | `check:release` ortam/anahtar denetimi; ayrı test projesi K7. |
| R2 | tamam / bekliyor | 84 migration uzak geçmişle birebir; yedek `npm run backup:db` (Docker) veya Pro plan. |
| R3 | tamam | `CHANGELOG.md`. |
| R4 | tamam | `STORE_LISTING.md`. |
