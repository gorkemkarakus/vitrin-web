import { useState } from 'react'
import { callEdgeFunction } from '../lib/edgeFunctions'
import { NETWORK_ERROR } from '../lib/messages'
import { SparkleIcon } from './icons'
import styles from './AiMessageGenerator.module.css'

// Kampanya mesajini kisa bir istekten (ör. "%15 indirim mesaji") yazdirir.
export default function AiMessageGenerator({
  onGenerated,
  onError,
}: {
  onGenerated: (message: string) => void
  onError: (message: string | null) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)

  async function generate() {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    onError(null)
    try {
      const res = await callEdgeFunction<{ message: string }>('generate-campaign-message', { prompt: prompt.trim() })
      if (!res.ok) {
        onError(res.error ?? 'Mesaj oluşturulamadı.')
        return
      }
      onGenerated(res.data.message)
    } catch {
      onError(NETWORK_ERROR)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={styles.block}>
      <span className={styles.label}>
        <SparkleIcon width={13} height={13} />
        AI ile Oluştur
      </span>
      <div className={styles.row}>
        <input
          className={styles.input}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ör. %15 indirim mesajı"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              generate()
            }
          }}
        />
        <button type="button" className={styles.button} onClick={generate} disabled={generating || !prompt.trim()}>
          {generating ? 'Yazılıyor…' : 'Oluştur'}
        </button>
      </div>
    </div>
  )
}
