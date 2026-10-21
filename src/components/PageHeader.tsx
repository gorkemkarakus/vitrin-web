import type { ReactNode } from 'react'
import { ChevronRightIcon } from './icons'
import { useGoBack } from '../lib/useGoBack'
import styles from './PageHeader.module.css'

// Tasarimdaki iki baslik duzeni:
// - back verilmezse "kok" baslik: buyuk (28px) baslik solda, islem sagda
//   (Randevular, Musteriler, Kasa, Reklamlar).
// - back verilirse alt sayfa basligi: beyaz yuvarlak geri dugmesi + 24px
//   baslik (+ istege bagli alt satir) + sagda islem.
interface PageHeaderProps {
  title: ReactNode
  sub?: ReactNode
  // yol verilirse geri once gelinen ekrana doner, gecmis yoksa bu yola gider
  back?: string | (() => void)
  action?: ReactNode
  // Geri dugmesinin zemini (beyaz kart ustunde gri olmasi gerekiyor).
  backTone?: 'white' | 'gray'
}

export default function PageHeader({ title, sub, back, action, backTone = 'white' }: PageHeaderProps) {
  const goBack = useGoBack()

  if (back === undefined) {
    return (
      <div className={styles.root}>
        <h1 className={styles.rootTitle}>{title}</h1>
        {action}
      </div>
    )
  }

  return (
    <div className={styles.sub}>
      <button
        type="button"
        className={backTone === 'gray' ? `${styles.back} ${styles.backGray}` : styles.back}
        onClick={() => (typeof back === 'string' ? goBack(back) : back())}
        aria-label="Geri"
      >
        <ChevronRightIcon width={18} height={18} className={styles.backIcon} />
      </button>
      {sub ? (
        <span className={styles.subText}>
          <span className={styles.subTitle}>{title}</span>
          <span className={styles.subLine}>{sub}</span>
        </span>
      ) : (
        <h1 className={styles.subTitleOnly}>{title}</h1>
      )}
      {action}
    </div>
  )
}
