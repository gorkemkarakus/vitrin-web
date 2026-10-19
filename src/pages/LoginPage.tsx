import LegalLink from '../components/LegalLink'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import logoMark from '../assets/brand/logo-mark.png'
import { useAuth } from '../contexts/AuthContext'
import { ChevronRightIcon } from '../components/icons'
import styles from './LoginPage.module.css'
import { FIELD_LIMITS } from '../lib/fieldLimits'
import { RegisterForm } from './RegisterForm'
import CheckEmail from './CheckEmail'
import ResetCodeForm from './ResetCodeForm'
import AuthSplit from './AuthSplit'
import { useLayout } from '../lib/layout'

type Mode = 'intro' | 'login' | 'forgot' | 'register' | 'check_email'

// Ayni adrese ust uste kod istenmesin diye.
const RESEND_SECONDS = 60

// Genis ekranda (>= 1024px) ayni ekranlar AuthSplit icinde (solda fotograf,
// sagda form) acilir; tanitim ekrani atlanir, dogrudan giris formu gelir.
export default function LoginPage() {
  const { isWide } = useLayout()
  if (!isWide) return <LoginScreens wide={false} />
  return (
    <AuthSplit>
      <LoginScreens wide />
    </AuthSplit>
  )
}

function LoginScreens({ wide }: { wide: boolean }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signIn, resetPassword } = useAuth()

  // Yeni sifre ekranindaki "Yenisini iste" buraya ?unuttum=1 ile doner.
  const [mode, setMode] = useState<Mode>(
    searchParams.get('unuttum') === '1' ? 'forgot' : searchParams.get('kayit') === '1' ? 'register' : 'intro',
  )
  // Kayittan sonra ya da onaylanmamis e-postayla giris denenince.
  const [pendingEmail, setPendingEmail] = useState('')
  // true: kod az once gonderildi (kayit); false: giris denemesinde fark edildi.
  const [codeJustSent, setCodeJustSent] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err, code } = await signIn(email, password)
    setLoading(false)
    if (code === 'email_not_confirmed') {
      setPendingEmail(email.trim())
      setCodeJustSent(false)
      setMode('check_email')
      return
    }
    if (err) {
      setError('E-posta veya şifre hatalı.')
      return
    }
    // Yonetici ana sayfaya, calisan (ana sayfa yetkisi yok) Randevular'a
    // duser — yonlendirmeyi ProtectedRoute yapiyor.
    navigate('/dashboard')
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (cooldown > 0) return
    setForgotLoading(true)
    await resetPassword(forgotEmail.trim())
    setForgotLoading(false)
    // Kayıtlı olmayan bir e-postanın var olup olmadığını sızdırmamak için
    // sonucu her zaman ayni basarili mesajla gosteriyoruz.
    setSentTo(forgotEmail.trim())
    setCooldown(RESEND_SECONDS)
  }

  if (mode === 'register') {
    return (
      <RegisterForm
        onBack={() => setMode('login')}
        onDone={(registered) => {
          setPendingEmail(registered)
          setEmail(registered)
          setCodeJustSent(true)
          setMode('check_email')
        }}
      />
    )
  }

  if (mode === 'check_email') {
    return <CheckEmail email={pendingEmail} justSent={codeJustSent} onBack={() => setMode('login')} />
  }

  if (mode === 'intro' && !wide) {
    return (
      <div className={styles.intro}>
        <span className={styles.ringLeft} aria-hidden="true" />
        <span className={styles.dotRight} aria-hidden="true" />
        <div className={styles.brandRow}>
          <span className={styles.introMark}>
            <img src={logoMark} alt="" />
          </span>
          <span className={styles.brand}>Adapptiv</span>
        </div>
        <div className={styles.introText}>
          <h1 className={styles.introTitle}>
            Salonun,
            <br />
            cebinde.
          </h1>
          <p className={styles.introSub}>
            Randevular, müşteriler, kasa ve WhatsApp’tan randevu alan asistan tek uygulamada.
          </p>
          <button type="button" className={styles.introBtn} onClick={() => setMode('login')}>
            Giriş yap
          </button>
          <button type="button" className={styles.signupGhost} onClick={() => setMode('register')}>
            Ücretsiz hesap oluştur
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'forgot') {
    return (
      <div className={styles.lightPage}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={() => {
            setMode('login')
            setSentTo(null)
          }}
          aria-label="Girişe dön"
        >
          <ChevronRightIcon width={18} height={18} className={styles.backIcon} />
        </button>
        <div className={styles.lightHead}>
          <h1 className={styles.lightTitle}>Şifremi unuttum</h1>
          <span className={styles.lightSub}>
            E-posta adresinizi yazın, yeni şifre belirlemeniz için bir kod gönderelim.
          </span>
        </div>

        <form className={styles.lightForm} onSubmit={handleForgotSubmit}>
          <div className={styles.field}>
            <label htmlFor="forgotEmail">E-posta adresi</label>
            <input
              maxLength={FIELD_LIMITS.email}
              id="forgotEmail"
              className={styles.inputWhite}
              type="email"
              autoComplete="email"
              placeholder="isletmeniz@ornek.com"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" className={styles.primaryBtn} disabled={forgotLoading || cooldown > 0}>
            {forgotLoading
              ? 'Gönderiliyor…'
              : cooldown > 0
                ? `Tekrar göndermek için ${cooldown} sn`
                : sentTo
                  ? 'Yeni kod gönder'
                  : 'Kod gönder'}
          </button>
        </form>

        {sentTo && (
          <>
            <div className={styles.sentCard}>
              <span className={styles.sentTitle}>Gönderildi</span>
              <span className={styles.sentSub}>
                <b>{sentTo}</b> kayıtlıysa bu adrese bir kod yolladık. Gelmediyse gereksiz klasörüne bakın;{' '}
                {RESEND_SECONDS} saniye sonra yenisini isteyebilirsiniz.
              </span>
            </div>
            <ResetCodeForm key={sentTo} email={sentTo} />
          </>
        )}

        <div className={styles.lightFoot}>
          <button
            type="button"
            className={styles.textLink}
            onClick={() => {
              setMode('login')
              setSentTo(null)
            }}
          >
            Girişe dön
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <span className={styles.ringTop} aria-hidden="true" />
      <div className={styles.top}>
        <span className={styles.topMark}>
          <img src={logoMark} alt="" />
        </span>
        <h1 className={styles.topTitle}>Hoş geldiniz</h1>
        <p className={styles.topSub}>Salonunuza giriş yapın.</p>
      </div>

      <form className={styles.sheet} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="email">E-posta adresi</label>
          <input
            maxLength={FIELD_LIMITS.email}
            id="email"
            className={styles.inputGray}
            type="email"
            autoComplete="email"
            placeholder="isletmeniz@ornek.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Şifre</label>
          <div className={styles.passwordBox}>
            <input
              maxLength={FIELD_LIMITS.password}
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className={styles.showBtn}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
            >
              {showPassword ? 'Gizle' : 'Göster'}
            </button>
          </div>
        </div>
        <button
          type="button"
          className={styles.forgotLink}
          onClick={() => {
            setForgotEmail(email)
            setMode('forgot')
          }}
        >
          Şifremi unuttum
        </button>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.primaryBtn} disabled={loading}>
          {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>
        <button type="button" className={styles.registerLink} onClick={() => setMode('register')}>
          Hesabın yok mu? <b>Ücretsiz oluştur</b>
        </button>
        <p className={styles.legal}>
          Giriş yaparak <LegalLink doc="kosullar">Kullanım Koşulları</LegalLink>&apos;nı kabul etmiş olursunuz.
          Verileriniz <LegalLink doc="gizlilik">Gizlilik Politikası</LegalLink> ve{' '}
          <LegalLink doc="kvkk">KVKK Aydınlatma Metni</LegalLink>
          &apos;ne göre işlenir.
        </p>
      </form>
    </div>
  )
}
