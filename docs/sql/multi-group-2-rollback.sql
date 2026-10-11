-- ═══════════════════════════════════════════════════════════════════════════
-- ↩️ رجوع المرحلة ٢ (multi-group-2-functions.sql) — بيرجّع قواعد المجموعات زي ما كانت قبلها بالحرف
-- (group-member-locks.sql + group-share-records.sql + group-sort-perf.sql). شغّله بس لو حصلت مشكلة.
-- جدول العضوية والختم (المرحلة ١) بيفضلوا — مابيأثّروش على حاجة من غير المرحلة ٢.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.my_team_member_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  with me as (
    select id, team, role from public.profiles where id = (select auth.uid())
  ),
  gs as (
    select coalesce(g.share_records_enabled, true)  as shared,
           coalesce(g.records_leader_only, false)   as leader_only,
           g.leader_id
    from me left join public.group_settings g on g.team = me.team
  )
  select p.id
  from public.profiles p, me, gs
  where me.team is not null
    and p.team = me.team
    and (
      p.id = me.id
      or (gs.leader_only and (gs.leader_id = me.id or me.role = 'admin'))
      or (not gs.leader_only and gs.shared)
    )
$$;
grant execute on function public.my_team_member_ids() to authenticated;

create or replace function public.my_team_members() returns table (id uuid, username text)
  language sql stable security definer set search_path = public as $$
  select p.id, p.username from public.profiles p
  where p.team is not null
    and p.team = (select team from public.profiles where id = (select auth.uid()))
$$;
grant execute on function public.my_team_members() to authenticated;

drop policy if exists "read team field_checks" on public.field_checks;
create policy "read team field_checks" on public.field_checks for select to authenticated
  using (agent_id in (select public.my_team_member_ids()));

drop policy if exists "read team chassis" on public.chassis_records;
create policy "read team chassis" on public.chassis_records for select to authenticated
  using (agent_id in (select public.my_team_member_ids()));

drop function if exists public.match_group_plates(text[]);
create function public.match_group_plates(p_norms text[])
returns table (id uuid, plate text, method text, maps_link text, checked_at timestamptz, agent_id uuid, extra jsonb)
language sql stable security invoker set search_path = public as $$
  with norms as (select distinct n.norm from unnest(p_norms) as n(norm))
  select fc.id, fc.plate, fc.method, fc.maps_link, fc.checked_at, fc.agent_id, fc.extra
  from norms
  join public.field_checks fc on fc.plate_norm = norms.norm
  where fc.agent_id in (select public.my_team_member_ids());
$$;
grant execute on function public.match_group_plates(text[]) to authenticated;

drop policy if exists "read own team finds" on public.group_finds;
create policy "read own team finds" on public.group_finds for select to authenticated
  using (
    team is not null
    and team = public.my_team()
    and (
      not coalesce((select g.finds_leader_only from public.group_settings g where g.team = group_finds.team), false)
      or (select g.leader_id from public.group_settings g where g.team = group_finds.team) = (select auth.uid())
      or finder_id = (select auth.uid())
    )
  );

drop policy if exists "read own team settings" on public.group_settings;
create policy "read own team settings" on public.group_settings for select to authenticated
  using (team = public.my_team());

select 'رجعت زي ما كانت' as done;
