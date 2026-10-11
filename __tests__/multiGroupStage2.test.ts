import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, visibleIds, visibleRecordCount, sqlFile, U } from "./helpers/groupSqlDb";

/**
 * 👥 مندوب في أكتر من مجموعة — المرحلة ٢ (قواعد السيرفر من جدول العضوية). المالك: «مش عايز لخبطه او غلط في حاجه
 * من شغل المجموعات الموجود حاليا» + قراره: الشغل المختوم بمجموعة بيفضل لها حتى لو صاحبه مشي.
 * Postgres حقيقي (PGlite) بنفس الدوال والسياسات اللي على Supabase.
 */
const STAGE1 = sqlFile("multi-group-1-membership.sql");
const STAGE2 = sqlFile("multi-group-2-functions.sql");
const ROLLBACK = sqlFile("multi-group-2-rollback.sql");

// «أ»: ١ (مسئول) ٢ ٣ + أدمن ٧ — «ب»: ٤ (مسئول) ٥ — ٦ من غير مجموعة.
const AGENTS: [number, string | null, string][] = [
  [1, "أ", "agent"], [2, "أ", "agent"], [3, "أ", "agent"], [7, "أ", "admin"],
  [4, "ب", "agent"], [5, "ب", "agent"], [6, null, "agent"],
];
const ALL_NORMS = AGENTS.flatMap(([n]) => [`ابح${n}001`, `ابح${n}002`]);

async function seed(db: PGlite) {
  for (const [n, team, role] of AGENTS) {
    await db.query("insert into public.profiles (id, username, team, role) values ($1, $2, $3, $4)", [U(n), `مندوب ${n}`, team, role]);
    for (const k of ["001", "002"]) {
      await db.query("insert into public.field_checks (agent_id, plate, plate_norm) values ($1, $2, $2)", [U(n), `ابح${n}${k}`]);
    }
    await db.query("insert into public.chassis_records (local_id, agent_id, vin) values ($1, $2, $3)", [`c${n}`, U(n), `VIN${n}`]);
  }
  await db.query("insert into public.group_settings (team, leader_id) values ('أ', $1), ('ب', $2)", [U(1), U(4)]);
  await db.query("insert into public.group_finds (team, finder_id, plate) values ('أ', $1, 'لقطة أ'), ('ب', $2, 'لقطة ب')", [U(2), U(5)]);
}

/** كل اللي المندوب بيشوفه من السيرفر — لازم يفضل هو هو. */
async function snapshot(db: PGlite) {
  const out: Record<number, unknown> = {};
  for (const [n] of AGENTS) {
    const u = U(n);
    out[n] = {
      ids: await visibleIds(db, u),
      records: await visibleRecordCount(db, u),
      chassis: (await asUser<{ local_id: string }>(db, u, "select local_id from public.chassis_records order by local_id")).map((r) => r.local_id),
      sort: (await asUser<{ plate: string }>(db, u, "select plate from public.match_group_plates($1) order by plate", [ALL_NORMS])).map((r) => r.plate),
      names: (await asUser<{ id: string }>(db, u, "select id from public.my_team_members() order by id")).map((r) => r.id),
      finds: (await asUser<{ plate: string }>(db, u, "select plate from public.group_finds order by plate")).map((r) => r.plate),
      settings: (await asUser<{ team: string }>(db, u, "select team from public.group_settings order by team")).map((r) => r.team),
    };
  }
  return out;
}

const CASES: [string, string][] = [
  ["الافتراضي (المشاركة مفتوحة)", ""],
  ["المشاركة مقفولة في «ب»", "update public.group_settings set share_records_enabled = false where team = 'ب'"],
  ["«السجلات للمسئول بس» في «أ»", "update public.group_settings set records_leader_only = true where team = 'أ'"],
  ["«الإشعار للمسئول بس» في «أ»", "update public.group_settings set finds_leader_only = true where team = 'أ'"],
];

describe("🔴 المرحلة ٢: كل مندوب في مجموعة واحدة بيشوف نفس الحاجة بالظبط", () => {
  for (const [name, setup] of CASES) {
    it(`🔴 ${name}`, async () => {
      const db = await makeGroupDb();
      await seed(db);
      if (setup) await db.exec(setup);
      await db.exec(STAGE1);
      // سجلات جديدة بعد المرحلة ١ (مختومة) — لازم تتشاف زي القديمة
      await db.query("insert into public.field_checks (agent_id, plate, plate_norm) values ($1, 'ابح2001', 'ابح2001'), ($2, 'ابح5001', 'ابح5001')", [U(2), U(5)]);
      const before = await snapshot(db);
      await db.exec(STAGE2);
      expect(await snapshot(db)).toEqual(before);
    });
  }
  it("🔴 المقارنة اللي في آخر الملف بتطلّع صفر فروق", async () => {
    const db = await makeGroupDb();
    await seed(db);
    await db.exec(STAGE1);
    await db.exec(STAGE2);
    const r = await db.query<{ agents_checked: number; members_diff: number; records_diff: number }>(
      "select count(*)::int agents_checked, count(*) filter (where not ids_same)::int members_diff, count(*) filter (where old_count <> new_count)::int records_diff from _mg2_check");
    expect(r.rows[0]).toEqual({ agents_checked: 6, members_diff: 0, records_diff: 0 });
  });
  it("آمن لو اتشغّل مرتين", async () => {
    const db = await makeGroupDb();
    await seed(db);
    await db.exec(STAGE1);
    await db.exec(STAGE2);
    const before = await snapshot(db);
    await db.exec(STAGE2);
    expect(await snapshot(db)).toEqual(before);
  });
  it("🔴 ملف الرجوع بيرجّع كل حاجة زي ما كانت", async () => {
    const db = await makeGroupDb();
    await seed(db);
    await db.exec(STAGE1);
    const before = await snapshot(db);
    await db.exec(STAGE2);
    await db.exec(ROLLBACK);
    expect(await snapshot(db)).toEqual(before);
  });
});

describe("🔴 قرار المالك: الشغل المختوم بيفضل لمجموعته", () => {
  let db: PGlite;
  beforeEach(async () => { db = await makeGroupDb(); await seed(db); await db.exec(STAGE1); await db.exec(STAGE2); });
  const plates = async (n: number) =>
    (await asUser<{ plate: string }>(db, U(n), "select plate from public.field_checks order by plate")).map((r) => r.plate);

  it("🔴 مندوب اتنقل من «أ» لـ«ب»: شغله القديم بيفضل في «أ» ومابيروحش «ب»، والجديد في «ب»", async () => {
    await db.query("update public.profiles set team = 'ب' where id = $1", [U(2)]);
    await db.query("insert into public.field_checks (agent_id, plate, plate_norm) values ($1, 'جديد2', 'جديد2')", [U(2)]);
    expect(await plates(3)).toEqual(expect.arrayContaining(["ابح2001", "ابح2002"]));     // «أ» لسه شايفاه
    expect(await plates(3)).not.toContain("جديد2");
    expect(await plates(5)).not.toContain("ابح2001");                                    // «ب» مش شايفة القديم
    expect(await plates(5)).toContain("جديد2");                                          // بس شايفة الجديد
    expect(await plates(2)).toEqual(expect.arrayContaining(["ابح2001", "ابح2002", "جديد2"]));   // هو شايف كل سجلاته
  });
  it("🔴 «السجلات للمسئول بس»: سجلات اللي مشي بتفضل للمسئول بس (معروف إنها بتاعته)", async () => {
    await db.exec("update public.group_settings set records_leader_only = true where team = 'أ'");
    await db.query("update public.profiles set team = null where id = $1", [U(2)]);
    const leader = await asUser<{ plate: string; agent_id: string }>(db, U(1), "select plate, agent_id from public.field_checks where agent_id = $1", [U(2)]);
    expect(leader.map((r) => r.plate).sort()).toEqual(["ابح2001", "ابح2002"]);
    expect(leader.every((r) => r.agent_id === U(2))).toBe(true);
    expect(await plates(3)).not.toContain("ابح2001");
  });
  it("مجموعة تانية عمرها ما تشوف شغل المجموعة دي", async () => {
    expect((await plates(4)).some((p) => p.startsWith("ابح1") || p.startsWith("ابح2"))).toBe(false);
    expect((await plates(1)).some((p) => p.startsWith("ابح4") || p.startsWith("ابح5"))).toBe(false);
  });
});

describe("🔴 تمهيد المرحلة ٤: مندوب عضو في مجموعتين (مسئول «أ» + عضو «ب»)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await makeGroupDb(); await seed(db); await db.exec(STAGE1); await db.exec(STAGE2);
    // المرحلة ٤ هتعمل كده: سجلاته القديمة (من غير ختم) بتتختم بمجموعته الأولى **قبل** ما يتضاف للتانية —
    // من غيرها «ب» كانت هتشوف شغله القديم في «أ».
    await db.query("update public.field_checks set team = 'أ' where agent_id = $1 and team is null", [U(1)]);
    await db.query("update public.chassis_records set team = 'أ' where agent_id = $1 and team is null", [U(1)]);
    await db.query("insert into public.team_members (team, agent_id) values ('ب', $1)", [U(1)]);
  });
  it("🔴 بيوصله إشعارات وإعدادات المجموعتين", async () => {
    expect((await asUser<{ plate: string }>(db, U(1), "select plate from public.group_finds order by plate")).map((r) => r.plate))
      .toEqual(["لقطة أ", "لقطة ب"]);
    expect((await asUser<{ team: string }>(db, U(1), "select team from public.group_settings order by team")).map((r) => r.team))
      .toEqual(["أ", "ب"]);
  });
  it("🔴 بس سجلات وفرز المجموعة = المجموعة اللي شغّال لها بس (مفيش خلط)", async () => {
    const recs = (await asUser<{ plate: string }>(db, U(1), "select plate from public.field_checks order by plate")).map((r) => r.plate);
    expect(recs.some((p) => p.startsWith("ابح5"))).toBe(false);
    const sort = (await asUser<{ plate: string }>(db, U(1), "select plate from public.match_group_plates($1)", [ALL_NORMS])).map((r) => r.plate);
    expect(sort.some((p) => p.startsWith("ابح5"))).toBe(false);
    // ولو قلب لـ«ب» (المرحلة ٣): سجلات «ب» بس + سجلاته هو
    await db.query("update public.profiles set team = 'ب' where id = $1", [U(1)]);
    await db.query("insert into public.team_members (team, agent_id) values ('أ', $1) on conflict do nothing", [U(1)]);
    const inB = (await asUser<{ plate: string }>(db, U(1), "select plate from public.field_checks order by plate")).map((r) => r.plate);
    expect(inB.some((p) => p.startsWith("ابح5"))).toBe(true);
    expect(inB.some((p) => p.startsWith("ابح3"))).toBe(false);
  });
  it("أعضاء «ب» مايشوفوش سجلات «أ» بتاعته", async () => {
    const seen = (await asUser<{ plate: string }>(db, U(5), "select plate from public.field_checks")).map((r) => r.plate);
    expect(seen.some((p) => p.startsWith("ابح1"))).toBe(false);
  });
});
