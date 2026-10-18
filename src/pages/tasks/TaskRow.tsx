import { useNavigate } from 'react-router-dom'
import { CheckCircleIcon } from '../../components/icons'
import { bucketOf, dueLabel, type Task } from '../../lib/tasks'
import styles from './Tasks.module.css'

// Tek gorev satiri: tamamla, son tarih, musteri, atanan kisi, ertele/sil.
export default function TaskRow({
  task,
  assigneeName,
  showCustomer = true,
  canDelete,
  onToggle,
  onPostpone,
  onDelete,
}: {
  task: Task
  assigneeName: string | null
  showCustomer?: boolean
  canDelete: boolean
  onToggle: (task: Task) => void
  onPostpone?: (task: Task) => void
  onDelete?: (task: Task) => void
}) {
  const navigate = useNavigate()
  const done = task.status === 'tamamlandi'
  const late = !done && bucketOf(task) === 'geciken'

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={done ? `${styles.check} ${styles.checkDone}` : styles.check}
        onClick={() => onToggle(task)}
        aria-label={done ? `${task.title}: tamamlanmadı olarak işaretle` : `${task.title}: tamamlandı olarak işaretle`}
        aria-pressed={done}
      >
        <CheckCircleIcon width={16} height={16} />
      </button>
      <div className={styles.rowMain}>
        <span className={done ? `${styles.rowTitle} ${styles.rowTitleDone}` : styles.rowTitle}>{task.title}</span>
        {task.note && !done && <span className={styles.rowNote}>{task.note}</span>}
        <span className={styles.rowMeta}>
          <span className={late ? styles.metaLate : undefined}>{dueLabel(task)}</span>
          {showCustomer && task.customer && (
            <button
              type="button"
              className={styles.metaLink}
              onClick={() => navigate(`/musteriler/${task.customer!.id}`)}
            >
              {task.customer.full_name}
            </button>
          )}
          <span>{assigneeName ?? 'Atanmamış'}</span>
        </span>
      </div>
      {!done && (
        <div className={styles.rowActions}>
          {onPostpone && (
            <button type="button" className={styles.rowAction} onClick={() => onPostpone(task)}>
              Yarına ertele
            </button>
          )}
          {canDelete && onDelete && (
            <button type="button" className={styles.rowAction} onClick={() => onDelete(task)}>
              Sil
            </button>
          )}
        </div>
      )}
    </div>
  )
}
