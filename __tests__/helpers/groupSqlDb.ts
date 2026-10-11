/**
 * 🧪 قاعدة بيانات Postgres حقيقية جوّه الاختبار (PGlite) — نسخة مصغّرة من جداول ودوال وسياسات المجموعات اللي
 * شغّالة على Supabase دلوقتي، عشان أي تعديل في SQL المجموعات يتجرّب على مجموعتين قبل ما المالك يشغّله.
 *
 * الأساس = الجداول + `my_team()` + السياسات (group-fix / group-share-records)، وبعدين **ملف**
 * `docs/sql/group-member-locks.sql` نفسه (آخر نسخة من `my_team_member_ids` وسياسة `group_finds`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const sqlFile = (name: string) => readFileSync(path.resolve(__dirname, "../../docs/sql", name), "utf8");

const BASE = `
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'sub', '')::uuid
$$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
grant usage on schema auth, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

create table public.profiles (
  id uuid primary key, username text, team text,
  role text not null default 'agent', is_super boolean not null default false
);
create table public.group_settings (
  team text primary key,
  notify_enabled boolean not null default true,
  share_records_enabled boolean not null default true,
  leader_id uuid, shared_data_enabled boolean not null default false,
  shared_check_enabled boolean not null default false, activity_report_enabled boolean not null default false,
  updated_at timestamptz default now(), updated_by uuid
);
create table public.field_checks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  plate text not null, checked_at timestamptz not null default now(), extra jsonb
);
create table public.chassis_records (
  local_id text primary key,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  vin text
);
create table public.group_finds (
  id uuid primary key default gen_random_uuid(), team text not null,
  finder_id uuid not null references public.profiles(id) on delete cascade,
  finder_name text, plate text not null, info jsonb, maps_link text,
  created_at timestamptz not null default now()
);

create or replace function public.my_team() returns text
  language sql stable security definer set search_path = public as $$
  select team from public.profiles where id = auth.uid()
$$;
grant execute on function public.my_team() to authenticated;

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
alter table public.group_settings enable row level security;
create policy "read own team settings" on public.group_settings for select to authenticated using (team = public.my_team());
alter table public.field_checks enable row level security;
create policy "own field_checks" on public.field_checks for select to authenticated using (agent_id = (select auth.uid()));
create policy "insert own field_checks" on public.field_checks for insert to authenticated with check (agent_id = (select auth.uid()));
alter table public.chassis_records enable row level security;
create policy "own chassis" on public.chassis_records for select to authenticated using (agent_id = (select auth.uid()));
alter table public.group_finds enable row level security;
create policy "insert own finds" on public.group_finds for insert to authenticated
  with check (finder_id = auth.uid() and team = (select p.team from public.profiles p where p.id = auth.uid()));

grant select on public.profiles, public.group_settings, public.group_finds to authenticated;
grant select, insert on public.field_checks, public.chassis_records to authenticated;
grant insert on public.group_finds to authenticated;
`;

// سياسات قراءة سجلات الزمايل (group-share-records.sql) — بتعتمد على my_team_member_ids اللي بييجي من الملف بعدها.
const TEAM_READ = `
create policy "read team field_checks" on public.field_checks for select to authenticated
  using (agent_id in (select public.my_team_member_ids()));
create policy "read team chassis" on public.chassis_records for select to authenticated
  using (agent_id in (select public.my_team_member_ids()));
`;

/** قاعدة بيانات زي اللي على Supabase النهارده (قبل مراحل «أكتر من مجموعة»). */
export async function makeGroupDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(sqlFile("group-member-locks.sql"));
  await db.exec(TEAM_READ);
  return db;
}

/** يشغّل استعلام **كأنه المندوب ده** من التطبيق (دور authenticated + جلسته) — قواعد الحماية بتتطبّق. */
export async function asUser<T = Record<string, unknown>>(db: PGlite, uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await db.exec("set local role authenticated");
    const r = await db.query<T>(sql, params);
    return r.rows;
  } finally {
    await db.exec("rollback");
  }
}

/** مين المندوب ده بيشوف سجلاته (نتيجة my_team_member_ids كأنه هو) — مترتّبة. */
export async function visibleIds(db: PGlite, uid: string): Promise<string[]> {
  const rows = await asUser<{ x: string }>(db, uid, "select x from public.my_team_member_ids() as x order by x");
  return rows.map((r) => r.x);
}

/** كام سجل المندوب ده بيشوفه فعلاً من خلال قواعد الحماية. */
export async function visibleRecordCount(db: PGlite, uid: string): Promise<number> {
  const rows = await asUser<{ c: number }>(db, uid, "select count(*)::int as c from public.field_checks");
  return rows[0]?.c ?? 0;
}

export const U = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
