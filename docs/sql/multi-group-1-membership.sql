-- ═══════════════════════════════════════════════════════════════════════════
-- 👥 مندوب في أكتر من مجموعة — المرحلة ١ من ٤: **إضافة بس** (المالك ١١ أكتوبر ٢٠٢٦)
-- شغّله مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- ⚠️ المرحلة دي **مابتغيّرش حاجة عند أي حد**: مين بيشوف إيه لسه بالدوال الحالية زي ما هي.
-- اللي بيتعمل:
--   (١) جدول العضوية `team_members` (مندوب + مجموعة) — وكل اللي في مجموعة دلوقتي بيتنقل له.
--   (٢) ختم المجموعة على كل سجل جديد (`field_checks.team` / `chassis_records.team`).
--   (٣) لحد المرحلة ٤: العضوية = `profiles.team` بالظبط (الإضافة لمجموعة بتنقل زي دلوقتي). ولما مندوب
--       يسيب مجموعة، سجلاته اللي لسه من غير ختم بتتختم بيها — قرار المالك: «يفضلو في صب بيز تحت اسمه»
--       للمجموعة دي.
--   (٤) صورة «مين بيشوف مين» لكل مندوب دلوقتي — المرحلة ٢ بتقارن بيها (لازم تطلع زيها بالظبط).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (١) جدول العضوية ─────────────────────────────────────────────────────────
create table if not exists public.team_members (
  team      text not null,
  agent_id  uuid not null references public.profiles(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (team, agent_id)
);
create index if not exists team_members_agent_idx on public.team_members(agent_id);

alter table public.team_members enable row level security;
-- المندوب يقرا عضوياته هو بس. الكتابة من السيرفر بس (مفتاح الخدمة) — مافيش سياسة كتابة بقصد.
drop policy if exists "read own memberships" on public.team_members;
create policy "read own memberships" on public.team_members for select to authenticated
  using (agent_id = (select auth.uid()));
grant select on public.team_members to authenticated;   -- Supabase بطّلت المنح التلقائي للجداول الجديدة

-- كل اللي في مجموعة دلوقتي.
insert into public.team_members (team, agent_id)
select p.team, p.id from public.profiles p where p.team is not null
on conflict do nothing;

-- ── (٢) ختم المجموعة على السجلات الجديدة ─────────────────────────────────────
-- عمود من غير قيمة افتراضية = إضافة فورية (مابيلفّش على الصفوف). القديم بيفضل من غير ختم لحد ما صاحبه
-- يسيب مجموعته (تحت) — فمافيش تحديث ضخم على الجدول.
alter table public.field_checks    add column if not exists team text;
alter table public.chassis_records add column if not exists team text;

-- السجل الجديد من غير مجموعة (أي نسخة من البرنامج) ⇒ مجموعة صاحبه الحالية.
create or replace function public.stamp_record_team() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.team is null then
    select p.team into new.team from public.profiles p where p.id = new.agent_id;
  end if;
  return new;
end $$;

drop trigger if exists field_checks_stamp_team on public.field_checks;
create trigger field_checks_stamp_team before insert on public.field_checks
  for each row execute function public.stamp_record_team();
drop trigger if exists chassis_records_stamp_team on public.chassis_records;
create trigger chassis_records_stamp_team before insert on public.chassis_records
  for each row execute function public.stamp_record_team();

-- ── (٣) العضوية بتمشي ورا profiles.team (لحد المرحلة ٤) ──────────────────────
create or replace function public.sync_team_membership() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  old_team text := case when tg_op = 'UPDATE' then old.team else null end;
begin
  if tg_op = 'UPDATE' and old_team is not distinct from new.team then return new; end if;
  if old_team is not null then
    -- الشغل اللي عمله للمجموعة دي بيفضل لها (بيتختم قبل ما يمشي).
    update public.field_checks    set team = old_team where agent_id = new.id and team is null;
    update public.chassis_records set team = old_team where agent_id = new.id and team is null;
    delete from public.team_members where agent_id = new.id and team = old_team;
  end if;
  if new.team is not null then
    insert into public.team_members (team, agent_id) values (new.team, new.id) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists profiles_sync_team_membership on public.profiles;
create trigger profiles_sync_team_membership after insert or update of team on public.profiles
  for each row execute function public.sync_team_membership();

-- ── (٤) صورة «مين بيشوف سجلات مين» لكل مندوب في مجموعة — للمقارنة في المرحلة ٢ ─────
create table if not exists public.group_isolation_baseline (
  agent_id     uuid primary key,
  team         text,
  visible_ids  uuid[] not null,
  taken_at     timestamptz not null default now()
);
alter table public.group_isolation_baseline enable row level security;   -- مافيش سياسات ⇒ مقفول على التطبيق

do $$
declare
  r   record;
  ids uuid[];
begin
  for r in select id, team from public.profiles where team is not null loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
    select coalesce(array_agg(x order by x), '{}') into ids from public.my_team_member_ids() as x;
    insert into public.group_isolation_baseline (agent_id, team, visible_ids) values (r.id, r.team, ids)
      on conflict (agent_id) do update set team = excluded.team, visible_ids = excluded.visible_ids, taken_at = now();
  end loop;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- ── (٥) للتأكد: التلاتة لازم يطلعوا زي بعض (أول مرة تشغّله) ─────────────────────────────────────
select
  (select count(*) from public.profiles where team is not null) as agents_in_groups,
  (select count(*) from public.team_members)                   as memberships,
  (select count(*) from public.group_isolation_baseline)       as baseline_rows;
