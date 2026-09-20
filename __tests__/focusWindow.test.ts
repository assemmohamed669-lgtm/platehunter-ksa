/**
 * بحث «إظهار وتعديل اللوحات» كان بيرسم **كل الصفوف من أول القايمة لحد اللوحة
 * المطابقة** عشان يقدر ينطّ عليها. اللوحة رقم ١٢ ألف = ١٢ ألف صف بخانات إدخال
 * بيترسموا في لحظة واحدة → البرنامج بيهنّج.
 *
 * وده بيفسّر «بالأخص لما يكتب آخر رقم»: الكتابة الناقصة بتطابق لوحات كتير
 * فأولها بيبقى قريب، وأول ما اللوحة تكمل يبقى فيه مطابق واحد ممكن يكون في آخر
 * القايمة — فالقفزة بتبقى لأقصاها بالظبط عند آخر رقم.
 *
 * الحل: نافذة حوالين المطابق بدل الرسم من الأول.
 */
import { describe, it, expect } from "vitest";
import { focusWindow, PAGE_STEP } from "@/lib/pagedRows";

describe("focusWindow", () => {
  it("مافيش بحث → أول دفعة زي الأول بالظبط", () => {
    expect(focusWindow(16000, 300, -1)).toEqual({ start: 0, end: 300 });
  });

  it("المطابق في آخر القايمة → بنرسم نافذة، مش ١٢ ألف صف", () => {
    const w = focusWindow(16000, 300, 12000, 50);
    expect(w.end - w.start).toBeLessThanOrEqual(350);
    expect(w.start).toBe(11950);
    expect(w.end).toBe(12250);
  });

  it("المطابق جوّه النافذة — بيبان فيها", () => {
    const w = focusWindow(16000, 300, 12000, 50);
    expect(w.start).toBeLessThanOrEqual(12000);
    expect(w.end).toBeGreaterThan(12000);
  });

  it("سياق قبل المطابق (اللي قبلها) بيتعرض", () => {
    const w = focusWindow(16000, 300, 12000, 50);
    expect(12000 - w.start).toBe(50);
  });

  it("المطابق في أول القايمة مابينزلش تحت الصفر", () => {
    const w = focusWindow(16000, 300, 3, 50);
    expect(w.start).toBe(0);
    expect(w.end).toBe(300);
  });

  it("المطابق في آخر صف — النافذة مابتعدّيش الإجمالي", () => {
    const w = focusWindow(500, 300, 499, 50);
    expect(w.end).toBe(500);
    expect(w.start).toBe(449);
  });

  it("قايمة أقصر من الدفعة → كلها", () => {
    expect(focusWindow(40, 300, -1)).toEqual({ start: 0, end: 40 });
    expect(focusWindow(40, 300, 10, 50)).toEqual({ start: 0, end: 40 });
  });

  it("التمرير بيوسّع النافذة لتحت (shown بيكبر) والبداية ثابتة", () => {
    const a = focusWindow(16000, 300, 12000, 50);
    const b = focusWindow(16000, 600, 12000, 50);
    expect(b.start).toBe(a.start);
    expect(b.end).toBe(a.end + 300);
  });

  it("قايمة فاضية", () => {
    expect(focusWindow(0, 300, -1)).toEqual({ start: 0, end: 0 });
  });

  it("النافذة = دفعة واحدة مهما كان مكان المطابق — مش آلاف الصفوف", () => {
    const w = focusWindow(16000, PAGE_STEP, 9000, 50);
    expect(w.end - w.start).toBe(PAGE_STEP);
    expect(w.start).toBe(8950);   // ٥٠ قبله سياق
    expect(w.end).toBe(9250);     // والباقي بعده
  });
});
