import { describe, it, expect } from "vitest";
import { isValidManualPlate } from "@/lib/plateParser";

/**
 * علامة «راجع الشكل» + التنبيه الصوتي في التسجيل بتعتمد على isValidManualPlate:
 * اللوحة الصح = (٣ حروف سيارة / حرفين موتوسيكل) + ٤ أرقام. أي شكل تاني = بارز للمراجعة.
 * الحالات دي مرصودة من جلسة المالك الحقيقية (كانت بتتحفظ بصمت من غير تمييز).
 */
describe("علامة الشكل الغلط — حالات ميدانية حقيقية", () => {
  it("لوحات بحرف واحد (اللي كانت بتتحفظ صامتة) = شكل غلط", () => {
    expect(isValidManualPlate("س0831")).toBe(false); // حرف واحد
    expect(isValidManualPlate("ق0004")).toBe(false); // حرف واحد
  });
  it("لوحة ناقصة رقم = شكل غلط", () => {
    expect(isValidManualPlate("قنن567")).toBe(false); // ٣ أرقام
  });
  it("لوحة سيارة صحيحة = شكل سليم", () => {
    expect(isValidManualPlate("دسك1234")).toBe(true);
    expect(isValidManualPlate("قنن5678")).toBe(true);
  });
  it("لوحة موتوسيكل صحيحة (حرفين + ٤ أرقام) = شكل سليم", () => {
    expect(isValidManualPlate("صع1963")).toBe(true);
  });
});
