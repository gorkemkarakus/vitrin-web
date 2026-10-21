import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { matchesSearch } from '../lib/search'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'
import { normalizeTrPhone } from '../lib/phone'
import { initials } from '../lib/formatName'
import { useAuth } from '../contexts/AuthContext'
import { MessagesIcon, ChevronRightIcon, SendIcon } from '../components/icons'
import PageHeader from '../components/PageHeader'
import type { LayoutOutletContext } from '../layouts/DashboardLayout'
import styles from './MessagesPage.module.css'
import { DAY_MS } from '../lib/date'
import { withTimeSuffix } from '../lib/timeSuffix'
import { useLayout } from '../lib/layout'

interface RawMessage {
  role: 'user' | 'assistant'
  content: string
  customer_phone: string
  created_at: string
}

interface Customer {
  id: string
  full_name: string
  phone: string | null
  bot_paused_until: string | null
}

interface Conversation {
  phone: string
  customer: Customer | null
  lastMessage: string
  lastMessageAt: string
  lastRole: 'user' | 'assistant'
  // Konusmanin sonucu (tasarimdaki etiket): 'Randevu alındı', 'Randevu değişti'...
  outcome?: string
}

type ListFilter = 'tumu' | 'sende' | 'bot'

const LIST_FILTERS: { value: ListFilter; label: string }[] = [
  { value: 'tumu', label: 'Tümü' },
  { value: 'sende', label: 'Seni bekliyor' },
  { value: 'bot', label: 'Bot' },
]

const RECENT_MESSAGES_LIMIT = 500
const PAUSE_PRESETS = [
  { label: '30 dakika', minutes: 30 },
  { label: '1 saat', minutes: 60 },
  { label: '4 saat', minutes: 240 },
  { label: 'Bugün sonuna kadar', minutes: null },
]

function isPaused(customer: Customer | null): boolean {
  if (!customer?.bot_paused_until) return false
  return new Date(customer.bot_paused_until).getTime() > Date.now()
}

function pausedUntilLabel(customer: Customer | null): string | null {
  if (!isPaused(customer)) return null
  const d = new Date(customer!.bot_paused_until!)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function displayName(c: Conversation) {
  return c.customer?.full_name && c.customer.full_name !== 'Müşteri' ? c.customer.full_name : c.phone
}

// Kayitli olmayan numaralarda isim yerine telefon gosterilir; rakamdan
// bas harf cikarmak yerine son iki hane kullanilir.
function avatarText(name: string) {
  if (/^[+\d]/.test(name)) return name.replace(/\D/g, '').slice(-2) || '?'
  return initials(name)
}

function shortTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Dün'
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Bugün'
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Dün'
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
}

export default function MessagesPage() {
  const { profile } = useAuth()
  const { searchQuery } = useOutletContext<LayoutOutletContext>()
  const { isWide } = useLayout()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [botBookingsToday, setBotBookingsToday] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [thread, setThread] = useState<RawMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false)
  const [listFilter, setListFilter] = useState<ListFilter>('tumu')
  // Musteri profilinden gelindi ama bu kisiyle henuz konusma yok: bos konusma
  // ekrani bu musteriyle acilir.
  const [directCustomer, setDirectCustomer] = useState<Customer | null>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Isletmenin WhatsApp numarasi bagliysa bot calisiyor demektir.
  // whatsapp_phone_number_id sutunu istemciye kapali; evet/hayir RPC'den
  // gelir. RPC yoksa/hata verirse (null) etiket hic gosterilmez.
  const [botLive, setBotLive] = useState<boolean | null>(null)
  useEffect(() => {
    if (!profile?.business_id) return
    supabase.rpc('my_business_bot_connected').then(({ data, error }) => setBotLive(error ? null : !!data))
  }, [profile?.business_id])

  // Baska ekrandan gelindiyse (?musteri=<id> ya da ?telefon=...) o kisinin
  // konusmasini dogrudan ac. Numara 0'li/90'li farkli yazilmis olabilir.
  useEffect(() => {
    if (loading) return
    const cid = searchParams.get('musteri')
    const tel = searchParams.get('telefon')
    if (!cid && !tel) return
    searchParams.delete('musteri')
    searchParams.delete('telefon')
    setSearchParams(searchParams, { replace: true })
    ;(async () => {
      let cust: (Customer & { contact_phone?: string | null }) | null = null
      if (cid) {
        const { data } = await supabase
          .from('customers')
          .select('id, full_name, phone, contact_phone, bot_paused_until')
          .eq('id', cid)
          .maybeSingle()
        cust = data
      }
      const wanted = new Set(
        [tel, cust?.phone, cust?.contact_phone].map((p) => normalizeTrPhone(p)).filter((p) => p.length >= 10),
      )
      const conv = conversations.find(
        (c) => wanted.has(normalizeTrPhone(c.phone)) || (cust && c.customer?.id === cust.id),
      )
      if (conv) {
        openConversation(conv.phone)
        return
      }
      const phone = [...wanted][0]
      if (!phone) return
      setDirectCustomer(
        cust
          ? { id: cust.id, full_name: cust.full_name, phone: cust.phone, bot_paused_until: cust.bot_paused_until }
          : null,
      )
      openConversation(phone)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading])

  async function loadConversations(silent = false) {
    if (!silent) setLoading(true)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const [{ data: messages }, { data: customers }, { count: botBookings }] = await Promise.all([
      supabase
        .from('chatbot_messages')
        .select('role, content, customer_phone, created_at')
        .order('created_at', { ascending: false })
        .limit(RECENT_MESSAGES_LIMIT),
      fetchAll(() => supabase.from('customers').select('id, full_name, phone, bot_paused_until').order('id')),
      // Botun bugun actigi randevular — "randevuya dondu" kutusu icin.
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'chatbot')
        .gte('created_at', todayStart.toISOString()),
    ])

    const customerByPhone = new Map((customers ?? []).filter((c) => c.phone).map((c) => [c.phone as string, c]))

    const byPhone = new Map<string, Conversation>()
    for (const m of (messages ?? []) as RawMessage[]) {
      if (byPhone.has(m.customer_phone)) continue
      byPhone.set(m.customer_phone, {
        phone: m.customer_phone,
        customer: customerByPhone.get(m.customer_phone) ?? null,
        lastMessage: m.content,
        lastMessageAt: m.created_at,
        lastRole: m.role,
      })
    }
    // Konusma sonucu: son mesaj civarinda (1 gun once – 1 saat sonra) bot
    // randevu actiysa "Randevu alındı"; randevusu tasindi/iptal edildiyse
    // ona gore; hic randevusu olmayan kisi "Bilgi aldı · yeni kişi".
    const convs = Array.from(byPhone.values())
    const custIds = [...new Set(convs.map((c) => c.customer?.id).filter((v): v is string => !!v))]
    if (custIds.length) {
      const weekAgo = new Date(Date.now() - 8 * DAY_MS).toISOString()
      const [{ data: appts }, { data: events }] = await Promise.all([
        supabase
          .from('appointments')
          .select('customer_id, source, created_at')
          .in('customer_id', custIds.slice(0, 200)),
        supabase
          .from('appointment_events')
          .select('customer_id, kind, new_status, created_at')
          .in('customer_id', custIds.slice(0, 200))
          .gte('created_at', weekAgo),
      ])
      for (const c of convs) {
        const cid = c.customer?.id
        if (!cid) continue
        const t = new Date(c.lastMessageAt).getTime()
        const near = (iso: string) => {
          const x = new Date(iso).getTime()
          return x >= t - DAY_MS && x <= t + 3600000
        }
        const mine = (appts ?? []).filter((a) => a.customer_id === cid)
        const ev = (events ?? []).filter((e) => e.customer_id === cid && near(e.created_at))
        if (mine.some((a) => a.source === 'chatbot' && near(a.created_at))) c.outcome = 'Randevu alındı'
        else if (ev.some((e) => e.kind === 'durum' && e.new_status === 'iptal')) c.outcome = 'Randevu iptal edildi'
        else if (ev.some((e) => e.kind === 'saat')) c.outcome = 'Randevu değişti'
        else if (mine.length === 0) c.outcome = 'Bilgi aldı · yeni kişi'
        else c.outcome = 'Bilgi aldı'
      }
    }
    setConversations(convs.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1)))
    setBotBookingsToday(botBookings ?? 0)
    setLoading(false)
  }

  useEffect(() => {
    loadConversations()
  }, [])

  async function openConversation(phone: string) {
    setSelectedPhone(phone)
    setPauseMenuOpen(false)
    setThreadLoading(true)
    const { data } = await supabase
      .from('chatbot_messages')
      .select('role, content, customer_phone, created_at')
      .eq('customer_phone', phone)
      .order('created_at', { ascending: true })
      .limit(200)
    setThread((data ?? []) as RawMessage[])
    setThreadLoading(false)
  }

  // Konusma acilinca en son mesaja in.
  useEffect(() => {
    if (!threadLoading && selectedPhone) threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [threadLoading, selectedPhone])

  async function setPause(phone: string, minutes: number | null) {
    const existing = conversations.find((c) => c.phone === phone)?.customer ?? directCustomer
    const until =
      minutes != null
        ? new Date(Date.now() + minutes * 60000).toISOString()
        : (() => {
            const d = new Date()
            d.setHours(23, 59, 59, 999)
            return d.toISOString()
          })()

    // customers'taki (business_id, phone) essizlik indeksi kismi (phone IS
    // NOT NULL); PostgREST upsert'i kismi indeksi taniyamadigi icin (400 doner)
    // once bulunup sonra guncellenir ya da olusturulur.
    if (existing) {
      await supabase.from('customers').update({ bot_paused_until: until }).eq('id', existing.id)
    } else {
      await supabase
        .from('customers')
        .insert({ business_id: profile?.business_id, phone, full_name: 'Müşteri', bot_paused_until: until })
    }
    setPauseMenuOpen(false)
    await loadConversations(true)
  }

  async function resumeBot(phone: string) {
    const existing = conversations.find((c) => c.phone === phone)?.customer ?? directCustomer
    if (!existing) return
    await supabase.from('customers').update({ bot_paused_until: null }).eq('id', existing.id)
    await loadConversations(true)
  }

  const selectedConversation =
    conversations.find((c) => c.phone === selectedPhone) ??
    (selectedPhone && directCustomer
      ? {
          phone: selectedPhone,
          customer: directCustomer,
          lastMessage: '',
          lastMessageAt: '',
          lastRole: 'user' as const,
        }
      : null)

  const todayConversationCount = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return conversations.filter((c) => new Date(c.lastMessageAt) >= todayStart).length
  }, [conversations])

  const pausedCount = useMemo(() => conversations.filter((c) => isPaused(c.customer)).length, [conversations])

  const visibleConversations = conversations.filter((c) => {
    if (!matchesSearch(searchQuery, c.customer?.full_name, c.phone)) return false
    if (listFilter === 'sende') return isPaused(c.customer)
    if (listFilter === 'bot') return !isPaused(c.customer)
    return true
  })

  if (loading) return <p className={styles.note}>Yükleniyor…</p>

  function closeThread() {
    setSelectedPhone(null)
    setDirectCustomer(null)
  }

  let threadView: React.ReactElement | null = null
  if (selectedConversation) {
    const paused = isPaused(selectedConversation.customer)
    const name = displayName(selectedConversation)
    const isKnown = name !== selectedConversation.phone
    // Mesajlari gun gun gruplayip "Bugun / Dun / 12 Eki" ayiraclari ekle.
    let lastDay = ''
    threadView = (
      <div className={styles.thread}>
        <div className={styles.threadHead}>
          {!isWide && (
            <button type="button" className={styles.threadBack} onClick={closeThread} aria-label="Konuşmalara dön">
              <ChevronRightIcon width={16} height={16} className={styles.backIcon} />
            </button>
          )}
          <span
            className={`${styles.avatar} ${styles.avatarSmall} ${paused ? styles.avatarWarm : isKnown ? '' : styles.avatarGray}`}
          >
            {avatarText(name)}
          </span>
          <div className={styles.threadWho}>
            <span className={styles.threadName}>{name}</span>
            <span className={styles.threadPhone}>{selectedConversation.phone} · WhatsApp</span>
          </div>
          {selectedConversation.customer && selectedConversation.customer.full_name !== 'Müşteri' && (
            <button
              type="button"
              className="hdr-link"
              onClick={() => navigate(`/musteriler/${selectedConversation.customer!.id}`)}
            >
              Profil
            </button>
          )}
          {isWide && (
            <button type="button" className={styles.threadClose} onClick={closeThread} aria-label="Konuşmayı kapat">
              ✕
            </button>
          )}
        </div>

        <div className={styles.band}>
          <div className={styles.bandText}>
            <span className={styles.bandMain}>{paused ? 'Bu konuşma sende' : 'Bot bu konuşmayı yanıtlıyor'}</span>
            <span className={styles.bandSub}>
              {paused
                ? `Bot ${withTimeSuffix(pausedUntilLabel(selectedConversation.customer) ?? '', 'e')} kadar yanıt vermeyecek`
                : 'Kendin yazacaksan önce devral'}
            </span>
          </div>
          {paused ? (
            <button type="button" className={styles.bandBtn} onClick={() => resumeBot(selectedConversation.phone)}>
              Bota bırak
            </button>
          ) : (
            <div className={styles.pauseMenuWrap}>
              <button type="button" className={styles.bandBtn} onClick={() => setPauseMenuOpen((v) => !v)}>
                Devral
              </button>
              {pauseMenuOpen && (
                <div className={styles.pauseMenu}>
                  <span className={styles.pauseMenuTitle}>Bot ne kadar sussun?</span>
                  {PAUSE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={styles.pauseMenuItem}
                      onClick={() => setPause(selectedConversation.phone, p.minutes)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.threadBody}>
          {threadLoading ? (
            <p className={styles.note}>Yükleniyor…</p>
          ) : thread.length === 0 ? (
            <p className={styles.note}>
              Bu müşteriyle henüz WhatsApp konuşması yok. Müşteri yazınca mesajlar burada görünür.
            </p>
          ) : (
            thread.map((m, i) => {
              const day = dayLabel(m.created_at)
              const showDay = day !== lastDay
              lastDay = day
              return (
                <Fragment key={i}>
                  {showDay && <span className={styles.dayChip}>{day}</span>}
                  <div className={m.role === 'user' ? styles.bubbleIn : styles.bubbleOut}>
                    {m.role !== 'user' && <span className={styles.bubbleWho}>Bot</span>}
                    {m.content}
                    <span className={styles.bubbleTime}>
                      {new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </Fragment>
              )
            })
          )}
          <div ref={threadEndRef} />
        </div>

        <div className={styles.composer}>
          <span className={styles.composerField}>
            {paused ? 'Yanıtını WhatsApp Business’tan yaz' : 'Yazmak için önce devral'}
          </span>
          <span className={styles.composerSend} aria-hidden="true">
            <SendIcon width={18} height={18} />
          </span>
        </div>
      </div>
    )
  }

  // Telefonda konusma tam ekran acilir; genis ekranda listenin sagina oturur.
  if (threadView && !isWide) return threadView

  const listBody = (
    <>
      <div className={styles.statsRow}>
        <div className={styles.statTile}>
          <span className={styles.statValue}>{todayConversationCount}</span>
          <span className={styles.statLabel}>bugün konuşma</span>
        </div>
        <div className={styles.statTile}>
          <span className={`${styles.statValue} ${styles.statValueOk}`}>{botBookingsToday}</span>
          <span className={styles.statLabel}>randevuya döndü</span>
        </div>
        <button
          type="button"
          className={`${styles.statTile} ${styles.statTileWarm}`}
          onClick={() => setListFilter('sende')}
        >
          <span className={styles.statValue}>{pausedCount}</span>
          <span className={styles.statLabel}>seni bekliyor</span>
        </button>
      </div>

      <div className={styles.segmented}>
        {LIST_FILTERS.map((f) => (
          <button
            type="button"
            key={f.value}
            className={listFilter === f.value ? styles.segmentActive : styles.segment}
            onClick={() => setListFilter(f.value)}
          >
            {f.label}
            {f.value === 'sende' && pausedCount > 0 ? ` · ${pausedCount}` : ''}
          </button>
        ))}
      </div>

      {conversations.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <MessagesIcon width={26} height={26} />
          </span>
          <h2 className={styles.emptyTitle}>Henüz konuşma yok</h2>
          <p className={styles.note}>
            WhatsApp ve Instagram bağlandığında müşterilerle yapılan yazışmalar burada listelenir.
          </p>
        </div>
      ) : visibleConversations.length === 0 ? (
        <p className={styles.note}>
          {listFilter === 'sende' ? 'Devraldığın konuşma yok; hepsini bot yanıtlıyor.' : 'Bu listede konuşma yok.'}
        </p>
      ) : (
        <div className={styles.convList}>
          {visibleConversations.map((c) => {
            const paused = isPaused(c.customer)
            const name = displayName(c)
            const isKnown = name !== c.phone
            const active = isWide && c.phone === selectedPhone
            return (
              <button
                key={c.phone}
                type="button"
                className={active ? `${styles.convRow} ${styles.convRowActive}` : styles.convRow}
                aria-current={active ? 'true' : undefined}
                onClick={() => openConversation(c.phone)}
              >
                <span className={`${styles.avatar} ${paused ? styles.avatarWarm : isKnown ? '' : styles.avatarGray}`}>
                  {isKnown ? avatarText(name) : '+90'}
                </span>
                <span className={styles.convText}>
                  <span className={styles.convTop}>
                    <span className={styles.convName}>{name}</span>
                    <span className={paused ? `${styles.convTime} ${styles.convTimeWarm}` : styles.convTime}>
                      {shortTime(c.lastMessageAt)}
                    </span>
                  </span>
                  <span className={styles.convPreview}>
                    {c.lastRole === 'assistant' ? 'Bot: ' : ''}
                    {c.lastMessage}
                  </span>
                  {paused ? (
                    <span className={styles.convStatusWarm}>Bot devretti · yanıt bekliyor</span>
                  ) : c.outcome ? (
                    <span className={c.outcome === 'Randevu alındı' ? styles.convStatusOk : styles.convStatus}>
                      {c.outcome}
                    </span>
                  ) : isKnown ? (
                    <span className={styles.convStatus}>Bot yanıtlıyor</span>
                  ) : (
                    <span className={styles.convStatus}>Yeni kişi</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )

  return (
    <div className={styles.page}>
      <PageHeader
        back="/daha-fazla"
        title="Mesajlar"
        action={
          botLive !== null && (
            <span className={botLive ? styles.botPill : `${styles.botPill} ${styles.botPillOff}`}>
              <span className={styles.botDot} />
              {botLive ? 'Bot açık' : 'Bot bağlı değil'}
            </span>
          )
        }
      />

      {isWide ? (
        <div className={styles.split}>
          <aside className={styles.splitList} aria-label="Konuşmalar">
            {listBody}
          </aside>
          <section className={styles.splitThread} aria-label="Konuşma">
            {threadView ?? (
              <div className={styles.splitEmpty}>
                <span className={styles.emptyIcon}>
                  <MessagesIcon width={26} height={26} />
                </span>
                <p className={styles.note}>Okumak için soldan bir konuşma seç.</p>
              </div>
            )}
          </section>
        </div>
      ) : (
        listBody
      )}
    </div>
  )
}
