import LegalLink from '../components/LegalLink'
import { useState } from 'react'
import { ChevronRightIcon } from '../components/icons'
import NewPasswordFields from '../components/NewPasswordFields'
import TurnstileWidget from '../public/components/TurnstileWidget'
import { newPasswordError, passwordChecks } from '../lib/passwordRules'
import { registerBusiness } from '../lib/signup'
import { FIELD_LIMITS } from '../lib/fieldLimits'
import styles from './LoginPage.module.css'

// Kendi kendine kayit: isletme + yonetici hesabi Ucretsiz paketle acilir.
export function RegisterForm({ onBack, onDone }: { onBack: () => void; onDone: (email: string) => void }) {
  const [businessName, setBusinessName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const invalid =
      newPasswordError(password, confirm) ??
      (passwordChecks(password).lettersAndDigits ? null : 'Şifre harf ve rakam içermeli.')
    if (invalid) {
      setError(invalid)
      return
    }
    if (!acceptTerms) {
      setError('Devam etmek için Kullanım Koşulları’nı kabul edin.')
      return
    }
    setLoading(true)
    const result = await registerBusiness({
      businessName,
      fullName,
      email: email.trim(),
      password,
      acceptTerms,
      turnstileToken,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onDone(result.email)
  }

  return (
    <div className={styles.lightPage}>
      <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Geri">
        <ChevronRightIcon width={18} height={18} className={styles.backIcon} />
      </button>
      <div className={styles.lightHead}>
        <h1 className={styles.lightTitle}>Salonunu oluştur</h1>
        <span className={styles.lightSub}>
          Ücretsiz paketle başlarsın; kredi kartı gerekmez. İstediğin zaman paketini yükseltebilirsin.
        </span>
      </div>

      <form className={styles.lightForm} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="regBusiness">Salonun adı</label>
          <input
            id="regBusiness"
            className={styles.inputWhite}
            maxLength={FIELD_LIMITS.businessesName}
            autoComplete="organization"
            placeholder="Ör. Işıl Güzellik Salonu"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            minLength={2}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="regName">Adın ve soyadın</label>
          <input
            id="regName"
            className={styles.inputWhite}
            maxLength={FIELD_LIMITS.profilesFullName}
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="regEmail">E-posta adresi</label>
          <input
            id="regEmail"
            className={styles.inputWhite}
            type="email"
            maxLength={FIELD_LIMITS.email}
            autoComplete="email"
            placeholder="isletmeniz@ornek.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <NewPasswordFields
          label="Şifre"
          password={password}
          onPasswordChange={setPassword}
          confirm={confirm}
          onConfirmChange={setConfirm}
          passwordId="regPassword"
          confirmId="regPasswordConfirm"
        />

        <label className={styles.consentRow}>
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
          <span>
            <LegalLink doc="kosullar">Kullanım Koşulları</LegalLink>’nı okudum, kabul ediyorum. Verilerimin{' '}
            <LegalLink doc="kvkk">KVKK Aydınlatma Metni</LegalLink> ve{' '}
            <LegalLink doc="gizlilik">Gizlilik Politikası</LegalLink>’na göre işlendiğini biliyorum.
          </span>
        </label>

        <TurnstileWidget onToken={setTurnstileToken} />

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.primaryBtn} disabled={loading}>
          {loading ? 'Hesap oluşturuluyor…' : 'Hesabı oluştur'}
        </button>
      </form>

      <div className={styles.lightFoot}>
        <button type="button" className={styles.textLink} onClick={onBack}>
          Zaten hesabım var, giriş yap
        </button>
      </div>
    </div>
  )
}
