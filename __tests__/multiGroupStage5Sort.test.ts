import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, visibleIds, visibleRecordCount, sqlFile, U } from "./helpers/groupSqlDb";

/**
 * 👥 الفرز على كل مجموعات المندوب مع بعض — المالك (١١ أكتوبر ٢٠٢٦): «عايزة لما ييجي يفرز الفرز يتطبق معاه
 * للمجموعتين». كل مجموعة بقواعدها. Postgres حقيقي (PGlite).
 */
const PRE = ["multi-group-1-membership.sql", "multi-group-2-functions.sql", "multi-group-3-active.sql", "multi-group-4-add.sql"].map(sqlFile);
const S5 = sqlFile("multi-group-5-sort-all.sql");

const AGENTS: [number, string | null, string][] = [
  [1, "أ", "agent"], [2, "أ", "agent"], [3, "أ", "agent"], [7, "أ", "admin"],
  [4, "ب", "agent"], [5, "ب", "agent"], [6, null, "agent"],
];
const ALL_NORMS = AGENTS.flatMap(([n]) => [`ابح${n}001`, `ابح${n}002`]);
async function seed(db: PGlite) {
  for (const [n, team, role] of AGENTS) {
    await db.query("insert into public.profiles (id, username, team, role) values ($1, $2, $3, $4)", [U(n), `مندوب ${n}`, team, role]);
    await db.query("insert into public.field_checks (agent_id, plate, plate_norm) values ($1, $2, $2), ($1, $3, $3)", [U(n), `ابح${n}001`, `ابح${n}002`]);
    await db.query("insert into public.chassis_records (local_id, agent_id, vin) values ($1, $2, $3)", [`c${n}`, U(n), `VIN${n}`]);
  }
  await db.query("insert into public.group_settings (team, leader_id) values ('أ', $1), ('ب', $2)", [U(1), U(4)]);
}
async function ready() { const db = await makeGroupDb(); await seed(db); for (const s of PRE) await db.exec(s); return db; }
const sortOf = async (db: PGlite, n: number) =>
  (await asUser<{ plate: string }>(db, U(n), "select plate from public.match_group_plates($1) order by plate", [ALL_NORMS])).map((r) => r.plate);
async function snap(db: PGlite) {
  const o: Record<number, unknown> = {};
  for (const [n] of AGENTS) {
    o[n] = {
      ids: await visibleIds(db, U(n)), recs: await visibleRecordCount(db, U(n)), sort: await sortOf(db, n),
      chassis: (await asUser<{ local_id: string }>(db, U(n), "select local_id from public.chassis_records order by local_id")).map((r) => r.local_id),
    };
  }
  return o;
}

describe("🔴 المندوب في مجموعة واحدة: نفس النتيجة بالظبط", () => {
  const CASES: [string, string][] = [
    ["الافتراضي", ""],
    ["المشاركة مقفولة في «ب»", "update public.group_settings set share_records_enabled = false where team = 'ب'"],
    ["«للمسئول بس» في «أ»", "update public.group_settings set records_leader_only = true where team = 'أ'"],
  ];
  for (const [name, setup] of CASES) {
    it(`🔴 ${name}`, async () => {
      const db = await ready();
      if (setup) await db.exec(setup);
      const before = await snap(db);
      await db.exec(S5); await db.exec(S5);
      expect(await snap(db)).toEqual(before);
    });
  }
});

describe("🔴 مسئول «ب» وعضو في «أ» (محمد عفيفي) — الفرز على المجموعتين", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await ready(); await db.exec(S5);
    await db.query("select public.add_agent_to_team($1, 'ب')", [U(1)]);
    await db.exec(`update public.group_settings set leader_id = '${U(1)}' where team = 'ب'`);
  });

  it("🔴 فرزه بيطلّع سجلات «أ» و«ب» مع بعض", async () => {
    const s = await sortOf(db, 1);
    expect(s.some((p) => p.startsWith("ابح3"))).toBe(true);   // «أ»
    expect(s.some((p) => p.startsWith("ابح5"))).toBe(true);   // «ب»
    expect(s.some((p) => p.startsWith("ابح6"))).toBe(false);  // من غير مجموعة
  });
  it("🔴 كل مجموعة بقواعدها: «أ» المشاركة فيها مقفولة ⇒ مايشوفش زمايل «أ» (هو مش مسئولها)", async () => {
    await db.exec(`update public.group_settings set leader_id = '${U(2)}', share_records_enabled = false where team = 'أ'`);
    const s = await sortOf(db, 1);
    expect(s.some((p) => p.startsWith("ابح3"))).toBe(false);
    expect(s.some((p) => p.startsWith("ابح5"))).toBe(true);    // «ب» هو مسئولها
    expect(s).toEqual(expect.arrayContaining(["ابح1001", "ابح1002"]));   // سجلاته هو دايماً
  });
  it("🔴 مجموعة قافلة عليه الفرز ⇒ سجلاتها مابتدخلش فرزه", async () => {
    await db.exec(`update public.group_settings set leader_id = '${U(2)}', lock_member_sort = true where team = 'أ'`);
    const s = await sortOf(db, 1);
    expect(s.some((p) => p.startsWith("ابح3"))).toBe(false);
    expect(s.some((p) => p.startsWith("ابح5"))).toBe(true);
  });
  it("🔴 أعضاء «ب» مابيشوفوش «أ» (مفيش خلط عند الباقيين)", async () => {
    const s = await sortOf(db, 5);
    expect(s.some((p) => p.startsWith("ابح3") || p.startsWith("ابح2"))).toBe(false);
  });
  it("أسامي أعضاء المجموعتين للنتيجة", async () => {
    const ids = (await asUser<{ id: string }>(db, U(1), "select id from public.my_groups_members() order by id")).map((r) => r.id);
    expect(ids).toEqual([U(1), U(2), U(3), U(4), U(5), U(7)].sort());
  });
});
