/**
 * الحماية من أخطر سيناريو في نقل الاستيراد لـWorker: **داتا ناقصة صامتة**.
 *
 * دلوقتي القراءة والكتابة في مكان واحد. بعد النقل بيبقى فيه طرفين — الـWorker
 * بيقرا ويبعت، والصفحة بتستقبل وتكتب. لو ضاعت دفعة في النص أو الـWorker مات
 * وإحنا فاكرينه خلص، المندوب **يفضل شغّال عادي على داتا ناقصة**: يفرز،
 * يطلعله نتايج أقل، ومايعرفش. سيارة مطلوبة في ملفه مابتظهرش.
 *
 * وده أسوأ من الكراش — الكراش بيبان، والنقص صامت.
 *
 * فالقاعدة: الـWorker بيقول قرا كام، والصفحة بتعرف كتبت كام. مايتطابقوش =
 * نرفض الاستيراد بصوت عالي.
 */
import { describe, it, expect } from "vitest";
import { verifyImportCounts } from "@/lib/importVerify";

describe("verifyImportCounts", () => {
  it("العددان متطابقان → يعدّي", () => {
    expect(() => verifyImportCounts(779561, 779561)).not.toThrow();
    expect(() => verifyImportCounts(0, 0)).not.toThrow();
  });

  it("**ناقص صف واحد → يرمي**", () => {
    // صف واحد ناقص = سيارة مطلوبة ممكن ماتظهرش. مافيش تسامح.
    expect(() => verifyImportCounts(779561, 779560)).toThrow();
  });

  it("الرسالة بتقول الرقمين — عشان نعرف حجم النقص", () => {
    try {
      verifyImportCounts(779561, 700000);
      throw new Error("المفروض رمى");
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain("779561");
      expect(m).toContain("700000");
    }
  });

  it("زيادة (تكرار دفعة) → يرمي كمان", () => {
    // التكرار خطر بردو: صفوف مضاعفة تلخبط عدّ النتايج.
    expect(() => verifyImportCounts(100, 101)).toThrow();
  });

  it("رقم غير صالح → يرمي بدل ما يعدّي بالشك", () => {
    expect(() => verifyImportCounts(NaN, 5)).toThrow();
    expect(() => verifyImportCounts(5, NaN)).toThrow();
    expect(() => verifyImportCounts(-1, -1)).toThrow();
  });
});
