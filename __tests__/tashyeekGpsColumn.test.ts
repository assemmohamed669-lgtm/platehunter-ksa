import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * حارس — **موقع السيارة (GPS) في نتيجة الفرز: على الشاشة وفي الإكسيل.**
 *
 * بلاغ المالك (٢٤ سبتمبر ٢٠٢٦): المندوب بيشارك نتيجة الفرز إكسيل — لوحات الداتا
 * موقعها طالع عادي، وصفوف **السجلات** («سيارات مطلوبة من ملف التشييك») طالعة
 * **من غير موقع خالص**. ونفس الحاجة على الشاشة.
 *
 * السبب: `buildTashyeekRowObj` بيبني الأعمدة من `orderedTashyeekCols` بس، وشيت
 * التشييك غالباً مافيهوش عمود موقع. والحل (`rawGpsOfTashyeek`) كان موجود
 * ومستعمل في **مشاركة الواتساب بس**.
 */
describe("نتيجة الفرز — عمود الموقع", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "(app)", "sorting", "page.tsx"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  /**
   * الكود من غير سطور التعليقات.
   * ⚠️ التعليقات بتقتبس الشرط القديم عشان تشرح اللي اتغيّر — فالبحث على النص
   *    الخام بيمسك التعليق نفسه ويفشل بالغلط. الحارس لازم يقيس **الكود**.
   */
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

  it("الحارس لاقى الملف والدوال المعنية", () => {
    expect(src).toContain("function rawGpsOfTashyeek");
    expect(src).toContain("function buildTashyeekRowObj");
    expect(code.length).toBeGreaterThan(1000);
  });

  it("🔴 فيه دالة مشاركة بتضيف GPS لصف السجلات", () => {
    expect(src).toContain("function tashyeekRowForShare");
  });

  it("🔴 الشرط اللي كان بيمنع حطّ الموقع اتشال — في المسارين", () => {
    // `if ("GPS" in o && g)` كان معناه: الرابط مايتحطّش إلا لو العمود اسمه
    // «GPS» بالحرف — وشيت التشييك مافيهوش عمود موقع، وملف الداتا ممكن يسمّيه
    // «الموقع» أو «جي بي اس». فالموقع كان بيضيع في الحالتين.
    expect(code).not.toContain('if ("GPS" in o && g)');
    // والصيغة الجديدة موجودة في المسارين (صفوف الداتا + صفوف السجلات).
    expect(code.split('if (g) o["GPS"] = g;').length - 1).toBe(2);
  });

  it("🔴 كل أزرار مشاركة السجلات بتستخدم نسخة المشاركة مش الخام", () => {
    // أي `...buildTashyeekRowObj(` جوّه نشر كائن مشاركة = صف بلا موقع.
    expect(code).not.toContain('"المصدر": "سجلات", ...buildTashyeekRowObj(');
    expect(code).toContain('"المصدر": "سجلات", ...tashyeekRowForShare(');
    // زرار نافذة السجلات نفسها
    expect(code).toContain("displayTashyeek.map(({ r, _dist }) => tashyeekRowForShare(r, _dist))");
  });

  it("🔴 وعمود «الموقع» ظاهر على الشاشة في نافذة السجلات", () => {
    // بيتحطّ جنب «الحالة» — زي أعمدة النافذة الثابتة التانية.
    const i = code.indexOf(">الموقع</th>");
    const j = code.indexOf(">الحالة</th>", i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it("مشاركة الواتساب لسه بتستخدم النسخة الخام — الموقع ليه سطر 📍 لوحده", () => {
    // لو استخدمت نسخة المشاركة هنا، الموقع هيتكرّر مرتين في نفس الرسالة.
    expect(code).toContain("buildRowSummaryText(buildTashyeekRowObj(r)), rawGpsOfTashyeek(r)");
  });
});
