-- ═══════════════════════════════════════════════════════════════════════════
-- 👥 مندوب في أكتر من مجموعة — المرحلة ٣ من ٤: «شغّال لـ» + النقل من السيرفر (المالك ١١ أكتوبر ٢٠٢٦)
-- محتاج المرحلتين ١ و٢. شغّله **بعد** ما نسخة البرنامج الجديدة تنزل. آمن لو اتشغّل مرتين.
--
-- ⚠️ لسه مفيش مندوب في مجموعتين (ده المرحلة ٤) ⇒ ولا حاجة بتتغيّر عند حد:
--   (١) profiles.team بقت «المجموعة اللي شغّال لها» — تغييرها مابقاش بيشيل عضوية (عشان يقدر يقلب بين مجموعاته).
--   (٢) النقل/الشيل من صفحة المجموعات بقى دالة على السيرفر `move_agent_team` (نفس اللي كان بيحصل بالظبط:
--       شغله اللي من غير ختم بيتختم بالمجموعة اللي سابها، وعضويته بتتشال، ويتحط في الجديدة).
--   (٣) `set_my_active_team` — المندوب يقلب لمجموعة **هو عضو فيها** بس.
--   (٤) ختم المجموعة مايتمسحش أبداً بإعادة رفع سجل (حتى من نسخة قديمة).
--   (٥) `my_team_record_authors` — أسامي كل اللي ليهم شغل في المجموعة (حتى اللي مشيوا) لفلتر «سجلات فلان».
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) العضوية مابقتش بتمشي ورا profiles.team — بس لازم يبقى عضو في المجموعة اللي شغّال لها ─────────
create or replace function public.sync_team_membership() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.team is not null then
    insert into public.team_members (team, agent_id) values (new.team, new.id) on conflict do nothing;
  end if;
  return new;
end $$;

-- ── (٢) النقل/الشيل (صفحة المجموعات — السيرفر بمفتاح الخدمة بس) ───────────────────────────────
create or replace function public.move_agent_team(p_agent uuid, p_team text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  target text := nullif(btrim(coalesce(p_team, '')), '');
  t      record;
begin
  for t in select tm.team from public.team_members tm where tm.agent_id = p_agent and tm.team is distinct from target loop
    -- الشغل اللي عمله للمجموعة دي بيفضل لها (قرار المالك)
    update public.field_checks    set team = t.team where agent_id = p_agent and team is null;
    update public.chassis_records set team = t.team where agent_id = p_agent and team is null;
    delete from public.team_members where agent_id = p_agent and team = t.team;
  end loop;
  update public.profiles set team = target where id = p_agent;
  if target is not null then
    insert into public.team_members (team, agent_id) values (target, p_agent) on conflict do nothing;
  end if;
end $$;
revoke execute on function public.move_agent_team(uuid, text) from public, anon, authenticated;
grant execute on function public.move_agent_team(uuid, text) to service_role;

-- ── (٣) «شغّال لـ» — المندوب يقلب لمجموعة هو عضو فيها بس ─────────────────────────────────────
create or replace function public.set_my_active_team(p_team text) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.team_members where agent_id = (select auth.uid()) and team = p_team) then
    return false;
  end if;
  update public.profiles set team = p_team where id = (select auth.uid());
  return true;
end $$;
revoke execute on function public.set_my_active_team(text) from public, anon;
grant execute on function public.set_my_active_team(text) to authenticated;

-- ── (٤) الختم مايتمسحش بإعادة رفع ─────────────────────────────────────────────────────────────
create or replace function public.keep_record_team() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.team is null and old.team is not null then new.team := old.team; end if;
  return new;
end $$;
drop trigger if exists field_checks_keep_team on public.field_checks;
create trigger field_checks_keep_team before update on public.field_checks
  for each row execute function public.keep_record_team();
drop trigger if exists chassis_records_keep_team on public.chassis_records;
create trigger chassis_records_keep_team before update on public.chassis_records
  for each row execute function public.keep_record_team();

-- ── (٥) أسامي اللي ليهم شغل في مجموعتي الحالية — الأعضاء دايماً، واللي مشيوا للي بيشوف الكل ────────
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
    and p.id in (select distinct fc.agent_id from public.field_checks fc where fc.team = me.team)
    and not exists (select 1 from public.team_members tm where tm.team = me.team and tm.agent_id = p.id)
$$;
revoke execute on function public.my_team_record_authors() from public, anon;
grant execute on function public.my_team_record_authors() to authenticated;

select 'المرحلة ٣ تمام' as done;
