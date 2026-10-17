// Veritabani yedegi (sema + veri): npm run backup:db
// Gerekenler: Docker Desktop acik, Supabase CLI bu projeye bagli (supabase link).
// Cikti: backups/<tarih>/ (git'e girmez). Dosyalar kisisel veri icerir —
// sifreli bir diske/kasaya tasiyin, paylasmayin.
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const dir = path.join(root, 'backups', stamp)
mkdirSync(dir, { recursive: true })

const run = (args, file) => {
  console.log(`> supabase db dump ${args} -> ${path.relative(root, file)}`)
  execSync(`npx --no-install supabase db dump --linked ${args} -f "${file}"`, { cwd: root, stdio: 'inherit' })
}

run('--role-only', path.join(dir, 'roles.sql'))
run('', path.join(dir, 'schema.sql'))
run('--data-only --use-copy', path.join(dir, 'data.sql'))
console.log(`\nYedek hazir: ${path.relative(root, dir)}`)
