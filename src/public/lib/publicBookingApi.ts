import { supabase } from '../../lib/supabase'

export interface PublicService {
  id: string
  name: string
  price: number | null
  duration_minutes: number
  description: string | null
}

export interface PublicEmployee {
  id: string
  full_name: string
  specialty: string | null
}

export interface BookingInfoResponse {
  business: { name: string }
  services: PublicService[]
  employees?: PublicEmployee[]
  date?: string
  slots?: string[]
  outside_hours?: { starts_at: string | null; ends_at: string | null } | null
  error?: string
}

export interface BookResponse {
  status?: 'booked' | 'conflict'
  appointment?: { id: string; scheduled_at: string; service_name: string }
  error?: string
}

export async function fetchBookingInfo(slug: string, serviceId?: string, employeeId?: string, date?: string) {
  const { data, error } = await supabase.functions.invoke<BookingInfoResponse>('public-booking-info', {
    body: { slug, service_id: serviceId, employee_id: employeeId, date },
  })
  if (error) throw error
  return data!
}

export async function submitBooking(params: {
  slug: string
  service_id: string
  employee_id?: string
  scheduled_at: string
  customer_name: string
  customer_phone: string
  turnstile_token: string
}) {
  const { data, error } = await supabase.functions.invoke<BookResponse>('public-book-appointment', {
    body: params,
  })
  if (error) throw error
  return data!
}
