import { supabase } from './supabase'
import { bookingUrl } from './bookingUrl'

// Ilk kurulum: yeni bir salonun uygulamayi kullanmaya baslamasi icin
// gereken adimlar. Durum her seferinde veritabanindan okunur (hizmet var mi,
// saatler girildi mi...); yalnizca "atla / gizle / link paylasildi" gibi
// kullanici tercihleri cihazda tutulur.

export type SetupStepId = 'hizmet' | 'saatler' | 'ekip' | 'randevu' | 'link'

export interface SetupStep {
  id: SetupStepId
  title: string
  desc: string
  cta: string
  to: string | null
  optional: boolean
  done: boolean
  skipped: boolean
}

export interface SetupStatus {
  steps: SetupStep[]
  doneCount: number
  total: number
  complete: boolean
  // Hic hizmet ve randevu yok: salon yeni acilmis.
  fresh: boolean
  link: string | null
}

const key = (businessId: string, name: string) => `adapptiv.kurulum.${name}.${businessId}`

function readSet(k: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(k) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeSet(k: string, s: Set<string>) {
  try {
    localStorage.setItem(k, JSON.stringify([...s]))
  } catch {
    /* depolama kapali olabilir */
  }
}

export function setupFlag(businessId: string, name: 'gizli' | 'goruldu'): boolean {
  try {
    return localStorage.getItem(key(businessId, name)) === '1'
  } catch {
    return false
  }
}

export function setSetupFlag(businessId: string, name: 'gizli' | 'goruldu', on = true) {
  try {
    if (on) localStorage.setItem(key(businessId, name), '1')
    else localStorage.removeItem(key(businessId, name))
  } catch {
    /* depolama kapali olabilir */
  }
}

export function markSetupStep(businessId: string, list: 'atlandi' | 'yapildi', id: SetupStepId, on = true) {
  const k = key(businessId, list)
  const s = readSet(k)
  if (on) s.add(id)
  else s.delete(id)
  writeSet(k, s)
}

// canAddStaff: paket calisan eklemeyi kapsamiyorsa (Ucretsiz) "Ekibini ekle" adimi gosterilmez.
export async function loadSetupStatus(
  businessId: string,
  profileId: string,
  { canAddStaff = true }: { canAddStaff?: boolean } = {},
): Promise<SetupStatus> {
  const head = { count: 'exact' as const, head: true }
  const [svc, sched, team, appt, biz] = await Promise.all([
    supabase.from('services').select('id', head),
    supabase.from('employee_schedules').select('id', head).eq('profile_id', profileId),
    supabase.from('profiles').select('id', head),
    supabase.from('appointments').select('id', head),
    supabase.from('businesses').select('slug').eq('id', businessId).maybeSingle(),
  ])
  const skipped = readSet(key(businessId, 'atlandi'))
  const manual = readSet(key(businessId, 'yapildi'))
  const link = bookingUrl(biz.data?.slug)

  const allSteps: SetupStep[] = [
    {
      id: 'hizmet',
      title: 'Hizmetlerini ekle',
      desc: 'Saç kesimi, manikür… süresi ve fiyatıyla. Randevu ve kasa bunlarla çalışır.',
      cta: 'Hizmet ekle',
      to: '/hizmetler?yeni=1',
      optional: false,
      done: (svc.count ?? 0) > 0,
      skipped: false,
    },
    {
      id: 'saatler',
      title: 'Çalışma saatlerini gir',
      desc: 'Hangi gün kaçta açıksın? Online randevu ve takvim boş saatleri buna göre gösterir.',
      cta: 'Saatleri ayarla',
      to: `/ekip/${profileId}/saatler`,
      optional: false,
      done: (sched.count ?? 0) > 0,
      skipped: false,
    },
    {
      id: 'ekip',
      title: 'Ekibini ekle',
      desc: 'Çalışanlarına hesap aç, kimin neyi göreceğini seç. Tek başına çalışıyorsan atla.',
      cta: 'Çalışan ekle',
      to: '/ekip/yeni',
      optional: true,
      done: (team.count ?? 0) > 1,
      skipped: skipped.has('ekip'),
    },
    {
      id: 'randevu',
      title: 'İlk randevunu oluştur',
      desc: 'Müşteriyi yazman yeterli; kayıtlı değilse randevu sırasında eklenir.',
      cta: 'Randevu ekle',
      to: '/randevular?yeni=1',
      optional: false,
      done: (appt.count ?? 0) > 0,
      skipped: false,
    },
  ]
  const steps = canAddStaff ? allSteps : allSteps.filter((s) => s.id !== 'ekip')
  if (link) {
    steps.push({
      id: 'link',
      title: 'Online randevu linkini paylaş',
      desc: 'Instagram profiline veya WhatsApp durumuna koy; müşteriler boş saatten kendileri randevu alsın.',
      cta: 'Linki paylaş',
      to: null,
      optional: true,
      done: manual.has('link'),
      skipped: skipped.has('link'),
    })
  }

  const doneCount = steps.filter((s) => s.done || s.skipped).length
  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
    fresh: (svc.count ?? 0) === 0 && (appt.count ?? 0) === 0,
    link,
  }
}
