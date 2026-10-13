import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ☁️ أي حاجة تتصدّر بتترفع للسيرفر **على طول** — المالك (١٣ أكتوبر ٢٠٢٦): «اة ترفع للسيرفر علي طول اي حاجه تتصدر
 * وارفع للكل». كان التصدير في صفحة التشييك بيحفظ على الموبايل بس، والرفع بيستنى فتحة الصفحة الجاية.
 */
const server: { rows: Map<string, Record<string, unknown>>; batches: number; delayMs: number } = { rows: new Map(), batches: 0, delayMs: 0 };
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: () => ({
      upsert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        server.batches++;
        if (server.delayMs) await new Promise((r) => setTimeout(r, server.delayMs));
        for (const r of Array.isArray(rows) ? rows : [rows]) server.rows.set(String(r.local_id), r);
        return { error: null, status: 201 };
      },
    }),
    auth: { getSession: async () => ({ data: { session: { user: { id: "agent-1" } } } }) },
  },
}));

import { scheduleFieldChecksUpload } from "@/lib/syncFieldCheck";
import { saveFieldCheckEntries, getAllFieldCheckEntriesRaw, type FieldCheckEntry } from "@/lib/idb";

const A = "agent-1";
const e = (n: number): FieldCheckEntry => ({
  id: `fc-${n}`, agentId: A, plate: `ابح${1000 + n}`, row: {}, method: "voice", checkedAt: new Date(Date.UTC(2026, 9, 13, 10, n)).toISOString(),
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  server.rows = new Map(); server.batches = 0; server.delayMs = 0;
  await new Promise<void>((res) => { const r = indexedDB.deleteDatabase("platehunter"); r.onsuccess = r.onerror = r.onblocked = () => res(); });
});

describe("☁️ الرفع بعد التصدير على طول", () => {
  it("🔴 تصدير ⇒ اللوحات على السيرفر في ثواني — ومتعلّمة «اترفعت»", async () => {
    await saveFieldCheckEntries([e(1), e(2), e(3)]);
    const results: unknown[] = [];
    scheduleFieldChecksUpload(A, (r) => results.push(r), 10);
    await wait(150);
    expect([...server.rows.keys()].sort()).toEqual(["fc-1", "fc-2", "fc-3"]);
    expect((await getAllFieldCheckEntriesRaw(A)).every((x) => x.synced === true)).toBe(true);
    expect(results).toHaveLength(1);
  });

  it("🔴 كذا تصدير ورا بعض ⇒ رفعة واحدة (على دفعة) مش رفعة لكل لوحة", async () => {
    await saveFieldCheckEntries([e(1), e(2)]);
    scheduleFieldChecksUpload(A, undefined, 20);
    scheduleFieldChecksUpload(A, undefined, 20);
    scheduleFieldChecksUpload(A, undefined, 20);
    await wait(200);
    expect(server.rows.size).toBe(2);
    expect(server.batches).toBe(1);
  });

  it("🔴 لوحة اتصدّرت والرفع اللي قبلها لسه شغّال ⇒ بتترفع بعده (ماتتنساش)", async () => {
    server.delayMs = 80;
    await saveFieldCheckEntries([e(1)]);
    scheduleFieldChecksUpload(A, undefined, 5);
    await wait(30);                                  // الرفع الأول شغّال
    await saveFieldCheckEntries([e(2)]);
    scheduleFieldChecksUpload(A, undefined, 5);
    await wait(400);
    expect([...server.rows.keys()].sort()).toEqual(["fc-1", "fc-2"]);
  });

  it("من غير حساب معروف ⇒ بياخده من الجلسة", async () => {
    await saveFieldCheckEntries([e(1)]);
    scheduleFieldChecksUpload(undefined, undefined, 5);
    await wait(150);
    expect(server.rows.has("fc-1")).toBe(true);
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 صفحة التشييك: كل حفظ سجل بيعدّي على «احفظ وارفع» — ولما النت يرجع بيرفع", () => {
    const p = read("app/(app)/instant-check/page.tsx");
    expect(p).toMatch(/const saveRecord = useCallback\(async \(entry: FieldCheckEntry\) => \{\n\s+await saveFieldCheckEntry\(entry\);\n\s+uploadSoon\(\);/);
    // مافيش حفظ سجل من غير رفع غير جوّه saveRecord نفسها
    expect(p.match(/saveFieldCheckEntry\(/g)).toHaveLength(1);
    expect(p).toMatch(/window\.addEventListener\("online", onOnline\);/);
  });
  it("🔴 صفحة التسجيل القديمة كمان", () => {
    expect(read("app/(app)/registration/page.tsx")).toMatch(/scheduleFieldChecksUpload\(/);
  });
});
