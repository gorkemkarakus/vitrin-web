# Mağaza Listeleme Metinleri

Google Play Console ve App Store Connect'e kopyalanacak metinler. Karakter sınırları parantez içinde; metinler sınırın altında. Köşeli parantezli değerleri (`[…]`) yayından önce doldur.

## Ortak

| Alan | Değer |
|---|---|
| Uygulama adı | **Adapptiv** |
| Paket / Bundle ID | `com.adapptiv.panel` |
| Kategori | Play: **İş** · App Store: **Business** (ikincil: Productivity) |
| Dil | Türkçe (birincil) |
| Fiyat | Ücretsiz indirme (işletme planları uygulama dışında satılıyorsa uygulama içinde satın alma yok) |
| Gizlilik politikası URL'si | `[https://alan-adi]/gizlilik.html` |
| Hesap silme URL'si (Play zorunlu) | `[https://alan-adi]/hesap-silme.html` |
| Destek URL'si / e-posta | `[https://alan-adi]` · `[iletişim e-posta adresi]` |
| Pazarlama URL'si (ops.) | `[https://alan-adi]` |
| Telif hakkı (App Store) | `2026 [Şirket unvanı]` |

## Kısa açıklama — Play (80)

> Salonunun randevu, müşteri, kasa ve WhatsApp asistanı tek uygulamada.

(69 karakter)

## Alt başlık — App Store (30)

> Salon randevu ve kasa takibi

(28 karakter)

## Tam açıklama — Play ve App Store (4000)

> Adapptiv, güzellik ve bakım salonlarının günlük işini telefondan yönetmesi için tasarlandı. Randevular, müşteriler, ödemeler ve ekip tek yerde; müşterilerin WhatsApp'tan yazdığında randevuyu asistan alır.
>
> **Randevular**
> • Günlük, haftalık ve aylık takvim
> • "Fark etmez" seçiminde işi çalışanlar arasında adil dağıtma
> • Randevuyu kaydırarak tamamlama, ödeme ve paket seansını aynı anda kaydetme
> • Online randevu sayfası: müşteriler boş saatleri görüp kendi randevusunu alır
>
> **Müşteriler**
> • Müşteri kartı: geçmiş randevular, borç ve ödemeler, paketler, notlar
> • Türkçe karakterli ve karaktersiz hızlı arama
> • Müşteri grupları ve kampanya izni takibi
>
> **Kasa ve raporlar**
> • Günlük tahsilat, gün sonu kasa sayımı, giderler
> • Çalışan primleri ve kazanç takibi
> • Performans ve muhasebe raporları (PDF), tüm verilerini Excel olarak indirme
>
> **WhatsApp ve mesajlar**
> • Müşteri yazdığında randevu alan, iptal eden, erteleyen asistan
> • Randevu hatırlatmaları
> • Yalnızca izin veren müşterilere toplu kampanya mesajı; "RET" yazan otomatik çıkar
>
> **Ekip**
> • Çalışan hesapları ve ayrıntılı yetkiler
> • Çalışma saatleri, izinler ve tatil günleri
>
> **Gizlilik ve güvenlik**
> • Verilerin Avrupa Birliği'ndeki sunucularda, işletmeler birbirinden yalıtılmış
> • Giriş anahtarın telefonun güvenli deposunda
> • Reklam veya takip aracı yok
> • Hesabını ve verilerini uygulama içinden silebilirsin
>
> Adapptiv'i kullanmak için işletme hesabı gerekir. Hesap açmak için: [iletişim e-posta adresi]

## Anahtar kelimeler — App Store (100, virgülle)

> salon,kuaför,güzellik,randevu,ajanda,müşteri,kasa,berber,manikür,tırnak,whatsapp,takvim

(87 karakter)

## Yenilikler (bu sürüm)

> İlk sürüm.

## Ekran görüntüleri

Gerekli boyutlar: Play telefon en az 2 adet (1080×1920 veya üstü, 9:16), App Store 6,9" (1320×2868) ve 6,5" (1284×2778). Önerilen sıra (gerçek müşteri verisi **olmayan** demo işletmeden alın):

1. Anasayfa — bugünkü tahsilat ve sıradaki randevu
2. Randevular — günlük takvim
3. Yeni randevu formu
4. Müşteri kartı — borç ve ödemeler
5. Kasa / gün sonu
6. WhatsApp konuşmaları
7. Performans raporu PDF önizlemesi

## İçerik derecelendirmesi (Play anketi)

Şiddet, cinsel içerik, kumar, uyuşturucu yok · Kullanıcılar arası iletişim: **Evet** (işletme ile müşterisi arasında WhatsApp mesajları; uygulama içi herkese açık sohbet yok) · Konum paylaşımı yok · Dijital satın alma yok → beklenen sonuç: **3+ / Herkes**.

App Store yaş derecelendirmesi: tüm sorulara "Yok" → **4+**.

## Hedef kitle (Play)

Hedef yaş: **18+** (işletme uygulaması). "Çocuklara hitap ediyor mu?" → Hayır.

## İnceleme ekibi için demo hesap (App Store "Sign-In Information", Play "Uygulama erişimi")

Gerçek müşteri verisi içermeyen ayrı bir demo işletme açılmalı (bkz. RELEASE_CHECKLIST.md "Demo hesap"). Giriş bilgileri:

```
E-posta: [demo e-posta]
Şifre:   [demo şifre]
```

İnceleme notu (kopyala):

> Adapptiv is a business app for beauty salons (Turkish UI). Sign in with the demo account above; it contains sample customers and appointments only. Main flows: Randevular (appointments) → "+" to create; Müşteriler (customers); Daha Fazla → Kasa (cash). Account deletion: Daha Fazla → Ayarlar → Hesabımı sil. Push notifications are optional and requested with an explanation screen after login. WhatsApp assistant features require a business WhatsApp number and are not needed for review.
