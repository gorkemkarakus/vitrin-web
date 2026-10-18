import { useState } from 'react'
import { currency } from '../../lib/currency'
import { ChevronRightIcon, MessagesIcon, MoreHorizontalIcon, PencilIcon, UserIcon } from '../../components/icons'
import styles from '../AppointmentsPage.module.css'
import SwipeToConfirm from './SwipeToConfirm'
import SurveyShare from './SurveyShare'
import { SOURCE_STORY, STATUS_DROPDOWN_OPTIONS, STATUS_OPTIONS } from './constants'
import { SLOT_MINUTES, type Appointment } from './types'

interface Props {
  appointment: Appointment
  customerName: string
  customerNote: string | null
  // Gosterim icin bicimli telefon; konusma icin ham numara.
  phone: string | null
  rawPhone: string | null
  serviceName: string
  employeeName: string
  // Randevuya ozel ucret yoksa hizmetin liste fiyati.
  servicePrice: number | null
  pkg: { current: number; total: number } | null
  canEdit: boolean
  onClose: () => void
  onStatusChange: (status: Appointment['status']) => void
  onComplete: () => void
  onEdit: () => void
  onOpenCustomer: () => void
  onOpenConversation: () => void
}

type StoryTone = 'purple' | 'navy' | 'ok' | 'danger' | 'muted'

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// "Randevunun hikayesi": kaydin bilinen olaylari sirayla.
function storyOf(a: Appointment) {
  const story: { key: string; title: string; sub: string; tone: StoryTone }[] = []
  if (a.created_at) {
    story.push({
      key: 'created',
      title: `${SOURCE_STORY[a.source] ?? 'Salon'} oluşturdu`,
      sub: fmt(a.created_at) + (a.source_note ? ` · ${a.source_note}` : ''),
      tone: a.source === 'chatbot' || a.source === 'online_randevu' ? 'purple' : 'navy',
    })
  }
  if (a.reminder_sent_at) {
    story.push({
      key: 'reminder',
      title: 'Hatırlatma gönderildi',
      sub: `${fmt(a.reminder_sent_at)} · WhatsApp`,
      tone: 'navy',
    })
  }
  if (a.status === 'onaylandi') story.push({ key: 'st', title: 'Onaylandı', sub: 'Randevu onaylı', tone: 'ok' })
  if (a.status === 'tamamlandi')
    story.push({
      key: 'st',
      title: 'Tamamlandı',
      sub: a.notes ? `İşlem notu: ${a.notes}` : 'İşlem kapandı',
      tone: 'ok',
    })
  if (a.status === 'iptal') story.push({ key: 'st', title: 'İptal edildi', sub: 'Randevu iptal', tone: 'danger' })
  if (a.status === 'gelmedi')
    story.push({ key: 'st', title: 'Gelmedi', sub: 'Müşteri gelmedi olarak işaretlendi', tone: 'muted' })
  return story
}

export default function AppointmentDetailView({
  appointment: a,
  customerName,
  customerNote,
  phone,
  rawPhone,
  serviceName,
  employeeName,
  servicePrice,
  pkg,
  canEdit,
  onClose,
  onStatusChange,
  onComplete,
  onEdit,
  onOpenCustomer,
  onOpenConversation,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const start = new Date(a.scheduled_at)
  const durMin = a.duration_minutes ?? SLOT_MINUTES
  const isOpen = a.status === 'bekliyor' || a.status === 'onaylandi'
  const price = a.price_override ?? servicePrice
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === a.status)?.label ?? a.status
  const story = storyOf(a)

  return (
    <div className={styles.fullScreen}>
      <div className={styles.fullScroll}>
        <div className={styles.fsHeadSplit}>
          <button type="button" className={styles.fsBack} onClick={onClose} aria-label="Geri">
            <ChevronRightIcon width={18} height={18} className={styles.backIcon} />
          </button>
          {canEdit && (
            <div className={styles.viewMenuWrap}>
              <button
                type="button"
                className={styles.fsBack}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Durumu değiştir"
                aria-expanded={menuOpen}
              >
                <MoreHorizontalIcon width={18} height={18} />
              </button>
              {menuOpen && (
                <div className={styles.viewMenu} role="menu">
                  <span className={styles.viewMenuTitle}>Durumu değiştir</span>
                  {STATUS_DROPDOWN_OPTIONS.filter((o) => o.value !== a.status && o.value !== 'tamamlandi').map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={styles.viewMenuItem}
                      onClick={() => {
                        setMenuOpen(false)
                        onStatusChange(o.value as Appointment['status'])
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.detailHero}>
          <div className={styles.detailDate}>
            <span className={styles.detailDateWeekday}>
              {start.toLocaleDateString('tr-TR', { weekday: 'short' }).toLocaleUpperCase('tr')}
            </span>
            <span className={styles.detailDateDay}>{start.getDate()}</span>
            <span className={styles.detailDateMonth}>{start.toLocaleDateString('tr-TR', { month: 'long' })}</span>
          </div>
          <div className={styles.detailHeroText}>
            <span className={styles.detailHeroTitle}>
              {start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {customerName}
            </span>
            <span className={styles.detailHeroSub}>
              {serviceName} · {employeeName} · {durMin} dk
              {pkg ? ` · ${pkg.current}/${pkg.total} seans` : ''}
            </span>
            <span className={`${styles.detailHeroStatus} ${styles[`detailStatus_${a.status}`]}`}>
              {statusLabel}
              {price != null ? ` · ${currency.format(price)}` : ''}
            </span>
          </div>
        </div>

        {customerNote && (
          <div className={styles.customerNote}>
            <span className={styles.customerNoteLabel}>Müşteri notu</span>
            {customerNote}
          </div>
        )}

        <div className={styles.storyCard}>
          <span className={styles.storyTitle}>Randevunun hikâyesi</span>
          {story.map((s, i) => (
            <div className={styles.storyRow} key={s.key}>
              <span className={styles.storyRail}>
                <span className={`${styles.storyDot} ${styles[`storyDot_${s.tone}`]}`} />
                {(i < story.length - 1 || isOpen) && <span className={styles.storyLine} />}
              </span>
              <span className={styles.storyText}>
                <span className={styles.storyItemTitle}>{s.title}</span>
                <span className={styles.storyItemSub}>{s.sub}</span>
              </span>
            </div>
          ))}
          {isOpen && (
            <div className={styles.storyRow}>
              <span className={styles.storyRail}>
                <span className={`${styles.storyDot} ${styles.storyDot_pending}`} />
              </span>
              <span className={styles.storyText}>
                <span className={`${styles.storyItemTitle} ${styles.storyItemWarm}`}>Tamamlanmayı bekliyor</span>
                <span className={styles.storyItemSub}>Ödeme ve seans kaydı</span>
              </span>
            </div>
          )}
        </div>

        <div className={styles.detailActions}>
          <button type="button" className={styles.detailAction} disabled={!a.customer_id} onClick={onOpenCustomer}>
            <UserIcon width={18} height={18} />
            Müşteri
          </button>
          <button type="button" className={styles.detailAction} disabled={!rawPhone} onClick={onOpenConversation}>
            <MessagesIcon width={18} height={18} />
            Konuşma
          </button>
          <button type="button" className={styles.detailAction} disabled={!canEdit} onClick={onEdit}>
            <PencilIcon width={18} height={18} />
            Düzenle
          </button>
        </div>
        {phone && (
          <a className={styles.detailCall} href={`tel:${phone}`}>
            {phone} · Ara
          </a>
        )}
        {a.status === 'tamamlandi' && a.customer_id && (
          <SurveyShare appointmentId={a.id} customerName={customerName} phone={rawPhone} />
        )}
      </div>

      {canEdit && isOpen && <SwipeToConfirm label="Tamamlamak için kaydır" onConfirm={onComplete} />}
    </div>
  )
}
