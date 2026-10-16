// Calisan yetkileri — veritabanindaki has_perm()/my_permissions() ile ayni
// anahtarlar (bkz. 20261015000001_employee_permissions.sql). Yonetici her
// zaman hepsine sahip; calisan icin yonetici tek tek acar/kapatir.
export type PermKey =
  | 'randevu_tumu_gor'
  | 'randevu_tumu_duzenle'
  | 'odeme_al'
  | 'kasa'
  | 'raporlar'
  | 'ekip_yonet'
  | 'hizmet_yonet'
  | 'mesajlar'
  | 'kendi_kazanc'

export interface PermInfo {
  key: PermKey
  title: string
  sub: string
  group: 'Randevular' | 'Para' | 'Yönetim' | 'Mesajlar'
}

export const PERMISSIONS: PermInfo[] = [
  {
    key: 'randevu_tumu_gor',
    group: 'Randevular',
    title: 'Herkesin randevularını görsün',
    sub: 'Kapalıysa sadece kendi randevularını görür ve sadece kendine randevu açar',
  },
  {
    key: 'randevu_tumu_duzenle',
    group: 'Randevular',
    title: 'Başkalarının randevularını düzenlesin',
    sub: 'Saat değiştirme, iptal, başka çalışana verme',
  },
  {
    key: 'odeme_al',
    group: 'Para',
    title: 'Ödeme alsın',
    sub: 'Randevu kapatırken ve müşteri sayfasında tahsilat girer',
  },
  {
    key: 'kendi_kazanc',
    group: 'Para',
    title: 'Kendi kazancını görsün',
    sub: 'Bu ayki cirosu ve hak ettiği prim (başkalarınınkini göremez)',
  },
  { key: 'kasa', group: 'Para', title: 'Kasa ve giderleri görsün', sub: 'Gelir, gider, alacaklar; gider ekleyebilir' },
  {
    key: 'raporlar',
    group: 'Yönetim',
    title: 'Performans raporunu görsün',
    sub: 'Çalışanların randevu, kazanç ve doluluk karnesi',
  },
  {
    key: 'ekip_yonet',
    group: 'Yönetim',
    title: 'Ekibin saatlerini ve izinlerini yönetsin',
    sub: 'Çalışma saatleri, izinler, tatiller, kim hangi hizmeti yapar',
  },
  {
    key: 'hizmet_yonet',
    group: 'Yönetim',
    title: 'Hizmetleri ve fiyatları yönetsin',
    sub: 'Hizmet ekler, fiyat ve süre değiştirir',
  },
  { key: 'mesajlar', group: 'Mesajlar', title: 'WhatsApp konuşmalarını görsün', sub: 'Botun müşterilerle yazışmaları' },
]

export const ALL_PERMISSIONS: PermKey[] = PERMISSIONS.map((p) => p.key)

// Veritabanindaki default_employee_permissions() ile ayni olmali.
export const DEFAULT_PERMISSIONS: PermKey[] = ['randevu_tumu_gor', 'odeme_al', 'mesajlar']

// Yeni calisan / erisim ekranindaki hazir roller. 'yonetici' gercek admin
// rolu (her sey); digerleri 'user' + yetki listesi — sonra ince ayarla
// tek tek degistirilebilir.
export type RolePreset = 'calisan' | 'resepsiyon' | 'yonetici'

export const ROLE_PRESETS: { key: RolePreset; title: string; sub: string; perms: PermKey[] }[] = [
  { key: 'calisan', title: 'Çalışan', sub: 'Sadece kendi takvimi ve müşterileri', perms: ['odeme_al', 'kendi_kazanc'] },
  {
    key: 'resepsiyon',
    title: 'Resepsiyon',
    sub: 'Herkesin takvimi, ödeme alma, mesajlar',
    perms: ['randevu_tumu_gor', 'randevu_tumu_duzenle', 'odeme_al', 'mesajlar'],
  },
  { key: 'yonetici', title: 'Yönetici', sub: 'Muhasebe ve ayarlar dahil her şey', perms: [] },
]

// Secili yetkiler bir hazir role birebir uyuyorsa onu dondurur (kart isaretli
// gorunsun), yoksa null (= ozel/ince ayarli).
export function presetFor(role: 'admin' | 'user', perms: Set<PermKey>): RolePreset | null {
  if (role === 'admin') return 'yonetici'
  const match = ROLE_PRESETS.find(
    (r) => r.key !== 'yonetici' && r.perms.length === perms.size && r.perms.every((p) => perms.has(p)),
  )
  return match?.key ?? null
}
