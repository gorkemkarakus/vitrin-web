import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import QuickAddCustomerModal from '../components/QuickAddCustomerModal'
import {
  HomeIcon,
  AppointmentsIcon,
  UsersIcon,
  MoreHorizontalIcon,
  BellIcon,
  PlusIcon,
  UserPlusIcon,
  CalendarIcon,
  WalletIcon,
  ReceiptIcon,
  SendIcon,
  MessagesIcon,
  SettingsIcon,
  LogOutIcon,
} from '../components/icons'
import { currencyWhole } from '../lib/currency'
import { toLocalDateString } from '../lib/date'
import styles from './DashboardLayout.module.css'

const TAB_ITEMS = [
  { path: '/dashboard', label: 'Anasayfa', icon: HomeIcon },
  { path: '/randevular', label: 'Randevular', icon: AppointmentsIcon },
  { path: '/musteriler', label: 'Müşteriler', icon: UsersIcon },
  { path: '/daha-fazla', label: 'Daha Fazla', icon: MoreHorizontalIcon },
]

// Ana sayfa (kasa/ciro ozeti) sadece yoneticiye acik — calisan "Anasayfa"ya
// basinca Randevular'a atiliyordu. Calisanda o sekmenin yerine Mesajlar var.
const EMPLOYEE_TAB_ITEMS = [
  { path: '/randevular', label: 'Randevular', icon: AppointmentsIcon },
  { path: '/musteriler', label: 'Müşteriler', icon: UsersIcon },
  { path: '/mesajlar', label: 'Mesajlar', icon: MessagesIcon },
  { path: '/daha-fazla', label: 'Daha Fazla', icon: MoreHorizontalIcon },
]

function timeGreeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Günaydın'
  if (h < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

function profileInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toLocaleUpperCase('tr') ?? '')
      .join('') || '?'
  )
}

function todayLabel() {
  const d = new Date()
  const weekday = d.toLocaleDateString('tr-TR', { weekday: 'long' })
  const dayMonth = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
  return `${weekday}, ${dayMonth}`
}

interface PendingAppointment {
  id: string
  scheduled_at: string
  customer_name: string
}

// Odenmemis giderlerin + dugmesi acilinca gosterilen ozeti. `overdue` son
// odeme tarihi (yoksa gider tarihi) gecmis olanlar, `soon` 3 gun icinde
// odenmesi gerekenler.
interface UnpaidSummary {
  overdueCount: number
  overdueTotal: number
  overdueOldest: string
  soonCount: number
  soonTotal: number
  soonFirst: string
}

function apptDateKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface LayoutOutletContext {
  // Topbar'daki arama kutusu kaldirildi — searchQuery artik hep bos kalir
  // (arayan sayfalar "sorgu yok -> hepsini goster" davranisina duser) ve
  // setSearchPlaceholder no-op'tur. Tip sozlesmesi, bu context'i tuketen
  // sayfalari (AppointmentsPage, MessagesPage) degistirmeden korumak icin
  // ayni sekilde birakildi.
  searchQuery: string
  setSearchPlaceholder: (placeholder: string) => void
}

export default function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isHome = location.pathname === '/dashboard'
  const tabItems = isAdmin ? TAB_ITEMS : EMPLOYEE_TAB_ITEMS
  const firstName = (profile?.full_name ?? 'İşletmeniz').trim().split(/\s+/)[0]

  const [pending, setPending] = useState<PendingAppointment[]>([])
  const [unpaid, setUnpaid] = useState<UnpaidSummary | null>(null)
  const [unpaidToday, setUnpaidToday] = useState<{ customerId: string | null; name: string; time: string; amount: number }[]>([])
  const [waitingConvs, setWaitingConvs] = useState<{ phone: string; name: string }[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [quickAddCustomerOpen, setQuickAddCustomerOpen] = useState(false)

  const bellRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  function closeOverlays() {
    setBellOpen(false)
    setProfileMenuOpen(false)
    setActionSheetOpen(false)
  }

  useEffect(() => {
    closeOverlays()
  }, [location.pathname])

  // Bildirim/profil katmanlarindan disari tiklaninca kapat. Arama bunun
  // disinda tutuluyor — sadece capraz (X) butonuna, geri tusuna veya sayfa
  // degisimine basinca kapanmali, listede gezinirken (dokunma/kaydirma ilk
  // temasi da "disari tiklama" sayildigi icin) kendiliginden kapanmamali.
  useEffect(() => {
    if (!bellOpen && !profileMenuOpen) return
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (bellOpen && bellRef.current && !bellRef.current.contains(target)) setBellOpen(false)
      if (profileMenuOpen && profileRef.current && !profileRef.current.contains(target)) setProfileMenuOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setBellOpen(false)
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [bellOpen, profileMenuOpen])

  // Icerik kaydirilinca bildirim/profil katmanlarini kapat (ekranda asili
  // kalip altindaki icerikle cakisiyorlardi) — arama burada da haric, aciksa
  // yukarida sabit kalmaya devam etmeli.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    function handleScroll() {
      setBellOpen(false)
      setProfileMenuOpen(false)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Android donanim geri tusu: once acik katmani kapat, yoksa gecmiste geri
  // git / kok sayfadaysa uygulamadan cik (native App eklentisi olmadan bu
  // olayi dinlemek mumkun degil, web'de sessizce atlanir).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let removeListener: (() => void) | undefined
    import('@capacitor/app').then(({ App: CapacitorApp }) => {
      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (quickAddCustomerOpen) {
          setQuickAddCustomerOpen(false)
          return
        }
        if (bellOpen || profileMenuOpen || actionSheetOpen) {
          closeOverlays()
          return
        }
        if (canGoBack) navigate(-1)
        else CapacitorApp.exitApp()
      }).then((handle) => {
        removeListener = () => handle.remove()
      })
    })
    return () => removeListener?.()
  }, [bellOpen, profileMenuOpen, actionSheetOpen, quickAddCustomerOpen, navigate])

  useEffect(() => {
    async function loadPending() {
      const { data: appts } = await supabase
        .from('appointments')
        .select('id, scheduled_at, customer_id')
        .eq('status', 'bekliyor')
        .order('scheduled_at', { ascending: true })
        .limit(8)
      const customerIds = [...new Set((appts ?? []).map((a) => a.customer_id).filter(Boolean))]
      const { data: customers } = customerIds.length
        ? await supabase.from('customers').select('id, full_name').in('id', customerIds)
        : { data: [] }
      const nameById = new Map((customers ?? []).map((c) => [c.id, c.full_name ?? 'Müşteri']))
      setPending(
        (appts ?? []).map((a) => ({
          id: a.id,
          scheduled_at: a.scheduled_at,
          customer_name: a.customer_id ? (nameById.get(a.customer_id) ?? 'Müşteri') : 'Müşteri',
        })),
      )
    }
    loadPending()
  }, [location.pathname])

  // Giderler sadece yoneticiye acik — calisan hesabinda sorgu hic atilmaz.
  useEffect(() => {
    if (!isAdmin) {
      setUnpaid(null)
      return
    }
    async function loadUnpaid() {
      const { data } = await supabase
        .from('business_expenses')
        .select('description, amount, expense_date, due_date')
        .eq('is_paid', false)
      const today = toLocalDateString(new Date())
      const soonLimit = new Date()
      soonLimit.setDate(soonLimit.getDate() + 3)
      const soonLimitStr = toLocalDateString(soonLimit)
      const rows = (data ?? [])
        .map((e) => ({ description: e.description as string, amount: e.amount as number, date: (e.due_date ?? e.expense_date) as string }))
        .sort((a, b) => a.date.localeCompare(b.date))
      const overdue = rows.filter((e) => e.date < today)
      const soon = rows.filter((e) => e.date >= today && e.date <= soonLimitStr)
      setUnpaid({
        overdueCount: overdue.length,
        overdueTotal: overdue.reduce((sum, e) => sum + e.amount, 0),
        overdueOldest: overdue[0]?.description ?? '',
        soonCount: soon.length,
        soonTotal: soon.reduce((sum, e) => sum + e.amount, 0),
        soonFirst: soon[0]?.description ?? '',
      })
    }
    loadUnpaid()
  }, [location.pathname, isAdmin])

  // + menusundeki "Once bunlara bak" kutusu icin: bugun tamamlanan ama
  // ucreti (tamami) alinmayan tek seferlik randevular ve botun birakip seni
  // bekleyen konusmalar. Sadece menu acilinca sorgulanir.
  useEffect(() => {
    if (!actionSheetOpen) return
    let cancelled = false
    async function loadQuickExtras() {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      const [{ data: done }, { data: paused }] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, customer_id, service_id, price_override, scheduled_at, package_id')
          .eq('status', 'tamamlandi')
          .is('package_id', null)
          .gte('scheduled_at', start.toISOString())
          .lt('scheduled_at', end.toISOString()),
        supabase
          .from('customers')
          .select('full_name, phone')
          .gt('bot_paused_until', new Date().toISOString())
          .limit(5),
      ])
      const appts = done ?? []
      let rows: { customerId: string | null; name: string; time: string; amount: number }[] = []
      if (appts.length) {
        const serviceIds = [...new Set(appts.map((a) => a.service_id).filter(Boolean))] as string[]
        const customerIds = [...new Set(appts.map((a) => a.customer_id).filter(Boolean))] as string[]
        const [{ data: svcs }, { data: pays }, { data: custs }] = await Promise.all([
          serviceIds.length ? supabase.from('services').select('id, price').in('id', serviceIds) : Promise.resolve({ data: [] as { id: string; price: number | null }[] }),
          supabase.from('payments').select('appointment_id, amount').is('voided_at', null).in('appointment_id', appts.map((a) => a.id)),
          customerIds.length ? supabase.from('customers').select('id, full_name').in('id', customerIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
        ])
        rows = appts
          .map((a) => {
            const price = a.price_override ?? svcs?.find((x) => x.id === a.service_id)?.price ?? 0
            const paid = (pays ?? []).filter((x) => x.appointment_id === a.id).reduce((sum, x) => sum + x.amount, 0)
            return {
              customerId: a.customer_id,
              name: custs?.find((c) => c.id === a.customer_id)?.full_name ?? 'Müşteri',
              time: new Date(a.scheduled_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
              amount: Math.max(0, price - paid),
            }
          })
          .filter((r) => r.amount > 0)
      }
      if (cancelled) return
      setUnpaidToday(rows)
      setWaitingConvs(
        (paused ?? [])
          .filter((c) => c.phone)
          .map((c) => ({ phone: c.phone as string, name: c.full_name && c.full_name !== 'Müşteri' ? c.full_name : (c.phone as string) })),
      )
    }
    loadQuickExtras()
    return () => {
      cancelled = true
    }
  }, [actionSheetOpen])

  const hasQuickInfo = unpaidToday.length > 0 || waitingConvs.length > 0 || pending.length > 0 || (unpaid !== null && (unpaid.overdueCount > 0 || unpaid.soonCount > 0))

  return (
    <div className={styles.shell}>
      {/* Ortak ust bar sadece ana sayfada; diger sayfalar kendi basligini
          (PageHeader) ciziyor — tasarimdaki gibi. */}
      {isHome && (
      <header className={`${styles.topbar} ${styles.topbarHome}`}>
        <div className={styles.greeting}>
          <p>{todayLabel()}</p>
          <h1>
            {timeGreeting()}, {firstName}
          </h1>
        </div>
        <div className={styles.topbarRight}>
          <div className={styles.bellWrap} ref={bellRef}>
            <button
              type="button"
              className={styles.bellBtn}
              onClick={() => navigate('/bildirimler')}
              aria-label="Bildirimler"
            >
              <BellIcon />
              {pending.length > 0 && <span className={styles.bellBadge}>{pending.length}</span>}
            </button>
          </div>
          <div className={styles.profileWrap} ref={profileRef}>
            <button
              type="button"
              className={styles.profile}
              onClick={() => setProfileMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
            >
              <span className={styles.avatar}>{profileInitials(profile?.full_name ?? 'İşletme')}</span>
            </button>
            {profileMenuOpen && (
              <div className={styles.profileDropdown} role="menu">
                <div className={styles.profileDropdownHead}>
                  <span className={styles.profileDropdownName}>{profile?.full_name ?? 'İşletmeniz'}</span>
                  <span className={styles.profileDropdownRole}>{isAdmin ? 'Yönetici' : 'Çalışan'}</span>
                </div>
                <button
                  type="button"
                  className={styles.profileDropdownItem}
                  onClick={() => {
                    setProfileMenuOpen(false)
                    navigate('/ayarlar')
                  }}
                >
                  <SettingsIcon width={15} height={15} />
                  Ayarlar
                </button>
                <button
                  type="button"
                  className={`${styles.profileDropdownItem} ${styles.profileDropdownItemDanger}`}
                  onClick={() => {
                    setProfileMenuOpen(false)
                    signOut()
                  }}
                >
                  <LogOutIcon width={15} height={15} />
                  Çıkış yap
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      )}

      <main className={isHome ? styles.content : `${styles.content} ${styles.contentPage}`} ref={contentRef}>
        <Outlet context={{ searchQuery: '', setSearchPlaceholder: () => {} } satisfies LayoutOutletContext} />
      </main>

      <nav className={actionSheetOpen ? `${styles.bottomNav} ${styles.bottomNavRaised}` : styles.bottomNav}>
        {tabItems.slice(0, 2).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => (isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab)}
            >
              <span className={styles.tabIcon}>
                <Icon width={20} height={20} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}

        <button
          type="button"
          className={actionSheetOpen ? `${styles.fab} ${styles.fabOpen}` : styles.fab}
          onClick={() => setActionSheetOpen((v) => !v)}
          aria-label={actionSheetOpen ? 'Hızlı işlemleri kapat' : 'Hızlı işlemler'}
          aria-haspopup="menu"
          aria-expanded={actionSheetOpen}
        >
          <PlusIcon width={22} height={22} />
        </button>

        {tabItems.slice(2).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => (isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab)}
            >
              <span className={styles.tabIcon}>
                <Icon width={20} height={20} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {actionSheetOpen && (
        <div className={styles.quickOverlay} onClick={() => setActionSheetOpen(false)}>
          {hasQuickInfo && (
            <div className={styles.quickInfo} onClick={(e) => e.stopPropagation()}>
              <span className={styles.quickInfoTitle}>Önce bunlara bak</span>
              {unpaid !== null && unpaid.overdueCount > 0 && (
                <div className={styles.quickInfoRow}>
                  <span className={styles.quickInfoText}>
                    <span className={styles.quickInfoMain}>Geciken ödemeler · {currencyWhole.format(unpaid.overdueTotal)}</span>
                    <span className={styles.quickInfoSub}>
                      {unpaid.overdueCount} ödeme · en eskisi {unpaid.overdueOldest}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.quickInfoBtn}
                    onClick={() => {
                      setActionSheetOpen(false)
                      navigate('/giderler')
                    }}
                  >
                    Gör
                  </button>
                </div>
              )}
              {unpaid !== null && unpaid.soonCount > 0 && (
                <div className={styles.quickInfoRow}>
                  <span className={styles.quickInfoText}>
                    <span className={styles.quickInfoMain}>Yaklaşan ödemeler · {currencyWhole.format(unpaid.soonTotal)}</span>
                    <span className={styles.quickInfoSub}>
                      3 gün içinde {unpaid.soonCount} ödeme · {unpaid.soonFirst}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.quickInfoBtnQuiet}
                    onClick={() => {
                      setActionSheetOpen(false)
                      navigate('/giderler')
                    }}
                  >
                    Gör
                  </button>
                </div>
              )}
              {unpaidToday.length > 0 && (
                <div className={styles.quickInfoRow}>
                  <span className={styles.quickInfoText}>
                    <span className={styles.quickInfoMain}>
                      {unpaidToday.length === 1
                        ? `${unpaidToday[0].name}'in ödemesi alınmadı`
                        : `${unpaidToday.length} randevunun ödemesi alınmadı`}
                    </span>
                    <span className={styles.quickInfoSub}>
                      Bugün {unpaidToday[0].time} randevusu bitti · {currencyWhole.format(unpaidToday[0].amount)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.quickInfoBtn}
                    onClick={() => {
                      setActionSheetOpen(false)
                      navigate(unpaidToday[0].customerId ? `/musteriler/${unpaidToday[0].customerId}` : '/musteriler')
                    }}
                  >
                    Ödeme al
                  </button>
                </div>
              )}
              {waitingConvs.length > 0 && (
                <div className={styles.quickInfoRow}>
                  <span className={styles.quickInfoText}>
                    <span className={styles.quickInfoMain}>
                      {waitingConvs.length === 1 ? `${waitingConvs[0].name} yanıt bekliyor` : `${waitingConvs.length} konuşma yanıt bekliyor`}
                    </span>
                    <span className={styles.quickInfoSub}>Bot konuşmayı sana bıraktı</span>
                  </span>
                  <button
                    type="button"
                    className={styles.quickInfoBtnQuiet}
                    onClick={() => {
                      setActionSheetOpen(false)
                      navigate(`/mesajlar?telefon=${encodeURIComponent(waitingConvs[0].phone)}`)
                    }}
                  >
                    Aç
                  </button>
                </div>
              )}
              {pending.length > 0 && (
                <div className={styles.quickInfoRow}>
                  <span className={styles.quickInfoText}>
                    <span className={styles.quickInfoMain}>{pending.length} randevu onay bekliyor</span>
                    <span className={styles.quickInfoSub}>
                      İlki {pending[0].customer_name} ·{' '}
                      {new Date(pending[0].scheduled_at).toLocaleString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.quickInfoBtnQuiet}
                    onClick={() => {
                      setActionSheetOpen(false)
                      navigate(`/randevular?tarih=${apptDateKey(pending[0].scheduled_at)}`)
                    }}
                  >
                    Aç
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={styles.quickStack} role="menu" onClick={(e) => e.stopPropagation()}>
            {isAdmin && (
              <button
                type="button"
                role="menuitem"
                className={styles.quickPill}
                onClick={() => {
                  setActionSheetOpen(false)
                  navigate('/toplu-mesaj')
                }}
              >
                <span className={styles.quickPillIcon}>
                  <SendIcon width={16} height={16} />
                </span>
                Toplu mesaj
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                role="menuitem"
                className={styles.quickPill}
                onClick={() => {
                  setActionSheetOpen(false)
                  navigate('/giderler?yeni=1')
                }}
              >
                <span className={styles.quickPillIcon}>
                  <ReceiptIcon width={16} height={16} />
                </span>
                Gider ekle
              </button>
            )}
            {!isAdmin && (
            <button
              type="button"
              role="menuitem"
              className={styles.quickPill}
              onClick={() => {
                setActionSheetOpen(false)
                navigate('/mesajlar')
              }}
            >
              <span className={styles.quickPillIcon}>
                <MessagesIcon width={16} height={16} />
              </span>
              Mesajlar
            </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={styles.quickPill}
              onClick={() => {
                setActionSheetOpen(false)
                setQuickAddCustomerOpen(true)
              }}
            >
              <span className={styles.quickPillIcon}>
                <UserPlusIcon width={16} height={16} />
              </span>
              Yeni müşteri
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.quickPill}
              onClick={() => {
                setActionSheetOpen(false)
                navigate('/musteriler?sekme=borclu')
              }}
            >
              <span className={`${styles.quickPillIcon} ${styles.quickPillIconWarm}`}>
                <WalletIcon width={16} height={16} />
              </span>
              Ödeme al
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${styles.quickPill} ${styles.quickPillPrimary}`}
              onClick={() => {
                setActionSheetOpen(false)
                navigate('/randevular?yeni=1')
              }}
            >
              <span className={styles.quickPillIcon}>
                <CalendarIcon width={17} height={17} />
              </span>
              Yeni randevu
            </button>
          </div>
        </div>
      )}

      {quickAddCustomerOpen && <QuickAddCustomerModal onClose={() => setQuickAddCustomerOpen(false)} />}
    </div>
  )
}
