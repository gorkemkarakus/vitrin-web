import { LEGAL_INFO as L } from './legalInfo.ts'

// Uygulama ici sayfalar (/gizlilik, /kvkk, /kullanim-kosullari) ve
// legal/*.html taslaklari bu tek kaynaktan uretilir (scripts/build-legal.mjs).
// TASLAKTIR — yayin oncesi bir hukukcu tarafindan gozden gecirilmeli.

export interface LegalSection {
  heading: string
  paragraphs?: string[] // listeden once
  items?: string[]
  after?: string[] // listeden sonra
}

export interface LegalDocument {
  slug: 'gizlilik' | 'kvkk' | 'kullanim-kosullari'
  title: string
  summary: string
  sections: LegalSection[]
}

const contactLine = `${L.companyName}, ${L.address} · E-posta: ${L.contactEmail} · KEP: ${L.kepAddress}`

// Uygulamanin kullandigi ucuncu taraf hizmetler (DATA_INVENTORY.md ile ayni tutulmali).
export const PROCESSORS: { name: string; purpose: string; location: string }[] = [
  {
    name: 'Supabase (Supabase Inc.)',
    purpose: 'Veritabanı, kimlik doğrulama, dosya ve sunucu fonksiyonları barındırma',
    location: 'Almanya (Frankfurt, AB)',
  },
  {
    name: 'OpenAI (OpenAI, L.L.C.)',
    purpose:
      'Yapay zekâ özellikleri: WhatsApp randevu asistanı yanıtları, kampanya metni önerisi, işletme analizi, doğal dille randevu komutu',
    location: 'ABD',
  },
  {
    name: 'Meta Platforms (WhatsApp Business, Facebook/Instagram reklamları)',
    purpose: 'Müşterilere WhatsApp mesajı gönderimi/alımı; işletme bağlarsa reklam performans verisi',
    location: 'ABD / AB',
  },
  {
    name: 'Google Firebase Cloud Messaging (Google LLC)',
    purpose: 'Uygulama bildirimlerinin telefona iletilmesi (cihaz bildirim anahtarı)',
    location: 'ABD',
  },
  {
    name: 'Cloudflare Turnstile (Cloudflare, Inc.)',
    purpose: 'Online randevu ve silme talebi formlarında otomatik (bot) gönderimleri engelleme',
    location: 'ABD / küresel',
  },
  {
    name: 'Resend (Resend, Inc.)',
    purpose: 'Hesap doğrulama ve şifre sıfırlama e-postalarının gönderimi (yalnızca hesap sahipleri)',
    location: 'İrlanda (AB)',
  },
]

// Yurt disi aktarim aciklamasi: gizlilik politikasi, KVKK metni ve salon
// aydinlatma sablonunda ayni ifade kullanilir.
export const TRANSFER_STATEMENT =
  "Ana veritabanı ve dosyalar Almanya'da (Frankfurt, AB), e-postalar İrlanda'da (AB) işlenir; yukarıda ABD olarak belirtilen sağlayıcılara da veri aktarılır. Bu sağlayıcılarla, verilerin yalnızca hizmetin sunulması amacıyla ve gizlilik ile güvenlik yükümlülükleri altında işlenmesini öngören veri işleme sözleşmeleri kapsamında çalışılır. Sağlayıcılara yalnızca ilgili işlem için gereken veri gönderilir; müşteri notları, sağlık bilgileri ve işletmenin tanımladığı özel alanlar yapay zekâ sağlayıcısına gönderilmez."

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    slug: 'gizlilik',
    title: 'Gizlilik Politikası',
    summary: `${L.brand}, güzellik ve bakım salonlarının randevu, müşteri ve kasa işlerini yönettiği bir uygulamadır. Bu politika hangi verileri neden işlediğimizi, kimlerle paylaştığımızı ve haklarınızı anlatır.`,
    sections: [
      {
        heading: 'Kimin verisi, kimin sorumluluğunda?',
        items: [
          `Uygulama hesabı olan işletme sahipleri ve çalışanlar: bu kişilerin hesap verileri için veri sorumlusu ${L.companyName}'dır.`,
          `Salonların müşterileri (randevu alan kişiler): bu kişilerin verileri için veri sorumlusu ilgili salondur; ${L.brand} bu verileri salon adına ve salonun talimatıyla işleyen "veri işleyen"dir.`,
        ],
      },
      {
        heading: 'Hangi verileri işliyoruz?',
        items: [
          'Hesap verileri: ad soyad, e-posta, şifre (yalnızca şifrelenmiş özet olarak), rol ve yetkiler, WhatsApp numarası (çalışan girerse), cinsiyet (çalışan profili için isteğe bağlı).',
          'Çalışma verileri: çalışma saatleri, izinler, verdiği hizmetler, prim/komisyon kayıtları.',
          'Salon müşteri verileri: ad soyad, telefon, e-posta (isteğe bağlı), notlar, doğum günü, etiketler, işletmenin tanımladığı ek alanlar, randevu geçmişi, ödemeler, borç/alacak ve paket bilgileri, müşteri grupları, görevler ve aktivite kayıtları (arama/ziyaret notu).',
          'Müşteri dosyaları: işletmenin yüklediği işlem öncesi/sonrası fotoğraflar, onam formları ve belgeler. Bu dosyalar herkese açık değildir; yalnızca ilgili işletmenin yetkili kullanıcıları görebilir.',
          'Özel nitelikli veriler: işletme sağlık bilgisi (ör. alerji) içeren bir alan tanımlarsa bu bilgi özel nitelikli kişisel veridir; yalnızca gerektiğinde ve müşterinin açık rızasıyla girilmelidir.',
          'Potansiyel müşteri, sadakat ve memnuniyet verileri: henüz müşteri olmamış kişilerin adı, telefonu ve ilgilendiği hizmet; sadakat kartı ödül kullanımları; memnuniyet anketi puanı ve yorumu.',
          'İletişim verileri: WhatsApp üzerinden asistanla yapılan yazışmalar, gönderilen hatırlatma ve kampanya mesajlarının kaydı.',
          'İşletme verileri: hizmetler, fiyatlar, giderler, kasa kapanışları, reklam hesabı bağlanırsa reklam harcama/performans özetleri.',
          'Teknik veriler: bildirim için cihaz anahtarı ve platform (Android/iOS), kötüye kullanımı önlemek için IP adresinin geri döndürülemez özeti (IP adresinin kendisi saklanmaz).',
        ],
        after: [
          'Konum, rehber, mikrofon, reklam kimliği veya uygulama dışı gezinme verisi toplamıyoruz. Kamera ve galeri yalnızca siz müşteri kartına fotoğraf veya belge eklemek istediğinizde, telefonunuzun izniyle kullanılır. Uygulamada reklam veya üçüncü taraf takip aracı yoktur.',
        ],
      },
      {
        heading: 'Verileri neden işliyoruz?',
        items: [
          'Randevu oluşturma, hatırlatma ve iptal/erteleme işlemlerini yürütmek.',
          'Müşteri, ödeme, borç ve kasa kayıtlarını işletme adına tutmak ve raporlamak.',
          'İşletmenin istediği durumlarda WhatsApp üzerinden otomatik randevu asistanını çalıştırmak.',
          'İşletmenin onaylı müşterilerine kampanya mesajı gönderebilmesini sağlamak.',
          'Hesap güvenliği, kötüye kullanımın önlenmesi ve yasal yükümlülüklerin yerine getirilmesi.',
        ],
      },
      {
        heading: 'Yapay zekâ özellikleri',
        paragraphs: [
          "WhatsApp asistanı, kampanya metni önerisi, işletme analizi ve doğal dille randevu komutu özellikleri metni OpenAI'a gönderir. Gönderilen içerik yalnızca o işlem için gereken bilgidir (ör. müşterinin mesajı ve salonun hizmet listesi; analiz için toplu istatistikler). Müşteri notları, sağlık bilgileri, etiketler ve işletmenin tanımladığı özel alanlar gönderilmez. OpenAI'ın API koşullarına göre bu veriler model eğitiminde kullanılmaz.",
          'Yapay zekâ çıktıları öneri niteliğindedir; randevu, mesaj veya kampanya işletme onayıyla kesinleşir.',
        ],
      },
      {
        heading: 'Kimlerle paylaşıyoruz?',
        paragraphs: [
          'Verileri satmıyoruz ve reklam amacıyla paylaşmıyoruz. Hizmeti sunabilmek için yalnızca aşağıdaki altyapı sağlayıcılarıyla, gereken ölçüde paylaşılır:',
        ],
        items: PROCESSORS.map((p) => `${p.name} — ${p.purpose} (${p.location})`),
      },
      {
        heading: 'Yurt dışına aktarım',
        paragraphs: [TRANSFER_STATEMENT],
      },
      {
        heading: 'Ne kadar süre saklıyoruz?',
        items: [
          'Hesap ve işletme verileri: hesap/işletme silinene kadar. Silindiğinde ilgili tüm kayıtlar kalıcı olarak silinir.',
          'WhatsApp ham bildirim kayıtları: 30 gün.',
          'WhatsApp asistanı konuşma geçmişi: 180 gün.',
          'Gönderilen mesaj/bildirim kaydı: 365 gün.',
          'Kötüye kullanım önleme kayıtları (IP özeti, deneme sayaçları): 2–7 gün.',
          'Kazanılan/kaybedilen potansiyel müşteri kayıtları ekranda 90 gün gösterilir; işletme silene kadar saklanır.',
          'Müşteri dosyaları, anket yanıtları, sadakat ve aktivite kayıtları: işletme silene kadar. İşletme bir müşteriyi KVKK kapsamında sildiğinde bu kayıtların tamamı da silinir.',
          'Muhasebe ve ödeme kayıtları işletmenin kendi yasal saklama yükümlülüğüne tabidir; işletme bu kayıtları silmeden önce kendi yükümlülüğünü değerlendirmelidir.',
        ],
      },
      {
        heading: 'Güvenlik',
        items: [
          'Tüm bağlantılar şifrelidir (HTTPS/TLS); uygulama şifresiz bağlantıya izin vermez.',
          'Her işletmenin verisi veritabanı düzeyinde diğer işletmelerden yalıtılır; çalışanlar yalnızca yetkili oldukları verileri görür.',
          'Oturum anahtarı telefonda işletim sisteminin güvenli deposunda (Android Keystore / iOS Keychain) tutulur.',
          'Reklam hesabı erişim anahtarları veritabanında şifrelenmiş olarak saklanır.',
        ],
      },
      {
        heading: 'Haklarınız',
        paragraphs: [
          "KVKK'nın 11. maddesi uyarınca verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini veya silinmesini isteme, aktarıldığı üçüncü kişileri bilme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz.",
          `Hesap sahibiyseniz hesabınızı uygulamada Ayarlar → Hesabımı sil adımıyla kendiniz silebilirsiniz. Uygulamaya erişemiyorsanız veya bir salonun müşterisiyseniz ${L.webBaseUrl}/hesap-silme adresinden talep oluşturabilirsiniz. Salon müşterisi olarak yaptığınız başvuruları ilgili salona da iletebilirsiniz; talebiniz en geç 30 gün içinde yanıtlanır.`,
        ],
      },
      {
        heading: 'Çocuklar',
        paragraphs: [
          `${L.brand} işletmelere yönelik bir uygulamadır; 18 yaşından küçüklerin hesap açmasına yönelik değildir.`,
        ],
      },
      {
        heading: 'Değişiklikler ve iletişim',
        paragraphs: [
          'Bu politikayı güncellediğimizde sayfanın başındaki tarihi değiştirir, önemli değişiklikleri uygulama içinde duyururuz.',
          contactLine,
        ],
      },
    ],
  },
  {
    slug: 'kvkk',
    title: 'KVKK Aydınlatma Metni',
    summary:
      "6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca hazırlanmıştır.",
    sections: [
      {
        heading: '1. Veri sorumlusu',
        paragraphs: [
          `Uygulama hesabı olan kişiler bakımından veri sorumlusu: ${contactLine} (MERSİS: ${L.mersisNo}).`,
          `Salonlardan randevu alan müşteriler bakımından veri sorumlusu, randevu alınan salondur. ${L.companyName} bu veriler bakımından salon adına hareket eden veri işleyendir; salonlar müşterilerini kendi aydınlatma metinleriyle ayrıca bilgilendirmekle yükümlüdür.`,
        ],
      },
      {
        heading: '2. İşlenen kişisel veriler',
        items: [
          'Kimlik: ad soyad, cinsiyet (isteğe bağlı, çalışan profili).',
          'İletişim: telefon, e-posta, WhatsApp numarası.',
          'Müşteri işlem: randevular, alınan hizmetler, ödemeler, borç/alacak, paketler, notlar, WhatsApp yazışmaları.',
          'Finans: ödeme tutarları ve yöntemleri, giderler, prim/komisyon tutarları.',
          'İşlem güvenliği: şifre özeti, oturum kayıtları, IP adresi özeti, cihaz bildirim anahtarı.',
          'Pazarlama: kampanya mesajı izni ve iznin tarihi/kaynağı.',
        ],
      },
      {
        heading: '3. İşleme amaçları',
        items: [
          'Randevu ve hizmet süreçlerinin yürütülmesi, hatırlatma mesajlarının gönderilmesi.',
          'Müşteri, ödeme ve kasa kayıtlarının tutulması; finans ve muhasebe işlerinin yürütülmesi.',
          'İletişim faaliyetlerinin yürütülmesi (WhatsApp asistanı, bildirimler).',
          'Açık izin veren müşterilere ticari elektronik ileti gönderilmesi.',
          'Bilgi güvenliği süreçlerinin yürütülmesi, kötüye kullanımın önlenmesi.',
          'Yetkili kurum ve kuruluşlara bilgi verilmesi, hukuki uyuşmazlıklarda delil olarak kullanılması.',
        ],
      },
      {
        heading: '4. Hukuki sebepler',
        items: [
          'Sözleşmenin kurulması ve ifası (KVKK md. 5/2-c): hesap, randevu ve ödeme işlemleri.',
          'Veri sorumlusunun hukuki yükümlülüğü (md. 5/2-ç): yasal kayıt ve bildirim yükümlülükleri.',
          'Meşru menfaat (md. 5/2-f): güvenlik, kötüye kullanımın önlenmesi, hizmetin iyileştirilmesi.',
          'Açık rıza (md. 5/1): ticari elektronik ileti (kampanya mesajı) gönderimi; 6563 sayılı Kanun ve İleti Yönetim Sistemi (İYS) kuralları da uygulanır.',
        ],
      },
      {
        heading: '5. Aktarım',
        paragraphs: [
          'Kişisel veriler; hizmetin sunulması amacıyla barındırma, e-posta, mesajlaşma, bildirim ve yapay zekâ altyapısı sağlayıcılarına (Supabase, Resend – AB; OpenAI, Meta, Google, Cloudflare – ABD) ve talep hâlinde yetkili kamu kurumlarına aktarılabilir.',
          TRANSFER_STATEMENT,
        ],
      },
      {
        heading: '6. Toplama yöntemi',
        paragraphs: [
          'Veriler; uygulama ve web paneline girilen bilgiler, online randevu formu, WhatsApp üzerinden gelen mesajlar ve (işletme bağlarsa) Meta reklam hesabı aracılığıyla elektronik ortamda, otomatik veya kısmen otomatik yollarla toplanır.',
        ],
      },
      {
        heading: '7. Haklarınız (KVKK md. 11)',
        items: [
          'Kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme,',
          'İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,',
          'Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,',
          'Eksik veya yanlış işlenmişse düzeltilmesini, KVKK md. 7 şartlarıyla silinmesini veya yok edilmesini isteme ve bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme,',
          'Münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme,',
          'Kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme.',
        ],
        after: [
          `Başvurularınızı ${L.contactEmail} adresine, KEP ile ${L.kepAddress} adresine veya ${L.webBaseUrl}/hesap-silme formu üzerinden iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz sonuçlandırılır.`,
        ],
      },
    ],
  },
  {
    slug: 'kullanim-kosullari',
    title: 'Kullanım Koşulları',
    summary: `Bu koşullar ${L.brand} uygulamasını ve web panelini kullanan işletmeler ile çalışanları için geçerlidir. Uygulamayı kullanarak bu koşulları kabul etmiş olursunuz.`,
    sections: [
      {
        heading: 'Hizmet',
        paragraphs: [
          `${L.brand}; randevu takvimi, müşteri kayıtları, ödeme/borç takibi, kasa, gider, ekip yönetimi, online randevu sayfası, WhatsApp randevu asistanı, toplu mesaj ve yapay zekâ destekli öneriler sunar. Özellikler zaman içinde değişebilir.`,
        ],
      },
      {
        heading: 'Hesaplar',
        items: [
          'İşletme hesabını açan kişi işletmenin yöneticisidir; çalışan hesaplarını o oluşturur ve yetkilerini belirler.',
          'Giriş bilgilerinizi gizli tutmak sizin sorumluluğunuzdadır. Yetkisiz kullanım fark ederseniz şifrenizi değiştirin ve bize bildirin.',
          'Hesap bilgilerinin doğru ve güncel olması gerekir.',
        ],
      },
      {
        heading: 'İşletmenin sorumlulukları',
        items: [
          'Uygulamaya girdiğiniz müşteri verileri için veri sorumlusu sizsiniz. Müşterilerinizi KVKK kapsamında bilgilendirmek ve gerekli hukuki sebebe sahip olmak sizin yükümlülüğünüzdür. Bunun için Ayarlar → Müşteri aydınlatma metni bölümünden işletmenize özel bir aydınlatma metni oluşturabilirsiniz.',
          'Uygulamaya elle girdiğiniz veya toplu olarak içe aktardığınız (Excel/CSV) kişisel verileri hukuka uygun şekilde elde ettiğinizi ve ilgili kişileri bilgilendirdiğinizi taahhüt edersiniz. Hukuka aykırı elde edilmiş veya izinsiz yüklenmiş verilerden doğan sorumluluk işletmeye aittir.',
          'Sağlık bilgisi (ör. alerji) gibi özel nitelikli verileri ve işlem öncesi/sonrası fotoğrafları yalnızca hizmet için gerekli olduğunda ve müşterinin açık rızasını alarak kaydedersiniz.',
          "Kampanya/tanıtım mesajlarını yalnızca açık izin vermiş müşterilere gönderebilirsiniz. 6563 sayılı Kanun gereği İleti Yönetim Sistemi'ne (İYS) kayıt ve izinlerin İYS'ye işlenmesi işletmenin sorumluluğundadır. Her kampanya mesajında ret (abonelikten çıkma) imkânı sunulur.",
          "WhatsApp ile mesajlaşma Meta'nın WhatsApp Business kurallarına tabidir.",
          'Muhasebe ve vergi kayıtlarınızın yasal saklama sürelerine uymak sizin sorumluluğunuzdadır; uygulama resmi muhasebe kaydı yerine geçmez.',
        ],
      },
      {
        heading: 'Kişisel verilerin işlenmesi (veri işleme şartları)',
        paragraphs: [
          `İşletmenin müşterilerine ait veriler bakımından işletme veri sorumlusu, ${L.companyName} ise işletme adına ve işletmenin talimatıyla hareket eden veri işleyendir. Bu koşulları kabul ederek işletme, aşağıdaki şartlarla verilerin işlenmesine talimat vermiş olur:`,
        ],
        items: [
          `${L.brand}, müşteri verilerini yalnızca hizmeti sunmak için işler; satmaz, reklam amacıyla kullanmaz ve başka işletmelerle paylaşmaz.`,
          `İşletme, ${L.brand}'in Gizlilik Politikası'nda listelenen altyapı sağlayıcılarını (alt veri işleyenler) kullanmasına izin verir. Bu listeye yeni bir sağlayıcı eklendiğinde Gizlilik Politikası güncellenir ve önemli değişiklikler uygulama içinde duyurulur.`,
          'Verilerin güvenliği için makul teknik ve idari tedbirler alınır: şifreli bağlantı, işletmeler arası veritabanı yalıtımı, yetkiye göre erişim, düzenli güvenlik testleri.',
          `Bir veri ihlali fark edildiğinde ${L.brand} etkilenen işletmeyi gecikmeksizin bilgilendirir ve işletmenin Kurul'a bildirim yükümlülüğünü yerine getirmesine yardımcı olur.`,
          'İşletme, müşterilerinden gelen KVKK başvurularını yanıtlamak için uygulamadaki silme/anonimleştirme ve veri indirme araçlarını kullanabilir; gerektiğinde destek verilir.',
          'Hesap silindiğinde işletmenin tüm verileri kalıcı olarak silinir.',
        ],
      },
      {
        heading: 'Yasaklanan kullanımlar',
        items: [
          'Hukuka aykırı, yanıltıcı veya izinsiz ticari ileti göndermek.',
          'Başka işletmelerin verilerine erişmeye çalışmak, sistemin güvenliğini test etmek veya aşırı yük oluşturmak.',
          'Hizmeti tersine mühendislik, otomatik veri çekme veya yeniden satış amacıyla kullanmak.',
        ],
      },
      {
        heading: 'Yapay zekâ çıktıları',
        paragraphs: [
          'Yapay zekâ önerileri (asistan yanıtları, kampanya metinleri, analizler) hatalı veya eksik olabilir. Gönderilen mesajlardan ve verilen işletme kararlarından işletme sorumludur. Kötüye kullanımı ve maliyetleri sınırlamak için yapay zekâ ve toplu mesaj özelliklerinde günlük kullanım sınırları uygulanır.',
        ],
      },
      {
        heading: 'Ücretlendirme',
        paragraphs: [
          'Ücretli planların kapsamı ve fiyatı ayrıca bildirilir. WhatsApp mesaj ücretleri gibi üçüncü taraf ücretleri ilgili sağlayıcının tarifesine tabidir.',
        ],
      },
      {
        heading: 'Hizmetin sürekliliği ve sorumluluk',
        paragraphs: [
          'Hizmeti kesintisiz ve hatasız sunmak için makul özeni gösteririz; ancak bakım, üçüncü taraf sağlayıcı arızaları veya mücbir sebeplerden doğan kesintilerden ve dolaylı zararlardan, kanunun izin verdiği ölçüde sorumlu değiliz.',
        ],
      },
      {
        heading: 'Fesih ve hesap silme',
        paragraphs: [
          'Hesabınızı istediğiniz zaman Ayarlar → Hesabımı sil adımıyla kapatabilirsiniz. İşletmenin tek yöneticisi hesabını sildiğinde işletme ve tüm verileri kalıcı olarak silinir. Bu koşulların ağır ihlalinde hesabı askıya alma veya kapatma hakkımız saklıdır.',
        ],
      },
      {
        heading: 'Uygulanacak hukuk',
        paragraphs: [
          'Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda tüketici işlemleri için kanunen yetkili tüketici hakem heyetleri ve tüketici mahkemeleri, diğer hâllerde İstanbul (Merkez) mahkemeleri ve icra daireleri yetkilidir.',
          contactLine,
        ],
      },
    ],
  },
]

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug)
}
