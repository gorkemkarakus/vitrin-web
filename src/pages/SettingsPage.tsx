import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { callEdgeFunction } from '../lib/edgeFunctions'
import { NETWORK_ERROR } from '../lib/messages'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import { bookingUrl } from '../lib/bookingUrl'
import styles from './SettingsPage.module.css'
import { DAY_MS } from '../lib/date'
import { FIELD_LIMITS } from '../lib/fieldLimits'
import { enablePush, pushAvailable, pushPermission, type PushPermission } from '../lib/push'

const REMINDER_OPTIONS = [
  { value: '1', label: '1 saat önce' },
  { value: '2', label: '2 saat önce' },
  { value: '4', label: '4 saat önce' },
  { value: '12', label: '12 saat önce' },
  { value: '24', label: '1 gün önce' },
  { value: '48', label: '2 gün önce' },
]

type Section = 'ana' | 'hatirlatma' | 'whatsapp' | 'salon' | 'sifre' | 'online' | 'sil' | 'veri'

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('90') ? digits : digits.startsWith('0') ? '9' + digits : '90' + digits
}

// 905551234567 -> 0555 123 45 67
function formatPhone(p: string) {
  const d = p.replace(/\D/g, '')
  const local = d.startsWith('90') ? '0' + d.slice(2) : d
  if (local.length !== 11) return p
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 9)} ${local.slice(9)}`
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { profile, session, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [section, setSection] = useState<Section>('ana')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [business, setBusiness] = useState<{
    name: string
    slug: string | null
  } | null>(null)
  // null = bilinmiyor (RPC yok/hata) — satir gosterilmez.
  const [botLive, setBotLive] = useState<boolean | null>(null)
  // null = sutun yok (eski kurulum); sayfa acik kabul edilir.
  const [bookingEnabled, setBookingEnabled] = useState<boolean | null>(null)
  const [reminderHours, setReminderHours] = useState('')
  const [savedReminderHours, setSavedReminderHours] = useState('')
  const [reminderLoading, setReminderLoading] = useState(isAdmin)
  const [reminderCount, setReminderCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const [salonName, setSalonName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  // Hesap silme: sunucu once kapsami soyler (sadece hesap / isletme dahil).
  const [deleteScope, setDeleteScope] = useState<{
    scope: 'account' | 'business'
    business_name: string | null
  } | null>(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteBizName, setDeleteBizName] = useState('')
  const [exportStep, setExportStep] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<{ name: string; count: number }[] | null>(null)

  const [whatsappPhone, setWhatsappPhone] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(true)
  const [pushState, setPushState] = useState<PushPermission | null>(null)

  useEffect(() => {
    if (pushAvailable) pushPermission().then(setPushState)
  }, [])

  useEffect(() => {
    if (!profile?.business_id) return
    // businesses sutun seviyesinde kilitli (bkz. 20260725000008): yalnizca
    // izinli sutunlar istenir, yoksa TUM sorgu reddedilir.
    supabase
      .from('businesses')
      .select('name, slug, reminder_hours_before')
      .eq('id', profile.business_id)
      .maybeSingle()
      .then(({ data }) => {
        setBusiness({ name: data?.name ?? '', slug: data?.slug ?? null })
        const v = data?.reminder_hours_before ? String(data.reminder_hours_before) : ''
        setReminderHours(v)
        setSavedReminderHours(v)
        setReminderLoading(false)
      })
    supabase.rpc('my_business_bot_connected').then(({ data, error }) => setBotLive(error ? null : !!data))
    // Ayri sorgu: kolon yoksa yukaridaki ana sorguyu bozmasin.
    supabase
      .from('businesses')
      .select('online_booking_enabled')
      .eq('id', profile.business_id)
      .maybeSingle()
      .then(({ data, error }) => setBookingEnabled(error ? null : (data?.online_booking_enabled ?? null)))
    if (isAdmin) {
      const since = new Date(Date.now() - 30 * DAY_MS).toISOString()
      supabase
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'reminder')
        .gte('created_at', since)
        .then(({ count }) => setReminderCount(count ?? 0))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.business_id, isAdmin])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('profiles')
      .select('whatsapp_phone')
      .eq('id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        setWhatsappPhone(data?.whatsapp_phone ?? '')
        setSavedPhone(data?.whatsapp_phone ?? '')
        setPhoneLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  function open(s: Section) {
    setMsg(null)
    if (s === 'salon') setSalonName(business?.name ?? '')
    if (s === 'sifre') {
      setNewPassword('')
      setNewPassword2('')
    }
    if (s === 'hatirlatma') setReminderHours(savedReminderHours)
    setSection(s)
  }

  async function saveReminder() {
    setSaving(true)
    setMsg(null)
    const { error } = await supabase
      .from('businesses')
      .update({ reminder_hours_before: reminderHours ? Number(reminderHours) : null })
      .eq('id', profile!.business_id)
    setSaving(false)
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return
    }
    setSavedReminderHours(reminderHours)
    setMsg({ type: 'ok', text: 'Kaydedildi.' })
  }

  async function savePhone(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const normalized = normalizePhone(whatsappPhone)
    const { error } = await supabase
      .from('profiles')
      .update({ whatsapp_phone: normalized || null })
      .eq('id', profile!.id)
    setSaving(false)
    if (error) {
      const isDuplicate = /duplicate key|unique/i.test(error.message)
      setMsg({ type: 'err', text: isDuplicate ? 'Bu numara başka bir hesaba kayıtlı.' : error.message })
      return
    }
    setWhatsappPhone(normalized)
    setSavedPhone(normalized)
    setMsg({ type: 'ok', text: 'Kaydedildi.' })
  }

  async function saveSalon(e: FormEvent) {
    e.preventDefault()
    const name = salonName.trim()
    if (!name) return
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('businesses').update({ name }).eq('id', profile!.business_id)
    setSaving(false)
    if (error) {
      // businesses tablosunda sutun bazli yazma izni var; 'name' acik degilse.
      const denied = /permission denied/i.test(error.message)
      setMsg({
        type: 'err',
        text: denied ? 'Salon adı şu an değiştirilemiyor (veritabanı izni eksik).' : error.message,
      })
      return
    }
    setBusiness((b) => (b ? { ...b, name } : b))
    setMsg({ type: 'ok', text: 'Kaydedildi.' })
  }

  type DeleteScope = { scope: 'account' | 'business'; business_name: string | null }

  async function callDeleteAccount(payload: Record<string, unknown>) {
    try {
      return await callEdgeFunction<DeleteScope>('delete-account', payload)
    } catch {
      return { ok: false as const, status: 0, error: NETWORK_ERROR }
    }
  }

  async function openDelete() {
    open('sil')
    setDeleteScope(null)
    setDeletePassword('')
    setDeleteBizName('')
    const res = await callDeleteAccount({ dry_run: true })
    if (res.ok) setDeleteScope(res.data)
    else setMsg({ type: 'err', text: res.error ?? 'Hesap bilgisi alınamadı.' })
  }

  async function confirmDelete(e: FormEvent) {
    e.preventDefault()
    if (!deleteScope || !session?.user.email) return
    setSaving(true)
    setMsg(null)
    // Yanlislikla silmeye karsi sifre yeniden dogrulanir.
    const { error: pwErr } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: deletePassword,
    })
    if (pwErr) {
      setSaving(false)
      setMsg({ type: 'err', text: 'Şifre yanlış.' })
      return
    }
    const res = await callDeleteAccount({ confirm_business_name: deleteBizName })
    setSaving(false)
    if (!res.ok) {
      setMsg({ type: 'err', text: res.error ?? 'Hesap silinemedi.' })
      return
    }
    await signOut()
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      setMsg({ type: 'err', text: 'Şifre en az 8 karakter olmalı.' })
      return
    }
    if (newPassword !== newPassword2) {
      setMsg({ type: 'err', text: 'İki şifre aynı değil.' })
      return
    }
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return
    }
    setNewPassword('')
    setNewPassword2('')
    setMsg({ type: 'ok', text: 'Şifren değişti.' })
  }

  const publicLink = bookingUrl(business?.slug)

  function copyBookingLink() {
    if (!publicLink) return
    navigator.clipboard.writeText(publicLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  async function toggleBooking() {
    const next = !(bookingEnabled ?? true)
    setSaving(true)
    setMsg(null)
    const { error } = await supabase
      .from('businesses')
      .update({ online_booking_enabled: next })
      .eq('id', profile!.business_id)
    setSaving(false)
    if (error) {
      const missing = /permission denied|online_booking_enabled/i.test(error.message)
      setMsg({ type: 'err', text: missing ? 'Bu ayar için veritabanı güncellemesi bekleniyor.' : error.message })
      return
    }
    setBookingEnabled(next)
    setMsg({ type: 'ok', text: next ? 'Online randevu açıldı.' : 'Online randevu kapatıldı.' })
  }

  async function downloadData() {
    setMsg(null)
    setExportResult(null)
    setExportStep('Başlatılıyor…')
    try {
      const { exportBusinessData } = await import('../lib/dataExport')
      const result = await exportBusinessData(business?.name ?? '', setExportStep)
      setExportResult(result)
    } catch (e) {
      setMsg({ type: 'err', text: 'Dosya hazırlanamadı: ' + (e instanceof Error ? e.message : '') })
    } finally {
      setExportStep(null)
    }
  }

  const back = () => {
    setMsg(null)
    setSection('ana')
  }
  const msgLine = msg && <p className={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>{msg.text}</p>

  if (section === 'hatirlatma') {
    const sample = new Date()
    sample.setDate(sample.getDate() + 1)
    const dateLabel = sample.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
    return (
      <div className={styles.wrap}>
        <PageHeader back={back} title="Randevu hatırlatması" sub="Müşteriye WhatsApp’tan otomatik gider" />

        {reminderLoading ? (
          <p className={styles.hint}>Yükleniyor…</p>
        ) : (
          <div className={styles.optionBlock}>
            <span className={styles.blockLabel}>Ne zaman gitsin?</span>
            <div className={styles.optionGrid}>
              {REMINDER_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  className={reminderHours === o.value ? styles.optionOn : styles.option}
                  onClick={() => setReminderHours(o.value)}
                  aria-pressed={reminderHours === o.value}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={reminderHours === '' ? styles.offBtnOn : styles.offBtn}
              onClick={() => setReminderHours('')}
              aria-pressed={reminderHours === ''}
            >
              {reminderHours === '' ? 'Hatırlatma kapalı' : 'Hatırlatmayı kapat'}
            </button>
          </div>
        )}

        {reminderHours !== '' && (
          <div className={styles.chat}>
            <span className={styles.chatLabel}>Müşteri bunu görür · örnek</span>
            <div className={styles.chatBubble}>
              Merhaba Ayşe, hatırlatma: {business?.name || 'salonunuz'}’deki randevunuz {dateLabel} 11:30 — Manikür.
              <span className={styles.chatTime}>11:30</span>
            </div>
          </div>
        )}

        <p className={styles.hint}>Randevu alındığında giden onay mesajı bu ayardan etkilenmez.</p>
        {reminderCount !== null && reminderCount > 0 && (
          <span className={styles.statLine}>Son 30 günde {reminderCount} hatırlatma gitti.</span>
        )}
        {msgLine}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.footerBtn}
            onClick={saveReminder}
            disabled={saving || reminderLoading || reminderHours === savedReminderHours}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    )
  }

  if (section === 'whatsapp') {
    return (
      <form className={styles.wrap} onSubmit={savePhone}>
        <PageHeader back={back} title="WhatsApp numaram" sub="Randevu botuna kendi numaranla yazmak için" />
        <div className={styles.formCard}>
          <div className={styles.field}>
            <label htmlFor="settingsPhone">Telefon numarası</label>
            <input
              maxLength={FIELD_LIMITS.profilesWhatsappPhone}
              id="settingsPhone"
              type="tel"
              inputMode="numeric"
              placeholder="0555 123 45 67"
              value={phoneLoading ? '' : whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              disabled={phoneLoading}
            />
          </div>
        </div>
        {msgLine}
        <div className={styles.footer}>
          <button type="submit" className={styles.footerBtn} disabled={saving || phoneLoading}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    )
  }

  if (section === 'salon') {
    return (
      <form className={styles.wrap} onSubmit={saveSalon}>
        <PageHeader back={back} title="Salon bilgileri" sub="Müşteriye giden mesajlarda bu ad geçer" />
        <div className={styles.formCard}>
          <div className={styles.field}>
            <label htmlFor="salonName">Salon adı</label>
            <input
              maxLength={FIELD_LIMITS.businessesName}
              id="salonName"
              value={salonName}
              onChange={(e) => setSalonName(e.target.value)}
              required
            />
          </div>
        </div>
        {msgLine}
        <div className={styles.footer}>
          <button type="submit" className={styles.footerBtn} disabled={saving || !salonName.trim()}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    )
  }

  if (section === 'online') {
    const enabled = bookingEnabled ?? true
    return (
      <div className={styles.wrap}>
        <PageHeader back={back} title="Online randevu sayfası" sub="Müşteriler bu linkten kendileri randevu alır" />
        <div className={styles.group}>
          <div className={styles.toggleRow}>
            <span className={styles.toggleText}>
              <span className={styles.rowLabel}>Randevu almaya açık</span>
              <span className={styles.toggleSub}>
                {enabled ? 'Link açıldığında hizmet ve saat seçilebiliyor' : 'Link “şu an kapalı” mesajı gösteriyor'}
              </span>
            </span>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={toggleBooking}
                disabled={saving}
                aria-label="Randevu almaya açık"
              />
              <span className={styles.switchTrack} />
            </label>
          </div>
        </div>

        {publicLink ? (
          <div className={styles.linkCard}>
            <span className={styles.linkUrl}>{publicLink}</span>
            <div className={styles.linkActions}>
              <button type="button" className={styles.linkBtn} onClick={copyBookingLink}>
                {linkCopied ? 'Kopyalandı ✓' : 'Linki kopyala'}
              </button>
              <a className={styles.linkBtn} href={publicLink} target="_blank" rel="noreferrer">
                Sayfayı aç
              </a>
            </div>
          </div>
        ) : (
          <p className={styles.hint}>
            Sitenin adresi uygulamaya henüz tanımlanmadı; link oluşturulamıyor. (Geliştirici: VITE_PUBLIC_SITE_URL)
          </p>
        )}
        <p className={styles.hint}>Kapatınca link silinmez; tekrar açtığında aynı link çalışmaya devam eder.</p>
        {msgLine}
      </div>
    )
  }

  if (section === 'sil') {
    const isBusiness = deleteScope?.scope === 'business'
    const nameOk =
      !isBusiness ||
      deleteBizName.trim().toLocaleLowerCase('tr') === (deleteScope?.business_name ?? '').trim().toLocaleLowerCase('tr')
    return (
      <form className={styles.wrap} onSubmit={confirmDelete}>
        <PageHeader back={back} title="Hesabımı sil" />
        {!deleteScope ? (
          <p className={styles.hint}>{msg ? '' : 'Kontrol ediliyor…'}</p>
        ) : (
          <>
            <div className={styles.dangerCard}>
              {isBusiness ? (
                <>
                  <b>{deleteScope.business_name}</b> işletmesinin tek yöneticisi sensin. Hesabını silersen işletme ve
                  tüm verisi de kalıcı olarak silinir: müşteriler, randevular, ödemeler, giderler ve çalışan hesapları.
                </>
              ) : (
                <>
                  Giriş hesabın ve kişisel bilgilerin kalıcı olarak silinir. Salonun kayıtları (randevular, ödemeler)
                  silinmez; geçmiş randevularda adın görünmez.
                </>
              )}
              <span className={styles.dangerNote}>Bu işlem geri alınamaz.</span>
            </div>
            <div className={styles.formCard}>
              <div className={styles.field}>
                <label htmlFor="deletePassword">Şifren</label>
                <input
                  id="deletePassword"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                />
              </div>
              {isBusiness && (
                <div className={styles.field}>
                  <label htmlFor="deleteBizName">Onay için işletme adını yaz: {deleteScope.business_name}</label>
                  <input
                    maxLength={FIELD_LIMITS.businessesName}
                    id="deleteBizName"
                    value={deleteBizName}
                    onChange={(e) => setDeleteBizName(e.target.value)}
                  />
                </div>
              )}
            </div>
          </>
        )}
        {msgLine}
        {deleteScope && (
          <div className={styles.footer}>
            <button type="submit" className={styles.dangerBtn} disabled={saving || !deletePassword || !nameOk}>
              {saving ? 'Siliniyor…' : isBusiness ? 'İşletmeyi ve hesabımı sil' : 'Hesabımı kalıcı olarak sil'}
            </button>
          </div>
        )}
      </form>
    )
  }

  if (section === 'veri') {
    return (
      <div className={styles.wrap}>
        <PageHeader back={back} title="Verilerimi indir" sub="Tüm kayıtların tek bir Excel dosyasında" />
        <div className={styles.formCard}>
          <span className={styles.rowLabel}>Dosyada neler var?</span>
          <ul className={styles.exportList}>
            <li>Müşteriler — telefon, e-posta, bakiye, notlar, kampanya izni</li>
            <li>Randevular — tarih, hizmet, çalışan, durum, ücret</li>
            <li>Ödemeler ve giderler</li>
            <li>Hizmetler, paketler ve ekip</li>
            <li>Kasa kapanışları ve prim ödemeleri</li>
          </ul>
          <span className={styles.hint}>
            Her biri ayrı sayfada; tutarlar ve tarihler Excel'de toplanabilir, sıralanabilir. Dosyayı kimseyle paylaşma
            — müşterilerinin kişisel bilgilerini içerir.
          </span>
        </div>
        {exportResult && (
          <div className={styles.exportDone}>
            <b>Dosya hazır ✓</b>
            <span>{exportResult.map((r) => `${r.name} ${r.count}`).join(' · ')}</span>
          </div>
        )}
        {msgLine}
        <div className={styles.footer}>
          <button type="button" className={styles.footerBtn} onClick={downloadData} disabled={!!exportStep}>
            {exportStep ?? (exportResult ? 'Tekrar indir' : 'Excel olarak indir')}
          </button>
        </div>
      </div>
    )
  }

  if (section === 'sifre') {
    return (
      <form className={styles.wrap} onSubmit={savePassword}>
        <PageHeader back={back} title="Şifre değiştir" />
        <div className={styles.formCard}>
          <div className={styles.field}>
            <label htmlFor="newPassword">Yeni şifre</label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="en az 8 karakter"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="newPassword2">Yeni şifre (tekrar)</label>
            <input
              id="newPassword2"
              type="password"
              autoComplete="new-password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
            />
          </div>
        </div>
        {msgLine}
        <div className={styles.footer}>
          <button type="submit" className={styles.footerBtn} disabled={saving || !newPassword}>
            {saving ? 'Kaydediliyor…' : 'Şifreyi değiştir'}
          </button>
        </div>
      </form>
    )
  }

  const reminderLabel = reminderLoading
    ? '…'
    : (REMINDER_OPTIONS.find((o) => o.value === savedReminderHours)?.label ?? 'Kapalı')

  const row = (label: string, value: ReactNode, onClick?: () => void, tone?: 'ok' | 'muted') => (
    <button type="button" className={styles.row} onClick={onClick} disabled={!onClick}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={tone === 'ok' ? styles.rowValueOk : tone === 'muted' ? styles.rowValueMuted : styles.rowValue}>
        {value}
        {onClick ? ' ›' : ''}
      </span>
    </button>
  )

  return (
    <div className={styles.wrap}>
      <PageHeader back="/daha-fazla" title="Ayarlar" />

      {isAdmin && (
        <>
          <span className={styles.groupLabel}>İşletme</span>
          <div className={styles.group}>
            {row('Salon bilgileri', business?.name || '…', () => open('salon'))}
            {row('Ekip ve çalışma saatleri', 'Ekip', () => navigate('/ekip'))}
            {row('Verilerimi indir', 'Excel', () => open('veri'), 'muted')}
            {business?.slug
              ? row(
                  'Online randevu sayfası',
                  bookingEnabled === false ? 'Kapalı' : 'Açık',
                  () => open('online'),
                  bookingEnabled === false ? 'muted' : 'ok',
                )
              : row('Online randevu sayfası', 'Kapalı', undefined, 'muted')}
          </div>
        </>
      )}

      <span className={styles.groupLabel}>Mesajlaşma</span>
      <div className={styles.group}>
        {isAdmin && row('Randevu hatırlatması', reminderLabel, () => open('hatirlatma'))}
        {row('WhatsApp numaram', phoneLoading ? '…' : savedPhone ? formatPhone(savedPhone) : 'Kayıtlı değil', () =>
          open('whatsapp'),
        )}
        {isAdmin &&
          botLive !== null &&
          row('Chatbot', botLive ? 'Çalışıyor' : 'Bağlı değil', () => navigate('/mesajlar'), botLive ? 'ok' : 'muted')}
      </div>

      <span className={styles.groupLabel}>Hesap</span>
      <div className={styles.group}>
        {row('E-posta', session?.user.email ?? '—')}
        {row('Şifre değiştir', '', () => open('sifre'), 'muted')}
        {row('Bildirimler', '', () => navigate('/bildirimler?tercihler=1'), 'muted')}
        {pushAvailable &&
          pushState &&
          row(
            'Telefon bildirimleri',
            pushState === 'granted' ? 'Açık' : pushState === 'denied' ? 'Telefon ayarlarından aç' : 'Kapalı',
            pushState === 'prompt' ? () => enablePush().then(setPushState) : undefined,
            pushState === 'granted' ? 'ok' : 'muted',
          )}
        {row('Hesabımı sil', '', openDelete, 'muted')}
      </div>

      <span className={styles.groupLabel}>Hakkında</span>
      <div className={styles.group}>
        {row('Gizlilik Politikası', '', () => navigate('/gizlilik'), 'muted')}
        {row('KVKK Aydınlatma Metni', '', () => navigate('/kvkk'), 'muted')}
        {row('Kullanım Koşulları', '', () => navigate('/kullanim-kosullari'), 'muted')}
      </div>

      <button type="button" className={styles.signOut} onClick={() => signOut()}>
        Çıkış yap
      </button>
      <span className={styles.version}>
        Adapptiv {import.meta.env.VITE_APP_VERSION} · {profile?.full_name ?? ''} · {isAdmin ? 'Yönetici' : 'Çalışan'}
      </span>
    </div>
  )
}
