import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './HandoverAppointments.module.css'

interface Appt {
  id: string
  scheduled_at: string
  service_id: string | null
  customer_id: string | null
}

interface Props {
  employeeId: string
  employeeName: string
  onCancel: () => void
  // Tum randevular icin bir karar uygulandiktan sonra cagrilir; ust bilesen
  // calisani pasife alir.
  onDone: () => void
}

// 'to:<calisanId>' | 'keep' | 'cancel'
type Choice = string

// Calisan pasife alinirken ileri tarihli randevulari: her biri icin o
// hizmeti yapan baska bir calisana ver, iptal et ya da oldugu gibi birak.
// Mesai/doluluk kontrolu veritabani tetikleyicisinde; reddedilen satir
// isaretlenir ve pasife alma yapilmaz, kullanici baska secim yapabilir.
export default function HandoverAppointments({ employeeId, employeeName, onCancel, onDone }: Props) {
  const [loading, setLoading] = useState(true)
  const [appts, setAppts] = useState<Appt[]>([])
  const [customerName, setCustomerName] = useState<Map<string, string>>(new Map())
  const [serviceName, setServiceName] = useState<Map<string, string>>(new Map())
  const [others, setOthers] = useState<{ id: string; full_name: string | null }[]>([])
  const [doers, setDoers] = useState<Map<string, Set<string>>>(new Map())
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    async function load() {
      const [{ data: list }, { data: profs }, { data: es }, { data: svcs }] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, scheduled_at, service_id, customer_id')
          .eq('employee_id', employeeId)
          .in('status', ['bekliyor', 'onaylandi'])
          .gte('scheduled_at', new Date().toISOString())
          .order('scheduled_at')
          .limit(500),
        supabase.from('profiles').select('id, full_name').eq('is_active', true).neq('id', employeeId).order('full_name'),
        supabase.from('employee_services').select('profile_id, service_id'),
        supabase.from('services').select('id, name'),
      ])
      const custIds = [...new Set((list ?? []).map((a) => a.customer_id).filter((v): v is string => !!v))]
      const { data: custs } = custIds.length
        ? await supabase.from('customers').select('id, full_name').in('id', custIds.slice(0, 300))
        : { data: [] as { id: string; full_name: string }[] }

      const doersMap = new Map<string, Set<string>>()
      for (const r of es ?? []) {
        if (!doersMap.has(r.service_id)) doersMap.set(r.service_id, new Set())
        doersMap.get(r.service_id)!.add(r.profile_id)
      }
      const initial: Record<string, Choice> = {}
      for (const a of list ?? []) {
        const candidate = (profs ?? []).find((p) => a.service_id && doersMap.get(a.service_id)?.has(p.id))
        initial[a.id] = candidate ? `to:${candidate.id}` : 'keep'
      }
      setAppts(list ?? [])
      setOthers(profs ?? [])
      setDoers(doersMap)
      setServiceName(new Map((svcs ?? []).map((s) => [s.id, s.name])))
      setCustomerName(new Map((custs ?? []).map((c) => [c.id, c.full_name])))
      setChoices(initial)
      setLoading(false)
    }
    load()
  }, [employeeId])

  async function apply() {
    setBusy(true)
    const nextFailed: Record<string, string> = {}
    const done = new Set<string>()
    for (const a of appts) {
      const c = choices[a.id] ?? 'keep'
      if (c === 'keep') {
        done.add(a.id)
        continue
      }
      const patch = c === 'cancel' ? { status: 'iptal' } : { employee_id: c.slice(3) }
      const { error } = await supabase.from('appointments').update(patch).eq('id', a.id)
      if (error) nextFailed[a.id] = /mesaide|bloke|dolu/i.test(error.message) ? error.message : 'Aktarılamadı'
      else done.add(a.id)
    }
    setBusy(false)
    if (Object.keys(nextFailed).length > 0) {
      setAppts((prev) => prev.filter((a) => !done.has(a.id)))
      setFailed(nextFailed)
      return
    }
    onDone()
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>{employeeName} pasife alınmadan önce</span>
          <span className={styles.sub}>İleri tarihli randevularına ne olsun?</span>
        </div>

        {loading ? (
          <p className={styles.sub}>Yükleniyor…</p>
        ) : (
          <div className={styles.list}>
            {appts.map((a) => {
              const candidates = others.filter((p) => !a.service_id || doers.get(a.service_id)?.has(p.id))
              return (
                <div className={styles.row} key={a.id}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>
                      {when(a.scheduled_at)} · {a.customer_id ? (customerName.get(a.customer_id) ?? 'Müşteri') : 'Müşteri'}
                    </span>
                    <span className={styles.rowSub}>{a.service_id ? (serviceName.get(a.service_id) ?? 'Hizmet') : 'Hizmet'}</span>
                    {failed[a.id] && <span className={styles.rowError}>{failed[a.id]} — başka bir seçim yap</span>}
                  </span>
                  <select
                    className={styles.select}
                    value={choices[a.id] ?? 'keep'}
                    onChange={(e) => setChoices((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    aria-label="Randevuya ne olsun"
                  >
                    {candidates.map((p) => (
                      <option key={p.id} value={`to:${p.id}`}>
                        {(p.full_name ?? 'Çalışan').split(' ')[0]}’e ver
                      </option>
                    ))}
                    <option value="keep">Olduğu gibi bırak</option>
                    <option value="cancel">İptal et</option>
                  </select>
                </div>
              )
            })}
          </div>
        )}

        <p className={styles.note}>
          “Olduğu gibi bırak” seçilenler pasif çalışanda kalır; Randevular’dan sonra da değiştirebilirsin. İptal edilen
          randevular için müşteriye otomatik mesaj gitmez.
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.ghostBtn} onClick={onCancel} disabled={busy}>
            Vazgeç
          </button>
          <button type="button" className={styles.primaryBtn} onClick={apply} disabled={busy || loading}>
            {busy ? 'Uygulanıyor…' : 'Uygula ve pasife al'}
          </button>
        </div>
      </div>
    </div>
  )
}
