import { describe, it, expect } from "vitest";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, clampZoom, stepZoom, zoomedMinWidth } from "../lib/tableZoom";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ⑫ زوم جدول اللوحات
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «ضيفله زوم إن وزوم آوت علشان لو المندوب حب
 *  يكبّر المربّع. المهم ميأثرش على مساحة الشاشة، وكل اللي في المربّع حتى
 *  لو المندوب عمل زوم يقدر يشوفه زي دلوقتي وميتاكلش منه حاجة».
 *
 *  🔴 **«ميتاكلش منه حاجة» هو الشرط الصعب.** التكبير بـCSS `zoom`/`scale`
 *  بيكبّر المحتوى **من غير** ما يكبّر المساحة اللي بيتمرّر فيها، فآخر عمود
 *  بيتقص. فالعرض الأدنى للجدول لازم **يتكبّر بنفس النسبة** عشان التمرير
 *  الأفقي يوصّل لآخره.
 */
describe("clampZoom", () => {
  it("بيقف عند الحدود", () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
  });
  it("القيمة الغلط ⇒ ١ (الوضع الطبيعي)", () => {
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(undefined as unknown as number)).toBe(1);
  });
  it("القيمة السليمة بتعدّي", () => {
    expect(clampZoom(1.2)).toBeCloseTo(1.2);
  });
});

describe("stepZoom — أزرار ➖ ➕", () => {
  it("بيزوّد وينقّص بخطوة", () => {
    expect(stepZoom(1, +1)).toBeCloseTo(1 + ZOOM_STEP);
    expect(stepZoom(1, -1)).toBeCloseTo(1 - ZOOM_STEP);
  });
  it("مابيعديش الحدود", () => {
    expect(stepZoom(ZOOM_MAX, +1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});

describe("zoomedMinWidth — 🔴 مايتاكلش عمود", () => {
  it("زوم ١ ⇒ العرض الأصلي", () => {
    expect(zoomedMinWidth(640, 1)).toBe(640);
  });
  it("🔴 زوم ×٢ ⇒ العرض ×٢ عشان آخر عمود يفضل موصول", () => {
    expect(zoomedMinWidth(640, 2)).toBe(1280);
  });
  it("تصغير ⇒ العرض بيقلّ، بس مش تحت الأصلي", () => {
    // التصغير بيخلّي كله باين أصلاً؛ مانقللش العرض تحت الأصلي عشان
    // الأعمدة ماتتلزقش في بعض.
    expect(zoomedMinWidth(640, 0.8)).toBe(640);
  });
});
