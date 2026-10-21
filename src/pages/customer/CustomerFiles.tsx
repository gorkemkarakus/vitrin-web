import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  FILE_KIND_LABEL,
  deleteCustomerFile,
  listCustomerFiles,
  uploadCustomerFile,
  type CustomerFile,
  type FileKind,
} from '../../lib/customerFiles'
import styles from './CustomerFiles.module.css'
import { askConfirm } from '../../lib/dialog'

const KINDS = Object.keys(FILE_KIND_LABEL) as FileKind[]

// Musteri kartinda oncesi/sonrasi fotograflari, onam formlari, belgeler.
// Telefonda "Ekle" kamerayi da acar.
export default function CustomerFiles({ customerId }: { customerId: string }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<CustomerFile[] | null>(null)
  const [kind, setKind] = useState<FileKind>('oncesi')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setFiles(await listCustomerFiles(customerId))
    } catch {
      setFiles([])
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  async function onPick(list: FileList | null) {
    if (!list || !profile?.business_id) return
    setBusy(true)
    setError(null)
    for (const f of Array.from(list).slice(0, 10)) {
      const err = await uploadCustomerFile(profile.business_id, customerId, f, kind)
      if (err) {
        setError(`${f.name}: ${err}`)
        break
      }
    }
    setBusy(false)
    void load()
  }

  async function remove(f: CustomerFile) {
    if (
      !(await askConfirm({
        title: 'Dosya silinsin mi?',
        message: `“${f.file_name}”`,
        confirmLabel: 'Sil',
        danger: true,
      }))
    )
      return
    const err = await deleteCustomerFile(f)
    if (err) setError(err)
    void load()
  }

  return (
    <section className={styles.card} aria-labelledby="customerFilesTitle">
      <div className={styles.head}>
        <h2 id="customerFilesTitle" className={styles.title}>
          Fotoğraflar ve belgeler {files && files.length > 0 && <span className={styles.count}>· {files.length}</span>}
        </h2>
        <button type="button" className={styles.addBtn} disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Yükleniyor…' : '+ Ekle'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={(e) => {
            void onPick(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      <div className={styles.kinds} role="radiogroup" aria-label="Eklenecek dosyanın türü">
        {KINDS.map((k) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={kind === k}
            className={kind === k ? styles.kindActive : styles.kind}
            onClick={() => setKind(k)}
          >
            {FILE_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {files && files.length === 0 && (
        <p className={styles.hint}>
          Öncesi-sonrası fotoğraflarını, onam formunu ya da belgeleri buraya ekleyin. Fotoğraf kişisel veridir;
          müşterinin iznini alın.
        </p>
      )}
      {files && files.length > 0 && (
        <div className={styles.grid}>
          {files.map((f) => (
            <figure key={f.id} className={styles.tile}>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.thumb}
                aria-label={`${f.file_name} aç`}
              >
                {f.mime.startsWith('image/') && f.mime !== 'image/heic' && f.url ? (
                  <img src={f.url} alt="" loading="lazy" />
                ) : (
                  <span className={styles.docIcon}>{f.mime === 'application/pdf' ? 'PDF' : 'Dosya'}</span>
                )}
                <span className={styles.badge}>{FILE_KIND_LABEL[f.kind]}</span>
              </a>
              <figcaption className={styles.caption}>
                <span>{new Date(f.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                {(isAdmin || f.uploaded_by === profile?.id) && (
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => remove(f)}
                    aria-label={`${f.file_name} sil`}
                  >
                    Sil
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}
