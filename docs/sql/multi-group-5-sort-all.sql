-- ═══════════════════════════════════════════════════════════════════════════
-- 👥 الفرز على كل مجموعات المندوب مع بعض (المالك ١١ أكتوبر ٢٠٢٦: «عايزة لما ييجي يفرز الفرز يتطبق معاه
--    للمجموعتين»). محتاج المراحل ١–٤. آمن لو اتشغّل مرتين.
--
-- • كل مجموعة **بقواعدها هي**: مسئول ⇒ سجلات الكل، عضو ⇒ حسب «مشاركة السجلات» / «السجلات للمسئول بس» بتاعتها.
-- • مجموعة قافلة عليه الفرز أو السجلات ⇒ سجلاتها مابتدخلش فرزه.
-- • صفحة «سجلات المجموعة» بتفضل بتعرض المجموعة اللي شغّال لها بس (فلتر على الشاشة).
-- • ⚠️ المندوب في مجموعة واحدة (كل المناديب دلوقتي): **نفس النتيجة بالظبط** (الاختبار على Postgres بيتأكد).
-- ═══════════════════════════════════════════════════════════════════════════

-- المجموعات اللي بشوف فيها سجلات الكل — كل مجموعة بقواعدها
create or replace function public.my_record_teams() returns setof text
  language sql stable security definer set search_path = public as $$
  select tm.team
  from public.team_members tm
  join public.profiles me on me.id = (select auth.uid())
  left join public.group_settings g on g.team = tm.team
  where tm.agent_id = me.id
    and (case when coalesce(g.records_leader_only, false) then coalesce(g.leader_id = me.id or me.role = 'admin', false)
              else coalesce(g.share_records_enabled, true) end)
$$;
grant execute on function public.my_record_teams() to authenticated;

-- أصحاب السجلات القديمة (من غير ختم) اللي بشوفها: أعضاء المجموعات دي + أنا (لو في مجموعة)
create or replace function public.my_record_member_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select tm.agent_id from public.team_members tm where tm.team in (select public.my_record_teams())
  union
  select tm.agent_id from public.team_members tm where tm.agent_id = (select auth.uid())
$$;
grant execute on function public.my_record_member_ids() to authenticated;

-- المجموعات اللي بتدخل فرزي: اللي بشوف سجلاتها ومش قافلة عليّ الفرز ولا السجلات
create or replace function public.my_sort_teams() returns setof text
  language sql stable security definer set search_path = public as $$
  select t.team from public.my_record_teams() as t(team)
  where not exists (
    select 1 from public.group_settings g, public.profiles me
    where g.team = t.team and me.id = (select auth.uid())
      and g.leader_id is not null and g.leader_id <> me.id and me.role <> 'admin'
      and (coalesce(g.lock_member_sort, false) or coalesce(g.lock_member_records, false))
  )
$$;
grant execute on function public.my_sort_teams() to authenticated;

-- أعضاء مجموعات فرزي (للسجلات القديمة اللي من غير ختم). security definer — جدول العضوية بيرجّع للمندوب
-- صفّه هو بس، فالاستعلام جوّه دالة الفرز (invoker) كان بيضيّع سجلات زمايله (الاختبار مسكها).
create or replace function public.my_sort_member_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select tm.agent_id from public.team_members tm where tm.team in (select public.my_sort_teams())
$$;
grant execute on function public.my_sort_member_ids() to authenticated;

-- أسامي كل أعضاء مجموعاتي (للفرز — مين سجّل العربية)
create or replace function public.my_groups_members() returns table (id uuid, username text)
  language sql stable security definer set search_path = public as $$
  select distinct p.id, p.username
  from public.team_members tm join public.profiles p on p.id = tm.agent_id
  where tm.team in (select t.team from public.team_members t where t.agent_id = (select auth.uid()))
$$;
grant execute on function public.my_groups_members() to authenticated;

-- قراءة السجلات والشاص: كل مجموعة أنا عضو فيها بقواعدها
drop policy if exists "read team field_checks" on public.field_checks;
create policy "read team field_checks" on public.field_checks for select to authenticated
  using (
    (team is null and agent_id in (select public.my_record_member_ids()))
    or (team is not null and team in (select public.my_record_teams()))
  );

drop policy if exists "read team chassis" on public.chassis_records;
create policy "read team chassis" on public.chassis_records for select to authenticated
  using (
    (team is null and agent_id in (select public.my_record_member_ids()))
    or (team is not null and team in (select public.my_record_teams()))
  );

-- الفرز على السجلات: كل مجموعات فرزي + سجلاتي أنا (لو في مجموعة)
drop function if exists public.match_group_plates(text[]);
create function public.match_group_plates(p_norms text[])
returns table (id uuid, plate text, method text, maps_link text, checked_at timestamptz, agent_id uuid, extra jsonb)
language sql stable security invoker set search_path = public as $$
  with norms as (select distinct n.norm from unnest(p_norms) as n(norm))
  select fc.id, fc.plate, fc.method, fc.maps_link, fc.checked_at, fc.agent_id, fc.extra
  from norms
  join public.field_checks fc on fc.plate_norm = norms.norm
  where (fc.team is null and fc.agent_id in (select public.my_sort_member_ids()))
     or (fc.team is not null and fc.team in (select public.my_sort_teams()))
     or (fc.agent_id = (select auth.uid())
         and exists (select 1 from public.team_members tm where tm.agent_id = (select auth.uid())));
$$;
grant execute on function public.match_group_plates(text[]) to authenticated;

select 'الفرز على كل المجموعات تمام' as done;
