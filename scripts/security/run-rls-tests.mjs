// RLS izolasyon testini bagli Supabase projesinde calistirir (islem geri alinir).
// Gereken: supabase CLI girisi ve `supabase link`. Kullanim: npm run test:rls
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sql = path.join(root, 'supabase/tests/rls_isolation.sql')
const out = execFileSync('npx', ['--no-install', 'supabase', 'db', 'query', '--linked', '-f', sql], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
})
const rows = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).rows ?? []
const failed = rows.filter((r) => !r.gecti)
console.log(`${rows.length} kontrol, ${rows.length - failed.length} gecti, ${failed.length} basarisiz`)
for (const r of failed) console.log(`BASARISIZ  ${r.test}  (${r.ayrinti})`)
if (rows.length === 0) {
  console.error('Sonuc donmedi; test hesaplari ya da baglanti eksik olabilir.')
  process.exit(1)
}
process.exit(failed.length ? 1 : 0)
