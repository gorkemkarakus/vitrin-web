# Kod Denetim Raporu — Adapptiv Mobil

Tarih: 2026-10-17 · Dal: `refactor/professional-cleanup` · Kapsam: `isletme_oto_mobil` (React 19 + Vite + Capacitor 8)

Kod tabanı: ~22.500 satır TypeScript/TSX, ~17.500 satır CSS, 405 izlenen dosya.
Kullanılan araçlar: `tsc`, `oxlint`, `npm audit`, `knip` (kullanılmayan kod), `jscpd` (tekrar eden kod), git geçmişi taraması, elle inceleme.

Önem dereceleri: **Kritik** (hemen istismar edilebilir / veri kaybı) · **Yüksek** · **Orta** · **Düşük**.

## Özet

| Önem | Adet |
| --- | --- |
| Kritik | 0 |
| Yüksek | 1 (+2 sunucu tarafı, kapsam dışı) |
| Orta | 6 |
| Düşük | 11 |

Kaynak kodda ve git geçmişinde gizli anahtar, token ya da şifre bulunmadı. Uygulama izinleri asgari düzeyde, tüm ağ trafiği HTTPS, `any` / `@ts-ignore` kullanımı yok, WebView'e HTML enjekte eden kod (`innerHTML`, `dangerouslySetInnerHTML`) yok.

## 1. Güvenlik

| # | Önem | Bulgu | Dosya | Öneri |
| --- | --- | --- | --- | --- |
| G1 | Yüksek | Oturum (access + refresh token) WebView'in düz `localStorage`'ında duruyor. Android'de `allowBackup=false` yedeğe gitmesini engelliyor; iOS'ta cihaz yedeğine ve root/jailbreak durumunda okumaya açık. | `src/lib/supabase.ts` | Native platformda Android Keystore / iOS Keychain tabanlı güvenli depolama; mevcut oturumlar kullanıcı çıkış yapmadan taşınmalı. |
| G2 | Orta | Edge function çağrıları 12 yerde elle yazılmış; token React context'inden okunuyor. Token yenilendiği anda context henüz güncellenmemişse istek 401 alabilir. Hata gövdesi her yerde farklı ayrıştırılıyor. | `SettingsPage`, `EmployeeCreatePage`, `EmployeeDetailPage`, `AiInsightsPage`, `AdInsightsPage`, `AdOAuthCallbackPage`, `SendCampaignModal`, `TemplateModal` | Tek bir istemci (`lib/edgeFunctions.ts`): her çağrıda güncel oturumdan token, tek tip `{ ok, status, data, error }` dönüşü. |
| G3 | Orta | Geliştirme bağımlılıklarında bilinen açıklar: `tar` (kritik, `@capacitor/cli` üzerinden), `sharp` (yüksek, `@capacitor/assets` üzerinden). Uygulama paketine girmiyorlar; `npm audit --omit=dev` = 0 açık. | `package.json` | Zorlamasız düzeltme yok. `tar` için güvenli sürüme `overrides` denenecek; `@capacitor/assets` yalnızca ikon üretiminde kullanılıyor. |
| G4 | Orta | `supabase/.temp/` (CLI'nin yerel önbelleği: proje referansı, veritabanı havuz adresi) git'te izleniyor. Şifre içermiyor ama altyapı bilgisi sızdırıyor ve her CLI çalışmasında değişiyor. | `supabase/.temp/*` | Git'ten çıkarılıp `.gitignore`'a eklenecek. |
| G5 | Düşük | Üretim derlemesinde `console.warn` çağrıları (3 adet, hassas veri yok). | `src/lib/push.ts` | Ortama göre kapanan merkezi logger. |
| G6 | Düşük | Telefon alanları dışındaki form girdilerinde uzunluk sınırı yok (ad, not, açıklama). Sunucuda RLS ve sütun tipleri koruyor; risk düşük, ama aşırı uzun girdi arayüzü bozabilir. | Formlar | `maxLength` eklenmesi (davranış değişikliği olduğu için ayrıca onaya bırakıldı). |
| S1 | Yüksek | *(Sunucu, kapsam dışı)* WhatsApp bot fonksiyonları (`book/cancel/reschedule-appointment`, `chatbot-context`, `chatbot-log-message`) işletmeyi gövdedeki `phone_number_id` ile buluyor, gizli anahtar istemiyor. WhatsApp şu an kapalı. | `supabase/functions/*` | WhatsApp yeniden kurulurken paylaşılan gizli başlık eklenecek. |
| S2 | Orta | *(Sunucu, kapsam dışı)* Supabase "sızdırılmış şifre koruması" kapalı (Pro plan gerektiriyor). Kayıt kapatıldı, en kısa şifre 8 yapıldı. | Supabase Auth | Pro plana geçilirse açılmalı. |

İncelenen ve sorun bulunmayan konular:
- **Gizli anahtarlar:** `src`, `android`, `ios`, kök dosyalar ve tüm git geçmişi tarandı. `.env` git dışında, `.env.example` mevcut; `google-services.json` git dışında. `VITE_SUPABASE_ANON_KEY` tasarım gereği herkese açık bir anahtar; yetki RLS ile sağlanıyor.
- **RLS:** 2026-10-16'daki güvenlik testinde tüm tablolarda RLS açık bulundu; işletmeler arası okuma/yazma ve yetki yükseltme denemeleri reddedildi. Anonim rolün tüm yetkileri kaldırıldı.
- **Oturum akışı:** Token yenileme Supabase istemcisinde otomatik; çıkışta oturum siliniyor ve bildirim cihazı kaydı kaldırılıyor. Çalışan yetkileri hem arayüzde hem RLS'te (`has_perm`) kontrol ediliyor.
- **Ağ ve izinler:** Tüm istekler HTTPS, düz HTTP kapalı (`cleartext` yok, `NSAllowsArbitraryLoads` yok). Android izinleri yalnızca İnternet ve bildirim için gerekenler; iOS'ta kullanım izni yok.
- **Diğer:** Üretim derlemesinde kaynak haritası (`.map`) yayınlanmıyor.

## 2. Kod kalitesi

| # | Önem | Bulgu | Konum | Öneri |
| --- | --- | --- | --- | --- |
| K1 | Orta | Otomatik test yok. | — | Vitest; iş mantığı yardımcıları (borç hesabı, telefon, Excel, mükerrer müşteri, yetkiler, tarih) için birim testler. |
| K2 | Orta | Kod biçimlendirici ve `.editorconfig` yok; satır uzunluğu, tırnak ve sıralama dosyadan dosyaya değişiyor. | Proje kökü | Prettier + `.editorconfig`; tüm kod tek seferde biçimlendirilecek (ayrı commit). |
| K3 | Düşük | Aynı yardımcı birden çok dosyada tanımlı: `initials` (5), `todayLocalDateString` (5), `presetRange` (4), saat→dakika çevirici (5), `WEEK_ORDER` / `DAY_SHORT` / `DAY_LONG` / `WEEKDAY_SHORT` sabitleri, `customerPhone` (2), `formatPhone` (2), `AVATAR_TONES` (3), `HOLIDAY_LABEL` (3). | `src/pages/*`, `src/components/*` | Aynı davranışlı olanlar `src/lib`'e taşınacak. |
| K4 | Düşük | Blok tekrarı (toplam %1,3): şifre belirleme formu (`ForcePasswordPage` ↔ `ResetPasswordPage`, 62 satır), mesaj üretme modalları (`SendCampaignModal` ↔ `TemplateModal`, 53 satır), `Select` ↔ `StatusDropdown` dışarı tıklama mantığı. | — | Ortak bileşen/hook. |
| K5 | Düşük | Kullanılmayan kod: `components/Logo.tsx`, 9 ikon bileşeni, 5 export, 6 dışa açık tip. | `knip` çıktısı | Silinecek / dışa açılmayacak. |
| K6 | Düşük | Yorum satırına alınmış ölü kod (`capacitor.config.ts` içindeki `server` bloğu). | `capacitor.config.ts` | README'deki geliştirme bölümüne taşınacak. |
| K7 | Düşük | CSS'te 389 sabit renk; en sık kullanılan gri tonların (`#9ca3af` ×48, `#eef0f3` ×42, `#6b7280` ×28, `#e2e5ea` ×26 …) karşılığı tema değişkeni yok. | `src/**/*.module.css` | Aynı değerlerle tema değişkenleri tanımlanıp kullanılacak (görünüm değişmez). |
| K8 | Düşük | 59 satır içi stil. Çoğu dinamik (yüzde genişlik, durum rengi) ve yerinde; ~15 tanesi sabit ve CSS'e taşınabilir. | `App.tsx`, `DonutChart`, `LineChart`, `AccountingPage`, formlar | Sabit olanlar sınıfa taşınacak. |
| K9 | Düşük | 31 adet `eslint-disable-next-line react-hooks/exhaustive-deps`. Oxlint bu kuralı uyguluyor ve yorumlar gerçek uyarıları bastırıyor (ör. yalnızca ilk yüklemede çalışması istenen efektler). | Sayfalar | Bağımlılık listelerini değiştirmek davranışı değiştirir; yorumlar kalacak. Yeniden yazılan sayfalarda `useEffectEvent` ile kaldırılabilir. |
| K10 | Düşük | Çok uzun dosyalar: `AppointmentsPage` (2.970), `EmployeeDetailPage` (1.267), `CustomerDetailPage` (984), `EmployeeLeavesPage` (910), `AiInsightsPage` (899). | `src/pages` | `AppointmentsPage` ürün sahibinin kararıyla bölünmüyor. Diğerlerinde bağımsız bölümler ayrı bileşene alınabilir; davranış riski nedeniyle ayrı iş olarak önerilir. |

## 3. Yorumlar ve metinler

| # | Önem | Bulgu | Öneri |
| --- | --- | --- | --- |
| Y1 | Düşük | Değişiklik geçmişi anlatan yorumlar ("test edilip doğrulandı", "eskiden …", tarih ve migration referansları), 29 yer. Bu bilgi git geçmişine ait. | Kaldırılacak veya kısa bir "neden" cümlesine indirilecek. |
| Y2 | Düşük | Kodun ne yaptığını tekrar eden uzun açıklamalar (toplam 795 yorum satırı). | Yalnızca "neden"i anlatan yorumlar kalacak. |
| Y3 | Düşük | Herkese açık randevu sayfasında 2 emoji (🔒, ⏱). | Sade metne çevrilecek. |
| Y4 | Düşük | Hata mesajlarında küçük üslup farkları ("lütfen" kimi yerde var, kimi yerde yok; "Bağlantı hatası" ↔ "Sunucuya ulaşılamadı"). | Ortak mesajlar tek dosyada toplanacak. Tüm arayüz metinlerinin tek bir dil dosyasına taşınması (~1.500 metin) ayrı bir iş olarak önerilir. |
| Y5 | Düşük | README, Vite şablonunun varsayılan İngilizce metni. | Kurulum, ortam değişkenleri, yapı ve derleme adımlarıyla yeniden yazılacak. |

## 4. Kapsam dışı bırakılanlar

- **`AppointmentsPage.tsx` bölünmeyecek:** Ürün sahibinin önceki kararı. Biçimlendirme ve yorum temizliği yapılır, yapısı korunur.
- **`supabase/functions` ve `supabase/migrations`:** Web paneli reposundan aynalanıyor ve oradan yayınlanıyor. Burada değiştirmek iki repoyu ayrıştırır; sunucu bulguları (S1, S2) raporda listelendi.
- **Davranış değiştiren düzeltmeler** (G6 uzunluk sınırları, hook bağımlılık listeleri): ayrıca onaya bırakıldı.
