import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, sqlFile, U } from "./helpers/groupSqlDb";

/**
 * 🧭 سجل شغل الأعضاء على Postgres حقيقي (`docs/sql/agent-events.sql`) — المالك (١٥ أكتوبر ٢٠٢٦): «زر … من خلاله يعرف
 * مسئول المجموعه اي وقت كل عضو في المجموعه عمل فرز ولا لا … لما يفتحها … يعرف انه اتحرك علي السيارة دي وفتح موقعها …
 * ولما يشارك صورة او ملف اكسيل … يعرف مكان الشخص دة فين». قراره: السجل ٧ أيام.
 */
const PRE = ["multi-group-1-membership.sql", "multi-group-2-functions.sql", "multi-group-3-active.sql",
  "multi-group-4-add.sql", "multi-group-5-sort-all.sql", "multi-group-6-legacy-pin.sql"].map(sqlFile);
const EV = sqlFile("agent-events.sql");

async function ready(): Promise<PGlite> {
  const db = await makeGroupDb();
  // «أ»: مسئول ١ + أعضاء ٢، ٣ · «ب»: مسئول ٥ + عضو ٤
  for (const [n, t] of [[1, "أ"], [2, "أ"], [3, "أ"], [4, "ب"], [5, "ب"]] as const) {
    await db.query("insert into public.profiles (id, username, team) values ($1, $2, $3)", [U(n), `مندوب ${n}`, t]);
  }
  await db.query("insert into public.group_settings (team, leader_id) values ('أ', $1), ('ب', $2)", [U(1), U(5)]);
  await db.exec(`create or replace function public.is_group_admin() returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and team is not null) $$;
    grant execute on function public.is_group_admin() to authenticated;`);
  for (const s of PRE) await db.exec(s);
  await db.exec(EV);
  return db;
}
const addEv = (db: PGlite, n: number, kind: string, team: string, ago = "0 minutes", details = "{}") =>
  db.query(`insert into public.agent_events (agent_id, team, kind, at, details) values ($1, $2, $3, now() - $4::interval, $5::jsonb)`,
    [U(n), team, kind, ago, details]);
const leaderSees = async (db: PGlite, n: number, team: string) =>
  asUser<{ agent_id: string; kind: string }>(db, U(n), "select agent_id, kind from public.team_agent_events($1, 7)", [team]);

describe("🔴 العضو بيسجّل شغله هو بس", () => {
  let db: PGlite;
  beforeEach(async () => { db = await ready(); });
  it("فرز/فتح موقع/مشاركة ⇒ بيتسجّل باسمه", async () => {
    // زي التطبيق بالظبط: insert من غير ما يقرا حاجة (مالوش صلاحية قراية)
    await expect(asUser(db, U(2),
      `insert into public.agent_events (team, kind, details, lat, lng) values ('أ', 'sort', '{"mode":"new","results":12}', 21.4, 39.8)`)).resolves.toEqual([]);
  });
  it("🔒 مايقدرش يسجّل باسم حد تاني", async () => {
    await expect(asUser(db, U(2), `insert into public.agent_events (agent_id, team, kind) values ($1, 'أ', 'sort')`, [U(3)])).rejects.toThrow();
  });
  it("🔒 نوع مش معروف أو تفاصيل ضخمة ⇒ مرفوض", async () => {
    await expect(asUser(db, U(2), `insert into public.agent_events (team, kind) values ('أ', 'hack')`)).rejects.toThrow();
    await expect(asUser(db, U(2), `insert into public.agent_events (team, kind, details) values ('أ', 'sort', jsonb_build_object('x', repeat('a', 9000)))`)).rejects.toThrow();
  });
  it("🔒 مايقدرش يقرا السجل نفسه (حتى بتاعه) — القراية للمسئول من الدالة بس", async () => {
    await addEv(db, 2, "sort", "أ");
    await expect(asUser(db, U(2), "select * from public.agent_events")).rejects.toThrow(/permission denied/);
  });
});

describe("🔴 المسئول بيشوف أعضاء مجموعته بس", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await ready();
    await addEv(db, 2, "sort", "أ");
    await addEv(db, 3, "open_location", "أ", "1 hour", '{"plate":"رقه9312"}');
    await addEv(db, 3, "share", "أ", "2 hours", '{"kind":"image","count":20}');
    await addEv(db, 4, "sort", "ب");
  });
  it("🔴 مسئول «أ» ⇒ شغل ٢ و٣ كله، ومش شغل «ب»", async () => {
    const r = await leaderSees(db, 1, "أ");
    expect(r.map((x) => x.agent_id).sort()).toEqual([U(2), U(3), U(3)].sort());
    expect(r.map((x) => x.kind).sort()).toEqual(["open_location", "share", "sort"]);
  });
  it("🔒 عضو عادي ⇒ ولا حاجة", async () => {
    expect(await leaderSees(db, 2, "أ")).toHaveLength(0);
  });
  it("🔒 مسئول «أ» يطلب «ب» ⇒ ولا حاجة", async () => {
    expect(await leaderSees(db, 1, "ب")).toHaveLength(0);
    expect((await leaderSees(db, 5, "ب")).map((x) => x.agent_id)).toEqual([U(4)]);
  });
  it("🔒 مجهول (anon) مايقدرش ينده الدالة", async () => {
    await db.exec("begin");
    try {
      await db.exec("set local role anon");
      await expect(db.query("select * from public.team_agent_events('أ', 7)")).rejects.toThrow();
    } finally { await db.exec("rollback"); }
  });
});

describe("🔴 السجل ٧ أيام بس", () => {
  it("الأقدم مابيظهرش وبيتمسح لوحده مع أول تسجيل جديد", async () => {
    const db = await ready();
    await addEv(db, 2, "sort", "أ", "8 days");
    expect(await leaderSees(db, 1, "أ")).toHaveLength(0);
    await addEv(db, 2, "sort", "أ");
    const left = await db.query<{ n: number }>("select count(*)::int as n from public.agent_events where agent_id = $1", [U(2)]);
    expect(left.rows[0].n).toBe(1);
  });
  it("الملف بيتشغّل مرتين من غير مشاكل", async () => {
    const db = await ready();
    await addEv(db, 2, "sort", "أ");
    await db.exec(EV);
    expect(await leaderSees(db, 1, "أ")).toHaveLength(1);
  });
});
