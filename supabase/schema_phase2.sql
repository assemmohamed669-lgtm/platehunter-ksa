-- =====================================================================
-- PlateHunter KSA — Phase 2 schema additions
-- Run this in the Supabase SQL editor AFTER schema.sql (Phase 1)
-- =====================================================================

-- ---------------------------------------------------------------------
-- recordings table — one row per field entry
-- ---------------------------------------------------------------------
create table if not exists public.recordings (
  id          uuid primary key default gen_random_uuid(),
  local_id    text unique not null,        -- IndexedDB dedup key
  agent_id    uuid references auth.users(id) not null,
  plate       text not null,               -- joined, no spaces e.g. أبح1234
  vehicle_type text,                       -- ونيت / فان / دباب / مصدومة
  lat         double precision,
  lng         double precision,
  street      text,
  district    text,
  maps_link   text,
  recorded_at timestamptz not null,
  synced_at   timestamptz default now(),
  created_at  timestamptz default now()
);

alter table public.recordings enable row level security;

-- Agents can only read/write their own recordings
create policy "recordings_agent_select"
  on public.recordings for select
  using (auth.uid() = agent_id);

create policy "recordings_agent_insert"
  on public.recordings for insert
  with check (auth.uid() = agent_id);

create policy "recordings_agent_update"
  on public.recordings for update
  using (auth.uid() = agent_id);

create policy "recordings_agent_delete"
  on public.recordings for delete
  using (auth.uid() = agent_id);

-- Admins can see all recordings
create policy "recordings_admin_select"
  on public.recordings for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Index for fast agent + date queries
create index if not exists recordings_agent_date
  on public.recordings (agent_id, recorded_at desc);

-- Enable realtime on recordings table
alter publication supabase_realtime add table public.recordings;
