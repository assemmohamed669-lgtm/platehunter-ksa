import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🕐 التعديل اللي اتعمل من مكان تاني بينزل على الموبايل — المالك (١٣ أكتوبر ٢٠٢٦): «السيرفر يعلّم وقت آخر تعديل لكل
 * سجل، والموبايل ينزّل التعديلات الجديدة بس». (`docs/sql/field-checks-updated-at.sql`)
 */
type SRow = { id: string; local_id: string; agent_id: string; plate: string; checked_at: string; updated_at: string | null; extra?: Record<string, string> };
const server: { rows: SRow[]; calls: number; missingColumn?: boolean } = { rows: [], calls: 0 };

function query() {
  const st = { filters: [] as ((r: SRow) => boolean)[], orders: [] as [string, boolean][], limit: Infinity };
  const q = {
    select() { return q; },
    eq(c: string, v: unknown) { st.filters.push((r) => (r as Record<string, unknown>)[c] === v); return q; },
    not(c: string, op: string, v: unknown) { if (op === "is" && v === null) st.filters.push((r) => (r as Record<string, unknown>)[c] != null); return q; },
    gt(c: string, v: string) { st.filters.push((r) => String((r as Record<string, unknown>)[c]) > v); return q; },
    gte(c: string, v: string) { st.filters.push((r) => String((r as Record<string, unknown>)[c]) >= v); return q; },
    order(c: string, o?: { ascending?: boolean }) { st.orders.push([c, o?.ascending !== false]); return q; },
    limit(n: number) { st.limit = n; return q; },
    then(res: (v: unknown) => void) {
      server.calls++;
      if (server.missingColumn) return res({ data: null, error: { message: "column field_checks.updated_at does not exist", code: "42703" } });
      let rows = server.rows.filter((r) => st.filters.every((f) => f(r)));
      rows = [...rows].sort((a, b) => {
        for (const [c, asc] of st.orders) {
          const x = String((a as Record<string, unknown>)[c]); const y = String((b as Record<string, unknown>)[c]);
          if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
      res({ data: rows.slice(0, st.limit), error: null });
    },
  };
  return q;
}
const A = "agent-1";
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: () => query(), auth: {} } }));

import { pullEditedFieldChecks, EDITS_PAGE } from "@/lib/syncFieldCheck";
import { saveFieldCheckEntries, getAllFieldCheckEntriesRaw, deleteFieldCheckEntries, type FieldCheckEntry } from "@/lib/idb";

const ts = (s: number) => new Date(Date.UTC(2026, 9, 13, 10, 0, s)).toISOString();
const sRow = (n: number, updated: string | null, plate = `ابح${1000 + n}`): SRow => ({
  id: `srv-${String(n).padStart(4, "0")}`, local_id: `fc-${n}`, agent_id: A, plate, checked_at: ts(0), updated_at: updated, extra: {},
});
const local = (n: number, extra: Partial<FieldCheckEntry> = {}): FieldCheckEntry => ({
  id: `fc-${n}`, agentId: A, plate: `ابح${1000 + n}`, row: {}, method: "voice", checkedAt: ts(0), synced: true, ...extra,
});

beforeEach(async () => {
  server.rows = []; server.calls = 0; server.missingColumn = false;
  try { localStorage.clear(); } catch { /* */ }
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("platehunter"); r.onsuccess = r.onerror = r.onblocked = () => res(); });
});

describe("🕐 التعديلات الجديدة بس", () => {
  it("🔴 سجل اتعدّل من صفحة سجلات المجموعة ⇒ التعديل ينزل على الموبايل", async () => {
    server.rows = [sRow(1, ts(5), "اتعدّلت"), sRow(2, null)];
    await saveFieldCheckEntries([local(1), local(2)]);
    const r = await pullEditedFieldChecks(A);
    expect(r.updated).toBe(1);
    const got = await getAllFieldCheckEntriesRaw(A);
    expect(got.find((e) => e.id === "fc-1")!.plate).toBe("اتعدّلت");
    expect(got.find((e) => e.id === "fc-2")!.plate).toBe("ابح1002");
  });

  it("🔴 الفتحة الجاية: اللي اتنزّل قبل كده مابينزلش تاني — الجديد بس", async () => {
    server.rows = [sRow(1, ts(5), "أول")];
    await saveFieldCheckEntries([local(1), local(2)]);
    await pullEditedFieldChecks(A);
    expect((await pullEditedFieldChecks(A)).updated).toBe(0);
    server.rows.push(sRow(2, ts(9), "تاني"));
    expect((await pullEditedFieldChecks(A)).updated).toBe(1);
    expect((await getAllFieldCheckEntriesRaw(A)).find((e) => e.id === "fc-2")!.plate).toBe("تاني");
  });

  it("🔴 تعديل محلي لسه مترفعش مايتكتبش فوقه (الموبايل أحدث)", async () => {
    server.rows = [sRow(1, ts(5), "نسخةالسيرفر")];
    await saveFieldCheckEntries([local(1, { synced: false, plate: "تعديلي" })]);
    await pullEditedFieldChecks(A);
    expect((await getAllFieldCheckEntriesRaw(A))[0]).toMatchObject({ plate: "تعديلي", synced: false });
  });

  it("🔴 اللي المندوب مسحه مايرجعش", async () => {
    server.rows = [sRow(1, ts(5))];
    await saveFieldCheckEntries([local(1)]);
    await deleteFieldCheckEntries(["fc-1"]);
    await pullEditedFieldChecks(A);
    expect(await getAllFieldCheckEntriesRaw(A)).toHaveLength(0);
  });

  it("🔴 دفعة تعديلات أكبر من الصفحة وبنفس الوقت ⇒ كلها بتنزل (مافيش واحدة بتتنط)", async () => {
    const n = EDITS_PAGE + 7;
    server.rows = Array.from({ length: n }, (_, i) => sRow(i, ts(5), `متعدّلة${i}`));
    await saveFieldCheckEntries(Array.from({ length: n }, (_, i) => local(i)));
    const r = await pullEditedFieldChecks(A);
    expect(r.updated).toBe(n);
    expect((await getAllFieldCheckEntriesRaw(A)).every((e) => e.plate.startsWith("متعدّلة"))).toBe(true);
  });

  it("🔒 العمود لسه ماتعملش على السيرفر ⇒ ولا غلط، والموبايل زي ما هو", async () => {
    server.missingColumn = true;
    await saveFieldCheckEntries([local(1)]);
    expect(await pullEditedFieldChecks(A)).toEqual({ updated: 0 });
    expect(await getAllFieldCheckEntriesRaw(A)).toHaveLength(1);
  });
});

describe("🔴 التوصيل", () => {
  const s = readFileSync(path.resolve(__dirname, "..", "lib/syncFieldCheck.ts"), "utf8").replace(/\r\n/g, "\n");
  it("🔴 فتح التشييك و«مزامنة» الاتنين بينزّلوا التعديلات الجديدة", () => {
    expect(s.match(/await pullEditedFieldChecks\((agentId|uid)\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
