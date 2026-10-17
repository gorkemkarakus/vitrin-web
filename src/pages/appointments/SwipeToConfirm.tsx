import { useRef, useState } from 'react'
import { ChevronRightIcon } from '../../components/icons'
import styles from '../AppointmentsPage.module.css'

// Randevu detayinin altindaki "Tamamlamak icin kaydir" seridi. Turuncu
// tutamac saga surukleniyor; sonuna yaklasinca onConfirm. Klavye ile
// Enter/Space de calisir.
export default function SwipeToConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  const [dx, setDx] = useState(0)
  const max = () => (trackRef.current ? trackRef.current.clientWidth - 64 : 240)
  return (
    <div className={styles.swipeTrack} ref={trackRef}>
      <button
        type="button"
        className={styles.swipeKnob}
        style={{ transform: `translateX(${dx}px)` }}
        aria-label={label}
        onPointerDown={(e) => {
          startX.current = e.clientX
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (startX.current === null) return
          setDx(Math.max(0, Math.min(max(), e.clientX - startX.current)))
        }}
        onPointerUp={() => {
          const done = dx >= max() * 0.8
          startX.current = null
          setDx(0)
          if (done) onConfirm()
        }}
        onPointerCancel={() => {
          startX.current = null
          setDx(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onConfirm()
          }
        }}
      >
        <ChevronRightIcon width={22} height={22} />
      </button>
      <span className={styles.swipeLabel}>{label}</span>
    </div>
  )
}
