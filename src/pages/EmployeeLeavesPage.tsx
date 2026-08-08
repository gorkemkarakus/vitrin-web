import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { TIME_OPTIONS } from '../lib/timeOptions'
import Avatar from '../components/Avatar'
import { CalendarIcon, ChevronRightIcon, PlusIcon, TrashIcon } from '../components/icons'
import styles from './EmployeeLeavesPage.module.css'

interface Employee {
  id: string
  full_name: string | null
}

interface TimeBlock {
  id: string
  profile_id: string
  day_of_week: number | null
  block_date: string | null
  end_date: string | null
  starts_at: string
  ends_at: string
  label: string | null
}

// LeaveDraft'ta "id" sadece istemci tarafinda React key + duzenleme takibi
// amacli — "blockId" doluysa DB'deki mevcut bir employee_time_blocks
// satirina karsilik gelir (kaydet'te update), bos ise henuz kaydedilmemis
// yeni bir izindir. Izinler day_of_week DEGIL block_date/end_date ile
// tutulur (tek gunluk ya da tarih araligi).
interface LeaveDraft {
  id: string
  blockId?: string
  mode: 'day' | 'range'
  date: string
  endDate: string
  allDay: boolean
  start: string
  end: string
  label: string
}

const LEAVE_REASON_OPTIONS: { value: 'yillik' | 'mazeret'; label: string }[] = [
  { value: 'yillik', label: 'Yıllık İzin' },
  { value: 'mazeret', label: 'Mazeret İzni' },
]

function todayLocalDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function EmployeeLeavesPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)

  // "duzenle -> Kaydet" mantigiyla calisiyor — leaveDrafts sunucudan sadece
  // BIR KERE (leaveReady false iken) dolduruluyor.
  const [leaveDrafts, setLeaveDrafts] = useState<LeaveDraft[]>([])
  const [leaveReady, setLeaveReady] = useState(false)
  const [savingLeaves, setSavingLeaves] = useState(false)
  const [leaveJsonCopied, setLeaveJsonCopied] = useState(false)

  const [leaveMode, setLeaveMode] = useState<'day' | 'range'>('day')
  const [leaveDate, setLeaveDate] = useState(todayLocalDateString())
  const [leaveEndDate, setLeaveEndDate] = useState('')
  const [leaveAllDay, setLeaveAllDay] = useState(true)
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState<'yillik' | 'mazeret'>('yillik')
  const [leaveLabel, setLeaveLabel] = useState('Yıllık İzin')

  async function loadData(silent = false) {
    if (!id) return
    if (!silent) setLoading(true)
    const [{ data: emp }, { data: blocks }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('id', id).maybeSingle(),
      supabase
        .from('employee_time_blocks')
        .select('id, profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label')
        .eq('profile_id', id),
    ])
    setEmployee(emp ?? null)
    setTimeBlocks(blocks ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (loading || leaveReady) return
    setLeaveDrafts(
      timeBlocks
        .filter((b) => b.day_of_week === null)
        .map((b) => ({
          id: b.id,
          blockId: b.id,
          mode: b.end_date && b.end_date !== b.block_date ? 'range' : 'day',
          date: b.block_date ?? '',
          endDate: b.end_date ?? b.block_date ?? '',
          allDay: b.starts_at.slice(0, 5) <= '00:05' && b.ends_at.slice(0, 5) >= '23:55',
          start: b.starts_at.slice(0, 5),
          end: b.ends_at.slice(0, 5),
          label: b.label ?? '',
        })),
    )
    setLeaveReady(true)
  }, [loading, leaveReady, timeBlocks])

  function addLeaveDraft() {
    if (!leaveDate) return
    if (!leaveAllDay && (!leaveStart || !leaveEnd)) return
    const newDraft: LeaveDraft = {
      id: crypto.randomUUID(),
      mode: leaveMode,
      date: leaveDate,
      endDate: leaveMode === 'range' ? leaveEndDate || leaveDate : leaveDate,
      allDay: leaveAllDay,
      start: leaveAllDay ? '00:00' : leaveStart,
      end: leaveAllDay ? '23:59' : leaveEnd,
      label: leaveLabel.trim(),
    }
    setLeaveDrafts((prev) => [...prev, newDraft])
    setLeaveMode('day')
    setLeaveDate(todayLocalDateString())
    setLeaveEndDate('')
    setLeaveAllDay(true)
    setLeaveStart('')
    setLeaveEnd('')
    setLeaveReason('yillik')
    setLeaveLabel('Yıllık İzin')
  }

  function removeLeaveDraft(draftId: string) {
    setLeaveDrafts((prev) => prev.filter((d) => d.id !== draftId))
  }

  function leavesJson() {
    return JSON.stringify(
      leaveDrafts.map((d) => ({
        baslangic: d.date,
        bitis: d.mode === 'range' ? d.endDate : d.date,
        tumGunKapali: d.allDay,
        baslangicSaati: d.allDay ? null : d.start,
        bitisSaati: d.allDay ? null : d.end,
        etiket: d.label || null,
      })),
      null,
      2,
    )
  }

  function copyLeavesJson() {
    navigator.clipboard.writeText(leavesJson())
    setLeaveJsonCopied(true)
    setTimeout(() => setLeaveJsonCopied(false), 2000)
  }

  async function saveLeaves() {
    if (!id) return
    setSavingLeaves(true)
    const keepIds = new Set(leaveDrafts.filter((d) => d.blockId).map((d) => d.blockId))
    const existingLeaveBlocks = timeBlocks.filter((b) => b.day_of_week === null)
    const ops: PromiseLike<unknown>[] = []
    for (const b of existingLeaveBlocks) {
      if (!keepIds.has(b.id)) ops.push(supabase.from('employee_time_blocks').delete().eq('id', b.id))
    }
    for (const d of leaveDrafts) {
      if (d.blockId) continue
      ops.push(
        supabase.from('employee_time_blocks').insert({
          profile_id: id,
          day_of_week: null,
          block_date: d.date,
          end_date: d.endDate || d.date,
          starts_at: d.start,
          ends_at: d.end,
          label: d.label || null,
        }),
      )
    }
    await Promise.all(ops)
    setLeaveReady(false)
    await loadData(true)
    setSavingLeaves(false)
  }

  if (loading) return <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>
  if (!employee) return <p style={{ color: 'var(--text-dim)' }}>Ekip üyesi bulunamadı.</p>

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate(`/ekip/${id}`)}>
        <ChevronRightIcon width={14} height={14} className={styles.backIcon} />
        {employee.full_name ?? 'Çalışana'} Dön
      </button>

      <div className={styles.pageHeader}>
        <Avatar name={employee.full_name ?? '?'} size={36} />
        <div>
          <h1 className={styles.pageTitle}>İzinli Günler</h1>
          <span className={styles.pageSubtitle}>{employee.full_name ?? '—'}</span>
        </div>
      </div>

      <div className="card">
        <p className={styles.subtitle}>Yıllık izin veya tek günlük kapanışları buradan tanımla. Bu günlerde randevu alınamaz.</p>

        <div className={styles.leaveModeToggle}>
          <button
            type="button"
            className={leaveMode === 'day' ? styles.leaveModeTabActive : styles.leaveModeTab}
            onClick={() => setLeaveMode('day')}
          >
            Tek gün
          </button>
          <button
            type="button"
            className={leaveMode === 'range' ? styles.leaveModeTabActive : styles.leaveModeTab}
            onClick={() => setLeaveMode('range')}
          >
            Tarih aralığı
          </button>
        </div>

        <div className={styles.leaveField}>
          <label>{leaveMode === 'range' ? 'Başlangıç Tarihi' : 'Tarih'}</label>
          <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
        </div>

        {leaveMode === 'range' && (
          <div className={styles.leaveField}>
            <label>Bitiş Tarihi</label>
            <input
              type="date"
              min={leaveDate || undefined}
              value={leaveEndDate}
              onChange={(e) => setLeaveEndDate(e.target.value)}
            />
          </div>
        )}

        <div className={styles.leaveAllDayRow}>
          <label className={styles.switch}>
            <input type="checkbox" checked={leaveAllDay} onChange={() => setLeaveAllDay((v) => !v)} />
            <span className={styles.switchTrack} />
          </label>
          <span>Tüm gün kapalı</span>
        </div>

        {!leaveAllDay && (
          <div className={styles.timeRow} style={{ marginBottom: 16 }}>
            <div className={styles.timeField}>
              <label>Başlangıç</label>
              <select value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)}>
                <option value="">--:--</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <span className={styles.timeSep}>–</span>
            <div className={styles.timeField}>
              <label>Bitiş</label>
              <select value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)}>
                <option value="">--:--</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className={styles.leaveReasonRow}>
          {LEAVE_REASON_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={leaveReason === opt.value ? styles.leaveReasonChipActive : styles.leaveReasonChip}
              onClick={() => {
                setLeaveReason(opt.value)
                setLeaveLabel(opt.label)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className={styles.leaveLabelField}>
          <label>Etiket (opsiyonel)</label>
          <input value={leaveLabel} onChange={(e) => setLeaveLabel(e.target.value)} placeholder="ör. Yıllık İzin" />
        </div>

        <button type="button" className={`btn-primary ${styles.addLeaveBtn}`} onClick={addLeaveDraft}>
          <PlusIcon width={15} height={15} /> İzin Ekle
        </button>

        <div className={styles.leaveListLabel}>Tanımlı İzinler</div>

        {leaveDrafts.length === 0 ? (
          <div className={styles.leaveEmpty}>
            <CalendarIcon width={22} height={22} />
            Henüz izin günü eklenmedi.
          </div>
        ) : (
          <div className={styles.leaveList}>
            {leaveDrafts.map((d) => (
              <div className={styles.leaveRow} key={d.id}>
                <div>
                  <div className={styles.leaveRowDate}>
                    {d.mode === 'range' && d.endDate !== d.date
                      ? `${new Date(d.date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${new Date(d.endDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`
                      : new Date(d.date + 'T00:00:00').toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                  </div>
                  <div className={styles.leaveRowMeta}>
                    {d.allDay ? 'Tüm gün kapalı' : `${d.start} – ${d.end}`}
                    {d.label ? ` • ${d.label}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.leaveRemoveBtn}
                  onClick={() => removeLeaveDraft(d.id)}
                  aria-label="İzni kaldır"
                >
                  <TrashIcon width={13} height={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.leaveFooter}>
          <span className={styles.leaveFooterSummary}>
            {leaveDrafts.length === 0 ? 'İzin tanımlı değil' : `${leaveDrafts.length} izin tanımlı`}
          </span>
          <div className={styles.leaveFooterActions}>
            <button type="button" className={styles.jsonLink} onClick={copyLeavesJson}>
              {leaveJsonCopied ? 'Kopyalandı ✓' : 'JSON çıktısı'}
            </button>
            <button type="button" className={`btn-primary ${styles.saveBtn}`} onClick={saveLeaves} disabled={savingLeaves}>
              {savingLeaves ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
