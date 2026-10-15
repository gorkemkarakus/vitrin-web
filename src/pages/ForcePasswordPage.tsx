import { useState } from 'react'
import logoMark from '../assets/brand/logo-mark.png'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import styles from './LoginPage.module.css'

// Yonetici hesabi "ilk giriste kendi sifresini belirlesin" diye actiysa
// (profiles.must_change_password) uygulama acilmadan once bu ekran gelir.
export default function ForcePasswordPage() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
    if (err) {
      setLoading(false)
      setError(/same/i.test(err.message) ? 'Yeni şifre geçici şifreden farklı olmalı.' : err.message)
      return
    }
    await supabase.from('profiles').update({ must_change_password: false }).eq('id', profile!.id)
    await refreshProfile()
    setLoading(false)
  }

  const longEnough = password.length >= 6
  const lettersAndDigits = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(password) && /\d/.test(password)
  const hasUpper = /[A-ZÇĞİÖŞÜ]/.test(password)
  const strength = [longEnough, lettersAndDigits, hasUpper, password.length >= 10].filter(Boolean).length
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0]

  return (
    <div className={styles.lightPage}>
      <div className={styles.lightBrand}>
        <img src={logoMark} alt="" />
        <span>Adapptiv</span>
      </div>
      <div className={styles.lightHead}>
        <h1 className={styles.lightTitle}>Hoş geldin{firstName ? `, ${firstName}` : ''}</h1>
        <span className={styles.lightSub}>Başlamadan önce kendine yeni bir şifre belirle.</span>
      </div>

      <form className={styles.lightForm} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="newPassword">Yeni şifre</label>
          <div className={`${styles.passwordBox} ${styles.passwordBoxWhite}`}>
            <input
              id="newPassword"
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
          <label htmlFor="newPassword2">Yeni şifre (tekrar)</label>
          <input
            id="newPassword2"
            className={styles.inputWhite}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.primaryBtn} disabled={loading}>
          {loading ? 'Kaydediliyor…' : 'Şifremi kaydet ve devam et'}
        </button>
      </form>

      <div className={styles.lightFoot}>
        <button type="button" className={styles.textLink} onClick={() => signOut()}>
          Çıkış yap
        </button>
      </div>
    </div>
  )
}
