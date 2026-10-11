-- ═══════════════════════════════════════════════════════════════════════════
-- 👥 مندوب في أكتر من مجموعة — المرحلة ٢ من ٤: قواعد السيرفر بتقرا من جدول العضوية (المالك ١١ أكتوبر ٢٠٢٦)
-- محتاج المرحلة ١ (multi-group-1-membership.sql) تكون اتشغّلت. شغّله مرة واحدة. آمن لو اتشغّل مرتين.
-- للرجوع: multi-group-2-rollback.sql
--
-- ⚠️ لكل مندوب في مجموعة واحدة (كل المناديب دلوقتي) النتيجة **هي هي بالظبط** — آخر الملف بيقارن بالصورة اللي
--    اتاخدت في المرحلة ١ وبيطلّع عدد الفروق (لازم صفر).
-- اللي بيتغيّر:
--   • «مين أعضاء مجموعتي» = من team_members (مش من خانة المجموعة في ملف المندوب).
--   • سجل **مختوم** بمجموعة ⇒ بيتشاف في مجموعته بس (حتى لو صاحبه سابها — قرار المالك)، بنفس قواعد المشاركة/
--     «للمسئول بس». السجل القديم (من غير ختم) ⇒ زي دلوقتي بالظبط.
--   • لقطات المطلوب وإعدادات المجموعة ⇒ لكل مجموعة المندوب عضو فيها.
-- المجموعة اللي «شغّال لها» لسه = profiles.team (my_team()) — سجلات/فرز/تقرير المجموعة بتاعتها بس، فمفيش خلط.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) أشوف سجلات باقي مجموعتي الحالية؟ — نفس قواعد group-member-locks.sql بالحرف ──────────
create or replace function public.my_team_sees_all() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when coalesce(g.records_leader_only, false) then (g.leader_id = p.id or p.role = 'admin')
                else coalesce(g.share_records_enabled, true) end
    from public.profiles p
    left join public.group_settings g on g.team = p.team
    where p.id = (select auth.uid()) and p.team is not null
  ), false)
$$;
grant execute on function public.my_team_sees_all() to authenticated;

-- ── (٢) أعضاء مجموعتي الحالية اللي أشوف سجلاتهم (أنا دايماً منهم) ───────────────────────────
create or replace function public.my_team_member_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  with me as (select id, team from public.profiles where id = (select auth.uid()))
  select tm.agent_id
  from public.team_members tm, me
  where me.team is not null
    and tm.team = me.team
    and (tm.agent_id = me.id or public.my_team_sees_all())
  union
  select me.id from me where me.team is not null
$$;
grant execute on function public.my_team_member_ids() to authenticated;

-- أسامي أعضاء مجموعتي الحالية (الاسم والمعرّف بس).
create or replace function public.my_team_members() returns table (id uuid, username text)
  language sql stable security definer set search_path = public as $$
  select p.id, p.username
  from public.team_members tm
  join public.profiles p on p.id = tm.agent_id
  where tm.team = (select team from public.profiles where id = (select auth.uid()))
$$;
grant execute on function public.my_team_members() to authenticated;

-- ── (٣) قراءة سجلات وشاص المجموعة ─────────────────────────────────────────────
-- من غير ختم ⇒ زي دلوقتي (صاحبه من أعضائي). مختوم ⇒ مجموعتي الحالية + بقواعدها. (سجلاتي أنا: سياسة لوحدها.)
drop policy if exists "read team field_checks" on public.field_checks;
create policy "read team field_checks" on public.field_checks for select to authenticated
  using (
    (team is null and agent_id in (select public.my_team_member_ids()))
    or (team is not null and team = (select public.my_team()) and (select public.my_team_sees_all()))
  );

drop policy if exists "read team chassis" on public.chassis_records;
create policy "read team chassis" on public.chassis_records for select to authenticated
  using (
    (team is null and agent_id in (select public.my_team_member_ids()))
    or (team is not null and team = (select public.my_team()) and (select public.my_team_sees_all()))
  );

-- فرز على سجلات المجموعة — نفس القاعدة (وسجلاتي أنا كلها زي دلوقتي).
drop function if exists public.match_group_plates(text[]);
create function public.match_group_plates(p_norms text[])
returns table (id uuid, plate text, method text, maps_link text, checked_at timestamptz, agent_id uuid, extra jsonb)
language sql stable security invoker set search_path = public as $$
  with norms as (select distinct n.norm from unnest(p_norms) as n(norm))
  select fc.id, fc.plate, fc.method, fc.maps_link, fc.checked_at, fc.agent_id, fc.extra
  from norms
  join public.field_checks fc on fc.plate_norm = norms.norm
  where (fc.team is null and fc.agent_id in (select public.my_team_member_ids()))
     or (fc.team is not null and fc.team = (select public.my_team()) and (select public.my_team_sees_all()))
     -- سجلاتي أنا كلها — بس لو أنا في مجموعة (زي دلوقتي بالظبط: من غير مجموعة الفرز ده مابيرجّعش حاجة)
     or (fc.agent_id = (select auth.uid()) and (select public.my_team()) is not null);
$$;
grant execute on function public.match_group_plates(text[]) to authenticated;

-- فهارس للسجلات المختومة (جزئية — الصفوف المختومة بس، فبتتبني بسرعة).
create index if not exists field_checks_team_checked_idx on public.field_checks(team, checked_at desc) where team is not null;
create index if not exists chassis_records_team_idx on public.chassis_records(team) where team is not null;

-- ── (٤) لقطات المطلوب + إعدادات المجموعة ⇒ لكل مجموعة أنا عضو فيها ───────────────────────
drop policy if exists "read own team finds" on public.group_finds;
create policy "read own team finds" on public.group_finds for select to authenticated
  using (
    team in (select tm.team from public.team_members tm where tm.agent_id = (select auth.uid()))
    and (
      not coalesce((select g.finds_leader_only from public.group_settings g where g.team = group_finds.team), false)
      or (select g.leader_id from public.group_settings g where g.team = group_finds.team) = (select auth.uid())
      or finder_id = (select auth.uid())
    )
  );

drop policy if exists "read own team settings" on public.group_settings;
create policy "read own team settings" on public.group_settings for select to authenticated
  using (team in (select tm.team from public.team_members tm where tm.agent_id = (select auth.uid())));

-- ── (٥) المقارنة بصورة المرحلة ١ — لازم الفروق تطلع صفر ─────────────────────────────────
-- عدد سجلات كل (مندوب، مجموعة) مرة واحدة (مسح واحد للجدول) وبعدين الحساب على الملخّص الصغير.
drop table if exists _mg2_counts;
create temp table _mg2_counts as
  select agent_id, team, count(*)::bigint as c from public.field_checks group by agent_id, team;

drop table if exists _mg2_check;
create temp table _mg2_check (
  agent_id uuid, team text, ids_same boolean, old_count bigint, new_count bigint, moved_rows bigint
);

do $$
declare
  b        record;
  new_ids  uuid[];
  sees     boolean;
  old_c    bigint;
  new_c    bigint;
  moved    bigint;
begin
  for b in select bl.agent_id, bl.visible_ids, p.team from public.group_isolation_baseline bl
           join public.profiles p on p.id = bl.agent_id loop
    perform set_config('request.jwt.claims', json_build_object('sub', b.agent_id, 'role', 'authenticated')::text, true);
    select coalesce(array_agg(x order by x), '{}') into new_ids from public.my_team_member_ids() as x;
    sees := public.my_team_sees_all();
    -- قبل: كل سجلات الزمايل اللي كان بيشوفهم (من الصورة)
    select coalesce(sum(c), 0) into old_c from _mg2_counts where agent_id = any(b.visible_ids);
    -- بعد: سجلاته + من غير ختم لزمايله + المختوم بمجموعته (لو بيشوف الكل)
    select coalesce(sum(c), 0) into new_c from _mg2_counts
      where agent_id = b.agent_id
         or (team is null and agent_id = any(new_ids))
         or (team is not null and team = b.team and sees);
    -- سجلات زمايل اتنقلوا بعد المرحلة ١ (مختومة بمجموعة غير مجموعتهم دلوقتي) — فرق متوقّع بقرار المالك
    select coalesce(sum(cn.c), 0) into moved from _mg2_counts cn join public.profiles pp on pp.id = cn.agent_id
      where cn.team is not null and cn.team is distinct from pp.team;
    insert into _mg2_check values (b.agent_id, b.team,
      (select coalesce(array_agg(x order by x), '{}') from unnest(b.visible_ids) as x) = new_ids, old_c, new_c, moved);
  end loop;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

select
  count(*)                                            as agents_checked,
  count(*) filter (where not ids_same)                as members_diff,
  count(*) filter (where old_count <> new_count)      as records_diff,
  max(moved_rows)                                     as moved_rows_expected
from _mg2_check;
