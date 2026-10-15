import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  AccountingIcon,
  TeamIcon,
  ServicesIcon,
  SettingsIcon,
  ChevronRightIcon,
  TrophyIcon,
  MegaphoneIcon,
  MessagesIcon,
  SparkleIcon,
  SendIcon,
} from '../components/icons'
import styles from './MorePage.module.css'

// `tint: true` olan kutu (AI İş Analizi) diger kutulardan ayri, mor zeminle
// cizilir — yapay zeka ozelligi oldugunu renkle ayirt etmek icin.
const MENU_ITEMS = [
  { path: '/mesajlar', label: 'Mesajlar', adminOnly: false, icon: MessagesIcon, tint: false },
  { path: '/toplu-mesaj', label: 'Toplu mesaj', adminOnly: true, icon: SendIcon, tint: false },
  { path: '/muhasebe', label: 'Muhasebe', adminOnly: true, icon: AccountingIcon, tint: false },
  { path: '/ekip', label: 'Ekip', adminOnly: true, icon: TeamIcon, tint: false },
  { path: '/hizmetler', label: 'Hizmetler', adminOnly: true, icon: ServicesIcon, tint: false },
  { path: '/performans-raporu', label: 'Performans', adminOnly: true, icon: TrophyIcon, tint: false },
  { path: '/reklam', label: 'Reklam', adminOnly: true, icon: MegaphoneIcon, tint: false },
  { path: '/ai-analiz', label: 'AI analiz', adminOnly: true, icon: SparkleIcon, tint: true },
  { path: '/ayarlar', label: 'Ayarlar', adminOnly: false, icon: SettingsIcon, tint: false },
]

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export default function MorePage() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const name = profile?.full_name ?? 'İşletmeniz'

  const visibleItems = MENU_ITEMS.filter((item) => !item.adminOnly || isAdmin)

  // Ust kartta isletme adi + calisan sayisi, Mesajlar kutusunda seni
  // bekleyen (botun biraktigi) konusma sayisi.
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [staffCount, setStaffCount] = useState<number | null>(null)
  const [waitingCount, setWaitingCount] = useState(0)
  useEffect(() => {
    if (!profile?.business_id) return
    Promise.all([
      supabase.from('businesses').select('name').eq('id', profile.business_id).maybeSingle(),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('customers').select('id', { count: 'exact', head: true }).gt('bot_paused_until', new Date().toISOString()),
    ]).then(([{ data: biz }, { count: staff }, { count: waiting }]) => {
      setBusinessName(biz?.name ?? null)
      setStaffCount(staff ?? null)
      setWaitingCount(waiting ?? 0)
    })
  }, [profile?.business_id])
  const title = businessName ?? name

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.profileCard} onClick={() => navigate('/ayarlar')}>
        <span className={styles.profileAvatar}>{initials(title)}</span>
        <span className={styles.profileText}>
          <span className={styles.profileName}>{title}</span>
          <span className={styles.profileRole}>
            {[staffCount !== null ? `${staffCount} çalışan` : null, businessName ? name : isAdmin ? 'Yönetici' : 'Çalışan']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className={styles.profileLink}>
          Profil <ChevronRightIcon width={14} height={14} />
        </span>
      </button>

      <div className={styles.grid}>
        {visibleItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              type="button"
              key={item.path}
              className={item.tint ? `${styles.tile} ${styles.tileTint}` : styles.tile}
              onClick={() => navigate(item.path)}
            >
              <Icon width={24} height={24} />
              {item.path === '/mesajlar' && waitingCount > 0 && <span className={styles.tileBadge}>{waitingCount}</span>}
              <span className={styles.tileLabel}>{item.label}</span>
            </button>
          )
        })}
      </div>

      <div className={styles.footerRow}>
        <button type="button" className={styles.footerLink} onClick={() => navigate('/bildirimler')}>
          Bildirimler
        </button>
        <span>Adapptiv</span>
        <button type="button" className={styles.footerSignOut} onClick={() => signOut()}>
          Çıkış yap
        </button>
      </div>
    </div>
  )
}
