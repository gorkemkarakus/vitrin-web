import type { ReactNode } from 'react'
import PageHeader from './PageHeader'
import { useLayout } from '../lib/layout'
import styles from './PlanLocked.module.css'

// "Yalnizca genis ekran" seviyesindeki ekranlar (otomasyon kurucu, toplu
// ice/disa aktarma, yetki matrisi…). Dar ekranda icerik yerine bilgisayardan
// kullanma notu gosterilir; ekran genisleyince (tablet yan cevrilince)
// kendiliginden acilir.
export default function WideOnly({
  title,
  back = '/daha-fazla',
  children,
}: {
  title: string
  back?: string
  children: ReactNode
}) {
  const { isWide } = useLayout()
  if (isWide) return <>{children}</>
  return (
    <div className={styles.wrap}>
      <PageHeader back={back} title={title} />
      <div className={styles.card}>
        <h2 className={styles.title}>Bu ekran bilgisayarda kullanılıyor</h2>
        <p className={styles.text}>
          {title} geniş bir ekran gerektiriyor. Adapptiv’e bilgisayarınızdaki tarayıcıdan aynı hesapla giriş yapın ya da
          tabletinizi yan çevirin.
        </p>
      </div>
    </div>
  )
}
