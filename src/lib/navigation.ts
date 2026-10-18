import type { SVGProps } from 'react'
import {
  AccountingIcon,
  AppointmentsIcon,
  HomeIcon,
  MegaphoneIcon,
  MessagesIcon,
  SendIcon,
  ServicesIcon,
  SettingsIcon,
  SparkleIcon,
  TeamIcon,
  TrophyIcon,
  UsersIcon,
} from '../components/icons'
import type { PermKey } from './permissions'
import type { PlanFeature } from './plan'

// Uygulamanin ekran listesi — telefonda "Daha fazla" kutulari ve alt sekmeler,
// genis ekranda yan menu AYNI listeden uretilir (yetki ve paket kurallari
// tek yerde).
//
// access: 'admin' = sadece yonetici, PermKey = o yetkisi olan, yok = herkes.
// feature: paket kapsamiyorsa kalem kilitli gorunur (gizlenmez — ne
// kazanacagini gorsun); acilinca paket ekrani gelir.
// group: yan menudeki bolum. more: telefonda "Daha fazla" ekraninda kutu.
export interface NavItem {
  path: string
  label: string
  icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement
  access?: 'admin' | PermKey
  feature?: PlanFeature
  group: 'gunluk' | 'isletme' | 'buyume'
  more: boolean
  // AI ozelligi: mor zeminle ayirt edilir.
  tint?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Anasayfa', icon: HomeIcon, access: 'admin', group: 'gunluk', more: false },
  { path: '/randevular', label: 'Randevular', icon: AppointmentsIcon, group: 'gunluk', more: false },
  { path: '/musteriler', label: 'Müşteriler', icon: UsersIcon, group: 'gunluk', more: false },
  {
    path: '/mesajlar',
    label: 'Mesajlar',
    icon: MessagesIcon,
    access: 'mesajlar',
    feature: 'messages',
    group: 'gunluk',
    more: true,
  },
  { path: '/muhasebe', label: 'Muhasebe', icon: AccountingIcon, access: 'kasa', group: 'isletme', more: true },
  { path: '/ekip', label: 'Ekip', icon: TeamIcon, access: 'ekip_yonet', group: 'isletme', more: true },
  { path: '/hizmetler', label: 'Hizmetler', icon: ServicesIcon, access: 'hizmet_yonet', group: 'isletme', more: true },
  {
    path: '/performans-raporu',
    label: 'Performans',
    icon: TrophyIcon,
    access: 'raporlar',
    group: 'isletme',
    more: true,
  },
  { path: '/kazancim', label: 'Kazancım', icon: AccountingIcon, access: 'kendi_kazanc', group: 'isletme', more: true },
  {
    path: '/toplu-mesaj',
    label: 'Toplu mesaj',
    icon: SendIcon,
    access: 'admin',
    feature: 'bulk_campaign',
    group: 'buyume',
    more: true,
  },
  {
    path: '/reklam',
    label: 'Reklam',
    icon: MegaphoneIcon,
    access: 'admin',
    feature: 'ads',
    group: 'buyume',
    more: true,
  },
  {
    path: '/ai-analiz',
    label: 'AI analiz',
    icon: SparkleIcon,
    access: 'admin',
    feature: 'ai_insights',
    group: 'buyume',
    more: true,
    tint: true,
  },
  { path: '/ayarlar', label: 'Ayarlar', icon: SettingsIcon, group: 'isletme', more: true },
]

export const NAV_GROUP_LABELS: Record<NavItem['group'], string> = {
  gunluk: 'Günlük',
  isletme: 'İşletme',
  buyume: 'Büyüme',
}

// Oturumdaki kullanicinin gorebilecegi kalemler.
export function visibleNavItems(isAdmin: boolean, can: (perm: PermKey) => boolean): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      // Kazancim calisan icindir; yonetici Ekip > calisan > Kazanc'tan bakar.
      (item.path !== '/kazancim' || !isAdmin) &&
      (!item.access || (item.access === 'admin' ? isAdmin : can(item.access))),
  )
}
