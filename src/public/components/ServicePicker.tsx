import { useState } from 'react'
import type { PublicCategory, PublicService } from '../lib/publicBookingApi'
import styles from '../PublicBookingPage.module.css'

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

export default function ServicePicker({
  services,
  categories,
  selectedId,
  onSelect,
}: {
  services: PublicService[]
  categories: PublicCategory[]
  selectedId: string | null
  onSelect: (service: PublicService) => void
}) {
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all')

  if (services.length === 0) {
    return <p className={styles.empty}>Şu anda seçilebilecek bir hizmet yok.</p>
  }

  const visible = activeCategory === 'all' ? services : services.filter((s) => s.category_id === activeCategory)

  return (
    <div className={styles.stepBody}>
      {categories.length > 0 && (
        <div className={styles.categoryRow}>
          <button
            type="button"
            className={activeCategory === 'all' ? styles.categoryChipActive : styles.categoryChip}
            onClick={() => setActiveCategory('all')}
          >
            Tümü
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={activeCategory === c.id ? styles.categoryChipActive : styles.categoryChip}
              onClick={() => setActiveCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className={styles.serviceList}>
        {visible.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === selectedId ? styles.serviceCardActive : styles.serviceCard}
            onClick={() => onSelect(s)}
          >
            <div className={styles.serviceCardHead}>
              <span className={styles.serviceName}>{s.name}</span>
              {s.price != null && <span className={styles.servicePrice}>{currency.format(s.price)}</span>}
            </div>
            <span className={styles.serviceDuration}>⏱ {s.duration_minutes} dk</span>
            {s.description && <p className={styles.serviceDescription}>{s.description}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}
