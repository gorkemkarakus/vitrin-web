import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { colorForName } from '../components/Avatar'
import {
  SearchIcon,
  FilterIcon,
  CheckCircleIcon,
  ServicesIcon,
  ClockIcon,
  TagIcon,
  MoreHorizontalIcon,
  CloseIcon,
} from '../components/icons'
import styles from './ServicesPage.module.css'

interface Service {
  id: string
  name: string
  category_id: string | null
  duration_minutes: number
  price: number | null
  is_active: boolean
  description: string | null
}

interface ServiceCategory {
  id: string
  name: string
}

type CategoryFilter = 'tumu' | 'diger' | string
type SortBy = 'ad' | 'fiyat' | 'sure'

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'ad', label: 'Ada Göre (A-Z)' },
  { value: 'fiyat', label: 'Fiyata Göre (Yüksekten)' },
  { value: 'sure', label: 'Süreye Göre (Uzundan)' },
]

const currency = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })

export default function ServicesPage() {
  const { profile } = useAuth()
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('tumu')
  const [sortBy, setSortBy] = useState<SortBy>('ad')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  const [name, setName] = useState('')
  const [duration, setDuration] = useState('60')
  const [price, setPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // "silent=true" bir mutasyondan sonra cagrilir — veriyi arka planda
  // tazeler ama "loading" bayragini geri true yapmaz, boylece sayfa her
  // islemden sonra bos "Yükleniyor…" yazisina donup yeniden cizilmiyor.
  async function loadData(silent = false) {
    if (!silent) setLoading(true)
    const [{ data }, { data: cats }] = await Promise.all([
      supabase
        .from('services')
        .select('id, name, category_id, duration_minutes, price, is_active, description')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true }),
      supabase.from('service_categories').select('id, name').order('name'),
    ])
    setServices(data ?? [])
    setCategories(cats ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (!sortMenuOpen) return
    function handleClick(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [sortMenuOpen])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !profile?.business_id) return
    setSubmitting(true)
    await supabase.from('services').insert({
      business_id: profile.business_id,
      name: name.trim(),
      duration_minutes: Math.max(5, Number(duration) || 60),
      price: price === '' ? null : Math.max(0, Number(price) || 0),
    })
    setName('')
    setDuration('60')
    setPrice('')
    await loadData(true)
    setSubmitting(false)
    setAddModalOpen(false)
  }

  async function updateService(service: Service, patch: Partial<Service>) {
    await supabase.from('services').update(patch).eq('id', service.id)
    await loadData(true)
  }

  async function deleteService(service: Service) {
    const ok = window.confirm(
      `"${service.name}" hizmetini kalıcı olarak silmek istediğinize emin misiniz?\n\nBu hizmetin geçmişte kullanıldığı randevular silinmez, sadece o randevulardaki hizmet bağlantısı boşa düşer.`,
    )
    if (!ok) return
    await supabase.from('services').delete().eq('id', service.id)
    await loadData(true)
  }

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  const categoryTabs = useMemo(() => {
    const counts = new Map<string, number>()
    let uncategorized = 0
    for (const s of services) {
      if (s.category_id) counts.set(s.category_id, (counts.get(s.category_id) ?? 0) + 1)
      else uncategorized++
    }
    const tabs = categories
      .map((c) => ({ value: c.id as CategoryFilter, label: c.name, count: counts.get(c.id) ?? 0 }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count)
    if (uncategorized > 0) tabs.push({ value: 'diger', label: 'Diğer', count: uncategorized })
    return [{ value: 'tumu' as CategoryFilter, label: 'Tümü', count: services.length }, ...tabs]
  }, [categories, services])

  const q = search.trim().toLowerCase()
  const filteredSorted = useMemo(() => {
    let list = services.filter((s) => !q || s.name.toLowerCase().includes(q))
    if (categoryFilter === 'diger') list = list.filter((s) => !s.category_id)
    else if (categoryFilter !== 'tumu') list = list.filter((s) => s.category_id === categoryFilter)
    list = [...list].sort((a, b) => {
      if (sortBy === 'ad') return a.name.localeCompare(b.name, 'tr')
      if (sortBy === 'fiyat') return (b.price ?? 0) - (a.price ?? 0)
      return b.duration_minutes - a.duration_minutes
    })
    return list
  }, [services, q, categoryFilter, sortBy])

  if (loading) return <p style={{ color: 'var(--text-dim)' }}>Yükleniyor…</p>

  const totalCount = services.length
  const activeCount = services.filter((s) => s.is_active).length
  const inactiveCount = totalCount - activeCount
  const pricedServices = services.filter((s) => s.price != null)
  const avgPrice = pricedServices.length
    ? pricedServices.reduce((sum, s) => sum + (s.price ?? 0), 0) / pricedServices.length
    : 0

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.heroCta} onClick={() => setAddModalOpen(true)}>
        + Hizmet Ekle
      </button>

      <div className={styles.searchRow}>
        <div className={styles.searchBox}>
          <SearchIcon width={16} height={16} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Hizmet ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filterWrap} ref={sortMenuRef}>
          <button
            type="button"
            className={styles.filterBtn}
            onClick={() => setSortMenuOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={sortMenuOpen}
          >
            <FilterIcon width={15} height={15} />
            Filtrele
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

      <div className={styles.categoryRow}>
        {categoryTabs.map((tab) => (
          <button
            type="button"
            key={tab.value}
            className={categoryFilter === tab.value ? styles.categoryBtnActive : styles.categoryBtn}
            onClick={() => setCategoryFilter(tab.value)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardSignal}`}>
          <span className={`${styles.statIcon} ${styles.statIconSignal}`}>
            <ServicesIcon width={14} height={14} />
          </span>
          <span className={styles.statValue}>{totalCount}</span>
          <span className={styles.statLabel}>Toplam Hizmet</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardOk}`}>
          <span className={`${styles.statIcon} ${styles.statIconOk}`}>
            <CheckCircleIcon width={14} height={14} />
          </span>
          <span className={styles.statValue}>{activeCount}</span>
          <span className={styles.statLabel}>Aktif Hizmet</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardWarn}`}>
          <span className={`${styles.statIcon} ${styles.statIconWarn}`}>
            <ClockIcon width={14} height={14} />
          </span>
          <span className={styles.statValue}>{inactiveCount}</span>
          <span className={styles.statLabel}>Pasif Hizmet</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardInfo}`}>
          <span className={`${styles.statIcon} ${styles.statIconInfo}`}>
            <TagIcon width={14} height={14} />
          </span>
          <span className={styles.statValue}>{currency.format(avgPrice)}</span>
          <span className={styles.statLabel}>Ortalama Fiyat</span>
        </div>
      </div>

      <div className="card">
        {filteredSorted.length === 0 ? (
          <p className={styles.empty}>{q || categoryFilter !== 'tumu' ? 'Eşleşen hizmet yok.' : 'Henüz hizmet eklenmedi.'}</p>
        ) : (
          <div className={styles.list}>
            {filteredSorted.map((s) => {
              const expanded = expandedId === s.id
              return (
                <div key={s.id} className={styles.rowWrap}>
                  <div className={styles.row}>
                    <span className={styles.thumb} style={{ background: colorForName(s.name) }}>
                      <ServicesIcon width={19} height={19} style={{ color: '#fff' }} />
                    </span>
                    <div className={styles.rowMain}>
                      <span className={styles.rowName}>{s.name}</span>
                      <span className={styles.rowCategory}>
                        {s.category_id ? (categoryNameById.get(s.category_id) ?? 'Kategori yok') : 'Kategori yok'}
                      </span>
                    </div>
                    <span className={styles.rowDuration}>
                      <ClockIcon width={12} height={12} />
                      {s.duration_minutes} dk
                    </span>
                    <span className={styles.rowPrice}>{s.price != null ? currency.format(s.price) : '—'}</span>
                    <span className={s.is_active ? styles.statusPillActive : styles.statusPillInactive}>
                      {s.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                    <button
                      type="button"
                      className={styles.moreBtn}
                      onClick={() => setExpandedId(expanded ? null : s.id)}
                      aria-label="Hizmet seçenekleri"
                      aria-expanded={expanded}
                    >
                      <MoreHorizontalIcon width={16} height={16} />
                    </button>
                  </div>

                  {expanded && (
                    <div className={styles.expandPanel}>
                      <div className={styles.editGrid}>
                        <div className={styles.editField}>
                          <label>Hizmet adı</label>
                          <input
                            defaultValue={s.name}
                            onBlur={(e) => {
                              const value = e.target.value.trim()
                              if (value && value !== s.name) updateService(s, { name: value })
                              else e.target.value = s.name
                            }}
                          />
                        </div>
                        <div className={styles.editField}>
                          <label>Kategori</label>
                          <select
                            value={s.category_id ?? ''}
                            onChange={(e) => updateService(s, { category_id: e.target.value || null })}
                          >
                            <option value="">Alan seçilmedi</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.editField}>
                          <label>Süre (dk)</label>
                          <input
                            type="number"
                            min={5}
                            step={5}
                            defaultValue={s.duration_minutes}
                            onBlur={(e) => {
                              const value = Math.max(5, Number(e.target.value) || s.duration_minutes)
                              if (value !== s.duration_minutes) updateService(s, { duration_minutes: value })
                              else e.target.value = String(s.duration_minutes)
                            }}
                          />
                        </div>
                        <div className={styles.editField}>
                          <label>Fiyat (TL)</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={s.price ?? 0}
                            onBlur={(e) => {
                              const value = Math.max(0, Number(e.target.value) || 0)
                              if (value !== (s.price ?? 0)) updateService(s, { price: value })
                              else e.target.value = String(s.price ?? 0)
                            }}
                          />
                        </div>
                      </div>

                      <div className={styles.editActionsRow}>
                        <button
                          type="button"
                          className={s.is_active ? styles.toggleActive : styles.toggle}
                          onClick={() => updateService(s, { is_active: !s.is_active })}
                          aria-label={`${s.name} ${s.is_active ? 'aktif' : 'pasif'}`}
                        />
                        <span className={styles.toggleLabel}>{s.is_active ? 'Aktif' : 'Pasif'}</span>
                        <Link to={`/hizmetler/${s.id}/aciklama`} className={styles.descLink}>
                          {s.description ? 'Açıklamayı düzenle' : 'Açıklama ekle'}
                        </Link>
                      </div>

                      <button type="button" className={styles.deleteBtn} onClick={() => deleteService(s)}>
                        Hizmeti Sil
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {addModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setAddModalOpen(false)}>
          <div className={`card ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>Yeni hizmet</h2>
              <button type="button" className={styles.modalClose} onClick={() => setAddModalOpen(false)} aria-label="Kapat">
                <CloseIcon width={18} height={18} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="serviceName">Hizmet adı</label>
                <input
                  id="serviceName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ör. Manikür"
                  autoFocus
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="serviceDuration">Süre (dk)</label>
                <input
                  id="serviceDuration"
                  type="number"
                  min={5}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="servicePrice">Fiyat (TL)</label>
                <input
                  id="servicePrice"
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0"
                />
              </div>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Ekleniyor…' : 'Hizmet Ekle'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
