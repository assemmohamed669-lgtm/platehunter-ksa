import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🔄 زرار «مزامنة» — المالك (١٣ أكتوبر ٢٠٢٦): «زر المزامنه يرفع بس اللي ناقص على السيرفر أو اللي لسه مترفعش،
 * وينزّل الناقص بس ... اهم حاجه عندي شغل المندوب يكون محفوظ ليه». كان بيرفع **كل** سجلات المندوب من الأول (١٣ ألف
 * طلب لمندوب عنده ١٣ ألف سجل) وينزّلهم كلهم تاني. السوبر أدمن الأول.
 */
type SRow = { id: string; local_id: string | null; agent_id: string; plate: string; checked_at: string; extra?: Record<string, string>; team?: string | null };
const server: { rows: SRow[]; upserted: string[]; deleted: string[]; selectAll: number; failIds?: boolean } = { rows: [], upserted: [], deleted: [], selectAll: 0 };

function query() {
  const st = { cols: "*", head: false, filters: [] as ((r: SRow) => boolean)[], orders: [] as [string, boolean][], range: null as [number, number] | null, del: false, delIds: [] as string[] };
  const exec = () => {
    let rows = server.rows.filter((r) => st.filters.every((f) => f(r)));
    if (st.del) {
      const gone = new Set(rows.map((r) => r.local_id));
      server.rows = server.rows.filter((r) => !gone.has(r.local_id));
      server.deleted.push(...[...gone].filter(Boolean) as string[]);
      return { data: null, error: null, status: 204 };
    }
    if (server.failIds && st.cols === "local_id") return { data: null, error: { message: "نت" } };
    if (st.head) return { data: null, count: rows.length, error: null };
    if (st.cols === "*") server.selectAll++;
    rows = [...rows].sort((a, b) => {
      for (const [c, asc] of st.orders) {
        const x = String((a as Record<string, unknown>)[c]); const y = String((b as Record<string, unknown>)[c]);
        if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });
    if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
    const data = st.cols === "*" ? rows : rows.map((r) => Object.fromEntries(st.cols.split(",").map((c) => [c.trim(), (r as Record<string, unknown>)[c.trim()]])));
    return { data, error: null };
  };
  const q = {
    select(cols: string, opts?: { head?: boolean }) { st.cols = cols; st.head = !!opts?.head; return q; },
    eq(c: string, v: unknown) { st.filters.push((r) => (r as Record<string, unknown>)[c] === v); return q; },
    not(c: string, op: string, v: unknown) { if (op === "is" && v === null) st.filters.push((r) => (r as Record<string, unknown>)[c] != null); return q; },
    in(c: string, vs: unknown[]) { const s = new Set(vs); st.filters.push((r) => s.has((r as Record<string, unknown>)[c])); return q; },
    order(c: string, o?: { ascending?: boolean }) { st.orders.push([c, o?.ascending !== false]); return q; },
    range(a: number, b: number) { st.range = [a, b]; return q; },
    gt(c: string, v: string) { st.filters.push((r) => String((r as Record<string, unknown>)[c]) > v); return q; },
    limit(n: number) { st.range = [0, n - 1]; return q; },
    delete() { st.del = true; return q; },
    upsert(rows: SRow | SRow[]) {
      for (const r of Array.isArray(rows) ? rows : [rows]) {
        server.upserted.push(r.local_id as string);
        const i = server.rows.findIndex((x) => x.local_id === r.local_id);
        const full = { id: `srv-${r.local_id}`, ...r };
        if (i >= 0) server.rows[i] = { ...server.rows[i], ...r }; else server.rows.push(full as SRow);
      }
      return Promise.resolve({ error: null, status: 201 });
    },
    then(res: (v: unknown) => void) { res(exec()); },
  };
  return q;
}
const A = "agent-1";
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: () => query(),
    auth: { getSession: async () => ({ data: { session: { user: { id: "agent-1" } } } }) },
  },
}));

import { syncFieldChecksSmart } from "@/lib/syncFieldCheck";
import { saveFieldCheckEntries, getAllFieldCheckEntriesRaw, deleteFieldCheckEntries, type FieldCheckEntry } from "@/lib/idb";

const sRow = (n: number): SRow => ({
  id: `srv-${n}`, local_id: `fc-${n}`, agent_id: A, plate: `ابح${1000 + n}`,
  checked_at: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), extra: { "الحي": "النسيم" },
});
const local = (n: number, extra: Partial<FieldCheckEntry> = {}): FieldCheckEntry => ({
  id: `fc-${n}`, agentId: A, plate: `ابح${1000 + n}`, row: {}, method: "voice",
  checkedAt: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), synced: true, ...extra,
});

beforeEach(async () => {
  server.rows = []; server.upserted = []; server.deleted = []; server.selectAll = 0; server.failIds = false;
  try { localStorage.clear(); } catch { /* */ }
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("platehunter"); r.onsuccess = r.onerror = r.onblocked = () => res(); });
});

describe("🔄 «مزامنة»: يرفع الناقص بس وينزّل الناقص بس", () => {
  it("🔴 كله متزامن ⇒ مابيرفعش ولا سجل ومابينزّلش ولا سجل", async () => {
    server.rows = Array.from({ length: 30 }, (_, i) => sRow(i));
    await saveFieldCheckEntries(Array.from({ length: 30 }, (_, i) => local(i)));
    const r = await syncFieldChecksSmart(A);
    expect(r).toMatchObject({ uploaded: 0, downloaded: 0 });
    expect(server.upserted).toEqual([]);
    expect(server.selectAll).toBe(0);
  });

  it("🔴 لوحات لسه مترفعتش + تعديل محلي ⇒ بيترفعوا هما بس", async () => {
    server.rows = [sRow(1), sRow(2)];
    await saveFieldCheckEntries([local(1), local(2, { synced: false, plate: "متعدّلة" }), local(3, { synced: false })]);
    const r = await syncFieldChecksSmart(A);
    expect(server.upserted.sort()).toEqual(["fc-2", "fc-3"]);
    expect(r.uploaded).toBe(2);
    expect(server.rows.find((x) => x.local_id === "fc-2")!.plate).toBe("متعدّلة");
    expect((await getAllFieldCheckEntriesRaw(A)).every((e) => e.synced === true)).toBe(true);
  });

  it("🔴 سجل متعلّم «اترفع» بس مش على السيرفر (ضاع) ⇒ بيترفع تاني", async () => {
    server.rows = [sRow(1)];
    await saveFieldCheckEntries([local(1), local(2)]);   // fc-2 «اترفع» بس مش موجود على السيرفر
    const r = await syncFieldChecksSmart(A);
    expect(server.upserted).toEqual(["fc-2"]);
    expect(r.uploaded).toBe(1);
  });

  it("🔴 ناقص على الموبايل ⇒ بينزل هو بس — وسجلات الموبايل مايتكتبش فوقها", async () => {
    server.rows = [{ ...sRow(1), plate: "نسخةالسيرفر" }, sRow(2), sRow(3)];
    await saveFieldCheckEntries([local(1, { plate: "نسخةالموبايل" })]);
    const r = await syncFieldChecksSmart(A);
    expect(r.downloaded).toBe(2);
    const got = await getAllFieldCheckEntriesRaw(A);
    expect(got.map((e) => e.id).sort()).toEqual(["fc-1", "fc-2", "fc-3"]);
    expect(got.find((e) => e.id === "fc-1")!.plate).toBe("نسخةالموبايل");
  });

  it("🔴 اللي المندوب مسحه بإيده ⇒ المسح يوصل السيرفر ومايرجعش", async () => {
    server.rows = [sRow(1), sRow(2)];
    await saveFieldCheckEntries([local(1), local(2)]);
    await deleteFieldCheckEntries(["fc-2"]);
    await syncFieldChecksSmart(A);
    expect(server.deleted).toEqual(["fc-2"]);
    expect((await getAllFieldCheckEntriesRaw(A)).map((e) => e.id)).toEqual(["fc-1"]);
    expect(server.upserted).toEqual([]);
  });

  it("🔴 النت وقع وهو بيجيب الأرقام ⇒ اللي مستني بيترفع برضه (شغل المندوب الأول)", async () => {
    server.rows = [sRow(1)];
    await saveFieldCheckEntries([local(1), local(2, { synced: false })]);
    server.failIds = true;
    const r = await syncFieldChecksSmart(A);
    expect(server.upserted).toEqual(["fc-2"]);
    expect(r.error).toBeTruthy();
  });
});

describe("🔴 التوصيل في القايمة الجانبية", () => {
  const m = readFileSync(path.resolve(__dirname, "..", "components/AppMenu.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("🔴 السوبر أدمن: «مزامنة» الذكية — والباقي زي الأول بالحرف", () => {
    expect(m).toMatch(/if \(safeDraftsOn\(\)\) \{\n\s+const pushR = await forceSyncAll\(uid\);\n\s+const f = await syncFieldChecksSmart\(uid\);/);
    expect(m).toMatch(/const pushF = await pushFieldChecks\(uid\);/);
    expect(m).toMatch(/const pullF = await restoreFieldChecks\(uid\);/);
  });
});
