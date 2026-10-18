import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ChevronRightIcon, LockIcon } from '../components/icons'
import { visibleNavItems } from '../lib/navigation'
import styles from './MorePage.module.css'
import { initials } from '../lib/formatName'

export default function MorePage() {
  const navigate = useNavigate()
  const { profile, signOut, can, plan, hasFeature } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const name = profile?.full_name ?? 'İşletmeniz'

  // Kutular ortak ekran listesinden (lib/navigation.ts); AI kalemi mor zeminli.
  const visibleItems = visibleNavItems(isAdmin, can).filter((item) => item.more)

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
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .gt('bot_paused_until', new Date().toISOString()),
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
            {[
              staffCount !== null ? `${staffCount} çalışan` : null,
              businessName ? name : isAdmin ? 'Yönetici' : 'Çalışan',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className={styles.profileLink}>
          Profil <ChevronRightIcon width={14} height={14} />
        </span>
      </button>

      {isAdmin && plan && (
        <button type="button" className={styles.planRow} onClick={() => navigate('/planlar')}>
          <span className={styles.planText}>
            <span className={styles.planLabel}>Paketiniz</span>
            <span className={styles.planName}>{plan.name}</span>
          </span>
          <span className={styles.profileLink}>
            Paketler <ChevronRightIcon width={14} height={14} />
          </span>
        </button>
      )}

      <div className={styles.grid}>
        {visibleItems.map((item) => {
          const Icon = item.icon
          const locked = item.feature ? !hasFeature(item.feature) : false
          return (
            <button
              type="button"
              key={item.path}
              className={item.tint ? `${styles.tile} ${styles.tileTint}` : styles.tile}
              onClick={() => navigate(item.path)}
              aria-label={locked ? `${item.label} (paketinizde yok)` : undefined}
            >
              <Icon width={24} height={24} />
              {locked && (
                <span className={styles.tileLock} aria-hidden="true">
                  <LockIcon width={13} height={13} />
                </span>
              )}
              {!locked && item.path === '/mesajlar' && waitingCount > 0 && (
                <span className={styles.tileBadge}>{waitingCount}</span>
              )}
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
