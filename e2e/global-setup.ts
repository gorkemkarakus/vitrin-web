import { runSql } from './supabase-sql.ts'

// Yalnizca TEST ortami: silme talebi ve kayit formlarinin IP basina saatlik
// sinirlari (5/saat) ard arda calistirmalarda dolmasin diye o kovalar sifirlanir.
// Diger hiz sinirlari ve kotalar dokunulmadan kalir.
export default function globalSetup() {
  runSql(
    "delete from public.rate_limit_hits where bucket in ('account-deletion-request', 'register-business');",
    'Hiz siniri sifirlama',
  )
}
