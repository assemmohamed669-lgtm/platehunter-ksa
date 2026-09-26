-- ═══════════════════════════════════════════════════════════════════════════
-- نشاط المجموعة اليومي — مسئول المجموعة يشوف مين نزل كل يوم، بدأ الساعة كام،
-- آخر تسجيل الساعة كام، وكام سيارة سجّل. من سجلات التشييك المتزامنة (field_checks).
--
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- • التقرير **للمسئول بس** (leader_id بتاع المجموعة) أو أدمن في المجموعة.
--   أي حد تاني بيرجّع صفر صفوف.
-- • الأيام والساعات بتوقيت السعودية (Asia/Riyadh).
-- ═══════════════════════════════════════════════════════════════════════════

-- فهرس بيسرّع التجميع بالمندوب + الوقت (لو مش موجود من group-records).
create index if not exists field_checks_agent_checked_idx
  on public.field_checks(agent_id, checked_at desc);

create or replace function public.my_team_daily_activity(p_days int default 14)
returns table (
  agent_id uuid,
  username  text,
  day       date,
  cars      bigint,
  first_at  timestamptz,
  last_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with lead as (
    select g.leader_id from public.group_settings g where g.team = public.my_team()
  )
  select
    fc.agent_id,
    coalesce(p.username, '؟') as username,
    (fc.checked_at at time zone 'Asia/Riyadh')::date as day,
    count(*)        as cars,
    min(fc.checked_at) as first_at,
    max(fc.checked_at) as last_at
  from public.field_checks fc
  join public.profiles p on p.id = fc.agent_id
  where
    -- المسئول بتاع المجموعة، أو أدمن جوّه المجموعة — غير كده صفر صفوف.
    ( (select leader_id from lead) = (select auth.uid()) or public.is_group_admin() )
    and fc.agent_id in (select public.my_team_member_ids())
    and fc.checked_at >= (now() - make_interval(days => greatest(p_days, 1)))
  group by fc.agent_id, p.username, (fc.checked_at at time zone 'Asia/Riyadh')::date
  order by day desc, cars desc;
$$;

grant execute on function public.my_team_daily_activity(int) to authenticated;
revoke execute on function public.my_team_daily_activity(int) from anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- بعد التشغيل: المسئول بيفتح «نشاط المجموعة» في التطبيق ويشوف كل يوم بتفاصيله.
-- ═══════════════════════════════════════════════════════════════════════════
