import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ChevronRightIcon, LockIcon } from '../components/icons'
import { NAV_GROUP_LABELS, visibleNavItems } from '../lib/navigation'
import styles from './MorePage.module.css'
import { initials } from '../lib/formatName'
import { myDueTaskCount } from '../lib/tasks'

export default function MorePage() {
  const navigate = useNavigate()
  const { profile, signOut, can, plan, hasFeature } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const name = profile?.full_name ?? 'İşletmeniz'

  // Kutular ortak ekran listesinden (lib/navigation.ts); AI kalemi mor zeminli.
  const visibleItems = visibleNavItems(isAdmin, can).filter((item) => item.more)
  const groups = (Object.keys(NAV_GROUP_LABELS) as (keyof typeof NAV_GROUP_LABELS)[])
    .map((key) => ({ key, label: NAV_GROUP_LABELS[key], items: visibleItems.filter((i) => i.group === key) }))
    .filter((g) => g.items.length > 0)

  // Ust kartta isletme adi + calisan sayisi, Mesajlar kutusunda seni
  // bekleyen (botun biraktigi) konusma sayisi.
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [staffCount, setStaffCount] = useState<number | null>(null)
  const [waitingCount, setWaitingCount] = useState(0)
  const [dueTasks, setDueTasks] = useState(0)
  const profileId = profile?.id
  useEffect(() => {
    if (profileId) myDueTaskCount(profileId).then(setDueTasks)
  }, [profileId])
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

      {/* Yan menudeki gibi gruplu: 15 kutu tek yiginda kaybolmasin. */}
      {groups.map((g) => (
        <section key={g.key} className={styles.group}>
          <h2 className={styles.groupTitle}>{g.label}</h2>
          <div className={styles.grid}>
            {g.items.map((item) => {
              const Icon = item.icon
              const locked = item.feature ? !hasFeature(item.feature) : false
              return (
                <button
                  type="button"
                  key={item.path}
                  className={item.tint ? `${styles.tile} ${styles.tileTint}` : styles.tile}
                  onClick={() => navigate(item.path)}
                  aria-label={
                    locked
                      ? `${item.label} (paketinizde yok)`
                      : item.wideOnly
                        ? `${item.label} (bilgisayarda kullanılır)`
                        : undefined
                  }
                >
                  <span className={styles.tileIcon}>
                    <Icon width={22} height={22} />
                  </span>
                  {locked && (
                    <span className={styles.tileLock} aria-hidden="true">
                      <LockIcon width={13} height={13} />
                    </span>
                  )}
                  {!locked && item.path === '/mesajlar' && waitingCount > 0 && (
                    <span className={styles.tileBadge}>{waitingCount}</span>
                  )}
                  {item.path === '/gorevler' && dueTasks > 0 && <span className={styles.tileBadge}>{dueTasks}</span>}
                  <span className={styles.tileLabel}>{item.label}</span>
                  {item.wideOnly && <span className={styles.tileTag}>Bilgisayarda</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}

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
