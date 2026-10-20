// Yeni salon icin hazir hizmet listesi: bos "Hizmetler" ekraninda tek tek
// yazmak yerine isaretleyip eklenir. Fiyat bilerek yok — salona gore cok
// degisir; kullanici ekleme sirasinda kendi fiyatini yazar.

export interface ServiceTemplate {
  name: string
  duration: number
}

export interface ServiceTemplateGroup {
  title: string
  items: ServiceTemplate[]
}

export const SERVICE_TEMPLATE_GROUPS: ServiceTemplateGroup[] = [
  {
    title: 'Saç',
    items: [
      { name: 'Saç kesimi', duration: 45 },
      { name: 'Fön', duration: 30 },
      { name: 'Boya', duration: 120 },
      { name: 'Dip boya', duration: 90 },
      { name: 'Röfle / balyaj', duration: 180 },
      { name: 'Keratin bakımı', duration: 120 },
      { name: 'Topuz', duration: 60 },
    ],
  },
  {
    title: 'Tırnak',
    items: [
      { name: 'Manikür', duration: 45 },
      { name: 'Pedikür', duration: 60 },
      { name: 'Kalıcı oje', duration: 60 },
      { name: 'Protez tırnak', duration: 90 },
    ],
  },
  {
    title: 'Cilt ve güzellik',
    items: [
      { name: 'Cilt bakımı', duration: 60 },
      { name: 'Kaş alımı', duration: 20 },
      { name: 'Kirpik lifting', duration: 60 },
      { name: 'Ağda', duration: 30 },
      { name: 'Lazer epilasyon', duration: 45 },
      { name: 'Makyaj', duration: 60 },
    ],
  },
  {
    title: 'Erkek',
    items: [
      { name: 'Erkek saç kesimi', duration: 30 },
      { name: 'Sakal tıraşı', duration: 20 },
    ],
  },
]

// Ayni adli hizmet zaten varsa listede "ekli" gorunur (buyuk/kucuk harf ve
// bosluk farki onemsiz).
export function serviceNameKey(name: string) {
  return name.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ')
}
