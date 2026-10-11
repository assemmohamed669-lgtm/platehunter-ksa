import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, visibleIds, visibleRecordCount, sqlFile, U } from "./helpers/groupSqlDb";

/**
 * 👥 مندوب في أكتر من مجموعة — المرحلة ٤ («ضيفه كمان»). Postgres حقيقي (PGlite).
 * المالك: «كل مجموعه خاصه بيها شغلها ومش عايز لخبطه» + «لو مقفوله عنه السجلات دي متروحش معاه ابدا».
 */
const S = ["multi-group-1-membership.sql", "multi-group-2-functions.sql", "multi-group-3-active.sql"].map(sqlFile);
const S4 = sqlFile("multi-group-4-add.sql");

const AGENTS: [number, string | null, string][] = [
  [1, "أ", "agent"], [2, "أ", "agent"], [3, "أ", "agent"], [7, "أ", "admin"],
  [4, "ب", "agent"], [5, "ب", "agent"], [6, null, "agent"],
];
async function seed(db: PGlite) {
  for (const [n, team, role] of AGENTS) {
    await db.query("insert into public.profiles (id, username, team, role) values ($1, $2, $3, $4)", [U(n), `مندوب ${n}`, team, role]);
    await db.query("insert into public.field_checks (agent_id, plate, plate_norm) values ($1, $2, $2), ($1, $3, $3)", [U(n), `ابح${n}001`, `ابح${n}002`]);
  }
  await db.query("insert into public.group_settings (team, leader_id) values ('أ', $1), ('ب', $2)", [U(1), U(4)]);
}
async function ready(): Promise<PGlite> {
  const db = await makeGroupDb(); await seed(db);
  for (const s of S) await db.exec(s);
  return db;
}
const members = async (db: PGlite, team: string) =>
  (await db.query<{ agent_id: string }>("select agent_id from public.team_members where team = $1 order by agent_id", [team])).rows.map((r) => r.agent_id);
const seen = async (db: PGlite, n: number) =>
  (await asUser<{ plate: string }>(db, U(n), "select plate from public.field_checks order by plate")).map((r) => r.plate);
const activeOf = async (db: PGlite, n: number) =>
  (await db.query<{ team: string | null }>("select team from public.profiles where id = $1", [U(n)])).rows[0].team;

describe("🔴 المرحلة ٤ مابتغيّرش حاجة عند حد", () => {
  it("🔴 نفس الزمايل ونفس السجلات لكل مندوب", async () => {
    const db = await ready();
    const before: Record<number, unknown> = {};
    for (const [n] of AGENTS) before[n] = { ids: await visibleIds(db, U(n)), recs: await visibleRecordCount(db, U(n)) };
    await db.exec(S4); await db.exec(S4);
    for (const [n] of AGENTS) expect({ ids: await visibleIds(db, U(n)), recs: await visibleRecordCount(db, U(n)) }).toEqual(before[n]);
  });
});

describe("🔴 «ضيفه كمان»", () => {
  let db: PGlite;
  beforeEach(async () => { db = await ready(); await db.exec(S4); });

  it("🔴 بيتضاف للتانية من غير ما يتشال من الأولى، ومجموعته الحالية زي ما هي", async () => {
    await db.query("select public.add_agent_to_team($1, 'ب')", [U(1)]);
    expect(await members(db, "أ")).toContain(U(1));
    expect(await members(db, "ب")).toContain(U(1));
    expect(await activeOf(db, 1)).toBe("أ");
  });
  it("🔴 شغله القديم بيفضل لمجموعته الأولى — «ب» ماتشوفوش", async () => {
    await db.query("select public.add_agent_to_team($1, 'ب')", [U(1)]);
    expect((await seen(db, 5)).some((p) => p.startsWith("ابح1"))).toBe(false);
    expect((await seen(db, 3)).some((p) => p.startsWith("ابح1"))).toBe(true);
  });
  it("مندوب من غير مجموعة ⇒ الإضافة بتبقى مجموعته", async () => {
    await db.query("select public.add_agent_to_team($1, 'ب')", [U(6)]);
    expect(await activeOf(db, 6)).toBe("ب");
    expect(await members(db, "ب")).toContain(U(6));
  });
  it("🔴 التطبيق مايقدرش ينادي الإضافة ولا الشيل (السيرفر بس)", async () => {
    await expect(asUser(db, U(2), "select public.add_agent_to_team($1, 'ب')", [U(2)])).rejects.toThrow();
    await expect(asUser(db, U(2), "select public.remove_agent_from_team($1, 'أ')", [U(2)])).rejects.toThrow();
  });
});

describe("🔴 «شيل» من مجموعة واحدة بس", () => {
  let db: PGlite;
  beforeEach(async () => { db = await ready(); await db.exec(S4); await db.query("select public.add_agent_to_team($1, 'ب')", [U(1)]); });

  it("🔴 بيتشال من «ب» بس — «أ» زي ما هي", async () => {
    await db.query("select public.remove_agent_from_team($1, 'ب')", [U(1)]);
    expect(await members(db, "ب")).not.toContain(U(1));
    expect(await members(db, "أ")).toContain(U(1));
    expect(await activeOf(db, 1)).toBe("أ");
  });
  it("🔴 اتشال من المجموعة اللي شغّال لها ⇒ بيبقى شغّال للتانية", async () => {
    await db.query("select public.remove_agent_from_team($1, 'أ')", [U(1)]);
    expect(await activeOf(db, 1)).toBe("ب");
    expect(await members(db, "ب")).toContain(U(1));
  });
  it("اتشال من آخر مجموعة ⇒ من غير مجموعة، وشغله بيفضل لها", async () => {
    await db.query("select public.remove_agent_from_team($1, 'أ')", [U(2)]);
    expect(await activeOf(db, 2)).toBeNull();
    expect((await seen(db, 3)).some((p) => p.startsWith("ابح2"))).toBe(true);
  });
});

describe("🔴 قرار المالك: السجلات المقفولة عليه مابتروحش معاه", () => {
  let db: PGlite;
  beforeEach(async () => { db = await ready(); await db.exec(S4); });
  const hidden = async (n: number) =>
    (await asUser<{ team: string }>(db, U(n), "select team from public.agent_hidden_record_teams order by team")).map((r) => r.team);

  it("🔴 ساب «أ» وهي قافلة عليه السجلات ⇒ «أ» بتتسجّل عنده إنها مستخبية", async () => {
    await db.exec("update public.group_settings set lock_member_records = true where team = 'أ'");
    await db.query("select public.move_agent_team($1, 'ب')", [U(2)]);
    expect(await hidden(2)).toEqual(["أ"]);
  });
  it("مش مقفولة ⇒ مفيش حاجة مستخبية (ياخد سجلاته زي ما قرر المالك)", async () => {
    await db.query("select public.move_agent_team($1, 'ب')", [U(2)]);
    expect(await hidden(2)).toEqual([]);
  });
  it("المسئول والأدمن مابيتقفلش عليهم", async () => {
    await db.exec("update public.group_settings set lock_member_records = true where team = 'أ'");
    await db.query("select public.move_agent_team($1, 'ب')", [U(1)]);
    await db.query("select public.move_agent_team($1, 'ب')", [U(7)]);
    expect(await hidden(1)).toEqual([]);
    expect(await hidden(7)).toEqual([]);
  });
  it("رجع للمجموعة ⇒ مابقتش مستخبية (قواعد العضوية بتتطبّق)", async () => {
    await db.exec("update public.group_settings set lock_member_records = true where team = 'أ'");
    await db.query("select public.remove_agent_from_team($1, 'أ')", [U(2)]);
    expect(await hidden(2)).toEqual(["أ"]);
    await db.query("select public.add_agent_to_team($1, 'أ')", [U(2)]);
    expect(await hidden(2)).toEqual([]);
  });
  it("كل مندوب بيقرا اللي مستخبي عنه هو بس", async () => {
    await db.exec("update public.group_settings set lock_member_records = true where team = 'أ'");
    await db.query("select public.move_agent_team($1, 'ب')", [U(2)]);
    expect(await hidden(3)).toEqual([]);
  });
});
