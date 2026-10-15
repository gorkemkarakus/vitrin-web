import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoMark from '../assets/brand/logo-mark.png'
import { supabase } from '../lib/supabase'
import styles from './LoginPage.module.css'

// "Şifremi unuttum" e-postasındaki bağlantı buraya yönlendirir. supabase-js
// URL'deki recovery token'ı otomatik işleyip geçici bir oturum kurar
// (detectSessionInUrl varsayılan olarak açık) — biz sadece o oturumun
// gerçekten kurulduğunu bekleyip yeni şifreyi supabase.auth.updateUser ile
// kaydediyoruz.
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session))
      setAccountEmail(data.session?.user.email ?? null)
      setReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true)
      if (session?.user.email) setAccountEmail(session.user.email)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.')
      return
    }
    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    // Kurtarma oturumu zaten acik; dogrudan uygulamaya gec.
    navigate('/', { replace: true })
  }

  const longEnough = password.length >= 6
  const lettersAndDigits = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(password) && /\d/.test(password)
  const hasUpper = /[A-ZÇĞİÖŞÜ]/.test(password)
  const strength = [longEnough, lettersAndDigits, hasUpper, password.length >= 10].filter(Boolean).length

  return (
    <div className={styles.lightPage}>
      <div className={styles.lightBrand}>
        <img src={logoMark} alt="" />
        <span>Adapptiv</span>
      </div>
      <div className={styles.lightHead}>
        <h1 className={styles.lightTitle}>Yeni şifre belirle</h1>
        <span className={styles.lightSub}>{accountEmail ? `${accountEmail} hesabı için` : 'Hesabın için yeni bir şifre seç.'}</span>
      </div>

      {!ready ? (
        <p className={styles.note}>Yükleniyor…</p>
      ) : !hasSession ? (
        <>
          <p className={styles.note}>
            Bu bağlantı geçersiz ya da süresi dolmuş. Yeni bir bağlantı isteyip e-postandaki bağlantıya tekrar dokun.
          </p>
          <button type="button" className={styles.primaryBtn} onClick={() => navigate('/?unuttum=1')}>
            Yeni bağlantı iste
          </button>
        </>
      ) : (
        <form className={styles.lightForm} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="password">Yeni şifre</label>
            <div className={`${styles.passwordBox} ${styles.passwordBoxWhite}`}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
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
          <div className={styles.strength}>
            <div className={styles.strengthBars} aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={i < strength ? styles.barOn : styles.bar} />
              ))}
            </div>
            <div className={styles.rules}>
              <span className={longEnough ? styles.ruleOk : styles.ruleTodo}>{longEnough ? '✓' : '○'} En az 6 karakter</span>
              <span className={lettersAndDigits ? styles.ruleOk : styles.ruleTodo}>
                {lettersAndDigits ? '✓' : '○'} Harf ve rakam içeriyor
              </span>
              <span className={hasUpper ? styles.ruleOk : styles.ruleTodo}>
                {hasUpper ? '✓' : '○'} Büyük harf eklersen daha güçlü olur
              </span>
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="confirmPassword">Yeni şifre (tekrar)</label>
            <input
              id="confirmPassword"
              className={styles.inputWhite}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.primaryBtn} disabled={loading}>
            {loading ? 'Kaydediliyor…' : 'Şifreyi kaydet ve giriş yap'}
          </button>
        </form>
      )}

      {ready && hasSession && <span className={styles.lightFootNote}>Bu bağlantı 1 saat geçerlidir.</span>}
    </div>
  )
}
