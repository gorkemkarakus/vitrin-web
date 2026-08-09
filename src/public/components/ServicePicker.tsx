import type { PublicService } from '../lib/publicBookingApi'
import styles from '../PublicBookingPage.module.css'

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

export default function ServicePicker({
  services,
  selectedId,
  onSelect,
}: {
  services: PublicService[]
  selectedId: string | null
  onSelect: (service: PublicService) => void
}) {
  if (services.length === 0) {
    return <p className={styles.empty}>Şu anda seçilebilecek bir hizmet yok.</p>
  }

  return (
    <div className={styles.stepBody}>
      <div className={styles.serviceList}>
        {services.map((s) => (
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
