import { describe, it, expect } from "vitest";
import { isStandardPlate, normalizePlate, similarityPercent } from "@/lib/plateParser";

/**
 * اللوحة السعودية = **٣ حروف + ٤ أرقام** دايماً.
 *
 * المشكلة اللي ظهرت في الميدان: مندوب كتب لوحة بـ٤ حروف + ٤ أرقام (٨ خانات)
 * وطلعت «مطلوبة ٨٨٪». السبب حسابي: similarityPercent بتقرّب جوّاها، وفرق
 * خانة واحدة من ٨ = (1 − 1/8) × 100 = 87.5 → بتتقرّب لـ**88** فبتعدّي العتبة.
 * بينما غلطة حقيقية في لوحة سليمة (٧ خانات) = 85.7 → 86 فبتترفض.
 * يعني المطابقة التقريبية كانت بتقبل الغلط وترفض الصح.
 */
describe("isStandardPlate — شكل اللوحة السعودية", () => {
  it("بتقبل ٣ حروف + ٤ أرقام", () => {
    expect(isStandardPlate("ابح1234")).toBe(true);
    expect(isStandardPlate(normalizePlate("أ ب ح 1234"))).toBe(true);
    expect(isStandardPlate("كره4728")).toBe(true);
  });

  it("بترفض ٤ حروف + ٤ أرقام (اللي عمل الإنذار الكاذب)", () => {
    expect(isStandardPlate("ركره4728")).toBe(false);
  });

  it("بترفض عدد حروف أو أرقام غلط", () => {
    expect(isStandardPlate("اب1234")).toBe(false);    // حرفين
    expect(isStandardPlate("ابح123")).toBe(false);    // ٣ أرقام
    expect(isStandardPlate("ابح12345")).toBe(false);  // ٥ أرقام
    expect(isStandardPlate("")).toBe(false);
  });

  it("بترفض الأرقام قبل الحروف أو خانات غريبة", () => {
    expect(isStandardPlate("1234ابح")).toBe(false);
    expect(isStandardPlate("اب1ح234")).toBe(false);
    expect(isStandardPlate("abc1234")).toBe(false);   // لازم تتحوّل لعربي الأول
  });

  it("بتقبل الأرقام العربية-الهندية بعد التطبيع", () => {
    expect(isStandardPlate(normalizePlate("ا ب ح ١٢٣٤"))).toBe(true);
  });
});

describe("الحساب اللي سبب الإنذار الكاذب — توثيق", () => {
  it("مدخل ٨ خانات ضد لوحة ٧ بيطلع ٨٨٪ (فوق العتبة)", () => {
    expect(similarityPercent("ركره4728", "كره4728")).toBe(88);
  });

  it("غلطة حقيقية في لوحة سليمة بتطلع ٨٦٪ (تحت العتبة)", () => {
    expect(similarityPercent("ابح1234", "ابد1234")).toBe(86);
  });

  it("عشان كده الفلتر لازم يكون على الشكل مش على النسبة", () => {
    // المدخل الغلط بيعدّي النسبة، فالشكل هو اللي بيمسكه
    expect(similarityPercent("ركره4728", "كره4728")).toBeGreaterThanOrEqual(88);
    expect(isStandardPlate("ركره4728")).toBe(false);
  });
});
