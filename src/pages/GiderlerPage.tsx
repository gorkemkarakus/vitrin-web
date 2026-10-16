import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ConfirmModal from '../components/ConfirmModal'
import PageHeader from '../components/PageHeader'
import PickerSheet from '../components/PickerSheet'
import { CalendarIcon } from '../components/icons'
import { currency } from '../lib/currency'
import { toLocalDateString, presetDateRange, type DateRangePreset, DAY_MS } from '../lib/date'
import styles from './GiderlerPage.module.css'

interface Expense {
  id: string
  description: string
  amount: number
  expense_date: string
  due_date: string | null
  is_recurring: boolean
  is_paid: boolean
  // Eski kurulumlarda bu sutunlar olmayabilir; ekran onlarsiz da calisir.
  category?: string | null
  payment_method?: string | null
}

type Preset = DateRangePreset
const presetRange = presetDateRange

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'bugun', label: 'Bugün' },
  { value: 'bu_hafta', label: 'Bu hafta' },
  { value: 'bu_ay', label: 'Bu ay' },
  { value: 'gecen_ay', label: 'Geçen ay' },
]

const CATEGORIES = ['Kira', 'Malzeme', 'Fatura', 'Maaş', 'Vergi', 'Diğer']
const METHODS = [
  { value: 'nakit', label: 'Nakit' },
  { value: 'kart', label: 'Kart' },
  { value: 'havale', label: 'Havale' },
  { value: 'diger', label: 'Diğer' },
]

type StatusFilter = 'tumu' | 'odenmemis' | 'geciken' | 'aylik'

function shortDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

// Ayni uzunluktaki bir onceki donem (karsilastirma satiri icin).
function previousRange(start: string, end: string) {
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  const days = Math.round((e.getTime() - s.getTime()) / DAY_MS) + 1
  const pe = new Date(s)
  pe.setDate(pe.getDate() - 1)
  const ps = new Date(pe)
  ps.setDate(ps.getDate() - days + 1)
  return { start: toLocalDateString(ps), end: toLocalDateString(pe) }
}

function isMissingColumn(message: string | undefined) {
  return !!message && /column|schema cache/i.test(message)
}

export default function GiderlerPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // Kasa'daki gider kutusu secili donemi ?start&end ile tasiyor.
  const initialStart = searchParams.get('start')
  const initialEnd = searchParams.get('end')

  const [preset, setPreset] = useState<Preset>(initialStart && initialEnd ? 'ozel' : 'bu_ay')
  const [rangeStart, setRangeStart] = useState(() => initialStart || presetRange('bu_ay').start)
  const [rangeEnd, setRangeEnd] = useState(() => initialEnd || presetRange('bu_ay').end)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [prevTotal, setPrevTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('Tümü')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('tumu')
  const [rowMenu, setRowMenu] = useState<Expense | null>(null)
  const [paidConfirm, setPaidConfirm] = useState<{ id: string; description: string; next: boolean } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; description: string } | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [expenseDesc, setExpenseDesc] = useState('')
  const [expenseCategory, setExpenseCategory] = useState('')
  const [expenseMethod, setExpenseMethod] = useState('nakit')
  const [methodPickerOpen, setMethodPickerOpen] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => toLocalDateString(new Date()))
  const [expenseDueDate, setExpenseDueDate] = useState('')
  const [expenseRecurring, setExpenseRecurring] = useState(false)
  const [expensePaid, setExpensePaid] = useState(true)
  const [addingExpense, setAddingExpense] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function applyPreset(p: Preset) {
    setPreset(p)
    const { start, end } = presetRange(p)
    setRangeStart(start)
    setRangeEnd(end)
    setPeriodOpen(false)
  }

  async function loadAll() {
    setLoading(true)
    const prev = previousRange(rangeStart, rangeEnd)
    // select('*'): kategori/odeme sekli kolonlari varsa gelsin, yoksa sorgu bozulmasin.
    const [{ data: exps }, { data: prevExps }] = await Promise.all([
      supabase
        .from('business_expenses')
        .select('*')
        .gte('expense_date', rangeStart)
        .lte('expense_date', rangeEnd)
        .order('expense_date', { ascending: false }),
      supabase.from('business_expenses').select('amount').gte('expense_date', prev.start).lte('expense_date', prev.end),
    ])
    setExpenses((exps ?? []) as Expense[])
    setPrevTotal(prevExps ? prevExps.reduce((sum, e) => sum + (e.amount as number), 0) : null)
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd])

  // "+ > Gider ekle" ve Kasa'daki "Gider ekle" buraya ?yeni=1 ile dusuyor.
  useEffect(() => {
    if (searchParams.get('yeni') === '1') {
      setAddOpen(true)
      searchParams.delete('yeni')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function addExpense(e: FormEvent) {
    e.preventDefault()
    if (!profile?.business_id) return
    const amount = Number(expenseAmount)
    const description = expenseDesc.trim() || expenseCategory
    if (!description || !amount || amount < 0) {
      setAddError('Tutar ve açıklama (ya da kategori) gerekli.')
      return
    }
    setAddingExpense(true)
    setAddError(null)
    const base = {
      business_id: profile.business_id,
      description,
      amount,
      expense_date: expenseDate,
      due_date: expenseDueDate || null,
      is_recurring: expenseRecurring,
      is_paid: expensePaid,
    }
    let { error } = await supabase
      .from('business_expenses')
      .insert({ ...base, category: expenseCategory || null, payment_method: expensePaid ? expenseMethod : null })
    // Kategori kolonlari henuz veritabaninda yoksa onlarsiz kaydet.
    if (error && isMissingColumn(error.message)) {
      ;({ error } = await supabase.from('business_expenses').insert(base))
    }
    if (error) {
      setAddError('Gider kaydedilemedi: ' + error.message)
      setAddingExpense(false)
      return
    }
    setExpenseDesc('')
    setExpenseCategory('')
    setExpenseAmount('')
    setExpenseDueDate('')
    setExpenseRecurring(false)
    setExpensePaid(true)
    await loadAll()
    setAddingExpense(false)
    setAddOpen(false)
  }

  async function confirmDeleteExpense() {
    if (!deleteConfirm) return
    await supabase.from('business_expenses').delete().eq('id', deleteConfirm.id)
    setDeleteConfirm(null)
    await loadAll()
  }

  async function confirmToggleExpensePaid() {
    if (!paidConfirm) return
    await supabase.from('business_expenses').update({ is_paid: paidConfirm.next }).eq('id', paidConfirm.id)
    setPaidConfirm(null)
    await loadAll()
  }

  const todayStr = toLocalDateString(new Date())
  const isOverdue = (e: Expense) => !e.is_paid && !!e.due_date && e.due_date < todayStr
  const totalAll = expenses.reduce((sum, e) => sum + e.amount, 0)
  const unpaidCount = expenses.filter((e) => !e.is_paid).length

  const usedCategories = CATEGORIES.filter((c) => expenses.some((e) => (e.category ?? 'Diğer') === c))
  const visibleExpenses = expenses.filter((e) => {
    if (categoryFilter !== 'Tümü' && (e.category ?? 'Diğer') !== categoryFilter) return false
    if (statusFilter === 'odenmemis') return !e.is_paid
    if (statusFilter === 'geciken') return isOverdue(e)
    if (statusFilter === 'aylik') return e.is_recurring
    return true
  })

  const anchor = new Date(`${rangeStart}T00:00:00`)
  const periodLabel =
    preset === 'bu_ay' || preset === 'gecen_ay'
      ? anchor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
      : preset === 'ozel'
        ? `${shortDate(rangeStart)} – ${shortDate(rangeEnd)}`
        : (PRESETS.find((p) => p.value === preset)?.label ?? 'Dönem')
  const totalLabel =
    preset === 'bu_ay' || preset === 'gecen_ay'
      ? `${anchor.toLocaleDateString('tr-TR', { month: 'long' })} toplamı`
      : 'Dönem toplamı'
  const diff = prevTotal === null ? null : totalAll - prevTotal
  const prevName =
    preset === 'bu_ay' || preset === 'gecen_ay'
      ? new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1).toLocaleDateString('tr-TR', { month: 'long' })
      : 'önceki dönem'

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/muhasebe"
        title="Giderler"
        action={
          <button type="button" className="hdr-btn" onClick={() => setPeriodOpen((v) => !v)} aria-expanded={periodOpen}>
            <CalendarIcon width={14} height={14} />
            <span className={styles.capitalize}>{periodLabel}</span> ▾
          </button>
        }
      />

      {periodOpen && (
        <div className={styles.periodPanel}>
          <div className={styles.chips}>
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={preset === p.value ? styles.chipActive : styles.chip}
                onClick={() => applyPreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className={styles.customRangeRow}>
            <div className="field field-flush">
              <label htmlFor="giderRangeStart">Başlangıç</label>
              <input
                id="giderRangeStart"
                type="date"
                value={rangeStart}
                max={rangeEnd}
                onChange={(e) => {
                  if (!e.target.value) return
                  setPreset('ozel')
                  setRangeStart(e.target.value)
                }}
              />
            </div>
            <div className="field field-flush">
              <label htmlFor="giderRangeEnd">Bitiş</label>
              <input
                id="giderRangeEnd"
                type="date"
                value={rangeEnd}
                min={rangeStart}
                onChange={(e) => {
                  if (!e.target.value) return
                  setPreset('ozel')
                  setRangeEnd(e.target.value)
                }}
              />
            </div>
          </div>
          <span className={styles.panelLabel}>Durum</span>
          <div className={styles.chips}>
            {(
              [
                { value: 'tumu', label: 'Hepsi' },
                { value: 'odenmemis', label: 'Ödenmemiş' },
                { value: 'geciken', label: 'Geciken' },
                { value: 'aylik', label: 'Her ay tekrarlanan' },
              ] as { value: StatusFilter; label: string }[]
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                className={statusFilter === o.value ? styles.chipActive : styles.chip}
                onClick={() => setStatusFilter(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.totalRow}>
        <span className={styles.totalText}>
          <span className={styles.totalLabel}>{totalLabel}</span>
          <span className={styles.totalValue}>{currency.format(totalAll)}</span>
        </span>
        {diff !== null && diff !== 0 && (
          <span className={diff < 0 ? styles.diffOk : styles.diffWarm}>
            {prevName.charAt(0).toLocaleUpperCase('tr') + prevName.slice(1)}’den {currency.format(Math.abs(diff))}{' '}
            {diff < 0 ? 'az' : 'fazla'}
          </span>
        )}
      </div>

      <div className={styles.chipScroll}>
        {['Tümü', ...usedCategories].map((c) => (
          <button
            key={c}
            type="button"
            className={categoryFilter === c ? styles.catChipActive : styles.catChip}
            onClick={() => setCategoryFilter(c)}
          >
            {c}
          </button>
        ))}
        {statusFilter !== 'tumu' && (
          <button type="button" className={styles.catChipWarm} onClick={() => setStatusFilter('tumu')}>
            {statusFilter === 'odenmemis' ? 'Ödenmemiş' : statusFilter === 'geciken' ? 'Geciken' : 'Her ay'} ✕
          </button>
        )}
      </div>

      {loading ? (
        <p className={styles.empty}>Yükleniyor…</p>
      ) : visibleExpenses.length === 0 ? (
        <p className={styles.empty}>
          {categoryFilter !== 'Tümü' || statusFilter !== 'tumu'
            ? 'Bu süzgece uyan gider yok.'
            : 'Bu dönemde gider kaydı yok.'}
        </p>
      ) : (
        <div className={styles.listCard}>
          {visibleExpenses.map((e) => {
            const overdue = isOverdue(e)
            const meta = [
              e.category ?? null,
              shortDate(e.expense_date),
              e.payment_method ? METHODS.find((m) => m.value === e.payment_method)?.label : null,
              e.is_recurring ? 'her ay' : null,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <button type="button" className={styles.expenseRow} key={e.id} onClick={() => setRowMenu(e)}>
                <span className={styles.expenseText}>
                  <span className={styles.expenseDesc}>{e.description}</span>
                  <span className={styles.expenseMeta}>
                    {meta}
                    {!e.is_paid && (
                      <span className={overdue ? styles.metaDanger : styles.metaWarm}>
                        {' · '}
                        {overdue ? 'gecikti' : e.due_date ? `son ödeme ${shortDate(e.due_date)}` : 'ödenmedi'}
                      </span>
                    )}
                  </span>
                </span>
                <span className={e.is_paid ? styles.expenseAmount : `${styles.expenseAmount} ${styles.amountWarm}`}>
                  {currency.format(e.amount)}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {!loading && (
        <span className={styles.countNote}>
          {visibleExpenses.length} kayıt{unpaidCount > 0 ? ` · ${unpaidCount} tanesi ödenmedi` : ''}
        </span>
      )}

      <div className={styles.addBar}>
        <button type="button" className={styles.addBtn} onClick={() => setAddOpen(true)}>
          Gider ekle
        </button>
      </div>

      {rowMenu && (
        <div className={styles.sheetBackdrop} onClick={() => setRowMenu(null)}>
          <div className={styles.menuSheet} onClick={(e) => e.stopPropagation()}>
            <span className={styles.menuTitle}>{rowMenu.description}</span>
            <span className={styles.menuSub}>
              {currency.format(rowMenu.amount)} · {shortDate(rowMenu.expense_date)}
            </span>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setPaidConfirm({ id: rowMenu.id, description: rowMenu.description, next: !rowMenu.is_paid })
                setRowMenu(null)
              }}
            >
              {rowMenu.is_paid ? 'Ödenmedi olarak işaretle' : 'Ödendi olarak işaretle'}
            </button>
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={() => {
                setDeleteConfirm({ id: rowMenu.id, description: rowMenu.description })
                setRowMenu(null)
              }}
            >
              Gideri sil
            </button>
            <button type="button" className={styles.menuCancel} onClick={() => setRowMenu(null)}>
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {addOpen && (
        <div className={styles.sheetBackdrop} onClick={() => setAddOpen(false)}>
          <form className={styles.sheet} onSubmit={addExpense} onClick={(e) => e.stopPropagation()}>
            <span className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetHead}>
              <h1 className={styles.sheetTitle}>Gider ekle</h1>
              <button type="button" className={styles.sheetCancel} onClick={() => setAddOpen(false)}>
                Vazgeç
              </button>
            </div>

            <label className={styles.amountField} htmlFor="expenseAmount">
              <span className={styles.amountLabel}>Tutar</span>
              <span className={styles.amountLine}>
                <span className={styles.amountPrefix}>₺</span>
                <input
                  id="expenseAmount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="0"
                  required
                  autoFocus
                />
              </span>
            </label>

            <div className={styles.fGroup}>
              <span className={styles.fLabel}>Kategori</span>
              <div className={styles.chips}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={expenseCategory === c ? styles.formChipActive : styles.formChip}
                    onClick={() => setExpenseCategory(expenseCategory === c ? '' : c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.fGroup}>
              <label className={styles.fLabel} htmlFor="expenseDesc">
                Açıklama
              </label>
              <input
                id="expenseDesc"
                className={styles.fInput}
                type="text"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                placeholder={
                  expenseCategory
                    ? `ör. ${expenseCategory === 'Malzeme' ? 'Oje ve aseton' : expenseCategory}`
                    : 'ör. Oje ve aseton'
                }
              />
            </div>

            <div className={styles.rowsCard}>
              <label className={styles.formRow}>
                <span className={styles.formRowLabel}>Tarih</span>
                <span className={styles.formRowValue}>
                  {expenseDate === todayStr ? 'Bugün, ' : ''}
                  {new Date(`${expenseDate}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} ›
                </span>
                <input
                  className={styles.formRowInput}
                  type="date"
                  value={expenseDate}
                  onChange={(e) => e.target.value && setExpenseDate(e.target.value)}
                />
              </label>
              <div className={styles.formRow}>
                <span className={styles.formRowLabel}>Ödendi</span>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={expensePaid}
                    onChange={() => setExpensePaid((v) => !v)}
                    aria-label="Ödendi"
                  />
                  <span className={styles.switchTrack} />
                </label>
              </div>
              {expensePaid ? (
                <>
                  <button
                    type="button"
                    className={`${styles.formRow} ${styles.formRowBtn}`}
                    onClick={() => setMethodPickerOpen(true)}
                  >
                    <span className={styles.formRowLabel}>Ödeme şekli</span>
                    <span className={styles.formRowValue}>
                      {METHODS.find((m) => m.value === expenseMethod)?.label} ›
                    </span>
                  </button>
                  <PickerSheet
                    open={methodPickerOpen}
                    title="Nasıl ödendi?"
                    options={METHODS}
                    value={expenseMethod}
                    onSelect={setExpenseMethod}
                    onClose={() => setMethodPickerOpen(false)}
                  />
                </>
              ) : (
                <label className={styles.formRow}>
                  <span className={styles.formRowLabel}>Son ödeme tarihi</span>
                  <span className={styles.formRowValue}>
                    {expenseDueDate
                      ? new Date(`${expenseDueDate}T00:00:00`).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'long',
                        })
                      : 'Seç'}{' '}
                    ›
                  </span>
                  <input
                    className={styles.formRowInput}
                    type="date"
                    min={expenseDate}
                    value={expenseDueDate}
                    onChange={(e) => setExpenseDueDate(e.target.value)}
                  />
                </label>
              )}
              <div className={styles.formRow}>
                <span className={styles.formRowLabel}>Her ay tekrarla</span>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={expenseRecurring}
                    onChange={() => setExpenseRecurring((v) => !v)}
                    aria-label="Her ay tekrarla"
                  />
                  <span className={styles.switchTrack} />
                </label>
              </div>
            </div>

            {addError && <p className={styles.error}>{addError}</p>}

            <button type="submit" className={styles.sheetSubmit} disabled={addingExpense}>
              {addingExpense
                ? 'Kaydediliyor…'
                : Number(expenseAmount) > 0
                  ? `${currency.format(Number(expenseAmount))} gideri kaydet`
                  : 'Gideri kaydet'}
            </button>
          </form>
        </div>
      )}

      {paidConfirm && (
        <ConfirmModal
          title={paidConfirm.next ? 'Ödendi olarak işaretle' : 'Ödenmedi olarak işaretle'}
          message={
            <>
              "{paidConfirm.description}" giderini{' '}
              <strong style={{ color: paidConfirm.next ? 'var(--ok-text)' : 'var(--danger-text)' }}>
                {paidConfirm.next ? 'ödendi' : 'ödenmedi'}
              </strong>{' '}
              olarak işaretlemek istediğinize emin misiniz?
            </>
          }
          confirmLabel="Evet, işaretle"
          onConfirm={confirmToggleExpensePaid}
          onCancel={() => setPaidConfirm(null)}
        />
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="Gideri sil"
          message={
            <>"{deleteConfirm.description}" giderini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</>
          }
          confirmLabel="Evet, sil"
          danger
          onConfirm={confirmDeleteExpense}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
