/**
 * مندوب آيفون: ملف داتا ٣٥ ميجا بيقتل الصفحة («حدثت مشكلة بشكل متكرر») **عند
 * صفر بالمية** — قبل ما أول دفعة تتكتب. ملف ١٣ ميجا بيعدّي عادي.
 *
 * السبب: importLargeDataFile لو قراءة الدفعات فشلت قبل أول صف، بيرجع لـ
 * parseExcelFile اللي بيحمّل الملف **كامل** في الذاكرة. الاحتياطي ده اتعمل
 * عشان صيغة غريبة (xlsb/ods) مايوقفش المندوب — بس على آيفون بملف كبير هو
 * نفسه اللي بيقتل الصفحة، فبيتحوّل من إنقاذ لسبب العطل.
 *
 * القياس: قراءة الدفعات لملف ٤٠ ميجا بتاخد ~٧٣ ميجا ذاكرة (آمنة)، لكن القراءة
 * الكاملة لنفس الملف بتحجز مئات الميجا — وسقف الآيفون أقل من كده.
 */
import { describe, it, expect } from "vitest";
import { canFullParseFallback, FULL_PARSE_FALLBACK_MAX_BYTES } from "@/lib/largeFileFallback";

describe("canFullParseFallback", () => {
  const MB = 1024 * 1024;

  it("بيسمح للملفات الصغيرة — الاحتياطي مفيد ومأمون", () => {
    expect(canFullParseFallback(1 * MB)).toBe(true);
    expect(canFullParseFallback(5 * MB)).toBe(true);
  });

  it("**بيمنع الملف اللي قتل صفحة الآيفون (٣٥ ميجا)**", () => {
    expect(canFullParseFallback(35 * MB)).toBe(false);
  });

  it("الحدّ نفسه مسموح، واللي فوقه ممنوع", () => {
    expect(canFullParseFallback(FULL_PARSE_FALLBACK_MAX_BYTES)).toBe(true);
    expect(canFullParseFallback(FULL_PARSE_FALLBACK_MAX_BYTES + 1)).toBe(false);
  });

  it("الحدّ محافظ — أقل من الملف اللي اشتغل عنده (١٣ ميجا)", () => {
    // مانعرفش لو الـ١٣ ميجا عدّى من التدفّق ولا من الاحتياطي، فبنفضل الأمان.
    expect(FULL_PARSE_FALLBACK_MAX_BYTES).toBeLessThan(13 * MB);
    expect(FULL_PARSE_FALLBACK_MAX_BYTES).toBeGreaterThanOrEqual(4 * MB);
  });

  it("حجم غير معروف أو صفر → نسمح (ماننعش المندوب بلا سبب)", () => {
    expect(canFullParseFallback(0)).toBe(true);
    expect(canFullParseFallback(NaN)).toBe(true);
  });
});
