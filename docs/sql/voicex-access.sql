-- =====================================================================
-- VoiceX — صلاحيات لكل مشترك + مؤشّر لينك النفق.
-- يُشغَّل مرة واحدة على Supabase (SQL Editor). آمن للتشغيل المتكرر (idempotent)
-- ولا يغيّر سلوك أي مندوب حالي:
--   • voicex_enabled  افتراضي false  → VoiceX مقفول للكل (حتى الأدمنز) لحد ما
--     المالك يفتحه يدوياً لكل واحد.
--   • rest_pages_enabled افتراضي true → «باقي صفحات البرنامج» مفتوح للكل
--     (الحاليين والجدد؛ Postgres بيملأ الصفوف الموجودة بالافتراضي تلقائياً).
--
-- جدول الحقيقة (يُطبَّق في الكود، مش هنا):
--   VoiceX=مقفول + الأب=مفتوح  → صوت ديبجرام + كل الصفحات (السلوك الحالي)
--   VoiceX=مفتوح + الأب=مفتوح  → صوت VoiceX + كل الصفحات
--   VoiceX=مفتوح + الأب=مقفول  → صفحة صوت VoiceX فقط
--   VoiceX=مقفول + الأب=مقفول  → مقفول
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- (١) علمان بوليانيان لكل مشترك على profiles (نمط device_lock_exempt).
--     القراءة مغطّاة أصلاً بسياسات RLS القائمة (profiles_select_own للمندوب،
--     profiles_select_admin للأدمن). الكتابة تمرّ عبر /api/admin/manage-agent
--     بمفتاح الخدمة فقط — مش من العميل (كتابة العميل خلف RLS بتفشل صامتة).
-- ─────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists voicex_enabled     boolean not null default false,
  add column if not exists rest_pages_enabled boolean not null default true;

-- ─────────────────────────────────────────────────────────────────────
-- (٢) مؤشّر لينك النفق — جدول مفرد **مقروء** (اللينك مش سرّ؛ اللي بيحمي
--     الخدمة هو التوكن + قيد CORS على السيرفر). قابل للقراءة لأي مستخدم مسجّل
--     ومضاف لـrealtime، فأول ما اللابتوب يبدّل النفق يوصل اللينك الجديد
--     لحظياً لكل الأجهزة بلا polling. الكتابة: المالك (set_voicex_url) أو
--     اللابتوب عبر /api/voicex/tunnel بمفتاح الخدمة (يتخطّى RLS).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.voicex_pointer (
  id         boolean primary key default true check (id = true),
  url        text,
  is_up      boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.voicex_pointer enable row level security;

-- صف مفرد يبدأ فاضي.
insert into public.voicex_pointer (id) values (true) on conflict (id) do nothing;

-- سياسة قراءة: أي مستخدم مسجّل يقرأ المؤشّر (اللينك غير سرّي).
drop policy if exists voicex_pointer_select on public.voicex_pointer;
create policy voicex_pointer_select on public.voicex_pointer
  for select to authenticated using (true);

-- إضافته لنشر realtime (محمي ضد التكرار).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'voicex_pointer'
  ) then
    alter publication supabase_realtime add table public.voicex_pointer;
  end if;
end $$;

-- Setter يدوي للمالك (is_super) — لو حبّ يحطّ/يمسح اللينك من شاشة السوبر أدمن.
-- (اللابتوب بيستخدم مسار API بمفتاح الخدمة، مش الدالة دي، لأنه مالوش جلسة مالك.)
create or replace function public.set_voicex_url(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_super = true
  ) then
    raise exception 'NOT_SUPER';
  end if;

  insert into public.voicex_pointer (id, url, updated_at)
  values (true, nullif(btrim(p_url), ''), now())
  on conflict (id) do update
    set url = nullif(btrim(p_url), ''), updated_at = now();
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- (٣) توكن VoiceX — **سرّ**، فبيتخزّن على app_settings (اللي مالوش سياسة
--     SELECT) ويُقرأ عبر getter SECURITY DEFINER للمسجّلين فقط. مش بيتحطّ في
--     الجدول المقروء ولا في الـURL أبداً — بيتبعت في ترويسة X-Plate-Token بس.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.app_settings (
  id boolean primary key default true check (id = true)
);
alter table public.app_settings enable row level security;

alter table public.app_settings
  add column if not exists voicex_token text;

create or replace function public.set_voicex_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and is_super = true
  ) then
    raise exception 'NOT_SUPER';
  end if;

  insert into public.app_settings (id, voicex_token)
  values (true, nullif(btrim(p_token), ''))
  on conflict (id) do update
    set voicex_token = nullif(btrim(p_token), '');
end;
$$;

create or replace function public.get_voicex_token()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select voicex_token from public.app_settings where id = true;
$$;

-- المِنح: المسجّلون فقط (مش anon — Supabase بيمنح PUBLIC تلقائياً فلازم سحب صريح).
grant execute on function public.set_voicex_url(text)    to authenticated;
grant execute on function public.set_voicex_token(text)  to authenticated;
grant execute on function public.get_voicex_token()      to authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('set_voicex_url', 'set_voicex_token', 'get_voicex_token')
  loop
    execute format('revoke execute on function %s from anon;', r.sig);
    execute format('revoke execute on function %s from public;', r.sig);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- تشغيل يدوي سريع لو حبّيت (اختياري):
--   select public.set_voicex_token('<سرّ-إنتاج-جديد-غير-اللي-في-المعمل>');
--   select public.set_voicex_url('https://<اسم-النفق>.trycloudflare.com');
-- فتح VoiceX لمندوب بعينه بيتم من زرّ صفحة إدارة المشترك (مش من هنا).
-- ─────────────────────────────────────────────────────────────────────
