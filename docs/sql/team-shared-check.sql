-- ═══════════════════════════════════════════════════════════════════════════
-- تشييك المجموعة: مسئول المجموعة يرفع شيت التشييك، و**يستبدل** تشييك باقي
-- الأعضاء (المفتوح لهم الخدمة). سجلات/نتائج المندوب اللي شيّكها مابتتمسّش —
-- الاستبدال بيمس الشيت المرجعي (المحفظة) بس.
--
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- ⚠️ الميزة **مقفولة افتراضياً** لكل المجموعات (`shared_check_enabled = false`)
--    والسوبر أدمن بيفتحها/يقفلها لكل مجموعة من صفحة «المجموعات» بعد ما يحدّد
--    المسئول. تشغيل السكريبت ده **مايغيّرش أي حاجة** عند أي مندوب.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) مفتاح تشييك المجموعة على إعدادات المجموعة ──────────────────────────
alter table public.group_settings
  add column if not exists shared_check_enabled boolean not null default false;

-- ── (٢) مسئول تشييك مجموعتي؟ (مفتاحه المستقل shared_check_enabled) ──────────
create or replace function public.my_team_check_leader() returns uuid
  language sql stable security definer set search_path = public as $$
  select g.leader_id
  from public.group_settings g
  where g.team = (select p.team from public.profiles p where p.id = (select auth.uid()))
    and g.shared_check_enabled          -- الميزة مقفولة ⇒ مافيش مسئول أصلاً
$$;

create or replace function public.is_team_check_leader() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(public.my_team_check_leader() = (select auth.uid()), false)
$$;

grant execute on function public.my_team_check_leader() to authenticated;
grant execute on function public.is_team_check_leader() to authenticated;

-- ── (٣) بيانات شيت التشييك المرفوع (مش الملف نفسه — ده في التخزين) ──────────
create table if not exists public.team_check_files (
  team         text primary key,
  path         text not null,
  file_name    text not null,
  row_count    integer,
  plate_count  integer,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

alter table public.team_check_files enable row level security;

-- منح صريح للـData API (قاعدة Supabase من ٣٠ أكتوبر ٢٠٢٦: الجداول الجديدة
-- مابتاخدش وصول تلقائي). RLS تحت بتحكم مين يقرا/يكتب فعلاً.
grant select                         on public.team_check_files to anon;
grant select, insert, update, delete on public.team_check_files to authenticated;
grant select, insert, update, delete on public.team_check_files to service_role;

-- الأعضاء يقروا البيانات دي (اسم/عدد/تاريخ) عشان يعرفوا ينزّلوا النسخة الجديدة.
drop policy if exists "read own team check file" on public.team_check_files;
create policy "read own team check file" on public.team_check_files for select to authenticated
  using (team = public.my_team() and public.my_team_check_leader() is not null);

-- الكتابة والمسح **للمسئول بس**.
drop policy if exists "leader writes team check file" on public.team_check_files;
create policy "leader writes team check file" on public.team_check_files for insert to authenticated
  with check (team = public.my_team() and public.is_team_check_leader());

drop policy if exists "leader updates team check file" on public.team_check_files;
create policy "leader updates team check file" on public.team_check_files for update to authenticated
  using (team = public.my_team() and public.is_team_check_leader())
  with check (team = public.my_team() and public.is_team_check_leader());

drop policy if exists "leader deletes team check file" on public.team_check_files;
create policy "leader deletes team check file" on public.team_check_files for delete to authenticated
  using (team = public.my_team() and public.is_team_check_leader());

-- ── (٤) مكان الملف نفسه — bucket خاص (مش عام) منفصل عن داتا المجموعة ────────
insert into storage.buckets (id, name, public)
values ('team-check', 'team-check', false)
on conflict (id) do nothing;

-- مسار الملف = «<اسم المجموعة>/check.xlsx» — أول جزء في المسار هو المجموعة.
drop policy if exists "team members read team check" on storage.objects;
create policy "team members read team check" on storage.objects for select to authenticated
  using (
    bucket_id = 'team-check'
    and (storage.foldername(name))[1] = public.my_team()
    and public.my_team_check_leader() is not null   -- الميزة مقفولة ⇒ محدش يقرا
  );

drop policy if exists "leader uploads team check" on storage.objects;
create policy "leader uploads team check" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-check'
    and (storage.foldername(name))[1] = public.my_team()
    and public.is_team_check_leader()
  );

drop policy if exists "leader replaces team check" on storage.objects;
create policy "leader replaces team check" on storage.objects for update to authenticated
  using (bucket_id = 'team-check' and (storage.foldername(name))[1] = public.my_team() and public.is_team_check_leader())
  with check (bucket_id = 'team-check' and (storage.foldername(name))[1] = public.my_team() and public.is_team_check_leader());

drop policy if exists "leader deletes team check" on storage.objects;
create policy "leader deletes team check" on storage.objects for delete to authenticated
  using (bucket_id = 'team-check' and (storage.foldername(name))[1] = public.my_team() and public.is_team_check_leader());

-- ═══════════════════════════════════════════════════════════════════════════
-- بعد التشغيل: مافيش أي تغيير عند أي مندوب. افتح الميزة من صفحة «المجموعات»
-- لكل مجموعة على حدة بعد ما تحدّد مسئولها.
-- ═══════════════════════════════════════════════════════════════════════════
