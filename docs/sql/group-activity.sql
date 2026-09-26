-- ═══════════════════════════════════════════════════════════════════════════
-- نشاط المجموعة للمسئول — كله **للمسئول بس** (leader_id) أو أدمن في المجموعة.
--   ① تفاصيل يومية: مين نزل، الساعة كام بدأ/آخر تسجيل، كام سيارة، منهم كام مطلوبة.
--   ② حالة كل مندوب: فاتح دلوقتي ولا لأ + موقعه الحالي + إجمالي اليوم/٧/٣٠ يوم.
--   ③ المطلوب اللي اتلقى (المتصدَّر بس) — لكل لوحة: مين + إمتى + فين.
--
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
-- التوقيت بتوقيت السعودية (Asia/Riyadh). «مطلوبة» = سجل التشييك ليه صف محفظة
-- مطابق (extra كائن غير فاضي)، وكله في field_checks أصلاً = **متصدَّر**.
--
-- يعتمد على: my_team() · my_team_member_ids() · is_group_admin() (اتشغّلوا قبل كده)،
-- وأعمدة profiles: last_seen/last_lat/last_lng/last_loc_at (agent-location-tracking.sql).
-- ═══════════════════════════════════════════════════════════════════════════

create index if not exists field_checks_agent_checked_idx
  on public.field_checks(agent_id, checked_at desc);

-- نضمن أعمدة الموقع/الحضور موجودة (لو agent-location-tracking.sql ماتشغّلش) —
-- من غيرها الـRPC اللي بيقرا last_lat/last_loc_at كان هيقع. آمن لو موجودة أصلاً.
alter table public.profiles
  add column if not exists last_seen   timestamptz,
  add column if not exists last_lat    double precision,
  add column if not exists last_lng    double precision,
  add column if not exists last_loc_at timestamptz;

-- ── ① التفاصيل اليومية (فيها عمود «مطلوبة» الجديد) ─────────────────────────
drop function if exists public.my_team_daily_activity(int);
create function public.my_team_daily_activity(p_days int default 14)
returns table (
  agent_id uuid, username text, day date,
  cars bigint, wanted bigint, first_at timestamptz, last_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with lead as (select g.leader_id from public.group_settings g where g.team = public.my_team())
  select
    fc.agent_id,
    coalesce(p.username, '؟') as username,
    (fc.checked_at at time zone 'Asia/Riyadh')::date as day,
    count(*) as cars,
    count(*) filter (where fc.extra is not null and jsonb_typeof(fc.extra::jsonb) = 'object' and fc.extra::jsonb <> '{}'::jsonb) as wanted,
    min(fc.checked_at) as first_at,
    max(fc.checked_at) as last_at
  from public.field_checks fc
  join public.profiles p on p.id = fc.agent_id
  where ( (select leader_id from lead) = (select auth.uid()) or public.is_group_admin() )
    and fc.agent_id in (select public.my_team_member_ids())
    and fc.checked_at >= (now() - make_interval(days => greatest(p_days, 1)))
  group by fc.agent_id, p.username, (fc.checked_at at time zone 'Asia/Riyadh')::date
  order by day desc, cars desc;
$$;
grant execute on function public.my_team_daily_activity(int) to authenticated;
revoke execute on function public.my_team_daily_activity(int) from anon;

-- ── ② حالة كل مندوب: فاتح دلوقتي + موقعه + إجمالياته ───────────────────────
drop function if exists public.my_team_member_status();
create function public.my_team_member_status()
returns table (
  agent_id uuid, username text,
  last_seen timestamptz, last_lat double precision, last_lng double precision, last_loc_at timestamptz,
  cars_today bigint, cars_7d bigint, cars_30d bigint, wanted_30d bigint, active_days_30d bigint
)
language sql stable security definer set search_path = public
as $$
  with lead as (select g.leader_id from public.group_settings g where g.team = public.my_team()),
  allowed as (select ((select leader_id from lead) = (select auth.uid()) or public.is_group_admin()) as ok),
  members as (
    select p.id, p.username, p.last_seen, p.last_lat, p.last_lng, p.last_loc_at
    from public.profiles p
    where (select ok from allowed) and p.id in (select public.my_team_member_ids())
  ),
  agg as (
    select fc.agent_id,
      count(*) filter (where (fc.checked_at at time zone 'Asia/Riyadh')::date = (now() at time zone 'Asia/Riyadh')::date) as cars_today,
      count(*) filter (where fc.checked_at >= (now() - interval '7 days'))  as cars_7d,
      count(*) as cars_30d,
      count(*) filter (where fc.extra is not null and jsonb_typeof(fc.extra::jsonb) = 'object' and fc.extra::jsonb <> '{}'::jsonb) as wanted_30d,
      count(distinct (fc.checked_at at time zone 'Asia/Riyadh')::date) as active_days_30d
    from public.field_checks fc
    where fc.agent_id in (select id from members) and fc.checked_at >= (now() - interval '30 days')
    group by fc.agent_id
  )
  select m.id, m.username, m.last_seen, m.last_lat, m.last_lng, m.last_loc_at,
    coalesce(a.cars_today, 0), coalesce(a.cars_7d, 0), coalesce(a.cars_30d, 0),
    coalesce(a.wanted_30d, 0), coalesce(a.active_days_30d, 0)
  from members m left join agg a on a.agent_id = m.id
  order by m.last_seen desc nulls last;
$$;
grant execute on function public.my_team_member_status() to authenticated;
revoke execute on function public.my_team_member_status() from anon;

-- ── ③ المطلوب اللي اتلقى (المتصدَّر) — مين + إمتى + فين ─────────────────────
drop function if exists public.my_team_wanted_found(int);
create function public.my_team_wanted_found(p_days int default 30)
returns table (agent_id uuid, username text, plate text, checked_at timestamptz, maps_link text)
language sql stable security definer set search_path = public
as $$
  with lead as (select g.leader_id from public.group_settings g where g.team = public.my_team())
  select fc.agent_id, coalesce(p.username, '؟'), fc.plate, fc.checked_at, fc.maps_link
  from public.field_checks fc
  join public.profiles p on p.id = fc.agent_id
  where ( (select leader_id from lead) = (select auth.uid()) or public.is_group_admin() )
    and fc.agent_id in (select public.my_team_member_ids())
    and fc.extra is not null and jsonb_typeof(fc.extra::jsonb) = 'object' and fc.extra::jsonb <> '{}'::jsonb
    and fc.checked_at >= (now() - make_interval(days => greatest(p_days, 1)))
  order by fc.checked_at desc
  limit 1000;
$$;
grant execute on function public.my_team_wanted_found(int) to authenticated;
revoke execute on function public.my_team_wanted_found(int) from anon;
