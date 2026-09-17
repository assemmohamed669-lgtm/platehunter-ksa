-- ═══════════════════════════════════════════════════════════════════════════
-- داتا المجموعة: مسئول المجموعة يرفع ملف داتا، والأعضاء **يفرزوا عليه بس**.
-- مايقدروش يفتحوه ولا يحمّلوه ولا يغيّروه ولا يمسحوه.
--
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- ⚠️ الميزة **مقفولة افتراضياً** لكل المجموعات (`shared_data_enabled = false`)
--    والمالك بيفتحها بإيده لكل مجموعة من صفحة «المجموعات» بعد ما يحدّد المسئول.
--    يعني تشغيل السكريبت ده **مايغيّرش أي حاجة** عند أي مندوب.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) عمودين جداد على إعدادات المجموعة ───────────────────────────────────
alter table public.group_settings
  add column if not exists leader_id            uuid,
  add column if not exists shared_data_enabled  boolean not null default false;

-- ── (٢) مين مسئول مجموعتي؟ ─────────────────────────────────────────────────
-- SECURITY DEFINER عشان الدالة تقرا `profiles` من غير ما نفتحها للمندوب.
create or replace function public.my_team_leader() returns uuid
  language sql stable security definer set search_path = public as $$
  select g.leader_id
  from public.group_settings g
  where g.team = (select p.team from public.profiles p where p.id = (select auth.uid()))
    and g.shared_data_enabled          -- الميزة مقفولة ⇒ مافيش مسئول أصلاً
$$;

-- أنا مسئول مجموعتي؟ (بيتّاخد عليه قرار الكتابة في كل مكان)
create or replace function public.is_team_leader() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.my_team_leader() = (select auth.uid()), false)
$$;

grant execute on function public.my_team_leader()  to authenticated;
grant execute on function public.is_team_leader()  to authenticated;

-- ── (٣) بيانات الملف المرفوع (مش الملف نفسه — ده في التخزين) ───────────────
create table if not exists public.team_data_files (
  team         text primary key,
  path         text not null,             -- مساره في bucket التخزين
  file_name    text not null,
  row_count    integer,
  plate_count  integer,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

alter table public.team_data_files enable row level security;

-- الأعضاء **يقروا البيانات دي** (اسم الملف والعدد وتاريخ التحديث) عشان التطبيق
-- يعرف ينزّل النسخة الجديدة. الملف نفسه محميّ بسياسات التخزين تحت.
drop policy if exists "read own team data file" on public.team_data_files;
create policy "read own team data file" on public.team_data_files for select to authenticated
  using (team = public.my_team() and public.my_team_leader() is not null);

-- الكتابة والمسح **للمسئول بس**.
drop policy if exists "leader writes team data file" on public.team_data_files;
create policy "leader writes team data file" on public.team_data_files for insert to authenticated
  with check (team = public.my_team() and public.is_team_leader());

drop policy if exists "leader updates team data file" on public.team_data_files;
create policy "leader updates team data file" on public.team_data_files for update to authenticated
  using (team = public.my_team() and public.is_team_leader())
  with check (team = public.my_team() and public.is_team_leader());

drop policy if exists "leader deletes team data file" on public.team_data_files;
create policy "leader deletes team data file" on public.team_data_files for delete to authenticated
  using (team = public.my_team() and public.is_team_leader());

-- ── (٤) مكان الملف نفسه — bucket خاص (مش عام) ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('team-data', 'team-data', false)
on conflict (id) do nothing;

-- مسار الملف = «<اسم المجموعة>/data.xlsx» — أول جزء في المسار هو المجموعة،
-- وعليه بتتبني كل السياسات.
drop policy if exists "team members read team data" on storage.objects;
create policy "team members read team data" on storage.objects for select to authenticated
  using (
    bucket_id = 'team-data'
    and (storage.foldername(name))[1] = public.my_team()
    and public.my_team_leader() is not null      -- الميزة مقفولة ⇒ محدش يقرا
  );

drop policy if exists "leader uploads team data" on storage.objects;
create policy "leader uploads team data" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-data'
    and (storage.foldername(name))[1] = public.my_team()
    and public.is_team_leader()
  );

drop policy if exists "leader replaces team data" on storage.objects;
create policy "leader replaces team data" on storage.objects for update to authenticated
  using (bucket_id = 'team-data' and (storage.foldername(name))[1] = public.my_team() and public.is_team_leader())
  with check (bucket_id = 'team-data' and (storage.foldername(name))[1] = public.my_team() and public.is_team_leader());

drop policy if exists "leader deletes team data" on storage.objects;
create policy "leader deletes team data" on storage.objects for delete to authenticated
  using (bucket_id = 'team-data' and (storage.foldername(name))[1] = public.my_team() and public.is_team_leader());

-- ═══════════════════════════════════════════════════════════════════════════
-- بعد التشغيل: مافيش أي تغيير عند أي مندوب. افتح الميزة من صفحة «المجموعات»
-- لكل مجموعة على حدة بعد ما تحدّد مسئولها.
-- ═══════════════════════════════════════════════════════════════════════════
