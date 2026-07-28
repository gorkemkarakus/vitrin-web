import styles from '../PublicBookingPage.module.css'

const SEARCH_DAYS = 14
const WEEKDAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

function toLocalDateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DateStrip({
  selectedDate,
  onSelect,
}: {
  selectedDate: string | null
  onSelect: (date: string) => void
}) {
  const days: { key: string; dayNum: number; weekday: string }[] = []
  const today = new Date()
  for (let i = 0; i < SEARCH_DAYS; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push({ key: toLocalDateString(d), dayNum: d.getDate(), weekday: WEEKDAY_SHORT[d.getDay()] })
  }

  return (
    <div className={styles.dateStrip}>
      {days.map((d) => (
        <button
          key={d.key}
          type="button"
          className={d.key === selectedDate ? styles.dateChipActive : styles.dateChip}
          onClick={() => onSelect(d.key)}
        >
          <span className={styles.dateChipWeekday}>{d.weekday}</span>
          <span className={styles.dateChipNum}>{d.dayNum}</span>
        </button>
      ))}
    </div>
  )
}
