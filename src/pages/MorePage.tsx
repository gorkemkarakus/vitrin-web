import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  AccountingIcon,
  TeamIcon,
  ServicesIcon,
  UsersIcon,
  SettingsIcon,
  LogOutIcon,
  ChevronRightIcon,
} from '../components/icons'
import styles from './MorePage.module.css'

const MENU_ITEMS = [
  { path: '/muhasebe', label: 'Muhasebe', sub: 'Gelir, gider ve kasa durumu', adminOnly: true, icon: AccountingIcon },
  { path: '/ekip', label: 'Ekip', sub: 'Personel, programlar ve izinler', adminOnly: true, icon: TeamIcon },
  { path: '/hizmetler', label: 'Hizmetler', sub: 'Hizmet listesi ve fiyatlar', adminOnly: true, icon: ServicesIcon },
  { path: '/kullanicilar', label: 'Kullanıcılar', sub: 'Ekip üyesi hesapları', adminOnly: true, icon: UsersIcon },
  { path: '/ayarlar', label: 'Ayarlar', sub: 'Hesap ve işletme ayarları', adminOnly: false, icon: SettingsIcon },
]

export default function MorePage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const visibleItems = MENU_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  return (
    <div className={styles.wrap}>
      <div className="card">
        {visibleItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              type="button"
              key={item.path}
              className={styles.row}
              onClick={() => navigate(item.path)}
            >
              <span className={styles.rowIcon}>
                <Icon width={18} height={18} />
              </span>
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{item.label}</span>
                <span className={styles.rowSub}>{item.sub}</span>
              </span>
              <ChevronRightIcon width={16} height={16} className={styles.rowChevron} />
            </button>
          )
        })}
      </div>

      <button type="button" className={styles.signOutRow} onClick={() => signOut()}>
        <LogOutIcon width={18} height={18} />
        Çıkış yap
      </button>
    </div>
  )
}
