import { useState } from 'react'
import { friendlyDbError } from '../lib/dbErrors'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import AiMessageGenerator from './AiMessageGenerator'
import type { Template } from '../pages/BulkMessagePage'
import styles from './TemplateModal.module.css'
import { FIELD_LIMITS } from '../lib/fieldLimits'
import { askConfirm } from '../lib/dialog'

export default function TemplateModal({
  template,
  onClose,
  onSaved,
  onDeleted,
}: {
  template: Template | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const { profile } = useAuth()
  const [title, setTitle] = useState(template?.title ?? '')
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState(template?.message ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!title.trim() || !message.trim()) {
      setError('Başlık ve mesaj gerekli')
      return
    }
    setSaving(true)
    setError(null)
    if (template) {
      const { error: err } = await supabase
        .from('campaign_message_templates')
        .update({ title: title.trim(), message: message.trim() })
        .eq('id', template.id)
      if (err) {
        setError(friendlyDbError(err, 'Şablon kaydedilemedi, tekrar deneyin.'))
        setSaving(false)
        return
      }
    } else {
      if (!profile?.business_id) return
      const { error: err } = await supabase
        .from('campaign_message_templates')
        .insert({ business_id: profile.business_id, title: title.trim(), message: message.trim() })
      if (err) {
        setError(friendlyDbError(err, 'Şablon kaydedilemedi, tekrar deneyin.'))
        setSaving(false)
        return
      }
    }
    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    if (!template) return
    const ok = await askConfirm({
      title: 'Şablon silinsin mi?',
      message: `“${template.title}” şablonu silinecek.`,
      confirmLabel: 'Sil',
      danger: true,
    })
    if (!ok || deleting) return
    setDeleting(true)
    const { error: err } = await supabase.from('campaign_message_templates').delete().eq('id', template.id)
    setDeleting(false)
    if (err) {
      setError('Şablon silinemedi, tekrar deneyin.')
      return
    }
    onDeleted()
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={`card ${styles.card}`} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{template ? 'Şablonu Düzenle' : 'Yeni Şablon'}</h2>

        <div className="field">
          <label htmlFor="templateTitle">Başlık</label>
          <input
            maxLength={FIELD_LIMITS.campaignMessageTemplatesTitle}
            id="templateTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn. İptal Edenler için hatırlatma"
          />
        </div>
        <AiMessageGenerator onGenerated={setMessage} onError={setError} />

        <div className="field">
          <label htmlFor="templateMessage">Mesaj</label>
          <textarea
            maxLength={FIELD_LIMITS.campaignMessageTemplatesMessage}
            id="templateMessage"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Kampanya mesajınızı yazın veya yukarıdan AI ile oluşturun…"
          />
        </div>

        {error && <p className={styles.errorText}>{error}</p>}

        <div className={styles.actions}>
          {template && (
            <button
              type="button"
              className={`btn-secondary ${styles.deleteBtn}`}
              onClick={handleDelete}
              disabled={deleting}
            >
              Sil
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
