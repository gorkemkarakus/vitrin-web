import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'
import { useAuth } from '../contexts/AuthContext'
import { useLayout } from '../lib/layout'
import { friendlyDbError } from '../lib/dbErrors'
import { currencyWhole } from '../lib/currency'
import { toLocalDateString } from '../lib/date'
import { SOURCE_LABEL } from '../lib/sourceLabels'
import { buildCrmReport, type ReportAppointment, type ReportCustomer, type ReportPayment } from '../lib/crmReport'
import styles from './CustomerReportPage.module.css'

type Range = '30' | '90' | '365'
const RANGES: { value: Range; label: string }[] = [
  { value: '30', label: 'Son 30 gün' },
  { value: '90', label: 'Son 90 gün' },
  { value: '365', label: 'Son 12 ay' },
]

const DAYS = [1, 2, 3, 4, 5, 6, 0] // Pzt..Paz
const DAY_LABEL = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
// Isi haritasi: tek ton (lacivert), acik -> koyu. 0 = bos.
const HEAT = ['#eef1f7', '#cfd8e8', '#9fb0cf', '#6b83b0', '#3d5a8f', '#13284f']

function pct(v: number | null) {
  return v === null ? '—' : `%${Math.round(v * 100)}`
}

// Musteri (CRM) raporu: kim geliyor, kim tekrar geliyor, kim kayboluyor.
export default function CustomerReportPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { isWide } = useLayout()
  const [range, setRange] = useState<Range>('90')
  const [data, setData] = useState<{
    appointments: ReportAppointment[]
    payments: ReportPayment[]
    customers: ReportCustomer[]
    services: Map<string, string>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tracked, setTracked] = useState<Set<string>>(new Set())

  useEffect(() => {
    const since = new Date()
    since.setMonth(since.getMonth() - 25) // tekrar gelme / ritim icin 2 yil geriye
    Promise.all([
      fetchAll(() =>
        supabase
          .from('appointments')
          .select('id, customer_id, service_id, scheduled_at, status, source')
          .gte('scheduled_at', since.toISOString())
          .order('scheduled_at')
          .order('id'),
      ),
      fetchAll(() =>
        supabase
          .from('payments')
          .select('id, customer_id, amount, paid_at')
          .is('voided_at', null)
          .gte('paid_at', toLocalDateString(since))
          .order('id'),
      ),
      fetchAll(() => supabase.from('customers').select('id, full_name').order('id')),
      supabase.from('services').select('id, name'),
    ])
      .then(([a, p, c, s]) => {
        if (a.error || p.error || c.error) throw a.error ?? p.error ?? c.error
        setData({
          appointments: (a.data ?? []) as ReportAppointment[],
          payments: (p.data ?? []) as ReportPayment[],
          customers: (c.data ?? []) as ReportCustomer[],
          services: new Map((s.data ?? []).map((x) => [x.id as string, x.name as string])),
        })
      })
      .catch((e) => setError(friendlyDbError(e, 'Rapor yüklenemedi.')))
  }, [])

  const report = useMemo(() => {
    if (!data) return null
    const end = new Date()
    end.setDate(end.getDate() + 1)
    end.setHours(0, 0, 0, 0)
    const start = new Date(end)
    start.setDate(start.getDate() - Number(range))
    return buildCrmReport(data.appointments, data.payments, data.customers, { start, end })
  }, [data, range])

  async function track(id: string, name: string, daysSince: number) {
    if (!profile?.business_id) return
    const { error: err } = await supabase.from('tasks').insert({
      business_id: profile.business_id,
      customer_id: id,
      title: `Ara: ${name} (${daysSince} gündür gelmiyor)`,
      due_date: toLocalDateString(new Date()),
      assignee_id: profile.id,
      created_by: profile.id,
    })
    if (err) setError(friendlyDbError(err, 'Görev eklenemedi.'))
    else setTracked((t) => new Set(t).add(id))
  }

  const maxHeat = report ? Math.max(1, ...report.heatmap.flat()) : 1
  const hours = Array.from({ length: 14 }, (_, i) => i + 8) // 08–21

  const rangePicker = (
    <div className={styles.seg} role="tablist" aria-label="Dönem">
      {RANGES.map((r) => (
        <button
          type="button"
          key={r.value}
          role="tab"
          aria-selected={range === r.value}
          className={range === r.value ? styles.segActive : styles.segBtn}
          onClick={() => setRange(r.value)}
        >
          {r.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Müşteri raporu"
        sub="Kim geliyor, kim tekrar geliyor, kim kayboluyor"
        action={isWide ? rangePicker : undefined}
      />
      {/* Dar ekranda donem secici basligin altinda (yaninda sigmiyor). */}
      {!isWide && rangePicker}

      {error && <p className={styles.error}>{error}</p>}
      {!report && !error && <p className={styles.muted}>Yükleniyor…</p>}

      {report && (
        <>
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Aktif müşteri</span>
              <span className={styles.kpiValue}>{report.activeCustomers.toLocaleString('tr-TR')}</span>
              <span className={styles.kpiSub}>dönemde geldi</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Yeni müşteri</span>
              <span className={styles.kpiValue}>{report.newCustomers.toLocaleString('tr-TR')}</span>
              <span className={styles.kpiSub}>ilk kez geldi</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Tekrar gelme</span>
              <span className={styles.kpiValue}>{pct(report.returnRate)}</span>
              <span className={styles.kpiSub}>
                {report.returnBase > 0 ? '60 gün içinde tekrar geldi' : 'henüz hesaplanamıyor'}
              </span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Ortalama sepet</span>
              <span className={styles.kpiValue}>
                {report.avgTicket === null ? '—' : currencyWhole.format(report.avgTicket)}
              </span>
              <span className={styles.kpiSub}>tahsilat / ziyaret</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Müşteri başına</span>
              <span className={styles.kpiValue}>
                {report.spendPerCustomer === null ? '—' : currencyWhole.format(report.spendPerCustomer)}
              </span>
              <span className={styles.kpiSub}>dönemdeki ortalama harcama</span>
            </div>
            <div className={styles.kpi}>
              <span className={styles.kpiLabel}>Gelmeme</span>
              <span
                className={
                  report.noShowRate && report.noShowRate > 0.1 ? `${styles.kpiValue} ${styles.bad}` : styles.kpiValue
                }
              >
                {pct(report.noShowRate)}
              </span>
              <span className={styles.kpiSub}>{report.noShows} randevuya gelinmedi</span>
            </div>
          </div>

          <div className={isWide ? styles.grid : styles.stack}>
            <section className={styles.card} aria-labelledby="riskTitle">
              <div className={styles.cardHead}>
                <h2 id="riskTitle" className={styles.cardTitle}>
                  Kaybolma riski <span className={styles.count}>{report.atRisk.length}</span>
                </h2>
              </div>
              <p className={styles.muted}>Düzenli gelip son zamanlarda gelmeyenler.</p>
              {report.atRisk.length === 0 ? (
                <p className={styles.muted}>Şu an risk görünmüyor.</p>
              ) : (
                <ul className={styles.list}>
                  {report.atRisk.slice(0, isWide ? 15 : 8).map((c) => (
                    <li key={c.id} className={styles.riskRow}>
                      <button type="button" className={styles.riskMain} onClick={() => navigate(`/musteriler/${c.id}`)}>
                        <span className={styles.riskName}>{c.name}</span>
                        <span className={styles.muted}>
                          {c.daysSince} gündür gelmiyor · normalde {Math.max(1, c.usualGapDays)} günde bir · {c.visits}{' '}
                          ziyaret
                        </span>
                      </button>
                      <span className={styles.money}>{currencyWhole.format(c.spent)}</span>
                      <button
                        type="button"
                        className={styles.trackBtn}
                        disabled={tracked.has(c.id)}
                        onClick={() => track(c.id, c.name, c.daysSince)}
                      >
                        {tracked.has(c.id) ? 'Görev açıldı' : 'Takibe al'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className={styles.stack}>
              <section className={styles.card} aria-labelledby="sourceTitle">
                <h2 id="sourceTitle" className={styles.cardTitle}>
                  Randevular nereden geliyor
                </h2>
                {report.bySource.length === 0 ? (
                  <p className={styles.muted}>Dönemde tamamlanan randevu yok.</p>
                ) : (
                  <div className={styles.bars}>
                    {report.bySource.map((s) => (
                      <div key={s.source} className={styles.barRow}>
                        <span className={styles.barLabel}>{SOURCE_LABEL[s.source] ?? s.source}</span>
                        <span className={styles.barTrack}>
                          <span
                            className={styles.barFill}
                            style={{ width: `${(s.visits / report.bySource[0].visits) * 100}%` }}
                          />
                        </span>
                        <span className={styles.barValue}>{s.visits}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.card} aria-labelledby="topTitle">
                <h2 id="topTitle" className={styles.cardTitle}>
                  En çok harcayanlar
                </h2>
                {report.topSpenders.length === 0 ? (
                  <p className={styles.muted}>Dönemde tahsilat yok.</p>
                ) : (
                  <ol className={styles.list}>
                    {report.topSpenders.slice(0, isWide ? 10 : 5).map((c) => (
                      <li key={c.id} className={styles.topRow}>
                        <button
                          type="button"
                          className={styles.linkName}
                          onClick={() => navigate(`/musteriler/${c.id}`)}
                        >
                          {c.name}
                        </button>
                        <span className={styles.muted}>{c.visits} ziyaret</span>
                        <span className={styles.money}>{currencyWhole.format(c.spent)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>

          <section className={styles.card} aria-labelledby="heatTitle">
            <div className={styles.cardHead}>
              <h2 id="heatTitle" className={styles.cardTitle}>
                En yoğun gün ve saatler
              </h2>
              <span className={styles.legend} aria-hidden="true">
                az
                {HEAT.slice(1).map((c) => (
                  <span key={c} className={styles.legendBox} style={{ background: c }} />
                ))}
                çok
              </span>
            </div>
            <div className={styles.heatWrap}>
              <table className={styles.heat}>
                <thead>
                  <tr>
                    <th />
                    {hours.map((h) => (
                      <th key={h} scope="col">
                        {String(h).padStart(2, '0')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((d) => (
                    <tr key={d}>
                      <th scope="row">{DAY_LABEL[d]}</th>
                      {hours.map((h) => {
                        const v = report.heatmap[d][h]
                        const level = v === 0 ? 0 : Math.max(1, Math.ceil((v / maxHeat) * (HEAT.length - 1)))
                        return (
                          <td
                            key={h}
                            title={`${DAY_LABEL[d]} ${String(h).padStart(2, '0')}:00 · ${v} randevu`}
                            style={{ background: HEAT[level], color: level >= 4 ? '#fff' : 'var(--text-strong)' }}
                          >
                            {v > 0 ? v : ''}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.muted}>Tamamlanan ve onaylı randevular. Boş saatler kampanya için iyi bir fırsat.</p>
          </section>

          <section className={styles.card} aria-labelledby="svcTitle">
            <h2 id="svcTitle" className={styles.cardTitle}>
              Hizmetlere göre ziyaret
            </h2>
            {report.byService.length === 0 ? (
              <p className={styles.muted}>Dönemde tamamlanan randevu yok.</p>
            ) : (
              <div className={styles.bars}>
                {report.byService.slice(0, 10).map((s) => (
                  <div key={s.serviceId} className={styles.barRow}>
                    <span className={styles.barLabel}>{data?.services.get(s.serviceId) ?? 'Hizmet'}</span>
                    <span className={styles.barTrack}>
                      <span
                        className={styles.barFill}
                        style={{ width: `${(s.visits / report.byService[0].visits) * 100}%` }}
                      />
                    </span>
                    <span className={styles.barValue}>{s.visits}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
