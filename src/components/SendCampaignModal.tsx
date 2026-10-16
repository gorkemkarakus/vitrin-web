import { useState } from 'react'
import { callEdgeFunction } from '../lib/edgeFunctions'
import { NETWORK_ERROR } from '../lib/messages'
import AiMessageGenerator from './AiMessageGenerator'
import Select from './Select'
import type { Template } from '../pages/TopluMesajPage'
import styles from './SendCampaignModal.module.css'

export default function SendCampaignModal({
  targetName,
  memberIds,
  initialMessage,
  templates,
  onClose,
}: {
  targetName: string
  memberIds: string[]
  initialMessage?: string
  templates: Template[]
  onClose: () => void
}) {
  const [message, setMessage] = useState(initialMessage ?? '')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null)

  function handlePickTemplate(templateId: string) {
    setSelectedTemplateId(templateId)
    const t = templates.find((tpl) => tpl.id === templateId)
    if (t) setMessage(t.message)
  }

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await callEdgeFunction<{ sent: number; failed: number }>('send-bulk-campaign', {
        customerIds: memberIds,
        message: message.trim(),
      })
      if (!res.ok) {
        setError(res.error ?? 'Gönderilemedi.')
        return
      }
      setResult(res.data)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={`card ${styles.card}`} onClick={(e) => e.stopPropagation()}>
        {result ? (
          <>
            <h2 className={styles.title}>Kaydedildi</h2>
            <p className={styles.resultText}>
              <strong>{result.sent}</strong> müşteri için mesaj kaydedildi
              {result.failed > 0 ? ` (${result.failed} başarısız — telefon numarası eksik olabilir)` : ''}.
            </p>
            <p className={styles.hint}>
              WhatsApp bağlantısı henüz aktif değil — gerçek gönderim, bağlantı kurulduğunda bu mesajlar için otomatik
              başlayacak.
            </p>
            <button type="button" className="btn-primary" onClick={onClose}>
              Tamam
            </button>
          </>
        ) : (
          <>
            <h2 className={styles.title}>Mesaj Gönder</h2>
            <p className={styles.target}>
              <strong>{targetName}</strong> — {memberIds.length} kişi
            </p>
            {templates.length > 0 && (
              <div className="field">
                <label htmlFor="templatePick">Kampanya Mesajlarından Seç (opsiyonel)</label>
                <Select
                  id="templatePick"
                  value={selectedTemplateId}
                  onChange={handlePickTemplate}
                  placeholder="Bir şablon seçin…"
                  options={templates.map((t) => ({
                    value: t.id,
                    label: t.title,
                    sub: t.message.length > 60 ? `${t.message.slice(0, 60)}…` : t.message,
                  }))}
                />
              </div>
            )}
            <AiMessageGenerator onGenerated={setMessage} onError={setError} />
            <div className="field">
              <label htmlFor="campaignMessage">Mesaj</label>
              <textarea
                id="campaignMessage"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Müşterilerinize göndermek istediğiniz mesajı yazın veya yukarıdan AI ile oluşturun…"
              />
            </div>
            <p className={styles.hint}>
              Not: WhatsApp bağlantısı henüz aktif değil, bu mesaj gerçekten gönderilmeyecek — kayıt altına alınacak.
            </p>
            {error && <p className={styles.errorText}>{error}</p>}
            <div className={styles.actions}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Vazgeç
              </button>
              <button type="button" className="btn-primary" onClick={handleSend} disabled={sending || !message.trim()}>
                {sending ? 'Gönderiliyor…' : 'Gönder'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
