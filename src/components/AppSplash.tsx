import logoMark from '../assets/brand/logo-mark.png'
import styles from './AppSplash.module.css'

export default function AppSplash({ fadingOut }: { fadingOut: boolean }) {
  return (
    <div className={`${styles.wrap} ${fadingOut ? styles.fadingOut : ''}`}>
      <img src={logoMark} alt="" className={styles.mark} />
      <div className={styles.wordmark}>Adapptiv</div>
      <div className={styles.dots}>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
