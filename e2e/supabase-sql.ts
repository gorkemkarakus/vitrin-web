import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Bagli (supabase link) projede SQL calistirir; CLI yoksa/baglanamazsa
// uyarir ve false doner (testler yine de calisir).
export function runSql(sql: string, label: string): boolean {
  const dir = mkdtempSync(path.join(tmpdir(), 'e2e-'))
  const file = path.join(dir, 'q.sql')
  writeFileSync(file, sql)
  try {
    execSync(`npx --no-install supabase db query --linked -f "${file}"`, { stdio: 'pipe' })
    return true
  } catch (e) {
    console.warn(`${label} yapilamadi (supabase link?):`, (e as Error).message.split('\n')[0])
    return false
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
