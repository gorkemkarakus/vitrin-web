import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader'
import PermissionEditor from '../components/PermissionEditor'
import { DEFAULT_PERMISSIONS, type PermKey } from '../lib/permissions'
import styles from './EmployeeCreatePage.module.css'

const GENDER_OPTIONS: { value: '' | 'kadin' | 'erkek'; label: string }[] = [
  { value: '', label: 'Belirtilmesin' },
  { value: 'kadin', label: 'Kadın' },
  { value: 'erkek', label: 'Erkek' },
]

interface ServiceLite {
  id: string
  name: string
}

// Okunmasi/yazilmasi kolay gecici sifre (karisan harfler yok).
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export default function EmployeeCreatePage() {
  const navigate = useNavigate()
  const { session, profile } = useAuth()

  const [step, setStep] = useState<1 | 2>(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [gender, setGender] = useState<'' | 'kadin' | 'erkek'>('')
  const [services, setServices] = useState<ServiceLite[]>([])
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set())
  const [perms, setPerms] = useState<Set<PermKey>>(new Set(DEFAULT_PERMISSIONS))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('services')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setServices(data ?? []))
  }, [])

  function toggleService(id: string) {
    setSelectedServices((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function goToStep2(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setStep(2)
  }

  async function handleCreate() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-team-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email, password, full_name: fullName, phone, gender: gender || null }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Hesap oluşturulamadı.')
        setStep(1)
        return
      }
      const newId = body.data.id as string
      // Yetkiler: varsayilandan farkli olsa da olmasa da satir yazilir ki
      // calisan sayfasinda neyin acik oldugu net gorunsun.
      if (profile?.business_id) {
        const { error: permErr } = await supabase
          .from('employee_permissions')
          .insert({ profile_id: newId, business_id: profile.business_id, permissions: Array.from(perms) })
        if (permErr && !/does not exist|could not find/i.test(permErr.message)) {
          // Sayfa birazdan calisanin sayfasina gececegi icin hata ekranda kalmaz.
          window.alert('Hesap açıldı ama yetkiler kaydedilemedi; çalışanın sayfasından tekrar seçebilirsin.')
        }
      }
      if (selectedServices.size > 0) {
        await supabase
          .from('employee_services')
          .insert(Array.from(selectedServices).map((service_id) => ({ profile_id: newId, service_id })))
      }
      navigate(`/ekip/${newId}`, { replace: true })
    } catch {
      setError('Sunucuya ulaşılamadı, tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  const firstName = fullName.trim().split(/\s+/)[0] || 'Çalışan'

  if (step === 2) {
    return (
      <div className={styles.wrap}>
        <PageHeader back={() => setStep(1)} title={`${firstName} uygulamada ne görsün?`} sub="Sonradan değiştirebilirsin" />

        <PermissionEditor value={perms} onChange={setPerms} disabled={submitting} />

        <div className={styles.infoBox}>
          Hesap açma, yetki verme, toplu mesaj, AI analiz ve reklam her zaman <b>yalnızca yöneticide</b> kalır.
        </div>

        <span className={styles.groupLabel}>Yaptığı hizmetler</span>
        {services.length === 0 ? (
          <p className={styles.hint}>Henüz hizmet yok; sonra çalışanın sayfasından seçebilirsin.</p>
        ) : (
          <div className={styles.listCard}>
            {services.map((s) => {
              const on = selectedServices.has(s.id)
              return (
                <button type="button" key={s.id} className={styles.checkRow} onClick={() => toggleService(s.id)} aria-pressed={on}>
                  <span className={styles.checkLabel}>{s.name}</span>
                  <span className={on ? styles.checkBoxOn : styles.checkBox}>{on ? '✓' : ''}</span>
                </button>
              )
            })}
          </div>
        )}
        <p className={styles.hint}>Seçmediğin hizmetler için {firstName}’e randevu verilmez.</p>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.footer}>
          <button type="button" className={styles.footerBtn} onClick={handleCreate} disabled={submitting}>
            {submitting ? 'Oluşturuluyor…' : 'Kaydet ve hesabı oluştur'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className={styles.wrap} onSubmit={goToStep2}>
      <PageHeader back="/ekip" title="Yeni çalışan" />

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.formCard}>
        <div className={styles.field}>
          <label htmlFor="fullName">Ad soyad</label>
          <input id="fullName" className={styles.inputStrong} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ayşe Yılmaz" required />
        </div>
        <div className={styles.field}>
          <label htmlFor="newPhone">Telefon</label>
          <input
            id="newPhone"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="05xx xxx xx xx"
            required
            minLength={10}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="newEmail">E-posta</label>
          <input id="newEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ayse@ornek.com" required />
          <span className={styles.fieldHint}>Uygulamaya bu e-postayla girer</span>
        </div>
        <div className={styles.field}>
          <label htmlFor="newPassword">Geçici şifre</label>
          <div className={styles.passwordBox}>
            <input
              id="newPassword"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="en az 6 karakter"
              required
              minLength={6}
            />
            <button type="button" className={styles.genBtn} onClick={() => setPassword(generatePassword())}>
              Üret
            </button>
          </div>
          <span className={styles.fieldHint}>Bu şifreyi çalışana ilet; sonra Ayarlar’dan değiştirebilir</span>
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Cinsiyet (isteğe bağlı)</span>
          <div className={styles.segmented}>
            {GENDER_OPTIONS.map((g) => (
              <button
                type="button"
                key={g.value}
                className={gender === g.value ? styles.segmentActive : styles.segment}
                onClick={() => setGender(g.value)}
              >
                {g.label}
              </button>
            ))}
          </div>
          <span className={styles.fieldHint}>Müşteri botta “kadın çalışan olsun” derse doğru kişiyi önermek için</span>
        </div>
      </div>

      <span className={styles.note}>Kaydettikten sonra çalışma saatlerini ve yaptığı hizmetleri seçeceksin.</span>

      <div className={styles.footer}>
        <button type="submit" className={styles.footerBtn}>
          Devam · yetkiler
        </button>
      </div>
    </form>
  )
}
