import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { TIME_OPTIONS } from '../lib/timeOptions'
import Avatar, { colorForName } from '../components/Avatar'
import { ChevronRightIcon, PhoneIcon, TrashIcon } from '../components/icons'
import styles from './EmployeeDetailPage.module.css'

interface Category {
  id: string
  name: string
}

interface Employee {
  id: string
  full_name: string | null
  role: 'admin' | 'user'
  is_active: boolean
  whatsapp_phone: string | null
}

interface EmployeeCategory {
  profile_id: string
  category_id: string
}

interface Schedule {
  id: string
  profile_id: string
  day_of_week: number
  starts_at: string
  ends_at: string
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

const DAY_LABELS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const WEEKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [6, 0]

const STATUS_LABEL: Record<'aktif' | 'izinli' | 'pasif', string> = {
  aktif: 'Aktif',
  izinli: 'İzinli',
  pasif: 'Pasif',
}

function todayLocalDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function roleLabel(role: Employee['role']) {
  return role === 'admin' ? 'Yönetici' : 'Çalışan'
}

function formatPhone(raw: string) {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length === 12) digits = digits.slice(2)
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1)
  if (digits.length !== 10) return raw
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [employeeCategories, setEmployeeCategories] = useState<EmployeeCategory[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [loading, setLoading] = useState(true)

  const [draftDays, setDraftDays] = useState<Set<number>>(new Set())
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')

  const [blockMode, setBlockMode] = useState<'day' | 'date'>('day')
  const [blockDay, setBlockDay] = useState(1)
  const [blockDate, setBlockDate] = useState('')
  const [blockEndDate, setBlockEndDate] = useState('')
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockLabel, setBlockLabel] = useState('')

  async function loadData(silent = false) {
    if (!id) return
    if (!silent) setLoading(true)
    const [{ data: emp }, { data: cats }, { data: empCats }, { data: scheds }, { data: blocks }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, is_active, whatsapp_phone').eq('id', id).maybeSingle(),
      supabase.from('service_categories').select('id, name').order('name'),
      supabase.from('employee_categories').select('profile_id, category_id').eq('profile_id', id),
      supabase.from('employee_schedules').select('id, profile_id, day_of_week, starts_at, ends_at').eq('profile_id', id),
      supabase
        .from('employee_time_blocks')
        .select('id, profile_id, day_of_week, block_date, end_date, starts_at, ends_at, label')
        .eq('profile_id', id),
    ])
    setEmployee(emp ?? null)
    setCategories(cats ?? [])
    setEmployeeCategories(empCats ?? [])
    setSchedules(scheds ?? [])
    setTimeBlocks(blocks ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const today = useMemo(() => todayLocalDateString(), [])

  async function toggleActive(active: boolean) {
    if (!id) return
    await supabase.from('profiles').update({ is_active: active }).eq('id', id)
    await loadData(true)
  }

  async function toggleCategory(categoryId: string, checked: boolean) {
    if (!id) return
    if (checked) {
      await supabase.from('employee_categories').insert({ profile_id: id, category_id: categoryId })
    } else {
      await supabase.from('employee_categories').delete().eq('profile_id', id).eq('category_id', categoryId)
    }
    await loadData(true)
  }

  function applyDraftPreset(preset: number[]) {
    setDraftDays(new Set(preset))
  }

  function toggleDraftDay(day: number) {
    const days = new Set(draftDays)
    if (days.has(day)) days.delete(day)
    else days.add(day)
    setDraftDays(days)
  }

  async function addSchedules() {
    if (!id || draftDays.size === 0 || !draftStart || !draftEnd) return
    await Promise.all(
      Array.from(draftDays).map((day) => {
        const existing = schedules.find((s) => s.day_of_week === day)
        if (existing) {
          return supabase.from('employee_schedules').update({ starts_at: draftStart, ends_at: draftEnd }).eq('id', existing.id)
        }
        return supabase.from('employee_schedules').insert({
          profile_id: id,
          day_of_week: day,
          starts_at: draftStart,
          ends_at: draftEnd,
        })
      }),
    )
    setDraftDays(new Set())
    setDraftStart('')
    setDraftEnd('')
    await loadData(true)
  }

  async function removeSchedule(scheduleId: string) {
    await supabase.from('employee_schedules').delete().eq('id', scheduleId)
    await loadData(true)
  }

  async function addBlock() {
    if (!id || !blockStart || !blockEnd) return
    if (blockMode === 'date' && !blockDate) return
    await supabase.from('employee_time_blocks').insert({
      profile_id: id,
      day_of_week: blockMode === 'day' ? blockDay : null,
      block_date: blockMode === 'date' ? blockDate : null,
      end_date: blockMode === 'date' ? blockEndDate || blockDate : null,
      starts_at: blockStart,
      ends_at: blockEnd,
      label: blockLabel.trim() || null,
    })
    setBlockMode('day')
    setBlockDay(1)
    setBlockDate('')
    setBlockEndDate('')
    setBlockStart('')
    setBlockEnd('')
    setBlockLabel('')
    await loadData(true)
  }

  async function removeBlock(blockId: string) {
    await supabase.from('employee_time_blocks').delete().eq('id', blockId)
    await loadData(true)
  }

  if (loading) return <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>
  if (!employee) return <p style={{ color: 'var(--text-dim)' }}>Ekip üyesi bulunamadı.</p>

  const status: 'aktif' | 'izinli' | 'pasif' = !employee.is_active
    ? 'pasif'
    : timeBlocks.some((b) => b.block_date !== null && b.block_date <= today && today <= (b.end_date ?? b.block_date))
      ? 'izinli'
      : 'aktif'

  const empCategoryIds = new Set(employeeCategories.map((ec) => ec.category_id))

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate('/ekip')}>
        <ChevronRightIcon width={14} height={14} className={styles.backIcon} />
        Ekibe Dön
      </button>

      <div className={`card ${styles.headerCard}`}>
        <Avatar name={employee.full_name ?? '?'} size={56} />
        <div className={styles.headerInfo}>
          <span className={styles.headerName}>{employee.full_name ?? '—'}</span>
          <span className={styles.headerLine}>{roleLabel(employee.role)}</span>
          {employee.whatsapp_phone && (
            <span className={styles.headerLine}>
              <PhoneIcon width={12} height={12} />
              {formatPhone(employee.whatsapp_phone)}
            </span>
          )}
        </div>
        <span className={`${styles.statusPill} ${styles[`statusPill_${status}`]}`}>{STATUS_LABEL[status]}</span>
      </div>

      {employee.id !== profile?.id && employee.role !== 'admin' && (
        <div className={`card ${styles.activeToggleRow}`}>
          <span>
            Durum: <strong>{employee.is_active ? 'Aktif' : 'Pasif'}</strong>
          </span>
          <button type="button" className="btn-secondary" onClick={() => toggleActive(!employee.is_active)}>
            {employee.is_active ? 'Pasife Al' : 'Aktifleştir'}
          </button>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Alanlar</h2>
        <div className={styles.categoryCheckboxes}>
          {categories.map((c) => {
            const active = empCategoryIds.has(c.id)
            return (
              <button
                type="button"
                key={c.id}
                className={active ? styles.categoryChipActive : styles.categoryChip}
                onClick={() => toggleCategory(c.id, !active)}
              >
                {active ? '✓ ' : ''}
                {c.name}
              </button>
            )
          })}
          {categories.length === 0 && <span className={styles.empty}>Önce bir alan ekleyin.</span>}
        </div>

        {empCategoryIds.size > 0 && (
          <div className={styles.employeeTags}>
            {categories
              .filter((c) => empCategoryIds.has(c.id))
              .map((c) => (
                <span key={c.id} className={styles.hashtag} style={{ color: colorForName(c.name) }}>
                  #{c.name.replace(/\s+/g, '')}
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className={styles.scheduleHeadRow}>
          <h2 style={{ marginBottom: 0 }}>Haftalık Çalışma Saatleri</h2>
          <div className={styles.presetRow}>
            <button type="button" className="btn-secondary" onClick={() => applyDraftPreset(WEEKDAYS)}>
              Hafta İçi
            </button>
            <button type="button" className="btn-secondary" onClick={() => applyDraftPreset(WEEKEND)}>
              Hafta Sonu
            </button>
          </div>
        </div>

        {schedules.length > 0 && (
          <div className={styles.existingSchedules}>
            {WEEK_ORDER.map((day) => {
              const s = schedules.find((s) => s.day_of_week === day)
              if (!s) return null
              return (
                <div className={styles.scheduleRow} key={s.id}>
                  <span>
                    <strong>{DAY_SHORT[s.day_of_week]}</strong> {s.starts_at.slice(0, 5)} – {s.ends_at.slice(0, 5)}
                  </span>
                  <button onClick={() => removeSchedule(s.id)}>Kaldır</button>
                </div>
              )
            })}
          </div>
        )}

        <div className={styles.presetRow}>
          <button type="button" className="btn-secondary" onClick={() => applyDraftPreset(WEEK_ORDER)}>
            Her Gün
          </button>
          <button type="button" className="btn-secondary" onClick={() => applyDraftPreset([])}>
            Temizle
          </button>
        </div>

        <div className={styles.dayChipRow}>
          {WEEK_ORDER.map((day) => (
            <button
              type="button"
              key={day}
              className={draftDays.has(day) ? styles.dayChipActive : styles.dayChip}
              onClick={() => toggleDraftDay(day)}
            >
              {DAY_SHORT[day]}
            </button>
          ))}
        </div>

        <div className={styles.timeRow}>
          <div className={styles.timeField}>
            <label>Başlangıç</label>
            <select value={draftStart} onChange={(e) => setDraftStart(e.target.value)}>
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
            <select value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)}>
              <option value="">--:--</option>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary" onClick={addSchedules}>
            {draftDays.size > 1 ? `${draftDays.size} güne ekle` : 'Ekle'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Bloke Saatler (Mola/Eğitim/İzin)</h2>

        {timeBlocks.length > 0 && (
          <div className={styles.existingSchedules}>
            {timeBlocks.map((b) => (
              <div className={styles.blockRow} key={b.id}>
                <span>
                  <strong>
                    {b.day_of_week !== null
                      ? DAY_SHORT[b.day_of_week]
                      : b.end_date && b.end_date !== b.block_date
                        ? `${new Date(b.block_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${new Date(b.end_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}`
                        : new Date(b.block_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </strong>{' '}
                  {b.starts_at.slice(0, 5)} – {b.ends_at.slice(0, 5)}
                  {b.label ? ` (${b.label})` : ''}
                </span>
                <button className={styles.blockRemove} onClick={() => removeBlock(b.id)} aria-label="Bloke saati kaldır">
                  <TrashIcon width={13} height={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.blockForm}>
          <div className={styles.blockModeRow}>
            <button
              type="button"
              className={blockMode === 'day' ? styles.dayChipActive : styles.dayChip}
              onClick={() => setBlockMode('day')}
            >
              Her hafta
            </button>
            <button
              type="button"
              className={blockMode === 'date' ? styles.dayChipActive : styles.dayChip}
              onClick={() => setBlockMode('date')}
            >
              Tarih Aralığı
            </button>
          </div>

          {blockMode === 'day' ? (
            <div className={styles.timeField}>
              <label>Gün</label>
              <select value={blockDay} onChange={(e) => setBlockDay(Number(e.target.value))}>
                {WEEK_ORDER.map((day) => (
                  <option key={day} value={day}>
                    {DAY_LABELS[day]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={styles.timeRow}>
              <div className={styles.timeField}>
                <label>Başlangıç Tarihi</label>
                <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} />
              </div>
              <span className={styles.timeSep}>–</span>
              <div className={styles.timeField}>
                <label>Bitiş Tarihi (opsiyonel — yıllık izin gibi çok günlük bloklar için)</label>
                <input
                  type="date"
                  min={blockDate || undefined}
                  value={blockEndDate}
                  onChange={(e) => setBlockEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className={styles.timeRow}>
            <div className={styles.timeField}>
              <label>Başlangıç</label>
              <select value={blockStart} onChange={(e) => setBlockStart(e.target.value)}>
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
              <select value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)}>
                <option value="">--:--</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setBlockStart(TIME_OPTIONS[0])
                setBlockEnd(TIME_OPTIONS[TIME_OPTIONS.length - 1])
              }}
            >
              Tüm Gün
            </button>
          </div>

          <input
            className={styles.blockLabelInput}
            placeholder="Etiket (ör. Öğle Molası, Eğitim)"
            value={blockLabel}
            onChange={(e) => setBlockLabel(e.target.value)}
          />

          <button type="button" className={styles.dashedAddBtn} onClick={addBlock}>
            + Bloke Saat Ekle
          </button>
        </div>
      </div>
    </div>
  )
}
