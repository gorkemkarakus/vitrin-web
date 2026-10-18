import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Select from '../components/Select'
import WideOnly from '../components/WideOnly'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { friendlyDbError } from '../lib/dbErrors'
import { AUTOMATIONS, type AutomationKind, type AutomationRule, type AutomationTemplate } from '../lib/automations'
import styles from './AutomationsPage.module.css'

// Otomasyonlar: hazir kurallar acilip kapatilir; her sabah 06:00 calisir ve
// Gorevler'e duser. Yalnizca genis ekran, yalnizca yonetici.
export default function AutomationsPage() {
  return (
    <WideOnly title="Otomasyonlar">
      <Automations />
    </WideOnly>
  )
}

function Automations() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [rules, setRules] = useState<Map<AutomationKind, AutomationRule>>(new Map())
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [team, setTeam] = useState<{ id: string; full_name: string | null }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const [{ data: r, error: rErr }, { data: runs }, { data: t }] = await Promise.all([
      supabase.from('automation_rules').select('id, kind, enabled, params, assignee_id, last_run_at'),
      supabase.from('automation_runs').select('rule_id').gte('created_at', since).limit(5000),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    if (rErr) setError(friendlyDbError(rErr, 'Otomasyonlar yüklenemedi.'))
    setRules(new Map(((r ?? []) as AutomationRule[]).map((x) => [x.kind, x])))
    const c = new Map<string, number>()
    for (const row of runs ?? []) c.set(row.rule_id as string, (c.get(row.rule_id as string) ?? 0) + 1)
    setCounts(c)
    setTeam(t ?? [])
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(
    tpl: AutomationTemplate,
    patch: Partial<Pick<AutomationRule, 'enabled' | 'params' | 'assignee_id'>>,
  ) {
    if (!profile?.business_id) return
    setError(null)
    const current = rules.get(tpl.kind)
    const next = {
      business_id: profile.business_id,
      kind: tpl.kind,
      enabled: patch.enabled ?? current?.enabled ?? true,
      params: patch.params ?? current?.params ?? (tpl.param ? { days: tpl.param.default } : {}),
      assignee_id: patch.assignee_id !== undefined ? patch.assignee_id : (current?.assignee_id ?? null),
      updated_at: new Date().toISOString(),
    }
    // Ekranda hemen degissin (anahtar tiklamaya aninda tepki versin); kayit
    // basarisiz olursa load() sunucudaki gercek duruma geri dondurur.
    setRules((prev) =>
      new Map(prev).set(tpl.kind, {
        id: current?.id ?? '',
        kind: tpl.kind,
        enabled: next.enabled,
        params: next.params,
        assignee_id: next.assignee_id,
        last_run_at: current?.last_run_at ?? null,
      }),
    )
    const { error: err } = await supabase.from('automation_rules').upsert(next, { onConflict: 'business_id,kind' })
    if (err) setError(friendlyDbError(err, 'Kaydedilemedi.'))
    void load()
  }

  async function runNow() {
    setRunning(true)
    setRunResult(null)
    const { data, error: err } = await supabase.rpc('run_my_automations')
    setRunning(false)
    if (err) {
      setError(friendlyDbError(err, 'Çalıştırılamadı.'))
      return
    }
    const n = Number(data ?? 0)
    setRunResult(n > 0 ? `${n} yeni görev açıldı.` : 'Şu an koşula uyan yeni müşteri yok.')
    void load()
  }

  const assigneeOptions = [
    { value: '', label: 'Atanmamış (ekipten biri)' },
    ...team.map((m) => ({ value: m.id, label: m.full_name ?? 'Çalışan' })),
  ]
  const anyEnabled = [...rules.values()].some((r) => r.enabled)

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Otomasyonlar"
        sub="Takip edilmesi gerekenleri senin yerine fark eder, görev açar"
        action={
          <button type="button" className="hdr-pill-navy" disabled={running || !anyEnabled} onClick={runNow}>
            {running ? 'Çalışıyor…' : 'Şimdi çalıştır'}
          </button>
        }
      />
      <p className={styles.info}>
        Açık kurallar her sabah 06:00’da çalışır; açılan görevler{' '}
        <button type="button" className={styles.link} onClick={() => navigate('/gorevler')}>
          Görevler
        </button>{' '}
        ekranına düşer. Aynı müşteri için aynı nedenle ikinci kez görev açılmaz. WhatsApp bağlandığında aynı kurallar
        mesaj da gönderebilecek.
      </p>
      {runResult && <p className={styles.ok}>{runResult}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {loaded && (
        <div className={styles.grid}>
          {AUTOMATIONS.map((tpl) => {
            const rule = rules.get(tpl.kind)
            const enabled = rule?.enabled ?? false
            const days = rule?.params?.days ?? tpl.param?.default
            return (
              <section key={tpl.kind} className={enabled ? `${styles.card} ${styles.cardOn}` : styles.card}>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>{tpl.title}</h2>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={enabled}
                      onChange={(e) => save(tpl, { enabled: e.target.checked })}
                      aria-label={`${tpl.title} ${enabled ? 'açık' : 'kapalı'}`}
                    />
                    <span className={styles.track} aria-hidden="true" />
                  </label>
                </div>
                <p className={styles.desc}>{tpl.description}</p>
                <p className={styles.example}>
                  Örnek görev: <span>{tpl.example}</span>
                </p>
                <div className={styles.fields}>
                  {tpl.param && (
                    <label className={styles.field}>
                      <span>{tpl.param.label}</span>
                      <span className={styles.numberRow}>
                        <input
                          type="number"
                          min={tpl.param.min}
                          max={tpl.param.max}
                          defaultValue={days}
                          key={`${tpl.kind}-${days}`}
                          onBlur={(e) => {
                            const v = Math.min(
                              tpl.param!.max,
                              Math.max(tpl.param!.min, Number(e.target.value) || tpl.param!.default),
                            )
                            if (v !== days) void save(tpl, { params: { days: v } })
                          }}
                        />
                        {tpl.param.suffix}
                      </span>
                    </label>
                  )}
                  <div className={styles.field}>
                    <span>Görev kime düşsün</span>
                    <Select
                      ariaLabel={`${tpl.title}: görev kime düşsün`}
                      value={rule?.assignee_id ?? ''}
                      onChange={(v) => save(tpl, { assignee_id: v || null })}
                      options={assigneeOptions}
                    />
                  </div>
                </div>
                <span className={styles.meta}>
                  {rule
                    ? `Son 30 günde ${counts.get(rule.id) ?? 0} görev açtı${
                        rule.last_run_at
                          ? ` · son çalışma ${new Date(rule.last_run_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                          : ''
                      }`
                    : 'Kapalı'}
                </span>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
