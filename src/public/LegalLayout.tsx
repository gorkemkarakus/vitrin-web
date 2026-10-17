import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRightIcon } from '../components/icons'
import { LEGAL_INFO } from '../legal/legalInfo'
import styles from './LegalPage.module.css'

const LINKS = [
  { to: '/gizlilik', label: 'Gizlilik Politikası' },
  { to: '/kvkk', label: 'KVKK Aydınlatma Metni' },
  { to: '/kullanim-kosullari', label: 'Kullanım Koşulları' },
  { to: '/hesap-silme', label: 'Hesap ve veri silme' },
]

// Oturum gerektirmeyen yasal sayfalarin ortak cercevesi (uygulama icinden de,
// tarayicidan dogrudan da acilabilir).
export default function LegalLayout({
  title,
  current,
  children,
}: {
  title: string
  current: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  // Dogrudan linkle acildiysa geri gidilecek gecmis yok: girise don.
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <button type="button" className={styles.back} onClick={goBack} aria-label="Geri">
            <ChevronRightIcon width={18} height={18} />
          </button>
          <span className={styles.brand}>{LEGAL_INFO.brand}</span>
        </div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.updated}>Son güncelleme: {LEGAL_INFO.lastUpdated}</p>
        {children}
        <nav className={styles.links} aria-label="Diğer yasal metinler">
          {LINKS.filter((l) => l.to !== current).map((l) => (
            <Link key={l.to} to={l.to} replace className={styles.tab}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
