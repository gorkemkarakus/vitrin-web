import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { currencyWhole as currency } from '../lib/currency'
import styles from './ServiceDescriptionPage.module.css'
import { FIELD_LIMITS } from '../lib/fieldLimits'

interface Service {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number | null
}

// Bot uzun metni de okur; 500 yalnizca "kisa ve net tut" yonlendirmesi.
const SOFT_LIMIT = 500

// "Sik sorulanlari ekle": dokununca metnin sonuna soru satiri eklenir,
// salon sahibi cevabini yanina yazar. Bot yalnizca buraya yazilani kullanir.
const FAQ_PROMPTS = [
  'Ne kadar dayanır?',
  'Hazırlık gerekir mi?',
  'Kimlere uygun değil?',
  'Acıtır mı?',
  'Sonrasında nelere dikkat edilmeli?',
  'Hangi ürün kullanılıyor?',
]

export default function ServiceDescriptionPage() {
  const { id } = useParams<{ id: string }>()
  const [service, setService] = useState<Service | null>(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedHint, setSavedHint] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('services')
        .select('id, name, description, duration_minutes, price')
        .eq('id', id)
        .maybeSingle()
      setService(data)
      setDescription(data?.description ?? '')
      setLoading(false)
    }
    load()
  }, [id])

  async function save() {
    if (!id) return
    setSaving(true)
    await supabase
      .from('services')
      .update({ description: description.trim() || null })
      .eq('id', id)
    setSaving(false)
    setSavedHint(true)
    setTimeout(() => setSavedHint(false), 2000)
  }

  function addPrompt(q: string) {
    const base = description.trimEnd()
    const next = `${base}${base ? '\n' : ''}${q} `
    setDescription(next)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.length, next.length)
    })
  }

  if (loading) return <p className={styles.note}>Yükleniyor…</p>
  if (!service) return <p className={styles.note}>Hizmet bulunamadı.</p>

  const back = `/hizmetler?duzenle=${service.id}`
  const prompts = FAQ_PROMPTS.filter((q) => !description.includes(q))
  const priceText = service.price != null ? `, ${currency.format(service.price)}` : ''
  const intro = description.trim().replace(/\s*\n+\s*/g, ' ')
  const botReply = intro
    ? `${intro} ${service.duration_minutes} dakika sürüyor${priceText}. Size uygun bir saat bakayım mı?`
    : `${service.name} ${service.duration_minutes} dakika sürüyor${priceText}. Detayları salonumuza sorabilirsiniz. Size uygun bir saat bakayım mı?`

  return (
    <div className={styles.wrap}>
      <PageHeader back={back} title={service.name} sub="Müşteri sorduğunda bot ne anlatsın?" />

      <div className={styles.editorCard}>
        <label htmlFor="serviceDesc" className={styles.label}>
          Açıklama
        </label>
        <textarea
          maxLength={FIELD_LIMITS.servicesDescription}
          id="serviceDesc"
          ref={textareaRef}
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="ör. Tırnak şekillendirme, kütikül bakımı ve beyaz uçlu klasik Fransız oje. Kalıcı oje ile yapılır, 2–3 hafta dayanır."
        />
        <div className={styles.editorFoot}>
          <span className={description.length > SOFT_LIMIT ? styles.countOver : styles.count}>
            {description.length} / {SOFT_LIMIT}
          </span>
          {description.length > SOFT_LIMIT && (
            <span className={styles.countHint}>Kısa tutarsan bot daha net anlatır</span>
          )}
        </div>
      </div>

      {prompts.length > 0 && (
        <div className={styles.faqBlock}>
          <span className={styles.groupLabel}>Sık sorulanları ekle</span>
          <div className={styles.faqChips}>
            {prompts.map((q) => (
              <button type="button" key={q} className={styles.faqChip} onClick={() => addPrompt(q)}>
                + {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.chat}>
        <span className={styles.chatLabel}>Bot yaklaşık böyle cevap verir</span>
        <div className={styles.bubbleCustomer}>{service.name} nasıl oluyor, kaç para?</div>
        <div className={styles.bubbleBot}>{botReply}</div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.footerBtn} onClick={save} disabled={saving}>
          {saving ? 'Kaydediliyor…' : savedHint ? 'Kaydedildi ✓' : 'Açıklamayı kaydet'}
        </button>
      </div>
    </div>
  )
}
