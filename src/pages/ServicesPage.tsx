import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDismiss } from '../hooks/useDismiss'
import { useAuth } from '../contexts/AuthContext'
import PageHeader from '../components/PageHeader'
import { SearchIcon, CheckCircleIcon, ChevronRightIcon } from '../components/icons'
import { currencyWhole as currency } from '../lib/currency'
import styles from './ServicesPage.module.css'
import { firstName } from '../lib/formatName'
import { AVATAR_TONES } from '../lib/avatarColor'

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number | null
  is_active: boolean
  description: string | null
  online_bookable?: boolean
  package_sessions?: number | null
  package_price?: number | null
}

interface Employee {
  id: string
  full_name: string | null
}

interface EmployeeService {
  profile_id: string
  service_id: string
}

type SortBy = 'ad' | 'fiyat' | 'sure'

const SORT_OPTIONS: { value: SortBy; label: string; short: string }[] = [
  { value: 'ad', label: 'Ada göre (A–Z)', short: 'A–Z' },
  { value: 'fiyat', label: 'Fiyata göre (yüksekten)', short: 'Fiyat' },
  { value: 'sure', label: 'Süreye göre (uzundan)', short: 'Süre' },
]

export default function ServicesPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [services, setServices] = useState<Service[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [links, setLinks] = useState<EmployeeService[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('ad')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  // Duzenleme ekrani adres satirinda tutulur (?duzenle=<id> / ?yeni=1);
  // boylece Aciklama sayfasindan geri donunce ayni hizmete donulur.
  const editId = searchParams.get('duzenle')
  const isNew = searchParams.get('yeni') === '1'
  const editing = editId ? services.find((s) => s.id === editId) ?? null : null
  const editorOpen = isNew || !!editing

  const [name, setName] = useState('')
  const [duration, setDuration] = useState(60)
  const [price, setPrice] = useState('')
  const [active, setActive] = useState(true)
  const [onlineBookable, setOnlineBookable] = useState(true)
  const [packageOn, setPackageOn] = useState(false)
  const [packageSessions, setPackageSessions] = useState('10')
  const [packagePrice, setPackagePrice] = useState('')
  const [staff, setStaff] = useState<Set<string>>(new Set())
  const [monthStats, setMonthStats] = useState<{ count: number; revenue: number } | null>(null)
  const [activePackages, setActivePackages] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // "silent=true" bir mutasyondan sonra cagrilir — veriyi arka planda
  // tazeler ama "loading" bayragini geri true yapmaz.
  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    const [{ data: svc }, { data: emps }, { data: es }] = await Promise.all([
      supabase
        .from('services')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('employee_services').select('profile_id, service_id'),
    ])
    setServices(svc ?? [])
    setEmployees(emps ?? [])
    setLinks(es ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const closeSortMenu = useCallback(() => setSortMenuOpen(false), [])
  useDismiss(sortMenuRef, sortMenuOpen, closeSortMenu)

  // Editor acildiginda formu doldur + bu ayki kullanimi getir.
  useEffect(() => {
    if (isNew) {
      setName('')
      setDuration(60)
      setPrice('')
      setActive(true)
      setOnlineBookable(true)
      setPackageOn(false)
      setPackageSessions('10')
      setPackagePrice('')
      setStaff(new Set())
      setMonthStats(null)
      setActivePackages(0)
      return
    }
    if (!editing) return
    setName(editing.name)
    setDuration(editing.duration_minutes)
    setPrice(editing.price == null ? '' : String(editing.price))
    setActive(editing.is_active)
    setOnlineBookable(editing.online_bookable ?? true)
    setPackageOn(editing.package_sessions != null)
    setPackageSessions(String(editing.package_sessions ?? 10))
    setPackagePrice(editing.package_price != null ? String(editing.package_price) : '')
    setStaff(new Set(links.filter((l) => l.service_id === editing.id).map((l) => l.profile_id)))

    let cancelled = false
    async function loadStats(serviceId: string) {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const [{ data: appts }, { count: pkgCount }] = await Promise.all([
        supabase
          .from('appointments')
          .select('id')
          .eq('service_id', serviceId)
          .eq('status', 'tamamlandi')
          .gte('scheduled_at', monthStart)
          .limit(1000),
        supabase
          .from('service_packages')
          .select('id', { count: 'exact', head: true })
          .eq('service_id', serviceId)
          .eq('status', 'aktif'),
      ])
      const ids = (appts ?? []).map((a) => a.id)
      let revenue = 0
      if (ids.length) {
        const { data: pays } = await supabase
          .from('payments')
          .select('amount')
          .is('voided_at', null)
          .in('appointment_id', ids.slice(0, 300))
        revenue = (pays ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
      }
      if (cancelled) return
      setMonthStats({ count: ids.length, revenue })
      setActivePackages(pkgCount ?? 0)
    }
    loadStats(editing.id)
    return () => {
      cancelled = true
    }
    // links/services degisince (kaydetten sonra) formu ezmemek icin yalnizca kimlik izleniyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, editing?.id])

  function openEditor(target: Service | 'new') {
    setSearchParams(target === 'new' ? { yeni: '1' } : { duzenle: target.id })
  }

  function closeEditor() {
    setSearchParams({}, { replace: true })
  }

  function toggleStaff(id: string) {
    setStaff((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function saveEditor(e?: FormEvent) {
    e?.preventDefault()
    if (!editorOpen || !name.trim() || !profile?.business_id) return
    setSubmitting(true)
    const pkgSessions = Math.round(Number(packageSessions))
    const pkgPrice = Number(packagePrice)
    if (packageOn && (!(pkgSessions >= 2 && pkgSessions <= 100) || !(pkgPrice >= 0) || packagePrice === '')) {
      setSubmitting(false)
      window.alert('Paket için 2–100 arası seans sayısı ve toplam fiyat girin.')
      return
    }
    const fields = {
      name: name.trim(),
      duration_minutes: Math.max(5, duration),
      price: price === '' ? null : Math.max(0, Number(price) || 0),
      online_bookable: onlineBookable,
      package_sessions: packageOn ? pkgSessions : null,
      package_price: packageOn ? pkgPrice : null,
    }
    let serviceId = editing?.id ?? null
    if (isNew) {
      const { data } = await supabase
        .from('services')
        .insert({ business_id: profile.business_id, ...fields })
        .select('id')
        .single()
      serviceId = data?.id ?? null
    } else if (editing) {
      await supabase
        .from('services')
        .update({ ...fields, is_active: active })
        .eq('id', editing.id)
    }

    // "Kim yapiyor?" farklarini uygula.
    if (serviceId) {
      const before = new Set(links.filter((l) => l.service_id === serviceId).map((l) => l.profile_id))
      const toAdd = [...staff].filter((id) => !before.has(id))
      const toRemove = [...before].filter((id) => !staff.has(id))
      if (toAdd.length) {
        await supabase.from('employee_services').insert(toAdd.map((profile_id) => ({ profile_id, service_id: serviceId })))
      }
      if (toRemove.length) {
        await supabase.from('employee_services').delete().eq('service_id', serviceId).in('profile_id', toRemove)
      }
    }

    await loadData(true)
    setSubmitting(false)
    closeEditor()
  }

  async function deleteService(service: Service) {
    const ok = window.confirm(
      `"${service.name}" hizmetini kalıcı olarak silmek istediğinize emin misiniz?\n\nBu hizmetin geçmişte kullanıldığı randevular silinmez, sadece o randevulardaki hizmet bağlantısı boşa düşer.`,
    )
    if (!ok) return
    await supabase.from('services').delete().eq('id', service.id)
    closeEditor()
    await loadData(true)
  }

  const staffByService = useMemo(() => {
    const nameById = new Map(employees.map((e) => [e.id, firstName(e.full_name)]))
    const map = new Map<string, string[]>()
    for (const l of links) {
      const n = nameById.get(l.profile_id)
      if (!n) continue
      map.set(l.service_id, [...(map.get(l.service_id) ?? []), n])
    }
    return map
  }, [employees, links])

  const q = search.trim().toLocaleLowerCase('tr')
  const filteredSorted = useMemo(() => {
    const list = services.filter((s) => !q || s.name.toLocaleLowerCase('tr').includes(q))
    return [...list].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      if (sortBy === 'ad') return a.name.localeCompare(b.name, 'tr')
      if (sortBy === 'fiyat') return (b.price ?? 0) - (a.price ?? 0)
      return b.duration_minutes - a.duration_minutes
    })
  }, [services, q, sortBy])

  if (loading) return <p className={styles.empty}>Yükleniyor…</p>

  if (editorOpen) {
    const descLines = editing?.description ? editing.description.split(/\n+/).filter((l) => l.trim()).length : 0
    return (
      <form className={styles.wrap} onSubmit={saveEditor}>
        <PageHeader
          back={closeEditor}
          title={isNew ? 'Yeni hizmet' : 'Hizmeti düzenle'}
          action={
            editing && (
              <button type="button" className={styles.deleteLink} onClick={() => deleteService(editing)}>
                Sil
              </button>
            )
          }
        />

        <div className={styles.card}>
          <div className={styles.field}>
            <label htmlFor="serviceName">Hizmet adı</label>
            <input
              id="serviceName"
              className={styles.nameInput}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ör. Manikür"
              required
            />
          </div>
          <div className={styles.twoCol}>
            <div className={styles.field}>
              <label htmlFor="servicePrice">Fiyat</label>
              <div className={styles.priceBox}>
                <span className={styles.priceSign}>₺</span>
                <input
                  id="servicePrice"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Süre</span>
              <div className={styles.stepper}>
                <button
                  type="button"
                  className={styles.stepBtn}
                  onClick={() => setDuration((d) => Math.max(5, d - 5))}
                  aria-label="Süreyi azalt"
                >
                  −
                </button>
                <span className={styles.stepValue}>{duration} dk</span>
                <button type="button" className={styles.stepBtn} onClick={() => setDuration((d) => d + 5)} aria-label="Süreyi artır">
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Kim yapıyor?</span>
            <span className={styles.cardMeta}>{staff.size === 0 ? 'kimse seçilmedi' : `${staff.size} kişi`}</span>
          </div>
          {employees.length === 0 ? (
            <span className={styles.cardMeta}>Henüz çalışan yok.</span>
          ) : (
            <div className={styles.staffChips}>
              {employees.map((emp, i) => {
                const on = staff.has(emp.id)
                return (
                  <button
                    type="button"
                    key={emp.id}
                    className={on ? styles.staffChipOn : styles.staffChip}
                    onClick={() => toggleStaff(emp.id)}
                    aria-pressed={on}
                  >
                    <span className={`${styles.staffAvatar} ${on ? styles.toneNavy : styles[AVATAR_TONES[i % AVATAR_TONES.length]]}`}>
                      {firstName(emp.full_name).charAt(0).toLocaleUpperCase('tr')}
                    </span>
                    {firstName(emp.full_name)}
                  </button>
                )
              })}
            </div>
          )}
          {staff.size === 0 && employees.length > 0 && (
            <span className={styles.warnText}>Kimse seçilmezse bu hizmete randevu verilemez.</span>
          )}
        </div>

        <div className={styles.listCard}>
          {editing ? (
            <Link to={`/hizmetler/${editing.id}/aciklama`} className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowNameSm}>Açıklama</span>
                <span className={styles.rowMeta}>
                  {descLines > 0 ? `Bot müşteriye bunu anlatır · ${descLines} satır yazılı` : 'Henüz yok · bot bu hizmeti anlatamaz'}
                </span>
              </span>
              <ChevronRightIcon width={16} height={16} className={styles.rowChevron} />
            </Link>
          ) : (
            <div className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowNameSm}>Açıklama</span>
                <span className={styles.rowMeta}>Kaydettikten sonra ekleyebilirsin</span>
              </span>
            </div>
          )}
          {editing && (
            <div className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowNameSm}>Hizmet aktif</span>
                <span className={styles.rowMeta}>Kapatırsan bu hizmete yeni randevu alınmaz</span>
              </span>
              <label className={styles.switch}>
                <input type="checkbox" checked={active} onChange={() => setActive((v) => !v)} aria-label="Hizmet aktif" />
                <span className={styles.switchTrack} />
              </label>
            </div>
          )}
          <div className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowNameSm}>Online randevuda göster</span>
              <span className={styles.rowMeta}>Kapalıysa müşteri online sayfadan seçemez; salondan randevusu açılır</span>
            </span>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={onlineBookable}
                onChange={() => setOnlineBookable((v) => !v)}
                aria-label="Online randevuda göster"
              />
              <span className={styles.switchTrack} />
            </label>
          </div>
          <div className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowNameSm}>Paket olarak satılabilir</span>
              <span className={styles.rowMeta}>
                {packageOn && packageSessions && packagePrice
                  ? `${packageSessions} seans · ${currency.format(Number(packagePrice) || 0)}`
                  : 'Randevu kapanışında “Seanslı” seçilince bu değerler gelir'}
              </span>
            </span>
            <label className={styles.switch}>
              <input type="checkbox" checked={packageOn} onChange={() => setPackageOn((v) => !v)} aria-label="Paket olarak satılabilir" />
              <span className={styles.switchTrack} />
            </label>
          </div>
          {packageOn && (
            <div className={styles.packageFields}>
              <div className={styles.field}>
                <label htmlFor="pkgSessions">Seans sayısı</label>
                <input
                  id="pkgSessions"
                  className={styles.smallInput}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={100}
                  value={packageSessions}
                  onChange={(e) => setPackageSessions(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="pkgPrice">Paket fiyatı (toplam ₺)</label>
                <input
                  id="pkgPrice"
                  className={styles.smallInput}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={packagePrice}
                  onChange={(e) => setPackagePrice(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          )}
          {editing && activePackages > 0 && (
            <div className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowNameSm}>Paketler</span>
                <span className={styles.rowMeta}>{activePackages} müşteride aktif paket var</span>
              </span>
            </div>
          )}
        </div>

        {editing && monthStats && (
          <span className={styles.statLine}>
            {monthStats.count > 0
              ? `Bu ay ${monthStats.count} kez yapıldı · ${currency.format(monthStats.revenue)} kazandırdı`
              : 'Bu ay henüz yapılmadı'}
          </span>
        )}

        <div className={styles.footer}>
          <button type="submit" className={styles.footerBtn} disabled={submitting || !name.trim()}>
            {submitting ? 'Kaydediliyor…' : isNew ? 'Hizmeti ekle' : 'Kaydet'}
          </button>
        </div>
      </form>
    )
  }

  const activeCount = services.filter((s) => s.is_active).length

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Hizmetler"
        sub={`${activeCount} hizmet${services.length > activeCount ? ` · ${services.length - activeCount} pasif` : ''}`}
        action={
          <button type="button" className="hdr-btn-navy" onClick={() => openEditor('new')}>
            + Hizmet
          </button>
        }
      />

      <div className={styles.searchRow}>
        <div className={styles.searchBox}>
          <SearchIcon width={16} height={16} className={styles.searchIcon} />
          <input className={styles.searchInput} placeholder="Hizmet ara" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className={styles.filterWrap} ref={sortMenuRef}>
          <button
            type="button"
            className={styles.filterBtn}
            onClick={() => setSortMenuOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={sortMenuOpen}
            aria-label="Sıralama"
          >
            {SORT_OPTIONS.find((o) => o.value === sortBy)?.short} ▾
          </button>
          {sortMenuOpen && (
            <div className={styles.filterMenu} role="listbox">
              {SORT_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  className={styles.filterMenuItem}
                  onClick={() => {
                    setSortBy(opt.value)
                    setSortMenuOpen(false)
                  }}
                >
                  {opt.label}
                  {sortBy === opt.value && <CheckCircleIcon width={14} height={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filteredSorted.length === 0 ? (
        <p className={styles.empty}>{q ? 'Aramana uyan hizmet yok.' : 'Henüz hizmet eklenmedi. “+ Hizmet” ile başla.'}</p>
      ) : (
        <div className={styles.listCard}>
          {filteredSorted.map((s) => {
            const who = staffByService.get(s.id) ?? []
            return (
              <button
                type="button"
                key={s.id}
                className={s.is_active ? styles.row : `${styles.row} ${styles.rowInactive}`}
                onClick={() => openEditor(s)}
              >
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{s.name}</span>
                  {!s.is_active ? (
                    <span className={styles.rowMeta}>{s.duration_minutes} dk · pasif</span>
                  ) : who.length === 0 ? (
                    <span className={styles.rowMetaWarn}>{s.duration_minutes} dk · kimse atanmadı</span>
                  ) : (
                    <span className={styles.rowMeta}>
                      {s.duration_minutes} dk · {who.length > 3 ? `${who.slice(0, 3).join(', ')} +${who.length - 3}` : who.join(', ')}
                    </span>
                  )}
                </span>
                <span className={styles.rowPrice}>{s.price != null ? currency.format(s.price) : '—'}</span>
                <span className={styles.rowArrow}>›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
