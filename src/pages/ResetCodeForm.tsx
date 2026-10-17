import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CodeField from '../components/CodeField'
import NewPasswordFields from '../components/NewPasswordFields'
import { supabase } from '../lib/supabase'
import { newPasswordError } from '../lib/passwordRules'
import { isPwnedPassword, PWNED_PASSWORD_MESSAGE } from '../lib/pwned'
import { verifyEmailCode } from '../lib/signup'
import { friendlyDbError } from '../lib/dbErrors'
import styles from './LoginPage.module.css'

// "Sifremi unuttum": e-postadaki kod + yeni sifre ayni ekranda. Kod once
// dogrulanir (oturum acilir), sonra sifre degistirilir. Kod tek kullanimlik
// oldugu icin sifre kurallari ve sizinti kontrolu koddan ONCE yapilir.
export default function ResetCodeForm({ email }: { email: string }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const invalid = newPasswordError(password, confirm)
    if (invalid) {
      setError(invalid)
      return
    }
    setLoading(true)
    if (await isPwnedPassword(password)) {
      setLoading(false)
      setError(PWNED_PASSWORD_MESSAGE)
      return
    }
    if (!verified) {
      const err = await verifyEmailCode(email, code, 'recovery')
      if (err) {
        setLoading(false)
        setError(err)
        return
      }
      setVerified(true)
    }
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) {
      // Kod kullanildi, oturum acik: yalnizca sifre tekrar denenir.
      setError(friendlyDbError(err, 'Şifre güncellenemedi, tekrar deneyin.'))
      return
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <form className={styles.lightForm} onSubmit={handleSubmit}>
      {!verified && <CodeField id="resetCode" value={code} onChange={setCode} label="E-postadaki kod" />}
      <NewPasswordFields
        password={password}
        onPasswordChange={setPassword}
        confirm={confirm}
        onConfirmChange={setConfirm}
        passwordId="resetPassword"
        confirmId="resetPasswordConfirm"
      />
      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" className={styles.primaryBtn} disabled={loading}>
        {loading ? 'Kaydediliyor…' : 'Şifremi değiştir ve giriş yap'}
      </button>
    </form>
  )
}
