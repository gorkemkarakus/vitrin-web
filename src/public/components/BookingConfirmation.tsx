import styles from '../PublicBookingPage.module.css'

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

function toGCalDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export default function BookingConfirmation({
  businessName,
  serviceName,
  employeeName,
  scheduledAt,
  durationMinutes,
  price,
}: {
  businessName: string
  serviceName: string
  employeeName: string
  scheduledAt: string
  durationMinutes: number
  price: number | null
}) {
  const d = new Date(scheduledAt)
  const dateLabel = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })
  const timeLabel = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  const end = new Date(d.getTime() + durationMinutes * 60000)
  const calendarUrl =
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(`${serviceName} — ${businessName}`)}` +
    `&dates=${toGCalDate(d)}/${toGCalDate(end)}` +
    `&details=${encodeURIComponent(`${businessName} randevunuz — ${employeeName}`)}`

  return (
    <div className={styles.stepBody}>
      <div className={styles.confirmation}>
        <div className={styles.confirmationIcon}>✓</div>
        <h2>Randevunuz Alındı</h2>
        <p className={styles.confirmationLead}>
          İşleminiz başarıyla onaylandı. Sizi {businessName}'de ağırlamak için sabırsızlanıyoruz.
        </p>

        <div className={styles.receiptCard}>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>Hizmet</span>
            <span className={styles.receiptValue}>{serviceName}</span>
          </div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>Uzman</span>
            <span className={styles.receiptValue}>{employeeName}</span>
          </div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>Tarih</span>
            <span className={styles.receiptValue}>{dateLabel}</span>
          </div>
          <div className={styles.receiptRow}>
            <span className={styles.receiptLabel}>Saat</span>
            <span className={styles.receiptValue}>{timeLabel}</span>
          </div>
          {price != null && (
            <div className={`${styles.receiptRow} ${styles.receiptTotal}`}>
              <span className={styles.receiptLabel}>Toplam Tutar</span>
              <span className={styles.receiptValue}>{currency.format(price)}</span>
            </div>
          )}
        </div>

        <a className="btn-secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} href={calendarUrl} target="_blank" rel="noreferrer">
          Takvime Ekle
        </a>
      </div>
    </div>
  )
}
