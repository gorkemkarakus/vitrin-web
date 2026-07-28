import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
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

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session))
      setReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true)
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
    setDone(true)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <Logo />
        </div>
        <h1 className={styles.title}>Yeni şifre belirle</h1>

        {!ready ? (
          <p className={styles.sub}>Yükleniyor…</p>
        ) : done ? (
          <>
            <p className={styles.sub}>Şifreniz güncellendi.</p>
            <button type="button" className="btn-primary" onClick={() => navigate('/')}>
              Panele git →
            </button>
          </>
        ) : !hasSession ? (
          <>
            <p className={styles.sub}>
              Bağlantı geçersiz veya süresi dolmuş. Lütfen giriş sayfasından "Şifremi unuttum" akışını tekrar başlatın.
            </p>
            <button type="button" className="btn-primary" onClick={() => navigate('/')}>
              Girişe dön
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="password">Yeni şifre</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Yeni şifre (tekrar)</label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Kaydediliyor…' : 'Şifreyi kaydet'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
