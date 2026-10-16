import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { useAuth } from '../contexts/AuthContext'
import { callEdgeFunction, edgeFunctionUrl } from '../lib/edgeFunctions'
import { NETWORK_ERROR } from '../lib/messages'
import styles from './AdOAuthCallbackPage.module.css'

interface AdAccount {
  id: string
  name: string
}

type Step = 'waiting' | 'exchanging' | 'picking' | 'finalizing' | 'error'

// Meta'nin redirect_uri'si SADECE https:// kabul ediyor, com.adapptiv.panel://
// gibi bir custom scheme'i dogrudan kabul etmiyor — bu yuzden redirect_uri
// olarak HTTPS bir "sicrama" sayfasi (meta-oauth-bridge edge function)
// kullaniliyor, o da JS ile custom scheme'e sicrar. AndroidManifest.xml/
// Info.plist'te com.adapptiv.panel:// semasi kayitli olmali (bkz. ilgili
// native dosyalar).
function buildOAuthUrl(state: string, redirectUri: string) {
  const url = new URL('https://www.facebook.com/v23.0/dialog/oauth')
  url.searchParams.set('client_id', import.meta.env.VITE_META_APP_ID)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('config_id', import.meta.env.VITE_META_CONFIG_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export default function AdOAuthCallbackPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [step, setStep] = useState<Step>('waiting')
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<AdAccount[]>([])
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current || !session) return
    startedRef.current = true

    const state = crypto.randomUUID()
    sessionStorage.setItem('meta_oauth_state', state)
    const redirectUri = edgeFunctionUrl('meta-oauth-bridge')
    Browser.open({ url: buildOAuthUrl(state, redirectUri) })

    const listenerHandle = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      handleDeepLink(url)
    })

    return () => {
      listenerHandle.then((h) => h.remove())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function handleDeepLink(url: string) {
    Browser.close().catch(() => {})

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return
    }
    if (parsed.protocol !== 'com.adapptiv.panel:' || parsed.hostname !== 'ai-ads-callback') return

    const metaError = parsed.searchParams.get('error')
    const metaErrorDescription = parsed.searchParams.get('error_description')
    if (metaError) {
      setStep('error')
      setError(metaErrorDescription || 'Facebook bağlantısı reddedildi.')
      return
    }

    const code = parsed.searchParams.get('code')
    const returnedState = parsed.searchParams.get('state')
    // CSRF dogrulamasi — web'deki AdOAuthCallbackPage ile ayni mantik: Meta'nin
    // geri gonderdigi 'state', bu sayfanin ureteip sakladigi degerle BIREBIR
    // eslesmeli, yoksa akis durdurulur. Deger tek kullanimlik: okunur okunmaz
    // silinir.
    const storedState = sessionStorage.getItem('meta_oauth_state')
    sessionStorage.removeItem('meta_oauth_state')

    if (!code || !returnedState || !storedState || returnedState !== storedState) {
      setStep('error')
      setError('Güvenlik doğrulaması başarısız oldu. Lütfen tekrar deneyin.')
      return
    }

    setStep('exchanging')
    try {
      const res = await callEdgeFunction<{ ad_accounts: AdAccount[] }>('meta-oauth-callback', {
        code,
        redirect_uri: edgeFunctionUrl('meta-oauth-bridge'),
      })
      if (!res.ok) {
        setStep('error')
        setError(res.error ?? 'Bağlantı kurulamadı.')
        return
      }

      const adAccounts = res.data.ad_accounts
      if (adAccounts.length === 1) {
        await finalizeSelection(adAccounts[0])
      } else {
        setAccounts(adAccounts)
        setStep('picking')
      }
    } catch {
      setStep('error')
      setError(NETWORK_ERROR)
    }
  }

  async function finalizeSelection(account: AdAccount) {
    setStep('finalizing')
    try {
      const res = await callEdgeFunction('select-ad-account', { ad_account_id: account.id })
      if (!res.ok) {
        setStep('error')
        setError(res.error ?? 'Reklam hesabı bağlanamadı.')
        return
      }
      navigate('/reklam', { replace: true })
    } catch {
      setStep('error')
      setError(NETWORK_ERROR)
    }
  }

  return (
    <div className={styles.wrap}>
      {(step === 'waiting' || step === 'exchanging' || step === 'finalizing') && (
        <p className="muted">
          {step === 'waiting' ? "Facebook'ta oturum açıp izin verin…" : 'Bağlanıyor…'}
        </p>
      )}

      {step === 'error' && (
        <div className="card">
          <p className={styles.errorText}>{error}</p>
          <button type="button" className="btn-primary" onClick={() => navigate('/reklam', { replace: true })}>
            Reklam Performansına Dön
          </button>
        </div>
      )}

      {step === 'picking' && (
        <div className="card">
          <h2 className={styles.pickTitle}>Hangi reklam hesabını bağlamak istiyorsunuz?</h2>
          <div className={styles.accountList}>
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={styles.accountRow}
                onClick={() => finalizeSelection(account)}
              >
                {account.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
