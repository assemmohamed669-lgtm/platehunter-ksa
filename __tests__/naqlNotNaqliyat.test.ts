/**
 * 🚚 «نقل» مش «نقليات» — Voice PRO (١٦ نوفمبر ٢٠٢٦).
 *
 * المالك: «لما بيقول في نوع السيارة نقل بتتكتب معاه نقليات … لو محدش بيقول نقليات دي شيلها لان نقل بتتقال اكتر».
 * الدليل: أرشيف التفريغ على إيطاليا — **ولا مندوب نطق «نقليات»** (صفر في كل التسجيلات الحقيقية)، و«نقل» آلاف المرات؛
 * والتفريغ بيكتب «نقل» أوقات «نقلة» (١٤٧ مرة عند مندوب واحد)، و«نقلة» كانت بتتقرّب (فرق حرف) على نطق «نقليه» ⇒ «نقليات».
 * ⇒ «نقليات» اتشالت من القائمة زي «ديانا» (٢٣ أكتوبر)، ونطقاتها (نقليه · نقليات) بقت «نقل».
 */
import { describe, expect, it } from "vitest";
import { VEHICLE_TYPE_KINDS, VEHICLE_TYPES } from "@/lib/vehicleTypes";
import { scanTypeAndNote } from "@/lib/vehicleTypeScan";

const typeOf = (word: string) => scanTypeAndNote(`ح م ي ٤ ١ ٩ ١ ${word}`).type;

describe("«نقليات» اتشالت", () => {
  it("مش في القائمة — و«نقل» موجودة", () => {
    expect(VEHICLE_TYPE_KINDS as readonly string[]).not.toContain("نقليات");
    expect(VEHICLE_TYPES as readonly string[]).not.toContain("نقليات");
    expect(VEHICLE_TYPE_KINDS as readonly string[]).toContain("نقل");
  });

  it("«نقل» ⇒ نقل", () => {
    expect(typeOf("نقل")).toBe("نقل");
  });

  it("«نقلة» (زي ما التفريغ بيكتبها) ⇒ نقل — كانت بتطلع نقليات", () => {
    expect(typeOf("نقلة")).toBe("نقل");
    expect(typeOf("نقله")).toBe("نقل");
  });

  it("حتى لو اتقالت «نقليه» أو «نقليات» ⇒ نقل", () => {
    expect(typeOf("نقليه")).toBe("نقل");
    expect(typeOf("نقلية")).toBe("نقل");
    expect(typeOf("نقليات")).toBe("نقل");
  });
});
