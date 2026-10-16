import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logoMark from '../assets/brand/logo-mark.png'
import { supabase } from '../lib/supabase'
import NewPasswordFields from '../components/NewPasswordFields'
import { newPasswordError } from '../lib/passwordRules'
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
    const invalid = newPasswordError(password, confirmPassword)
    if (invalid) {
      setError(invalid)
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
          <NewPasswordFields
            password={password}
            onPasswordChange={setPassword}
            confirm={confirmPassword}
            onConfirmChange={setConfirmPassword}
            passwordId="password"
            confirmId="confirmPassword"
            confirmPlaceholder="••••••••••"
          />

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
