-- ═══════════════════════════════════════════════════════════════════════════
-- 👥 مندوب في أكتر من مجموعة — المرحلة ٤ من ٤: «ضيفه كمان» (المالك ١١ أكتوبر ٢٠٢٦)
-- محتاج المراحل ١ و٢ و٣. شغّله **بعد** ما نسخة البرنامج الجديدة تنزل. آمن لو اتشغّل مرتين.
--
--   (١) `add_agent_to_team` — يضيف المندوب لمجموعة **من غير ما يشيله** من اللي هو فيها. قبلها شغله اللي من غير
--       ختم بيتختم بمجموعته الحالية — عشان المجموعة الجديدة ماتشوفش شغله القديم (الاختبار مسكها في المرحلة ٢).
--   (٢) `remove_agent_from_team` — يشيله من مجموعة واحدة بس (التانية زي ما هي).
--   (٣) قرار المالك: «لو مقفوله عنه السجلات دي متروحش معاه ابدا» ⇒ لما يسيب مجموعة كانت قافلة عليه السجلات،
--       بتتسجّل في `agent_hidden_record_teams` والبرنامج بيخبّي سجلاتها من على جهازه.
--   النقل (`move_agent_team`) بقى بيعمل (٣) كمان.
-- كله للسيرفر بس (صفحة المجموعات بمفتاح الخدمة).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (٣) المجموعات اللي سجلاتها مستخبية عن المندوب (سابها وهي قافلة عليه السجلات) ─────────────
create table if not exists public.agent_hidden_record_teams (
  agent_id   uuid not null references public.profiles(id) on delete cascade,
  team       text not null,
  hidden_at  timestamptz not null default now(),
  primary key (agent_id, team)
);
alter table public.agent_hidden_record_teams enable row level security;
drop policy if exists "read own hidden teams" on public.agent_hidden_record_teams;
create policy "read own hidden teams" on public.agent_hidden_record_teams for select to authenticated
  using (agent_id = (select auth.uid()));
grant select on public.agent_hidden_record_teams to authenticated;   -- Supabase بطّلت المنح التلقائي

-- السجلات مقفولة على المندوب ده في المجموعة دي؟ (عضو مش مسئول ومش أدمن + المفتاح مفتوح)
create or replace function public.records_locked_for(p_agent uuid, p_team text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select g.lock_member_records and g.leader_id is not null and g.leader_id <> p_agent
    from public.group_settings g where g.team = p_team
  ), false)
  and coalesce((select p.role <> 'admin' from public.profiles p where p.id = p_agent), true)
$$;
revoke execute on function public.records_locked_for(uuid, text) from public, anon, authenticated;

-- يسيب مجموعة واحدة: شغله اللي من غير ختم بيتختم بيها، ولو كانت قافلة عليه السجلات بتستخبى عنه.
create or replace function public.leave_team_internal(p_agent uuid, p_team text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update public.field_checks    set team = p_team where agent_id = p_agent and team is null;
  update public.chassis_records set team = p_team where agent_id = p_agent and team is null;
  if public.records_locked_for(p_agent, p_team) then
    insert into public.agent_hidden_record_teams (agent_id, team) values (p_agent, p_team) on conflict do nothing;
  end if;
  delete from public.team_members where agent_id = p_agent and team = p_team;
end $$;
revoke execute on function public.leave_team_internal(uuid, text) from public, anon, authenticated;

-- ── النقل (زي المرحلة ٣ بالظبط + (٣)) ───────────────────────────────────────────────────
create or replace function public.move_agent_team(p_agent uuid, p_team text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  target text := nullif(btrim(coalesce(p_team, '')), '');
  t      record;
begin
  for t in select tm.team from public.team_members tm where tm.agent_id = p_agent and tm.team is distinct from target loop
    perform public.leave_team_internal(p_agent, t.team);
  end loop;
  update public.profiles set team = target where id = p_agent;
  if target is not null then
    insert into public.team_members (team, agent_id) values (target, p_agent) on conflict do nothing;
    delete from public.agent_hidden_record_teams where agent_id = p_agent and team = target;
  end if;
end $$;
revoke execute on function public.move_agent_team(uuid, text) from public, anon, authenticated;
grant execute on function public.move_agent_team(uuid, text) to service_role;

-- ── (١) «ضيفه كمان» ──────────────────────────────────────────────────────────────────────
create or replace function public.add_agent_to_team(p_agent uuid, p_team text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  target text := nullif(btrim(coalesce(p_team, '')), '');
  cur    text;
begin
  if target is null then return; end if;
  select p.team into cur from public.profiles p where p.id = p_agent;
  if cur is not null and cur <> target then
    -- شغله القديم (من غير ختم) بتاع مجموعته الحالية — مايروحش للجديدة
    update public.field_checks    set team = cur where agent_id = p_agent and team is null;
    update public.chassis_records set team = cur where agent_id = p_agent and team is null;
  end if;
  insert into public.team_members (team, agent_id) values (target, p_agent) on conflict do nothing;
  delete from public.agent_hidden_record_teams where agent_id = p_agent and team = target;
  if cur is null then
    update public.profiles set team = target where id = p_agent;   -- ماكانش في مجموعة ⇒ دي بقت مجموعته
  end if;
end $$;
revoke execute on function public.add_agent_to_team(uuid, text) from public, anon, authenticated;
grant execute on function public.add_agent_to_team(uuid, text) to service_role;

-- ── (٢) يشيله من مجموعة واحدة بس ────────────────────────────────────────────────────────
create or replace function public.remove_agent_from_team(p_agent uuid, p_team text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform public.leave_team_internal(p_agent, p_team);
  -- كانت المجموعة اللي شغّال لها ⇒ يبقى شغّال لأقدم مجموعة لسه فيها (أو من غير مجموعة)
  if (select p.team from public.profiles p where p.id = p_agent) = p_team then
    update public.profiles set team = (
      select tm.team from public.team_members tm where tm.agent_id = p_agent order by tm.added_at, tm.team limit 1
    ) where id = p_agent;
  end if;
end $$;
revoke execute on function public.remove_agent_from_team(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_agent_from_team(uuid, text) to service_role;

select 'المرحلة ٤ تمام' as done;
