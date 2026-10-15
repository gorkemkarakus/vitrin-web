// Mukerrer musteri tespiti (ayni telefon / ayni tam ad). Birlestirme
// ekrani: components/DuplicateCustomers.tsx.

export interface DupCustomer {
  id: string
  full_name: string
  phone: string | null
  contact_phone: string | null
  created_at: string
}

export interface DupGroup {
  key: string
  reason: string
  members: DupCustomer[]
}

const DISMISSED_KEY = 'adapptiv.dismissedDuplicates'
// Bot ve anonimlestirme varsayilan adlari — ayni addan eslesme sayilmaz.
const PLACEHOLDER_NAMES = new Set(['müşteri', 'silinmiş müşteri'])

// Turkiye cep numarasini 10 haneye indirger (5xx xxx xx xx); baska bir sey
// (Instagram kimligi vb.) ise null — yanlis eslesme olmasin.
export function phoneKey(raw: string | null): string | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('90')) return d.slice(2)
  if (d.length === 11 && d.startsWith('0')) return d.slice(1)
  if (d.length === 10 && d.startsWith('5')) return d
  return null
}

function nameKey(name: string): string | null {
  const n = name.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()
  if (PLACEHOLDER_NAMES.has(n) || !n.includes(' ') || n.length < 5) return null
  return n
}

function formatPhone(key: string) {
  return `0${key.slice(0, 3)} ${key.slice(3, 6)} ${key.slice(6, 8)} ${key.slice(8)}`
}

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

// Ayni telefonlu (phone ya da contact_phone) kayitlar tek grupta birlesir;
// ayni tam adli olanlar (en az iki kelime) ayri "ayni ad" grubu olur.
export function findDuplicateGroups(customers: DupCustomer[]): DupGroup[] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x) ?? x
    if (p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }
  const union = (a: string, b: string) => parent.set(find(a), find(b))

  const byPhone = new Map<string, string>()
  const phoneOf = new Map<string, string>()
  for (const c of customers) {
    for (const k of [phoneKey(c.phone), phoneKey(c.contact_phone)]) {
      if (!k) continue
      const first = byPhone.get(k)
      if (first) union(c.id, first)
      else byPhone.set(k, c.id)
      phoneOf.set(c.id, k)
    }
  }
  const phoneGroups = new Map<string, DupCustomer[]>()
  for (const c of customers) {
    const root = find(c.id)
    const list = phoneGroups.get(root)
    if (list) list.push(c)
    else phoneGroups.set(root, [c])
  }

  const groups: DupGroup[] = []
  const inPhoneGroup = new Set<string>()
  for (const members of phoneGroups.values()) {
    if (members.length < 2) continue
    members.forEach((m) => inPhoneGroup.add(m.id))
    const k = phoneOf.get(members[0].id)
    groups.push({
      key: `tel:${members.map((m) => m.id).sort().join(',')}`,
      reason: k ? `Aynı telefon · ${formatPhone(k)}` : 'Aynı telefon',
      members,
    })
  }

  const byName = new Map<string, DupCustomer[]>()
  for (const c of customers) {
    const k = nameKey(c.full_name)
    if (!k) continue
    byName.set(k, [...(byName.get(k) ?? []), c])
  }
  for (const members of byName.values()) {
    if (members.length < 2 || members.every((m) => inPhoneGroup.has(m.id))) continue
    groups.push({ key: `ad:${members.map((m) => m.id).sort().join(',')}`, reason: 'Aynı ad', members })
  }
  return groups
}

export function visibleDuplicateGroups(customers: DupCustomer[]): DupGroup[] {
  const dismissed = readDismissed()
  return findDuplicateGroups(customers).filter((g) => !dismissed.has(g.key))
}

export function dismissDuplicateGroup(key: string) {
  const set = readDismissed()
  set.add(key)
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]))
  } catch {
    // Depolama kapaliysa yalnizca bu oturumda gizlenir.
  }
}
