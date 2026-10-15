-- 🧭 سجل شغل الأعضاء لمسئول المجموعة — الفرز + فتح موقع عربية + مشاركة النتيجة (ومكان العضو ساعتها).
-- المالك (١٥ أكتوبر ٢٠٢٦): «زر … من خلاله يعرف مسئول المجموعه اي وقت كل عضو في المجموعه عمل فرز ولا لا … لما يفتحها
-- … يعرف انه اتحرك علي السيارة دي وفتح موقعها في الوقت دة ولما يشارك صورة او ملف اكسيل … يعرف مكان الشخص دة فين».
-- قراره: السجل بيتخزّن ٧ أيام بس.
--
-- • العضو بيسجّل شغله هو بس (insert)، وماحدّش بيقرا الجدول مباشرة.
-- • المسئول بيقرا أعضاء مجموعته بس من team_agent_events(team) — السوبر أدمن/أدمن المجموعة كمان (is_group_admin).
-- • الأقدم من ٧ أيام بيتمسح لوحده مع كل تسجيل جديد للعضو نفسه (بالفهرس — خفيف).
-- آمن تشغّله أكتر من مرة. ⚠️ الجدول جديد ⇒ الصلاحيات (grant) مكتوبة صريحة تحت.

create table if not exists public.agent_events (
  id bigint generated always as identity primary key,
  agent_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  team text,
  kind text not null check (kind in ('sort', 'open_location', 'share')),
  at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  lat double precision,
  lng double precision
);
create index if not exists agent_events_agent_at_idx on public.agent_events (agent_id, at desc);
create index if not exists agent_events_team_at_idx on public.agent_events (team, at desc);

alter table public.agent_events enable row level security;
drop policy if exists agent_events_insert_own on public.agent_events;
create policy agent_events_insert_own on public.agent_events for insert to authenticated
  with check (
    agent_id = (select auth.uid())
    and at > now() - interval '1 day' and at < now() + interval '10 minutes'   -- المؤجّل من غير نت لحد يوم
    and pg_column_size(details) < 4000
  );

revoke all on public.agent_events from anon;
grant insert on public.agent_events to authenticated;

-- 🧹 أقدم من ٧ أيام ⇒ يتمسح (للعضو نفسه بس، مع كل تسجيل جديد)
create or replace function public.agent_events_trim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.agent_events where agent_id = new.agent_id and at < now() - interval '7 days';
  return new;
end $$;
drop trigger if exists agent_events_trim on public.agent_events;
create trigger agent_events_trim after insert on public.agent_events
  for each row execute function public.agent_events_trim();

-- 📋 شغل أعضاء مجموعة (للمسئول بتاعها بس) — آخر ٧ أيام
create or replace function public.team_agent_events(p_team text, p_days int default 7)
returns table (id bigint, agent_id uuid, username text, kind text, at timestamptz, details jsonb, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select e.id, e.agent_id, coalesce(p.username, '؟'), e.kind, e.at, e.details, e.lat, e.lng
  from public.agent_events e
  join public.profiles p on p.id = e.agent_id
  where ( exists (select 1 from public.group_settings g where g.team = p_team and g.leader_id = (select auth.uid()))
          or public.is_group_admin() )
    and e.agent_id in (select tm.agent_id from public.team_members tm where tm.team = p_team)
    and (e.team is null or e.team = p_team)
    and e.at >= now() - make_interval(days => least(greatest(p_days, 1), 7))
  order by e.at desc
  limit 3000;
$$;
revoke execute on function public.team_agent_events(text, int) from public, anon;
grant execute on function public.team_agent_events(text, int) to authenticated;

select 'سجل شغل الأعضاء تمام' as done;
