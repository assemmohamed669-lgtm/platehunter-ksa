import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBatchReport, parseReadingSheet, type BatchReport } from "./batchReport";
import { REPORT_SAVE_TIMEOUT_MS, listReports, removeReportPart, saveReportFrom } from "./reportStore";
import { planSessionSave, type ReportPart } from "./sessionReport";

/**
 * ⏱️ تقرير الجلسة (٤ أكتوبر ٢٠٢٦): الصفحة بقت **بتستنى** حفظ التقرير قبل ما
 * التفريغ يخلص (عشان المقطع يتربط بالتقرير، والمقطع الجاي يلاقيه مفتوح).
 * تخزين معلّق (آيفون — نفس عيب `clipStore`) ماينفعش يوقّف التفريغ للأبد.
 */
describe("saveReportFrom — التخزين المعلّق مابيوقّفش التفريغ", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("indexedDB.open مابيردّش ⇒ غلط بعد المهلة (والتفريغ يكمّل)", async () => {
    // طلب فتح مابيرجعش أبداً — لا onsuccess ولا onerror
    vi.stubGlobal("indexedDB", { open: () => ({}) });
    const r = buildBatchReport({ sheet: [], rows: [], audioSec: 1, elapsedMs: 1 });
    const t0 = Date.now();
    await expect(saveReportFrom(() => ({ report: r, also: [] }), 40)).rejects.toThrow("التخزين مابيردّش");
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("المهلة الافتراضية ثواني مش دقايق", () => {
    expect(REPORT_SAVE_TIMEOUT_MS).toBeGreaterThanOrEqual(3000);
    expect(REPORT_SAVE_TIMEOUT_MS).toBeLessThanOrEqual(15000);
  });
});

/**
 * IndexedDB صغير في الذاكرة — قد اللي المخزن بيستخدمه بس (getAll/get/put في
 * معاملة، والمعاملة بتخلص لما كل طلباتها تخلص). عشان نتأكد إن الحفظ بيكتب
 * كل اللي الخطة قالت عليه في نفس المعاملة.
 */
function fakeIndexedDB() {
  const data = new Map<string, unknown>();
  const later = (f: () => void) => setTimeout(f, 0);
  const indexedDB = {
    open: () => {
      const req: Record<string, any> = {};
      later(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          transaction() {
            const t: Record<string, any> = {};
            let pending = 0;
            let done = false;
            const finish = () => later(() => {
              if (!pending && !done) { done = true; t.oncomplete?.(); }
            });
            const request = (fn: () => unknown) => {
              const r: Record<string, any> = {};
              pending++;
              later(() => {
                if (done) return;
                r.result = fn();
                r.onsuccess?.();
                pending--;
                finish();
              });
              return r;
            };
            t.objectStore = () => ({
              getAll: () => request(() => [...data.values()].map((x) => structuredClone(x))),
              get: (id: string) => request(() => structuredClone(data.get(id))),
              put: (v: BatchReport) => request(() => { data.set(v.id, structuredClone(v)); return v.id; }),
            });
            t.abort = () => { done = true; later(() => t.onabort?.()); };
            return t;
          },
        };
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { indexedDB, data };
}

describe("الحفظ في معاملة واحدة (مراجعة ٤ أكتوبر)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sheet = parseReadingSheet("حبك1234\nدرن1452\nسصع5555");
  const rec = (clipId: string, plates: string[], at: number, run = `run-${clipId}`): ReportPart => ({
    clipId,
    startedAtMs: at,
    input: {
      rows: plates.map((p, i) => ({ plate: p, support: 2, t_s: 2 + i * 3 })),
      seqs: [plates],
      chunks: [{ start: 0, end: 20, text: plates.join(" ") }],
      cohereTexts: ["نص كوهير"],
      run,
      audioSec: 20,
      elapsedMs: 1,
    },
  });

  it("«فرّغ تاني» ⇒ التقرير المتحدّث + النسخة القديمة الاتنين بيتحفظوا — ومن غير التشخيص المكرر", async () => {
    const { indexedDB, data } = fakeIndexedDB();
    vi.stubGlobal("indexedDB", indexedDB);
    const first = await saveReportFrom((all) => planSessionSave(all, rec("c1", ["حبك1234"], 1), sheet, 1000));
    expect(data.size).toBe(1);
    expect((data.get(first.id) as BatchReport).diag).toBeUndefined();
    const again = await saveReportFrom((all) => planSessionSave(all, rec("c1", ["حبك1234", "درن1452"], 1, "run-2"), sheet, 2000));
    expect(again.id).toBe(first.id);
    expect(data.size).toBe(2);
    const snap = [...data.values()].find((x) => (x as BatchReport).snapshotOf) as BatchReport;
    expect(snap.snapshotOf).toBe(first.id);
    expect(snap.correct).toBe(1);
    expect((data.get(first.id) as BatchReport).correct).toBe(2);
    expect(await listReports()).toHaveLength(2);
  });

  it("«شيل التسجيل ده» ⇒ التقرير بيتبني من جديد على الباقي في مكانه", async () => {
    const { indexedDB, data } = fakeIndexedDB();
    vi.stubGlobal("indexedDB", indexedDB);
    await saveReportFrom((all) => planSessionSave(all, rec("c1", ["حبك1234"], 1), sheet, 1000));
    const r = await saveReportFrom((all) => planSessionSave(all, rec("c2", ["درن1452", "زور9999"], 2), sheet, 2000));
    expect((data.get(r.id) as BatchReport).parts).toHaveLength(2);
    expect(await removeReportPart(r.id, "c2")).toBe(true);
    const after = data.get(r.id) as BatchReport;
    expect(after.parts!.map((p) => p.clipId)).toEqual(["c1"]);
    expect(after.inventions).toBe(0);
    expect(after.correct).toBe(1);
    expect(after.diag).toBeUndefined();
    expect(await removeReportPart(r.id, "c1")).toBe(false);
  });
});
