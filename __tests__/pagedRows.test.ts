import { describe, it, expect } from "vitest";
import { PAGE_STEP, pageSlice, hasMore, growShown, resetShown } from "@/lib/pagedRows";

/**
 * جدول السجلات كان بيرسم كل الصفوف مرة واحدة. مندوب عنده ٦٠٠٠ سجل → عشرات
 * الآلاف من عناصر الصفحة → سفاري على الأيفون بيقتل الصفحة («حدثت مشكلة بشكل
 * متكرر»). الترقيم بيخلي أول رسم خفيف، والباقي بيتحمّل بالتمرير.
 */
describe("pagedRows — ترقيم صفوف العرض", () => {
  const rows = Array.from({ length: 6000 }, (_, i) => i);

  it("أول رسم بيعرض دفعة واحدة بس", () => {
    expect(pageSlice(rows, PAGE_STEP)).toHaveLength(PAGE_STEP);
    expect(pageSlice(rows, PAGE_STEP)[0]).toBe(0);
  });

  it("العرض مابيزيدش عن عدد الصفوف الفعلي", () => {
    expect(pageSlice([1, 2, 3], 300)).toHaveLength(3);
    expect(hasMore([1, 2, 3].length, 300)).toBe(false);
  });

  it("hasMore بيقول فيه كمان لما الباقي أكتر", () => {
    expect(hasMore(6000, 300)).toBe(true);
    expect(hasMore(6000, 6000)).toBe(false);
    expect(hasMore(0, 300)).toBe(false);
  });

  it("growShown بيزود دفعة ومابيعديش الإجمالي", () => {
    expect(growShown(6000, 300)).toBe(600);
    expect(growShown(6000, 5900)).toBe(6000);
    expect(growShown(3, 300)).toBe(3);
  });

  it("resetShown بيرجّع لأول دفعة (بعد بحث أو فلتر)", () => {
    expect(resetShown(6000)).toBe(PAGE_STEP);
    expect(resetShown(10)).toBe(10);
    expect(resetShown(0)).toBe(0);
  });

  it("الترتيب محفوظ — بنقص من الآخر مش من النص", () => {
    expect(pageSlice(rows, 5)).toEqual([0, 1, 2, 3, 4]);
  });
});
