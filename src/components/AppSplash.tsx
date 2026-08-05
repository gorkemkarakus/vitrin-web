import styles from './AppSplash.module.css'

export default function AppSplash({ fadingOut }: { fadingOut: boolean }) {
  return (
    <div className={`${styles.wrap} ${fadingOut ? styles.fadingOut : ''}`}>
      <div className={styles.mark}>
        <span className={styles.markInner} />
      </div>
      <div className={styles.wordmark}>Vitrin</div>
      <div className={styles.dots}>
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
