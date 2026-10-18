-- RLS izolasyon testi. Tek bir islem icinde calisir ve sonunda GERI ALINIR;
-- veritabaninda hicbir sey degismez. Calistirma: npm run test:rls
--
-- Senaryolar:
--   A) Isletme A yoneticisi, isletme B'nin business_id iceren TUM tablolarinda
--      okuma / guncelleme / silme / ekleme dener -> hepsi 0 satir ya da hata.
--   B) Isletme A'nin yetkisiz calisani (kasa ve yetki yonetimi yok) kendi
--      isletmesinde yoneticiye ait islemleri dener.
--   C) anon rolu (giris yapmamis) tablolari okuyamaz.
--   D) CRM: musteri alanlari / aktivite kaydi / zaman cizelgesi kurallari.
--   E-H) Gorevler, musteri dosyalari, otomasyonlar, potansiyel musteriler.
-- Sonuc: test, gecti, ayrinti. Basarisiz satir varsa run-rls-tests.mjs 1 ile cikar.
--
-- Test hesaplari: salon_admin@test.com, salon_user@test.com (Guzel Salon),
-- studio_admin@test.com (Fit Studio).

begin;

create temp table rls_result (test text, gecti boolean, ayrinti text);
grant all on rls_result to authenticated, anon;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
declare v uuid;
begin
  select id into v from auth.users where email = p_email;
  if v is null then raise exception 'test hesabi yok: %', p_email; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.as_user(text) to authenticated, anon;

-- A) Isletmeler arasi izolasyon
do $$
declare
  other uuid := (select business_id from profiles where id = (select id from auth.users where email = 'studio_admin@test.com'));
  t text;
  n int;
begin
  perform pg_temp.as_user('salon_admin@test.com');
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'business_id' order by 1
  loop
    begin
      execute format('select count(*) from public.%I where business_id = $1', t) into n using other;
      insert into rls_result values ('A okuma: ' || t, n = 0, n || ' satir');
    exception when others then
      insert into rls_result values ('A okuma: ' || t, true, 'reddedildi');
    end;
    begin
      execute format('with u as (update public.%I set business_id = business_id where business_id = $1 returning 1) select count(*) from u', t) into n using other;
      insert into rls_result values ('A guncelleme: ' || t, n = 0, n || ' satir');
    exception when others then
      insert into rls_result values ('A guncelleme: ' || t, true, 'reddedildi');
    end;
    begin
      execute format('with d as (delete from public.%I where business_id = $1 returning 1) select count(*) from d', t) into n using other;
      insert into rls_result values ('A silme: ' || t, n = 0, n || ' satir');
    exception when others then
      insert into rls_result values ('A silme: ' || t, true, 'reddedildi');
    end;
  end loop;

  -- Baska isletmeye kayit eklenemez
  begin
    insert into public.customers (business_id, full_name) values (other, 'RLS testi');
    insert into rls_result values ('A ekleme: customers', false, 'baska isletmeye musteri eklendi');
  exception when others then
    insert into rls_result values ('A ekleme: customers', true, 'reddedildi');
  end;
  begin
    insert into public.appointments (business_id, scheduled_at, duration_minutes, status)
    values (other, now() + interval '30 day', 30, 'bekliyor');
    insert into rls_result values ('A ekleme: appointments', false, 'baska isletmeye randevu eklendi');
  exception when others then
    insert into rls_result values ('A ekleme: appointments', true, 'reddedildi');
  end;
  begin
    insert into public.payments (business_id, customer_id, amount, method)
    values (other, (select id from public.customers limit 1), 1, 'nakit');
    insert into rls_result values ('A ekleme: payments', false, 'baska isletmeye odeme eklendi');
  exception when others then
    insert into rls_result values ('A ekleme: payments', true, 'reddedildi');
  end;

  -- Kendi profilini baska isletmeye ya da yoneticilige tasiyamaz (calisan icin asagida)
  perform set_config('role', 'postgres', true);
end $$;

-- B) Ayni isletmede yetkisiz calisan
do $$
declare n int; me uuid := (select id from auth.users where email = 'salon_user@test.com');
begin
  perform pg_temp.as_user('salon_user@test.com');

  select count(*) into n from public.cash_closures;
  insert into rls_result values ('B calisan kasa kapanislarini okuyamaz', n = 0 or not public.has_perm('kasa'), n || ' satir');

  begin
    update public.profiles set role = 'admin' where id = me;
    select count(*) into n from public.profiles where id = me and role = 'admin';
    insert into rls_result values ('B calisan kendini yonetici yapamaz', n = 0, case when n = 0 then 'degismedi' else 'YONETICI OLDU' end);
  exception when others then
    insert into rls_result values ('B calisan kendini yonetici yapamaz', true, 'reddedildi');
  end;

  begin
    with u as (
      update public.employee_permissions set permissions = array['kasa'] where profile_id = me returning 1
    ) select count(*) into n from u;
    insert into rls_result values ('B calisan kendine yetki veremez', n = 0, n || ' satir');
  exception when others then
    insert into rls_result values ('B calisan kendine yetki veremez', true, 'reddedildi');
  end;

  begin
    with u as (update public.businesses set name = name returning 1) select count(*) into n from u;
    insert into rls_result values ('B calisan isletme adini degistiremez', n = 0, n || ' satir');
  exception when others then
    insert into rls_result values ('B calisan isletme adini degistiremez', true, 'reddedildi');
  end;

  perform set_config('role', 'postgres', true);
end $$;

-- C) anon (giris yapmamis)
do $$
declare t text; n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  foreach t in array array['customers', 'appointments', 'payments', 'businesses', 'profiles', 'services', 'business_expenses', 'chatbot_messages'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      insert into rls_result values ('C anon okuma: ' || t, n = 0, n || ' satir');
    exception when others then
      insert into rls_result values ('C anon okuma: ' || t, true, 'reddedildi');
    end;
  end loop;
  perform set_config('role', 'postgres', true);
end $$;

-- D) CRM: musteri alanlari, aktivite kaydi, zaman cizelgesi
do $$
declare
  other uuid := (select business_id from profiles where id = (select id from auth.users where email = 'studio_admin@test.com'));
  mine uuid := (select business_id from profiles where id = (select id from auth.users where email = 'salon_admin@test.com'));
  other_customer uuid := (select id from customers where business_id = other limit 1);
  my_customer uuid := (select id from customers where business_id = mine limit 1);
  admin_note uuid;
  n int;
begin
  -- Yoneticinin notu (calisan silmeyi deneyecek)
  perform pg_temp.as_user('salon_admin@test.com');
  insert into public.customer_activities (business_id, customer_id, kind, body)
  values (mine, my_customer, 'not', 'RLS testi yonetici notu') returning id into admin_note;

  begin
    insert into public.customer_activities (business_id, customer_id, kind, body)
    values (other, other_customer, 'not', 'RLS testi');
    insert into rls_result values ('D baska isletmenin musterisine not', false, 'eklendi');
  exception when others then
    insert into rls_result values ('D baska isletmenin musterisine not', true, 'reddedildi');
  end;
  begin
    -- Kendi isletme kimligiyle ama baska isletmenin musterisine
    insert into public.customer_activities (business_id, customer_id, kind, body)
    values (mine, other_customer, 'not', 'RLS testi');
    insert into rls_result values ('D kendi kimligiyle yabanci musteriye not', false, 'eklendi');
  exception when others then
    insert into rls_result values ('D kendi kimligiyle yabanci musteriye not', true, 'reddedildi');
  end;
  begin
    insert into public.customer_field_definitions (business_id, label, type) values (other, 'RLS testi', 'text');
    insert into rls_result values ('D baska isletmeye musteri alani', false, 'eklendi');
  exception when others then
    insert into rls_result values ('D baska isletmeye musteri alani', true, 'reddedildi');
  end;
  select count(*) into n from public.customer_timeline(other_customer);
  insert into rls_result values ('D baska isletmenin zaman cizelgesi', n = 0, n || ' satir');

  -- Calisan
  perform set_config('role', 'postgres', true);
  perform pg_temp.as_user('salon_user@test.com');
  begin
    insert into public.customer_field_definitions (business_id, label, type) values (mine, 'RLS testi', 'text');
    insert into rls_result values ('D calisan musteri alani tanimlayamaz', false, 'eklendi');
  exception when others then
    insert into rls_result values ('D calisan musteri alani tanimlayamaz', true, 'reddedildi');
  end;
  with d as (delete from public.customer_activities where id = admin_note returning 1) select count(*) into n from d;
  insert into rls_result values ('D calisan yoneticinin notunu silemez', n = 0, n || ' satir');
  begin
    insert into public.customer_activities (business_id, customer_id, kind, body)
    values (mine, my_customer, 'arama', 'RLS testi calisan notu');
    insert into rls_result values ('D calisan kendi musterisine not ekler', true, 'eklendi');
  exception when others then
    insert into rls_result values ('D calisan kendi musterisine not ekler', false, sqlerrm);
  end;

  perform set_config('role', 'postgres', true);
end $$;

-- E) Gorevler
do $$
declare
  other uuid := (select business_id from profiles where id = (select id from auth.users where email = 'studio_admin@test.com'));
  mine uuid := (select business_id from profiles where id = (select id from auth.users where email = 'salon_admin@test.com'));
  other_customer uuid := (select id from customers where business_id = other limit 1);
  other_staff uuid := (select id from auth.users where email = 'studio_admin@test.com');
  admin_id uuid := (select id from auth.users where email = 'salon_admin@test.com');
  staff_id uuid := (select id from auth.users where email = 'salon_user@test.com');
  admin_task uuid;
  n int;
begin
  perform pg_temp.as_user('salon_admin@test.com');
  insert into public.tasks (business_id, title, due_date, assignee_id, created_by)
  values (mine, 'RLS testi yonetici gorevi', current_date, admin_id, admin_id) returning id into admin_task;
  begin
    insert into public.tasks (business_id, customer_id, title, due_date, created_by)
    values (mine, other_customer, 'RLS testi', current_date, admin_id);
    insert into rls_result values ('E yabanci musteriye gorev', false, 'eklendi');
  exception when others then
    insert into rls_result values ('E yabanci musteriye gorev', true, 'reddedildi');
  end;
  begin
    insert into public.tasks (business_id, title, due_date, assignee_id, created_by)
    values (mine, 'RLS testi', current_date, other_staff, admin_id);
    insert into rls_result values ('E baska isletmenin calisanina atama', false, 'eklendi');
  exception when others then
    insert into rls_result values ('E baska isletmenin calisanina atama', true, 'reddedildi');
  end;
  begin
    insert into public.tasks (business_id, title, due_date, created_by) values (other, 'RLS testi', current_date, admin_id);
    insert into rls_result values ('E baska isletmeye gorev', false, 'eklendi');
  exception when others then
    insert into rls_result values ('E baska isletmeye gorev', true, 'reddedildi');
  end;

  perform set_config('role', 'postgres', true);
  perform pg_temp.as_user('salon_user@test.com');
  with u as (update public.tasks set status = 'tamamlandi' where id = admin_task returning 1) select count(*) into n from u;
  insert into rls_result values ('E calisan yoneticiye atanmis gorevi kapatamaz', n = 0, n || ' satir');
  with d as (delete from public.tasks where id = admin_task returning 1) select count(*) into n from d;
  insert into rls_result values ('E calisan yoneticinin gorevini silemez', n = 0, n || ' satir');
  begin
    insert into public.tasks (business_id, title, due_date, created_by)
    values (mine, 'RLS testi calisan gorevi', current_date, staff_id);
    insert into rls_result values ('E calisan gorev ekler', true, 'eklendi');
  exception when others then
    insert into rls_result values ('E calisan gorev ekler', false, sqlerrm);
  end;

  perform set_config('role', 'postgres', true);
end $$;

-- F) Musteri dosyalari (depolama + kayit)
do $$
declare
  other uuid := (select business_id from profiles where id = (select id from auth.users where email = 'studio_admin@test.com'));
  mine uuid := (select business_id from profiles where id = (select id from auth.users where email = 'salon_admin@test.com'));
  other_customer uuid := (select id from customers where business_id = other limit 1);
  my_customer uuid := (select id from customers where business_id = mine limit 1);
  admin_id uuid := (select id from auth.users where email = 'salon_admin@test.com');
  n int;
begin
  -- Diger isletmenin klasorunde bir dosya (islem sonunda geri alinir)
  insert into storage.objects (bucket_id, name, owner) values ('customer-files', other || '/' || other_customer || '/rls-test.jpg', null);

  perform pg_temp.as_user('salon_admin@test.com');
  select count(*) into n from storage.objects where bucket_id = 'customer-files' and name like other || '/%';
  insert into rls_result values ('F baska isletmenin dosyasi okunamaz', n = 0, n || ' satir');
  begin
    insert into storage.objects (bucket_id, name, owner) values ('customer-files', other || '/' || other_customer || '/sizma.jpg', admin_id);
    insert into rls_result values ('F baska isletmenin klasorune dosya', false, 'eklendi');
  exception when others then
    insert into rls_result values ('F baska isletmenin klasorune dosya', true, 'reddedildi');
  end;
  begin
    insert into public.customer_files (business_id, customer_id, path, file_name, mime, size_bytes, uploaded_by)
    values (mine, other_customer, mine || '/' || other_customer || '/x.jpg', 'x.jpg', 'image/jpeg', 10, admin_id);
    insert into rls_result values ('F yabanci musteriye dosya kaydi', false, 'eklendi');
  exception when others then
    insert into rls_result values ('F yabanci musteriye dosya kaydi', true, 'reddedildi');
  end;
  begin
    insert into public.customer_files (business_id, customer_id, path, file_name, mime, size_bytes, uploaded_by)
    values (mine, my_customer, other || '/' || my_customer || '/x.jpg', 'x.jpg', 'image/jpeg', 10, admin_id);
    insert into rls_result values ('F kayit yolu baska isletme klasoru', false, 'eklendi');
  exception when others then
    insert into rls_result values ('F kayit yolu baska isletme klasoru', true, 'reddedildi');
  end;
  perform set_config('role', 'postgres', true);
end $$;

-- G) Otomasyonlar
do $$
declare
  other uuid := (select business_id from profiles where id = (select id from auth.users where email = 'studio_admin@test.com'));
  mine uuid := (select business_id from profiles where id = (select id from auth.users where email = 'salon_admin@test.com'));
  n int;
begin
  perform pg_temp.as_user('salon_admin@test.com');
  begin
    perform public.run_automations(other);
    insert into rls_result values ('G yonetici baska isletmenin kurallarini calistiramaz', false, 'calisti');
  exception when others then
    insert into rls_result values ('G yonetici baska isletmenin kurallarini calistiramaz', true, 'reddedildi');
  end;
  begin
    insert into public.automation_rules (business_id, kind) values (other, 'gelmedi');
    insert into rls_result values ('G baska isletmeye kural', false, 'eklendi');
  exception when others then
    insert into rls_result values ('G baska isletmeye kural', true, 'reddedildi');
  end;
  begin
    select public.run_my_automations() into n;
    insert into rls_result values ('G yonetici kendi kurallarini calistirir', true, n || ' gorev');
  exception when others then
    insert into rls_result values ('G yonetici kendi kurallarini calistirir', false, sqlerrm);
  end;

  perform set_config('role', 'postgres', true);
  perform pg_temp.as_user('salon_user@test.com');
  begin
    insert into public.automation_rules (business_id, kind) values (mine, 'gelmedi');
    insert into rls_result values ('G calisan kural tanimlayamaz', false, 'eklendi');
  exception when others then
    insert into rls_result values ('G calisan kural tanimlayamaz', true, 'reddedildi');
  end;
  begin
    perform public.run_my_automations();
    insert into rls_result values ('G calisan kurallari calistiramaz', false, 'calisti');
  exception when others then
    insert into rls_result values ('G calisan kurallari calistiramaz', true, 'reddedildi');
  end;
  perform set_config('role', 'postgres', true);
end $$;

-- H) Potansiyel musteriler
do $$
declare
  other uuid := (select business_id from profiles where id = (select id from auth.users where email = 'studio_admin@test.com'));
  mine uuid := (select business_id from profiles where id = (select id from auth.users where email = 'salon_admin@test.com'));
  other_customer uuid := (select id from customers where business_id = other limit 1);
  other_staff uuid := (select id from auth.users where email = 'studio_admin@test.com');
  admin_id uuid := (select id from auth.users where email = 'salon_admin@test.com');
  staff_id uuid := (select id from auth.users where email = 'salon_user@test.com');
  admin_lead uuid;
  n int;
begin
  perform pg_temp.as_user('salon_admin@test.com');
  insert into public.leads (business_id, full_name, created_by) values (mine, 'RLS testi aday', admin_id)
  returning id into admin_lead;
  begin
    insert into public.leads (business_id, full_name, created_by) values (other, 'RLS testi', admin_id);
    insert into rls_result values ('H baska isletmeye aday', false, 'eklendi');
  exception when others then
    insert into rls_result values ('H baska isletmeye aday', true, 'reddedildi');
  end;
  begin
    insert into public.leads (business_id, full_name, created_by) values (mine, 'RLS testi', staff_id);
    insert into rls_result values ('H baskasi adina aday', false, 'eklendi');
  exception when others then
    insert into rls_result values ('H baskasi adina aday', true, 'reddedildi');
  end;
  begin
    update public.leads set customer_id = other_customer where id = admin_lead;
    insert into rls_result values ('H adaya yabanci musteri baglama', false, 'baglandi');
  exception when others then
    insert into rls_result values ('H adaya yabanci musteri baglama', true, 'reddedildi');
  end;
  begin
    update public.leads set assignee_id = other_staff where id = admin_lead;
    insert into rls_result values ('H adayi baska isletmenin calisanina atama', false, 'atandi');
  exception when others then
    insert into rls_result values ('H adayi baska isletmenin calisanina atama', true, 'reddedildi');
  end;
  begin
    update public.leads set stage = 'kaybedildi' where id = admin_lead;
    insert into rls_result values ('H nedensiz kaybedildi', false, 'kaydedildi');
  exception when others then
    insert into rls_result values ('H nedensiz kaybedildi', true, 'reddedildi');
  end;

  perform set_config('role', 'postgres', true);
  perform pg_temp.as_user('salon_user@test.com');
  with u as (update public.leads set stage = 'iletisim' where id = admin_lead returning 1) select count(*) into n from u;
  insert into rls_result values ('H calisan adayin asamasini degistirir', n = 1, n || ' satir');
  with d as (delete from public.leads where id = admin_lead returning 1) select count(*) into n from d;
  insert into rls_result values ('H calisan baskasinin adayini silemez', n = 0, n || ' satir');
  perform set_config('role', 'postgres', true);
end $$;

select test, gecti, ayrinti from rls_result order by gecti, test;
rollback;
