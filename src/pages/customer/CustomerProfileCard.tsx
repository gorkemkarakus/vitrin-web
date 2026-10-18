import { LockIcon } from '../../components/icons'
import {
  SOURCE_LABEL,
  birthdayLabel,
  daysUntilBirthday,
  formatFieldValue,
  type CustomFieldValues,
  type CustomerSource,
  type FieldDefinition,
} from '../../lib/customerCrm'
import styles from './Crm.module.css'

export interface CrmCustomer {
  birthday: string | null
  source: CustomerSource | null
  tags: string[]
  custom_fields: CustomFieldValues
}

// Musteri kartindaki "Bilgiler": kaynak, dogum gunu, etiketler ve isletmenin
// tanimladigi alanlar. Bos alanlar gosterilmez.
export default function CustomerProfileCard({
  customer,
  fields,
  onEdit,
}: {
  customer: CrmCustomer
  fields: FieldDefinition[]
  onEdit: () => void
}) {
  const birthday = birthdayLabel(customer.birthday)
  const soon = (daysUntilBirthday(customer.birthday) ?? 99) <= 7
  const filled = fields
    .map((def) => ({ def, value: formatFieldValue(def, customer.custom_fields?.[def.id]) }))
    .filter((f) => f.value !== null)
  const empty = !customer.source && !birthday && customer.tags.length === 0 && filled.length === 0

  return (
    <section className={styles.card} aria-labelledby="crmInfoTitle">
      <div className={styles.cardHead}>
        <h2 id="crmInfoTitle" className={styles.cardTitle}>
          Bilgiler
        </h2>
        <button type="button" className={styles.linkBtn} onClick={onEdit}>
          {empty ? 'Ekle' : 'Düzenle'}
        </button>
      </div>

      {empty ? (
        <p className={styles.emptyHint}>
          Nereden geldiğini, doğum gününü ve etiketlerini ekleyin
          {fields.length > 0
            ? `; ${fields.map((f) => f.label.toLocaleLowerCase('tr')).join(', ')} gibi alanlar da burada`
            : ''}
          .
        </p>
      ) : (
        <div className={styles.rows}>
          {customer.tags.length > 0 && (
            <div className={styles.row}>
              <div className={styles.tags}>
                {customer.tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
          {customer.source && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Nereden geldi</span>
              <span className={styles.rowValue}>{SOURCE_LABEL[customer.source]}</span>
            </div>
          )}
          {birthday && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Doğum günü</span>
              <span className={soon ? `${styles.rowValue} ${styles.rowValueSoon}` : styles.rowValue}>{birthday}</span>
            </div>
          )}
          {filled.map(({ def, value }) => (
            <div key={def.id} className={styles.row}>
              <span className={def.sensitive ? `${styles.rowLabel} ${styles.sensitive}` : styles.rowLabel}>
                {def.sensitive && <LockIcon width={12} height={12} aria-label="Özel nitelikli veri" />}
                {def.label}
              </span>
              <span className={styles.rowValue}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
