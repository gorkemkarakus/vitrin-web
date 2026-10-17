// src/legal/documents.ts icerigini bagimsiz HTML sayfalarina cevirir
// (legal/*.html). Uygulama ici sayfalarla ayni metin; alan adi hazir olunca
// herhangi bir statik barindirmaya konabilir. Magaza konsollarina girilecek
// adresler: /gizlilik.html, /kvkk.html, /kullanim-kosullari.html, /hesap-silme.html
// Calistirma: npm run legal:html  (Node 22.6+ --experimental-strip-types)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { LEGAL_DOCUMENTS } from '../src/legal/documents.ts'
import { LEGAL_INFO } from '../src/legal/legalInfo.ts'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.join(root, 'legal')
mkdirSync(outDir, { recursive: true })

// Ortam degiskenleri .env'den (yalnizca herkese acik VITE_ degerleri).
const env = Object.fromEntries(
  readFileSync(path.join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^VITE_[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const supabaseUrl = env.VITE_SUPABASE_URL
const turnstileSiteKey = env.VITE_TURNSTILE_SITE_KEY ?? ''

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const NAV = [
  ['gizlilik.html', 'Gizlilik Politikası'],
  ['kvkk.html', 'KVKK Aydınlatma Metni'],
  ['kullanim-kosullari.html', 'Kullanım Koşulları'],
  ['hesap-silme.html', 'Hesap ve veri silme'],
]

const CSS = `
:root { --bg:#f5f6f8; --panel:#fff; --text:#111827; --strong:#374151; --muted:#6b7280; --navy:#13284f; --tint:#e7ecf5; --line:#e2e5ea; --danger:#b42318; --ok:#0b7a4b; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font: 15px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px 16px 48px; }
main { max-width: 680px; margin: 0 auto; }
.brand { font-weight: 700; color: var(--navy); }
h1 { font-size: 28px; line-height: 1.15; margin-top: 16px; text-wrap: balance; }
.updated { color: var(--muted); font-size: 13px; margin-top: 6px; }
.summary { margin-top: 14px; color: var(--strong); }
section { background: var(--panel); border-radius: 20px; padding: 18px; margin-top: 12px; }
h2 { font-size: 17px; color: var(--navy); margin-bottom: 8px; }
section p, section li { font-size: 14px; color: var(--strong); }
section p + p, section p + ul, section ul + p, section p + ol, section ol + p { margin-top: 8px; }
ul, ol { padding-left: 20px; display: grid; gap: 6px; }
nav { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 8px; }
nav a { background: var(--panel); color: var(--navy); border-radius: 999px; padding: 8px 12px; font-size: 13px; font-weight: 600; text-decoration: none; }
label { display: block; font-size: 12px; font-weight: 700; color: var(--muted); margin: 14px 0 6px; }
input, textarea, select { width: 100%; font: inherit; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); background: #f1f2f5; }
button { margin-top: 16px; width: 100%; padding: 14px; border: 0; border-radius: 16px; background: var(--navy); color: #fff; font: 700 15px system-ui, sans-serif; cursor: pointer; }
button:disabled { opacity: .6; }
a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid #ff6a13; outline-offset: 2px; }
#msg { margin-top: 12px; font-size: 13px; font-weight: 600; }
#msg.err { color: var(--danger); } #msg.ok { color: var(--ok); }
`

function page(file, title, body, extraHead = '') {
  const nav = NAV.filter(([f]) => f !== file)
    .map(([f, label]) => `<a href="${f}">${esc(label)}</a>`)
    .join('\n      ')
  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} — ${esc(LEGAL_INFO.brand)}</title>
    <style>${CSS}</style>
    ${extraHead}
  </head>
  <body>
    <main>
      <div class="brand">${esc(LEGAL_INFO.brand)}</div>
      <h1>${esc(title)}</h1>
      <p class="updated">Son güncelleme: ${esc(LEGAL_INFO.lastUpdated)}</p>
      ${body}
      <nav aria-label="Diğer yasal metinler">
      ${nav}
      </nav>
    </main>
  </body>
</html>
`
}

for (const doc of LEGAL_DOCUMENTS) {
  const sections = doc.sections
    .map((s) => {
      const ps = (arr) => (arr ?? []).map((p) => `<p>${esc(p)}</p>`).join('')
      const list = s.items ? `<ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''
      return `<section><h2>${esc(s.heading)}</h2>${ps(s.paragraphs)}${list}${ps(s.after)}</section>`
    })
    .join('\n      ')
  const file = `${doc.slug}.html`
  writeFileSync(
    path.join(outDir, file),
    page(file, doc.title, `<p class="summary">${esc(doc.summary)}</p>\n      ${sections}`),
  )
}

// Silme talebi sayfasi: uygulama icindeki formla ayni uc noktaya gonderir.
const turnstileHead = turnstileSiteKey
  ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'
  : ''
const deletionBody = `
      <section>
        <h2>Uygulamadan hemen silin</h2>
        <ol>
          <li>Uygulamaya giriş yapın.</li>
          <li>Ayarlar → Hesabımı sil adımına gidin.</li>
          <li>Onaylayın. İşletmenin tek yöneticisiyseniz işletme adını yazmanız istenir.</li>
        </ol>
        <p>Çalışan hesabı silindiğinde yalnızca o kişinin giriş hesabı ve kişisel ayarları silinir. İşletmenin tek yöneticisi hesabını sildiğinde işletme ve tüm verisi (müşteriler, randevular, ödemeler, çalışan hesapları) kalıcı olarak silinir.</p>
      </section>
      <section>
        <h2>Uygulamaya giremiyorsanız talep oluşturun</h2>
        <p>Kimliğinizi doğruladıktan sonra hesabınızı veya verilerinizi sileriz. Talepler en geç 30 gün içinde sonuçlandırılır.</p>
        <form id="f" novalidate>
          <label for="kind">Talep türü</label>
          <select id="kind">
            <option value="account">Adapptiv hesabımı silin</option>
            <option value="customer">Bir salonun müşterisiyim, verilerimi silin</option>
          </select>
          <label for="contact">E-posta veya telefon</label>
          <input id="contact" maxlength="254" autocomplete="email" />
          <label for="name">Ad soyad (isteğe bağlı)</label>
          <input id="name" maxlength="120" autocomplete="name" />
          <label for="biz">İşletme adı (salon müşterisiyseniz zorunlu)</label>
          <input id="biz" maxlength="120" />
          <label for="note">Not (isteğe bağlı)</label>
          <textarea id="note" rows="3" maxlength="1000"></textarea>
          ${turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${esc(turnstileSiteKey)}" style="margin-top:14px"></div>` : ''}
          <button type="submit">Silme talebini gönder</button>
          <p id="msg" role="status"></p>
        </form>
      </section>
      <script>
        const f = document.getElementById('f'), msg = document.getElementById('msg')
        f.addEventListener('submit', async (e) => {
          e.preventDefault()
          const v = (id) => document.getElementById(id).value.trim()
          const btn = f.querySelector('button'); btn.disabled = true; msg.className = ''; msg.textContent = 'Gönderiliyor…'
          try {
            const tokenEl = f.querySelector('[name="cf-turnstile-response"]')
            const res = await fetch(${JSON.stringify(`${supabaseUrl}/functions/v1/account-deletion-request`)}, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: v('kind'), contact: v('contact'), full_name: v('name') || undefined, business_name: v('biz') || undefined, note: v('note') || undefined, turnstile_token: tokenEl ? tokenEl.value : '' }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body.error || 'Talep gönderilemedi.')
            f.querySelectorAll('input, textarea, select').forEach((el) => (el.disabled = true))
            msg.className = 'ok'; msg.textContent = 'Talebiniz alındı. Kimliğinizi doğrulamak için size ulaşacağız.'
          } catch (err) {
            msg.className = 'err'; msg.textContent = err.message || 'Sunucuya ulaşılamadı, tekrar deneyin.'; btn.disabled = false
          }
        })
      </script>`
writeFileSync(
  path.join(outDir, 'hesap-silme.html'),
  page('hesap-silme.html', 'Hesap ve veri silme', deletionBody, turnstileHead),
)

console.log(`legal/ altina ${LEGAL_DOCUMENTS.length + 1} sayfa yazildi.`)
