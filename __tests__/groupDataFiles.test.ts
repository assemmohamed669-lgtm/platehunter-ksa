import { describe, it, expect, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeGroupDb, asUser, sqlFile, U } from "./helpers/groupSqlDb";
import {
  GROUP_FILES_MAX, groupFilePath, groupFileSlot, canSeeGroupFile, planGroupFileAction, syncGroupFilesWith,
  type GroupFileMeta, type GroupFilesSyncDeps, type GroupFileIndexEntry,
} from "@/lib/groupDataFiles";
import { teamStorageKey } from "@/lib/teamData";
import type { RemoteDataState } from "@/lib/remoteDataSlot";

/**
 * 📂 ملفات داتا من مسئول المجموعة — المالك (٦ نوفمبر ٢٠٢٦): «مسئول المجموعه يقدر يرفع اكتر من ملف داتا من صفحه ادارة
 * مجموعتي ويختار الداتا دي تظهر ل مين في مجموعته بالظبط … لحد معين او للمجموعه كلها».
 * قراراته: العضو بيفرز على ملفاته الخاصة + ملفات المجموعة كلها مع بعض · نفس أماكن داتا المجموعة (الفرز / «شهايد
 * النهارده» / «صوت فقط») · «داتا المجموعة» و«داتا الأعضاء» القدام زي ما هم · لكل المجموعات على طول.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("📁 المسار والسلوت", () => {
  it("🔴 المسار محسوب من المجموعة ورقم الملف بس (الاسم مايدخلش فيه)", () => {
    expect(groupFilePath("مكة", F1, "داتا مكة.xlsx")).toBe(`${teamStorageKey("مكة")}/files/${F1}.xlsx`);
    expect(groupFilePath("مكة", F1, "x.CSV")).toBe(`${teamStorageKey("مكة")}/files/${F1}.csv`);
    expect(groupFilePath("مكة", F1, "../../evil.sh")).toBe(`${teamStorageKey("مكة")}/files/${F1}.xlsx`);
    expect(() => groupFilePath("مكة", "../x", "a.xlsx")).toThrow();
    expect(groupFileSlot(F1)).toBe(`gdf-${F1}`);
  });
});

describe("👀 مين يشوف الملف", () => {
  it("🔴 «المجموعة كلها» ⇒ كل الأعضاء (المسئول رافعه أصلاً)", () => {
    const f = { audience: "all" as const, memberIds: [] };
    expect(canSeeGroupFile(f, A, C)).toBe(true);
    expect(canSeeGroupFile(f, B, C)).toBe(true);
    expect(canSeeGroupFile(f, C, C)).toBe(false);
  });
  it("🔴 «أعضاء معيّنين» ⇒ اللي اتعلّم عليهم بس (ولو المسئول علّم على نفسه ياخده)", () => {
    const f = { audience: "members" as const, memberIds: [A, C] };
    expect(canSeeGroupFile(f, A, C)).toBe(true);
    expect(canSeeGroupFile(f, B, C)).toBe(false);
    expect(canSeeGroupFile(f, C, C)).toBe(true);
  });
});

describe("🛡️ طلبات المسئول بتتراجع على السيرفر قبل أي حاجة", () => {
  const ctx = (existing: string[] = []) => ({ team: "مكة", memberIds: [A, B, C], existingIds: existing, newId: NEW });
  it("🔴 رفع ملف جديد ⇒ رقم جديد من السيرفر ومساره", () => {
    expect(planGroupFileAction({ action: "upload-url", fileName: "مكة.xlsx" }, ctx())).toEqual(
      { ok: true, action: "upload-url", id: NEW, path: groupFilePath("مكة", NEW, "مكة.xlsx"), isNew: true });
  });
  it("🔴 تغيير ملف موجود ⇒ نفس رقمه · رقم مش من المجموعة ⇒ مرفوض", () => {
    expect(planGroupFileAction({ action: "upload-url", fileName: "x.xlsx", id: F1 }, ctx([F1]))).toMatchObject({ ok: true, id: F1, isNew: false });
    expect(planGroupFileAction({ action: "upload-url", fileName: "x.xlsx", id: F1 }, ctx([]))).toMatchObject({ ok: false });
  });
  it(`🔴 حد أقصى ${GROUP_FILES_MAX} ملف للمجموعة`, () => {
    const full = Array.from({ length: GROUP_FILES_MAX }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`);
    expect(planGroupFileAction({ action: "upload-url", fileName: "x.xlsx" }, ctx(full))).toMatchObject({ ok: false });
    // تغيير ملف موجود مسموح حتى لو وصل للحد
    expect(planGroupFileAction({ action: "upload-url", fileName: "x.xlsx", id: full[0] }, ctx(full))).toMatchObject({ ok: true });
  });
  it("🔴 التثبيت: المسار لازم يطابق · الأعضاء من المجموعة بس · «أعضاء معيّنين» من غير حد ⇒ مرفوض", () => {
    const base = { action: "commit", id: NEW, fileName: "مكة.xlsx", path: groupFilePath("مكة", NEW, "مكة.xlsx"), rowCount: 10, plateCount: 9 };
    expect(planGroupFileAction({ ...base, audience: "all" }, ctx())).toEqual({
      ok: true, action: "commit", id: NEW, path: base.path, fileName: "مكة.xlsx", rowCount: 10, plateCount: 9, audience: "all", memberIds: [], isNew: true,
    });
    expect(planGroupFileAction({ ...base, audience: "members", memberIds: [A, B] }, ctx())).toMatchObject({ ok: true, audience: "members", memberIds: [A, B] });
    expect(planGroupFileAction({ ...base, path: "x/other.xlsx", audience: "all" }, ctx())).toMatchObject({ ok: false });
    expect(planGroupFileAction({ ...base, audience: "members", memberIds: [A, "44444444-4444-4444-8444-444444444444"] }, ctx())).toMatchObject({ ok: false });
    expect(planGroupFileAction({ ...base, audience: "members", memberIds: [] }, ctx())).toMatchObject({ ok: false });
    expect(planGroupFileAction({ ...base, audience: "weird" }, ctx())).toMatchObject({ ok: false });
  });
  it("🔴 «مين يشوفه» والمسح ⇒ لملف من المجموعة دي بس", () => {
    expect(planGroupFileAction({ action: "audience", id: F1, audience: "members", memberIds: [B] }, ctx([F1])))
      .toEqual({ ok: true, action: "audience", id: F1, audience: "members", memberIds: [B] });
    expect(planGroupFileAction({ action: "audience", id: F1, audience: "all" }, ctx([]))).toMatchObject({ ok: false });
    expect(planGroupFileAction({ action: "delete", id: F1 }, ctx([F1]))).toEqual({ ok: true, action: "delete", id: F1 });
    expect(planGroupFileAction({ action: "delete", id: F1 }, ctx([]))).toMatchObject({ ok: false });
  });
});

// ── المزامنة على موبايل العضو ──
function state(name: string, at: string): RemoteDataState {
  return { table: { headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": name }] }, streamed: false, streamMeta: null, fileName: name, uploadedAt: at };
}
function fakeDeps(remote: { files: GroupFileMeta[]; offline?: boolean; missing?: boolean }) {
  const slots = new Map<string, RemoteDataState>();
  let index: GroupFileIndexEntry[] = [];
  const downloads: string[] = [];
  const d: GroupFilesSyncDeps = {
    list: async () => remote,
    download: async (id) => { downloads.push(id); return new Blob(["x"]); },
    ingest: async (slot, file, at) => { const s = state(file.name, at); slots.set(slot, s); return s; },
    loadLocal: async (slot) => slots.get(slot) ?? null,
    clear: async (slot) => { slots.delete(slot); },
    readIndex: () => index,
    writeIndex: (e) => { index = e; },
  };
  return { d, slots, downloads, index: () => index };
}
const meta = (id: string, fileName: string, updatedAt: string): GroupFileMeta =>
  ({ id, fileName, updatedAt, rowCount: null, plateCount: null, audience: "all", memberIds: [] });

describe("📲 المزامنة على موبايل العضو", () => {
  let f: ReturnType<typeof fakeDeps>;
  beforeEach(() => { f = fakeDeps({ files: [meta(F1, "مكة.xlsx", "2026-11-06T10:00:00Z"), meta(NEW, "الطايف.xlsx", "2026-11-06T11:00:00Z")] }); });

  it("🔴 كل ملف ليه بيتنزّل في سلوت لوحده — ومرة واحدة بس لو ماتغيّرش", async () => {
    const r = await syncGroupFilesWith(f.d);
    expect(r.files.map((x) => x.fileName)).toEqual(["مكة.xlsx", "الطايف.xlsx"]);
    expect(r.files.map((x) => x.slot)).toEqual([groupFileSlot(F1), groupFileSlot(NEW)]);
    expect(f.downloads).toEqual([F1, NEW]);
    await syncGroupFilesWith(f.d);
    expect(f.downloads).toEqual([F1, NEW]);   // ماتنزّلش تاني
  });

  it("🔴 المسئول غيّر الملف ⇒ يتنزّل تاني · شاله (أو شالني منه) ⇒ يتمسح من الموبايل", async () => {
    await syncGroupFilesWith(f.d);
    const g = fakeDeps({ files: [meta(F1, "مكة٢.xlsx", "2026-11-06T12:00:00Z")] });
    // نفس الموبايل (السلوتات والفهرس)
    g.d.loadLocal = f.d.loadLocal; g.d.clear = f.d.clear; g.d.ingest = f.d.ingest;
    g.d.readIndex = f.d.readIndex; g.d.writeIndex = f.d.writeIndex;
    const r = await syncGroupFilesWith(g.d);
    expect(g.downloads).toEqual([F1]);
    expect(r.files.map((x) => x.fileName)).toEqual(["مكة٢.xlsx"]);
    expect(f.slots.has(groupFileSlot(NEW))).toBe(false);
    expect(f.index().map((e) => e.id)).toEqual([F1]);
  });

  it("🔴 من غير نت ⇒ اللي على الموبايل يفضل زي ما هو (مايتمسحش)", async () => {
    await syncGroupFilesWith(f.d);
    const off = fakeDeps({ files: [], offline: true });
    off.d.loadLocal = f.d.loadLocal; off.d.clear = f.d.clear; off.d.readIndex = f.d.readIndex; off.d.writeIndex = f.d.writeIndex;
    const r = await syncGroupFilesWith(off.d);
    expect(r.files.map((x) => x.fileName)).toEqual(["مكة.xlsx", "الطايف.xlsx"]);
    expect(f.slots.size).toBe(2);
  });

  it("🔴 التنزيل فشل ⇒ النسخة القديمة أحسن من مفيش + اسم الملف في الفشل", async () => {
    await syncGroupFilesWith(f.d);
    const g = fakeDeps({ files: [meta(F1, "مكة.xlsx", "2026-11-07T10:00:00Z")] });
    g.d.loadLocal = f.d.loadLocal; g.d.clear = f.d.clear; g.d.readIndex = f.d.readIndex; g.d.writeIndex = f.d.writeIndex;
    g.d.download = async () => null;
    const r = await syncGroupFilesWith(g.d);
    expect(r.files.map((x) => x.fileName)).toEqual(["مكة.xlsx"]);
    expect(r.failed).toEqual(["مكة.xlsx"]);
  });
});

// ── الجدول على Postgres حقيقي (`docs/sql/group-data-files.sql`) ──
const SQL = sqlFile("group-data-files.sql");
async function ready(): Promise<PGlite> {
  const db = await makeGroupDb();
  await db.exec(`create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text, public boolean);`);
  for (const n of [1, 2]) await db.query("insert into public.profiles (id, username, team) values ($1, $2, 'مكة')", [U(n), `مندوب ${n}`]);
  await db.exec(SQL);
  await db.query("insert into public.group_data_files (id, team, path, file_name, audience, member_ids) values ($1, 'مكة', 'x/y.xlsx', 'مكة.xlsx', 'members', array[$2::uuid])", [F1, U(2)]);
  return db;
}

describe("🔒 الجدول — مفيش وصول مباشر من التطبيق (السيرفر بس)", () => {
  it("العضو اللي الملف ليه مايقراش الجدول (بياخد لينك من السيرفر)", async () => {
    const db = await ready();
    await expect(asUser(db, U(2), "select * from public.group_data_files")).rejects.toThrow(/permission denied/);
  });
  it("ومحدش يكتب فيه", async () => {
    const db = await ready();
    await expect(asUser(db, U(1), "insert into public.group_data_files (team, path, file_name) values ('مكة', 'a', 'b')")).rejects.toThrow(/permission denied/);
  });
  it("«مين يشوفه» قيمتين بس + الملف بيتشغّل مرتين من غير مشاكل", async () => {
    const db = await ready();
    await expect(db.query("insert into public.group_data_files (team, path, file_name, audience) values ('مكة', 'a', 'b', 'anyone')")).rejects.toThrow();
    await db.exec(SQL);
    const r = await db.query<{ n: number }>("select count(*)::int as n from public.group_data_files");
    expect(r.rows[0].n).toBe(1);
  });
});
