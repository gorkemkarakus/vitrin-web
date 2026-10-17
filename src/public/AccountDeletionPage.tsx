import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { FIELD_LIMITS } from '../lib/fieldLimits'
import { NETWORK_ERROR } from '../lib/messages'
import TurnstileWidget from './components/TurnstileWidget'
import LegalLayout from './LegalLayout'
import styles from './LegalPage.module.css'

type Kind = 'account' | 'customer'

// Uygulamaya girmeden hesap/veri silme talebi (Google Play "hesap silme
// URL'si"). Burada hicbir sey aninda silinmez; talep kaydedilir ve kimlik
// dogrulanarak islenir (account-deletion-request).
export default function AccountDeletionPage() {
  const [kind, setKind] = useState<Kind>('account')
  const [contact, setContact] = useState('')
  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [note, setNote] = useState('')
  const [token, setToken] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending) return
    setError(null)
    if (contact.trim().length < 3) return setError('E-posta adresinizi veya telefon numaranızı yazın.')
    if (kind === 'customer' && !businessName.trim()) return setError('Randevu aldığınız işletmenin adını yazın.')
    setSending(true)
    try {
      const { error: fnError } = await supabase.functions.invoke('account-deletion-request', {
        body: {
          kind,
          contact: contact.trim(),
          full_name: fullName.trim() || undefined,
          business_name: businessName.trim() || undefined,
          note: note.trim() || undefined,
          turnstile_token: token,
        },
      })
      if (fnError) {
        let message = NETWORK_ERROR
        try {
          const body = await (fnError as { context?: Response }).context?.json()
          if (body?.error) message = body.error
        } catch {
          // Govde okunamadiysa genel hata mesaji kalir.
        }
        setError(message)
        return
      }
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <LegalLayout title="Hesap ve veri silme" current="/hesap-silme">
      <article className={styles.article}>
        <section className={styles.section}>
          <h2>Uygulamadan hemen silin</h2>
          <p>Hesabınız varsa en hızlı yol uygulamanın kendisidir:</p>
          <ol className={styles.steps}>
            <li>Uygulamaya giriş yapın.</li>
            <li>Ayarlar → Hesabımı sil adımına gidin.</li>
            <li>Onaylayın. İşletmenin tek yöneticisiyseniz işletme adını yazmanız istenir.</li>
          </ol>
          <p>
            Çalışan hesabı silindiğinde yalnızca o kişinin giriş hesabı ve kişisel ayarları silinir; geçmiş randevular
            çalışan adı olmadan işletmede kalır. İşletmenin tek yöneticisi hesabını sildiğinde işletme ve tüm verisi
            (müşteriler, randevular, ödemeler, çalışan hesapları) kalıcı olarak silinir.
          </p>
        </section>

        {sent ? (
          <section className={`${styles.section} ${styles.done}`} role="status">
            <h2>Talebiniz alındı</h2>
            <p>
              Kimliğinizi doğrulamak için yazdığınız adresten size ulaşacağız. Talepler en geç 30 gün içinde
              sonuçlandırılır.
            </p>
          </section>
        ) : (
          <section className={styles.section}>
            <h2>Uygulamaya giremiyorsanız talep oluşturun</h2>
            <p>Kimliğinizi doğruladıktan sonra hesabınızı veya verilerinizi sileriz.</p>
            <form onSubmit={submit} style={{ marginTop: 14 }} noValidate>
              <div className={styles.kindRow} role="radiogroup" aria-label="Talep türü">
                <button
                  type="button"
                  role="radio"
                  aria-checked={kind === 'account'}
                  className={kind === 'account' ? `${styles.kind} ${styles.kindActive}` : styles.kind}
                  onClick={() => setKind('account')}
                >
                  Adapptiv hesabımı silin
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={kind === 'customer'}
                  className={kind === 'customer' ? `${styles.kind} ${styles.kindActive}` : styles.kind}
                  onClick={() => setKind('customer')}
                >
                  Bir salonun müşterisiyim, verilerimi silin
                </button>
              </div>

              <div className="field">
                <label htmlFor="delContact">
                  {kind === 'account' ? 'Hesabınızın e-posta adresi' : 'Salona verdiğiniz telefon numarası'}
                </label>
                <input
                  id="delContact"
                  value={contact}
                  maxLength={FIELD_LIMITS.email}
                  onChange={(e) => setContact(e.target.value)}
                  inputMode={kind === 'account' ? 'email' : 'tel'}
                  autoComplete={kind === 'account' ? 'email' : 'tel'}
                  placeholder={kind === 'account' ? 'ornek@eposta.com' : '0532 123 45 67'}
                />
              </div>
              <div className="field">
                <label htmlFor="delName">Ad soyad (isteğe bağlı)</label>
                <input
                  id="delName"
                  value={fullName}
                  maxLength={FIELD_LIMITS.profilesFullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="field">
                <label htmlFor="delBusiness">
                  {kind === 'account' ? 'İşletme adı (isteğe bağlı)' : 'Randevu aldığınız işletme'}
                </label>
                <input
                  id="delBusiness"
                  value={businessName}
                  maxLength={FIELD_LIMITS.businessesName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="delNote">Not (isteğe bağlı)</label>
                <textarea
                  id="delNote"
                  value={note}
                  rows={3}
                  maxLength={FIELD_LIMITS.cashClosuresNote}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <TurnstileWidget onToken={setToken} />
              {error && (
                <p className={styles.formError} role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary" disabled={sending}>
                {sending ? 'Gönderiliyor…' : 'Silme talebini gönder'}
              </button>
            </form>
          </section>
        )}
      </article>
    </LegalLayout>
  )
}
