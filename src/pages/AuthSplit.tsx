import type { ReactNode } from 'react'
import logoMark from '../assets/brand/logo-mark.png'
import salonPhoto from '../assets/login-salon.webp'
import styles from './LoginPage.module.css'

// Genis ekranda (>= 1024px) giris / kayit / kod ekranlari: solda salon
// fotografi, sagda form. Fotograf: Unsplash photo-1562322140-8baeececf3df,
// Unsplash Lisansi — ticari kullanim serbest, atif zorunlu degil.
export default function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <div className={styles.split}>
      <section className={styles.splitVisual} aria-hidden="true">
        <img className={styles.splitPhoto} src={salonPhoto} alt="" />
        <div className={styles.splitShade} />
        <div className={styles.splitBrand}>
          <span className={styles.splitMark}>
            <img src={logoMark} alt="" />
          </span>
          <span>Adapptiv</span>
        </div>
        <div className={styles.splitCaption}>
          <h2>Salonunuzun bütün günü, tek ekranda.</h2>
          <p>Randevular, müşteriler, kasa ve WhatsApp asistanı — telefonda da, bilgisayarda da.</p>
        </div>
      </section>
      <main className={styles.splitPanel}>
        <div className={styles.splitInner}>{children}</div>
      </main>
    </div>
  )
}
