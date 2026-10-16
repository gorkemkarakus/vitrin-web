import { Capacitor } from '@capacitor/core'
import { createClient } from '@supabase/supabase-js'
import { secureSessionStorage } from './secureStorage'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, key, {
  auth: Capacitor.isNativePlatform() ? { storage: secureSessionStorage } : undefined,
})
