import Avatar from '../../components/Avatar'
import type { PublicEmployee } from '../lib/publicBookingApi'
import styles from '../PublicBookingPage.module.css'

export default function EmployeePicker({
  employees,
  selectedId,
  onSelect,
}: {
  employees: PublicEmployee[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  return (
    <div className={styles.stepBody}>
      <button
        type="button"
        className={selectedId === null ? styles.noPreferenceCardActive : styles.noPreferenceCard}
        onClick={() => onSelect(null)}
      >
        <span className={styles.noPreferenceIcon}>✦</span>
        <span className={styles.noPreferenceText}>
          <span className={styles.noPreferenceTitle}>Fark Etmez</span>
          <span className={styles.noPreferenceSub}>En yakın uygun uzman</span>
        </span>
      </button>

      {employees.length > 0 && (
        <div className={styles.employeeList}>
          {employees.map((e) => (
            <button
              key={e.id}
              type="button"
              className={e.id === selectedId ? styles.employeeCardActive : styles.employeeCard}
              onClick={() => onSelect(e.id)}
            >
              <Avatar name={e.full_name} size={40} />
              <span className={styles.employeeText}>
                <span className={styles.employeeName}>{e.full_name}</span>
                {e.specialty && <span className={styles.employeeSpecialty}>{e.specialty}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
