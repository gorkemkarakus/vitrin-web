import { runSql } from './supabase-sql.ts'

// Yalnizca TEST ortami: silme talebi formunun IP basina saatlik siniri
// (5/saat) ard arda calistirmalarda dolmasin diye o kova sifirlanir.
// Diger hiz sinirlari ve kotalar dokunulmadan kalir.
export default function globalSetup() {
  runSql("delete from public.rate_limit_hits where bucket = 'account-deletion-request';", 'Hiz siniri sifirlama')
}
