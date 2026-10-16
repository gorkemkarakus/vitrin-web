import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { callEdgeFunction } from '../lib/edgeFunctions'
import { NETWORK_ERROR } from '../lib/messages'
import PageHeader from '../components/PageHeader'
import { Share } from '@capacitor/share'
import PermissionEditor from '../components/PermissionEditor'
import RoleCards from '../components/RoleCards'
import { ROLE_PRESETS, presetFor, type PermKey, type RolePreset } from '../lib/permissions'
import { publicSiteBase } from '../lib/bookingUrl'
import { toLocalDateString } from '../lib/date'
import styles from './EmployeeCreatePage.module.css'
import { HOLIDAY_LABEL } from '../lib/scheduleLabels'

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
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export default function EmployeeCreatePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [gender, setGender] = useState<'' | 'kadin' | 'erkek'>('')
  const [services, setServices] = useState<ServiceLite[]>([])
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set())
  const [preset, setPreset] = useState<RolePreset | null>('calisan')
  const [perms, setPerms] = useState<Set<PermKey>>(
    new Set(ROLE_PRESETS.find((r) => r.key === 'calisan')?.perms ?? []),
  )
  const [fineTuneOpen, setFineTuneOpen] = useState(false)
  const [onlineBookable, setOnlineBookable] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(true)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [shared, setShared] = useState<'paylasildi' | 'kopyalandi' | null>(null)
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

  function choosePreset(key: RolePreset) {
    setPreset(key)
    const found = ROLE_PRESETS.find((r) => r.key === key)
    if (found && key !== 'yonetici') setPerms(new Set(found.perms))
  }

  function changePerms(next: Set<PermKey>) {
    setPerms(next)
    setPreset(presetFor('user', next))
  }

  function goToStep2(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setStep(2)
  }

  const isAdminRole = preset === 'yonetici'

  async function handleCreate() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await callEdgeFunction<{ id: string }>('create-team-member', {
          email,
          password,
          full_name: fullName,
          phone,
          gender: gender || null,
          role: isAdminRole ? 'admin' : 'user',
          must_change_password: mustChangePassword,
          online_bookable: onlineBookable,
        })
      if (!res.ok) {
        setError(res.error ?? 'Hesap oluşturulamadı.')
        setStep(1)
        return
      }
      const newId = res.data.id as string
      // Yetkiler (yoneticide gerek yok, her seyi yapar).
      if (profile?.business_id && !isAdminRole) {
        const { error: permErr } = await supabase
          .from('employee_permissions')
          .insert({ profile_id: newId, business_id: profile.business_id, permissions: Array.from(perms) })
        if (permErr && !/does not exist|could not find/i.test(permErr.message)) {
          window.alert('Hesap açıldı ama yetkiler kaydedilemedi; çalışanın sayfasından tekrar seçebilirsin.')
        }
      }
      if (selectedServices.size > 0) {
        await supabase
          .from('employee_services')
          .insert(Array.from(selectedServices).map((service_id) => ({ profile_id: newId, service_id })))
      }
      // Daha once girilmis (bugunden sonraki) tatiller yeni calisana da
      // uygulanir — yoksa bot/online sayfa tatil gunu ona randevu verirdi.
      const { data: holidayBlocks } = await supabase
        .from('employee_time_blocks')
        .select('block_date, end_date, starts_at, ends_at')
        .eq('label', HOLIDAY_LABEL)
        .is('day_of_week', null)
        .gte('end_date', toLocalDateString(new Date()))
      const uniq = new Map<string, { block_date: string; end_date: string | null; starts_at: string; ends_at: string }>()
      for (const b of holidayBlocks ?? []) uniq.set(`${b.block_date}|${b.end_date}|${b.starts_at}|${b.ends_at}`, b)
      if (uniq.size > 0) {
        await supabase
          .from('employee_time_blocks')
          .insert(Array.from(uniq.values()).map((b) => ({ ...b, profile_id: newId, day_of_week: null, label: HOLIDAY_LABEL })))
      }
      setCreatedId(newId)
      setStep(3)
    } catch {
      setError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const firstName = fullName.trim().split(/\s+/)[0] || 'Çalışan'
  const site = publicSiteBase()
  const inviteText =
    `Merhaba ${firstName}, Adapptiv hesabın açıldı.\n` +
    `E-posta: ${email}\n` +
    `Geçici şifre: ${password}\n` +
    (mustChangePassword ? 'İlk girişte kendi şifreni belirleyeceksin.\n' : '') +
    (site ? `Giriş: ${site}` : '')

  async function shareInvite() {
    try {
      await Share.share({ title: 'Adapptiv hesabın', text: inviteText })
      setShared('paylasildi')
    } catch {
      try {
        await navigator.clipboard.writeText(inviteText)
        setShared('kopyalandi')
      } catch {
        window.alert(inviteText)
      }
    }
  }

  if (step === 3) {
    return (
      <div className={styles.wrap}>
        <PageHeader back={() => navigate(createdId ? `/ekip/${createdId}` : '/ekip', { replace: true })} title="Hesap açıldı" />
        <div className={styles.formCard}>
          <span className={styles.doneTitle}>{fullName} artık uygulamaya girebilir</span>
          <div className={styles.credBox}>
            <span>E-posta: <b>{email}</b></span>
            <span>Geçici şifre: <b>{password}</b></span>
          </div>
          <span className={styles.fieldHint}>
            {mustChangePassword
              ? 'İlk girişte kendi şifresini belirlemesi istenecek.'
              : 'Bu şifreyle girer; sonra Ayarlar’dan değiştirebilir.'}
          </span>
        </div>
        <span className={styles.note}>Giriş bilgilerini WhatsApp, SMS ya da e-postayla gönderebilirsin.</span>
        <div className={styles.footer}>
          <button type="button" className={styles.footerBtn} onClick={shareInvite}>
            {shared === 'kopyalandi' ? 'Kopyalandı ✓ · tekrar paylaş' : shared === 'paylasildi' ? 'Paylaşıldı ✓ · tekrar paylaş' : 'Giriş bilgilerini gönder'}
          </button>
          <button
            type="button"
            className={styles.footerGhost}
            onClick={() => navigate(createdId ? `/ekip/${createdId}` : '/ekip', { replace: true })}
          >
            {firstName}’in sayfasına git
          </button>
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className={styles.wrap}>
        <PageHeader back={() => setStep(1)} title={`${firstName} uygulamada ne görsün?`} sub="Sonradan değiştirebilirsin" />

        <RoleCards value={preset} onChange={choosePreset} disabled={submitting} />

        {!isAdminRole && (
          <>
            <button type="button" className={styles.fineTuneBtn} onClick={() => setFineTuneOpen((v) => !v)}>
              {fineTuneOpen ? 'İnce ayarı gizle' : 'İnce ayar'} ›
            </button>
            {fineTuneOpen && <PermissionEditor value={perms} onChange={changePerms} disabled={submitting} />}
          </>
        )}

        <div className={styles.listCard}>
          <label className={styles.toggleRow}>
            <span className={styles.toggleText}>
              <span className={styles.checkLabel}>Online randevuda görünür</span>
              <span className={styles.fieldHint}>Müşteri online sayfadan {firstName}’i seçebilir</span>
            </span>
            <span className={styles.switch}>
              <input type="checkbox" checked={onlineBookable} onChange={() => setOnlineBookable((v) => !v)} />
              <span className={styles.switchTrack} />
            </span>
          </label>
          <label className={styles.toggleRow}>
            <span className={styles.toggleText}>
              <span className={styles.checkLabel}>İlk girişte kendi şifresini belirlesin</span>
              <span className={styles.fieldHint}>Geçici şifreyle girer, hemen yenisini koyar</span>
            </span>
            <span className={styles.switch}>
              <input type="checkbox" checked={mustChangePassword} onChange={() => setMustChangePassword((v) => !v)} />
              <span className={styles.switchTrack} />
            </span>
          </label>
        </div>

        <div className={styles.infoBox}>
          {isAdminRole ? (
            <>Yönetici her şeyi görür ve değiştirir: kasa, ekip, ayarlar, yetkiler.</>
          ) : (
            <>
              Hesap açma, yetki verme, toplu mesaj, AI analiz ve reklam her zaman <b>yalnızca yöneticide</b> kalır.
            </>
          )}
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
            {submitting ? 'Oluşturuluyor…' : 'Kaydet ve davet hazırla'}
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
              placeholder="en az 8 karakter"
              required
              minLength={8}
            />
            <button type="button" className={styles.genBtn} onClick={() => setPassword(generatePassword())}>
              Üret
            </button>
          </div>
          <span className={styles.fieldHint}>İlk girişte kendi şifresini belirler (bir sonraki adımda değiştirebilirsin)</span>
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
