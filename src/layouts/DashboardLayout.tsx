import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import Logo from '../components/Logo'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  DashboardIcon,
  AppointmentsIcon,
  TeamIcon,
  ServicesIcon,
  AccountingIcon,
  UsersIcon,
  SearchIcon,
  BellIcon,
  PlusIcon,
  MenuIcon,
  CloseIcon,
  SettingsIcon,
  LogOutIcon,
} from '../components/icons'
import styles from './DashboardLayout.module.css'

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Anasayfa', adminOnly: true, icon: DashboardIcon },
  { path: '/randevular', label: 'Randevular', adminOnly: false, icon: AppointmentsIcon },
  { path: '/muhasebe', label: 'Muhasebe', adminOnly: true, icon: AccountingIcon },
  { path: '/ekip', label: 'Ekip', adminOnly: true, icon: TeamIcon },
  { path: '/hizmetler', label: 'Hizmetler', adminOnly: true, icon: ServicesIcon },
  { path: '/kullanicilar', label: 'Kullanıcılar', adminOnly: true, icon: UsersIcon },
  { path: '/ayarlar', label: 'Ayarlar', adminOnly: false, icon: SettingsIcon },
]

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

  const [searchQuery, setSearchQuery] = useState('')
  const [searchPlaceholder, setSearchPlaceholder] = useState('Ara…')
  const [pending, setPending] = useState<PendingAppointment[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

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
    closeSearch()
  }

  useEffect(() => {
    closeOverlays()
    setMenuOpen(false)
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
        if (bellOpen || profileMenuOpen || searchExpanded) {
          closeOverlays()
          return
        }
        if (menuOpen) {
          setMenuOpen(false)
          return
        }
        if (canGoBack) navigate(-1)
        else CapacitorApp.exitApp()
      }).then((handle) => {
        removeListener = () => handle.remove()
      })
    })
    return () => removeListener?.()
  }, [bellOpen, profileMenuOpen, searchExpanded, menuOpen, navigate])

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

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)
  const currentTitle = NAV_ITEMS.find((item) => item.path === location.pathname)?.label ?? 'Panel'

  return (
    <div className={styles.shell}>
      {menuOpen && <div className={styles.backdrop} onClick={() => setMenuOpen(false)} />}

      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logoWrap}>
          <Logo />
          <button
            type="button"
            className={styles.drawerClose}
            onClick={() => setMenuOpen(false)}
            aria-label="Menüyü kapat"
          >
            <CloseIcon width={20} height={20} />
          </button>
        </div>
        <nav className={styles.nav}>
          {visibleItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                }
              >
                <Icon className={styles.navIcon} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
        <button className={styles.newAppointmentBtn} onClick={() => navigate('/randevular?yeni=1')}>
          <PlusIcon width={16} height={16} />
          Yeni Randevu
        </button>
        <button className={styles.sidebarSignOut} onClick={() => signOut()}>
          <LogOutIcon width={16} height={16} />
          Çıkış yap
        </button>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.menuBtn}
            onClick={() => setMenuOpen(true)}
            aria-label="Menüyü aç"
          >
            <MenuIcon />
          </button>
          <h1 className={`${styles.pageTitle} ${searchExpanded ? styles.pageTitleHidden : ''}`}>{currentTitle}</h1>
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
                <div className={styles.profileText}>
                  <span className={styles.profileName}>{profile?.full_name ?? 'İşletmeniz'}</span>
                  <span className={styles.profileRole}>{isAdmin ? 'Salon Sahibi' : 'Çalışan'}</span>
                </div>
              </button>
              {profileMenuOpen && (
                <div className={styles.profileDropdown} role="menu">
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
      </div>
    </div>
  )
}
