import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, visibleIds, visibleRecordCount, sqlFile, U } from "./helpers/groupSqlDb";

/**
 * 👥 مندوب في أكتر من مجموعة — المرحلة ١ (إضافة بس). المالك (١١ أكتوبر ٢٠٢٦): «اهم حاجه مش عايز لخبطه في شغل
 * المجموعات كل مجموعه خاصه بيها شغلها ومش عايز لخبطه او غلط في حاجه من شغل المجموعات الموجود حاليا».
 * بيتجرّب على Postgres حقيقي (PGlite) بنفس الدوال والسياسات اللي على Supabase.
 */
const STAGE1 = sqlFile("multi-group-1-membership.sql");

// مجموعة «أ»: مسئول ١ + أعضاء ٢، ٣ + أدمن ٧ — مشاركة السجلات مفتوحة (الافتراضي، مالهاش صف إعدادات).
// مجموعة «ب»: مسئول ٤ + عضو ٥ — مشاركة السجلات مقفولة. مندوب ٦ من غير مجموعة.
const AGENTS: [number, string | null, string][] = [
  [1, "أ", "agent"], [2, "أ", "agent"], [3, "أ", "agent"], [7, "أ", "admin"],
  [4, "ب", "agent"], [5, "ب", "agent"], [6, null, "agent"],
];

async function seed(db: PGlite) {
  for (const [n, team, role] of AGENTS) {
    await db.query("insert into public.profiles (id, username, team, role) values ($1, $2, $3, $4)", [U(n), `مندوب ${n}`, team, role]);
    await db.query("insert into public.field_checks (agent_id, plate) values ($1, $2), ($1, $3)", [U(n), `ابح${n}001`, `ابح${n}002`]);
  }
  await db.query("insert into public.group_settings (team, share_records_enabled, leader_id) values ('ب', false, $1)", [U(4)]);
}

async function snapshot(db: PGlite) {
  const out: Record<string, { ids: string[]; count: number }> = {};
  for (const [n] of AGENTS) out[n] = { ids: await visibleIds(db, U(n)), count: await visibleRecordCount(db, U(n)) };
  return out;
}

describe("🔴 المرحلة ١ مابتغيّرش حاجة عند حد", () => {
  let db: PGlite;
  beforeEach(async () => { db = await makeGroupDb(); await seed(db); });

  it("🔴 كل مندوب بيشوف نفس الزمايل ونفس عدد السجلات قبل وبعد", async () => {
    const before = await snapshot(db);
    // تأكيد إن الأساس نفسه صح: «أ» مشاركة ⇒ ٤ أعضاء، «ب» مقفولة ⇒ كل واحد نفسه، ٦ من غير مجموعة ⇒ ولا حد.
    expect(before[2].ids).toEqual([U(1), U(2), U(3), U(7)]);
    expect(before[5].ids).toEqual([U(5)]);
    expect(before[6].ids).toEqual([]);
    expect(before[2].count).toBe(8);
    expect(before[5].count).toBe(2);
    await db.exec(STAGE1);
    expect(await snapshot(db)).toEqual(before);
  });
  it("🔴 كمان مع «السجلات للمسئول بس» مفتوحة", async () => {
    await db.query("update public.group_settings set records_leader_only = true where team = 'ب'");
    await db.query("insert into public.group_settings (team, records_leader_only, leader_id) values ('أ', true, $1)", [U(1)]);
    const before = await snapshot(db);
    expect(before[1].ids).toEqual([U(1), U(2), U(3), U(7)]);   // المسئول الكل
    expect(before[2].ids).toEqual([U(2)]);                        // العضو نفسه
    await db.exec(STAGE1);
    expect(await snapshot(db)).toEqual(before);
  });
  it("آمن لو اتشغّل مرتين", async () => {
    await db.exec(STAGE1);
    await db.exec(STAGE1);
    const r = await db.query<{ c: number }>("select count(*)::int c from public.team_members");
    expect(r.rows[0].c).toBe(6);
  });
});

describe("🔴 جدول العضوية", () => {
  let db: PGlite;
  beforeEach(async () => { db = await makeGroupDb(); await seed(db); await db.exec(STAGE1); });
  const members = async (team: string) =>
    (await db.query<{ agent_id: string }>("select agent_id from public.team_members where team = $1 order by agent_id", [team])).rows.map((r) => r.agent_id);

  it("🔴 كل اللي في مجموعة اتنقل — ومن غير مجموعة مالوش صف", async () => {
    expect(await members("أ")).toEqual([U(1), U(2), U(3), U(7)]);
    expect(await members("ب")).toEqual([U(4), U(5)]);
    const none = await db.query("select 1 from public.team_members where agent_id = $1", [U(6)]);
    expect(none.rows).toHaveLength(0);
  });
  it("🔴 النقل من صفحة المجموعات (زي دلوقتي) ⇒ العضوية بتمشي وراه", async () => {
    await db.query("update public.profiles set team = 'ب' where id = $1", [U(2)]);
    expect(await members("أ")).toEqual([U(1), U(3), U(7)]);
    expect(await members("ب")).toEqual([U(2), U(4), U(5)]);
  });
  it("الشيل من المجموعة ⇒ العضوية بتتشال", async () => {
    await db.query("update public.profiles set team = null where id = $1", [U(3)]);
    expect(await members("أ")).toEqual([U(1), U(2), U(7)]);
  });
  it("مندوب جديد بمجموعة ⇒ عضو فيها", async () => {
    await db.query("insert into public.profiles (id, username, team) values ($1, 'جديد', 'ب')", [U(9)]);
    expect(await members("ب")).toEqual([U(4), U(5), U(9)]);
  });
  it("🔴 المندوب بيقرا عضوياته هو بس، ومايقدرش يكتب فيها", async () => {
    const mine = await asUser<{ team: string }>(db, U(2), "select team from public.team_members");
    expect(mine.map((r) => r.team)).toEqual(["أ"]);
    await expect(asUser(db, U(2), "insert into public.team_members (team, agent_id) values ('ب', $1)", [U(2)])).rejects.toThrow();
  });
});

describe("🔴 ختم المجموعة على السجلات", () => {
  let db: PGlite;
  beforeEach(async () => { db = await makeGroupDb(); await seed(db); await db.exec(STAGE1); });
  const teamsOf = async (uid: string) =>
    (await db.query<{ plate: string; team: string | null }>("select plate, team from public.field_checks where agent_id = $1 order by plate", [uid])).rows;

  it("🔴 السجل الجديد بيتختم بمجموعة صاحبه — حتى من نسخة قديمة مابتبعتش المجموعة", async () => {
    await db.query("insert into public.field_checks (agent_id, plate) values ($1, 'جديد1')", [U(5)]);
    expect((await teamsOf(U(5))).find((r) => r.plate === "جديد1")?.team).toBe("ب");
  });
  it("المجموعة المبعوتة بتفضل زي ما هي، ومندوب من غير مجموعة من غير ختم", async () => {
    await db.query("insert into public.field_checks (agent_id, plate, team) values ($1, 'جديد2', 'أ')", [U(4)]);
    await db.query("insert into public.field_checks (agent_id, plate) values ($1, 'جديد3')", [U(6)]);
    expect((await teamsOf(U(4))).find((r) => r.plate === "جديد2")?.team).toBe("أ");
    expect((await teamsOf(U(6))).find((r) => r.plate === "جديد3")?.team).toBeNull();
  });
  it("السجلات القديمة مابتتلمسش (مافيش تحديث ضخم)", async () => {
    expect((await teamsOf(U(2))).every((r) => r.team === null)).toBe(true);
  });
  it("🔴 لما يتنقل: شغله القديم بيتختم بالمجموعة اللي سابها، والجديد بالجديدة", async () => {
    await db.query("update public.profiles set team = 'ب' where id = $1", [U(2)]);
    await db.query("insert into public.field_checks (agent_id, plate) values ($1, 'بعد')", [U(2)]);
    const rows = await teamsOf(U(2));
    expect(rows.filter((r) => r.plate !== "بعد").every((r) => r.team === "أ")).toBe(true);
    expect(rows.find((r) => r.plate === "بعد")?.team).toBe("ب");
  });
  it("الشاص كمان", async () => {
    await db.query("insert into public.chassis_records (local_id, agent_id, vin) values ('c1', $1, 'VIN1')", [U(4)]);
    const r = await db.query<{ team: string }>("select team from public.chassis_records where local_id = 'c1'");
    expect(r.rows[0].team).toBe("ب");
  });
});

describe("🔴 صورة «مين بيشوف مين» للمقارنة في المرحلة ٢", () => {
  it("🔴 لكل مندوب في مجموعة = نفس نتيجة الدالة كأنه هو", async () => {
    const db = await makeGroupDb();
    await seed(db);
    await db.exec(STAGE1);
    const rows = (await db.query<{ agent_id: string; visible_ids: string[] }>(
      "select agent_id, visible_ids from public.group_isolation_baseline order by agent_id")).rows;
    expect(rows).toHaveLength(6);
    for (const r of rows) expect([...r.visible_ids].sort()).toEqual(await visibleIds(db, r.agent_id));
    // التطبيق مايقدرش يقراها (مرفوض أو فاضي — الاتنين مقفول)
    const seen = await asUser(db, U(1), "select * from public.group_isolation_baseline").catch(() => []);
    expect(seen).toEqual([]);
  });
});

describe("🔴 #411 على Postgres حقيقي: «إشعار المطلوب للمسئول بس»", () => {
  it("🔴 العضو مايشوفش لقطة زميله، والمسئول بيشوفها، واللي لقاها بيشوف لقطته", async () => {
    const db = await makeGroupDb();
    await seed(db);
    await db.query("update public.group_settings set finds_leader_only = true where team = 'ب'");
    await db.query("insert into public.group_finds (team, finder_id, plate) values ('ب', $1, 'حبك1234')", [U(5)]);
    const seenBy = async (n: number) => (await asUser(db, U(n), "select plate from public.group_finds")).length;
    expect(await seenBy(4)).toBe(1);   // المسئول
    expect(await seenBy(5)).toBe(1);   // اللي لقاها
    await db.query("insert into public.profiles (id, username, team) values ($1, 'عضو', 'ب')", [U(8)]);
    expect(await seenBy(8)).toBe(0);   // عضو تاني
    expect(await seenBy(1)).toBe(0);   // مجموعة تانية
    await db.query("update public.group_settings set finds_leader_only = false where team = 'ب'");
    expect(await seenBy(8)).toBe(1);   // مقفول ⇒ زي الأول: كل المجموعة
  });
});
