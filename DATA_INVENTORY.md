# Veri Envanteri

Son güncelleme: 19 Ekim 2026 · Kaynak: canlı veritabanı şeması (`rllvmyriopaulcmmynbe`), edge function'lar, Android birleşik manifest.

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
| Müşteri profili (CRM) | doğum günü, kaynak, etiketler, işletmenin tanımladığı ek alanlar (özel nitelikli olabilir: alerji vb.) | `customers.birthday/source/tags/custom_fields`, `customer_field_definitions` | Kişiye özel hizmet | Sözleşme; özel nitelikli alanlarda açık rıza (md. 6) | Salon silene/anonimleştirene kadar (KVKK silmede temizlenir) |
| Aktivite ve görev | arama/ziyaret/şikâyet notu, takip görevleri | `customer_activities`, `tasks` | Müşteri takibi | Meşru menfaat | KVKK silmede silinir |
| Müşteri dosyaları | işlem öncesi/sonrası fotoğraf, onam formu, belge (jpeg/png/webp/heic/pdf, 10 MB) | `customer_files` + özel depolama `customer-files` | Hizmet kaydı, onam kanıtı | Sözleşme; fotoğrafta açık rıza | KVKK silmede dosyalar ve kayıtlar silinir |
| Potansiyel müşteri | ad, telefon, kaynak, ilgilendiği hizmet, not, kayıp nedeni | `leads` | Satış takibi | Meşru menfaat | Kapananlar ekranda 90 gün; KVKK silmede silinir |
| Sadakat | ödül kullanımları | `loyalty_programs`, `loyalty_redemptions` | Sadakat programı | Meşru menfaat | KVKK silmede silinir |
| Memnuniyet | anket puanı, yorum, tek kullanımlık bağlantı | `surveys`, `survey_settings` | Hizmet kalitesi | Meşru menfaat | KVKK silmede silinir |
| Salon aydınlatma bilgisi | salonun unvanı, adresi, başvuru e-posta/telefonu | `business_privacy_notices` | Salonun aydınlatma metni | Hukuki yükümlülük (salon) | İşletme silinene kadar |
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

**Toplanmayanlar:** konum, rehber, mikrofon, reklam kimliği (IDFA/AAID), uygulama dışı gezinme, çökme/analitik SDK'sı (henüz yok). **Kamera/galeri** yalnızca müşteri dosyası yüklerken (iOS: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`). **Sağlık verisi** yalnızca salon özel nitelikli alan tanımlar ya da nota yazarsa.

## 3. Üçüncü taraflar ve yurt dışı aktarım

| Sağlayıcı | Ne gider | Konum | Dayanak |
|---|---|---|---|
| Supabase | Tüm veritabanı, kimlik doğrulama, müşteri dosyaları | AB (Frankfurt, `eu-central-1`) | Sağlayıcının DPA'sı |
| OpenAI | Asistan: müşteri adı + mesajı + salon hizmet/saat listesi; kampanya metni isteği; analiz için toplu istatistik (isimsiz); doğal dil randevu komutu metni. **Gitmeyenler:** notlar, etiketler, doğum günü, özel alanlar, dosyalar (2026-10-19 kod taraması) | ABD | Sağlayıcının DPA'sı |
| Meta (WhatsApp Business) | Müşteri telefonu ve mesaj metni | ABD/AB | Sağlayıcının DPA'sı |
| Meta (Ads) | Reklam hesabı kimliği, erişim anahtarı (yalnız işletme bağlarsa) | ABD | Sağlayıcının DPA'sı |
| Google Firebase (FCM) | Cihaz bildirim anahtarı, bildirim başlığı/metni | ABD | Sağlayıcının DPA'sı |
| Cloudflare Turnstile | Tarayıcı sinyalleri (yalnız web formları, anahtar ayarlanınca) | ABD/küresel | Sağlayıcının DPA'sı |
| Resend | Hesap sahiplerinin e-postası, doğrulama/sıfırlama kodu | AB (İrlanda) | Sağlayıcının DPA'sı |
| n8n (asistan otomasyonu) | Müşteri mesajı, telefon | Kendi sunucunuz — **konumu doğrulayın** | Yurt dışıysa listeye ekle |

**Karar (19 Ekim 2026):** KVKK md. 9 standart sözleşmesi + Kurul bildirimi yapılmayacak (büyük sağlayıcıların Türk standart sözleşmesini imzalaması pratikte mümkün değil). Bunun yerine: aydınlatma metinlerinde yurt dışı servisler ve ülkeler açıkça yazılır; sağlayıcıların kendi DPA'ları kabul edilir; yapay zekâya veri azaltılarak gider; salonlar kullanım koşullarında veri sorumlusu olarak taahhüt verir. Risk: şikâyet veya veri ihlalinde md. 9 aykırılığı gündeme gelebilir. Yeni bir yurt dışı servis eklendiğinde `src/legal/documents.ts` PROCESSORS ve bu tablo birlikte güncellenmeli.

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
  - Fotoğraflar ve videolar → Fotoğraflar (müşteri kartına yüklenen işlem öncesi/sonrası fotoğraf), amaç *Uygulama işlevi*
  - Dosyalar ve dokümanlar → Dosyalar ve dokümanlar (onam formu, belge)
  - Sağlık ve fitness → Sağlık bilgileri (yalnızca salon alerji gibi bir alan tanımlarsa; isteğe bağlı)
- **Toplanmayan:** Konum, Ses, Takvim, Kişiler, Web'de gezinme, Uygulama performansı (çökme SDK'sı eklenirse güncelle!).

¹ Google'ın tanımına göre hizmet sağlayıcıya (veri işleyen) aktarım "paylaşım" sayılmaz; OpenAI/Meta/Firebase hizmet sağlayıcı olarak işler.

## 6. Apple — App Privacy etiketi

- **Data Used to Track You:** Yok.
- **Data Linked to You** (amaç: App Functionality): Contact Info (Name, Email, Phone), Financial Info (Other), Health & Fitness (Health — yalnızca salon tanımlarsa), User Content (Photos or Videos; Other User Content; Customer Support yok), Identifiers (User ID; Device ID — push token).
- **Data Not Linked to You:** Yok.
- Tracking (ATT) izni gerekmez; IDFA kullanılmıyor.

## 7. Bilinen riskler

- Müşteri notu serbest metin: salonlar sağlık bilgisi (alerji vb.) yazabiliyor → özel nitelikli kişisel veri (KVKK md. 6). Özel nitelikli alan tanımlarken ve CRM bilgisi düzenlerken açık rıza uyarısı var; salon aydınlatma şablonunda da yazıyor. Açık rızanın kanıtı (imzalı onam) salonda; uygulamada onam formu müşteri dosyası olarak yüklenebilir.
- Yurt dışı aktarım: standart sözleşme yapılmadı (yukarıdaki karar).
- Asistanın ilk mesajında salonun aydınlatma bağlantısı yok — WhatsApp yeniden kurulurken eklenecek (RELEASE_CHECKLIST 8).
- Web panelde (admin-panel) kampanya izni anahtarı henüz yok; sunucu izinsiz müşteriye kampanya göndermez ama web'den izin verilemez.
- İYS kaydı ve izinlerin İYS'ye aktarımı yapılmıyor (salonun yükümlülüğü; ileride entegrasyon).
