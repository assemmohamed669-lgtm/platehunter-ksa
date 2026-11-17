import { describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, sqlFile, U } from "./helpers/groupSqlDb";

/** 🔒 الشهايد الخاصة على Postgres حقيقي (`docs/sql/cert-private.sql`): ٣ جداول للسيرفر بس، والملف بيتشغّل مرتين. */
const SQL = sqlFile("cert-private.sql");

async function ready(): Promise<PGlite> {
  const db = await makeGroupDb();
  await db.exec(SQL);
  return db;
}

describe("🗄️ cert-private.sql", () => {
  it("🔴 الجداول اتعملت وحالة الإشعار ليها صف واحد فاضي (أول مرة بيعلّم بس)", async () => {
    const db = await ready();
    const s = await db.query("select id, last_created_at from public.cert_push_state_private");
    expect(s.rows).toEqual([{ id: 1, last_created_at: null }]);
    await db.query("insert into public.cert_daily_private (file_id, day, created_at) values ('abcdefghij1', '2026-11-17', now())");
    const r = await db.query<{ cert_no: string | null; tenant: string | null; parsed: boolean }>("select cert_no, tenant, parsed from public.cert_daily_private");
    expect(r.rows).toEqual([{ cert_no: null, tenant: null, parsed: false }]);
  });

  it("🔴 الوضع «الجديد بس» أو «الجديد والقديم» بس", async () => {
    const db = await ready();
    await db.query("insert into public.cert_private_access (agent_id, mode) values ($1, 'private_only')", [U(1)]);
    await db.query("insert into public.cert_private_access (agent_id) values ($1)", [U(2)]);
    const r = await db.query<{ mode: string }>("select mode from public.cert_private_access order by agent_id");
    expect(r.rows.map((x) => x.mode)).toEqual(["private_only", "both"]);
    await expect(db.query("insert into public.cert_private_access (agent_id, mode) values ($1, 'everyone')", [U(3)])).rejects.toThrow();
  });

  it("🔴 المندوب مايقراش ولا يكتب في أي جدول منهم (السيرفر بس)", async () => {
    const db = await ready();
    for (const t of ["cert_daily_private", "cert_push_state_private", "cert_private_access"]) {
      await expect(asUser(db, U(1), `select * from public.${t}`)).rejects.toThrow(/permission denied/);
    }
    await expect(asUser(db, U(1), "insert into public.cert_private_access (agent_id, mode) values ($1, 'both')", [U(1)])).rejects.toThrow(/permission denied/);
  });

  it("الملف بيتشغّل مرتين من غير ما يبوّظ حاجة", async () => {
    const db = await ready();
    await db.query("insert into public.cert_private_access (agent_id, mode) values ($1, 'both')", [U(1)]);
    await db.exec(SQL);
    const n = await db.query<{ n: number }>("select count(*)::int as n from public.cert_private_access");
    expect(n.rows[0].n).toBe(1);
    const s = await db.query<{ n: number }>("select count(*)::int as n from public.cert_push_state_private");
    expect(s.rows[0].n).toBe(1);
  });
});
