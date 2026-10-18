import { runSql } from './supabase-sql.ts'

// Testlerin olusturdugu verileri siler: "E2E " onekli musteriler (uygulama
// ismi "E2e" yapar, bu yuzden ILIKE) ve randevu/odeme/mesaj kayitlari,
// gruplar, sablonlar, e2e-*@test.com hesaplari, kayit testinin
// e2e-kayit-*@example.com hesaplari ve actigi isletmeler, silme talepleri.
const SQL = `
with c as (select id from public.customers where full_name ilike 'e2e %')
, a as (delete from public.appointments where customer_id in (select id from c) returning 1)
, n as (delete from public.notification_log where customer_id in (select id from c) returning 1)
select (select count(*) from a) appts, (select count(*) from n) logs;
delete from public.customers where full_name ilike 'e2e %';
delete from public.customer_groups where name ilike 'e2e %';
delete from public.campaign_message_templates where title ilike 'e2e %';
delete from public.business_expenses where description ilike 'e2e %';
delete from public.tasks where title ilike 'e2e %';
delete from auth.users where email like 'e2e-%@test.com' or email like 'e2e-kayit-%@example.com';
delete from public.businesses b where b.signup_source = 'self' and b.name ilike 'e2e %'
  and not exists (select 1 from public.profiles p where p.business_id = b.id);
delete from public.account_deletion_requests where contact like 'e2e-%@test.com';
`

export default function globalTeardown() {
  if (process.env.E2E_SKIP_CLEANUP === '1') return
  if (runSql(SQL, 'E2E temizligi')) console.log('E2E test verisi temizlendi.')
}
