import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { awaitRecords, fillOwnName } from "@/lib/recordsReady";

/**
 * ⏳ «نتيجة فرز السجلات مابتظهرش على طول» — المالك (٢٠ أكتوبر ٢٠٢٦): «لما بيعمل فرز … نتيجة فرز الداتا بيظهر معاه
 * تمام بس نتيجة فرز السجلات مش بتظهر معاه علي طول يعني لازم يفرز كذا مرة … وبيفرز وهو مش عارف ان المشكله دي موجودة».
 *
 * السبب: جدول السجلات كان بيتبني **في آخر** التحميل في الخلفية — بعد ٣ طلبات نت (الجلسة/البروفايل/أسامي المجموعة)
 * و١٨ ألف سجل — والفرز كان بيقرا الجدول **لحظة الدوسة**: لو لسه ماخلصش ⇒ الفرز يكمّل من غير السجلات في صمت.
 * الحل: السجلات بتتحمّل من الجهاز **على طول** (من غير ما تستنى النت)، والفرز **بيستناها** وبيقرا آخر نسخة.
 */
describe("⏳ الفرز بيستنى السجلات", () => {
  it("لسه بتتحمّل ⇒ بيستنى وبيرجع الجدول اللي اتحمّل (مش الفاضي اللي كان وقت الدوسة)", async () => {
    let current: string | null = null;
    let done!: () => void;
    const ready = new Promise<void>((r) => { done = r; });
    const p = awaitRecords(ready, () => current);
    setTimeout(() => { current = "جدول السجلات"; done(); }, 5);
    expect(await p).toEqual({ value: "جدول السجلات", late: false });
  });
  it("خلصت قبل كده ⇒ على طول", async () => {
    expect(await awaitRecords(Promise.resolve(), () => "ج")).toEqual({ value: "ج", late: false });
    expect(await awaitRecords(null, () => "ج")).toEqual({ value: "ج", late: false });
  });
  it("اتأخّرت أكتر من الحد ⇒ بيكمّل باللي موجود وبيقول «متأخرة» (عشان المندوب يعرف)", async () => {
    vi.useFakeTimers();
    const p = awaitRecords(new Promise<void>(() => {}), () => null, 1000);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toEqual({ value: null, late: true });
    vi.useRealTimers();
  });
  it("التحميل فشل ⇒ بيكمّل باللي موجود (مش متأخرة)", async () => {
    expect(await awaitRecords(Promise.reject(new Error("x")), () => "ج")).toEqual({ value: "ج", late: false });
  });
});

describe("👤 «المندوب» في سجلاتي", () => {
  const t = { headers: ["رقم اللوحة", "المندوب"], rows: [{ "رقم اللوحة": "ابح1234", "المندوب": "" }, { "رقم اللوحة": "حسن5678", "المندوب": "زميل" }] };
  it("الفاضي ⇐ اسمي، والمليان (زميل) زي ما هو", () => {
    expect(fillOwnName(t, "أحمد").rows.map((r) => r["المندوب"])).toEqual(["أحمد", "زميل"]);
  });
  it("مفيش اسم أو مفيش فاضي ⇒ نفس الجدول بالظبط (من غير نسخة)", () => {
    expect(fillOwnName(t, "")).toBe(t);
    const full = { headers: t.headers, rows: [{ "رقم اللوحة": "ا", "المندوب": "أحمد" }] };
    expect(fillOwnName(full, "أحمد")).toBe(full);
  });
});

describe("🔌 صفحة الفرز", () => {
  const src = readFileSync("app/(app)/sorting/page.tsx", "utf8");
  it("السجلات بتتحمّل قبل الشغل اللي بيستنى النت", () => {
    const rec = src.indexOf("recordsReadyRef.current = recordsReady;");
    const team = src.indexOf("const teamReady = (async () => {");
    expect(rec).toBeGreaterThan(0);
    expect(rec).toBeLessThan(team);
  });
  it("الكلي والجديد واللصق بيستنوا السجلات وبيقروا آخر نسخة", () => {
    expect(src.match(/const rec = await recordsForSort\(\);/g)?.length).toBe(3);
    expect(src).toMatch(/if \(!recInData && rec\.table && rec\.plateCol\) \{\s*const tashyeekMatches/);
    expect(src).toMatch(/const recordMatches = rec\.table && rec\.plateCol/);
  });
});
