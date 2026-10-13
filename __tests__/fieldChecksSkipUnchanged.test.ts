import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { sqlFile } from "./helpers/groupSqlDb";

/**
 * 🧈 `docs/sql/field-checks-skip-unchanged.sql` على Postgres حقيقي (PGlite) — المالك (١٣ أكتوبر ٢٠٢٦): «لو السجل جه
 * بنفس البيانات بالظبط ميتكتبش تاني هو يتضاف اي تعديل اتعمل او مسح المندوب عمله ب ايدو». فحص Supabase: ٢ مليون
 * إعادة كتابة مقابل ٨٧٦ ألف سجل جديد.
 * الجدول هنا بنفس أعمدة الحيّ (docs field_checks DDL + team + plate_norm المحسوب) ونفس تريجر ختم المجموعة.
 */
const SCHEMA = `
create or replace function public.norm_plate(p text) returns text language sql immutable as $$
  select regexp_replace(coalesce(p, ''), '\\s+', '', 'g')
$$;
create table public.field_checks (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  agent_id uuid not null,
  plate text not null,
  method text,
  lat double precision,
  lng double precision,
  maps_link text,
  extra jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  synced_at timestamptz,
  team text,
  plate_norm text generated always as (public.norm_plate(plate)) stored
);
create or replace function public.keep_record_team() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.team is null and old.team is not null then new.team := old.team; end if;
  return new;
end $$;
create trigger field_checks_keep_team before update on public.field_checks
  for each row execute function public.keep_record_team();
`;

/** نفس رفع PostgREST: insert … on conflict (local_id) do update set كل أعمدة الطلب = excluded */
async function upsert(db: PGlite, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const vals = cols.map((_, i) => `$${i + 1}`);
  const set = cols.filter((c) => c !== "local_id").map((c) => `${c} = excluded.${c}`).join(", ");
  await db.query(
    `insert into public.field_checks (${cols.join(", ")}) values (${vals.join(", ")}) on conflict (local_id) do update set ${set}`,
    cols.map((c) => (c === "extra" ? JSON.stringify(row[c]) : row[c])),
  );
}
const A = "00000000-0000-0000-0000-000000000001";
const base = () => ({
  local_id: "fc-ptt-1", agent_id: A, plate: "ا ب ح 1234", method: "صوت", lat: 24.7136, lng: 46.6753,
  maps_link: "https://maps.google.com/?q=24.7136,46.6753", extra: { "الحي": "النسيم", "النوع": "ملاكي" },
  checked_at: "2026-10-12T09:15:00.000Z",
});
const version = async (db: PGlite) =>
  (await db.query<{ v: string; plate: string; n: string; team: string | null; extra: Record<string, string> }>(
    "select xmin::text v, plate, plate_norm n, team, extra from public.field_checks where local_id = 'fc-ptt-1'")).rows[0];

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(sqlFile("field-checks-skip-unchanged.sql"));
  await upsert(db, base());
});

describe("🧈 نفس البيانات بالظبط ⇒ مايتكتبش تاني", () => {
  it("🔴 نفس السجل اترفع تاني (زرار «مزامنة» / رفع متكرر) ⇒ ولا كتابة", async () => {
    const before = await version(db);
    await upsert(db, base());
    await upsert(db, base());
    expect((await version(db)).v).toBe(before.v);
  });
  it("🔴 السيرفر ختم المجموعة والموبايل رفعه من غير ختم ⇒ الختم بيفضل ومفيش كتابة", async () => {
    await db.query("update public.field_checks set team = 'مجموعة احمد'");
    const before = await version(db);
    await upsert(db, base());
    const after = await version(db);
    expect(after.v).toBe(before.v);
    expect(after.team).toBe("مجموعة احمد");
  });
  it("الطلب بينجح عادي (المندوب مايشوفش غلط)", async () => {
    await expect(upsert(db, base())).resolves.toBeUndefined();
  });
});

describe("🔴 أي تعديل حقيقي بيتكتب", () => {
  it("🔴 النوع/الملاحظة اتغيّرت", async () => {
    const before = await version(db);
    await upsert(db, { ...base(), extra: { ...base().extra, "النوع": "نقل", "ملاحظات": "قدام البنك" } });
    const after = await version(db);
    expect(after.v).not.toBe(before.v);
    expect(after.extra["ملاحظات"]).toBe("قدام البنك");
  });
  it("🔴 اللوحة اتصلّحت ⇒ بتتكتب ورقم اللوحة المطبّع بيتحسب", async () => {
    await upsert(db, { ...base(), plate: "د ه و 5678" });
    expect((await version(db)).n).toBe("دهو5678");
  });
  it("🔴 الموقع وصل بعدين", async () => {
    const before = await version(db);
    await upsert(db, { ...base(), lat: 24.8, lng: 46.7, maps_link: "https://maps.google.com/?q=24.8,46.7" });
    expect((await version(db)).v).not.toBe(before.v);
  });
  it("🔴 تعديل من صفحة سجلات المجموعة (update عادي)", async () => {
    await db.query(`update public.field_checks set extra = '{"النوع":"أجرة"}'::jsonb where local_id = 'fc-ptt-1'`);
    expect((await version(db)).extra["النوع"]).toBe("أجرة");
  });
  it("🔴 المسح شغّال عادي", async () => {
    await db.query("delete from public.field_checks where local_id = 'fc-ptt-1'");
    expect(await version(db)).toBeUndefined();
  });
  it("السجل الجديد بيتضاف عادي", async () => {
    await upsert(db, { ...base(), local_id: "fc-ptt-2" });
    expect((await db.query<{ c: number }>("select count(*)::int c from public.field_checks")).rows[0].c).toBe(2);
  });
});

describe("آمن لو اتشغّل مرتين", () => {
  it("التشغيل التاني مابيكسرش ومابيكرّرش التريجر", async () => {
    await db.exec(sqlFile("field-checks-skip-unchanged.sql"));
    const t = await db.query<{ tgname: string }>(
      "select tgname from pg_trigger where tgrelid = 'public.field_checks'::regclass and not tgisinternal order by tgname");
    expect(t.rows.map((r) => r.tgname)).toEqual(["field_checks_keep_team", "zz_field_checks_skip_unchanged"]);
  });
});
