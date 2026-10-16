import { supabase } from './supabase'
import { fetchAll } from './fetchAll'
import { buildXlsx, type Sheet } from './xlsx'
import { saveAndShareFile } from './saveFile'
import { SOURCE_LABEL } from './sourceLabels'
import { METHOD_LABEL, todayString } from './cashClosure'

// "Verilerimi indir": isletmenin tum kayitlari tek bir Excel dosyasinda
// (her tablo ayri sayfa). Yalnizca yonetici kullanir; RLS zaten yalnizca
// kendi isletmesinin satirlarini dondurur.

const STATUS_LABEL: Record<string, string> = {
  bekliyor: 'Bekliyor',
  onaylandi: 'Onaylandı',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
  gelmedi: 'Gelmedi',
}
const PACKAGE_STATUS: Record<string, string> = { aktif: 'Aktif', tamamlandi: 'Tamamlandı', iptal: 'İptal' }
const ROLE_LABEL: Record<string, string> = { admin: 'Yönetici', user: 'Çalışan' }

type Row = Record<string, unknown>
const d = (v: unknown) => (v ? new Date(String(v).length === 10 ? `${v}T00:00:00` : String(v)) : null)
const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export async function exportBusinessData(businessName: string, onProgress?: (text: string) => void) {
  onProgress?.('Kayıtlar okunuyor…')
  const q = (table: string, order = 'created_at') => fetchAll<Row>(() => supabase.from(table).select('*').order(order).order('id'))
  const [customers, appointments, payments, expenses, services, packages, profiles, closures, payouts] = await Promise.all([
    q('customers'),
    q('appointments', 'scheduled_at'),
    q('payments', 'paid_at'),
    q('business_expenses', 'expense_date'),
    q('services'),
    q('service_packages'),
    supabase.from('profiles').select('id, full_name, role, is_active, online_bookable, created_at').order('created_at'),
    q('cash_closures', 'closure_date'),
    q('commission_payouts', 'period_month'),
  ])
  const failed = [customers, appointments, payments, expenses, services, packages, profiles, closures, payouts].find((r) => r.error)
  // Sonradan eklenen tablolar (kasa kapanisi, prim odemeleri) eski kurulumlarda
  // olmayabilir; yalnizca ana tablolarda hata durdurur.
  if ([customers, appointments, payments, expenses, services].some((r) => r.error)) {
    throw new Error(failed?.error?.message ?? 'Kayıtlar okunamadı')
  }

  onProgress?.('Excel dosyası hazırlanıyor…')
  const cust = new Map((customers.data ?? []).map((c) => [c.id, s(c.full_name)]))
  const svc = new Map((services.data ?? []).map((x) => [x.id, x]))
  const people = new Map((profiles.data ?? []).map((p) => [p.id, s(p.full_name)]))
  const appt = new Map((appointments.data ?? []).map((a) => [a.id, a]))
  const pkg = new Map((packages.data ?? []).map((p) => [p.id, p]))
  const svcName = (id: unknown) => s(svc.get(id as string)?.name)

  const sheets: Sheet[] = [
    {
      name: 'Müşteriler',
      columns: [
        { header: 'Ad soyad', width: 26 },
        { header: 'Telefon', width: 16 },
        { header: 'E-posta', width: 26 },
        { header: 'Bakiye', width: 12, type: 'money' },
        { header: 'Not', width: 40 },
        { header: 'Kayıt tarihi', width: 14, type: 'date' },
      ],
      rows: (customers.data ?? []).map((c) => [
        s(c.full_name),
        s(c.phone || c.contact_phone),
        s(c.email),
        n(c.credit_balance),
        s(c.notes),
        d(c.created_at),
      ]),
    },
    {
      name: 'Randevular',
      columns: [
        { header: 'Tarih / saat', width: 17, type: 'datetime' },
        { header: 'Süre (dk)', width: 10, type: 'int' },
        { header: 'Müşteri', width: 24 },
        { header: 'Hizmet', width: 22 },
        { header: 'Çalışan', width: 18 },
        { header: 'Durum', width: 12 },
        { header: 'Ücret', width: 12, type: 'money' },
        { header: 'Paket seansı', width: 12 },
        { header: 'Kaynak', width: 14 },
        { header: 'Not', width: 34 },
      ],
      rows: (appointments.data ?? []).map((a) => [
        d(a.scheduled_at),
        n(a.duration_minutes),
        cust.get(a.customer_id as string) ?? '',
        svcName(a.service_id),
        people.get(a.employee_id as string) ?? '',
        STATUS_LABEL[s(a.status)] ?? s(a.status),
        a.package_id ? null : n(a.price_override ?? svc.get(a.service_id as string)?.price),
        !!a.package_id,
        SOURCE_LABEL[s(a.source)] ?? s(a.source),
        s(a.notes),
      ]),
    },
    {
      name: 'Ödemeler',
      columns: [
        { header: 'Tarih', width: 12, type: 'date' },
        { header: 'Müşteri', width: 24 },
        { header: 'Hizmet', width: 24 },
        { header: 'Tutar', width: 12, type: 'money' },
        { header: 'Yöntem', width: 10 },
        { header: 'Alan', width: 18 },
        { header: 'Not', width: 30 },
        { header: 'İptal edildi', width: 16, type: 'datetime' },
      ],
      rows: (payments.data ?? []).map((p) => {
        const sid = p.appointment_id ? appt.get(p.appointment_id as string)?.service_id : pkg.get(p.package_id as string)?.service_id
        return [
          d(p.paid_at),
          cust.get(p.customer_id as string) ?? '',
          p.package_id ? `${svcName(sid)} (paket)` : svcName(sid),
          n(p.amount),
          METHOD_LABEL[s(p.method)] ?? s(p.method),
          people.get(p.created_by_user_id as string) ?? '',
          s(p.note),
          d(p.voided_at),
        ]
      }),
    },
    {
      name: 'Giderler',
      columns: [
        { header: 'Tarih', width: 12, type: 'date' },
        { header: 'Açıklama', width: 30 },
        { header: 'Kategori', width: 16 },
        { header: 'Tutar', width: 12, type: 'money' },
        { header: 'Ödeme şekli', width: 12 },
        { header: 'Ödendi', width: 9 },
        { header: 'Son ödeme', width: 12, type: 'date' },
        { header: 'Her ay tekrar', width: 13 },
      ],
      rows: (expenses.data ?? []).map((e) => [
        d(e.expense_date),
        s(e.description),
        s(e.category),
        n(e.amount),
        METHOD_LABEL[s(e.payment_method)] ?? s(e.payment_method),
        !!e.is_paid,
        d(e.due_date),
        !!e.is_recurring,
      ]),
    },
    {
      name: 'Hizmetler',
      columns: [
        { header: 'Hizmet', width: 26 },
        { header: 'Süre (dk)', width: 10, type: 'int' },
        { header: 'Fiyat', width: 12, type: 'money' },
        { header: 'Aktif', width: 8 },
        { header: 'Online randevuda', width: 16 },
        { header: 'Paket seans', width: 12, type: 'int' },
        { header: 'Paket fiyatı', width: 12, type: 'money' },
        { header: 'Açıklama', width: 40 },
      ],
      rows: (services.data ?? []).map((x) => [
        s(x.name),
        n(x.duration_minutes),
        n(x.price),
        !!x.is_active,
        x.online_bookable !== false,
        n(x.package_sessions),
        n(x.package_price),
        s(x.description),
      ]),
    },
    {
      name: 'Paketler',
      columns: [
        { header: 'Müşteri', width: 24 },
        { header: 'Hizmet', width: 24 },
        { header: 'Seans', width: 8, type: 'int' },
        { header: 'Durum', width: 12 },
        { header: 'Satış tarihi', width: 14, type: 'date' },
        { header: 'Not', width: 30 },
      ],
      rows: (packages.data ?? []).map((p) => [
        cust.get(p.customer_id as string) ?? '',
        svcName(p.service_id),
        n(p.total_sessions),
        PACKAGE_STATUS[s(p.status)] ?? s(p.status),
        d(p.created_at),
        s(p.note),
      ]),
    },
    {
      name: 'Ekip',
      columns: [
        { header: 'Ad soyad', width: 24 },
        { header: 'Rol', width: 12 },
        { header: 'Aktif', width: 8 },
        { header: 'Online randevuda', width: 16 },
        { header: 'Eklenme', width: 14, type: 'date' },
      ],
      rows: (profiles.data ?? []).map((p) => [
        s(p.full_name),
        ROLE_LABEL[s(p.role)] ?? s(p.role),
        !!p.is_active,
        p.online_bookable !== false,
        d(p.created_at),
      ]),
    },
  ]

  if (!closures.error && closures.data.length > 0) {
    sheets.push({
      name: 'Kasa kapanışları',
      columns: [
        { header: 'Gün', width: 12, type: 'date' },
        { header: 'Açılış', width: 12, type: 'money' },
        { header: 'Olması gereken', width: 15, type: 'money' },
        { header: 'Sayılan', width: 12, type: 'money' },
        { header: 'Fark', width: 12, type: 'money' },
        { header: 'Kapatan', width: 18 },
        { header: 'Not', width: 30 },
      ],
      rows: closures.data.map((c) => [
        d(c.closure_date),
        n(c.opening_cash),
        n(c.expected_cash),
        n(c.counted_cash),
        n(c.difference),
        people.get(c.closed_by as string) ?? '',
        s(c.note),
      ]),
    })
  }
  if (!payouts.error && payouts.data.length > 0) {
    sheets.push({
      name: 'Prim ödemeleri',
      columns: [
        { header: 'Dönem', width: 12, type: 'date' },
        { header: 'Çalışan', width: 22 },
        { header: 'Tutar', width: 12, type: 'money' },
        { header: 'Ödeme tarihi', width: 13, type: 'date' },
      ],
      rows: payouts.data.map((p) => [d(p.period_month), people.get(p.profile_id as string) ?? '', n(p.amount), d(p.paid_at)]),
    })
  }

  const bytes = buildXlsx(sheets)
  const slug =
    businessName
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'isletme'
  onProgress?.('Dosya kaydediliyor…')
  await saveAndShareFile(
    bytes,
    `${slug}-verileri-${todayString()}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Verilerim (Excel)',
  )
  return sheets.map((sh) => ({ name: sh.name, count: sh.rows.length }))
}
