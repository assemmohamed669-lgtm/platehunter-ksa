import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, visibleIds, visibleRecordCount, sqlFile, U } from "./helpers/groupSqlDb";

/**
 * 👥 إصلاح «statement timeout» لما مندوب يتنقل/يتضاف (المالك ١١ أكتوبر ٢٠٢٦ — صورة «سامي عفيفي»). النقل
 * والإضافة كانوا بيحدّثوا كل سجلات المندوب القديمة؛ دلوقتي سطر واحد (`agent_legacy_team`) ونفس النتيجة بالظبط.
 */
const PRE = ["multi-group-1-membership.sql", "multi-group-2-functions.sql", "multi-group-3-active.sql",
  "multi-group-4-add.sql", "multi-group-5-sort-all.sql"].map(sqlFile);
const S6 = sqlFile("multi-group-6-legacy-pin.sql");

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
async function ready(withS6 = true) {
  const db = await makeGroupDb(); await seed(db);
  for (const s of PRE) await db.exec(s);
  if (withS6) await db.exec(S6);
  return db;
}
const sortOf = async (db: PGlite, n: number) =>
  (await asUser<{ plate: string }>(db, U(n), "select plate from public.match_group_plates($1) order by plate", [ALL_NORMS])).map((r) => r.plate);
const seen = async (db: PGlite, n: number) =>
  (await asUser<{ plate: string }>(db, U(n), "select plate from public.field_checks order by plate")).map((r) => r.plate);
const stamped = async (db: PGlite) =>
  (await db.query<{ c: number }>("select count(*)::int c from public.field_checks where team is not null")).rows[0].c;
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

describe("🔴 التصليح مابيغيّرش حاجة عند حد", () => {
  it("🔴 كل مندوب نفس الزمايل والسجلات والفرز والشاص — ومرتين", async () => {
    const db = await ready(false);
    const before = await snap(db);
    await db.exec(S6); await db.exec(S6);
    expect(await snap(db)).toEqual(before);
  });
});

describe("🔴 النقل والإضافة مابيلمسوش السجلات خالص (مفيش timeout) — ونفس النتيجة", () => {
  let db: PGlite;
  beforeEach(async () => { db = await ready(); });

  it("🔴 النقل: ولا سجل اتحدّث، وشغله القديم بيفضل لـ«أ» ومايروحش «ب»", async () => {
    const before = await stamped(db);
    await db.query("select public.move_agent_team($1, 'ب')", [U(2)]);
    expect(await stamped(db)).toBe(before);
    expect((await seen(db, 3)).filter((p) => p.startsWith("ابح2"))).toEqual(["ابح2001", "ابح2002"]);
    expect((await seen(db, 5)).some((p) => p.startsWith("ابح2"))).toBe(false);
    expect(await seen(db, 2)).toEqual(expect.arrayContaining(["ابح2001", "ابح2002"]));   // هو شايف سجلاته
    expect((await sortOf(db, 3)).some((p) => p.startsWith("ابح2"))).toBe(true);
    expect((await sortOf(db, 5)).some((p) => p.startsWith("ابح2"))).toBe(false);
  });
  it("🔴 «ضيفه كمان» (محمد عفيفي): ولا سجل اتحدّث، و«ب» ماتشوفش شغله القديم في «أ»", async () => {
    const before = await stamped(db);
    await db.query("select public.add_agent_to_team($1, 'ب')", [U(1)]);
    expect(await stamped(db)).toBe(before);
    expect((await seen(db, 5)).some((p) => p.startsWith("ابح1"))).toBe(false);
    expect((await seen(db, 3)).some((p) => p.startsWith("ابح1"))).toBe(true);
    expect((await sortOf(db, 5)).some((p) => p.startsWith("ابح1"))).toBe(false);
  });
  it("🔴 والجديد بعد الإضافة بيتختم بالمجموعة اللي شغّال لها (زي الأول)", async () => {
    await db.query("select public.add_agent_to_team($1, 'ب')", [U(1)]);
    await db.query("insert into public.field_checks (agent_id, plate, plate_norm, team) values ($1, 'جديد', 'جديد', 'ب')", [U(1)]);
    expect(await seen(db, 5)).toContain("جديد");
    expect((await seen(db, 3))).not.toContain("جديد");
  });
  it("🔴 «سجلات فلان»: اللي مشي ليه مكان في القايمة (سجلاته القديمة تبعها)", async () => {
    await db.query("select public.move_agent_team($1, null)", [U(3)]);
    const a = await asUser<{ id: string; is_member: boolean }>(db, U(1), "select id, is_member from public.my_team_record_authors() order by id");
    expect(a.find((r) => r.id === U(3))?.is_member).toBe(false);
    expect((await seen(db, 1)).some((p) => p.startsWith("ابح3"))).toBe(true);
  });
  it("🔴 «للمسئول بس»: سجلات اللي مشي للمسئول بس", async () => {
    await db.exec("update public.group_settings set records_leader_only = true where team = 'أ'");
    await db.query("select public.move_agent_team($1, null)", [U(3)]);
    expect((await seen(db, 1)).some((p) => p.startsWith("ابح3"))).toBe(true);
    expect((await seen(db, 2)).some((p) => p.startsWith("ابح3"))).toBe(false);
  });
  it("المندوب بيقرا سطر مجموعته القديمة هو بس", async () => {
    await db.query("select public.move_agent_team($1, 'ب')", [U(2)]);
    expect(await asUser(db, U(2), "select team from public.agent_legacy_team")).toEqual([{ team: "أ" }]);
    expect(await asUser(db, U(3), "select team from public.agent_legacy_team")).toEqual([]);
  });
});
