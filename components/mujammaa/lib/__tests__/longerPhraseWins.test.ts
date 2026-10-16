import { describe, it, expect } from "vitest";
import { upgradesValue } from "../plateEntry";

/**
 * 🔴 **العبارة الأطول لازم تقدر تحلّ محل جزئها.**
 *
 * القاعدة كانت «املا الخانة لو فاضية بس»، فأول إجابة قصيرة بتقفل الباب
 * قدام الأطول الصح. من جلسة ١٦ سبتمبر ٢٠٢٦:
 *
 *     ددي3636 : «برحه اخر الشارع يسار» ← اتكتب «اخر الشارع»
 *     لقا9821 : «راس شاحنه»            ← اتكتب «شاحنه»
 *
 * الترقية **أحادية الاتجاه**: الجديد لازم يكون فيه القديم كله — فمفيش
 * قيمة تانية تقدر تبدّل قيمة موجودة (ودي القاعدة اللي بتمنع نوع الجار).
 */
describe("الأطول يكسب لو شامل الأقصر", () => {
  it("يرقّي العبارة المكمّلة", () => {
    expect(upgradesValue("اخر الشارع", "برحه اخر الشارع يسار")).toBe(true);
    expect(upgradesValue("شاحنه", "راس شاحنه")).toBe(true);
    expect(upgradesValue("جراج", "جراج بدروم")).toBe(true);
  });

  it("🛡️ ماينفعش يبدّل قيمة مختلفة", () => {
    expect(upgradesValue("مركونه", "مصدومه")).toBe(false);
    // «غمارة» و«غمارتين» نوعان مختلفان — مش امتداد لبعض
    expect(upgradesValue("غمارة", "غمارتين")).toBe(false);
    expect(upgradesValue("جراج يمين", "جراج يسار")).toBe(false);
    expect(upgradesValue("برحه اخر الشارع يسار", "اخر الشارع")).toBe(false);
    expect(upgradesValue("ونيت", "ونيت")).toBe(false);
    expect(upgradesValue(undefined, "ونيت")).toBe(true);
    expect(upgradesValue("ونيت", "")).toBe(false);
  });
});
