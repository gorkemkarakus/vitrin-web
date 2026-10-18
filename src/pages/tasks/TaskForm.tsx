import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Select from '../../components/Select'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { friendlyDbError } from '../../lib/dbErrors'
import { matchesSearch } from '../../lib/search'
import { quickDates } from '../../lib/tasks'
import styles from './Tasks.module.css'

interface CustomerOption {
  id: string
  full_name: string
  phone: string | null
}

// Yeni gorev. Musteri kartindan acilinca musteri sabittir (customer verilir).
export default function TaskForm({
  customer,
  team,
  onSaved,
  title: heading = 'Yeni görev',
}: {
  customer?: { id: string; full_name: string } | null
  team: { id: string; full_name: string | null }[]
  onSaved: () => void
  title?: string
}) {
  const { profile } = useAuth()
  const dates = useMemo(() => quickDates(), [])
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [dueDate, setDueDate] = useState(dates[1].value)
  const [dueTime, setDueTime] = useState('')
  const [assignee, setAssignee] = useState<string>(profile?.id ?? '')
  const [picked, setPicked] = useState<{ id: string; full_name: string } | null>(customer ?? null)
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<CustomerOption[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Musteri arama listesi yalnizca musteri sabit degilse ve yazmaya baslayinca yuklenir.
  useEffect(() => {
    if (customer || customers || !query) return
    supabase
      .from('customers')
      .select('id, full_name, phone')
      .order('full_name')
      .limit(2000)
      .then(({ data }) => setCustomers((data ?? []) as CustomerOption[]))
  }, [customer, customers, query])

  const results = useMemo(
    () => (query && customers ? customers.filter((c) => matchesSearch(query, c.full_name, c.phone)).slice(0, 8) : []),
    [query, customers],
  )

  const assigneeOptions = [
    { value: '', label: 'Atanmamış (ekipten biri)' },
    ...team.map((m) => ({
      value: m.id,
      label: m.id === profile?.id ? `${m.full_name ?? 'Ben'} (ben)` : (m.full_name ?? 'Çalışan'),
    })),
  ]

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile?.business_id || !title.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('tasks').insert({
      business_id: profile.business_id,
      customer_id: picked?.id ?? null,
      title: title.trim(),
      note: note.trim() || null,
      due_date: dueDate,
      due_time: dueTime || null,
      assignee_id: assignee || null,
      created_by: profile.id,
    })
    setSaving(false)
    if (err) {
      setError(friendlyDbError(err, 'Görev eklenemedi, lütfen tekrar deneyin.'))
      return
    }
    setTitle('')
    setNote('')
    setDueTime('')
    if (!customer) {
      setPicked(null)
      setQuery('')
    }
    onSaved()
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label={heading}>
      <span className={styles.formTitle}>{heading}</span>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="taskTitle">
          Ne yapılacak
        </label>
        <input
          id="taskTitle"
          className={styles.input}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={customer ? 'ör. Arayıp boya randevusunu hatırlat' : 'ör. Ayşe Demir’i ara, randevu ver'}
          required
        />
      </div>

      {!customer && (
        <div className={styles.field}>
          <span className={styles.label}>Müşteri (isteğe bağlı)</span>
          {picked ? (
            <div className={styles.picked}>
              {picked.full_name}
              <button type="button" className={styles.metaLink} onClick={() => setPicked(null)}>
                Değiştir
              </button>
            </div>
          ) : (
            <div className={styles.search}>
              <input
                className={styles.input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="İsim veya telefon ara"
                aria-label="Müşteri ara"
              />
              {results.length > 0 && (
                <div className={styles.results} role="listbox">
                  {results.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      role="option"
                      aria-selected={false}
                      className={styles.result}
                      onClick={() => {
                        setPicked({ id: c.id, full_name: c.full_name })
                        setQuery('')
                      }}
                    >
                      {c.full_name}
                      <span className={styles.resultSub}>{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className={styles.field}>
        <span className={styles.label}>Ne zaman</span>
        <div className={styles.chips}>
          {dates.map((d) => (
            <button
              type="button"
              key={d.label}
              className={dueDate === d.value ? styles.chipActive : styles.chip}
              onClick={() => setDueDate(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className={styles.inline}>
          <input
            className={styles.input}
            type="date"
            value={dueDate}
            onChange={(e) => e.target.value && setDueDate(e.target.value)}
            aria-label="Tarih"
            required
          />
          <input
            className={styles.input}
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            aria-label="Saat (isteğe bağlı)"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="taskAssignee">
          Kim yapacak
        </label>
        <Select id="taskAssignee" value={assignee} onChange={setAssignee} options={assigneeOptions} />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="taskNote">
          Not (isteğe bağlı)
        </label>
        <textarea
          id="taskNote"
          className={`${styles.input} ${styles.textarea}`}
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" className={styles.submit} disabled={saving || !title.trim()}>
        {saving ? 'Ekleniyor…' : 'Görevi ekle'}
      </button>
    </form>
  )
}
