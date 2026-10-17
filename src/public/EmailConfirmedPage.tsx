import { useNavigate } from 'react-router-dom'
import styles from '../pages/LoginPage.module.css'

// Kayit e-postasindaki dogrulama baglantisi buraya doner. Supabase hata
// durumunu adres sonundaki #error_code ile bildirir (ör. otp_expired).
export default function EmailConfirmedPage() {
  const navigate = useNavigate()
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const errorCode = hash.get('error_code')
  const expired = errorCode === 'otp_expired'

  return (
    <div className={styles.lightPage}>
      <div className={styles.lightHead}>
        <h1 className={styles.lightTitle}>
          {errorCode ? (expired ? 'Bağlantının süresi dolmuş' : 'Doğrulanamadı') : 'E-postan doğrulandı'}
        </h1>
        <span className={styles.lightSub}>
          {errorCode
            ? 'Uygulamada e-posta adresin ve şifrenle giriş yapmayı dene; doğrulama bağlantısını oradan yeniden isteyebilirsin.'
            : 'Hesabın hazır. Adapptiv uygulamasına dönüp e-posta adresin ve şifrenle giriş yapabilirsin.'}
        </span>
      </div>
      <button type="button" className={styles.primaryBtn} onClick={() => navigate('/', { replace: true })}>
        Giriş yap
      </button>
    </div>
  )
}
