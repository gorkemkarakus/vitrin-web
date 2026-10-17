// Web'i derler, Capacitor'a senkronlar ve istenen Gradle gorevini calistirir.
// Kullanim: node scripts/android-build.mjs bundleRelease | assembleRelease | assembleDebug
// Release imzasi icin android/keystore.properties gerekir (bkz. RELEASE_CHECKLIST.md).
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const task = process.argv[2] ?? 'bundleRelease'
const root = path.resolve(import.meta.dirname, '..')
const androidDir = path.join(root, 'android')
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' })

if (
  task.includes('Release') &&
  !existsSync(path.join(androidDir, 'keystore.properties')) &&
  !process.env.ADAPPTIV_KEYSTORE_FILE
) {
  console.warn('UYARI: keystore.properties yok — release ciktisi IMZASIZ olacak (magazaya yuklenemez).')
}

run('npm run build')
run('npx cap sync android')
run(`${process.platform === 'win32' ? 'gradlew.bat' : './gradlew'} ${task}`, androidDir)

const out =
  task === 'bundleRelease'
    ? 'android/app/build/outputs/bundle/release/app-release.aab'
    : `android/app/build/outputs/apk/${task.includes('Release') ? 'release' : 'debug'}/`
console.log(`\nCikti: ${out}`)
