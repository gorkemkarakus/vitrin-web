import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Select from '../components/Select'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLayout } from '../lib/layout'
import { friendlyDbError } from '../lib/dbErrors'
import {
  LEAD_SOURCE_LABEL,
  LOST_REASONS,
  STAGES,
  convertLead,
  fetchLeadSuggestions,
  fetchLeads,
  type Lead,
  type LeadSource,
  type LeadStage,
  type LeadSuggestion,
} from '../lib/leads'
import pageStyles from './CustomerDetailPage.module.css'
import styles from './LeadsPage.module.css'

const SOURCE_OPTIONS = (Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((value) => ({
  value,
  label: LEAD_SOURCE_LABEL[value],
}))

function since(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? 'bugün' : days === 1 ? 'dün' : `${days} gün önce`
}

// Potansiyel musteriler: genis ekranda surukle-birak kanban, telefonda asama
// sekmeleri + liste. Kaybedildi icin neden zorunlu.
export default function LeadsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { isWide } = useLayout()
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [suggestions, setSuggestions] = useState<LeadSuggestion[]>([])
  const [team, setTeam] = useState<{ id: string; full_name: string | null }[]>([])
  const [mobileStage, setMobileStage] = useState<LeadStage>('yeni')
  const [formOpen, setFormOpen] = useState(false)
  const [prefill, setPrefill] = useState<{ phone: string; note: string } | null>(null)
  const [losing, setLosing] = useState<Lead | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<LeadStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([fetchLeads(), fetchLeadSuggestions()])
      setLeads(l)
      setSuggestions(s)
    } catch (e) {
      setError(friendlyDbError(e, 'Liste yüklenemedi.'))
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

  const byStage = useMemo(() => {
    const m = new Map<LeadStage, Lead[]>(STAGES.map((s) => [s.value, []]))
    for (const l of leads ?? []) m.get(l.stage)?.push(l)
    return m
  }, [leads])

  const last30 = (leads ?? []).filter((l) => Date.now() - new Date(l.created_at).getTime() < 30 * 86_400_000)
  const won30 = last30.filter((l) => l.stage === 'kazanildi').length
  const lostReasons = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of leads ?? [])
      if (l.stage === 'kaybedildi' && l.lost_reason) m.set(l.lost_reason, (m.get(l.lost_reason) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [leads])

  async function moveTo(lead: Lead, stage: LeadStage) {
    if (lead.stage === stage) return
    setError(null)
    setNotice(null)
    if (stage === 'kaybedildi') {
      setLosing(lead)
      return
    }
    if (stage === 'kazanildi') {
      if (!profile?.business_id) return
      setLeads((prev) => prev?.map((l) => (l.id === lead.id ? { ...l, stage } : l)) ?? prev)
      const res = await convertLead(lead, profile.business_id)
      if ('error' in res) setError(res.error)
      else setNotice(`${lead.full_name} müşteri olarak kaydedildi.`)
      void load()
      return
    }
    setLeads((prev) => prev?.map((l) => (l.id === lead.id ? { ...l, stage } : l)) ?? prev)
    const { error: err } = await supabase.from('leads').update({ stage }).eq('id', lead.id)
    if (err) setError(friendlyDbError(err, 'Aşama değiştirilemedi.'))
    void load()
  }

  async function markLost(reason: string) {
    if (!losing) return
    const lead = losing
    setLosing(null)
    const { error: err } = await supabase
      .from('leads')
      .update({ stage: 'kaybedildi', lost_reason: reason })
      .eq('id', lead.id)
    if (err) setError(friendlyDbError(err, 'Kaydedilemedi.'))
    void load()
  }

  async function remove(lead: Lead) {
    if (!window.confirm(`“${lead.full_name}” silinsin mi?`)) return
    const { error: err } = await supabase.from('leads').delete().eq('id', lead.id)
    if (err) setError(friendlyDbError(err, 'Silinemedi.'))
    void load()
  }

  function onDrop(e: DragEvent, stage: LeadStage) {
    e.preventDefault()
    setOverStage(null)
    const lead = leads?.find((l) => l.id === (dragId ?? e.dataTransfer.getData('text/plain')))
    setDragId(null)
    if (lead) void moveTo(lead, stage)
  }

  const nameOf = (id: string | null) => (id ? (team.find((m) => m.id === id)?.full_name ?? 'Çalışan') : null)

  function card(l: Lead) {
    return (
      <article
        key={l.id}
        className={dragId === l.id ? `${styles.card} ${styles.cardDragging}` : styles.card}
        draggable={isWide}
        onDragStart={(e) => {
          setDragId(l.id)
          e.dataTransfer.setData('text/plain', l.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          setDragId(null)
          setOverStage(null)
        }}
      >
        <div className={styles.cardTop}>
          <span className={styles.cardName}>{l.full_name}</span>
          <span className={styles.source}>{LEAD_SOURCE_LABEL[l.source]}</span>
        </div>
        {l.interest && <span className={styles.interest}>{l.interest}</span>}
        {l.note && <span className={styles.note}>{l.note}</span>}
        {l.stage === 'kaybedildi' && l.lost_reason && <span className={styles.lost}>{l.lost_reason}</span>}
        <div className={styles.cardMeta}>
          {l.phone && (
            <a className={styles.phone} href={`tel:${l.phone}`}>
              {l.phone}
            </a>
          )}
          <span>{since(l.stage_changed_at)}</span>
          {nameOf(l.assignee_id) && <span>{nameOf(l.assignee_id)}</span>}
        </div>
        <div className={styles.cardActions}>
          {l.customer_id ? (
            <button type="button" className={styles.linkBtn} onClick={() => navigate(`/musteriler/${l.customer_id}`)}>
              Müşteri kartı
            </button>
          ) : (
            <span />
          )}
          {!isWide && (
            <Select
              ariaLabel={`${l.full_name} aşaması`}
              value={l.stage}
              onChange={(v) => moveTo(l, v as LeadStage)}
              options={STAGES.map((s) => ({ value: s.value, label: s.label }))}
            />
          )}
          {(profile?.role === 'admin' || l.created_by === profile?.id) && (
            <button type="button" className={styles.deleteBtn} onClick={() => remove(l)}>
              Sil
            </button>
          )}
        </div>
      </article>
    )
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Potansiyel müşteriler"
        sub={
          leads
            ? `Son 30 gün: ${last30.length} kişi, ${won30} müşteri oldu${last30.length ? ` (%${Math.round((won30 / last30.length) * 100)})` : ''}`
            : undefined
        }
        action={
          <button
            type="button"
            className="hdr-pill-navy"
            onClick={() => {
              setPrefill(null)
              setFormOpen(true)
            }}
          >
            + Ekle
          </button>
        }
      />

      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.ok}>{notice}</p>}

      {suggestions.length > 0 && (
        <section className={styles.suggest} aria-label="Botla konuşup randevu almayanlar">
          <span className={styles.suggestTitle}>Botla konuştu, randevu almadı · {suggestions.length}</span>
          <div className={styles.suggestList}>
            {suggestions.slice(0, isWide ? 6 : 3).map((s) => (
              <div key={s.phone} className={styles.suggestItem}>
                <span className={styles.cardName}>{s.customer_name ?? s.phone}</span>
                {s.last_text && <span className={styles.note}>“{s.last_text}”</span>}
                <span className={styles.cardMeta}>
                  {s.message_count} mesaj · {since(s.last_message_at)}
                </span>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    setPrefill({ phone: s.phone, note: s.last_text ? `Bot konuşması: “${s.last_text}”` : '' })
                    setFormOpen(true)
                  }}
                >
                  Huniye ekle
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {!leads && !error && <p className={styles.muted}>Yükleniyor…</p>}

      {leads && isWide && (
        <div className={styles.board}>
          {STAGES.map((s) => (
            <section
              key={s.value}
              className={overStage === s.value ? `${styles.column} ${styles.columnOver}` : styles.column}
              onDragOver={(e) => {
                e.preventDefault()
                setOverStage(s.value)
              }}
              onDragLeave={() => setOverStage((v) => (v === s.value ? null : v))}
              onDrop={(e) => onDrop(e, s.value)}
              aria-label={s.label}
            >
              <header className={styles.colHead}>
                <span className={`${styles.colTitle} ${styles[`st_${s.value}`]}`}>{s.label}</span>
                <span className={styles.colCount}>{byStage.get(s.value)?.length ?? 0}</span>
              </header>
              <span className={styles.colHint}>{s.hint}</span>
              <div className={styles.cards}>{byStage.get(s.value)?.map(card)}</div>
            </section>
          ))}
        </div>
      )}

      {leads && !isWide && (
        <>
          <div className={styles.stageTabs} role="tablist">
            {STAGES.map((s) => (
              <button
                type="button"
                key={s.value}
                role="tab"
                aria-selected={mobileStage === s.value}
                className={mobileStage === s.value ? styles.stageTabActive : styles.stageTab}
                onClick={() => setMobileStage(s.value)}
              >
                {s.label} <span className={styles.colCount}>{byStage.get(s.value)?.length ?? 0}</span>
              </button>
            ))}
          </div>
          <div className={styles.cards}>
            {(byStage.get(mobileStage) ?? []).length === 0 ? (
              <p className={styles.muted}>Bu aşamada kimse yok.</p>
            ) : (
              byStage.get(mobileStage)?.map(card)
            )}
          </div>
        </>
      )}

      {lostReasons.length > 0 && (
        <section className={styles.reasons} aria-label="Kaybedilme nedenleri">
          <span className={styles.suggestTitle}>Neden kaybediyoruz (90 gün)</span>
          <div className={styles.reasonList}>
            {lostReasons.map(([r, n]) => (
              <span key={r} className={styles.reasonPill}>
                {r} · {n}
              </span>
            ))}
          </div>
        </section>
      )}

      {formOpen && (
        <LeadForm
          team={team}
          prefill={prefill}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false)
            void load()
          }}
        />
      )}

      {losing && (
        <div className={pageStyles.modalBackdrop} onClick={() => setLosing(null)}>
          <div
            className={`card ${pageStyles.modalCard}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={pageStyles.modalHead}>
              <h2>Neden kaybedildi?</h2>
              <button
                type="button"
                className={pageStyles.modalClose}
                onClick={() => setLosing(null)}
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>
            <LostReasonPicker onPick={markLost} />
          </div>
        </div>
      )}
    </div>
  )
}

function LostReasonPicker({ onPick }: { onPick: (reason: string) => void }) {
  const [other, setOther] = useState('')
  return (
    <div className={styles.reasonPicker}>
      {LOST_REASONS.map((r) => (
        <button type="button" key={r} className={styles.reasonBtn} onClick={() => onPick(r)}>
          {r}
        </button>
      ))}
      <form
        className={styles.otherRow}
        onSubmit={(e) => {
          e.preventDefault()
          if (other.trim()) onPick(other.trim().slice(0, 120))
        }}
      >
        <input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Başka bir neden yaz"
          maxLength={120}
        />
        <button type="submit" className="btn-primary" disabled={!other.trim()}>
          Kaydet
        </button>
      </form>
    </div>
  )
}

function LeadForm({
  team,
  prefill,
  onClose,
  onSaved,
}: {
  team: { id: string; full_name: string | null }[]
  prefill: { phone: string; note: string } | null
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState(prefill?.phone ?? '')
  const [source, setSource] = useState<LeadSource>(prefill ? 'whatsapp' : 'telefon')
  const [interest, setInterest] = useState('')
  const [note, setNote] = useState(prefill?.note ?? '')
  const [assignee, setAssignee] = useState(profile?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile?.business_id) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('leads').insert({
      business_id: profile.business_id,
      full_name: name.trim() || phone.trim(),
      phone: phone.replace(/[^\d+]/g, '') || null,
      source,
      interest: interest.trim() || null,
      note: note.trim() || null,
      assignee_id: assignee || null,
      created_by: profile.id,
    })
    setSaving(false)
    if (err) {
      setError(friendlyDbError(err, 'Kaydedilemedi.'))
      return
    }
    onSaved()
  }

  return (
    <div className={pageStyles.modalBackdrop} onClick={onClose}>
      <div
        className={`card ${pageStyles.modalCard}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={pageStyles.modalHead}>
          <h2>Potansiyel müşteri</h2>
          <button type="button" className={pageStyles.modalClose} onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="leadName">Ad soyad</label>
            <input
              id="leadName"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              required={!phone}
            />
          </div>
          <div className="field">
            <label htmlFor="leadPhone">Telefon</label>
            <input id="leadPhone" type="tel" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="leadSource">Nereden geldi</label>
            <Select
              id="leadSource"
              value={source}
              onChange={(v) => setSource(v as LeadSource)}
              options={SOURCE_OPTIONS}
            />
          </div>
          <div className="field">
            <label htmlFor="leadInterest">İlgilendiği hizmet</label>
            <input
              id="leadInterest"
              value={interest}
              maxLength={120}
              onChange={(e) => setInterest(e.target.value)}
              placeholder="ör. Lazer epilasyon paketi"
            />
          </div>
          <div className="field">
            <label htmlFor="leadAssignee">Kim takip edecek</label>
            <Select
              id="leadAssignee"
              value={assignee}
              onChange={setAssignee}
              options={[
                { value: '', label: 'Atanmamış' },
                ...team.map((m) => ({ value: m.id, label: m.full_name ?? 'Çalışan' })),
              ]}
            />
          </div>
          <div className="field">
            <label htmlFor="leadNote">Not</label>
            <textarea id="leadNote" rows={3} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className={pageStyles.error}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={saving || (!name.trim() && !phone.trim())}>
            {saving ? 'Kaydediliyor…' : 'Huniye ekle'}
          </button>
        </form>
      </div>
    </div>
  )
}
