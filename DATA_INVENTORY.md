# Veri Envanteri

Son güncelleme: 17 Ekim 2026 · Kaynak: canlı veritabanı şeması (`rllvmyriopaulcmmynbe`), edge function'lar, Android birleşik manifest.

Bu dosya üç işe yarar: (1) KVKK kişisel veri envanteri / VERBİS hazırlığı, (2) Google Play **Veri Güvenliği** formu, (3) Apple **App Privacy** etiketi. Uygulama içi metinler (`src/legal/documents.ts`) bununla tutarlı olmalı; biri değişince diğerini güncelle.

## 1. Kimin verisi

| Grup | Kim | Veri sorumlusu | Adapptiv'in rolü |
|---|---|---|---|
| Hesap sahipleri | Salon yöneticisi ve çalışanlar (uygulamaya giriş yapanlar) | Adapptiv (şirket) | Veri sorumlusu |
| Salon müşterileri | Randevu alan, WhatsApp'tan yazan kişiler | İlgili salon | Veri işleyen |

## 2. Veri kategorileri

| Kategori | Alanlar | Tablo | Amaç | Hukuki sebep (KVKK md. 5) | Saklama |
|---|---|---|---|---|---|
| Hesap | ad soyad, e-posta, şifre özeti, rol, cinsiyet (ops.), WhatsApp no (ops.) | `auth.users`, `profiles` | Giriş, yetki, ekip yönetimi | Sözleşme (5/2-c) | Hesap silinene kadar |
| Çalışma | çalışma saatleri, izinler, verdiği hizmetler, yetkiler | `employee_*`, `employee_permissions` | Takvim, müsaitlik | Sözleşme | Hesap silinene kadar |
| Prim | dönem, tutar | `commission_payouts` | Çalışan ödemeleri | Sözleşme / hukuki yükümlülük | İşletme silinene kadar |
| Müşteri kimlik/iletişim | ad soyad, telefon, iletişim telefonu, e-posta (ops.), not | `customers` | Randevu ve iletişim | Sözleşme (salon–müşteri) | Salon silene/anonimleştirene kadar |
| Müşteri işlem | randevular, olay geçmişi, paketler | `appointments`, `appointment_events`, `service_packages` | Hizmet sunumu | Sözleşme | Salon silene kadar |
| Finans | ödemeler, borç/alacak, kasa, gider | `payments`, `cash_closures`, `business_expenses` | Muhasebe | Hukuki yükümlülük (5/2-ç) | Salon silene kadar (salonun yasal saklama yükümlülüğü) |
| Pazarlama izni | izin, tarih, kaynak, ret tarihi; izin olay kaydı | `customers.marketing_*`, `customer_consent_events` | Ticari ileti (6563) | Açık rıza (5/1) | Müşteri kaydı silinene kadar (kanıt) |
| Yazışma | WhatsApp asistanı mesajları | `chatbot_messages` | Asistan bağlamı | Sözleşme / meşru menfaat | **180 gün** |
| Mesaj kaydı | gönderilen hatırlatma/kampanya metni, telefon | `notification_log` | Gönderim kanıtı, geçmiş | Meşru menfaat | **365 gün** |
| Ham webhook | Meta'dan gelen ham yük (mesaj + telefon) | `whatsapp_webhook_events` | Hata ayıklama | Meşru menfaat | **30 gün** |
| Cihaz | FCM bildirim anahtarı, platform | `push_devices` | Bildirim | Sözleşme | Çıkışta/cihaz değişince silinir |
| Güvenlik | IP özeti (SHA-256, IP saklanmaz), deneme sayaçları | `rate_limit_hits`, `public_booking_attempts`, `*_attempts` | Kötüye kullanım önleme | Meşru menfaat (5/2-f) | **2–7 gün** |
| Silme talepleri | iletişim, ad, işletme, not, IP özeti | `account_deletion_requests` | KVKK md. 11 / mağaza | Hukuki yükümlülük | İşlendikten **1 yıl** sonra |
| Reklam | reklam hesabı adı, harcama/gösterim özetleri, şifreli erişim anahtarı | `business_ad_connections`, `ad_insight_snapshots` | Reklam raporu (işletme bağlarsa) | Sözleşme | Bağlantı kesilene / işletme silinene kadar |
| AI çıktıları | analiz özeti, öneriler | `business_ai_insights` | İşletme analizi | Sözleşme | İşletme silinene kadar |

Saklama süreleri `purge_expired_data()` ile her gece 05:30 (İstanbul) uygulanır — `supabase/migrations/20261017000003_deletion_requests_and_retention.sql`.

**Toplanmayanlar:** konum, rehber, fotoğraf/kamera, mikrofon, sağlık verisi (müşteri notuna salonun kendisi yazmadıkça — bkz. Bilinen riskler), reklam kimliği (IDFA/AAID), uygulama dışı gezinme, çökme/analitik SDK'sı (henüz yok).

## 3. Üçüncü taraflar ve yurt dışı aktarım

| Sağlayıcı | Ne gider | Konum | Dayanak (KVKK md. 9) |
|---|---|---|---|
| Supabase | Tüm veritabanı, kimlik doğrulama | AB (Frankfurt) | Veri işleme sözleşmesi (DPA) |
| OpenAI | Asistan: müşteri mesajı + salon hizmet/saat listesi; kampanya metni isteği; analiz için toplu istatistik; doğal dil randevu komutu metni | ABD | Standart sözleşme gerekli |
| Meta (WhatsApp Business) | Müşteri telefonu ve mesaj metni | ABD/AB | Standart sözleşme gerekli |
| Meta (Ads) | Reklam hesabı kimliği, erişim anahtarı (yalnız işletme bağlarsa) | ABD | Standart sözleşme gerekli |
| Google Firebase (FCM) | Cihaz bildirim anahtarı, bildirim başlığı/metni | ABD | Standart sözleşme gerekli |
| Cloudflare Turnstile | Tarayıcı sinyalleri (yalnız web formları, anahtar ayarlanınca) | ABD/küresel | Standart sözleşme gerekli |
| n8n (asistan otomasyonu) | Müşteri mesajı, telefon | Kendi sunucunuz — **konumu doğrulayın** | Barındırma yeri yurt dışıysa aynı kural |

KVKK md. 9 (2024 değişikliği): standart sözleşme imzalandıktan sonra **5 iş günü içinde Kurul'a bildirilmeli**. Bu bir avukat işi — bkz. RELEASE_CHECKLIST.md.

## 4. Mobil izinler (Android birleşik manifest)

| İzin | Neden | Ne zaman istenir |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Sunucuya bağlanma | Kurulumda (kullanıcıya sorulmaz) |
| `POST_NOTIFICATIONS` (Android 13+) | Randevu bildirimleri | Giriş yaptıktan sonra, açıklama ekranından sonra |
| `WAKE_LOCK`, `c2dm.RECEIVE` | FCM bildirim teslimi (Firebase kütüphanesi ekler) | — |

iOS: yalnızca bildirim izni (Info.plist'te ayrıca kullanım metni gerekmez; kamera/konum/fotoğraf kullanılmıyor).

## 5. Google Play — Veri Güvenliği formu cevapları

- **Veri topluyor veya paylaşıyor musunuz?** Evet.
- **Aktarımda şifreleniyor mu?** Evet (yalnızca HTTPS; uygulama şifresiz trafiğe izin vermiyor).
- **Kullanıcılar silme isteyebilir mi?** Evet — uygulama içinde (Ayarlar → Hesabımı sil) ve web: `<alan-adı>/hesap-silme`.
- **Toplanan veri türleri** (hepsi: *toplanır*, *paylaşılmaz*¹, *zorunlu*, amaç *Uygulama işlevi* + *Hesap yönetimi*):
  - Kişisel bilgiler → Ad; E-posta adresi; Telefon numarası
  - Finansal bilgiler → Diğer finansal bilgiler (salonun kaydettiği ödeme tutarları)
  - Mesajlar → Diğer uygulama içi mesajlar (WhatsApp asistanı yazışmaları)
  - Uygulama etkinliği → Diğer kullanıcı tarafından oluşturulan içerik (randevu, müşteri notları)
  - Cihaz veya diğer kimlikler → Cihaz kimliği (FCM bildirim anahtarı), amaç: *Uygulama işlevi*
- **Toplanmayan:** Konum, Sağlık ve fitness, Fotoğraflar/videolar, Ses, Dosyalar, Takvim, Kişiler, Web'de gezinme, Uygulama performansı (çökme SDK'sı eklenirse güncelle!).

¹ Google'ın tanımına göre hizmet sağlayıcıya (veri işleyen) aktarım "paylaşım" sayılmaz; OpenAI/Meta/Firebase hizmet sağlayıcı olarak işler.

## 6. Apple — App Privacy etiketi

- **Data Used to Track You:** Yok.
- **Data Linked to You** (amaç: App Functionality): Contact Info (Name, Email, Phone), Financial Info (Other), User Content (Other User Content, Customer Support yok), Identifiers (User ID; Device ID — push token).
- **Data Not Linked to You:** Yok.
- Tracking (ATT) izni gerekmez; IDFA kullanılmıyor.

## 7. Bilinen riskler

- Müşteri notu serbest metin: salonlar sağlık bilgisi (alerji vb.) yazabiliyor → özel nitelikli kişisel veri (KVKK md. 6). Not alanının yanında "sağlık bilgisi yazmadan önce müşterinin açık rızasını alın" uyarısı ve aydınlatma metninde ayrıca belirtme avukatla değerlendirilmeli.
- Web panelde (admin-panel) kampanya izni anahtarı henüz yok; sunucu izinsiz müşteriye kampanya göndermez ama web'den izin verilemez.
- İYS kaydı ve izinlerin İYS'ye aktarımı yapılmıyor (salonun yükümlülüğü; ileride entegrasyon).
