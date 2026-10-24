import { useCallback, useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import PageHeader from '../components/PageHeader'
import { supabase } from '../lib/supabase'
import { callEdgeFunction } from '../lib/edgeFunctions'
import { askConfirm } from '../lib/dialog'
import { NETWORK_ERROR } from '../lib/messages'
import styles from './WhatsAppConnectPage.module.css'

interface Connection {
  display_phone_number: string | null
  verified_name: string | null
  coexistence: boolean
  connected_at: string
}

const RETURN_URL = 'com.adapptiv.panel://whatsapp-callback'

// Salonun kendi WhatsApp numarasini baglama. Meta'nin baglama penceresi
// yalnizca kayitli https alan adinda calistigi icin sitedeki
// /whatsapp-baglan sayfasi acilir: telefonda uygulama ici pencerede (bitince
// derin baglantiyla geri doner), webde yeni sekmede (donunce durum yenilenir).
export default function WhatsAppConnectPage() {
  const [conn, setConn] = useState<Connection | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('business_whatsapp_connections')
      .select('display_phone_number, verified_name, coexistence, connected_at')
      .maybeSingle()
    setConn((data as Connection | null) ?? null)
    setLoaded(true)
    return (data as Connection | null) ?? null
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      const onFocus = () => {
        load()
      }
      window.addEventListener('focus', onFocus)
      return () => window.removeEventListener('focus', onFocus)
    }
    const urlHandle = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(RETURN_URL)) return
      Browser.close().catch(() => {})
      load().then((c) => {
        if (c) setNotice('WhatsApp numaranız bağlandı. Asistan artık bu numaradan cevap verecek.')
      })
    })
    // Kullanici pencereyi kendisi kapatirsa da durum yenilenir.
    const closeHandle = Browser.addListener('browserFinished', () => {
      load()
    })
    return () => {
      urlHandle.then((h) => h.remove())
      closeHandle.then((h) => h.remove())
    }
  }, [load])

  async function connect() {
    setBusy(true)
    setError(null)
    setNotice(null)
    const native = Capacitor.isNativePlatform()
    try {
      const res = await callEdgeFunction<{ url: string }>('whatsapp-connect-start', { return: native ? 'app' : 'web' })
      if (!res.ok) {
        setError(res.error ?? 'Bağlantı başlatılamadı, tekrar deneyin.')
        return
      }
      if (native) await Browser.open({ url: res.data.url })
      else window.open(res.data.url, '_blank', 'noopener')
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    const ok = await askConfirm({
      title: 'WhatsApp bağlantısı kaldırılsın mı?',
      message:
        'Asistan bu numaraya gelen mesajlara cevap vermeyi bırakır. Numaranız WhatsApp Business uygulamanızda çalışmaya devam eder.',
      confirmLabel: 'Bağlantıyı kaldır',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await callEdgeFunction('whatsapp-disconnect')
      if (!res.ok) {
        setError(res.error ?? 'Bağlantı kaldırılamadı, tekrar deneyin.')
        return
      }
      await load()
      setNotice('WhatsApp bağlantısı kaldırıldı.')
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <PageHeader back="/ayarlar" title="WhatsApp hesabı" sub="Asistan müşterilerinize bu numaradan cevap verir" />

      {notice && <p className={styles.ok}>{notice}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loaded ? (
        <div className={styles.card} aria-busy="true">
          <div className={styles.skeleton} />
        </div>
      ) : conn ? (
        <div className={styles.card}>
          <span className={styles.badge}>Bağlı</span>
          <p className={styles.number}>{conn.display_phone_number ?? 'Numara'}</p>
          {conn.verified_name && <p className={styles.dim}>{conn.verified_name}</p>}
          <p className={styles.dim}>
            {conn.coexistence
              ? 'Numaranızı telefondaki WhatsApp Business uygulamasında kullanmaya devam edebilirsiniz. Bir müşteriye telefondan yazdığınızda asistan o müşteride 3 saat susar.'
              : 'Numara yalnızca Adapptiv üzerinden kullanılıyor.'}
          </p>
          <button type="button" className={styles.secondary} onClick={disconnect} disabled={busy}>
            Bağlantıyı kaldır
          </button>
        </div>
      ) : (
        <div className={styles.card}>
          <p className={styles.cardTitle}>Bağlamadan önce</p>
          <ul className={styles.list}>
            <li>Telefonunuzdaki WhatsApp Business uygulaması güncel olsun.</li>
            <li>Uygulamadaki karşılama ve uzakta mesajlarını kapatın; açık kalırsa asistan o müşteriye cevap vermez.</li>
            <li>Facebook hesabınızla giriş yapıp işletmenizi ve numaranızı seçeceksiniz; WhatsApp'a gelen kodu gireceksiniz.</li>
          </ul>
          <button type="button" className={styles.primary} onClick={connect} disabled={busy}>
            {busy ? 'Açılıyor…' : "WhatsApp'ı bağla"}
          </button>
        </div>
      )}
    </div>
  )
}
