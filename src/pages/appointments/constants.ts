import type { StatusDropdownOption } from '../../components/StatusDropdown'
import type { Appointment } from './types'

// Randevu detayindaki "hikaye" icin kim olusturdu.
export const SOURCE_STORY: Record<string, string> = {
  chatbot: 'Chatbot',
  online_randevu: 'Online randevu sayfası',
  kullanici_uzerinden: 'Salon',
  dogrudan_musteri: 'Salon',
  reklam_instagram: 'Instagram reklamı',
  reklam_whatsapp: 'WhatsApp reklamı',
  diger: 'Salon',
}

export const STATUS_OPTIONS: { value: Appointment['status']; label: string }[] = [
  { value: 'bekliyor', label: 'Bekliyor' },
  { value: 'onaylandi', label: 'Onaylandı' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
  { value: 'iptal', label: 'İptal' },
  { value: 'gelmedi', label: 'Gelmedi' },
]

export const STATUS_DROPDOWN_OPTIONS: StatusDropdownOption[] = [
  { value: 'bekliyor', label: 'Bekliyor', color: 'var(--warn-text)', bg: 'var(--warn-bg)' },
  { value: 'onaylandi', label: 'Onaylandı', color: 'var(--info-text)', bg: 'var(--info-bg)' },
  { value: 'tamamlandi', label: 'Tamamlandı', color: 'var(--ok-text)', bg: 'var(--ok-bg)' },
  { value: 'iptal', label: 'İptal', color: 'var(--danger-text)', bg: 'var(--danger-bg)' },
  { value: 'gelmedi', label: 'Gelmedi', color: 'var(--text-dim)', bg: 'var(--panel-2)' },
]
