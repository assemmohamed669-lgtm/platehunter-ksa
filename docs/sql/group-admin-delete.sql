-- ═══════════════════════════════════════════════════════════════════════════
-- صلاحية المسح داخل المجموعة: **الأدمن اللي في مجموعة** يمسح أي حاجة من داتا
-- مجموعته — سجلات اللوحات، سجلات الشاص، وملف داتا المجموعة.
-- شغّل الملف ده مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- الحدود بدقّة (مهم — دي صلاحية مسح):
--   • لازم يكون role = 'admin'  **و**  profiles.team بتاعه مش فاضي.
--   • ومايمسحش غير صفوف **أعضاء مجموعته هو** (public.my_team_member_ids()).
--   • المندوب العادي زي ما هو بالظبط: سجلاته هو بس.
--   • مافيش أي توسيع لصلاحيات القراءة — المسح بس.
--
-- السياسات بتتجمع بـOR، فالسياسة الموجودة «امسح سجلاتك» بتفضل شغّالة زي ما هي
-- ومحدش بيفقد صلاحية كانت عنده.
-- ═══════════════════════════════════════════════════════════════════════════

-- أدمن **وفي مجموعة**؟ (security definer عشان يقرا صفّه في profiles من غير ما
-- ندي صلاحية قراءة زيادة لحد.)
create or replace function public.is_group_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and team is not null
  )
$$;

grant execute on function public.is_group_admin() to authenticated;
revoke execute on function public.is_group_admin() from anon;
revoke execute on function public.is_group_admin() from public;

-- ── (١) سجلات اللوحات ──────────────────────────────────────────────────────
drop policy if exists field_checks_group_admin_delete on public.field_checks;
create policy field_checks_group_admin_delete on public.field_checks
  for delete to authenticated
  using (
    (select public.is_group_admin())
    and agent_id in (select public.my_team_member_ids())
  );

-- ── (٢) سجلات الشاص ────────────────────────────────────────────────────────
drop policy if exists chassis_group_admin_delete on public.chassis_records;
create policy chassis_group_admin_delete on public.chassis_records
  for delete to authenticated
  using (
    (select public.is_group_admin())
    and agent_id in (select public.my_team_member_ids())
  );

-- ── (٣) ملف داتا المجموعة ──────────────────────────────────────────────────
-- كان المسئول بس هو اللي يمسحه؛ بقى الأدمن اللي في نفس المجموعة كمان.
drop policy if exists team_data_group_admin_delete on public.team_data_files;
create policy team_data_group_admin_delete on public.team_data_files
  for delete to authenticated
  using (team = public.my_team() and (select public.is_group_admin()));

drop policy if exists "team data admin delete" on storage.objects;
create policy "team data admin delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team-data'
    and (storage.foldername(name))[1] = public.my_team()
    and (select public.is_group_admin())
  );
