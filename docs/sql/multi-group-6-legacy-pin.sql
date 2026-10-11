-- ═══════════════════════════════════════════════════════════════════════════
-- 👥 إصلاح «canceling statement due to statement timeout» لما مندوب يتنقل/يتضاف لمجموعة (المالك ١١ أكتوبر ٢٠٢٦)
-- محتاج المراحل ١–٥. آمن لو اتشغّل مرتين.
--
-- السبب: النقل/الإضافة كانوا بيختموا **كل** سجلات المندوب القديمة (من غير ختم) بمجموعته الأولى سجل سجل — مندوب
-- عنده عشرات الآلاف = تحديث ضخم بيعدّي وقت السيرفر (وضغط على القاعدة).
-- الحل: سطر واحد بس — «سجلات فلان القديمة تبع مجموعة كذا» (`agent_legacy_team`)، والقواعد بتقرا منه. نفس
-- النتيجة بالظبط (قرار المالك: الشغل بيفضل للمجموعة اللي اتعمل لها) من غير ما نلمس السجلات خالص.
-- ═══════════════════════════════════════════════════════════════════════════

-- سجلات المندوب القديمة (من غير ختم) تبع أنهي مجموعة — أول مرة يسيب/يتضاف لتانية
create table if not exists public.agent_legacy_team (
  agent_id   uuid primary key references public.profiles(id) on delete cascade,
  team       text not null,
  pinned_at  timestamptz not null default now()
);
alter table public.agent_legacy_team enable row level security;
drop policy if exists "read own legacy team" on public.agent_legacy_team;
create policy "read own legacy team" on public.agent_legacy_team for select to authenticated
  using (agent_id = (select auth.uid()));
grant select on public.agent_legacy_team to authenticated;   -- Supabase بطّلت المنح التلقائي

-- ── يسيب مجموعة: سطر واحد بدل تحديث كل سجلاته ─────────────────────────────────────────────
create or replace function public.leave_team_internal(p_agent uuid, p_team text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.agent_legacy_team (agent_id, team) values (p_agent, p_team) on conflict do nothing;
  if public.records_locked_for(p_agent, p_team) then
    insert into public.agent_hidden_record_teams (agent_id, team) values (p_agent, p_team) on conflict do nothing;
  end if;
  delete from public.team_members where agent_id = p_agent and team = p_team;
end $$;
revoke execute on function public.leave_team_internal(uuid, text) from public, anon, authenticated;

-- ── «ضيفه كمان»: سجلاته القديمة تفضل لمجموعته الحالية — سطر واحد ──────────────────────────────
create or replace function public.add_agent_to_team(p_agent uuid, p_team text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  target text := nullif(btrim(coalesce(p_team, '')), '');
  cur    text;
begin
  if target is null then return; end if;
  select p.team into cur from public.profiles p where p.id = p_agent;
  if cur is not null and cur <> target then
    insert into public.agent_legacy_team (agent_id, team) values (p_agent, cur) on conflict do nothing;
  end if;
  insert into public.team_members (team, agent_id) values (target, p_agent) on conflict do nothing;
  delete from public.agent_hidden_record_teams where agent_id = p_agent and team = target;
  if cur is null then
    update public.profiles set team = target where id = p_agent;
  end if;
end $$;
revoke execute on function public.add_agent_to_team(uuid, text) from public, anon, authenticated;
grant execute on function public.add_agent_to_team(uuid, text) to service_role;

-- ── أصحاب السجلات القديمة (من غير ختم) اللي بشوفها / اللي بتدخل فرزي ───────────────────────────
-- عضو مالوش سطر ⇒ زي الأول (بيتبع عضويته). ليه سطر ⇒ سجلاته القديمة تبع المجموعة اللي في السطر بس.
create or replace function public.my_legacy_record_agents() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select tm.agent_id from public.team_members tm
  where tm.team in (select public.my_record_teams())
    and not exists (select 1 from public.agent_legacy_team l where l.agent_id = tm.agent_id)
  union
  select l.agent_id from public.agent_legacy_team l where l.team in (select public.my_record_teams())
  union
  select tm.agent_id from public.team_members tm where tm.agent_id = (select auth.uid())
$$;
grant execute on function public.my_legacy_record_agents() to authenticated;

create or replace function public.my_legacy_sort_agents() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select tm.agent_id from public.team_members tm
  where tm.team in (select public.my_sort_teams())
    and not exists (select 1 from public.agent_legacy_team l where l.agent_id = tm.agent_id)
  union
  select l.agent_id from public.agent_legacy_team l where l.team in (select public.my_sort_teams())
$$;
grant execute on function public.my_legacy_sort_agents() to authenticated;

drop policy if exists "read team field_checks" on public.field_checks;
create policy "read team field_checks" on public.field_checks for select to authenticated
  using (
    (team is null and agent_id in (select public.my_legacy_record_agents()))
    or (team is not null and team in (select public.my_record_teams()))
  );

drop policy if exists "read team chassis" on public.chassis_records;
create policy "read team chassis" on public.chassis_records for select to authenticated
  using (
    (team is null and agent_id in (select public.my_legacy_record_agents()))
    or (team is not null and team in (select public.my_record_teams()))
  );

drop function if exists public.match_group_plates(text[]);
create function public.match_group_plates(p_norms text[])
returns table (id uuid, plate text, method text, maps_link text, checked_at timestamptz, agent_id uuid, extra jsonb)
language sql stable security invoker set search_path = public as $$
  with norms as (select distinct n.norm from unnest(p_norms) as n(norm))
  select fc.id, fc.plate, fc.method, fc.maps_link, fc.checked_at, fc.agent_id, fc.extra
  from norms
  join public.field_checks fc on fc.plate_norm = norms.norm
  where (fc.team is null and fc.agent_id in (select public.my_legacy_sort_agents()))
     or (fc.team is not null and fc.team in (select public.my_sort_teams()))
     or (fc.agent_id = (select auth.uid())
         and exists (select 1 from public.team_members tm where tm.agent_id = (select auth.uid())));
$$;
grant execute on function public.match_group_plates(text[]) to authenticated;

-- «سجلات فلان»: اللي مشيوا وسجلاتهم القديمة تبع المجموعة دي كمان
create or replace function public.my_team_record_authors() returns table (id uuid, username text, is_member boolean)
  language sql stable security definer set search_path = public as $$
  with me as (select p.id, p.team from public.profiles p where p.id = (select auth.uid()))
  select p.id, p.username, true
  from public.team_members tm join public.profiles p on p.id = tm.agent_id, me
  where me.team is not null and tm.team = me.team
  union
  select p.id, p.username, false
  from public.profiles p, me
  where me.team is not null
    and public.my_team_sees_all()
    and (p.id in (select distinct fc.agent_id from public.field_checks fc where fc.team = me.team)
         or p.id in (select l.agent_id from public.agent_legacy_team l where l.team = me.team))
    and not exists (select 1 from public.team_members tm where tm.team = me.team and tm.agent_id = p.id)
$$;
revoke execute on function public.my_team_record_authors() from public, anon;
grant execute on function public.my_team_record_authors() to authenticated;

select 'التصليح تمام' as done;
