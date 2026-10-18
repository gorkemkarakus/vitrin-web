import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import { currencyWhole } from '../lib/currency'
import { toLocalDateString, DAY_MS } from '../lib/date'
import { dueLabel } from '../lib/tasks'
import styles from './NotificationsPage.module.css'

// Uygulamada ayri bir bildirim tablosu yok — liste mevcut verilerden
// (onay bekleyen randevular, botun aldigi randevular, gelmeyenler,
// devralinan konusmalar, odenmemis giderler, dunun ozeti) o an hesaplanir.
// Tercihler ve "okundu" bilgisi sadece bu cihazda (localStorage) tutulur;
// WhatsApp/sunucu bildirimlerini etkilemez.
type Kind = 'gorev' | 'mesaj' | 'bot' | 'onay' | 'degisiklik' | 'gelmedi' | 'tahsilat' | 'odeme' | 'ozet'

const PREFS_KEY = 'adapptiv.notificationPrefs'

const METHOD_LABEL: Record<string, string> = {
  nakit: 'Nakit',
  kart: 'Kart',
  havale: 'Havale',
  diger: 'Diğer',
  bakiye: 'Bakiye',
}
const SEEN_KEY = 'adapptiv.notificationsSeenAt'

const KIND_INFO: Record<Kind, { title: string; sub?: string; adminOnly: boolean }> = {
  gorev: { title: 'Görev', sub: 'Bana düşen bugünkü ve geciken görevler', adminOnly: false },
  mesaj: { title: 'Bot konuşmayı bana bıraktı', sub: 'Devraldığın, botun sustuğu konuşmalar', adminOnly: false },
  bot: { title: 'Yeni randevu', sub: 'Chatbot ya da online sayfadan gelenler', adminOnly: false },
  onay: { title: 'Onay bekleyen randevu', sub: 'Durumu “bekliyor” kalanlar', adminOnly: false },
  degisiklik: {
    title: 'İptal, onay veya taşıma',
    sub: 'Müşteri, bot ya da başka biri randevuyu değiştirince',
    adminOnly: false,
  },
  gelmedi: { title: 'Müşteri gelmedi', adminOnly: false },
  tahsilat: { title: 'Ödeme alındı', sub: 'Başka birinin aldığı ödemeler (Kasa yetkisiyle)', adminOnly: false },
  odeme: { title: 'Ödenmemiş gider', sub: 'Geciken ve 3 gün içinde ödenecekler', adminOnly: true },
  ozet: { title: 'Gün sonu özeti', sub: 'Dünün randevu ve tahsilatı', adminOnly: true },
}

interface Prefs extends Record<Kind, boolean> {
  onlyMine: boolean
}

interface Item {
  key: string
  kind: Kind
  title: string
  sub: string
  at: string
  employeeId: string | null
  to: string
}

function readPrefs(): Prefs {
  const fallback: Prefs = {
    gorev: true,
    mesaj: true,
    bot: true,
    onay: true,
    degisiklik: true,
    gelmedi: true,
    tahsilat: true,
    odeme: true,
    ozet: true,
    onlyMine: false,
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function dateKey(iso: string) {
  return toLocalDateString(new Date(iso))
}

function when(iso: string) {
  const d = new Date(iso)
  const today = toLocalDateString(new Date())
  const tomorrow = toLocalDateString(new Date(Date.now() + DAY_MS))
  const yesterday = toLocalDateString(new Date(Date.now() - DAY_MS))
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const k = toLocalDateString(d)
  if (k === today) return `bugün ${time}`
  if (k === tomorrow) return `yarın ${time}`
  if (k === yesterday) return `dün ${time}`
  return `${d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'short' })} ${time}`
}

// Sagdaki kisa zaman: "2 dk", "3 sa", dunden onceyse saat ya da tarih.
function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const d = new Date(iso)
  if (diff >= 0 && diff < 60 * 60000) return `${Math.max(1, Math.round(diff / 60000))} dk`
  if (diff >= 0 && toLocalDateString(d) === toLocalDateString(new Date())) return `${Math.round(diff / 3600000)} sa`
  if (toLocalDateString(d) === toLocalDateString(new Date(Date.now() - DAY_MS))) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { profile, can } = useAuth()
  const canKasa = can('kasa')
  const isAdmin = profile?.role === 'admin'
  const [searchParams] = useSearchParams()
  const fromSettings = searchParams.get('tercihler') === '1'
  const [showPrefs, setShowPrefs] = useState(fromSettings)
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [seenAt, setSeenAt] = useState(readSeen)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const nowIso = new Date().toISOString()
      const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString()
      const yesterday = new Date(Date.now() - DAY_MS)
      const yStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())
      const yEnd = new Date(yStart.getTime() + DAY_MS)
      const [
        { data: pending },
        { data: botAppts },
        { data: noShows },
        { data: paused },
        { data: expenses },
        { data: yAppts },
        { data: yPays },
      ] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, scheduled_at, customer_id, created_at, employee_id')
          .eq('status', 'bekliyor')
          .gte('scheduled_at', new Date(Date.now() - 30 * DAY_MS).toISOString())
          .order('scheduled_at')
          .limit(20),
        supabase
          .from('appointments')
          .select('id, scheduled_at, customer_id, created_at, source, employee_id')
          .in('source', ['chatbot', 'online_randevu'])
          .gte('created_at', twoDaysAgo)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('appointments')
          .select('id, scheduled_at, customer_id, employee_id')
          .eq('status', 'gelmedi')
          .gte('scheduled_at', twoDaysAgo)
          .lte('scheduled_at', nowIso)
          .limit(20),
        supabase.from('customers').select('id, full_name, phone, bot_paused_until').gt('bot_paused_until', nowIso),
        isAdmin
          ? supabase
              .from('business_expenses')
              .select('id, description, amount, expense_date, due_date')
              .eq('is_paid', false)
          : Promise.resolve({
              data: [] as {
                id: string
                description: string
                amount: number
                expense_date: string
                due_date: string | null
              }[],
            }),
        isAdmin
          ? supabase
              .from('appointments')
              .select('id', { count: 'exact' })
              .eq('status', 'tamamlandi')
              .gte('scheduled_at', yStart.toISOString())
              .lt('scheduled_at', yEnd.toISOString())
          : Promise.resolve({ data: [] as { id: string }[] }),
        isAdmin
          ? supabase
              .from('payments')
              .select('amount')
              .is('voided_at', null)
              .gte('paid_at', toLocalDateString(yStart))
              .lt('paid_at', toLocalDateString(yEnd))
          : Promise.resolve({ data: [] as { amount: number }[] }),
      ])

      const custIds = [
        ...new Set(
          [...(pending ?? []), ...(botAppts ?? []), ...(noShows ?? [])]
            .map((a) => a.customer_id)
            .filter((v): v is string => !!v),
        ),
      ]
      const { data: custs } = custIds.length
        ? await supabase.from('customers').select('id, full_name').in('id', custIds)
        : { data: [] as { id: string; full_name: string }[] }
      const nameOf = (id: string | null) => custs?.find((c) => c.id === id)?.full_name ?? 'Müşteri'

      const out: Item[] = []
      // Gorevler: bugun ve geciken acik gorevler (atanan kisiye; atanmamislar herkese).
      const { data: dueTasks } = await supabase
        .from('tasks')
        .select('id, title, due_date, due_time, assignee_id, created_at, customer:customers(full_name)')
        .eq('status', 'acik')
        .lte('due_date', toLocalDateString(new Date()))
        .order('due_date')
        .limit(30)
      for (const t of (dueTasks ?? []) as unknown as {
        id: string
        title: string
        due_date: string
        due_time: string | null
        assignee_id: string | null
        created_at: string
        customer: { full_name: string } | null
      }[]) {
        out.push({
          key: `gorev:${t.id}:${t.due_date}`,
          kind: 'gorev',
          title: t.title,
          sub: [dueLabel(t), t.customer?.full_name].filter(Boolean).join(' · '),
          at: `${t.due_date}T${t.due_time ?? '09:00:00'}`,
          employeeId: t.assignee_id,
          to: '/gorevler',
        })
      }
      for (const c of paused ?? []) {
        out.push({
          key: `mesaj:${c.id}`,
          kind: 'mesaj',
          title: 'Bot bir konuşmayı sana bıraktı',
          sub: `${c.full_name && c.full_name !== 'Müşteri' ? c.full_name : (c.phone ?? 'Bir müşteri')} seni bekliyor · bot ${new Date(c.bot_paused_until as string).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}’e kadar susuyor`,
          at: nowIso,
          employeeId: null,
          to: c.phone ? `/mesajlar?telefon=${encodeURIComponent(c.phone)}` : '/mesajlar',
        })
      }
      for (const a of botAppts ?? []) {
        out.push({
          key: `bot:${a.id}`,
          kind: 'bot',
          title: `Yeni randevu · ${a.source === 'chatbot' ? 'chatbot' : 'online sayfa'}`,
          sub: `${nameOf(a.customer_id)}, ${when(a.scheduled_at)}.`,
          at: a.created_at,
          employeeId: a.employee_id,
          to: `/randevular?tarih=${dateKey(a.scheduled_at)}`,
        })
      }
      for (const a of pending ?? []) {
        const past = a.scheduled_at < nowIso
        out.push({
          key: `onay:${a.id}`,
          kind: 'onay',
          title: past ? `${nameOf(a.customer_id)} randevusu güncellenmedi` : `${nameOf(a.customer_id)} onay bekliyor`,
          sub: past ? `${when(a.scheduled_at)} · geldi mi, gelmedi mi işaretle.` : `Randevu ${when(a.scheduled_at)}.`,
          at: a.created_at,
          employeeId: a.employee_id,
          to: `/randevular?tarih=${dateKey(a.scheduled_at)}`,
        })
      }
      for (const a of noShows ?? []) {
        out.push({
          key: `gelmedi:${a.id}`,
          kind: 'gelmedi',
          title: `${nameOf(a.customer_id)} gelmedi`,
          sub: `${when(a.scheduled_at)} randevusu.`,
          at: a.scheduled_at,
          employeeId: a.employee_id,
          to: a.customer_id ? `/musteriler/${a.customer_id}` : `/randevular?tarih=${dateKey(a.scheduled_at)}`,
        })
      }
      const today = toLocalDateString(new Date())
      const soon = toLocalDateString(new Date(Date.now() + 3 * DAY_MS))
      for (const e of expenses ?? []) {
        const due = e.due_date ?? e.expense_date
        if (due > soon) continue
        out.push({
          key: `odeme:${e.id}`,
          kind: 'odeme',
          title: `${e.description} · ${currencyWhole.format(e.amount)}`,
          sub:
            due < today
              ? 'Ödemesi gecikti.'
              : `Son ödeme ${new Date(`${due}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}.`,
          at: `${due < today ? due : today}T09:00:00`,
          employeeId: null,
          to: '/giderler',
        })
      }
      const yCount = (yAppts ?? []).length
      const yTotal = (yPays ?? []).reduce((s, p) => s + Number(p.amount), 0)
      if (isAdmin && (yCount > 0 || yTotal > 0)) {
        const at = new Date(yStart)
        at.setHours(19, 0, 0, 0)
        out.push({
          key: `ozet:${toLocalDateString(yStart)}`,
          kind: 'ozet',
          title: 'Gün sonu özeti',
          sub: `Dün ${yCount} randevu tamamlandı, ${currencyWhole.format(yTotal)} tahsilat.`,
          at: at.toISOString(),
          employeeId: null,
          to: '/muhasebe',
        })
      }
      // Randevu olaylari (appointment_events): kendi yaptiklarim haric.
      // actor_id bos = bot / online sayfa / musterinin kendisi (WhatsApp).
      const myId = profile?.id ?? ''
      const [{ data: events }, { data: recentPays }] = await Promise.all([
        supabase
          .from('appointment_events')
          .select(
            'id, appointment_id, customer_id, employee_id, kind, new_status, old_scheduled_at, new_scheduled_at, actor_id, created_at, appointments(scheduled_at)',
          )
          .gte('created_at', twoDaysAgo)
          .order('created_at', { ascending: false })
          .limit(40),
        canKasa
          ? supabase
              .from('payments')
              .select('id, customer_id, amount, method, created_at, created_by_user_id')
              .is('voided_at', null)
              .gte('created_at', twoDaysAgo)
              .order('created_at', { ascending: false })
              .limit(30)
          : Promise.resolve({
              data: [] as {
                id: string
                customer_id: string
                amount: number
                method: string
                created_at: string
                created_by_user_id: string | null
              }[],
            }),
      ])
      const evs = (events ?? []).filter((e) => e.actor_id !== myId)
      const pays = (recentPays ?? []).filter((x) => x.created_by_user_id !== myId)
      const extraCust = [
        ...new Set(
          [...evs.map((e) => e.customer_id), ...pays.map((x) => x.customer_id)].filter((v): v is string => !!v),
        ),
      ]
      const extraActors = [
        ...new Set(
          [...evs.map((e) => e.actor_id), ...pays.map((x) => x.created_by_user_id)].filter((v): v is string => !!v),
        ),
      ]
      const [{ data: c2 }, { data: actors }] = await Promise.all([
        extraCust.length
          ? supabase.from('customers').select('id, full_name').in('id', extraCust.slice(0, 200))
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
        extraActors.length
          ? supabase.from('profiles').select('id, full_name').in('id', extraActors)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      ])
      const custName = (id: string | null) => c2?.find((c) => c.id === id)?.full_name ?? 'Müşteri'
      const actorName = (id: string | null) =>
        (actors?.find((a) => a.id === id)?.full_name ?? '').split(' ')[0] || 'Bir çalışan'
      for (const e of evs) {
        const who = e.actor_id ? actorName(e.actor_id) : null
        const cust = custName(e.customer_id)
        const appt = (Array.isArray(e.appointments) ? e.appointments[0] : e.appointments) as {
          scheduled_at: string
        } | null
        let title = ''
        let sub = ''
        if (e.kind === 'saat' && e.old_scheduled_at && e.new_scheduled_at) {
          title = who ? `${who}, ${cust} randevusunu taşıdı` : `${cust} randevusunu taşıdı`
          sub = `${when(e.old_scheduled_at)} → ${when(e.new_scheduled_at)}.`
        } else if (e.kind === 'durum' && (e.new_status === 'onaylandi' || e.new_status === 'iptal')) {
          const verb = e.new_status === 'onaylandi' ? 'onayladı' : 'iptal etti'
          title = who ? `${who}, ${cust} randevusunu ${verb}` : `${cust} randevusunu ${verb}`
          sub = appt ? `Randevu ${when(appt.scheduled_at)}.` : ''
        } else {
          continue
        }
        const dateIso = e.new_scheduled_at ?? appt?.scheduled_at ?? e.created_at
        out.push({
          key: `degisiklik:${e.id}`,
          kind: 'degisiklik',
          title,
          sub,
          at: e.created_at,
          employeeId: e.employee_id,
          to: `/randevular?tarih=${dateKey(dateIso)}`,
        })
      }
      for (const x of pays) {
        out.push({
          key: `tahsilat:${x.id}`,
          kind: 'tahsilat',
          title: `${custName(x.customer_id)} · ${currencyWhole.format(Number(x.amount))} ödeme`,
          sub: `${METHOD_LABEL[x.method] ?? x.method}${x.created_by_user_id ? ` · alan: ${actorName(x.created_by_user_id)}` : ''}.`,
          at: x.created_at,
          employeeId: null,
          to: `/musteriler/${x.customer_id}`,
        })
      }

      out.sort((x, y) => y.at.localeCompare(x.at))
      setItems(out)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, canKasa])

  function updatePrefs(patch: Partial<Prefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        // Depolama kapaliysa tercih sadece bu oturumda gecerli kalir.
      }
      return next
    })
  }

  function markAllRead() {
    const now = new Date().toISOString()
    setSeenAt(now)
    try {
      localStorage.setItem(SEEN_KEY, now)
    } catch {
      // Depolama kapaliysa yalnizca bu oturumda okundu sayilir.
    }
  }

  const visible = useMemo(
    () =>
      items.filter((i) => prefs[i.kind] && (!prefs.onlyMine || i.employeeId === null || i.employeeId === profile?.id)),
    [items, prefs, profile?.id],
  )
  const todayKey = toLocalDateString(new Date())
  const yesterdayKey = toLocalDateString(new Date(Date.now() - DAY_MS))
  const groups = useMemo(() => {
    const keyOf = (i: Item) => toLocalDateString(new Date(i.at))
    return [
      { label: 'Bugün', items: visible.filter((i) => keyOf(i) >= todayKey) },
      { label: 'Dün', items: visible.filter((i) => keyOf(i) === yesterdayKey) },
      { label: 'Daha önce', items: visible.filter((i) => keyOf(i) < yesterdayKey) },
    ].filter((g) => g.items.length > 0)
  }, [visible, todayKey, yesterdayKey])
  // Bekleyen konusmalar "simdi" tarihli oldugundan durum surdukce her
  // acilista yeniden okunmamis gorunur (kasitli: hala cevap bekliyor).
  const isUnread = (i: Item) => !seenAt || i.at > seenAt
  const unreadCount = visible.filter(isUnread).length

  const kinds = (Object.keys(KIND_INFO) as Kind[]).filter(
    (k) => (!KIND_INFO[k].adminOnly || isAdmin) && (k !== 'tahsilat' || canKasa),
  )

  if (showPrefs) {
    return (
      <div className={styles.wrap}>
        <PageHeader
          back={() => (fromSettings ? navigate('/ayarlar') : setShowPrefs(false))}
          title="Bildirim tercihleri"
          sub="Listede neyi görmek istediğini seç"
        />
        <div className={styles.tableCard}>
          <div className={styles.tableHead}>
            <span>Olay</span>
            <span>Göster</span>
          </div>
          {kinds.map((k) => (
            <button
              type="button"
              className={styles.tableRow}
              key={k}
              onClick={() => updatePrefs({ [k]: !prefs[k] } as Partial<Prefs>)}
            >
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{KIND_INFO[k].title}</span>
                {KIND_INFO[k].sub && <span className={styles.rowSub}>{KIND_INFO[k].sub}</span>}
              </span>
              <span className={prefs[k] ? styles.checkOn : styles.check} aria-hidden="true">
                {prefs[k] ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.listCard}>
          <div className={styles.toggleRow}>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>Sadece benim randevularım</span>
              <span className={styles.rowSub}>Diğer çalışanlarınki listede görünmez</span>
            </span>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={prefs.onlyMine}
                onChange={() => updatePrefs({ onlyMine: !prefs.onlyMine })}
                aria-label="Sadece benim randevularım"
              />
              <span className={styles.switchTrack} />
            </label>
          </div>
        </div>
        <span className={styles.hint}>
          Bu tercihler bu cihazdaki bildirim listesini etkiler. Müşterilere giden WhatsApp hatırlatmaları Ayarlar &gt;
          Randevu hatırlatması’ndan yönetilir.
        </span>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/dashboard"
        title="Bildirimler"
        action={
          unreadCount > 0 ? (
            <button type="button" className={styles.link} onClick={markAllRead}>
              Hepsini okundu yap
            </button>
          ) : undefined
        }
      />

      {loading && <p className={styles.hint}>Yükleniyor…</p>}

      {!loading && visible.length === 0 && (
        <div className={styles.emptyCard}>
          <span className={styles.emptyTitle}>Her şey yolunda</span>
          <span className={styles.hint}>Onay bekleyen randevu, gecikmiş ödeme ya da seni bekleyen konuşma yok.</span>
        </div>
      )}

      {groups.map((g) => (
        <div className={styles.block} key={g.label}>
          <span className={styles.groupLabel}>{g.label}</span>
          <div className={styles.listCard}>
            {g.items.map((i) => {
              const unread = isUnread(i)
              return (
                <button type="button" key={i.key} className={styles.row} onClick={() => navigate(i.to)}>
                  <span className={unread ? styles.dotOn : styles.dot} />
                  <span className={styles.rowText}>
                    <span className={unread ? styles.rowTitle : styles.rowTitleRead}>{i.title}</span>
                    <span className={unread ? styles.rowBody : styles.rowSub}>{i.sub}</span>
                  </span>
                  <span className={styles.rowTime}>{ago(i.at)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <button type="button" className={styles.prefsLink} onClick={() => setShowPrefs(true)}>
        Bildirim tercihleri ›
      </button>
    </div>
  )
}
