-- ═══════════════════════════════════════════════════════════════════════════
-- 📢 «تشييك البرنامج» — ملفات تشييك الأدمن بتنزل عند كل المناديب (٢٥ أكتوبر ٢٠٢٦)
-- ═══════════════════════════════════════════════════════════════════════════
-- المالك: «لما ادمن عندي يرفعه يظهر عند كل الناس اكن المناديب هيا اللي رفعاه» + «يظهر عند الادمن تحت صفحه
-- التشييك كم واحد قاري عندو التشييك وكم واحد مش شغال بيه». الكود: lib/appCheck.ts.
--
-- شغّل الملف ده **مرة واحدة** في Supabase → SQL Editor. آمن: مابيغيّرش أي جدول موجود، ومافيش أي تغيير
-- عند أي مندوب لحد ما الأدمن يرفع (والتجربة الأول للسوبر أدمن + حسابات التجربة بس).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) مين أدمن؟ (أدمن أو سوبر أدمن، والحساب مفعّل) ─────────────────────────
create or replace function public.app_check_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and coalesce(is_active, true) and (role = 'admin' or is_super = true)
  );
$$;
revoke all on function public.app_check_is_admin() from public;
grant execute on function public.app_check_is_admin() to authenticated;

-- ── (٢) النسخة الحالية: صف واحد (رقم النسخة + الملفات) ──────────────────────
create table if not exists public.app_check_set (
  id          smallint primary key default 1 check (id = 1),
  version     text not null,
  files       jsonb not null default '[]'::jsonb,   -- [{slot, path, fileName, rows, plates}]
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
alter table public.app_check_set enable row level security;

-- منح صريح للـData API (قاعدة Supabase: الجداول الجديدة مابتاخدش وصول تلقائي). RLS تحت بتحكم.
grant select on public.app_check_set to authenticated;
grant select, insert, update, delete on public.app_check_set to service_role;

-- أي حد داخل يقرا (أسماء الملفات والتاريخ) عشان ينزّل النسخة الجديدة. الكتابة من الدالة تحت بس.
drop policy if exists "signed in reads app check" on public.app_check_set;
create policy "signed in reads app check" on public.app_check_set for select to authenticated using (true);

-- النشر: الأدمن بس، والوقت من السيرفر (عشان «آخر رفع يكسب» مايتلخبطش بساعة موبايل).
create or replace function public.publish_app_check(p_version text, p_files jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_at timestamptz := now();
begin
  if not public.app_check_is_admin() then
    raise exception 'not allowed';
  end if;
  insert into public.app_check_set (id, version, files, updated_at, updated_by)
  values (1, p_version, coalesce(p_files, '[]'::jsonb), v_at, auth.uid())
  on conflict (id) do update
    set version = excluded.version, files = excluded.files,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_at;
end;
$$;
revoke all on function public.publish_app_check(text, jsonb) from public;
grant execute on function public.publish_app_check(text, jsonb) to authenticated;

-- إشعار فوري للموبايلات المفتوحة أول ما الأدمن ينشر
do $$
begin
  alter publication supabase_realtime add table public.app_check_set;
exception when duplicate_object then null;
end $$;

-- ── (٣) حالة كل مندوب: شغّال على تشييك البرنامج ولا بتاعه ولا مفيش ─────────
create table if not exists public.app_check_status (
  agent_id    uuid primary key default auth.uid(),
  mode        text not null check (mode in ('app', 'own', 'none')),
  version     text,
  files       smallint,
  plates      integer,
  updated_at  timestamptz not null default now()
);
alter table public.app_check_status enable row level security;

grant select, insert, update on public.app_check_status to authenticated;
grant select, insert, update, delete on public.app_check_status to service_role;

drop policy if exists "own app check status insert" on public.app_check_status;
create policy "own app check status insert" on public.app_check_status for insert to authenticated
  with check (agent_id = (select auth.uid()));
drop policy if exists "own app check status update" on public.app_check_status;
create policy "own app check status update" on public.app_check_status for update to authenticated
  using (agent_id = (select auth.uid())) with check (agent_id = (select auth.uid()));
drop policy if exists "own or admin reads app check status" on public.app_check_status;
create policy "own or admin reads app check status" on public.app_check_status for select to authenticated
  using (agent_id = (select auth.uid()) or (select public.app_check_is_admin()));

-- تقرير الأدمن: كل المناديب المفعّلين + حالة كل واحد (اللي مافتحش البرنامج من ساعتها ⇒ mode فاضي)
create or replace function public.app_check_report()
returns table (agent_id uuid, username text, mode text, version text, files smallint, updated_at timestamptz, last_seen timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, s.mode, s.version, s.files, s.updated_at, p.last_seen
  from public.profiles p
  left join public.app_check_status s on s.agent_id = p.id
  where (select public.app_check_is_admin())
    and p.role = 'agent' and coalesce(p.is_active, true)
  order by p.username;
$$;
revoke all on function public.app_check_report() from public;
grant execute on function public.app_check_report() to authenticated;

-- ── (٤) مكان الملفات نفسها — مخزن خاص ───────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('app-check', 'app-check', false)
on conflict (id) do nothing;

drop policy if exists "signed in reads app check files" on storage.objects;
create policy "signed in reads app check files" on storage.objects for select to authenticated
  using (bucket_id = 'app-check');

drop policy if exists "admins upload app check files" on storage.objects;
create policy "admins upload app check files" on storage.objects for insert to authenticated
  with check (bucket_id = 'app-check' and (select public.app_check_is_admin()));

drop policy if exists "admins replace app check files" on storage.objects;
create policy "admins replace app check files" on storage.objects for update to authenticated
  using (bucket_id = 'app-check' and (select public.app_check_is_admin()))
  with check (bucket_id = 'app-check' and (select public.app_check_is_admin()));

drop policy if exists "admins delete app check files" on storage.objects;
create policy "admins delete app check files" on storage.objects for delete to authenticated
  using (bucket_id = 'app-check' and (select public.app_check_is_admin()));

-- ═══════════════════════════════════════════════════════════════════════════
-- بعد التشغيل: لسه مفيش أي تغيير عند المناديب. السوبر أدمن يرفع ملف تشييك ⇒ ينزل عند حسابات التجربة.
-- ═══════════════════════════════════════════════════════════════════════════
