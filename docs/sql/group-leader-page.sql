-- ═══════════════════════════════════════════════════════════════════════════
-- 🧭 «إدارة مجموعتي» — صفحة مسئول المجموعة (المالك ١١ أكتوبر ٢٠٢٦). شغّله مرة واحدة. آمن لو اتشغّل مرتين.
--
--   • leader_page_enabled  السوبر أدمن بيفتح الصفحة لمسئول المجموعة (مقفولة افتراضياً).
--   • notify_member_ids    إشعارات السيارات المطلوبة لأعضاء المسئول يختارهم (فاضي = كل الأعضاء زي دلوقتي).
--   • my_team_wanted_found_v2  تقرير النشاط: المطلوب بتفاصيله الكاملة (بيانات العربية).
-- ⚠️ مجموعة ماتفتحلهاش الصفحة / ماحدّدش أعضاء ⇒ كل حاجة زي ما هي بالظبط.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.group_settings
  add column if not exists leader_page_enabled boolean not null default false,
  add column if not exists notify_member_ids   uuid[];

-- لقطات المطلوب: اللي لقاها دايماً · «للمسئول بس» ⇒ المسئول · أعضاء متحدّدين ⇒ هما بس · غير كده كل المجموعة
drop policy if exists "read own team finds" on public.group_finds;
create policy "read own team finds" on public.group_finds for select to authenticated
  using (
    team in (select tm.team from public.team_members tm where tm.agent_id = (select auth.uid()))
    and (
      finder_id = (select auth.uid())
      or (
        select case
          when coalesce(g.finds_leader_only, false) then g.leader_id = (select auth.uid())
          when g.notify_member_ids is not null then (select auth.uid()) = any(g.notify_member_ids)
          else true
        end
        from public.group_settings g where g.team = group_finds.team
      )
      or not exists (select 1 from public.group_settings g where g.team = group_finds.team)
    )
  );

-- تقرير النشاط: المطلوب اللي اتلقى بتفاصيله الكاملة (نفس شروط my_team_wanted_found + بيانات العربية)
create or replace function public.my_team_wanted_found_v2(p_days int default 30)
returns table (agent_id uuid, username text, plate text, checked_at timestamptz, maps_link text, method text, extra jsonb)
language sql stable security definer set search_path = public
as $$
  with lead as (select g.leader_id, g.activity_report_enabled from public.group_settings g where g.team = public.my_team())
  select fc.agent_id, coalesce(p.username, '؟'), fc.plate, fc.checked_at, fc.maps_link, fc.method, fc.extra::jsonb
  from public.field_checks fc
  join public.profiles p on p.id = fc.agent_id
  where ( ( (select leader_id from lead) = (select auth.uid()) and coalesce((select activity_report_enabled from lead), false) ) or public.is_group_admin() )
    and fc.agent_id in (select public.my_team_member_ids())
    and fc.extra is not null and jsonb_typeof(fc.extra::jsonb) = 'object' and fc.extra::jsonb <> '{}'::jsonb
    and fc.checked_at >= (now() - make_interval(days => greatest(p_days, 1)))
  order by fc.checked_at desc
  limit 1000;
$$;
grant execute on function public.my_team_wanted_found_v2(int) to authenticated;
revoke execute on function public.my_team_wanted_found_v2(int) from anon;

select 'صفحة إدارة مجموعتي تمام' as done;
