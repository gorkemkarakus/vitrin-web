# Değişiklik Günlüğü

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) · Sürümleme: [SemVer](https://semver.org/lang/tr/).
Sürüm tek kaynaktan yönetilir: `package.json` → Android `appVersionName` (`android/app/build.gradle`) → iOS `MARKETING_VERSION`. Her mağaza yüklemesinde Android `appVersionCode` ve iOS build numarası 1 artırılır. `npm run check:release` uyumsuzluğu yakalar.

## [Yayınlanmamış]

## [1.0.0] - 2026-10-17

İlk mağaza sürümü (Google Play / App Store).

### Uygulama
- Randevu takvimi (gün/hafta/ay/özel), "Fark etmez" ile adil çalışan dağıtımı, randevu düzenleme/iptal, kaydırarak tamamlama.
- Müşteriler: kayıt, arama (Türkçe ve aksansız), borç/alacak, ödeme dağıtımı, paketler, gruplar, mükerrer birleştirme, KVKK anonimleştirme.
- Kasa, gün sonu, giderler, prim/kazanç, performans ve muhasebe PDF raporları, Excel veri dışa aktarma.
- Ekip: çalışan hesapları, yetkiler, çalışma saatleri, izinler, tatiller.
- WhatsApp randevu asistanı, toplu kampanya mesajı, yapay zekâ ile kampanya metni ve işletme analizi, Meta reklam raporu.
- Online randevu sayfası, telefon bildirimleri (Android).

### Mağaza hazırlığı
- Hesap silme: uygulama içinden (Ayarlar → Hesabımı sil) ve uygulamaya girmeden web formu (`/hesap-silme`).
- Gizlilik Politikası, KVKK Aydınlatma Metni, Kullanım Koşulları (uygulama içi + `legal/*.html` taslakları).
- Ticari ileti izni: izin/ret kaydı ve kanıtı, toplu mesaj yalnızca izinlilere, "RET" ile çıkış.
- Bildirim izni öncesi açıklama ekranı; iOS gizlilik manifesti; Android R8 küçültme ve release imzalama.
- Veri saklama süreleri ve gece temizliği; uygulama dışı silme talepleri.

### Güvenlik
- Bot uç noktalarında gizli başlık; tüm edge function'lar kimliksiz isteği reddediyor (otomatik tarama).
- RLS izolasyon testi (102 kontrol), alan uzunluk/biçim sınırları (istemci + veritabanı).
- Herkese açık uçlarda IP başına hız sınırı; AI ve toplu mesajda işletme başına günlük kota.
- Oturum anahtarı Keystore/Keychain'de; şifresiz trafik ve uygulama yedeği kapalı.
- Yazı tipleri pakette (çalışma anında Google Fonts isteği yok); loglarda kişisel veri yok.

### Güvenilirlik ve performans
- Ekran hata sınırı, kişisel verisiz hata raporu, çevrimdışı ve saat dilimi uyarıları, Türkçe hata mesajları.
- Açılış paketi 1,8 MB → 263 KB (sayfalar ve PDF/Excel tembel yükleniyor).
- Playwright uçtan uca testleri (giriş, müşteri, randevu, borç, toplu mesaj, Excel/PDF, hesap silme).
