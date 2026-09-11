-- ═══════════════════════════════════════════════════════════════════════════
-- مجموعات المناديب: مندوب يلاقي سيارة مطلوبة → إشعار لحظي لباقي مجموعته.
-- شغّل الملف ده مرة واحدة على Supabase (SQL editor). آمن لو اتشغّل مرتين.
--
-- • كل مندوب ليه «مجموعة» (team) — الأدمن بيحدّدها من صفحة المندوب.
-- • لما مندوب يلاقي لوحة مطلوبة، التطبيق بيسجّل صف في group_finds، وباقي
--   المجموعة (نفس team) بيوصلهم الصف لحظيًا عبر Realtime → إشعار بالبيانات.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists team text;

create table if not exists public.group_finds (
  id          uuid primary key default gen_random_uuid(),
  team        text not null,
  finder_id   uuid not null references public.profiles(id) on delete cascade,
  finder_name text,
  plate       text not null,
  info        jsonb,                 -- بيانات اللوحة [مفتاح، قيمة]
  maps_link   text,                  -- رابط موقع اللي لقاها (لو متاح)
  created_at  timestamptz not null default now()
);
create index if not exists group_finds_team_idx on public.group_finds(team, created_at desc);

alter table public.group_finds enable row level security;

-- المندوب يقرا لقطات مجموعته بس.
drop policy if exists "read own team finds" on public.group_finds;
create policy "read own team finds" on public.group_finds for select to authenticated
  using (team is not null and team = (select p.team from public.profiles p where p.id = auth.uid()));

-- المندوب يكتب لقطته هو في مجموعته بس.
drop policy if exists "insert own finds" on public.group_finds;
create policy "insert own finds" on public.group_finds for insert to authenticated
  with check (finder_id = auth.uid() and team = (select p.team from public.profiles p where p.id = auth.uid()));

-- تفعيل Realtime على الجدول (زي profiles). آمن لو اتضاف قبل كده.
do $$ begin
  alter publication supabase_realtime add table public.group_finds;
exception when duplicate_object then null;
end $$;
