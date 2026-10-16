import { useState } from 'react'
import logoMark from '../assets/brand/logo-mark.png'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import NewPasswordFields from '../components/NewPasswordFields'
import { newPasswordError } from '../lib/passwordRules'
import styles from './LoginPage.module.css'

// Yonetici hesabi "ilk giriste kendi sifresini belirlesin" diye actiysa
// (profiles.must_change_password) uygulama acilmadan once bu ekran gelir.
export default function ForcePasswordPage() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
    if (err) {
      setLoading(false)
      setError(/same/i.test(err.message) ? 'Yeni şifre geçici şifreden farklı olmalı.' : err.message)
      return
    }
    await supabase.from('profiles').update({ must_change_password: false }).eq('id', profile!.id)
    await refreshProfile()
    setLoading(false)
  }

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
        <NewPasswordFields
          password={password}
          onPasswordChange={setPassword}
          confirm={confirmPassword}
          onConfirmChange={setConfirmPassword}
          passwordId="newPassword"
          confirmId="newPassword2"
        />

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
