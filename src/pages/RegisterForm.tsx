import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from '../components/icons'
import NewPasswordFields from '../components/NewPasswordFields'
import TurnstileWidget from '../public/components/TurnstileWidget'
import { newPasswordError, passwordChecks } from '../lib/passwordRules'
import { registerBusiness, resendConfirmation } from '../lib/signup'
import { FIELD_LIMITS } from '../lib/fieldLimits'
import styles from './LoginPage.module.css'

const RESEND_SECONDS = 60

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
            <Link to="/kullanim-kosullari">Kullanım Koşulları</Link>’nı okudum, kabul ediyorum. Verilerimin{' '}
            <Link to="/kvkk">KVKK Aydınlatma Metni</Link> ve <Link to="/gizlilik">Gizlilik Politikası</Link>’na göre
            işlendiğini biliyorum.
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

// Kayittan sonra (ya da onaylanmamis e-postayla giris denenince).
export function CheckEmail({ email, onBack }: { email: string; onBack: () => void }) {
  const [cooldown, setCooldown] = useState(RESEND_SECONDS)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function resend() {
    setSending(true)
    const result = await resendConfirmation(email)
    setSending(false)
    setNote(result.ok ? 'Bağlantıyı yeniden gönderdik.' : result.error)
    setCooldown(RESEND_SECONDS)
  }

  return (
    <div className={styles.lightPage}>
      <div className={styles.lightHead}>
        <h1 className={styles.lightTitle}>E-postanı kontrol et</h1>
        <span className={styles.lightSub}>
          <b>{email}</b> adresine bir doğrulama bağlantısı gönderdik. Bağlantıya dokunduktan sonra buradan giriş
          yapabilirsin.
        </span>
      </div>

      <div className={styles.sentCard}>
        <span className={styles.sentTitle}>Gelmedi mi?</span>
        <span className={styles.sentSub}>
          Gereksiz (spam) klasörüne bak. Bu adresle daha önce hesap açtıysan doğrudan giriş yapabilir ya da şifreni
          sıfırlayabilirsin.
        </span>
      </div>

      {note && <p className={styles.note}>{note}</p>}

      <button type="button" className={styles.primaryBtn} onClick={resend} disabled={sending || cooldown > 0}>
        {sending ? 'Gönderiliyor…' : cooldown > 0 ? `Tekrar göndermek için ${cooldown} sn` : 'Bağlantıyı tekrar gönder'}
      </button>

      <div className={styles.lightFoot}>
        <button type="button" className={styles.textLink} onClick={onBack}>
          Girişe dön
        </button>
      </div>
    </div>
  )
}
