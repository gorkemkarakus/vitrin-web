import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Select from '../components/Select'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { friendlyDbError } from '../lib/dbErrors'
import { surveyStats, type SurveyRow, type SurveySettings } from '../lib/surveys'
import styles from './SurveysPage.module.css'

type Row = SurveyRow & { customers: { full_name: string } | null }

const LOW_OPTIONS = [
  { value: '2', label: '1-2 puan' },
  { value: '3', label: '1-3 puan' },
  { value: '4', label: '1-4 puan' },
]

// Memnuniyet sonuclari (son 90 gun) + yonetici icin ayarlar.
export default function SurveysPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [settings, setSettings] = useState<SurveySettings | null>(null)
  const [team, setTeam] = useState<{ id: string; full_name: string | null }[]>([])
  const [googleUrl, setGoogleUrl] = useState('')
  const [low, setLow] = useState('3')
  const [assignee, setAssignee] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const [{ data, error: err }, { data: s }, { data: t }] = await Promise.all([
      supabase
        .from('surveys')
        .select(
          'id, appointment_id, customer_id, rating, comment, responded_at, task_id, created_at, customers(full_name)',
        )
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase.from('survey_settings').select('business_id, google_review_url, low_rating, assignee_id').maybeSingle(),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    if (err) setError(friendlyDbError(err, 'Sonuçlar yüklenemedi.'))
    setRows((data ?? []) as unknown as Row[])
    const st = (s as SurveySettings | null) ?? null
    setSettings(st)
    setGoogleUrl(st?.google_review_url ?? '')
    setLow(String(st?.low_rating ?? 3))
    setAssignee(st?.assignee_id ?? '')
    setTeam(t ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile?.business_id) return
    const url = googleUrl.trim()
    if (url && !/^https:\/\//.test(url)) {
      setError('Google bağlantısı https:// ile başlamalı.')
      return
    }
    setSaving(true)
    setError(null)
    setNotice(null)
    const { error: err } = await supabase.from('survey_settings').upsert(
      {
        business_id: profile.business_id,
        google_review_url: url || null,
        low_rating: Number(low),
        assignee_id: assignee || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' },
    )
    setSaving(false)
    if (err) setError(friendlyDbError(err, 'Kaydedilemedi.'))
    else setNotice('Kaydedildi.')
    void load()
  }

  const stats = surveyStats(rows ?? [])
  const answered = (rows ?? []).filter((r) => r.rating != null)
  const maxDist = Math.max(1, ...stats.dist)
  const lowLimit = settings?.low_rating ?? 3

  return (
    <div className={styles.wrap}>
      <PageHeader back="/daha-fazla" title="Memnuniyet" sub="Son 90 gün" />
      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.ok}>{notice}</p>}

      <p className={styles.info}>
        Tamamlanan bir randevunun detayında <b>Memnuniyet sorusu → Gönder</b> ile müşteriye WhatsApp’tan bağlantı gider.{' '}
        {lowLimit} ve altı puan verilirse <b>Görevler</b>’e “arayıp gönlünü al” düşer; 4-5 puan verene Google yorum
        bağlantısı gösterilir.
      </p>

      {rows && (
        <div className={styles.top}>
          <section className={styles.tiles} aria-label="Özet">
            <div className={styles.tile}>
              <span className={styles.tileValue}>
                {stats.avg != null ? stats.avg.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '–'}
                <small>/5</small>
              </span>
              <span className={styles.tileLabel}>Ortalama puan</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileValue}>%{stats.happyShare}</span>
              <span className={styles.tileLabel}>Memnun (4-5 puan)</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileValue}>
                {stats.answered}
                <small>/{stats.sent}</small>
              </span>
              <span className={styles.tileLabel}>Yanıtlanan · %{stats.responseRate}</span>
            </div>
          </section>

          <section className={styles.dist} aria-label="Puan dağılımı">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className={styles.distRow}>
                <span className={styles.distLabel}>{n}</span>
                <span className={styles.distTrack}>
                  <span
                    className={styles.distBar}
                    data-tone={n <= 2 ? 'low' : n === 3 ? 'mid' : 'high'}
                    style={{ width: `${(stats.dist[n - 1] / maxDist) * 100}%` }}
                  />
                </span>
                <span className={styles.distCount}>{stats.dist[n - 1]}</span>
              </div>
            ))}
          </section>
        </div>
      )}

      {rows && (
        <section className={styles.list} aria-labelledby="answersTitle">
          <h2 id="answersTitle" className={styles.listTitle}>
            Yanıtlar
          </h2>
          {answered.length === 0 ? (
            <p className={styles.muted}>Henüz yanıt yok.</p>
          ) : (
            answered.map((r) => (
              <div key={r.id} className={styles.item}>
                <span
                  className={styles.score}
                  data-tone={(r.rating ?? 0) <= 2 ? 'low' : r.rating === 3 ? 'mid' : 'high'}
                  aria-label={`${r.rating} puan`}
                >
                  {r.rating}
                </span>
                <span className={styles.itemBody}>
                  <button
                    type="button"
                    className={styles.name}
                    onClick={() => navigate(`/musteriler/${r.customer_id}`)}
                  >
                    {r.customers?.full_name ?? 'Müşteri'}
                  </button>
                  {r.comment && <span className={styles.comment}>“{r.comment}”</span>}
                  <span className={styles.meta}>
                    {new Date(r.responded_at!).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    {r.task_id ? ' · görev açıldı' : ''}
                  </span>
                </span>
              </div>
            ))
          )}
        </section>
      )}

      {isAdmin && (
        <section className={styles.list} aria-labelledby="surveySettingsTitle">
          <h2 id="surveySettingsTitle" className={styles.listTitle}>
            Ayarlar
          </h2>
          <form className={styles.form} onSubmit={save}>
            <div className="field">
              <label htmlFor="googleUrl">Google yorum bağlantısı</label>
              <input
                id="googleUrl"
                type="url"
                value={googleUrl}
                maxLength={500}
                onChange={(e) => setGoogleUrl(e.target.value)}
                placeholder="https://g.page/r/…/review"
              />
              <span className={styles.hint}>
                Google İşletme Profili → “Yorum iste” → bağlantıyı kopyala. Boş bırakılırsa gösterilmez.
              </span>
            </div>
            <div className="field">
              <label htmlFor="lowRating">Görev açılsın</label>
              <Select id="lowRating" value={low} onChange={setLow} options={LOW_OPTIONS} />
            </div>
            <div className="field">
              <label htmlFor="surveyAssignee">Görev kime düşsün</label>
              <Select
                id="surveyAssignee"
                value={assignee}
                onChange={setAssignee}
                options={[
                  { value: '', label: 'Atanmamış (ekipten biri)' },
                  ...team.map((m) => ({ value: m.id, label: m.full_name ?? 'Çalışan' })),
                ]}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
