// Magaza derlemesinden ONCE: npm run check:release
// Kodla dogrulanabilen yayin kosullarini kontrol eder; eksik varsa listeleyip
// 1 ile cikar. (Konsol/hesap islemleri RELEASE_CHECKLIST.md'de.)
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => readFileSync(path.join(root, p), 'utf8')
const problems = []
const warnings = []

// 1) Surum tek kaynak: package.json = Android versionName = iOS MARKETING_VERSION
const version = JSON.parse(read('package.json')).version
const gradle = read('android/app/build.gradle')
const androidName = gradle.match(/def appVersionName = "([^"]+)"/)?.[1]
const androidCode = gradle.match(/def appVersionCode = (\d+)/)?.[1]
const iosVersions = [...read('ios/App/App.xcodeproj/project.pbxproj').matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(
  (m) => m[1],
)
if (androidName !== version)
  problems.push(`Android versionName (${androidName}) package.json (${version}) ile ayni degil`)
if (iosVersions.some((v) => v !== version))
  problems.push(`iOS MARKETING_VERSION (${iosVersions.join(', ')}) ${version} degil`)
if (!read('CHANGELOG.md').includes(`## [${version}]`)) problems.push(`CHANGELOG.md'de ${version} bolumu yok`)
console.log(`Surum ${version} (Android versionCode ${androidCode})`)

// 2) Yasal metinlerde yer tutucu kalmamali
const legal = read('src/legal/legalInfo.ts')
const placeholders = [...legal.matchAll(/'(\[[^\]]+\])'/g)].map((m) => m[1])
if (placeholders.length) problems.push(`src/legal/legalInfo.ts yer tutucular: ${placeholders.join(', ')}`)

// 3) Ortam: uretim Supabase adresi var, gizli anahtar istemciye girmemis
const envFile = existsSync(path.join(root, '.env.production')) ? '.env.production' : '.env'
const env = Object.fromEntries(
  read(envFile)
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
if (!env.VITE_SUPABASE_URL?.startsWith('https://')) problems.push(`${envFile}: VITE_SUPABASE_URL yok`)
const anon = env.VITE_SUPABASE_ANON_KEY ?? ''
try {
  const payload = JSON.parse(Buffer.from(anon.split('.')[1] ?? '', 'base64url').toString())
  if (payload.role !== 'anon')
    problems.push(`${envFile}: VITE_SUPABASE_ANON_KEY rolu "${payload.role}" — yalnizca anon anahtar istemciye girer!`)
} catch {
  if (!anon.startsWith('sb_publishable_')) problems.push(`${envFile}: VITE_SUPABASE_ANON_KEY okunamadi`)
}
for (const k of Object.keys(env))
  if (/SERVICE|SECRET|PRIVATE/.test(k)) problems.push(`${envFile}: istemciye gizli anahtar girmis olabilir: ${k}`)
if (env.VITE_PUSH_ENABLED !== '1') warnings.push('VITE_PUSH_ENABLED=1 degil: telefon bildirimleri kapali derlenecek')
if (envFile === '.env')
  warnings.push('.env.production yok: gelistirme .env dosyasiyla derleniyor (ayri test projesi kararina bakin)')

// 4) Android imzalama ve Firebase
if (!existsSync(path.join(root, 'android/keystore.properties')) && !process.env.ADAPPTIV_KEYSTORE_FILE)
  problems.push('android/keystore.properties yok: release AAB imzasiz olur (RELEASE_CHECKLIST.md > Android imzalama)')
if (!existsSync(path.join(root, 'android/app/google-services.json')))
  problems.push('android/app/google-services.json yok')
if (!/minifyEnabled true/.test(gradle)) problems.push('Android release minifyEnabled kapali')

// 5) iOS
if (!existsSync(path.join(root, 'ios/App/App/PrivacyInfo.xcprivacy')))
  problems.push('ios/App/App/PrivacyInfo.xcprivacy yok')
if (!existsSync(path.join(root, 'ios/App/App/GoogleService-Info.plist')))
  warnings.push('iOS GoogleService-Info.plist yok: iOS bildirimleri calismaz (VITE_PUSH_IOS_ENABLED kapali kalmali)')

for (const w of warnings) console.log(`UYARI  ${w}`)
for (const p of problems) console.log(`EKSIK  ${p}`)
if (problems.length) {
  console.log(`\n${problems.length} eksik — magaza derlemesi oncesi tamamlayin.`)
  process.exit(1)
}
console.log('\nYayin kontrolleri tamam.')
