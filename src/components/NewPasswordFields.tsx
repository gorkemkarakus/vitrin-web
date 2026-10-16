import { useState } from 'react'
import { passwordChecks } from '../lib/passwordRules'
import styles from '../pages/LoginPage.module.css'

// Yeni sifre + tekrar alanlari ve guc gostergesi (ilk giriste sifre
// belirleme ve "sifremi unuttum" ekranlari).
export default function NewPasswordFields({
  password,
  onPasswordChange,
  confirm,
  onConfirmChange,
  passwordId,
  confirmId,
  confirmPlaceholder,
}: {
  password: string
  onPasswordChange: (v: string) => void
  confirm: string
  onConfirmChange: (v: string) => void
  passwordId: string
  confirmId: string
  confirmPlaceholder?: string
}) {
  const [show, setShow] = useState(false)
  const { longEnough, lettersAndDigits, hasUpper, strength } = passwordChecks(password)

  return (
    <>
      <div className={styles.field}>
        <label htmlFor={passwordId}>Yeni şifre</label>
        <div className={`${styles.passwordBox} ${styles.passwordBoxWhite}`}>
          <input
            id={passwordId}
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            required
          />
          <button
            type="button"
            className={styles.showBtn}
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Şifreyi gizle' : 'Şifreyi göster'}
          >
            {show ? 'Gizle' : 'Göster'}
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
          <span className={longEnough ? styles.ruleOk : styles.ruleTodo}>{longEnough ? '✓' : '○'} En az 8 karakter</span>
          <span className={lettersAndDigits ? styles.ruleOk : styles.ruleTodo}>
            {lettersAndDigits ? '✓' : '○'} Harf ve rakam içeriyor
          </span>
          <span className={hasUpper ? styles.ruleOk : styles.ruleTodo}>
            {hasUpper ? '✓' : '○'} Büyük harf eklersen daha güçlü olur
          </span>
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={confirmId}>Yeni şifre (tekrar)</label>
        <input
          id={confirmId}
          className={styles.inputWhite}
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder={confirmPlaceholder}
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          required
        />
      </div>
    </>
  )
}
