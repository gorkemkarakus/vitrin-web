import { useCallback, useEffect, useRef, useState } from 'react'
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
  SearchIcon,
  BellIcon,
  PlusIcon,
  UserPlusIcon,
  ReceiptIcon,
  CashIcon,
  CloseIcon,
  SettingsIcon,
  LogOutIcon,
} from '../components/icons'
import styles from './DashboardLayout.module.css'

const TAB_ITEMS = [
  { path: '/dashboard', label: 'Ana Sayfa', icon: HomeIcon },
  { path: '/randevular', label: 'Takvim', icon: AppointmentsIcon },
  { path: '/musteriler', label: 'Müşteriler', icon: UsersIcon },
  { path: '/daha-fazla', label: 'Daha Fazla', icon: MoreHorizontalIcon },
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Ana Sayfa',
  '/randevular': 'Takvim',
  '/musteriler': 'Müşteriler',
  '/daha-fazla': 'Daha Fazla',
  '/muhasebe': 'Muhasebe',
  '/ekip': 'Ekip',
  '/hizmetler': 'Hizmetler',
  '/kullanicilar': 'Kullanıcılar',
  '/ayarlar': 'Ayarlar',
  '/mesajlar': 'Mesajlar',
}

function pageTitleFor(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const match = Object.keys(PAGE_TITLES).find((p) => pathname.startsWith(p + '/'))
  return match ? PAGE_TITLES[match] : 'Panel'
}

function timeGreeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Günaydın'
  if (h < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

interface PendingAppointment {
  id: string
  scheduled_at: string
  customer_name: string
}

function apptDateKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface LayoutOutletContext {
  searchQuery: string
  setSearchPlaceholder: (placeholder: string) => void
  // Sayfa, gercek filtrelenmis sonuclarin bulundugu kapsayiciyi
  // ref={registerSearchResultsAnchor} ile isaretlerse, Enter/arama butonu o
  // kapsayiciya kaydirir. Isaretlemeyen sayfalarda (filtrelenen liste zaten
  // sayfanin en üstündeyse) en basa kaydirma davranisi otomatik devam eder.
  registerSearchResultsAnchor: (el: HTMLElement | null) => void
}

export default function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const isHome = location.pathname === '/dashboard'
  const firstName = (profile?.full_name ?? 'İşletmeniz').trim().split(/\s+/)[0]

  const [searchQuery, setSearchQuery] = useState('')
  const [searchPlaceholder, setSearchPlaceholder] = useState('Ara…')
  const [pending, setPending] = useState<PendingAppointment[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [quickAddCustomerOpen, setQuickAddCustomerOpen] = useState(false)

  const bellRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const searchResultsAnchorRef = useRef<HTMLElement | null>(null)
  const registerSearchResultsAnchor = useCallback((el: HTMLElement | null) => {
    searchResultsAnchorRef.current = el
  }, [])

  function closeSearch() {
    setSearchExpanded(false)
    setSearchQuery('')
  }

  // Liste uzunsa ve kullanici zaten asagi kaydirmissa, filtre uygulansa
  // bile eslesen satirlar ekran disinda kalabiliyordu — Enter'a basinca
  // veya bu butona dokununca listeyi basa sarip klavyeyi kapatarak sonucu
  // dogrudan gozler onune seriyoruz.
  function goToSearchResults() {
    const anchor = searchResultsAnchorRef.current
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  function closeOverlays() {
    setBellOpen(false)
    setProfileMenuOpen(false)
    setActionSheetOpen(false)
    closeSearch()
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
        if (bellOpen || profileMenuOpen || searchExpanded || actionSheetOpen) {
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
  }, [bellOpen, profileMenuOpen, searchExpanded, actionSheetOpen, quickAddCustomerOpen, navigate])

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

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        {isHome ? (
          <div className={`${styles.greeting} ${searchExpanded ? styles.pageTitleHidden : ''}`}>
            <h1>
              {timeGreeting()}, {firstName} 👋
            </h1>
            <p>Bugün işletmende neler oluyor?</p>
          </div>
        ) : (
          <h1 className={`${styles.pageTitle} ${searchExpanded ? styles.pageTitleHidden : ''}`}>
            {pageTitleFor(location.pathname)}
          </h1>
        )}
        <div
          className={`${styles.searchWrap} ${searchExpanded ? styles.searchWrapExpanded : ''}`}
          ref={searchRef}
        >
          <button type="button" className={styles.searchIconBtn} onClick={() => setSearchExpanded(true)} aria-label="Ara">
            <SearchIcon className={styles.searchIcon} />
          </button>
          <SearchIcon className={styles.searchInputIcon} />
          <input
            className={styles.searchInput}
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                goToSearchResults()
              }
            }}
            autoFocus={searchExpanded}
            enterKeyHint="search"
          />
          <button
            type="button"
            className={styles.searchSubmitBtn}
            onClick={goToSearchResults}
            aria-label="Sonuca git"
          >
            <SearchIcon width={14} height={14} />
          </button>
          {(searchExpanded || searchQuery) && (
            <button type="button" className={styles.searchCloseBtn} onClick={closeSearch} aria-label="Aramayı kapat">
              <CloseIcon width={13} height={13} />
            </button>
          )}
        </div>
        <div className={styles.topbarRight}>
          <div className={styles.bellWrap} ref={bellRef}>
            <button
              type="button"
              className={styles.bellBtn}
              onClick={() => setBellOpen((v) => !v)}
              aria-label="Bildirimler"
            >
              <BellIcon />
              {pending.length > 0 && <span className={styles.bellBadge}>{pending.length}</span>}
            </button>
            {bellOpen && (
              <div className={styles.bellDropdown}>
                <div className={styles.bellDropdownTitle}>Bekleyen randevular</div>
                {pending.length === 0 ? (
                  <p className={styles.bellEmpty}>Bekleyen randevu yok.</p>
                ) : (
                  pending.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      className={styles.bellItem}
                      onClick={() => {
                        setBellOpen(false)
                        navigate(`/randevular?tarih=${apptDateKey(a.scheduled_at)}`)
                      }}
                    >
                      <span>{a.customer_name}</span>
                      <span className={styles.bellItemTime}>
                        {new Date(a.scheduled_at).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className={styles.profileWrap} ref={profileRef}>
            <button
              type="button"
              className={styles.profile}
              onClick={() => setProfileMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
            >
              <span className={styles.avatar}>{(profile?.full_name ?? 'İ').charAt(0).toUpperCase()}</span>
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

      <main className={styles.content} ref={contentRef}>
        <Outlet
          context={
            { searchQuery, setSearchPlaceholder, registerSearchResultsAnchor } satisfies LayoutOutletContext
          }
        />
      </main>

      <nav className={styles.bottomNav}>
        {TAB_ITEMS.slice(0, 2).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => (isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab)}
            >
              <Icon width={22} height={22} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}

        <button
          type="button"
          className={styles.fab}
          onClick={() => setActionSheetOpen(true)}
          aria-label="Hızlı işlemler"
          aria-haspopup="menu"
          aria-expanded={actionSheetOpen}
        >
          <PlusIcon width={24} height={24} />
        </button>

        {TAB_ITEMS.slice(2).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => (isActive ? `${styles.tab} ${styles.tabActive}` : styles.tab)}
            >
              <Icon width={22} height={22} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {actionSheetOpen && (
        <div className={styles.sheetBackdrop} onClick={() => setActionSheetOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <h2 className={styles.sheetTitle}>Hızlı işlemler</h2>
            <div className={styles.sheetGrid}>
              <button
                type="button"
                className={styles.sheetItem}
                onClick={() => {
                  setActionSheetOpen(false)
                  navigate('/randevular?yeni=1')
                }}
              >
                <span className={`${styles.sheetItemIcon} ${styles.sheetItemIconSignal}`}>
                  <PlusIcon width={20} height={20} />
                </span>
                Yeni Randevu
              </button>
              <button
                type="button"
                className={styles.sheetItem}
                onClick={() => {
                  setActionSheetOpen(false)
                  setQuickAddCustomerOpen(true)
                }}
              >
                <span className={`${styles.sheetItemIcon} ${styles.sheetItemIconPink}`}>
                  <UserPlusIcon width={20} height={20} />
                </span>
                Yeni Müşteri
              </button>
              <button
                type="button"
                className={styles.sheetItem}
                onClick={() => {
                  setActionSheetOpen(false)
                  navigate('/muhasebe')
                }}
              >
                <span className={`${styles.sheetItemIcon} ${styles.sheetItemIconOk}`}>
                  <ReceiptIcon width={20} height={20} />
                </span>
                Yeni Ödeme
              </button>
              <button type="button" className={styles.sheetItem} disabled>
                <span className={styles.sheetItemIcon}>
                  <CashIcon width={20} height={20} />
                </span>
                Kasa İşlemi
                <span className={styles.sheetItemBadge}>Yakında</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {quickAddCustomerOpen && <QuickAddCustomerModal onClose={() => setQuickAddCustomerOpen(false)} />}
    </div>
  )
}
