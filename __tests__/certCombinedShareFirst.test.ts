import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔝 «مشاركة الكل» فوق الجدولين
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (١٤ أكتوبر ٢٠٢٦): «لما المندوب يعمل فرز على الشهايد ويشارك النتيجة
 *  بيشارك معاه **فقط اللي طالع من الداتا** مش بيشارك اللي طالع من السجلات».
 *
 *  الزرار اللي بيشارك الاتنين كان موجود من ٦ أكتوبر — بس **تحت الجدولين خالص**،
 *  فالمندوب بيدوس على زرار نافذة الداتا ومايوصلش له.
 *
 *  الحارس ده بيثبّت إنه يفضل **فوق** — لو اترجع تحت تاني الاختبار بيفشل.
 */
describe("🔝 ترتيب المشاركة في فرز الشهايد", () => {
  const src = readFileSync(join(process.cwd(), "components/DailyCertSort.tsx"), "utf8");

  it("🔴 «مشاركة الكل» بتيجي قبل جدول الداتا وجدول السجلات", () => {
    const combined = src.indexOf("مشاركة الكل (الداتا + السجلات)");
    const dataWindow = src.indexOf('windowBlock(`شهايد ${resultName} في الداتا`');
    const recordWindow = src.indexOf('windowBlock(`شهايد ${resultName} في السجلات`');

    expect(combined).toBeGreaterThan(0);
    expect(dataWindow).toBeGreaterThan(0);
    expect(recordWindow).toBeGreaterThan(0);
    expect(combined).toBeLessThan(dataWindow);
    expect(combined).toBeLessThan(recordWindow);
  });

  it("بتستعمل الصفوف المجمّعة (داتا + سجلات) مش نافذة واحدة", () => {
    expect(src).toMatch(/certCombinedExportRows\(result\.dataRows, result\.recordRows, cols\)/);
  });

  it("بتظهر لما النافذتين فيهم نتايج (لو واحدة بس، مشاركتها هي نفس الكلام)", () => {
    expect(src).toMatch(/result\.dataRows\.length > 0 && result\.recordRows\.length > 0/);
  });
});
