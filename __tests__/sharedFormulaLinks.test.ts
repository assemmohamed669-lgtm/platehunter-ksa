// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { resolveSharedFormulas } from "@/lib/hyperlink";

/**
 * لما المندوب يفتح ملف الداتا في إكسيل ويحفظه، إكسيل بيحوّل الدبابيس المتكررة
 * لـ**معادلات مشتركة**: خلية واحدة بس بتكتب المعادلة كاملة، والباقي بيقولوا
 * «أنا زي المعادلة رقم si» من غير ما يكتبوا الرابط.
 *
 * فالقارئ بيلاقي معادلة فاضية → يرجع للقيمة المحفوظة → كلمة «خريطة» بلا رابط.
 * اتقاس على ملف المندوب: ٥,٨٩٧ لينك اتقروا و**٢٠١,١٨١ طلعوا «خريطة»**.
 *
 * الحل: نفتكر معادلة كل مجموعة (si) ونستخدمها للخلايا اللي بتشير ليها.
 * صحيح هنا لأن HYPERLINK("رابط ثابت") مافيهاش مراجع نسبية تتغيّر بالمكان.
 */
describe("المعادلات المشتركة (shared formulas)", () => {
  it("بيفتكر معادلة المجموعة ويدّيها للخلايا اللي بعدها", () => {
    const r = resolveSharedFormulas();
    expect(r.remember("0", 'HYPERLINK("https://maps.app.goo.gl/AAA","خريطة")'))
      .toContain("maps.app.goo.gl/AAA");
    expect(r.lookup("0")).toContain("maps.app.goo.gl/AAA");
  });

  it("خلية بمعادلة فاضية بتاخد بتاعة مجموعتها", () => {
    const r = resolveSharedFormulas();
    r.remember("3", 'HYPERLINK("https://goo.gl/maps/BBB","خريطة")');
    expect(r.resolve("", "3")).toContain("goo.gl/maps/BBB");
  });

  it("المعادلة المكتوبة بتغلب — مابنستبدلهاش", () => {
    const r = resolveSharedFormulas();
    r.remember("1", 'HYPERLINK("https://old","خريطة")');
    expect(r.resolve('HYPERLINK("https://new","خريطة")', "1")).toContain("new");
  });

  it("مجموعات مختلفة كل واحدة برابطها", () => {
    const r = resolveSharedFormulas();
    r.remember("0", 'HYPERLINK("https://a","خريطة")');
    r.remember("1", 'HYPERLINK("https://b","خريطة")');
    expect(r.resolve("", "0")).toContain("https://a");
    expect(r.resolve("", "1")).toContain("https://b");
  });

  it("si مش معروف → مافيش معادلة (مابنخترعش)", () => {
    const r = resolveSharedFormulas();
    expect(r.resolve("", "9")).toBe("");
    expect(r.resolve("", undefined)).toBe("");
  });

  it("خلية بلا si وبلا معادلة بتفضل زي ما هي", () => {
    const r = resolveSharedFormulas();
    r.remember("0", 'HYPERLINK("https://a","خريطة")');
    expect(r.resolve("", undefined)).toBe("");
  });
});
