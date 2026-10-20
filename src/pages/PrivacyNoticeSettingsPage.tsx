import { useEffect, useState, type FormEvent } from 'react'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { friendlyDbError } from '../lib/dbErrors'
import { publicSiteBase } from '../lib/bookingUrl'
import { salonNoticeComplete, salonNoticeSections } from '../legal/salonNotice'
import styles from './PrivacyNoticeSettingsPage.module.css'

// Salonun musterilerine gosterecegi aydinlatma metni: salon unvan / adres /
// iletisim bilgisini girer, metin sablondan uretilir; online randevu ve anket
// sayfalari bu metne baglanir.
export default function PrivacyNoticeSettingsPage() {
  const { profile } = useAuth()
  const [business, setBusiness] = useState<{ name: string; slug: string | null } | null>(null)
  const [hasBot, setHasBot] = useState(false)
  const [legalName, setLegalName] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!profile?.business_id) return
    Promise.all([
      supabase.from('businesses').select('name, slug').eq('id', profile.business_id).maybeSingle(),
      supabase
        .from('business_privacy_notices')
        .select('legal_name, address, contact_email, contact_phone')
        .maybeSingle(),
      supabase.rpc('my_business_bot_connected'),
    ]).then(([{ data: b }, { data: n }, { data: bot }]) => {
      setBusiness((b as { name: string; slug: string | null } | null) ?? null)
      setLegalName(n?.legal_name ?? '')
      setAddress(n?.address ?? '')
      setEmail(n?.contact_email ?? '')
      setPhone(n?.contact_phone ?? '')
      setHasBot(!!bot)
      setLoaded(true)
    })
  }, [profile?.business_id])

  const complete = salonNoticeComplete({
    legalName,
    address,
    contactEmail: email,
    contactPhone: phone,
  })
  const base = publicSiteBase()
  const url = base && business?.slug ? `${base}/aydinlatma/${business.slug}` : null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile?.business_id) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const { error: err } = await supabase.from('business_privacy_notices').upsert(
      {
        business_id: profile.business_id,
        legal_name: legalName.trim(),
        address: address.trim(),
        contact_email: email.trim() || null,
        contact_phone: phone.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'business_id' },
    )
    setSaving(false)
    if (err) setError(friendlyDbError(err, 'Kaydedilemedi. E-posta biçimini kontrol edin.'))
    else setNotice('Kaydedildi. Online randevu sayfanız artık bu metne bağlanıyor.')
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNotice(url)
    }
  }

  return (
    <div className={styles.wrap}>
      <PageHeader back="/ayarlar" title="Müşteri aydınlatma metni" sub="KVKK gereği müşterilerinizi bilgilendirin" />

      <p className={styles.info}>
        Bilgileri girin, salonunuza özel aydınlatma metni hazırlansın. Online randevu sayfanız bu metne bağlanır.
      </p>

      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.ok}>{notice}</p>}

      {loaded && (
        <div className={styles.grid}>
          <form className={styles.card} onSubmit={save}>
            <h2 className={styles.cardTitle}>İşletme bilgileri</h2>
            <div className="field">
              <label htmlFor="noticeLegalName">Ticari unvan ya da ad soyad</label>
              <input
                id="noticeLegalName"
                value={legalName}
                maxLength={200}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="ör. Ayşe Yılmaz Güzellik Hizmetleri"
                required
              />
              <span className={styles.hint}>Vergi levhasındaki ad. Şahıs işletmesiyseniz kendi adınız.</span>
            </div>
            <div className="field">
              <label htmlFor="noticeAddress">Adres</label>
              <input
                id="noticeAddress"
                value={address}
                maxLength={300}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="noticeEmail">Başvuru e-postası</label>
              <input
                id="noticeEmail"
                type="email"
                value={email}
                maxLength={200}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="noticePhone">Başvuru telefonu</label>
              <input
                id="noticePhone"
                type="tel"
                value={phone}
                maxLength={32}
                onChange={(e) => setPhone(e.target.value)}
              />
              <span className={styles.hint}>E-posta ya da telefondan en az biri gerekli.</span>
            </div>
            <button type="submit" className="btn-primary" disabled={saving || !complete}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>

            <div className={styles.linkBox}>
              <span className={styles.linkLabel}>Bağlantı</span>
              {url ? (
                <>
                  <span className={styles.linkUrl}>{url}</span>
                  <span className={styles.linkActions}>
                    <button type="button" className={styles.linkBtn} onClick={copy}>
                      {copied ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                    <a className={styles.linkBtn} href={url} target="_blank" rel="noopener noreferrer">
                      Aç
                    </a>
                  </span>
                </>
              ) : (
                <span className={styles.hint}>Site adresi ayarlanınca burada görünür.</span>
              )}
            </div>
          </form>

          <section className={styles.preview} aria-label="Önizleme">
            <span className={styles.previewLabel}>Önizleme</span>
            {salonNoticeSections({
              businessName: business?.name ?? '',
              legalName: legalName || null,
              address: address || null,
              contactEmail: email || null,
              contactPhone: phone || null,
              hasBot,
            }).map((s) => (
              <div key={s.heading} className={styles.previewSection}>
                <h3>{s.heading}</h3>
                {s.paragraphs?.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {s.items && (
                  <ul>
                    {s.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                )}
                {s.after?.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}
