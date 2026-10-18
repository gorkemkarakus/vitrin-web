import { NavLink, useNavigate } from 'react-router-dom'
import logoMark from '../assets/brand/logo-mark.png'
import { useAuth } from '../contexts/AuthContext'
import { BellIcon, CalendarIcon, LockIcon, LogOutIcon, UserPlusIcon } from '../components/icons'
import { NAV_GROUP_LABELS, visibleNavItems, type NavItem } from '../lib/navigation'
import { initials } from '../lib/formatName'
import styles from './Sidebar.module.css'

// Genis ekranda (>= 1024px) alt sekme cubugu ve + menusu yerine. Kalemler
// telefondaki "Daha fazla" ile ayni listeden gelir (lib/navigation.ts).
export default function Sidebar({
  pendingCount,
  onNewCustomer,
  badges = {},
}: {
  pendingCount: number
  onNewCustomer: () => void
  // Menu kalemi yolu -> rozet sayisi (ör. bugun ve geciken gorevler)
  badges?: Record<string, number>
}) {
  const navigate = useNavigate()
  const { profile, can, plan, hasFeature, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const items = visibleNavItems(isAdmin, can)
  const groups = (Object.keys(NAV_GROUP_LABELS) as NavItem['group'][])
    .map((g) => ({ key: g, label: NAV_GROUP_LABELS[g], items: items.filter((i) => i.group === g) }))
    .filter((g) => g.items.length > 0)
  const name = profile?.full_name ?? 'İşletmeniz'

  return (
    <aside className={styles.sidebar} aria-label="Ana menü">
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <img src={logoMark} alt="" />
        </span>
        <span className={styles.brandName}>Adapptiv</span>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={() => navigate('/randevular?yeni=1')}>
          <CalendarIcon width={17} height={17} />
          Yeni randevu
        </button>
        <button type="button" className={styles.secondary} onClick={onNewCustomer}>
          <UserPlusIcon width={16} height={16} />
          Yeni müşteri
        </button>
      </div>

      <nav className={styles.nav}>
        {groups.map((group) => (
          <div key={group.key} className={styles.group}>
            <span className={styles.groupLabel}>{group.label}</span>
            {group.items.map((item) => {
              const Icon = item.icon
              const locked = item.feature ? !hasFeature(item.feature) : false
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => (isActive ? `${styles.item} ${styles.itemActive}` : styles.item)}
                >
                  <Icon width={18} height={18} />
                  <span className={styles.itemLabel}>{item.label}</span>
                  {!locked && (badges[item.path] ?? 0) > 0 && <span className={styles.badge}>{badges[item.path]}</span>}
                  {locked && (
                    <span className={styles.itemLock} aria-label="Paketinizde yok">
                      <LockIcon width={13} height={13} />
                    </span>
                  )}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        {isAdmin && plan && (
          <NavLink
            to="/planlar"
            className={({ isActive }) => (isActive ? `${styles.planRow} ${styles.planRowActive}` : styles.planRow)}
          >
            <span className={styles.planLabel}>Paketiniz</span>
            <span className={styles.planName}>{plan.name}</span>
          </NavLink>
        )}
        <NavLink
          to="/bildirimler"
          className={({ isActive }) => (isActive ? `${styles.item} ${styles.itemActive}` : styles.item)}
        >
          <BellIcon width={18} height={18} />
          <span className={styles.itemLabel}>Bildirimler</span>
          {pendingCount > 0 && <span className={styles.badge}>{pendingCount}</span>}
        </NavLink>
        <div className={styles.me}>
          <span className={styles.avatar}>{initials(name)}</span>
          <span className={styles.meText}>
            <span className={styles.meName}>{name}</span>
            <span className={styles.meRole}>{isAdmin ? 'Yönetici' : 'Çalışan'}</span>
          </span>
          <button type="button" className={styles.signOut} onClick={() => signOut()} aria-label="Çıkış yap">
            <LogOutIcon width={16} height={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
