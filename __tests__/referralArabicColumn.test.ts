import { describe, it, expect } from "vitest";
import { detectArabicPlateColumnByContent } from "@/lib/plateParser";

/**
 * إحالة فيها عمود عربي وعمود إنجليزي لنفس اللوحة، **بلا صف عناوين** (أسماء
 * الأعمدة نفسها بيانات). قبل الإصلاح كان بيتقرا العمود الإنجليزي (لأن كشف
 * «عربي؟» كان بالهيدر بس)، فيتطبّق احتياطي عكس الحروف ويطلّع تطابق كاذب
 * (ريح5647 ← حير5647). الكاشف بالمحتوى لازم يفضّل العمود العربي.
 */
describe("detectArabicPlateColumnByContent — يفضّل العمود العربي بلا هيدر", () => {
  const rows = [
    { "سأد3266": "سأد3266", "3266DAS": "3266DAS" },
    { "سأد3266": "رىح5647", "3266DAS": "5647JVR" },
    { "سأد3266": "بكد1588", "3266DAS": "1588DKB" },
    { "سأد3266": "كهط5251", "3266DAS": "5251THK" },
  ];
  const headers = ["سأد3266", "3266DAS"];

  it("بيرجّع العمود العربي حتى لو الإنجليزي شكله لوحات كمان", () => {
    expect(detectArabicPlateColumnByContent(headers, rows)).toBe("سأد3266");
  });

  it("مفيش عمود عربي → null (المنادي يرجع للإنجليزي)", () => {
    const englishOnly = rows.map((r) => ({ "3266DAS": r["3266DAS"] }));
    expect(detectArabicPlateColumnByContent(["3266DAS"], englishOnly)).toBeNull();
  });

  it("عمود مش لوحات (نسبة أقل من العتبة) → مايتحسبش", () => {
    const notes = [{ ملاحظة: "سيارة حمراء" }, { ملاحظة: "مركونة" }];
    expect(detectArabicPlateColumnByContent(["ملاحظة"], notes)).toBeNull();
  });
});
