import { supabase } from './supabase'
import { toLocalDateString } from './date'

// Gorevler (bkz. migration 20261018000004_tasks.sql). Musteriye bagli ya da
// genel; bir calisana atanabilir (atanmamissa ekipten herkes yapabilir).

export type TaskStatus = 'acik' | 'tamamlandi' | 'iptal'

export interface Task {
  id: string
  customer_id: string | null
  title: string
  note: string | null
  due_date: string
  due_time: string | null
  assignee_id: string | null
  created_by: string | null
  status: TaskStatus
  completed_at: string | null
  created_at: string
  customer?: { id: string; full_name: string } | null
}

const COLUMNS =
  'id, customer_id, title, note, due_date, due_time, assignee_id, created_by, status, completed_at, created_at, customer:customers(id, full_name)'

export async function fetchOpenTasks(opts: { customerId?: string } = {}): Promise<Task[]> {
  let q = supabase.from('tasks').select(COLUMNS).eq('status', 'acik').order('due_date').order('due_time')
  if (opts.customerId) q = q.eq('customer_id', opts.customerId)
  const { data, error } = await q.limit(500)
  if (error) throw error
  return (data ?? []) as unknown as Task[]
}

export async function fetchRecentlyDone(days = 7): Promise<Task[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('tasks')
    .select(COLUMNS)
    .eq('status', 'tamamlandi')
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as unknown as Task[]
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  return supabase.from('tasks').update({ status }).eq('id', id)
}

// Bana dusen (bana atanmis ya da atanmamis) bugun ve geciken acik gorev sayisi.
export async function myDueTaskCount(profileId: string): Promise<number> {
  const today = toLocalDateString(new Date())
  const { count } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'acik')
    .lte('due_date', today)
    .or(`assignee_id.is.null,assignee_id.eq.${profileId}`)
  return count ?? 0
}

export type Bucket = 'geciken' | 'bugun' | 'yaklasan' | 'sonra'

export const BUCKET_LABEL: Record<Bucket, string> = {
  geciken: 'Gecikenler',
  bugun: 'Bugün',
  yaklasan: 'Bu hafta',
  sonra: 'Daha sonra',
}

export function bucketOf(task: Pick<Task, 'due_date'>, today = new Date()): Bucket {
  const t = toLocalDateString(today)
  if (task.due_date < t) return 'geciken'
  if (task.due_date === t) return 'bugun'
  const week = new Date(today)
  week.setDate(week.getDate() + 7)
  return task.due_date <= toLocalDateString(week) ? 'yaklasan' : 'sonra'
}

// "Bugün 14:00", "Yarın", "3 gün gecikti", "22 Ekim Çarşamba"
export function dueLabel(task: Pick<Task, 'due_date' | 'due_time'>, today = new Date()): string {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const [y, m, d] = task.due_date.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const diff = Math.round((due.getTime() - t.getTime()) / 86_400_000)
  const time = task.due_time ? ` ${task.due_time.slice(0, 5)}` : ''
  if (diff === 0) return `Bugün${time}`
  if (diff === 1) return `Yarın${time}`
  if (diff === -1) return `Dün${time} · gecikti`
  if (diff < 0) return `${-diff} gün gecikti`
  const label = due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })
  return `${label}${time}`
}

// Hizli tarih secenekleri (form). Deger: yyyy-mm-dd
export function quickDates(today = new Date()): { label: string; value: string }[] {
  const add = (days: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() + days)
    return toLocalDateString(d)
  }
  return [
    { label: 'Bugün', value: add(0) },
    { label: 'Yarın', value: add(1) },
    { label: '3 gün sonra', value: add(3) },
    { label: '1 hafta sonra', value: add(7) },
    { label: '1 ay sonra', value: add(30) },
  ]
}
