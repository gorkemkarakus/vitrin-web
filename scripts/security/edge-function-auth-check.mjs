// Her edge function'a kimliksiz ve yalnizca anon anahtarla istek atar; 2xx
// donen (izinli liste disinda) fonksiyon varsa 1 ile cikar.
// Kullanim: npm run test:edge-auth  (.env'deki VITE_SUPABASE_URL / ANON_KEY)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const base = `${env.VITE_SUPABASE_URL}/functions/v1/`
const anon = env.VITE_SUPABASE_ANON_KEY
// Veri dondurmeyen, bilincli olarak herkese acik sayfalar
const PUBLIC_OK = new Set(['meta-oauth-bridge'])

const dir = path.join(root, 'supabase/functions')
const names = fs.readdirSync(dir).filter((n) => n !== '_shared' && fs.existsSync(path.join(dir, n, 'index.ts')))

let bad = 0
for (const n of names) {
  const results = []
  for (const headers of [{}, { Authorization: `Bearer ${anon}`, apikey: anon }]) {
    const r = await fetch(base + n, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: '{}',
    })
    results.push(r.status)
  }
  const leak = results.some((s) => s >= 200 && s < 300) && !PUBLIC_OK.has(n)
  if (leak) bad++
  console.log(`${leak ? 'ACIK ' : 'tamam'}  ${n.padEnd(32)} ${results.join(' / ')}`)
}
console.log(`\n${names.length} fonksiyon, ${bad} kimliksiz 2xx`)
process.exit(bad ? 1 : 0)
