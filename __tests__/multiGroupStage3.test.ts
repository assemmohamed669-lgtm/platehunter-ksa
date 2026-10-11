import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, visibleIds, visibleRecordCount, sqlFile, U } from "./helpers/groupSqlDb";

/**
 * 👥 مندوب في أكتر من مجموعة — المرحلة ٣ («شغّال لـ» + النقل من السيرفر). Postgres حقيقي (PGlite).
 * المالك: «مش عايز لخبطه او غلط في حاجه من شغل المجموعات الموجود حاليا».
 */
const S1 = sqlFile("multi-group-1-membership.sql");
const S2 = sqlFile("multi-group-2-functions.sql");
const S3 = sqlFile("multi-group-3-active.sql");

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
async function snap(db: PGlite) {
  const o: Record<number, unknown> = {};
  for (const [n] of AGENTS) o[n] = { ids: await visibleIds(db, U(n)), recs: await visibleRecordCount(db, U(n)) };
  return o;
}
const members = async (db: PGlite, team: string) =>
  (await db.query<{ agent_id: string }>("select agent_id from public.team_members where team = $1 order by agent_id", [team])).rows.map((r) => r.agent_id);
const platesSeenBy = async (db: PGlite, n: number) =>
  (await asUser<{ plate: string }>(db, U(n), "select plate from public.field_checks order by plate")).map((r) => r.plate);

describe("🔴 المرحلة ٣ مابتغيّرش حاجة عند حد", () => {
  it("🔴 كل مندوب بيشوف نفس الزمايل ونفس السجلات", async () => {
    const db = await makeGroupDb(); await seed(db); await db.exec(S1); await db.exec(S2);
    const before = await snap(db);
    await db.exec(S3);
    expect(await snap(db)).toEqual(before);
    await db.exec(S3);   // مرتين
    expect(await snap(db)).toEqual(before);
  });
});

describe("🔴 النقل والشيل من صفحة المجموعات = نفس اللي بيحصل دلوقتي", () => {
  let db: PGlite;
  beforeEach(async () => { db = await makeGroupDb(); await seed(db); await db.exec(S1); await db.exec(S2); await db.exec(S3); });

  it("🔴 النقل: عضوية الجديدة بس + شغله القديم بيتختم بالقديمة ويفضل لها", async () => {
    await db.query("select public.move_agent_team($1, 'ب')", [U(2)]);
    expect(await members(db, "أ")).toEqual([U(1), U(3), U(7)]);
    expect(await members(db, "ب")).toEqual([U(2), U(4), U(5)]);
    const t = await db.query<{ team: string }>("select distinct team from public.field_checks where agent_id = $1", [U(2)]);
    expect(t.rows.map((r) => r.team)).toEqual(["أ"]);
    expect(await platesSeenBy(db, 3)).toContain("ابح2001");      // «أ» لسه شايفاه
    expect(await platesSeenBy(db, 5)).not.toContain("ابح2001");  // «ب» لأ
  });
  it("الشيل (من غير مجموعة)", async () => {
    await db.query("select public.move_agent_team($1, null)", [U(3)]);
    expect(await members(db, "أ")).toEqual([U(1), U(2), U(7)]);
    const p = await db.query<{ team: string | null }>("select team from public.profiles where id = $1", [U(3)]);
    expect(p.rows[0].team).toBeNull();
  });
  it("🔴 التطبيق مايقدرش ينادي دالة النقل (السيرفر بس)", async () => {
    await expect(asUser(db, U(2), "select public.move_agent_team($1, 'ب')", [U(2)])).rejects.toThrow();
  });
});

describe("🔴 «شغّال لـ» — مندوب عضو في «أ» و«ب»", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await makeGroupDb(); await seed(db); await db.exec(S1); await db.exec(S2); await db.exec(S3);
    // المرحلة ٤ هتعمل كده: يختم القديم بمجموعته الأولى وبعدين يضيفه
    await db.query("update public.field_checks set team = 'أ' where agent_id = $1 and team is null", [U(2)]);
    await db.query("insert into public.team_members (team, agent_id) values ('ب', $1)", [U(2)]);
  });
  const switchTo = async (n: number, team: string) =>
    (await asUser<{ ok: boolean }>(db, U(n), "select public.set_my_active_team($1) as ok", [team]))[0].ok;
  const switchCommit = async (n: number, team: string) => {
    await db.exec("begin");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: U(n), role: "authenticated" })]);
    await db.exec("set local role authenticated");
    const r = await db.query<{ ok: boolean }>("select public.set_my_active_team($1) as ok", [team]);
    await db.exec("commit");
    return r.rows[0].ok;
  };

  it("🔴 بيقلب لمجموعة هو عضو فيها، ومايقدرش يقلب لمجموعة مش عضو فيها", async () => {
    expect(await switchTo(2, "ب")).toBe(true);
    expect(await switchTo(3, "ب")).toBe(false);
  });
  it("🔴 القلب مابيشيلش عضويته في التانية، وسجلات المجموعة بتقلب معاه", async () => {
    expect(await switchCommit(2, "ب")).toBe(true);
    expect(await members(db, "أ")).toContain(U(2));
    expect(await members(db, "ب")).toContain(U(2));
    const inB = await platesSeenBy(db, 2);
    expect(inB.some((p) => p.startsWith("ابح5"))).toBe(true);    // زمايل «ب»
    expect(inB.some((p) => p.startsWith("ابح3"))).toBe(false);   // مش «أ»
    expect(inB).toEqual(expect.arrayContaining(["ابح2001", "ابح2002"]));   // سجلاته هو دايماً
    expect(await switchCommit(2, "أ")).toBe(true);
    const inA = await platesSeenBy(db, 2);
    expect(inA.some((p) => p.startsWith("ابح3"))).toBe(true);
    expect(inA.some((p) => p.startsWith("ابح5"))).toBe(false);
  });
  it("🔴 «ب» مابتشوفش شغله اللي عمله لـ«أ»", async () => {
    expect((await platesSeenBy(db, 5)).some((p) => p.startsWith("ابح2"))).toBe(false);
  });
});

describe("🔴 الختم مايتمسحش بإعادة رفع", () => {
  it("🔴 نسخة قديمة بتبعت المجموعة فاضية ⇒ الختم بيفضل", async () => {
    const db = await makeGroupDb(); await seed(db); await db.exec(S1); await db.exec(S2); await db.exec(S3);
    await db.query("update public.field_checks set team = 'أ' where agent_id = $1", [U(2)]);
    await db.query("update public.field_checks set team = null, plate = plate || '' where agent_id = $1", [U(2)]);
    const t = await db.query<{ team: string }>("select distinct team from public.field_checks where agent_id = $1", [U(2)]);
    expect(t.rows.map((r) => r.team)).toEqual(["أ"]);
  });
});

describe("🔴 «سجلات فلان» — حتى اللي مشي", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await makeGroupDb(); await seed(db); await db.exec(S1); await db.exec(S2); await db.exec(S3);
    await db.query("select public.move_agent_team($1, null)", [U(3)]);   // ٣ مشي من «أ»
  });
  const authors = async (n: number) =>
    (await asUser<{ id: string; is_member: boolean }>(db, U(n), "select id, is_member from public.my_team_record_authors() order by id"));
  it("🔴 اللي بيشوف الكل: الأعضاء + اللي مشي (معلّم إنه مش عضو)", async () => {
    const a = await authors(1);
    expect(a.map((r) => r.id)).toEqual([U(1), U(2), U(3), U(7)]);
    expect(a.find((r) => r.id === U(3))?.is_member).toBe(false);
  });
  it("🔴 «للمسئول بس»: العضو العادي مايشوفش اللي مشي — المسئول بس", async () => {
    await db.exec("update public.group_settings set records_leader_only = true where team = 'أ'");
    expect((await authors(2)).map((r) => r.id)).toEqual([U(1), U(2), U(7)]);
    expect((await authors(1)).map((r) => r.id)).toContain(U(3));
  });
  it("مجموعة تانية مابتشوفش أسامي «أ»", async () => {
    expect((await authors(5)).map((r) => r.id)).toEqual([U(4), U(5)]);
  });
});
