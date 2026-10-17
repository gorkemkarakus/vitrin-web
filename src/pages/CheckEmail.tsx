import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CodeField from '../components/CodeField'
import { resendConfirmation, verifyEmailCode } from '../lib/signup'
import styles from './LoginPage.module.css'

const RESEND_SECONDS = 60

// Kayittan sonra (justSent) ya da onaylanmamis e-postayla giris denenince:
// e-postadaki kod yazilir, hesap dogrulanir ve oturum acilir.
export default function CheckEmail({
  email,
  justSent,
  onBack,
}: {
  email: string
  justSent: boolean
  onBack: () => void
}) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(justSent ? RESEND_SECONDS : 0)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setVerifying(true)
    const err = await verifyEmailCode(email, code, 'signup')
    setVerifying(false)
    if (err) {
      setError(err)
      return
    }
    navigate('/dashboard', { replace: true })
  }

  async function resend() {
    setSending(true)
    setError(null)
    const result = await resendConfirmation(email)
    setSending(false)
    setNote(result.ok ? 'Yeni kodu gönderdik. Önceki kod artık geçersiz.' : result.error)
    setCooldown(RESEND_SECONDS)
  }

  return (
    <div className={styles.lightPage}>
      <div className={styles.lightHead}>
        <h1 className={styles.lightTitle}>E-postanı kontrol et</h1>
        <span className={styles.lightSub}>
          {justSent ? (
            <>
              <b>{email}</b> adresine bir doğrulama kodu gönderdik. Kodu aşağıya yaz, hesabın doğrulansın.
            </>
          ) : (
            <>
              <b>{email}</b> henüz doğrulanmadı. E-postandaki kodu yaz ya da yeni kod iste.
            </>
          )}
        </span>
      </div>

      <form className={styles.lightForm} onSubmit={verify}>
        <CodeField id="signupCode" value={code} onChange={setCode} label="Doğrulama kodu" />
        {error && <p className={styles.error}>{error}</p>}
        <button type="submit" className={styles.primaryBtn} disabled={verifying}>
          {verifying ? 'Doğrulanıyor…' : 'Doğrula ve giriş yap'}
        </button>
      </form>

      <div className={styles.sentCard}>
        <span className={styles.sentTitle}>Kod gelmedi mi?</span>
        <span className={styles.sentSub}>
          Gereksiz (spam) klasörüne bak. Bu adresle daha önce hesap açtıysan doğrudan giriş yapabilir ya da şifreni
          sıfırlayabilirsin.
        </span>
      </div>

      {note && <p className={styles.note}>{note}</p>}

      <div className={styles.lightFoot}>
        <button type="button" className={styles.textLink} onClick={resend} disabled={sending || cooldown > 0}>
          {sending ? 'Gönderiliyor…' : cooldown > 0 ? `Yeni kod için ${cooldown} sn` : 'Yeni kod gönder'}
        </button>
        <button type="button" className={styles.textLink} onClick={onBack}>
          Girişe dön
        </button>
      </div>
    </div>
  )
}
