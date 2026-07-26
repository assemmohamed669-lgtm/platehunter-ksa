-- جدول سجلات تشييك الشاصي (شيت رقم الشاص) — نسخة سحابية زي field_checks بالظبط.
-- الهدف: سجلات الشاص ما تفضلش محلية بس (localStorage) — تتزامن للسيرفر مربوطة
-- بالمندوب (agent_id) عشان تترجع على أي جهاز ومتضيعش لو التخزين المحلي اتمسح.
-- شغّله مرة واحدة في: Supabase → SQL Editor.

create table if not exists public.chassis_records (
  local_id      text primary key,                 -- ChassisRecord.id (فريد لكل سجل)
  agent_id      uuid not null references auth.users(id) on delete cascade,
  chassis       text not null,                     -- رقم الشاص المطبّع
  vehicle_type  text,
  notes         text,
  region        text,
  found         boolean default false,             -- مطلوب؟
  lat           double precision,
  lng           double precision,
  maps_link     text,
  extra         jsonb default '{}'::jsonb,          -- بيانات السيارة المطابقة (الصف)
  checked_at    timestamptz not null default now() -- تاريخ التشييك
);

create index if not exists chassis_records_agent_idx on public.chassis_records(agent_id);

alter table public.chassis_records enable row level security;

-- المندوب يقرا/يكتب/يعدّل سجلاته هو بس (نفس سياسة سجلات اللوحات).
drop policy if exists chassis_records_own on public.chassis_records;
create policy chassis_records_own on public.chassis_records
  for all to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());
