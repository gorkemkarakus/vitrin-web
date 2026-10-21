import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'
import { toLocalDateString, timeOf } from '../lib/date'
import styles from './TeamPage.module.css'
import { HOLIDAY_LABEL } from '../lib/scheduleLabels'
import { AVATAR_TONES } from '../lib/avatarColor'
import { withTimeSuffix } from '../lib/timeSuffix'

interface Employee {
  id: string
  full_name: string | null
  role: 'admin' | 'user'
  is_active: boolean
}

interface TimeBlock {
  profile_id: string
  day_of_week: number | null
  block_date: string | null
  end_date: string | null
  label: string | null
}

interface Schedule {
  profile_id: string
  day_of_week: number
  starts_at: string
  ends_at: string
}

interface Appointment {
  id: string
  employee_id: string | null
  customer_id: string | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
  scheduled_at: string
  duration_minutes: number | null
}

export default function TeamPage() {
  const navigate = useNavigate()
  // Ekip yetkili calisan da bu sayfayi gorur; hesap acmak yalnizca yoneticide.
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [employees, setEmployees] = useState<Employee[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [serviceNamesByEmployee, setServiceNamesByEmployee] = useState<Map<string, string[]>>(new Map())
  const [customerNames, setCustomerNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)

  const today = useMemo(() => toLocalDateString(new Date()), [])

  useEffect(() => {
    async function loadData() {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      const [{ data: profs }, { data: blocks }, { data: scheds }, { data: appts }, { data: empSvcs }, { data: svcs }] =
        await Promise.all([
          supabase.from('profiles').select('id, full_name, role, is_active').order('full_name'),
          supabase.from('employee_time_blocks').select('profile_id, day_of_week, block_date, end_date, label'),
          supabase.from('employee_schedules').select('profile_id, day_of_week, starts_at, ends_at'),
          // Sadece bugunun randevulari — kartlardaki "su an / siradaki" icin.
          supabase
            .from('appointments')
            .select('id, employee_id, customer_id, status, scheduled_at, duration_minutes')
            .gte('scheduled_at', start.toISOString())
            .lt('scheduled_at', end.toISOString())
            .order('scheduled_at'),
          supabase.from('employee_services').select('profile_id, service_id'),
          supabase.from('services').select('id, name'),
        ])
      const svcName = new Map((svcs ?? []).map((s) => [s.id, s.name as string]))
      const byEmp = new Map<string, string[]>()
      for (const es of empSvcs ?? []) {
        const n = svcName.get(es.service_id)
        if (!n) continue
        byEmp.set(es.profile_id, [...(byEmp.get(es.profile_id) ?? []), n])
      }
      const custIds = [...new Set((appts ?? []).map((a) => a.customer_id).filter(Boolean))] as string[]
      const { data: custs } = custIds.length
        ? await supabase.from('customers').select('id, full_name').in('id', custIds)
        : { data: [] as { id: string; full_name: string }[] }
      setEmployees(profs ?? [])
      setTimeBlocks(blocks ?? [])
      setSchedules(scheds ?? [])
      setAppointments((appts ?? []) as Appointment[])
      setServiceNamesByEmployee(byEmp)
      setCustomerNames(new Map((custs ?? []).map((c) => [c.id, c.full_name])))
      setLoading(false)
    }
    loadData()
  }, [])

  // Calisanin "su an" durumu: pasif, izinli, bugun calismiyor, mesai
  // baslamadi, musteride (devam eden randevu) ya da bos.
  function liveFor(emp: Employee) {
    const nowMs = Date.now()
    const nowDow = new Date().getDay()
    const mine = appointments.filter((a) => a.employee_id === emp.id && a.status !== 'iptal')
    const count = mine.length
    if (!emp.is_active) return { pill: 'Pasif', tone: 'muted', info: 'Hesabı kapalı', count }
    const onLeave = timeBlocks.find(
      (b) =>
        b.profile_id === emp.id &&
        b.day_of_week === null &&
        b.block_date !== null &&
        b.block_date <= today &&
        today <= (b.end_date ?? b.block_date),
    )
    if (onLeave) {
      const isHoliday = onLeave.label === HOLIDAY_LABEL
      return {
        pill: isHoliday ? 'Tatil' : 'İzinli',
        tone: 'muted',
        info: isHoliday ? 'Resmî tatil' : 'Bugün izinli',
        count,
      }
    }
    const sched = schedules.find((s) => s.profile_id === emp.id && s.day_of_week === nowDow)
    if (!sched) return { pill: 'Çalışmıyor', tone: 'muted', info: 'Bugün mesaisi yok', count }
    const open = mine.filter((a) => a.status === 'bekliyor' || a.status === 'onaylandi')
    const current = open.find((a) => {
      const s = new Date(a.scheduled_at).getTime()
      return s <= nowMs && nowMs < s + (a.duration_minutes ?? 30) * 60000
    })
    if (current) {
      const endAt = new Date(new Date(current.scheduled_at).getTime() + (current.duration_minutes ?? 30) * 60000)
      return {
        pill: 'Müşteride',
        tone: 'warm',
        info: `${customerNames.get(current.customer_id ?? '') ?? 'Müşteri'} · ${withTimeSuffix(endAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), 'e')} kadar`,
        count,
      }
    }
    const next = open.find((a) => new Date(a.scheduled_at).getTime() > nowMs)
    const nextInfo = next
      ? `Sıradaki ${timeOf(next.scheduled_at)} · ${customerNames.get(next.customer_id ?? '') ?? 'Müşteri'}`
      : count === 0
        ? 'Bugün randevu yok'
        : 'Bugün başka randevu yok'
    const [sh, sm] = sched.starts_at.split(':').map(Number)
    const [eh, em] = sched.ends_at.split(':').map(Number)
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    if (nowMin < sh * 60 + sm)
      return {
        pill: `${withTimeSuffix(sched.starts_at.slice(0, 5), 'de')} başlıyor`,
        tone: 'muted',
        info: nextInfo,
        count,
      }
    if (nowMin >= eh * 60 + em) return { pill: 'Mesai bitti', tone: 'muted', info: nextInfo, count }
    return { pill: 'Boş', tone: 'ok', info: nextInfo, count }
  }

  const nextHoliday = timeBlocks
    .filter((b) => b.label === HOLIDAY_LABEL && b.block_date && b.block_date >= today)
    .map((b) => b.block_date as string)
    .sort()[0]

  const ordered = [...employees].sort((a, b) => Number(b.is_active) - Number(a.is_active))
  const nowLabel = new Date().toLocaleString('tr-TR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Ekip"
        action={
          isAdmin && (
            <button type="button" className="hdr-btn-navy" onClick={() => navigate('/ekip/yeni')}>
              + Çalışan
            </button>
          )
        }
      />
      <span className={styles.nowLine}>Şu an · {nowLabel.charAt(0).toLocaleUpperCase('tr') + nowLabel.slice(1)}</span>

      {loading ? (
        <p className={styles.empty}>Yükleniyor…</p>
      ) : ordered.length === 0 ? (
        <p className={styles.empty}>Henüz ekip üyesi yok. “+ Çalışan” ile ekle.</p>
      ) : (
        <div className={styles.cardGrid}>
          {ordered.map((emp, i) => {
            const live = liveFor(emp)
            const svc = serviceNamesByEmployee.get(emp.id) ?? []
            return (
              <button
                type="button"
                key={emp.id}
                className={emp.is_active ? styles.card : `${styles.card} ${styles.cardMuted}`}
                onClick={() => navigate(`/ekip/${emp.id}`)}
              >
                <span className={styles.cardTop}>
                  <span className={`${styles.avatar} ${styles[AVATAR_TONES[i % AVATAR_TONES.length]]}`}>
                    {(emp.full_name ?? '?').trim().charAt(0).toLocaleUpperCase('tr')}
                  </span>
                  <span className={styles.cardWho}>
                    <span className={styles.cardName}>{emp.full_name ?? '—'}</span>
                    <span className={styles.cardRole}>
                      {svc.length > 0
                        ? svc
                            .slice(0, 3)
                            .join(', ')
                            .toLocaleLowerCase('tr')
                            .replace(/^./, (c) => c.toLocaleUpperCase('tr')) +
                          (svc.length > 3 ? ` +${svc.length - 3}` : '')
                        : emp.role === 'admin'
                          ? 'Yönetici'
                          : 'Hizmet seçilmemiş'}
                    </span>
                  </span>
                  <span className={`${styles.pill} ${styles[`pill_${live.tone}`]}`}>{live.pill}</span>
                </span>
                <span className={styles.infoLine}>
                  {live.info}
                  {live.count > 0 && <span className={styles.infoCount}> · {live.count} randevu</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className={styles.linkGrid}>
        <button type="button" className={styles.linkCard} onClick={() => navigate('/ekip/tatiller')}>
          <span className={styles.linkTitle}>Tatil günleri</span>
          <span className={styles.linkSub}>
            {nextHoliday
              ? `Sıradaki: ${new Date(`${nextHoliday}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`
              : 'Kapalı gün yok'}
          </span>
        </button>
        <button type="button" className={styles.linkCard} onClick={() => navigate('/performans-raporu')}>
          <span className={styles.linkTitle}>Performans raporu</span>
          <span className={styles.linkSub}>
            {new Date().toLocaleDateString('tr-TR', { month: 'long' }).replace(/^./, (c) => c.toLocaleUpperCase('tr'))}{' '}
            özeti
          </span>
        </button>
      </div>
    </div>
  )
}
