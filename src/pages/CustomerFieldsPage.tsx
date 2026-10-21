import { useCallback, useEffect, useState, type FormEvent } from 'react'
import PageHeader from '../components/PageHeader'
import Select from '../components/Select'
import WideOnly from '../components/WideOnly'
import { LockIcon } from '../components/icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { friendlyDbError } from '../lib/dbErrors'
import { FIELD_TYPE_LABEL, fetchFieldDefinitions, type FieldDefinition, type FieldType } from '../lib/customerCrm'
import styles from './customer/Crm.module.css'
import pageStyles from './CustomerFieldsPage.module.css'
import { askConfirm } from '../lib/dialog'

const TYPE_OPTIONS = (Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((value) => ({
  value,
  label: FIELD_TYPE_LABEL[value],
}))

const EXAMPLES = ['Alerji', 'Cilt tipi', 'Saç tipi', 'Boya formülü', 'Ayakkabı numarası']

// Ayarlar > Musteri alanlari: isletmenin musteri kartina ekledigi kendi alanlari.
// Yalnizca genis ekran (yonetim ayari).
export default function CustomerFieldsPage() {
  return (
    <WideOnly title="Müşteri alanları" back="/ayarlar">
      <CustomerFields />
    </WideOnly>
  )
}

function CustomerFields() {
  const { profile } = useAuth()
  const [fields, setFields] = useState<FieldDefinition[] | null>(null)
  const [label, setLabel] = useState('')
  const [type, setType] = useState<FieldType>('text')
  const [options, setOptions] = useState('')
  const [sensitive, setSensitive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setFields(await fetchFieldDefinitions())
    } catch (e) {
      setError(friendlyDbError(e, 'Alanlar yüklenemedi.'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!profile?.business_id) return
    const opts = options
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    if (type === 'select' && opts.length < 2) {
      setError('Seçenek listesi için virgülle ayrılmış en az iki seçenek yazın.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('customer_field_definitions').insert({
      business_id: profile.business_id,
      label: label.trim(),
      type,
      options: type === 'select' ? opts.slice(0, 30) : [],
      sensitive,
      sort: (fields?.length ?? 0) + 1,
    })
    setSaving(false)
    if (err) {
      setError(
        err.code === '23505'
          ? 'Bu isimde bir alan zaten var.'
          : friendlyDbError(err, 'Alan eklenemedi, lütfen tekrar deneyin.'),
      )
      return
    }
    setLabel('')
    setOptions('')
    setSensitive(false)
    setType('text')
    void load()
  }

  async function move(index: number, dir: -1 | 1) {
    if (!fields || !fields[index + dir]) return
    const next = [...fields]
    ;[next[index], next[index + dir]] = [next[index + dir], next[index]]
    setFields(next)
    // Tum alanlar yeniden numaralanir (yalniz ikisini degistirmek diger
    // alanlarin eski sira degerleriyle cakisabiliyordu).
    await Promise.all(
      next.map((f, i) =>
        supabase
          .from('customer_field_definitions')
          .update({ sort: i + 1 })
          .eq('id', f.id),
      ),
    )
    void load()
  }

  async function remove(def: FieldDefinition) {
    if (
      !(await askConfirm({
        title: 'Alan silinsin mi?',
        message: `“${def.label}” silinir; müşteri kartlarında bu alana yazılmış değerler de görünmez olur.`,
        confirmLabel: 'Sil',
        danger: true,
      }))
    )
      return
    const { error: err } = await supabase.from('customer_field_definitions').delete().eq('id', def.id)
    if (err) setError(friendlyDbError(err, 'Silinemedi.'))
    void load()
  }

  return (
    <div className={pageStyles.wrap}>
      <PageHeader
        back="/ayarlar"
        title="Müşteri alanları"
        sub="Müşteri kartına kendi bilgilerinizi ekleyin: alerji, cilt tipi, boya formülü…"
      />

      <div className={pageStyles.grid}>
        <section className={styles.card} aria-labelledby="fieldListTitle">
          <h2 id="fieldListTitle" className={styles.cardTitle}>
            Alanlar
          </h2>
          {!fields && <p className={styles.emptyHint}>Yükleniyor…</p>}
          {fields?.length === 0 && (
            <p className={styles.emptyHint}>
              Henüz alan yok. Örnekler: {EXAMPLES.join(', ')}. Eklediğiniz alanlar her müşterinin kartında “Bilgiler”
              bölümünde görünür.
            </p>
          )}
          {fields && fields.length > 0 && (
            <div className={pageStyles.table} role="table" aria-label="Müşteri alanları">
              <div className={pageStyles.thead} role="row">
                <span role="columnheader">Alan</span>
                <span role="columnheader">Tür</span>
                <span role="columnheader">Sıra</span>
                <span role="columnheader" />
              </div>
              {fields.map((f, i) => (
                <div key={f.id} className={pageStyles.tr} role="row">
                  <span role="cell" className={pageStyles.name}>
                    {f.sensitive && <LockIcon width={13} height={13} aria-label="Özel nitelikli veri" />}
                    {f.label}
                  </span>
                  <span role="cell" className={pageStyles.muted}>
                    {FIELD_TYPE_LABEL[f.type]}
                    {f.type === 'select' ? ` · ${f.options.join(', ')}` : ''}
                  </span>
                  <span role="cell" className={pageStyles.order}>
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label={`${f.label} yukarı`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === fields.length - 1}
                      aria-label={`${f.label} aşağı`}
                    >
                      ↓
                    </button>
                  </span>
                  <span role="cell">
                    <button type="button" className={styles.deleteBtn} onClick={() => remove(f)}>
                      Sil
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <form className={styles.card} onSubmit={add} aria-labelledby="fieldAddTitle">
          <h2 id="fieldAddTitle" className={styles.cardTitle}>
            Yeni alan
          </h2>
          <div className="field">
            <label htmlFor="fieldLabel">Alan adı</label>
            <input
              id="fieldLabel"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ör. Cilt tipi"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="fieldType">Tür</label>
            <Select id="fieldType" value={type} onChange={(v) => setType(v as FieldType)} options={TYPE_OPTIONS} />
          </div>
          {type === 'select' && (
            <div className="field">
              <label htmlFor="fieldOptions">Seçenekler (virgülle ayırın)</label>
              <input
                id="fieldOptions"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="ör. Kuru, Yağlı, Karma, Hassas"
              />
            </div>
          )}
          <label className={`field ${styles.checkRow}`}>
            <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
            Özel nitelikli veri (sağlık, alerji…)
          </label>
          {sensitive && (
            <p className={styles.kvkkNote}>
              KVKK’ya göre sağlık bilgisi gibi özel nitelikli veriler yalnızca müşterinin açık rızasıyla kaydedilebilir.
              Bu alan kartta kilit işaretiyle gösterilir.
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={saving || !label.trim()}>
            {saving ? 'Ekleniyor…' : 'Alanı ekle'}
          </button>
        </form>
      </div>
    </div>
  )
}
