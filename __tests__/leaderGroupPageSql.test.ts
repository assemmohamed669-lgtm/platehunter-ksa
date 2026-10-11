import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, sqlFile, U } from "./helpers/groupSqlDb";

/** 🧭 «إدارة مجموعتي» على Postgres حقيقي: إشعارات الأعضاء المختارين + المطلوب بتفاصيله في تقرير النشاط. */
const PRE = ["multi-group-1-membership.sql", "multi-group-2-functions.sql", "multi-group-3-active.sql",
  "multi-group-4-add.sql", "multi-group-5-sort-all.sql", "multi-group-6-legacy-pin.sql"].map(sqlFile);
const LP = sqlFile("group-leader-page.sql");

async function ready(withLp = true): Promise<PGlite> {
  const db = await makeGroupDb();
  // «أ»: مسئول ١ + أعضاء ٢، ٣، ٤
  for (const n of [1, 2, 3, 4]) {
    await db.query("insert into public.profiles (id, username, team) values ($1, $2, 'أ')", [U(n), `مندوب ${n}`]);
  }
  await db.query("insert into public.group_settings (team, leader_id) values ('أ', $1)", [U(1)]);
  await db.exec(`alter table public.group_settings add column if not exists activity_report_enabled boolean not null default false;
    create or replace function public.is_group_admin() returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and team is not null) $$;
    grant execute on function public.is_group_admin() to authenticated;`);
  for (const s of PRE) await db.exec(s);
  if (withLp) await db.exec(LP);
  await db.query("insert into public.group_finds (team, finder_id, plate) values ('أ', $1, 'حبك1234')", [U(2)]);
  return db;
}
const sees = async (db: PGlite, n: number) => (await asUser(db, U(n), "select plate from public.group_finds")).length;

describe("🔴 الإشعارات لأعضاء المسئول اختارهم", () => {
  it("🔴 من غير اختيار (زي دلوقتي) ⇒ كل المجموعة", async () => {
    const db = await ready();
    for (const n of [1, 2, 3, 4]) expect(await sees(db, n)).toBe(1);
  });
  it("🔴 اختار ١ و٣ ⇒ هما بس + اللي لقاها", async () => {
    const db = await ready();
    await db.query("update public.group_settings set notify_member_ids = $1 where team = 'أ'", [[U(1), U(3)]]);
    expect(await sees(db, 1)).toBe(1);
    expect(await sees(db, 3)).toBe(1);
    expect(await sees(db, 2)).toBe(1);   // اللي لقاها
    expect(await sees(db, 4)).toBe(0);
  });
  it("«للمسئول بس» بيغلب الاختيار", async () => {
    const db = await ready();
    await db.query("update public.group_settings set notify_member_ids = $1, finds_leader_only = true where team = 'أ'", [[U(3)]]);
    expect(await sees(db, 1)).toBe(1);
    expect(await sees(db, 3)).toBe(0);
  });
  it("🔴 الملف مابيغيّرش حاجة لمجموعة ماتغيّرتش (مرتين)", async () => {
    const db = await ready(false);
    const before = [await sees(db, 1), await sees(db, 3)];
    await db.exec(LP); await db.exec(LP);
    expect([await sees(db, 1), await sees(db, 3)]).toEqual(before);
    const c = await db.query<{ leader_page_enabled: boolean }>("select leader_page_enabled from public.group_settings where team = 'أ'");
    expect(c.rows[0].leader_page_enabled).toBe(false);   // مقفولة افتراضياً
  });
});

describe("🔴 تقرير النشاط: المطلوب بتفاصيله الكاملة", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await ready();
    await db.query(`insert into public.field_checks (agent_id, plate, plate_norm, method, extra, team)
      values ($1, 'حبك1234', 'حبك1234', 'صوتي', '{"الماركة":"تويوتا","البنك":"بنك تجريبي"}', 'أ')`, [U(2)]);
  });
  it("🔴 المسئول (والتقرير مفتوح) ⇒ اللوحة + مين + بيانات العربية كاملة", async () => {
    await db.exec("update public.group_settings set activity_report_enabled = true where team = 'أ'");
    const r = await asUser<{ plate: string; username: string; extra: Record<string, string> }>(db, U(1), "select plate, username, extra from public.my_team_wanted_found_v2(30)");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ plate: "حبك1234", username: "مندوب 2" });
    expect(r[0].extra["الماركة"]).toBe("تويوتا");
  });
  it("🔴 التقرير مقفول من السوبر أدمن ⇒ ولا حاجة", async () => {
    expect(await asUser(db, U(1), "select plate from public.my_team_wanted_found_v2(30)")).toEqual([]);
  });
  it("عضو مش مسئول ⇒ ولا حاجة", async () => {
    await db.exec("update public.group_settings set activity_report_enabled = true where team = 'أ'");
    expect(await asUser(db, U(3), "select plate from public.my_team_wanted_found_v2(30)")).toEqual([]);
  });
});
