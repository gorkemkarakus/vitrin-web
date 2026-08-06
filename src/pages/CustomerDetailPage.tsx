import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Avatar from '../components/Avatar'
import Select from '../components/Select'
import { ChevronRightIcon, PhoneIcon, MailIcon, WalletIcon } from '../components/icons'
import styles from './CustomerDetailPage.module.css'

interface Customer {
  id: string
  full_name: string
  phone: string | null
  contact_phone: string | null
  email: string | null
  created_at: string
}

interface Service {
  id: string
  name: string
  price: number | null
}

interface Appointment {
  id: string
  service_id: string | null
  scheduled_at: string
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal'
  package_id: string | null
}

interface ServicePackage {
  id: string
  service_id: string | null
  total_sessions: number
  created_at: string
}

interface Payment {
  id: string
  amount: number
  method: 'nakit' | 'kart' | 'diger'
  paid_at: string
  appointment_id: string | null
  package_id: string | null
  note: string | null
}

const METHOD_LABEL: Record<Payment['method'], string> = { nakit: 'Nakit', kart: 'Kart', diger: 'Diğer' }
const PAYMENT_METHOD_OPTIONS = [
  { value: 'nakit', label: 'Nakit' },
  { value: 'kart', label: 'Kart' },
  { value: 'diger', label: 'Diğer' },
]

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })

// "phone" bazen chatbot kanal kimligi olabilir — gercek numara varsa
// (contact_phone) her zaman ona oncelik ver.
function customerPhone(c: Customer) {
  return c.contact_phone || c.phone || null
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('nakit')
  const [payTarget, setPayTarget] = useState('')
  const [payNote, setPayNote] = useState('')
  const [paySubmitting, setPaySubmitting] = useState(false)

  async function loadData() {
    if (!id) return
    setLoading(true)
    const [{ data: cust }, { data: appts }, { data: pkgs }, { data: pays }, { data: svcs }] = await Promise.all([
      supabase
        .from('customers')
        .select('id, full_name, phone, contact_phone, email, created_at')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('appointments')
        .select('id, service_id, scheduled_at, status, package_id')
        .eq('customer_id', id)
        .order('scheduled_at', { ascending: false }),
      supabase.from('service_packages').select('id, service_id, total_sessions, created_at').eq('customer_id', id),
      supabase
        .from('payments')
        .select('id, amount, method, paid_at, appointment_id, package_id, note')
        .eq('customer_id', id)
        .order('paid_at', { ascending: false }),
      supabase.from('services').select('id, name, price'),
    ])
    setCustomer(cust ?? null)
    setAppointments(appts ?? [])
    setPackages(pkgs ?? [])
    setPayments(pays ?? [])
    setServices(svcs ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const serviceById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])

  // Paket bazinda: beklenen = seans sayisi x hizmet fiyati, odenen = o pakete
  // bagli tum odemelerin toplami, kalan = beklenen - odenen.
  const packageStats = useMemo(
    () =>
      packages.map((pkg) => {
        const svc = pkg.service_id ? serviceById.get(pkg.service_id) : undefined
        const sessions = appointments.filter((a) => a.package_id === pkg.id)
        const completed = sessions.filter((a) => a.status === 'tamamlandi').length
        const expected = pkg.total_sessions * (svc?.price ?? 0)
        const paid = payments.filter((p) => p.package_id === pkg.id).reduce((s, p) => s + p.amount, 0)
        return { pkg, svc, sessionCount: sessions.length, completed, expected, paid, remaining: expected - paid }
      }),
    [packages, appointments, payments, serviceById],
  )

  // Pakete bagli olmayan ama tamamlanmis randevular icin de bakiye takibi.
  const standaloneAppts = useMemo(
    () =>
      appointments
        .filter((a) => !a.package_id && a.status === 'tamamlandi')
        .map((a) => {
          const svc = a.service_id ? serviceById.get(a.service_id) : undefined
          const expected = svc?.price ?? 0
          const paid = payments.filter((p) => p.appointment_id === a.id).reduce((s, p) => s + p.amount, 0)
          return { appt: a, svc, expected, paid, remaining: expected - paid }
        }),
    [appointments, payments, serviceById],
  )

  const totalPaid = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments])
  const totalRemaining = useMemo(
    () =>
      packageStats.reduce((s, p) => s + Math.max(0, p.remaining), 0) +
      standaloneAppts.reduce((s, a) => s + Math.max(0, a.remaining), 0),
    [packageStats, standaloneAppts],
  )

  const paymentTargetOptions = useMemo(() => {
    const opts = [{ value: '', label: 'Serbest (belirli bir şeye bağlı değil)' }]
    for (const p of packageStats) {
      if (p.remaining > 0) {
        opts.push({
          value: `pkg:${p.pkg.id}`,
          label: `${p.svc?.name ?? 'Paket'} (${p.completed}/${p.pkg.total_sessions} seans) — kalan ${currency.format(p.remaining)}`,
        })
      }
    }
    for (const a of standaloneAppts) {
      if (a.remaining > 0) {
        opts.push({
          value: `appt:${a.appt.id}`,
          label: `${a.svc?.name ?? 'Randevu'} — ${new Date(a.appt.scheduled_at).toLocaleDateString('tr-TR')} — kalan ${currency.format(a.remaining)}`,
        })
      }
    }
    return opts
  }, [packageStats, standaloneAppts])

  async function submitPayment(e: FormEvent) {
    e.preventDefault()
    const amount = Number(payAmount)
    if (!amount || amount <= 0 || !id) return
    setPaySubmitting(true)
    try {
      const package_id = payTarget.startsWith('pkg:') ? payTarget.slice(4) : null
      const appointment_id = payTarget.startsWith('appt:') ? payTarget.slice(5) : null
      await supabase.from('payments').insert({
        business_id: profile?.business_id,
        customer_id: id,
        appointment_id,
        package_id,
        amount,
        method: payMethod,
        note: payNote.trim() || null,
        created_by_user_id: profile?.id,
      })
      setPayModalOpen(false)
      setPayAmount('')
      setPayMethod('nakit')
      setPayTarget('')
      setPayNote('')
      await loadData()
    } finally {
      setPaySubmitting(false)
    }
  }

  if (loading) return <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>
  if (!customer) return <p style={{ color: 'var(--text-dim)' }}>Müşteri bulunamadı.</p>

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.backBtn} onClick={() => navigate('/musteriler')}>
        <ChevronRightIcon width={14} height={14} className={styles.backIcon} />
        Müşterilere Dön
      </button>

      <div className={`card ${styles.headerCard}`}>
        <Avatar name={customer.full_name} size={56} />
        <div className={styles.headerInfo}>
          <span className={styles.headerName}>{customer.full_name}</span>
          {customerPhone(customer) && (
            <span className={styles.headerLine}>
              <PhoneIcon width={12} height={12} />
              {customerPhone(customer)}
            </span>
          )}
          {customer.email && (
            <span className={styles.headerLine}>
              <MailIcon width={12} height={12} />
              {customer.email}
            </span>
          )}
        </div>
      </div>

      <div className={styles.balanceRow}>
        <div className={`card ${styles.balanceCard}`}>
          <span className={styles.balanceLabel}>Toplam Ödenen</span>
          <span className={styles.balanceValueOk}>{currency.format(totalPaid)}</span>
        </div>
        <div className={`card ${styles.balanceCard}`}>
          <span className={styles.balanceLabel}>Kalan Bakiye</span>
          <span className={totalRemaining > 0 ? styles.balanceValueDanger : styles.balanceValueOk}>
            {totalRemaining > 0 ? currency.format(totalRemaining) : 'Borç yok'}
          </span>
        </div>
      </div>

      <button type="button" className={styles.payBtn} onClick={() => setPayModalOpen(true)}>
        <WalletIcon width={16} height={16} />
        Ödeme Al
      </button>

      {packageStats.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Paketler</h2>
          <div className={styles.list}>
            {packageStats.map((p) => (
              <div key={p.pkg.id} className={styles.packageRow}>
                <div className={styles.packageRowMain}>
                  <span className={styles.packageRowName}>{p.svc?.name ?? 'Hizmet'}</span>
                  <span className={styles.packageRowProgress}>
                    {p.completed}/{p.pkg.total_sessions} seans tamamlandı
                  </span>
                </div>
                <div className={styles.packageRowStats}>
                  <span className={styles.packageRowExpected}>{currency.format(p.expected)}</span>
                  <span className={p.remaining > 0 ? styles.packageRowRemainingDanger : styles.packageRowRemainingOk}>
                    {p.remaining > 0 ? `Kalan ${currency.format(p.remaining)}` : 'Ödendi'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {standaloneAppts.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Tamamlanan Randevular</h2>
          <div className={styles.list}>
            {standaloneAppts.map((a) => (
              <div key={a.appt.id} className={styles.packageRow}>
                <div className={styles.packageRowMain}>
                  <span className={styles.packageRowName}>{a.svc?.name ?? 'Hizmet'}</span>
                  <span className={styles.packageRowProgress}>
                    {new Date(a.appt.scheduled_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div className={styles.packageRowStats}>
                  <span className={styles.packageRowExpected}>{currency.format(a.expected)}</span>
                  <span className={a.remaining > 0 ? styles.packageRowRemainingDanger : styles.packageRowRemainingOk}>
                    {a.remaining > 0 ? `Kalan ${currency.format(a.remaining)}` : 'Ödendi'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 14 }}>Ödeme Geçmişi</h2>
        {payments.length === 0 ? (
          <p className={styles.empty}>Henüz ödeme kaydı yok.</p>
        ) : (
          <div className={styles.list}>
            {payments.map((p) => (
              <div key={p.id} className={styles.paymentRow}>
                <div className={styles.paymentRowMain}>
                  <span className={styles.paymentRowAmount}>{currency.format(p.amount)}</span>
                  <span className={styles.paymentRowMeta}>
                    {METHOD_LABEL[p.method]} · {new Date(p.paid_at).toLocaleDateString('tr-TR')}
                    {p.note ? ` · ${p.note}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {payModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setPayModalOpen(false)}>
          <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>Ödeme Al</h2>
              <button type="button" className={styles.modalClose} onClick={() => setPayModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={submitPayment}>
              <div className="field">
                <label htmlFor="payAmount">Tutar (TL)</label>
                <input
                  id="payAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="payMethod">Yöntem</label>
                <Select id="payMethod" value={payMethod} onChange={setPayMethod} options={PAYMENT_METHOD_OPTIONS} />
              </div>
              <div className="field">
                <label htmlFor="payTarget">Hangi hizmete/pakete ait</label>
                <Select id="payTarget" value={payTarget} onChange={setPayTarget} options={paymentTargetOptions} />
              </div>
              <div className="field">
                <label htmlFor="payNote">Not (opsiyonel)</label>
                <input id="payNote" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="ör. indirimli ödendi" />
              </div>
              <button type="submit" className="btn-primary" disabled={paySubmitting}>
                {paySubmitting ? 'Kaydediliyor…' : 'Ödemeyi Kaydet'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
