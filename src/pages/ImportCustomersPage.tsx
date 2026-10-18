import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Select from '../components/Select'
import WideOnly from '../components/WideOnly'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { planBlockFromError, notifyPlanBlock } from '../lib/planBlock'
import { buildXlsx } from '../lib/xlsx'
import { saveAndShareFile } from '../lib/saveFile'
import { SOURCE_LABEL } from '../lib/customerCrm'
import { readSpreadsheet, SpreadsheetError } from '../lib/spreadsheetReader'
import {
  IMPORT_FIELD_LABEL,
  buildCandidates,
  guessField,
  phoneKey,
  type ImportCandidate,
  type ImportField,
} from '../lib/customerImport'
import styles from './ImportCustomersPage.module.css'

type Step = 'dosya' | 'eslestir' | 'aktariliyor' | 'bitti'

const FIELD_OPTIONS = (Object.keys(IMPORT_FIELD_LABEL) as ImportField[]).map((value) => ({
  value,
  label: IMPORT_FIELD_LABEL[value],
}))

const STATUS_LABEL: Record<ImportCandidate['status'], string> = {
  yeni: 'Eklenecek',
  mevcut: 'Zaten kayıtlı',
  tekrar: 'Tekrar',
  hatali: 'Hatalı',
}

const BATCH = 100

// Musteriler > Ice aktar: Excel / CSV'den toplu musteri. Yalnizca genis ekran.
export default function ImportCustomersPage() {
  return (
    <WideOnly title="Müşterileri içe aktar" back="/musteriler">
      <ImportCustomers />
    </WideOnly>
  )
}

function ImportCustomers() {
  const navigate = useNavigate()
  const { profile, plan, refreshPlan } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('dosya')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ImportField[]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<{
    added: number
    skipped: number
    stoppedByPlan: boolean
    // Dosyadaki durum sayilari aktarim anindaki haliyle (adim degisince yeniden hesaplanmaz).
    counts: { mevcut: number; tekrar: number; hatali: number }
  } | null>(null)

  async function loadFile(file: File) {
    setError(null)
    try {
      const data = await readSpreadsheet(file)
      const { data: phones } = await supabase.from('customers').select('phone, contact_phone').limit(20000)
      setExisting(
        new Set(
          (phones ?? []).flatMap((c) => [phoneKey(c.phone), phoneKey(c.contact_phone)]).filter((k) => k.length >= 10),
        ),
      )
      const width = Math.max(...data.map((r) => r.length))
      const header = data[0] ?? []
      const guessed = Array.from({ length: width }, (_, i) => guessField(header[i] ?? ''))
      // Baslik satiri yok gibi gorunuyorsa (hicbir sutun taninmadi) ilk satir veri sayilir.
      const looksLikeHeader = guessed.some((f) => f !== 'skip')
      setHasHeader(looksLikeHeader)
      setMapping(looksLikeHeader ? guessed : Array.from({ length: width }, () => 'skip' as ImportField))
      setRows(data)
      setFileName(file.name)
      setStep('eslestir')
    } catch (e) {
      setError(e instanceof SpreadsheetError ? e.message : 'Dosya okunamadı.')
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void loadFile(file)
  }

  async function downloadTemplate() {
    const bytes = buildXlsx([
      {
        name: 'Müşteriler',
        columns: [
          { header: 'Ad Soyad', width: 24 },
          { header: 'Telefon', width: 16 },
          { header: 'E-posta', width: 24 },
          { header: 'Doğum tarihi', width: 14 },
          { header: 'Etiketler', width: 20 },
          { header: 'Nereden geldi', width: 16 },
          { header: 'Not', width: 36 },
        ],
        rows: [
          ['Ayşe Demir', '0532 111 22 33', 'ayse@ornek.com', '15.03.1990', 'VIP, Boya', 'Instagram', 'Amonyaksız boya'],
        ],
      },
    ])
    await saveAndShareFile(
      bytes,
      'adapptiv-musteri-sablonu.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Müşteri şablonu',
    )
  }

  const candidates = useMemo(
    () => (step === 'eslestir' ? buildCandidates(rows, mapping, { hasHeader, existingPhoneKeys: existing }) : []),
    [step, rows, mapping, hasHeader, existing],
  )
  const counts = useMemo(() => {
    const c = { yeni: 0, mevcut: 0, tekrar: 0, hatali: 0 }
    for (const x of candidates) c[x.status]++
    return c
  }, [candidates])
  const hasName = mapping.includes('full_name') || mapping.includes('first_name')

  // Paket siniri: kalan musteri hakki (null = sinirsiz)
  const remaining =
    plan && typeof plan.limits.max_customers === 'number'
      ? Math.max(0, plan.limits.max_customers - plan.usage.customers)
      : null
  const toImport = candidates.filter((c) => c.status === 'yeni')
  const willImport = remaining === null ? toImport.length : Math.min(toImport.length, remaining)

  async function runImport() {
    if (!profile?.business_id) return
    const list = toImport.slice(0, willImport)
    setStep('aktariliyor')
    setProgress({ done: 0, total: list.length })
    let added = 0
    let skipped = 0
    let stoppedByPlan = false
    const rowOf = (c: ImportCandidate) => ({
      business_id: profile.business_id,
      full_name: c.full_name,
      phone: c.phone,
      email: c.email,
      birthday: c.birthday,
      notes: c.notes,
      tags: c.tags,
      source: c.source,
    })
    for (let i = 0; i < list.length && !stoppedByPlan; i += BATCH) {
      const batch = list.slice(i, i + BATCH)
      const { error: err } = await supabase.from('customers').insert(batch.map(rowOf))
      if (!err) added += batch.length
      else {
        // Toplu ekleme reddedildiyse (ör. bu arada eklenmis ayni telefon) tek tek denenir.
        for (const c of batch) {
          const { error: one } = await supabase.from('customers').insert(rowOf(c))
          if (!one) added++
          else if (planBlockFromError(one)) {
            notifyPlanBlock(planBlockFromError(one)!)
            stoppedByPlan = true
            break
          } else skipped++
        }
      }
      setProgress({ done: Math.min(i + BATCH, list.length), total: list.length })
    }
    setResult({
      added,
      skipped,
      stoppedByPlan,
      counts: { mevcut: counts.mevcut, tekrar: counts.tekrar, hatali: counts.hatali },
    })
    void refreshPlan()
    setStep('bitti')
  }

  if (step === 'bitti' && result) {
    return (
      <div className={styles.wrap}>
        <PageHeader back="/musteriler" title="Müşterileri içe aktar" />
        <section className={styles.card}>
          <h2 className={styles.big}>{result.added.toLocaleString('tr-TR')} müşteri eklendi</h2>
          <p className={styles.muted}>
            {[
              result.counts.mevcut > 0 && `${result.counts.mevcut} kişi zaten kayıtlı olduğu için atlandı`,
              result.counts.tekrar > 0 && `${result.counts.tekrar} satır dosyada tekrar ediyordu`,
              result.counts.hatali > 0 && `${result.counts.hatali} satır hatalıydı`,
              result.skipped > 0 && `${result.skipped} satır eklenemedi`,
              result.stoppedByPlan && 'paket sınırına ulaşıldığı için durduruldu',
            ]
              .filter(Boolean)
              .join(' · ') || 'Hepsi sorunsuz eklendi.'}
          </p>
          <p className={styles.muted}>
            İçe aktarılan müşterilere kampanya izni verilmedi; toplu mesaj yalnızca izin veren müşterilere gider.
          </p>
          <div className={styles.actionsRow}>
            <button type="button" className="btn-primary" onClick={() => navigate('/musteriler')}>
              Müşterilere git
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setStep('dosya')
                setResult(null)
              }}
            >
              Başka dosya yükle
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/musteriler"
        title="Müşterileri içe aktar"
        sub="Başka programdan ya da Excel listenizden müşterilerinizi tek seferde ekleyin."
      />

      {step === 'dosya' && (
        <div className={styles.grid}>
          <div
            className={dragging ? `${styles.drop} ${styles.dropActive}` : styles.drop}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className={styles.dropTitle}>Excel ya da CSV dosyasını buraya bırakın</span>
            <span className={styles.muted}>.xlsx ve .csv · en fazla 5.000 satır</span>
            <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
              Dosya seç
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void loadFile(f)
                e.target.value = ''
              }}
            />
            {error && <p className={styles.error}>{error}</p>}
          </div>
          <aside className={styles.card}>
            <h2 className={styles.cardTitle}>Dosyanız nasıl olmalı?</h2>
            <ul className={styles.list}>
              <li>Her satır bir müşteri; ilk satırda sütun adları (Ad Soyad, Telefon…).</li>
              <li>Sütunları bir sonraki adımda siz eşleştirirsiniz; ad ve soyad ayrı sütunlarda da olabilir.</li>
              <li>Aynı telefonla kayıtlı müşteriler atlanır, iki kez eklenmez.</li>
              <li>İçe aktarılanlara kampanya izni verilmez (KVKK / İYS).</li>
            </ul>
            <button type="button" className={styles.link} onClick={downloadTemplate}>
              Örnek şablonu indir (.xlsx)
            </button>
          </aside>
        </div>
      )}

      {step === 'eslestir' && (
        <>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Sütunları eşleştirin · {fileName}</h2>
              <label className={styles.check}>
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                İlk satır başlık
              </label>
            </div>
            <div className={styles.mapGrid}>
              {mapping.map((field, i) => (
                <div key={i} className={styles.mapCol}>
                  <span className={styles.mapHeader}>
                    {hasHeader ? rows[0]?.[i] || `Sütun ${i + 1}` : `Sütun ${i + 1}`}
                  </span>
                  <span className={styles.mapSample}>
                    {rows
                      .slice(hasHeader ? 1 : 0, hasHeader ? 4 : 3)
                      .map((r) => r[i])
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                  <Select
                    ariaLabel={`Sütun ${i + 1} alanı`}
                    value={field}
                    onChange={(v) => setMapping(mapping.map((m, j) => (j === i ? (v as ImportField) : m)))}
                    options={FIELD_OPTIONS}
                  />
                </div>
              ))}
            </div>
            {!hasName && (
              <p className={styles.error}>Müşteri adını içeren sütunu “Ad soyad” (ya da Ad + Soyad) olarak seçin.</p>
            )}
          </section>

          {hasName && (
            <section className={styles.card}>
              <div className={styles.summary}>
                <span className={`${styles.pill} ${styles.pillOk}`}>{counts.yeni} eklenecek</span>
                {counts.mevcut > 0 && <span className={styles.pill}>{counts.mevcut} zaten kayıtlı</span>}
                {counts.tekrar > 0 && <span className={styles.pill}>{counts.tekrar} tekrar</span>}
                {counts.hatali > 0 && (
                  <span className={`${styles.pill} ${styles.pillBad}`}>{counts.hatali} hatalı</span>
                )}
              </div>
              {remaining !== null && toImport.length > remaining && (
                <p className={styles.warn}>
                  Paketinizde {remaining} müşteri hakkı kaldı; ilk {remaining} müşteri eklenecek.{' '}
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => navigate('/planlar?neden=max_customers')}
                  >
                    Paketleri gör
                  </button>
                </p>
              )}
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Satır</th>
                      <th>Ad soyad</th>
                      <th>Telefon</th>
                      <th>E-posta</th>
                      <th>Doğum tarihi</th>
                      <th>Etiketler</th>
                      <th>Kaynak</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.slice(0, 100).map((c) => (
                      <tr key={c.line} className={c.status === 'yeni' ? undefined : styles.rowMuted}>
                        <td>{c.line}</td>
                        <td>{c.full_name || '—'}</td>
                        <td>{c.phone ?? '—'}</td>
                        <td>{c.email ?? '—'}</td>
                        <td>{c.birthday ? new Date(`${c.birthday}T00:00:00`).toLocaleDateString('tr-TR') : '—'}</td>
                        <td>{c.tags.join(', ') || '—'}</td>
                        <td>{c.source ? SOURCE_LABEL[c.source] : '—'}</td>
                        <td>
                          <span className={c.status === 'hatali' ? styles.bad : undefined}>
                            {STATUS_LABEL[c.status]}
                          </span>
                          {c.problem && c.status !== 'yeni' && <span className={styles.problem}>{c.problem}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {candidates.length > 100 && (
                <p className={styles.muted}>İlk 100 satır gösteriliyor ({candidates.length} satır).</p>
              )}
              <div className={styles.actionsRow}>
                <button type="button" className="btn-primary" disabled={willImport === 0} onClick={runImport}>
                  {willImport.toLocaleString('tr-TR')} müşteriyi içe aktar
                </button>
                <button type="button" className="btn-secondary" onClick={() => setStep('dosya')}>
                  Başka dosya seç
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {step === 'aktariliyor' && (
        <section className={styles.card} aria-live="polite">
          <h2 className={styles.cardTitle}>Aktarılıyor…</h2>
          <div className={styles.bar}>
            <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <span className={styles.muted}>
            {progress.done.toLocaleString('tr-TR')} / {progress.total.toLocaleString('tr-TR')}
          </span>
        </section>
      )}
    </div>
  )
}
