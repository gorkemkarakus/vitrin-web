import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAll } from '../lib/fetchAll'
import { UsersIcon, XCircleIcon, MehIcon, UserPlusIcon, StarIcon, TagIcon, PencilIcon } from '../components/icons'
import CreateGroupModal from '../components/CreateGroupModal'
import GroupMembersModal from '../components/GroupMembersModal'
import SendCampaignModal from '../components/SendCampaignModal'
import TemplateModal from '../components/TemplateModal'
import PageHeader from '../components/PageHeader'
import styles from './TopluMesajPage.module.css'

export interface Customer {
  id: string
  full_name: string
  phone: string | null
  contact_phone: string | null
}
interface Appointment {
  customer_id: string | null
  service_id: string | null
  status: 'bekliyor' | 'onaylandi' | 'tamamlandi' | 'iptal' | 'gelmedi'
  scheduled_at: string
}
interface Service {
  id: string
  name: string
}
interface CustomGroupRow {
  id: string
  name: string
  description: string | null
}
interface CustomGroupMemberRow {
  group_id: string
  customer_id: string
}
export interface Template {
  id: string
  title: string
  message: string
}

export interface UiGroup {
  key: string
  name: string
  description: string
  memberIds: string[]
  icon: typeof UsersIcon
  isCustom: boolean
  customGroupId?: string
}

function daysAgoIso(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString()
}

export default function TopluMesajPage() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [customGroupRows, setCustomGroupRows] = useState<CustomGroupRow[]>([])
  const [customGroupMembers, setCustomGroupMembers] = useState<CustomGroupMemberRow[]>([])
  const [templates, setTemplates] = useState<Template[]>([])

  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [viewingGroup, setViewingGroup] = useState<UiGroup | null>(null)
  const [sendTarget, setSendTarget] = useState<{ name: string; memberIds: string[]; prefill?: string } | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Template | 'new' | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<{ key: string; message: string; at: string; count: number }[] | null>(null)

  // "Gecmis": gonderilen toplu mesajlar (notification_log'da her musteri icin
  // bir satir) — ayni metin + ayni dakika tek gonderim sayilir.
  async function openHistory() {
    setHistoryOpen(true)
    setHistory(null)
    const { data } = await supabase
      .from('notification_log')
      .select('message, created_at')
      .eq('kind', 'bulk_campaign')
      .order('created_at', { ascending: false })
      .limit(1000)
    const map = new Map<string, { key: string; message: string; at: string; count: number }>()
    for (const r of data ?? []) {
      const key = `${r.created_at.slice(0, 16)}|${r.message}`
      const cur = map.get(key)
      if (cur) cur.count++
      else map.set(key, { key, message: r.message, at: r.created_at, count: 1 })
    }
    setHistory(Array.from(map.values()))
  }

  async function loadAll() {
    setLoading(true)
    const [{ data: custs }, { data: appts }, { data: svcs }, { data: groups }, { data: members }, { data: tmpls }] =
      await Promise.all([
        fetchAll(() => supabase.from('customers').select('id, full_name, phone, contact_phone').order('id')),
        fetchAll(() =>
          supabase.from('appointments').select('customer_id, service_id, status, scheduled_at').order('id'),
        ),
        supabase.from('services').select('id, name'),
        supabase.from('customer_groups').select('id, name, description').order('created_at', { ascending: false }),
        fetchAll(() =>
          supabase
            .from('customer_group_members')
            .select('group_id, customer_id')
            .order('group_id')
            .order('customer_id'),
        ),
        supabase
          .from('campaign_message_templates')
          .select('id, title, message')
          .order('created_at', { ascending: false }),
      ])
    setCustomers(custs ?? [])
    setAppointments(appts ?? [])
    setServices(svcs ?? [])
    setCustomGroupRows(groups ?? [])
    setCustomGroupMembers(members ?? [])
    setTemplates(tmpls ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers])

  // ---------- Sabit/akıllı gruplar — CustomersPage.tsx'teki segment desenindeki
  // gibi tamamen client-side, DB'ye hiçbir şey yazılmadan canlı hesaplanıyor. ----------
  const fixedGroups = useMemo<UiGroup[]>(() => {
    const completedByCustomer = new Map<string, Appointment[]>()
    for (const a of appointments) {
      if (a.status !== 'tamamlandi' || !a.customer_id) continue
      const list = completedByCustomer.get(a.customer_id) ?? []
      list.push(a)
      completedByCustomer.set(a.customer_id, list)
    }
    for (const list of completedByCustomer.values()) list.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

    const cancelCutoff = daysAgoIso(30)
    const cancelledIds = new Set<string>()
    for (const a of appointments) {
      if (a.status === 'iptal' && a.customer_id && a.scheduled_at >= cancelCutoff) cancelledIds.add(a.customer_id)
    }

    const inactiveCutoff = daysAgoIso(90)
    const longAbsentIds = new Set<string>()
    const firstTimeCutoff = daysAgoIso(60)
    const firstTimeIds = new Set<string>()
    const loyalCutoff = daysAgoIso(90)
    const loyalIds = new Set<string>()
    for (const [custId, list] of completedByCustomer) {
      const last = list[list.length - 1]
      if (last.scheduled_at < inactiveCutoff) longAbsentIds.add(custId)
      const first = list[0]
      if (first.scheduled_at >= firstTimeCutoff) firstTimeIds.add(custId)
      const recentCount = list.filter((a) => a.scheduled_at >= loyalCutoff).length
      if (recentCount >= 3) loyalIds.add(custId)
    }

    const serviceById = new Map(services.map((s) => [s.id, s.name]))
    const perServiceCutoff = daysAgoIso(180)
    const byService = new Map<string, Set<string>>()
    for (const a of appointments) {
      if (a.status !== 'tamamlandi' || !a.customer_id || !a.service_id) continue
      if (a.scheduled_at < perServiceCutoff) continue
      const set = byService.get(a.service_id) ?? new Set<string>()
      set.add(a.customer_id)
      byService.set(a.service_id, set)
    }

    const groups: UiGroup[] = []
    for (const [serviceId, custIds] of byService) {
      const name = serviceById.get(serviceId)
      if (!name || custIds.size === 0) continue
      groups.push({
        key: `service:${serviceId}`,
        name: `${name} Yaptıranlar`,
        description: 'Son 6 ay içinde bu hizmeti alan müşteriler',
        memberIds: Array.from(custIds),
        icon: TagIcon,
        isCustom: false,
      })
    }
    groups.push({
      key: 'surekli',
      name: 'Sürekli Randevu Alanlar',
      description: 'Son 3 ayda 3+ randevu alan sadık müşteriler',
      memberIds: Array.from(loyalIds),
      icon: StarIcon,
      isCustom: false,
    })
    groups.push({
      key: 'iptal',
      name: 'İptal Edenler',
      description: 'Son 30 günde randevusunu iptal eden müşteriler',
      memberIds: Array.from(cancelledIds),
      icon: XCircleIcon,
      isCustom: false,
    })
    groups.push({
      key: 'ilk_kez',
      name: 'İlk Kez Gelenler',
      description: 'Son 60 günde ilk kez gelen müşteriler',
      memberIds: Array.from(firstTimeIds),
      icon: UserPlusIcon,
      isCustom: false,
    })
    groups.push({
      key: 'uzun_suredir',
      name: 'Uzun Süredir Gelmeyenler',
      description: 'Son 90 günde randevu almayan müşteriler',
      memberIds: Array.from(longAbsentIds),
      icon: MehIcon,
      isCustom: false,
    })
    return groups
  }, [appointments, services])

  const customGroups = useMemo<UiGroup[]>(() => {
    const membersByGroup = new Map<string, string[]>()
    for (const m of customGroupMembers) {
      const list = membersByGroup.get(m.group_id) ?? []
      list.push(m.customer_id)
      membersByGroup.set(m.group_id, list)
    }
    return customGroupRows.map((g) => ({
      key: `custom:${g.id}`,
      name: g.name,
      description: g.description || 'Özel grup',
      memberIds: membersByGroup.get(g.id) ?? [],
      icon: UsersIcon,
      isCustom: true,
      customGroupId: g.id,
    }))
  }, [customGroupRows, customGroupMembers])

  // Müşteri seçici listelerinde (grup oluştur/üye ekle) her müşterinin
  // yanında son yaptırdığı işlemi göstermek için — sadece 'tamamlandi'
  // randevular arasından en yeni scheduled_at'e bakılıyor.
  const lastServiceByCustomer = useMemo(() => {
    const serviceNameById = new Map(services.map((s) => [s.id, s.name]))
    const map = new Map<string, { name: string; date: string }>()
    for (const a of appointments) {
      if (a.status !== 'tamamlandi' || !a.customer_id || !a.service_id) continue
      const name = serviceNameById.get(a.service_id)
      if (!name) continue
      const existing = map.get(a.customer_id)
      if (!existing || a.scheduled_at > existing.date) {
        map.set(a.customer_id, { name, date: a.scheduled_at })
      }
    }
    const nameOnly = new Map<string, string>()
    for (const [custId, v] of map) nameOnly.set(custId, v.name)
    return nameOnly
  }, [appointments, services])

  const everyoneGroup: UiGroup = {
    key: 'herkes',
    name: 'Herkes',
    description: 'Tüm müşteriler',
    memberIds: customers.map((c) => c.id),
    icon: UsersIcon,
    isCustom: false,
  }
  const allGroups = [everyoneGroup, ...customGroups, ...fixedGroups]
  const selectedGroup = allGroups.find((g) => g.key === selectedKey) ?? null
  const reachableCount = selectedGroup
    ? selectedGroup.memberIds.filter((cid) => {
        const c = customerById.get(cid)
        return !!(c?.contact_phone || c?.phone)
      }).length
    : 0
  const previewName = selectedGroup
    ? (customerById.get(selectedGroup.memberIds[0] ?? '')?.full_name ?? 'Müşteri').split(' ')[0]
    : 'Müşteri'

  if (loading) return <p className={styles.hint}>Yükleniyor…</p>

  if (historyOpen) {
    return (
      <div className={styles.wrap}>
        <PageHeader back={() => setHistoryOpen(false)} title="Gönderilenler" />
        {history === null ? (
          <p className={styles.hint}>Yükleniyor…</p>
        ) : history.length === 0 ? (
          <p className={styles.hint}>Henüz toplu mesaj gönderilmedi.</p>
        ) : (
          <div className={styles.rowsCard}>
            {history.map((h) => (
              <div className={styles.historyRow} key={h.key}>
                <span className={styles.historyText}>{h.message}</span>
                <span className={styles.historyMeta}>
                  {new Date(h.at).toLocaleString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {h.count} kişi
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        back="/daha-fazla"
        title="Toplu mesaj"
        action={
          <button type="button" className="hdr-link" onClick={openHistory}>
            Geçmiş
          </button>
        }
      />

      <section className={styles.block}>
        <span className={styles.blockLabel}>Kime gidecek?</span>
        <div className={styles.chips}>
          {allGroups.map((g) => (
            <button
              type="button"
              key={g.key}
              className={selectedKey === g.key ? styles.chipActive : styles.chip}
              onClick={() => setSelectedKey(g.key)}
            >
              {g.name} · {g.memberIds.length}
            </button>
          ))}
          <button type="button" className={styles.chipDashed} onClick={() => setCreateGroupOpen(true)}>
            Kendin seç
          </button>
        </div>
        {selectedGroup && (
          <button type="button" className={styles.groupLink} onClick={() => setViewingGroup(selectedGroup)}>
            {selectedGroup.description} · kişileri gör ›
          </button>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <label className={styles.blockLabel} htmlFor="campaignText">
            Mesaj
          </label>
          {templates.length > 0 && (
            <button type="button" className={styles.link} onClick={() => setTemplatesOpen((v) => !v)}>
              {templatesOpen ? 'Şablonları gizle' : 'Şablondan seç'}
            </button>
          )}
        </div>
        {templatesOpen && (
          <div className={styles.chips}>
            {templates.map((t) => (
              <span className={styles.templateChip} key={t.id}>
                <button
                  type="button"
                  className={styles.templateChipMain}
                  onClick={() => {
                    setMessage(t.message)
                    setTemplatesOpen(false)
                  }}
                >
                  {t.title}
                </button>
                <button
                  type="button"
                  className={styles.templateChipEdit}
                  onClick={() => setEditingTemplate(t)}
                  aria-label={`${t.title} şablonunu düzenle`}
                >
                  <PencilIcon width={12} height={12} />
                </button>
              </span>
            ))}
            <button type="button" className={styles.chipDashed} onClick={() => setEditingTemplate('new')}>
              + Yeni şablon
            </button>
          </div>
        )}
        <div className={styles.messageCard}>
          <textarea
            id="campaignText"
            className={styles.message}
            rows={5}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Merhaba, sizi özledik! Bu hafta gelenlere manikürde %15 indirim var. Randevu için bu mesaja yazmanız yeterli."
          />
          <div className={styles.messageFoot}>
            {templates.length === 0 && (
              <button type="button" className={styles.varChip} onClick={() => setEditingTemplate('new')}>
                Şablon olarak kaydet
              </button>
            )}
            <span className={styles.counter}>{message.length} / 1000</span>
          </div>
        </div>
      </section>

      <div className={styles.rowsCard}>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Kanal</span>
          <span className={styles.infoValue}>WhatsApp</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Zaman</span>
          <span className={styles.infoValue}>Hemen</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoLabel}>Telefonu kayıtlı</span>
          <span className={styles.infoValue}>{selectedGroup ? `${reachableCount} kişi` : '—'}</span>
        </div>
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.previewBtn}
          disabled={!message.trim()}
          onClick={() => setPreviewOpen(true)}
        >
          Önizle
        </button>
        <button
          type="button"
          className={styles.sendBtn}
          disabled={!selectedGroup || selectedGroup.memberIds.length === 0}
          onClick={() => {
            if (!selectedGroup) return
            setSendTarget({
              name: selectedGroup.name,
              memberIds: selectedGroup.memberIds,
              prefill: message || undefined,
            })
          }}
        >
          {!selectedGroup
            ? 'Önce kime gideceğini seç'
            : selectedGroup.memberIds.length === 0
              ? 'Bu grupta kimse yok'
              : `${selectedGroup.memberIds.length} kişiye gönder`}
        </button>
      </div>

      {previewOpen && (
        <div className={styles.previewBackdrop} onClick={() => setPreviewOpen(false)}>
          <div className={styles.previewSheet} onClick={(e) => e.stopPropagation()}>
            <span className={styles.blockLabel}>Müşterinin göreceği</span>
            <div className={styles.previewPhone}>
              <span className={styles.previewBubble}>{message.trim() || '…'}</span>
            </div>
            <span className={styles.hint}>
              {selectedGroup
                ? `${previewName} ve diğer ${Math.max(0, selectedGroup.memberIds.length - 1)} kişiye gider.`
                : 'Henüz kişi seçilmedi.'}
            </span>
            <button type="button" className={styles.previewBtn} onClick={() => setPreviewOpen(false)}>
              Kapat
            </button>
          </div>
        </div>
      )}

      {createGroupOpen && (
        <CreateGroupModal
          customers={customers}
          lastServiceByCustomer={lastServiceByCustomer}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={() => {
            setCreateGroupOpen(false)
            loadAll()
          }}
        />
      )}

      {viewingGroup && (
        <GroupMembersModal
          group={viewingGroup}
          allCustomers={customers}
          customerById={customerById}
          lastServiceByCustomer={lastServiceByCustomer}
          onClose={() => setViewingGroup(null)}
          onChanged={() => {
            loadAll()
          }}
          onDeleted={() => {
            setViewingGroup(null)
            loadAll()
          }}
        />
      )}

      {sendTarget && (
        <SendCampaignModal
          targetName={sendTarget.name}
          memberIds={sendTarget.memberIds}
          initialMessage={sendTarget.prefill}
          templates={templates}
          onClose={() => setSendTarget(null)}
        />
      )}

      {editingTemplate && (
        <TemplateModal
          template={editingTemplate === 'new' ? null : editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => {
            setEditingTemplate(null)
            loadAll()
          }}
          onDeleted={() => {
            setEditingTemplate(null)
            loadAll()
          }}
        />
      )}
    </div>
  )
}
