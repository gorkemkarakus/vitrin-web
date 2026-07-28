import styles from '../PublicBookingPage.module.css'

export default function SlotGrid({
  slots,
  loading,
  selectedSlot,
  onSelect,
}: {
  slots: string[]
  loading: boolean
  selectedSlot: string | null
  onSelect: (slot: string) => void
}) {
  if (loading) return <p className={styles.empty}>Uygun saatler yükleniyor…</p>
  if (slots.length === 0) return <p className={styles.empty}>Bu tarihte uygun saat yok, başka bir gün deneyin.</p>

  const morning = slots.filter((s) => Number(s.slice(0, 2)) < 12)
  const afternoon = slots.filter((s) => Number(s.slice(0, 2)) >= 12)

  function renderGroup(label: string, group: string[]) {
    if (group.length === 0) return null
    return (
      <div key={label} className={styles.slotGroup}>
        <span className={styles.slotGroupLabel}>{label}</span>
        <div className={styles.slotGrid}>
          {group.map((s) => (
            <button
              key={s}
              type="button"
              className={s === selectedSlot ? styles.slotChipActive : styles.slotChip}
              onClick={() => onSelect(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.slotGroups}>
      {renderGroup('Sabah', morning)}
      {renderGroup('Öğleden Sonra', afternoon)}
    </div>
  )
}
