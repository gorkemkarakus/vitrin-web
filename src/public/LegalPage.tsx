import { Navigate } from 'react-router-dom'
import { getLegalDocument, type LegalDocument } from '../legal/documents'
import LegalLayout from './LegalLayout'
import styles from './LegalPage.module.css'

export default function LegalPage({ slug }: { slug: LegalDocument['slug'] }) {
  const doc = getLegalDocument(slug)
  if (!doc) return <Navigate to="/" replace />

  return (
    <LegalLayout title={doc.title} current={`/${doc.slug}`}>
      <p className={styles.summary}>{doc.summary}</p>
      <article className={styles.article}>
        {doc.sections.map((s) => (
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
    </LegalLayout>
  )
}
