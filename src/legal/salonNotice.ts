import { PROCESSORS, type LegalSection } from './documents.ts'
import { LEGAL_INFO as L } from './legalInfo.ts'

// Salonun KENDI musterilerine yonelik aydinlatma metni (salon = veri sorumlusu,
// Adapptiv = veri isleyen). Herkese acik /aydinlatma/<slug> sayfasi ve Ayarlar
// onizlemesi bu tek sablondan uretilir. TASLAKTIR — hukukcu gozden gecirmeli.

export interface SalonNoticeInput {
  businessName: string
  legalName: string | null
  address: string | null
  contactEmail: string | null
  contactPhone: string | null
  hasBot: boolean
}

export function salonNoticeComplete(
  n: Pick<SalonNoticeInput, 'legalName' | 'address' | 'contactEmail' | 'contactPhone'>,
) {
  return !!(n.legalName?.trim() && n.address?.trim() && (n.contactEmail?.trim() || n.contactPhone?.trim()))
}

function contactOf(n: SalonNoticeInput): string {
  return [n.contactEmail && `e-posta: ${n.contactEmail}`, n.contactPhone && `telefon: ${n.contactPhone}`]
    .filter(Boolean)
    .join(', ')
}

export function salonNoticeSections(n: SalonNoticeInput): LegalSection[] {
  const who = n.legalName?.trim() || n.businessName
  const contact = contactOf(n)
  return [
    {
      heading: '1. Veri sorumlusu',
      paragraphs: [
        `Kişisel verileriniz, veri sorumlusu sıfatıyla ${who}${n.address ? ` (${n.address})` : ''} tarafından 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında işlenir.${contact ? ` İletişim: ${contact}.` : ''}`,
      ],
    },
    {
      heading: '2. Hangi verilerinizi işliyoruz?',
      items: [
        'Kimlik ve iletişim: ad soyad, telefon, e-posta (verirseniz).',
        'Randevu ve hizmet: randevu tarihleri, aldığınız hizmetler, paketler, randevuya gelme durumu.',
        'Ödeme: ödeme tutarları ve yöntemleri, borç/alacak bilgisi.',
        'Hizmete ilişkin notlar: tercihleriniz ve hizmetin doğru verilmesi için gereken bilgiler (ör. doğum günü, saç rengi formülü).',
        ...(n.hasBot ? ['WhatsApp yazışmaları: randevu asistanıyla yaptığınız yazışmalar.'] : []),
        'Görüşleriniz: memnuniyet anketine verdiğiniz puan ve yorum, sadakat kartı kullanımlarınız.',
        'Pazarlama izni: kampanya mesajı almak isteyip istemediğiniz ve bu tercihin tarihi.',
      ],
      after: [
        'Alerji gibi sağlık bilgileri ile işlem öncesi/sonrası fotoğraflar yalnızca hizmetin güvenli ve doğru verilmesi için gerekli olduğunda ve açık rızanız alınarak kaydedilir.',
      ],
    },
    {
      heading: '3. Neden işliyoruz?',
      items: [
        'Randevunuzu oluşturmak, hatırlatmak, değiştirmek veya iptal etmek.',
        'Hizmeti size uygun şekilde sunmak ve önceki işlemlerinizi takip etmek.',
        'Ödeme, borç ve paket kayıtlarını tutmak; yasal muhasebe yükümlülüklerini yerine getirmek.',
        'Hizmetimizden memnuniyetinizi ölçmek ve sadakat programını yürütmek.',
        'İzin verdiyseniz size kampanya ve tanıtım mesajı göndermek.',
      ],
    },
    {
      heading: '4. Hukuki sebepler',
      items: [
        'Sizinle kurulan hizmet ilişkisinin kurulması ve ifası (KVKK md. 5/2-c): randevu, hizmet ve ödeme kayıtları, randevu hatırlatmaları.',
        'Hukuki yükümlülüklerimiz (md. 5/2-ç): muhasebe ve vergi kayıtları.',
        'Meşru menfaatimiz (md. 5/2-f): hizmet kalitesinin ölçülmesi, sadakat programı, kötüye kullanımın önlenmesi.',
        'Açık rızanız (md. 5/1 ve md. 6): kampanya mesajları (6563 sayılı Kanun ve İYS kuralları da uygulanır), sağlık bilgileri ve fotoğraflar.',
      ],
    },
    {
      heading: '5. Kimlere aktarıyoruz?',
      paragraphs: [
        `Randevu ve müşteri kayıtlarımızı ${L.brand} yazılımıyla tutuyoruz. ${L.brand} verilerinizi yalnızca bizim adımıza ve talimatımızla işleyen "veri işleyen"dir; verilerinizi satmaz, reklam amacıyla kullanmaz. ${L.brand} hizmeti sunabilmek için aşağıdaki altyapı sağlayıcılarını kullanır:`,
      ],
      items: PROCESSORS.map((p) => `${p.name} — ${p.purpose} (${p.location})`),
      after: [
        "Bu sağlayıcıların bir kısmı yurt dışındadır; verileriniz Avrupa Birliği ve ABD'deki sunucularda işlenebilir. Sağlayıcılara yalnızca ilgili işlem için gereken veri gönderilir; sağlık bilgileri ve hizmet notlarınız yapay zekâ sağlayıcısına gönderilmez.",
        'Verileriniz ayrıca kanunen yetkili kamu kurum ve kuruluşlarına, talep hâlinde ve yalnızca gerektiği ölçüde aktarılabilir.',
      ],
    },
    {
      heading: '6. Verileriniz nasıl toplanıyor?',
      paragraphs: [
        `Verileriniz salonumuzda yüz yüze veya telefonla, online randevu sayfamız${n.hasBot ? ', WhatsApp randevu asistanımız' : ''} ve memnuniyet anketi aracılığıyla elektronik ortamda toplanır.`,
      ],
    },
    {
      heading: '7. Ne kadar süre saklıyoruz?',
      paragraphs: [
        `Verilerinizi hizmet ilişkimiz devam ettiği sürece ve yasal saklama süreleri boyunca saklarız.${n.hasBot ? ' WhatsApp asistanı yazışmaları 180 gün sonra kendiliğinden silinir.' : ''} Silinmesini istediğinizde, yasal saklama yükümlülüğü olmayan verileriniz silinir veya anonim hâle getirilir.`,
      ],
    },
    {
      heading: '8. Haklarınız',
      paragraphs: [
        "KVKK'nın 11. maddesi uyarınca; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı kişileri bilme, eksik veya yanlışsa düzeltilmesini, silinmesini veya yok edilmesini isteme, otomatik analiz sonucu aleyhinize bir sonuca itiraz etme ve zarara uğradıysanız giderilmesini talep etme haklarına sahipsiniz.",
        `Başvurularınızı ${contact ? `${contact} üzerinden` : 'salonumuza'} iletebilirsiniz${L.webBaseUrl.startsWith('[') ? '' : `; ayrıca ${L.webBaseUrl}${L.deletionPath} adresinden de talep oluşturabilirsiniz`}. Başvurunuz en geç 30 gün içinde ücretsiz yanıtlanır.`,
      ],
    },
  ]
}
