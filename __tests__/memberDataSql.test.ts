import { describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, sqlFile, U } from "./helpers/groupSqlDb";

/** 🗂️ داتا لكل عضو على Postgres حقيقي (`docs/sql/member-data.sql`): الجدول والمخزن مالهمش وصول مباشر — السيرفر بس. */
const SQL = sqlFile("member-data.sql");

async function ready(): Promise<PGlite> {
  const db = await makeGroupDb();
  await db.exec(`create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean);`);
  for (const n of [1, 2]) await db.query("insert into public.profiles (id, username, team) values ($1, $2, 'مكة')", [U(n), `مندوب ${n}`]);
  await db.exec(SQL);
  await db.query("insert into public.member_data_files (team, agent_id, path, file_name) values ('مكة', $1, 'x/y.xlsx', 'مكة.xlsx')", [U(2)]);
  return db;
}

describe("🔒 مفيش وصول مباشر من التطبيق", () => {
  it("العضو صاحب الملف نفسه مايقراش الجدول (بياخد لينك من السيرفر)", async () => {
    const db = await ready();
    await expect(asUser(db, U(2), "select * from public.member_data_files")).rejects.toThrow(/permission denied/);
  });
  it("ومايكتبش (ولا المسئول) — الكتابة من السيرفر بعد التحقق", async () => {
    const db = await ready();
    await expect(asUser(db, U(1), "insert into public.member_data_files (team, agent_id, path, file_name) values ('مكة', $1, 'a', 'b')", [U(1)])).rejects.toThrow(/permission denied/);
  });
  it("المخزن خاص", async () => {
    const db = await ready();
    const b = await db.query<{ public: boolean }>("select public from storage.buckets where id = 'member-data'");
    expect(b.rows).toEqual([{ public: false }]);
  });
  it("ملف واحد لكل عضو في المجموعة + الملف بيتشغّل مرتين", async () => {
    const db = await ready();
    await expect(db.query("insert into public.member_data_files (team, agent_id, path, file_name) values ('مكة', $1, 'z', 'z')", [U(2)])).rejects.toThrow();
    await db.exec(SQL);
    const r = await db.query<{ n: number }>("select count(*)::int as n from public.member_data_files");
    expect(r.rows[0].n).toBe(1);
  });
});
