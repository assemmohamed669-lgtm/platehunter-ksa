import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * حارس — **نافذة «إظهار وتعديل اللوحات» لازم تعرض نفس أعمدة العرض المصغّر.**
 *
 * بلاغ المالك (٢٤ سبتمبر ٢٠٢٦): في شاشة السجلات ▸ «المطلوب»، الـ٤ اللي ظاهرين
 * بيانتهم كاملة (النوع · الحي-الشارع · الموقع · التاريخ)، وأول ما المندوب يدوس
 * «إظهار وتعديل اللوحات» عشان يشوف الباقيين **البيانات بتختفي** — لأن المحرّر
 * كان بيعرض أعمدة **ملف التشييك** بس ومعاها رقم اللوحة وزر الحذف.
 */
describe("محرّر اللوحات — الأعمدة زي العرض المصغّر", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "(app)", "instant-check", "page.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  // ⚠️ **لازم نقصّ على JSX النافذة نفسها.** البحث بنص التعليق بيلاقي تعليق
  // أقدم بكتير في الملف (حارس زر الرجوع)، فالقصّة كانت بتشمل **العرض المصغّر**
  // كمان — والاختبار ينجح وهو بيقرا الجدول الغلط. ده حارس أعمى، أسوأ من مفيش.
  const start = src.indexOf("{platesEditorOpen && (() => {");
  const modal = src.slice(start);

  it("الحارس قصّ على JSX النافذة نفسها (مش على العرض المصغّر)", () => {
    expect(start).toBeGreaterThan(-1);
    expect(modal.length).toBeGreaterThan(500);
    // برهان إننا بعد العرض المصغّر: الجدول المصغّر بيقصّ ٤ صفوف، والنافذة لأ.
    expect(modal).not.toContain("visible.slice(0, 4)");
    expect(modal).toContain("peEntries");
  });

  // الأعمدة اللي العرض المصغّر بيوريها ولازم تفضل في المحرّر كمان.
  for (const col of ["النوع", "ملاحظات", "الحي-الشارع", "الحالة", "GPS", "التاريخ"]) {
    it(`🔴 عمود «${col}» موجود في المحرّر`, () => {
      expect(modal).toContain(`>${col}</th>`);
    });
  }

  it("النوع والملاحظات بيتعدّلوا في المسوّدة (`peUpdateField`) مش بحفظ فوري", () => {
    // المحرّر كله مسوّدة بتتحفظ مع «احفظ التعديلات» — خلط حفظ فوري جوّاه معناه
    // إن جزء من تعديلات المندوب يتحفظ وهو ضاغط «إلغاء».
    expect(modal).toContain("peUpdateField(e.id, TYPE_KEY");
    expect(modal).toContain("peUpdateField(e.id, notesKeyOf(");
    expect(modal).not.toContain("editFieldEntry(");
  });

  it("🔴 النوع والملاحظات مش بيتكرّروا كأعمدة عادية كمان", () => {
    // `allCols` لازم يستبعدهم زي `dynCols` في العرض المصغّر بالظبط.
    const allColsLine = modal.slice(modal.indexOf("const allCols ="), modal.indexOf("const shownCols ="));
    expect(allColsLine).toContain("h !== TYPE_KEY");
    expect(allColsLine).toMatch(/ملاح/);
  });
});
