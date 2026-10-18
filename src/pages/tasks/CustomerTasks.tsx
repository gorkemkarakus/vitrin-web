import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchOpenTasks, setTaskStatus, type Task } from '../../lib/tasks'
import TaskRow from './TaskRow'
import TaskForm from './TaskForm'
import styles from './Tasks.module.css'

// Musteri kartinda: bu musteriye ait acik gorevler + yeni gorev.
export default function CustomerTasks({ customer }: { customer: { id: string; full_name: string } }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [tasks, setTasks] = useState<Task[]>([])
  const [team, setTeam] = useState<{ id: string; full_name: string | null }[]>([])
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setTasks(await fetchOpenTasks({ customerId: customer.id }))
    } catch {
      setTasks([])
    }
  }, [customer.id])

  useEffect(() => {
    void load()
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setTeam(data ?? []))
  }, [load])

  const nameOf = useMemo(() => new Map(team.map((m) => [m.id, m.full_name])), [team])

  async function toggle(task: Task) {
    await setTaskStatus(task.id, 'tamamlandi')
    void load()
  }

  return (
    <section className={styles.card} aria-labelledby="customerTasksTitle">
      <div className={styles.cardHead}>
        <h2 id="customerTasksTitle" className={styles.cardTitle}>
          Görevler {tasks.length > 0 && <span className={styles.count}>· {tasks.length}</span>}
        </h2>
        <button type="button" className={styles.linkBtn} onClick={() => setAdding((v) => !v)}>
          {adding ? 'Vazgeç' : '+ Görev'}
        </button>
      </div>
      {tasks.length === 0 && !adding && (
        <p className={styles.rowNote}>Açık görev yok. Arama, hatırlatma gibi takipleri buraya ekleyebilirsin.</p>
      )}
      {tasks.length > 0 && (
        <div className={styles.cardList}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              showCustomer={false}
              assigneeName={t.assignee_id ? (nameOf.get(t.assignee_id) ?? 'Çalışan') : null}
              canDelete={isAdmin || t.created_by === profile?.id}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
      {adding && (
        <TaskForm
          customer={customer}
          team={team}
          title="Bu müşteri için görev"
          onSaved={() => {
            setAdding(false)
            void load()
          }}
        />
      )}
    </section>
  )
}
