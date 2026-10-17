# Yayın Kontrol Listesi — Adapptiv 1.0.0

Dal: `release/store-prep` (mobil `isletme_oto_mobil` ve web/sunucu `isletme_oto`). **Birleştirilmedi, push edilmedi.**
Ayrıntılı bulgular: `RELEASE_AUDIT.md` · Veri envanteri: `DATA_INVENTORY.md` · Mağaza metinleri: `STORE_LISTING.md` · E2E: `e2e/README.md`

> ⚠️ **Önemli:** Veritabanı migration'ları (5 adet, `20261017000001`–`000005`) ve güncellenen edge function'lar **ortak Supabase projesine zaten uygulandı** (canlı sunucu bu dalın kodunu çalıştırıyor). `main`'e birleştirmeden önce de geçerli; dal birleştirilmezse sunucu ile `main` arasında fark kalır. Geri alma gerekirse bana söyle — her değişiklik geri alınabilir şekilde yazıldı.

## Çıktılar (Masaüstü)

| Dosya | Ne için |
|---|---|
| `Adapptiv-debug.apk` | Telefonda günlük test (bildirimler açık) |
| `Adapptiv-release-test.apk` | Mağaza sürümünün aynısı (R8 küçültmeli), **test anahtarıyla** imzalı — yalnızca denemek için |
| `Adapptiv-1.0.0-imzasiz.aab` | Mağaza paketi **imzasız** — yükleme anahtarı oluşturulunca `npm run android:aab` ile imzalısı üretilir |

## Yapılanlar

| Alan | Yapılan | Doğrulama |
|---|---|---|
| Bot güvenliği | Numara kimliğiyle çağrılan bot uçları gizli başlık istiyor | Başlıksız 401, doğru başlıkla 200 |
| Edge function'lar | 28 fonksiyon kimliksiz isteği reddediyor | `npm run test:edge-auth` |
| RLS | İşletmeler arası izolasyon testi (102 kontrol) | `npm run test:rls` |
| Alan sınırları | 29 veritabanı kısıtı + 50 alanda `maxLength`; hatalar Türkçe | birim test |
| Hız sınırı / kota | Online randevu bilgisi 10 dk'da IP başı 120; silme talebi saatte 5; günlük AI ve toplu mesaj kotası | SQL testi |
| Android | R8 + kaynak küçültme, release imzalama altyapısı, şifresiz trafik ve yedek kapalı, sürüm 1.0.0 | emülatörde R8 sürümü: giriş, güvenli depo, bildirim kaydı |
| iOS | Gizlilik manifesti, APNs→FCM köprüsü (Firebase eklenince), şifreleme beyanı, yalnız iPhone dikey, 1.0.0 | pbxproj ayrıştırıldı (Mac'te derlenmedi) |
| Hesap silme | Uygulama içi (vardı) + `/hesap-silme` web formu ve sunucu ucu | E2E |
| Yasal metinler | Gizlilik, KVKK aydınlatma, kullanım koşulları — uygulama içi + `legal/*.html` | E2E |
| KVKK / İYS | Kampanya izni, kanıt kaydı, "RET" ile çıkış, toplu mesaj yalnız izinlilere, saklama süreleri ve gece temizliği | E2E + SQL |
| Bildirim izni | Önce açıklama ekranı, 7 gün ertele; Ayarlar'da durum | emülatör |
| Hata / çevrimdışı | Ekran hata sınırı, kişisel verisiz hata raporu, çevrimdışı ve saat dilimi şeridi | tarayıcı |
| Arama | Türkçe + aksansız ("sule" → Şule) | birim test + E2E |
| E2E | 10 Playwright testi | `npm run test:e2e` |
| Refaktör | AppointmentsPage 3113 → ~2590 satır (düzenleme, detay, tipler ayrı) | E2E |
| Performans | Açılış paketi 1,8 MB → 263 KB | build çıktısı |
| PDF | Performans raporu tablo/satır taşmaları | görsel kontrol |
| Diğer | Yazı tipleri pakette, splash rengi, dokunma alanları, CHANGELOG, mağaza metinleri, yedek betiği, `npm run check:release` | — |

## Karar bekleyenler

Her birinde şu an uygulanan varsayılan yazılı; değiştirmek istersen söylemen yeterli.

| # | Konu | Uygulanan varsayılan | Seçenekler |
|---|---|---|---|
| K1 | Çökme raporlama servisi | Üçüncü taraf yok; hatalar kişisel veri ayıklanarak kendi veritabanımıza (`client_error_reports`, 30 gün) | Firebase Crashlytics (ücretsiz, yerel çökmeleri de yakalar; gizlilik metni ve veri envanteri güncellenmeli) veya Sentry (ücretli plan) |
| K2 | Günlük kotalar | AI kampanya metni 30, AI analiz 10, AI randevu komutu 100, toplu mesaj alıcısı 500 / işletme / gün | `supabase/functions/_shared/limits.ts` içindeki sayılar; plan bazlı farklı kotalar |
| K3 | Saklama süreleri | Webhook ham kaydı 30 gün, asistan yazışmaları 180 gün, mesaj kaydı 365 gün, sınır kayıtları 2–7 gün | Avukat görüşüne göre `purge_expired_data()` |
| K4 | Mevcut müşterilerin kampanya izni | Hepsi **izinsiz** başladı (kanıtı olmayan kişiye kampanya gitmesin) → toplu mesaj şu an kimseye gitmez | İzni olduğu bilinen müşteriler tek tek işaretlenir; toplu "izinli say" yasal risk taşır |
| K5 | WhatsApp / Meta reklam ekranları (Apple "çalışmayan özellik" riski) | Görünür bırakıldı, metinler "henüz bağlı değil" diyor | Bağlantı yoksa ekranları gizleyen bayrak (kod küçük); inceleme notunda açıklama (STORE_LISTING.md'de hazır) |
| K6 | iPad desteği | Yalnız iPhone (`TARGETED_DEVICE_FAMILY = 1`), dikey | iPad'i açmak: inceleme iPad'de de yapılır, yatay düzen test edilmeli |
| K7 | Ayrı test (staging) Supabase projesi | Yok — testler ve demo işletme canlı veritabanında; E2E verisi her çalıştırmada siliniyor | Ücretsiz ikinci proje + `.env.production` (betik hazır, ayrımı denetliyor) |
| K8 | Tüm arayüz metinlerini tek dosyaya taşımak (Q2) | Ertelendi (~1.500 metin, tek dil; riskli ve şu an faydası yok) | İkinci dil eklenecekse yapılmalı |
| K9 | Saat dilimi | Cihaz Türkiye saatinde değilse uyarı şeridi; tam dönüşüm yapılmadı | Tüm tarih hesaplarını Europe/Istanbul'a sabitlemek (138 nokta, ayrı iş) |
| K10 | Zeynep Kaya'nın randevuya bağlanmamış iki test ödemesi (₺3.500 nakit + ₺3.650 kart) | Dokunulmadı | Sil / bir borca dağıt |
| K11 | `main`'deki gönderilmemiş commit `75438cd` (ödeme dağıtımı düzeltmesi) | Dokunulmadı, bu dal onu içeriyor | Dalla birlikte push |
| K12 | Yasal yetkili mahkeme | "İstanbul (Merkez)" + tüketici hakem heyetleri | Avukat belirler |

## Senin yapman gerekenler (adım adım)

### 1. Şirket bilgileri ve yasal metinler — **mağazadan önce zorunlu**
1. `src/legal/legalInfo.ts` dosyasında köşeli parantezli değerleri doldur: şirket unvanı, adres, MERSİS, iletişim e-postası, KEP, alan adı.
2. `npm run legal:html` → `legal/` klasöründeki 4 HTML'i alan adında yayınla (ör. `https://alanadi/gizlilik.html`). Herhangi bir statik barındırma yeter (Netlify, Cloudflare Pages, GitHub Pages).
3. Metinleri **KVKK konusunda uzman bir avukata** okut: aydınlatma metni, yurt dışı aktarım dayanağı, saklama süreleri, müşteri notu alanında sağlık bilgisi (alerji vb.) konusu.
4. Avukatla: OpenAI, Meta, Google, Cloudflare için **KVKK standart sözleşmeleri** imzala ve imzadan sonra **5 iş günü içinde Kurul'a bildir**. Supabase ile DPA imzala (panelde Organization → Legal).
5. VERBİS kaydı yükümlülüğünü avukata sor (çalışan/ciro eşiğine göre).
6. İYS: kampanya mesajı gönderecek her salon kendisi İYS'ye kayıt olmalı — salonlara bunu söyleyen bir bilgi notu hazırla.
7. `npm run check:release` → "EKSIK" satırı kalmamalı.

### 2. Android yükleme anahtarı (bir kez, **kaybedilirse güncelleme yapılamaz**)
1. PowerShell'de:
   ```powershell
   cd C:\Users\gorke\Desktop
   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore adapptiv-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias adapptiv-upload
   ```
   (Android Studio farklı yerdeyse `keytool` yolu değişir; repo içindeki `jdk21-portable\bin\keytool.exe` de olur.)
2. Şifreleri bir parola yöneticisine kaydet; `.jks` dosyasını **iki ayrı yerde** yedekle (ör. şifreli USB + bulut kasası). Asla git'e koyma.
3. `android/keystore.properties.example` dosyasını `android/keystore.properties` adıyla kopyala, şifreleri yaz (dosya git'e girmez).
4. `npm run android:aab` → `android/app/build/outputs/bundle/release/app-release.aab` (imzalı).

### 3. Google Play Console
1. play.google.com/console → geliştirici hesabı (25 $, kimlik doğrulama birkaç gün sürebilir). Kurumsal hesap açarsan D-U-N-S numarası gerekir.
2. **Uygulama oluştur**: ad "Adapptiv", dil Türkçe, Uygulama, Ücretsiz.
3. **Play App Signing**'i kabul et (Google uygulama anahtarını saklar, sen yükleme anahtarıyla imzalarsın).
4. **Mağaza girişi**: STORE_LISTING.md'deki kısa/tam açıklama, simge (512×512: `resources/icon.png`'den), öne çıkan grafik 1024×500, en az 2 ekran görüntüsü.
5. **Uygulama içeriği**:
   - Gizlilik politikası URL'si
   - Uygulama erişimi → demo hesap bilgileri (aşağıda 6. adım)
   - Reklamlar → "Hayır"
   - İçerik derecelendirmesi → STORE_LISTING.md cevapları
   - Hedef kitle → 18+
   - **Veri güvenliği** → DATA_INVENTORY.md §5 cevapları
   - **Hesap silme** → `https://alanadi/hesap-silme.html`
   - Kamu sağlığı / finans uygulaması → "Hayır"
6. **Test → Dahili test**: AAB'yi yükle, kendini test kullanıcısı ekle, telefondan Play üzerinden kur.
7. Yeni kişisel hesaplarda zorunlu: **Kapalı test**, en az 12 test kullanıcısıyla 14 gün. Kurumsal hesapta zorunlu değil.
8. **Üretim**'e yükseltip incelemeye gönder.

### 4. Apple (Mac gerekiyor)
1. developer.apple.com → Apple Developer Program (yıllık 99 $). Kurumsal kayıtta D-U-N-S gerekir.
2. **Certificates, IDs & Profiles → Identifiers**: `com.adapptiv.panel`, "Push Notifications" yeteneği açık.
3. **Keys → +**: "Apple Push Notifications service (APNs)" anahtarı oluştur, `.p8` dosyasını indir (bir kez inebilir), Key ID ve Team ID'yi not et.
4. **Firebase Console** → proje → iOS uygulaması ekle (`com.adapptiv.panel`) → `GoogleService-Info.plist` indir → Xcode'da `ios/App/App` içine ekle. Firebase → Proje ayarları → Cloud Messaging → APNs kimlik doğrulama anahtarı olarak `.p8`'i yükle.
5. Mac'te: `npm install && npm run build && npx cap sync ios && npx cap open ios`.
6. Xcode: File → Add Package Dependencies → `https://github.com/firebase/firebase-ios-sdk` → **FirebaseMessaging** (FirebaseCore birlikte gelir). AppDelegate'teki kod Firebase'i otomatik algılar.
7. Xcode → Signing & Capabilities: Team seç, **+ Capability → Push Notifications** ve **Background Modes → Remote notifications**.
8. `.env` dosyasına `VITE_PUSH_IOS_ENABLED=1` ekle, tekrar `npm run build && npx cap sync ios`.
9. Product → Archive → Distribute App → App Store Connect.
10. **App Store Connect**: yeni uygulama, STORE_LISTING.md metinleri, ekran görüntüleri (6,9" ve 6,5"), **App Privacy** → DATA_INVENTORY.md §6, yaş 4+, inceleme bilgileri → demo hesap + inceleme notu. TestFlight'ta dene, sonra incelemeye gönder.

### 5. Sunucu ve servis ayarları
1. **Cloudflare Turnstile** (bot koruması): dash.cloudflare.com → Turnstile → site ekle (alan adın + `localhost`). Site anahtarını `.env`'e `VITE_TURNSTILE_SITE_KEY=…` olarak yaz. Gizli anahtarı bana ver ya da Supabase SQL Editor'de çalıştır:
   ```sql
   insert into public._app_secrets(name, value) values ('turnstile_secret_key', 'GIZLI_ANAHTAR')
   on conflict (name) do update set value = excluded.value;
   ```
   Sonra `npm run legal:html` (silme sayfasına widget eklenir).
2. **Supabase → Authentication**: herkese açık kaydı kapat (hesapları yalnızca işletme/çalışan oluşturma akışı açıyor), sızan şifre koruması (Pro plan) ve en az 8 karakter şifre kuralı.
3. **Supabase planı ve yedek**: ücretsiz planda indirilebilir otomatik yedek yok → yayından önce **Pro**'ya geç (günlük yedek, 7 gün). O zamana kadar haftada bir: Docker Desktop'ı aç, `npm run backup:db` (çıktı `backups/` içinde, kişisel veri içerir — şifreli diskte sakla).
4. **n8n sunucusu**: barındırıldığı ülkeyi not et (yurt dışıysa DATA_INVENTORY.md'ye ve aydınlatma metnine eklenmeli); docker `.env` içindeki `change_me` değerlerini değiştir.
5. Alan adında yasal sayfalar yayınlandıktan sonra `legalInfo.ts`'deki `webBaseUrl`'i güncelle.
6. Meta: WhatsApp Business ve reklam bağlantısı için App Review ve `config_id` adımları (önceki notlarda bekliyor); Instagram açılmadan önce Meta'dan rate limit cevabı.

### 6. İnceleme için demo hesap
1. Gerçek müşteri verisi **olmayan** ayrı bir demo işletme aç (ör. "Demo Salon"), içine 10–20 örnek müşteri ve randevu gir.
2. Yönetici hesabı: ayrı bir e-posta (ör. `review@alanadi`) ve güçlü bir şifre.
3. Bu bilgileri Play "Uygulama erişimi" ve App Store "Sign-In Information" alanlarına yaz; inceleme notunu STORE_LISTING.md'den kopyala.
4. İnceleme süresince bu hesabı silme / şifresini değiştirme.

### 7. Dalı birleştirmeden önce
1. Telefonda aşağıdaki senaryoları dene.
2. Bana "birleştir ve push et" de: iki repo için `release/store-prep` → `main` (main'deki gönderilmemiş `75438cd` de gider).

## Telefonda elle test senaryoları

`Adapptiv-release-test.apk` (mağaza sürümüyle aynı derleme) ile; mümkünse temiz kurulum.

1. **İlk açılış**: açılış ekranında krem→gri renk sıçraması yok; giriş ekranının altında yasal bağlantılar açılıyor, geri dönülüyor.
2. **Giriş / bildirim**: giriş sonrası "Randevu bildirimlerini açalım mı?" ekranı → *Şimdi değil* → Ayarlar → Telefon bildirimleri "Kapalı" → dokun → sistem penceresi → izin ver → "Açık".
3. **Oturum**: uygulamayı tamamen kapat, aç → giriş istemeden anasayfa.
4. **Randevu**: + → müşteri seç, hizmet, gün, saat, ücreti değiştir → kaydet → takvimde gör → detay → Düzenle (saat değiştir) → kaydet → Durumu değiştir → İptal.
5. **Tamamlama ve borç**: bir randevuyu kaydırarak tamamla → "Şimdi ödeme yok" → müşteri kartında borç → Ödeme al → "Borç yok".
6. **Müşteri ve arama**: yeni müşteri "İpek Şahin" → aramada `ipek sahin` yaz → bulunmalı.
7. **Kampanya izni**: müşteri düzenle → "Kampanya mesajı izni var"ı aç → kaydet → tekrar aç: tarih ve "salonda verildi" yazısı.
8. **Toplu mesaj**: Kendin seç → izinli + izinsiz iki müşteri → "Kampanya izni yok: 1 kişiye gitmez" → Önizle'de "RET yazın" satırı → gönder.
9. **Raporlar**: Kasa ve Performans raporu PDF → paylaş sayfası açılıyor, PDF'te tablolar taşmıyor; Ayarlar → Verilerimi indir → Excel açılıyor, Türkçe karakterler doğru.
10. **İnternetsiz**: uçak modu → üstte kırmızı "İnternet bağlantısı yok" şeridi → bir şey kaydetmeyi dene → anlaşılır Türkçe hata → uçak modunu kapat → şerit kayboluyor.
11. **Hesap silme**: bir test çalışanı hesabıyla gir → Ayarlar → Hesabımı sil → şifre → giriş ekranına dönülüyor, aynı bilgilerle giriş başarısız.
12. **Küçük ekran / büyük yazı**: telefonun yazı boyutunu en büyüğe al → ana ekranlarda taşma/kesilme yok.
13. **WhatsApp RET** (WhatsApp bağlıysa): izinli bir müşteriden işletme numarasına "RET" yaz → "Kampanya mesajı listesinden çıkarıldınız" cevabı → müşteri kartında izin kapalı.

## Bilinen riskler

- **Canlı veritabanı ortak**: testler ve demo canlı projede (K7). E2E temizliği yalnızca `E2E`/`e2e-` önekli verileri siler.
- **iOS hiç derlenmedi**: Windows'ta Xcode yok; AppDelegate/pbxproj değişiklikleri Mac'te ilk derlemede doğrulanmalı.
- **Web panelde (admin-panel) kampanya izni anahtarı yok**: sunucu izinsiz müşteriye kampanya göndermiyor ama web'den izin verilemiyor; web panelde Google Fonts hâlâ çalışma anında yükleniyor.
- **Müşteri notu serbest metin**: salonlar sağlık bilgisi (alerji) yazıyor; özel nitelikli veri — avukatla değerlendirilmeli.
- **Saat dilimi**: cihaz Türkiye saatinde değilse randevu saatleri kayar (uyarı var, tam düzeltme yok — K9). Uyarı şeridi sayfa başlığının üstüne biniyor; kapatılabilir.
- **Kontrast**: soluk ipucu metinleri (`--text-faint`) açık zeminde WCAG AA altında; yalnızca ikincil metinlerde.
- **Uzun sayfalar**: AppointmentsPage'te randevu oluşturma formu ve tamamlama ekranı hâlâ aynı dosyada (40+ ortak durum); diğer uzun sayfalar (çalışan detay 1.350 satır) bölünmedi.
- **Yedek**: ücretsiz planda otomatik indirilebilir yedek yok; `npm run backup:db` Docker gerektiriyor.
- **Hukuk**: tüm yasal metinler taslak.
