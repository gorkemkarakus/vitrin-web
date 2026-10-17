// Randevular sayfasi ve alt bilesenlerinin ortak tipleri.

export interface Customer {
  id: string
  full_name: string
  phone: string | null
  contact_phone: string | null
  notes?: string | null
}

export interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number | null
  // "Paket olarak satilabilir" sablonu (Hizmetler > hizmet ayarlari).
  package_sessions?: number | null
  package_price?: number | null
}

export interface Profile {
  id: string
  full_name: string | null
}

export interface EmployeeServiceRow {
  profile_id: string
  service_id: string
}

export interface Schedule {
  profile_id: string
  day_of_week: number
  starts_at: string
  ends_at: string
}

export interface TimeBlock {
  profile_id: string
  day_of_week: number | null
  block_date: string | null
  end_date: string | null
  starts_at: string
  ends_at: string
}

export interface Appointment {
  id: string
  customer_id: string | null
  service_id: string | null
  employee_id: string | null
  created_by_user_id: string | null
  scheduled_at: string
  duration_minutes: number | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
  source: string
  source_note: string | null
  notes: string | null
  package_id: string | null
  price_override: number | null
  created_at?: string
  reminder_sent_at?: string | null
}

export interface ServicePackage {
  id: string
  customer_id: string
  service_id: string | null
  total_sessions: number
  session_offset: number
  status: 'aktif' | 'tamamlandi'
}

export const SLOT_MINUTES = 30
