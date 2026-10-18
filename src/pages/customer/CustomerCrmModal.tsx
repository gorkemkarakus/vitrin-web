import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Select from '../../components/Select'
import { supabase } from '../../lib/supabase'
import { friendlyDbError } from '../../lib/dbErrors'
import { SOURCE_OPTIONS, cleanTag, type CustomFieldValues, type FieldDefinition } from '../../lib/customerCrm'
import type { CrmCustomer } from './CustomerProfileCard'
import pageStyles from '../CustomerDetailPage.module.css'
import styles from './Crm.module.css'

const MAX_TAGS = 20

// "Bilgiler" duzenleme: kaynak, dogum gunu, etiketler, isletmenin alanlari.
export default function CustomerCrmModal({
  customerId,
  customer,
  fields,
  onClose,
  onSaved,
}: {
  customerId: string
  customer: CrmCustomer
  fields: FieldDefinition[]
  onClose: () => void
  onSaved: () => void
}) {
  const [source, setSource] = useState<string>(customer.source ?? '')
  const [birthday, setBirthday] = useState(customer.birthday ?? '')
  const [tags, setTags] = useState<string[]>(customer.tags)
  const [tagDraft, setTagDraft] = useState('')
  const [values, setValues] = useState<CustomFieldValues>({ ...(customer.custom_fields ?? {}) })
  const [knownTags, setKnownTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Isletmede kullanilan etiketler oneri olarak (yazim birligi icin).
  useEffect(() => {
    supabase
      .from('customers')
      .select('tags')
      .neq('tags', '{}')
      .limit(1000)
      .then(({ data }) => {
        const counts = new Map<string, number>()
        for (const row of data ?? [])
          for (const t of (row.tags as string[]) ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
        setKnownTags([...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t))
      })
  }, [])

  const suggestions = useMemo(() => knownTags.filter((t) => !tags.includes(t)).slice(0, 10), [knownTags, tags])
  const hasSensitive = fields.some((f) => f.sensitive)

  function addTag(raw: string) {
    const t = cleanTag(raw)
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) return
    setTags([...tags, t])
    setTagDraft('')
  }

  function setValue(id: string, v: string | number | boolean | null) {
    setValues((prev) => ({ ...prev, [id]: v }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    // Bos degerler kaydedilmez; silinmis alanlarin degerleri de temizlenir.
    const custom: CustomFieldValues = {}
    for (const def of fields) {
      const v = values[def.id]
      if (v === null || v === undefined || v === '' || (def.type === 'checkbox' && v === false)) continue
      custom[def.id] = v
    }
    const { error: err } = await supabase
      .from('customers')
      .update({
        source: source || null,
        birthday: birthday || null,
        tags: tagDraft.trim() ? [...tags, cleanTag(tagDraft)].filter((t, i, a) => t && a.indexOf(t) === i) : tags,
        custom_fields: custom,
      })
      .eq('id', customerId)
    setSaving(false)
    if (err) {
      setError(friendlyDbError(err, 'Kaydedilemedi, lütfen tekrar deneyin.'))
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
        aria-labelledby="crmModalTitle"
      >
        <div className={pageStyles.modalHead}>
          <h2 id="crmModalTitle">Bilgileri düzenle</h2>
          <button type="button" className={pageStyles.modalClose} onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="crmSource">Nereden geldi</label>
            <Select
              id="crmSource"
              value={source}
              onChange={setSource}
              options={[{ value: '', label: 'Belirtilmedi' }, ...SOURCE_OPTIONS]}
            />
          </div>
          <div className="field">
            <label htmlFor="crmBirthday">Doğum günü</label>
            <input id="crmBirthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="crmTag">Etiketler</label>
            {tags.length > 0 && (
              <div className={styles.tags} style={{ marginBottom: 8 }}>
                {tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                    <button
                      type="button"
                      className={styles.tagRemove}
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      aria-label={`${t} etiketini kaldır`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className={styles.tagInputRow}>
              <input
                id="crmTag"
                value={tagDraft}
                maxLength={30}
                placeholder="ör. VIP, gelin, hassas cilt"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addTag(tagDraft)
                  }
                }}
                disabled={tags.length >= MAX_TAGS}
              />
              <button type="button" className={styles.addBtn} onClick={() => addTag(tagDraft)}>
                Ekle
              </button>
            </div>
            {suggestions.length > 0 && (
              <div className={styles.tags} style={{ marginTop: 8 }}>
                {suggestions.map((t) => (
                  <button type="button" key={t} className={styles.tagSuggest} onClick={() => addTag(t)}>
                    + {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasSensitive && (
            <p className={styles.kvkkNote}>
              Kilitli alanlar (sağlık, alerji gibi) KVKK’da özel nitelikli kişisel veridir. Yalnızca müşterinin açık
              rızasını aldıysanız doldurun.
            </p>
          )}

          {fields.map((def) => {
            const id = `crmField-${def.id}`
            const v = values[def.id]
            if (def.type === 'checkbox') {
              return (
                <label key={def.id} className={`field ${styles.checkRow}`}>
                  <input type="checkbox" checked={v === true} onChange={(e) => setValue(def.id, e.target.checked)} />
                  {def.label}
                </label>
              )
            }
            return (
              <div key={def.id} className="field">
                <label htmlFor={id}>
                  {def.label}
                  {def.sensitive ? ' (özel nitelikli)' : ''}
                </label>
                {def.type === 'select' ? (
                  <Select
                    id={id}
                    value={typeof v === 'string' ? v : ''}
                    onChange={(x) => setValue(def.id, x || null)}
                    options={[{ value: '', label: 'Seçilmedi' }, ...def.options.map((o) => ({ value: o, label: o }))]}
                  />
                ) : (
                  <input
                    id={id}
                    type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                    maxLength={def.type === 'text' ? 300 : undefined}
                    value={v === null || v === undefined ? '' : String(v)}
                    onChange={(e) =>
                      setValue(
                        def.id,
                        def.type === 'number'
                          ? e.target.value === ''
                            ? null
                            : Number(e.target.value)
                          : e.target.value || null,
                      )
                    }
                  />
                )}
              </div>
            )
          })}

          {error && <p className={pageStyles.error}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Bilgileri kaydet'}
          </button>
        </form>
      </div>
    </div>
  )
}
