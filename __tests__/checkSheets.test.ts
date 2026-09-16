import { describe, it, expect } from "vitest";
import { buildCombinedCheckIndex, type CheckSource } from "@/lib/checkSheets";

/**
 * المندوب بيرفع ملف تشييك أساسي، وبعدين بتنزل إحالة أو اتنين جداد مش موجودين
 * فيه. بدل ما يستنى ملف تشييك جديد، بيرفعهم في مربعات إضافية — والبرنامج
 * بيتعامل مع الكل **كأنه شيت واحد**: التشييك اليدوي والصوتي والكاميرا والشاص،
 * وأي تطابق في أي ملف = «مطلوبة» + سرينة.
 *
 * الأساسي بيكسب لو نفس اللوحة في أكتر من ملف — بياناته هي المرجع.
 */
const src = (plateCol: string, plates: string[], extra: Record<string, string> = {}): CheckSource => ({
  headers: [plateCol, ...Object.keys(extra)],
  rows: plates.map((p) => ({ [plateCol]: p, ...extra })),
});

describe("buildCombinedCheckIndex", () => {
  it("ملف واحد — زي ما كان بالظبط", () => {
    const idx = buildCombinedCheckIndex([src("رقم اللوحة", ["رري3706", "اسر2244"])]);
    expect(idx.size).toBe(2);
    expect(idx.has("رري3706")).toBe(true);
  });

  it("لوحات الملفات الإضافية بتتلاقي زي الأساسي", () => {
    const idx = buildCombinedCheckIndex([
      src("رقم اللوحة", ["رري3706"]),
      src("رقم اللوحة", ["دوا8403"]),
      src("رقم اللوحة", ["سدط2104"]),
    ]);
    expect(idx.size).toBe(3);
    expect(idx.has("دوا8403")).toBe(true);
    expect(idx.has("سدط2104")).toBe(true);
  });

  it("نفس اللوحة في أكتر من ملف — الأساسي بيكسب", () => {
    const idx = buildCombinedCheckIndex([
      src("رقم اللوحة", ["رري3706"], { "البنك": "الأهلي" }),
      src("رقم اللوحة", ["رري3706"], { "البنك": "الراجحي" }),
    ]);
    expect(idx.size).toBe(1);
    expect(idx.get("رري3706")?.["البنك"]).toBe("الأهلي");
  });

  it("بيطبّع اللوحة — مسافات وأ/ا وحروف بنكي إنجليزي", () => {
    const idx = buildCombinedCheckIndex([src("رقم اللوحة", ["ر ر ي 3706", "أسر 2244"])]);
    expect(idx.has("رري3706")).toBe(true);
    expect(idx.has("اسر2244")).toBe(true);
  });

  it("كل ملف بيتقري بعمود لوحته هو — حتى لو الأسماء مختلفة", () => {
    const idx = buildCombinedCheckIndex([
      src("رقم اللوحة", ["رري3706"]),
      src("Plate Number", ["دوا8403"]),
    ]);
    expect(idx.has("رري3706")).toBe(true);
    expect(idx.has("دوا8403")).toBe(true);
  });

  it("الملف الفاضي بيتعدّى بهدوء — مايكسرش الباقي", () => {
    const idx = buildCombinedCheckIndex([
      { headers: [], rows: [] },
      src("رقم اللوحة", ["رري3706"]),
    ]);
    expect(idx.has("رري3706")).toBe(true);
  });

  it("مافيش ملفات = فهرس فاضي", () => {
    expect(buildCombinedCheckIndex([]).size).toBe(0);
  });
});
