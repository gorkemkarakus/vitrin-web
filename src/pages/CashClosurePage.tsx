import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import { currency, currencyWhole } from '../lib/currency'
import { METHOD_LABEL, loadDaySummary, longDate, type CashClosure, type DaySummary } from '../lib/cashClosure'
import { generateCashClosurePdf } from '../lib/pdf/cashClosurePdf'
import styles from './CashClosurePage.module.css'
import { todayLocalDateString } from '../lib/date'

// Gun sonu kasa kapanisi: gunun tahsilati (yonteme gore), nakit giderler,
// acilis kasasi + sayilan nakit → fark; kaydedilir ve PDF olarak indirilir.
export default function CashClosurePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const date = searchParams.get('tarih') || todayLocalDateString()

  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [closure, setClosure] = useState<CashClosure | null>(null)
  const [history, setHistory] = useState<CashClosure[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [businessName, setBusinessName] = useState('')
  const [opening, setOpening] = useState('')
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPays, setShowPays] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const [s, { data: own }, { data: prev }, { data: hist }, { data: biz }, { data: profs }] = await Promise.all([
        loadDaySummary(date),
        supabase.from('cash_closures').select('*').eq('closure_date', date).maybeSingle(),
        supabase
          .from('cash_closures')
          .select('counted_cash')
          .lt('closure_date', date)
          .order('closure_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('cash_closures').select('*').order('closure_date', { ascending: false }).limit(10),
        supabase
          .from('businesses')
          .select('name')
          .eq('id', profile?.business_id ?? '')
          .maybeSingle(),
        supabase.from('profiles').select('id, full_name'),
      ])
      if (cancelled) return
      setSummary(s)
      setClosure(own ?? null)
      setHistory(hist ?? [])
      setBusinessName(biz?.name ?? '')
      setNames(new Map((profs ?? []).map((p) => [p.id, p.full_name ?? ''])))
      // Acilis: bu gun daha once kapatildiysa o; yoksa bir onceki kapanisin sayilan nakdi.
      setOpening(String(own ? Number(own.opening_cash) : Number(prev?.counted_cash ?? 0)))
      setCounted(own ? String(Number(own.counted_cash)) : '')
      setNote(own?.note ?? '')
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [date, profile?.business_id])

  const openingNum = Math.max(0, Number(opening) || 0)
  const expected = summary ? openingNum + summary.byMethod.nakit - summary.cashExpense : 0
  const countedNum = counted === '' ? null : Math.max(0, Number(counted) || 0)
  const diff = countedNum === null ? null : Math.round((countedNum - expected) * 100) / 100

  async function saveClosure() {
    if (!summary || !profile?.business_id || countedNum === null) return
    setSaving(true)
    setError(null)
    const totals = {
      ...summary.byMethod,
      cash_expense: summary.cashExpense,
      expense_total: summary.expenseTotal,
      completed: summary.completed,
      cancelled: summary.cancelled,
      no_show: summary.noShow,
      unpaid: summary.unpaidAmount,
      total: summary.total,
    }
    const { data, error: err } = await supabase
      .from('cash_closures')
      .upsert(
        {
          business_id: profile.business_id,
          closure_date: date,
          opening_cash: openingNum,
          counted_cash: countedNum,
          expected_cash: Math.round(expected * 100) / 100,
          difference: diff ?? 0,
          totals,
          note: note.trim() || null,
          closed_by: profile.id,
        },
        { onConflict: 'business_id,closure_date' },
      )
      .select('*')
      .single()
    setSaving(false)
    if (err) {
      setError('Kaydedilemedi: ' + err.message)
      return
    }
    setClosure(data)
    setHistory((h) =>
      [data, ...h.filter((x) => x.closure_date !== data.closure_date)].sort((a, b) =>
        b.closure_date.localeCompare(a.closure_date),
      ),
    )
  }

  async function downloadPdf() {
    if (!summary || !closure) return
    setPdfBusy(true)
    try {
      await generateCashClosurePdf({
        businessName: businessName || 'İşletme',
        summary,
        closure,
        closedByName: names.get(closure.closed_by ?? '') ?? '',
      })
    } catch (e) {
      setError('PDF oluşturulamadı: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setPdfBusy(false)
    }
  }

  function diffText(d: number) {
    if (Math.abs(d) < 0.5) return 'Kasa tutuyor'
    return d < 0 ? `${currency.format(Math.abs(d))} eksik` : `${currency.format(d)} fazla`
  }
  function diffClass(d: number) {
    if (Math.abs(d) < 0.5) return styles.diffOk
    return d < 0 ? styles.diffBad : styles.diffWarn
  }

  const isToday = date === todayLocalDateString()

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/muhasebe"
        title="Gün sonu"
        sub={longDate(date)}
        action={
          <label className={styles.dateBtn}>
            {isToday
              ? 'Bugün'
              : new Date(`${date}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}{' '}
            ▾
            <input
              type="date"
              value={date}
              max={todayLocalDateString()}
              onChange={(e) => e.target.value && setSearchParams({ tarih: e.target.value }, { replace: true })}
              aria-label="Gün seç"
            />
          </label>
        }
      />

      {loading || !summary ? (
        <p className={styles.hint}>Yükleniyor…</p>
      ) : (
        <>
          {closure && (
            <div className={styles.closedBanner}>
              <span>
                ✓ Kapatıldı ·{' '}
                {new Date(closure.updated_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                {names.get(closure.closed_by ?? '') ? ` · ${names.get(closure.closed_by ?? '')?.split(' ')[0]}` : ''}
              </span>
              <span className={diffClass(Number(closure.difference))}>{diffText(Number(closure.difference))}</span>
            </div>
          )}

          <div className={styles.hero}>
            <span className={styles.heroLabel}>Günün tahsilatı</span>
            <span className={styles.heroValue}>{currency.format(summary.total)}</span>
            <span className={styles.heroSub}>
              {summary.payments.length} ödeme · {summary.completed} tamamlanan randevu
            </span>
            <div className={styles.methodGrid}>
              {(['nakit', 'kart', 'havale', 'diger'] as const).map((m) => (
                <span className={styles.methodItem} key={m}>
                  <span className={styles.methodValue}>
                    {currencyWhole.format(summary.byMethod[m] + (m === 'diger' ? summary.byMethod.bakiye : 0))}
                  </span>
                  <span className={styles.methodLabel}>{METHOD_LABEL[m]}</span>
                </span>
              ))}
            </div>
          </div>

          <div className={styles.statRow}>
            <span className={styles.stat}>
              <b>{summary.completed}</b> tamamlandı
            </span>
            <span className={styles.stat}>
              <b>{summary.cancelled}</b> iptal
            </span>
            <span className={styles.stat}>
              <b>{summary.noShow}</b> gelmedi
            </span>
            {summary.open > 0 && (
              <span className={`${styles.stat} ${styles.statWarn}`}>
                <b>{summary.open}</b> kapanmadı
              </span>
            )}
          </div>
          {summary.unpaidCount > 0 && (
            <button type="button" className={styles.unpaidRow} onClick={() => navigate('/musteriler?sekme=borclu')}>
              <span>
                {summary.unpaidCount} randevunun ödemesi alınmadı · {currency.format(summary.unpaidAmount)}
              </span>
              <span>›</span>
            </button>
          )}

          <div className={styles.card}>
            <span className={styles.cardTitle}>Kasa sayımı</span>
            <div className={styles.countRow}>
              <label htmlFor="opening">Açılış kasası</label>
              <span className={styles.moneyInput}>
                ₺
                <input
                  id="opening"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                />
              </span>
            </div>
            <div className={styles.countRow}>
              <span>+ Nakit tahsilat</span>
              <b>{currency.format(summary.byMethod.nakit)}</b>
            </div>
            <div className={styles.countRow}>
              <span>− Nakitle ödenen gider</span>
              <b className={summary.cashExpense > 0 ? styles.textBad : undefined}>
                {currency.format(summary.cashExpense)}
              </b>
            </div>
            <div className={`${styles.countRow} ${styles.countStrong}`}>
              <span>Kasada olması gereken</span>
              <b>{currency.format(expected)}</b>
            </div>
            <div className={styles.countRow}>
              <label htmlFor="counted">Sayılan nakit</label>
              <span className={styles.moneyInput}>
                ₺
                <input
                  id="counted"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  placeholder="say ve yaz"
                />
              </span>
            </div>
            {diff !== null && (
              <div className={`${styles.diffBox} ${diffClass(diff)}`}>
                {Math.abs(diff) < 0.5 ? '✓ Kasa tutuyor' : diffText(diff)}
              </div>
            )}
            <textarea
              className={styles.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Not (ör. 200 TL bozuk para bankaya yatırıldı)"
              rows={2}
            />
          </div>

          <div className={styles.card}>
            <button type="button" className={styles.listToggle} onClick={() => setShowPays((v) => !v)}>
              <span className={styles.cardTitle}>Tahsilatlar ({summary.payments.length})</span>
              <span>{showPays ? '▴' : '▾'}</span>
            </button>
            {showPays &&
              (summary.payments.length === 0 ? (
                <span className={styles.hint}>Bu gün ödeme alınmadı.</span>
              ) : (
                summary.payments.map((p) => (
                  <div className={styles.payRow} key={p.id}>
                    <span className={styles.payTime}>{p.time}</span>
                    <span className={styles.payText}>
                      <span className={styles.payName}>{p.customer}</span>
                      <span className={styles.payMeta}>
                        {p.service} · {p.method}
                        {p.by ? ` · ${p.by}` : ''}
                      </span>
                    </span>
                    <span className={styles.payAmount}>{currency.format(p.amount)}</span>
                  </div>
                ))
              ))}
            {summary.expenses.length > 0 && (
              <span className={styles.hint}>
                Bugünkü giderler: {summary.expenses.length} kalem · {currency.format(summary.expenseTotal)}
              </span>
            )}
          </div>

          {history.length > 0 && (
            <div className={styles.card}>
              <span className={styles.cardTitle}>Son kapanışlar</span>
              {history.map((h) => (
                <button
                  type="button"
                  key={h.id}
                  className={styles.histRow}
                  onClick={() => setSearchParams({ tarih: h.closure_date }, { replace: true })}
                >
                  <span className={styles.payText}>
                    <span className={styles.payName}>
                      {new Date(`${h.closure_date}T00:00:00`).toLocaleDateString('tr-TR', {
                        day: 'numeric',
                        month: 'long',
                        weekday: 'short',
                      })}
                    </span>
                    <span className={styles.payMeta}>Sayılan {currency.format(Number(h.counted_cash))}</span>
                  </span>
                  <span className={diffClass(Number(h.difference))}>{diffText(Number(h.difference))}</span>
                </button>
              ))}
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.footer}>
            {closure && (
              <button type="button" className={styles.pdfBtn} onClick={downloadPdf} disabled={pdfBusy}>
                {pdfBusy ? 'Hazırlanıyor…' : 'PDF indir'}
              </button>
            )}
            <button
              type="button"
              className={styles.footerBtn}
              onClick={saveClosure}
              disabled={saving || countedNum === null}
            >
              {saving ? 'Kaydediliyor…' : closure ? 'Güncelle' : 'Günü kapat'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
