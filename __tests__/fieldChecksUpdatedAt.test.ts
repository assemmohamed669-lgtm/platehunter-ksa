import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { sqlFile } from "./helpers/groupSqlDb";

/**
 * 🕐 `docs/sql/field-checks-updated-at.sql` على Postgres حقيقي — المالك (١٣ أكتوبر ٢٠٢٦): «السيرفر يعلّم وقت آخر تعديل
 * لكل سجل، والموبايل ينزّل التعديلات الجديدة بس». الختم بيحصل **للتعديل الحقيقي بس**.
 */
const SCHEMA = `
create or replace function public.norm_plate(p text) returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '\\s+', '', 'g')
$$;
create table public.field_checks (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique, agent_id uuid not null, plate text not null, method text,
  lat double precision, lng double precision, maps_link text, extra jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(), created_at timestamptz not null default now(),
  synced_at timestamptz, team text,
  plate_norm text generated always as (public.norm_plate(plate)) stored
);
create or replace function public.keep_record_team() returns trigger language plpgsql set search_path = public as $$
begin if new.team is null and old.team is not null then new.team := old.team; end if; return new; end $$;
create trigger field_checks_keep_team before update on public.field_checks for each row execute function public.keep_record_team();
`;
async function upsert(db: PGlite, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const set = cols.filter((c) => c !== "local_id").map((c) => `${c} = excluded.${c}`).join(", ");
  await db.query(
    `insert into public.field_checks (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) on conflict (local_id) do update set ${set}`,
    cols.map((c) => (c === "extra" ? JSON.stringify(row[c]) : row[c])),
  );
}
const base = () => ({ local_id: "fc-1", agent_id: "00000000-0000-0000-0000-000000000001", plate: "ا ب ح 1234", method: "صوت", extra: { "النوع": "ملاكي" }, checked_at: "2026-10-12T09:15:00Z" });
const get = async (db: PGlite) => (await db.query<{ v: string; u: string | null; team: string | null }>(
  "select xmin::text v, updated_at::text u, team from public.field_checks where local_id = 'fc-1'")).rows[0];

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(sqlFile("field-checks-skip-unchanged.sql"));
  await db.exec(sqlFile("field-checks-updated-at.sql"));
  await upsert(db, base());
});

describe("🕐 وقت آخر تعديل", () => {
  it("🔴 السجل الجديد مابيتختمش (مش تعديل)", async () => {
    expect((await get(db)).u).toBeNull();
  });
  it("🔴 الرفع المتكرر بنفس البيانات ⇒ لا كتابة ولا ختم", async () => {
    const before = await get(db);
    await upsert(db, base());
    const after = await get(db);
    expect(after.v).toBe(before.v);
    expect(after.u).toBeNull();
  });
  it("🔴 تعديل حقيقي ⇒ بيتختم — والرفع المتكرر بعده مابيغيّرش الختم", async () => {
    await upsert(db, { ...base(), extra: { "النوع": "نقل" } });
    const edited = await get(db);
    expect(edited.u).not.toBeNull();
    await upsert(db, { ...base(), extra: { "النوع": "نقل" } });
    const again = await get(db);
    expect(again.v).toBe(edited.v);
    expect(again.u).toBe(edited.u);
  });
  it("🔴 التعديل من صفحة سجلات المجموعة (update) بيتختم", async () => {
    await db.query(`update public.field_checks set extra = '{"النوع":"أجرة"}'::jsonb where local_id = 'fc-1'`);
    expect((await get(db)).u).not.toBeNull();
  });
  it("ختم المجموعة بيفضل", async () => {
    await db.query("update public.field_checks set team = 'G'");
    await upsert(db, base());
    expect((await get(db)).team).toBe("G");
  });
  it("آمن لو اتشغّل مرتين، والترتيب: «نفس البيانات» قبل الختم", async () => {
    await db.exec(sqlFile("field-checks-updated-at.sql"));
    const t = await db.query<{ tgname: string }>(
      "select tgname from pg_trigger where tgrelid = 'public.field_checks'::regclass and not tgisinternal order by tgname");
    expect(t.rows.map((r) => r.tgname)).toEqual(["field_checks_keep_team", "zz_field_checks_skip_unchanged", "zzz_field_checks_touch_updated"]);
  });
  it("ملف الفهرس سليم", async () => {
    const idx = sqlFile("field-checks-updated-at-index.sql");
    expect(idx).toMatch(/create index concurrently if not exists field_checks_agent_updated_idx/);
    await db.exec(idx.replace(" concurrently", ""));   // PGlite مابيدعمش concurrently — نفس التعريف
    const r = await db.query<{ c: number }>("select count(*)::int c from pg_indexes where indexname = 'field_checks_agent_updated_idx'");
    expect(r.rows[0].c).toBe(1);
  });
});
