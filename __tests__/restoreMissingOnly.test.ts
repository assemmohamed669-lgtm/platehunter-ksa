import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 📥 الاسترجاع بيضيف **الناقص بس** — المالك (١٣ أكتوبر ٢٠٢٦): «يفضل سجلات المندوب علي تليفونه ولو فيه ناقص
 * يتضاف عليه الناقص بس ... ولو غير تليفونه او حاجه راحت بالغلط من السجلات بتاعته ترجعله كل سجلاته المهم لما يفتح
 * البرنامج سجلاته كلها تقراء بدون نقص».
 *
 * كانت صفحة التشييك بتنزّل **كل** سجلات المندوب من السيرفر في **كل** فتحة وتكتبها فوق الموبايل: ٣٩٢ ألف طلب في
 * ٢٩ يوم، و١٨٨ جيجا ملفات مؤقتة على الداتابيز (٩٩٪ منها)، ونت وبطارية المناديب على الفاضي.
 */

// ── سيرفر وهمي: جدول field_checks في الذاكرة ─────────────────────────────────────────
type SRow = { id: string; local_id: string | null; agent_id: string; plate: string; checked_at: string; extra?: Record<string, string> };
const server: { rows: SRow[]; calls: { select: string; count: boolean; inSize: number }[]; failIds?: boolean } = { rows: [], calls: [] };

function query(table: string) {
  const st = { table, cols: "*", head: false, count: false, filters: [] as ((r: SRow) => boolean)[], orders: [] as [string, boolean][], range: null as [number, number] | null, inSize: 0 };
  const q = {
    select(cols: string, opts?: { count?: string; head?: boolean }) { st.cols = cols; st.count = !!opts?.count; st.head = !!opts?.head; return q; },
    eq(c: string, v: unknown) { st.filters.push((r) => (r as Record<string, unknown>)[c] === v); return q; },
    not(c: string, op: string, v: unknown) { if (op === "is" && v === null) st.filters.push((r) => (r as Record<string, unknown>)[c] != null); return q; },
    in(c: string, vs: unknown[]) { st.inSize = vs.length; const s = new Set(vs); st.filters.push((r) => s.has((r as Record<string, unknown>)[c])); return q; },
    order(c: string, o?: { ascending?: boolean }) { st.orders.push([c, o?.ascending !== false]); return q; },
    range(a: number, b: number) { st.range = [a, b]; return q; },
    then(res: (v: unknown) => void, rej?: (e: unknown) => void) {
      try {
        server.calls.push({ select: st.cols, count: st.count, inSize: st.inSize });
        if (server.failIds && st.cols === "local_id") return res({ data: null, error: { message: "نت" } });
        let rows = server.rows.filter((r) => st.filters.every((f) => f(r)));
        if (st.head) return res({ data: null, count: rows.length, error: null });
        rows = [...rows].sort((a, b) => {
          for (const [c, asc] of st.orders) {
            const x = String((a as Record<string, unknown>)[c]); const y = String((b as Record<string, unknown>)[c]);
            if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
          }
          return 0;
        });
        if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
        const data = st.cols === "*" ? rows : rows.map((r) => Object.fromEntries(st.cols.split(",").map((c) => [c.trim(), (r as Record<string, unknown>)[c.trim()]])));
        return res({ data, error: null });
      } catch (e) { rej?.(e); }
    },
  };
  return q;
}
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: (t: string) => query(t), auth: {} } }));

import { restoreMissingFieldChecks, needsRecordsCheck, RECORDS_CHECK_EVERY_MS } from "@/lib/syncFieldCheck";
import { saveFieldCheckEntries, getAllFieldCheckEntriesRaw, deleteFieldCheckEntries, type FieldCheckEntry } from "@/lib/idb";

const A = "agent-1";
const sRow = (n: number, agent = A): SRow => ({
  id: `srv-${agent}-${n}`, local_id: `fc-${agent}-${n}`, agent_id: agent, plate: `ابح${String(1000 + n)}`,
  checked_at: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), extra: { "الحي": "النسيم" },
});
const local = (n: number, extra: Partial<FieldCheckEntry> = {}): FieldCheckEntry => ({
  id: `fc-${A}-${n}`, agentId: A, plate: `ابح${String(1000 + n)}`, row: {}, method: "voice",
  checkedAt: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), synced: true, ...extra,
});
const selectAllCalls = () => server.calls.filter((c) => c.select === "*").length;

async function wipeLocal() {
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("platehunter"); r.onsuccess = r.onerror = r.onblocked = () => res(); });
}

beforeEach(async () => {
  server.rows = []; server.calls = []; server.failIds = false;
  try { localStorage.clear(); } catch { /* */ }
  await wipeLocal();
});

describe("قرار «محتاج أراجع ولا لأ»", () => {
  const now = 10 * RECORDS_CHECK_EVERY_MS;
  it("🔴 السيرفر عنده أكتر من اللي على الموبايل ⇒ أراجع", () => {
    expect(needsRecordsCheck({ serverCount: 101, localSynced: 100, lastCheckAt: now - 1000, now })).toBe(true);
  });
  it("🔴 الموبايل عنده نفس العدد واتراجع النهارده ⇒ ولا طلب", () => {
    expect(needsRecordsCheck({ serverCount: 100, localSynced: 100, lastCheckAt: now - 1000, now })).toBe(false);
    expect(needsRecordsCheck({ serverCount: 90, localSynced: 100, lastCheckAt: now - 1000, now })).toBe(false);
  });
  it("🔴 أول مرة، أو عدّى يوم ⇒ أراجع (احتياط)", () => {
    expect(needsRecordsCheck({ serverCount: 100, localSynced: 100, lastCheckAt: null, now })).toBe(true);
    expect(needsRecordsCheck({ serverCount: 100, localSynced: 100, lastCheckAt: now - RECORDS_CHECK_EVERY_MS, now })).toBe(true);
  });
});

describe("📥 الاسترجاع بيضيف الناقص بس", () => {
  it("🔴 موبايل جديد (فاضي) ⇒ كل السجلات بترجع، كاملة بموقعها", async () => {
    server.rows = Array.from({ length: 450 }, (_, i) => sRow(i));
    const r = await restoreMissingFieldChecks(A);
    expect(r).toMatchObject({ restored: 450 });
    const got = await getAllFieldCheckEntriesRaw(A);
    expect(got).toHaveLength(450);
    expect(got.every((e) => e.synced === true && e.row["الحي"] === "النسيم")).toBe(true);
  });

  it("🔴 كل السجلات على الموبايل ⇒ مابينزّلش ولا سجل (طلب عدّ صغير بس بعد أول مراجعة)", async () => {
    server.rows = Array.from({ length: 50 }, (_, i) => sRow(i));
    await saveFieldCheckEntries(Array.from({ length: 50 }, (_, i) => local(i)));
    await restoreMissingFieldChecks(A);                // أول مرة: مراجعة بالأرقام — ولا سجل كامل
    expect(selectAllCalls()).toBe(0);
    server.calls = [];
    const r = await restoreMissingFieldChecks(A);      // الفتحة الجاية: عدّ بس
    expect(r).toMatchObject({ restored: 0, skipped: true });
    expect(server.calls).toEqual([{ select: "id", count: true, inSize: 0 }]);
  });

  it("🔴 ناقص ٣ (اتسجّلوا من موبايل تاني) ⇒ بينزّل التلاتة دول بس", async () => {
    server.rows = Array.from({ length: 40 }, (_, i) => sRow(i));
    await saveFieldCheckEntries(Array.from({ length: 37 }, (_, i) => local(i)));
    const r = await restoreMissingFieldChecks(A);
    expect(r).toMatchObject({ restored: 3 });
    const downloaded = server.calls.filter((c) => c.select === "*").reduce((n, c) => n + c.inSize, 0);
    expect(downloaded).toBe(3);
    expect(await getAllFieldCheckEntriesRaw(A)).toHaveLength(40);
  });

  it("🔴 **سجلات الموبايل عمرها ما يتكتب فوقها** — حتى لو نسخة السيرفر مختلفة", async () => {
    server.rows = [{ ...sRow(1), plate: "نسخةالسيرفر" }, sRow(2)];
    await saveFieldCheckEntries([local(1, { plate: "نسخةالموبايل", row: { "ملاحظة": "عدّلها المندوب" } })]);
    await restoreMissingFieldChecks(A);
    const got = await getAllFieldCheckEntriesRaw(A);
    expect(got.find((e) => e.id === `fc-${A}-1`)!.plate).toBe("نسخةالموبايل");
    expect(got.find((e) => e.id === `fc-${A}-1`)!.row["ملاحظة"]).toBe("عدّلها المندوب");
    expect(got).toHaveLength(2);
  });

  it("🔴 تعديل محلي لسه مترفعش مايتلمسش", async () => {
    server.rows = [sRow(1)];
    await saveFieldCheckEntries([local(1, { synced: false, plate: "متعدّلة" })]);
    await restoreMissingFieldChecks(A);
    expect((await getAllFieldCheckEntriesRaw(A))[0]).toMatchObject({ plate: "متعدّلة", synced: false });
  });

  it("🔴 سجل المندوب مسحه وسه المسح ماوصلش السيرفر ⇒ مايرجعش", async () => {
    server.rows = [sRow(1), sRow(2)];
    await saveFieldCheckEntries([local(1), local(2)]);
    await deleteFieldCheckEntries([`fc-${A}-2`]);   // المندوب مسحه — الشاهدة لسه ماوصلتش السيرفر
    await restoreMissingFieldChecks(A);
    expect((await getAllFieldCheckEntriesRaw(A)).map((e) => e.id)).toEqual([`fc-${A}-1`]);
  });

  it("🔴 سجلات مندوب تاني عمرها ما تيجي", async () => {
    server.rows = [sRow(1), sRow(2, "agent-2")];
    await restoreMissingFieldChecks(A);
    expect((await getAllFieldCheckEntriesRaw(A)).map((e) => e.id)).toEqual([`fc-${A}-1`]);
  });

  it("🔴 النت وقع وسط المراجعة ⇒ الموبايل زي ما هو، والمراجعة تتعاد الفتحة الجاية", async () => {
    server.rows = [sRow(1), sRow(2)];
    await saveFieldCheckEntries([local(1)]);
    server.failIds = true;
    const r = await restoreMissingFieldChecks(A);
    expect(r.error).toBeTruthy();
    expect(await getAllFieldCheckEntriesRaw(A)).toHaveLength(1);
    server.failIds = false; server.calls = [];
    expect(await restoreMissingFieldChecks(A)).toMatchObject({ restored: 1 });
  });

  it("سجل على السيرفر من غير رقم محلي بيتتجاهل (مايتعملش مكانه سجل فاضي)", async () => {
    server.rows = [sRow(1), { ...sRow(2), local_id: null }];
    await restoreMissingFieldChecks(A);
    expect((await getAllFieldCheckEntriesRaw(A)).map((e) => e.id)).toEqual([`fc-${A}-1`]);
  });

  it("الرقم بيتعدّ: «٢٠٠ من ٤٥٠»", async () => {
    server.rows = Array.from({ length: 450 }, (_, i) => sRow(i));
    const seen: [number, number][] = [];
    await restoreMissingFieldChecks(A, (d, t) => seen.push([d, t]));
    expect(seen.at(-1)).toEqual([450, 450]);
    expect(seen[0][1]).toBe(450);
  });
});

describe("🔴 التوصيل", () => {
  const p = readFileSync(path.resolve(__dirname, "..", "app/(app)/instant-check/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("🔴 فتح صفحة التشييك: الناقص بس (السوبر أدمن الأول) — والباقي زي الأول", () => {
    expect(p).toMatch(/await \(safeDraftsOn\(\) \? restoreMissingFieldChecks : restoreFieldChecks\)\(uid, \(done, total\) => \{/);
  });
  it("🔒 زرار «مزامنة» وإخفاء سجلات المجموعة بيفضلوا استرجاع كامل", () => {
    expect(readFileSync(path.resolve(__dirname, "..", "components/AppMenu.tsx"), "utf8")).toMatch(/const pullF = await restoreFieldChecks\(uid\);/);
    expect(readFileSync(path.resolve(__dirname, "..", "lib/groupLocksClient.ts"), "utf8")).toMatch(/m\.restoreFieldChecks\(uid\)/);
  });
});
