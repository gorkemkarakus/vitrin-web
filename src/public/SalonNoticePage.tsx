import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { LEGAL_INFO } from '../legal/legalInfo'
import { salonNoticeComplete, salonNoticeSections, type SalonNoticeInput } from '../legal/salonNotice'
import styles from './LegalPage.module.css'

interface NoticeRow {
  business_name: string
  legal_name: string | null
  address: string | null
  contact_email: string | null
  contact_phone: string | null
  has_bot: boolean
  updated_at: string | null
}

// Salonun kendi musterilerine yonelik aydinlatma metni (giris gerektirmez).
// Online randevu sayfasi, anket sayfasi ve salonun paylastigi baglanti buraya
// gelir. Metin src/legal/salonNotice.ts sablonundan uretilir.
export default function SalonNoticePage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [row, setRow] = useState<NoticeRow | null | undefined>(undefined)

  useEffect(() => {
    supabase
      .rpc('privacy_notice', { p_slug: slug })
      .then(({ data, error }) => setRow(error ? null : (((data ?? []) as NoticeRow[])[0] ?? null)))
  }, [slug])

  const input: SalonNoticeInput | null = row
    ? {
        businessName: row.business_name,
        legalName: row.legal_name,
        address: row.address,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        hasBot: row.has_bot,
      }
    : null

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <span className={styles.brand}>{row?.business_name ?? LEGAL_INFO.brand}</span>
        </div>
        {row === undefined && <p className={styles.summary}>Yükleniyor…</p>}
        {row === null && (
          <>
            <h1 className={styles.title}>Sayfa bulunamadı</h1>
            <p className={styles.summary}>Bağlantı hatalı olabilir.</p>
          </>
        )}
        {input && (
          <>
            <h1 className={styles.title}>Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni</h1>
            {row?.updated_at && (
              <p className={styles.updated}>
                Son güncelleme:{' '}
                {new Date(row.updated_at).toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
            {!salonNoticeComplete(input) && (
              <p className={styles.summary}>
                {row?.business_name} bu metindeki iletişim bilgilerini henüz tamamlamadı. Sorularınız için doğrudan
                salona başvurabilirsiniz.
              </p>
            )}
            <article className={styles.article}>
              {salonNoticeSections(input).map((s) => (
                <section key={s.heading} className={styles.section}>
                  <h2>{s.heading}</h2>
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
                </section>
              ))}
            </article>
          </>
        )}
      </div>
    </div>
  )
}
