import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLayout } from '../lib/layout'
import { friendlyDbError } from '../lib/dbErrors'
import { toLocalDateString } from '../lib/date'
import {
  BUCKET_LABEL,
  bucketOf,
  fetchOpenTasks,
  fetchRecentlyDone,
  setTaskStatus,
  type Bucket,
  type Task,
} from '../lib/tasks'
import TaskRow from './tasks/TaskRow'
import TaskForm from './tasks/TaskForm'
import pageStyles from './CustomerDetailPage.module.css'
import styles from './tasks/Tasks.module.css'
import { askConfirm } from '../lib/dialog'

const BUCKETS: Bucket[] = ['geciken', 'bugun', 'yaklasan', 'sonra']

// "Bugun yapilacaklar": bana dusen (bana atanmis ya da atanmamis) ya da
// ekibin tum acik gorevleri; son 7 gunde tamamlananlar altta.
export default function TasksPage() {
  const { profile } = useAuth()
  const { isWide } = useLayout()
  const isAdmin = profile?.role === 'admin'
  const [scope, setScope] = useState<'benim' | 'hepsi'>('benim')
  const [open, setOpen] = useState<Task[] | null>(null)
  const [done, setDone] = useState<Task[]>([])
  const [showDone, setShowDone] = useState(false)
  const [team, setTeam] = useState<{ id: string; full_name: string | null }[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [o, d] = await Promise.all([fetchOpenTasks(), fetchRecentlyDone()])
      setOpen(o)
      setDone(d)
      setError(null)
    } catch (e) {
      setError(friendlyDbError(e, 'Görevler yüklenemedi.'))
    }
  }, [])

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
  const mine = (t: Task) => !t.assignee_id || t.assignee_id === profile?.id
  const visible = (open ?? []).filter((t) => scope === 'hepsi' || mine(t))
  const grouped = BUCKETS.map((b) => ({ bucket: b, items: visible.filter((t) => bucketOf(t) === b) })).filter(
    (g) => g.items.length > 0,
  )
  const dueNow = visible.filter((t) => bucketOf(t) === 'geciken' || bucketOf(t) === 'bugun').length

  async function toggle(task: Task) {
    const { error: err } = await setTaskStatus(task.id, task.status === 'tamamlandi' ? 'acik' : 'tamamlandi')
    if (err) setError(friendlyDbError(err, 'Güncellenemedi.'))
    void load()
  }

  async function postpone(task: Task) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const { error: err } = await supabase
      .from('tasks')
      .update({ due_date: toLocalDateString(tomorrow) })
      .eq('id', task.id)
    if (err) setError(friendlyDbError(err, 'Ertelenemedi.'))
    void load()
  }

  async function remove(task: Task) {
    if (
      !(await askConfirm({
        title: 'Görev silinsin mi?',
        message: `“${task.title}”`,
        confirmLabel: 'Sil',
        danger: true,
      }))
    )
      return
    const { error: err } = await supabase.from('tasks').delete().eq('id', task.id)
    if (err) setError(friendlyDbError(err, 'Silinemedi.'))
    void load()
  }

  const row = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      assigneeName={t.assignee_id ? (nameOf.get(t.assignee_id) ?? 'Çalışan') : null}
      canDelete={isAdmin || t.created_by === profile?.id}
      onToggle={toggle}
      onPostpone={postpone}
      onDelete={remove}
    />
  )

  const form = (
    <TaskForm
      team={team}
      onSaved={() => {
        setFormOpen(false)
        void load()
      }}
    />
  )

  const list = (
    <div className={styles.column}>
      <div className={styles.scope} role="tablist" aria-label="Kimin görevleri">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'benim'}
          className={scope === 'benim' ? styles.scopeBtnActive : styles.scopeBtn}
          onClick={() => setScope('benim')}
        >
          Bana düşenler
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'hepsi'}
          className={scope === 'hepsi' ? styles.scopeBtnActive : styles.scopeBtn}
          onClick={() => setScope('hepsi')}
        >
          Tüm ekip
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!open && !error && <p className={styles.empty}>Yükleniyor…</p>}
      {open && grouped.length === 0 && (
        <p className={styles.empty}>
          Açık görev yok. Takip etmek istediğin işleri — bir müşteriyi aramak, ürün siparişi vermek — buradan ya da
          müşteri kartından ekleyebilirsin.
        </p>
      )}
      {grouped.map((g) => (
        <section key={g.bucket} className={styles.section} aria-label={BUCKET_LABEL[g.bucket]}>
          <span
            className={g.bucket === 'geciken' ? `${styles.sectionHead} ${styles.sectionHeadLate}` : styles.sectionHead}
          >
            {BUCKET_LABEL[g.bucket]} <span className={styles.count}>{g.items.length}</span>
          </span>
          <div className={styles.list}>{g.items.map(row)}</div>
        </section>
      ))}

      {done.length > 0 && (
        <>
          <button type="button" className={styles.doneToggle} onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Tamamlananları gizle' : `Son 7 günde tamamlanan ${done.length} görev`}
          </button>
          {showDone && <div className={styles.list}>{done.map(row)}</div>}
        </>
      )}
    </div>
  )

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Görevler"
        sub={open ? (dueNow > 0 ? `Bugün ve geciken: ${dueNow}` : 'Bugün için iş yok') : undefined}
        action={
          !isWide && (
            <button type="button" className="hdr-btn-navy" onClick={() => setFormOpen(true)}>
              + Görev
            </button>
          )
        }
      />
      {isWide ? (
        <div className={styles.grid}>
          {list}
          {form}
        </div>
      ) : (
        list
      )}

      {!isWide && formOpen && (
        <div className={pageStyles.modalBackdrop} onClick={() => setFormOpen(false)}>
          <div className={`card ${pageStyles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={pageStyles.modalHead}>
              <span />
              <button
                type="button"
                className={pageStyles.modalClose}
                onClick={() => setFormOpen(false)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>
            {form}
          </div>
        </div>
      )}
    </div>
  )
}
