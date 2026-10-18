// Otomasyon sablonlari (bkz. migration 20261018000007_automations.sql):
// her sabah 06:00 calisir, kosula uyan musteri icin gorev acar; ayni musteri
// ve ayni neden icin bir kez.

export type AutomationKind = 'kayip_musteri' | 'dogum_gunu' | 'gelmedi' | 'paket_bitiyor' | 'yeni_musteri_takip'

export interface AutomationTemplate {
  kind: AutomationKind
  title: string
  description: string
  example: string
  param?: { key: 'days'; label: string; default: number; min: number; max: number; suffix: string }
}

export const AUTOMATIONS: AutomationTemplate[] = [
  {
    kind: 'kayip_musteri',
    title: 'Kaybolan müşteriyi ara',
    description: 'Belirlediğin süredir gelmeyen ve ileri tarihli randevusu olmayan müşteri için arama görevi açar.',
    example: 'Ara: Ayşe Demir (63 gündür gelmiyor)',
    param: { key: 'days', label: 'Gelmediği süre', default: 60, min: 14, max: 365, suffix: 'gün' },
  },
  {
    kind: 'dogum_gunu',
    title: 'Doğum günü hatırlatması',
    description: 'Doğum gününden önce görev açar: tebrik mesajı ya da doğum günü indirimi için.',
    example: 'Doğum günü: Ayşe Demir (24.10)',
    param: { key: 'days', label: 'Kaç gün önce', default: 3, min: 0, max: 30, suffix: 'gün önce' },
  },
  {
    kind: 'gelmedi',
    title: 'Gelmeyeni ara',
    description: 'Randevusuna gelmeyen müşteri için, yeni randevu vermek üzere arama görevi açar.',
    example: 'Gelmedi: Seda Korkmaz — arayıp yeni randevu ver',
  },
  {
    kind: 'paket_bitiyor',
    title: 'Paket bitiyor',
    description: 'Pakette son seans kaldığında yenileme teklifi için görev açar.',
    example: 'Paket bitiyor: Selin Yıldız — Cilt bakımı için yenileme teklif et',
  },
  {
    kind: 'yeni_musteri_takip',
    title: 'Yeni müşteri takibi',
    description: 'İlk ziyaretten sonra memnun kalıp kalmadığını sormak için görev açar.',
    example: 'Yeni müşteri takibi: Can Avcı — memnun kaldı mı?',
    param: { key: 'days', label: 'İlk ziyaretten sonra', default: 7, min: 1, max: 60, suffix: 'gün' },
  },
]

export interface AutomationRule {
  id: string
  kind: AutomationKind
  enabled: boolean
  params: { days?: number }
  assignee_id: string | null
  last_run_at: string | null
}
