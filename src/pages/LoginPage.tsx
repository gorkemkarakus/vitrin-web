import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import { useAuth } from '../contexts/AuthContext'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const { signIn, resetPassword } = useAuth()

  const [mode, setMode] = useState<'login' | 'forgot'>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) {
      setError('E-posta veya şifre hatalı.')
      return
    }
    navigate('/randevular')
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault()
    setForgotLoading(true)
    await resetPassword(forgotEmail)
    setForgotLoading(false)
    // Kayıtlı olmayan bir e-postanın var olup olmadığını sızdırmamak için
    // sonucu her zaman ayni basarili mesajla gosteriyoruz.
    setForgotSent(true)
  }

  if (mode === 'forgot') {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.logoWrap}>
            <Logo />
          </div>
          <h1 className={styles.title}>Şifremi unuttum</h1>
          <p className={styles.sub}>
            {forgotSent
              ? 'E-postanız sistemde kayıtlıysa, şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.'
              : 'E-posta adresinizi girin, size bir şifre sıfırlama bağlantısı gönderelim.'}
          </p>

          {!forgotSent && (
            <form onSubmit={handleForgotSubmit}>
              <div className="field">
                <label htmlFor="forgotEmail">E-posta Adresi</label>
                <input
                  id="forgotEmail"
                  type="email"
                  placeholder="isletmeniz@ornek.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={forgotLoading}>
                {forgotLoading ? 'Gönderiliyor…' : 'Bağlantı gönder'}
              </button>
            </form>
          )}

          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              setMode('login')
              setForgotSent(false)
            }}
          >
            ← Girişe dön
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Logo />
        </div>
        <h1 className={styles.title}>Hoş Geldiniz</h1>
        <p className={styles.sub}>Lütfen hesabınıza giriş yapın</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-posta Adresi</label>
            <input
              id="email"
              type="email"
              placeholder="isletmeniz@ornek.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Şifre</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Giriş yapılıyor…' : 'Giriş yap →'}
          </button>
        </form>

        <button type="button" className={styles.linkBtn} onClick={() => setMode('forgot')}>
          Şifremi unuttum
        </button>
      </div>
    </div>
  )
}
