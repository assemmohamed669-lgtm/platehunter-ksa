import { describe, it, expect } from "vitest";
import { driveHealthMessage, type DriveHealth } from "@/lib/driveHealth";

/**
 * فحص اتصال درايف — الترجمة من رد السيرفر لرسالة يفهمها المالك.
 *
 * الفكرة كلها إن المالك يعرف الحالة **قبل** ما مندوب يشتكي. فالتفرقة المهمة:
 * «الصلاحية ماتت» (لازم تجديد) ≠ «شغّال بس مش شايف ملفات» (مشكلة مشاركة
 * فولدرات) ≠ «شغّال تمام». التلاتة كانوا بيبانوا زي بعض قبل كده.
 */
describe("driveHealthMessage", () => {
  it("يقول إن الصلاحية محتاجة تجديد لما التوكن يبوظ", () => {
    const r = driveHealthMessage({ ok: false, error: "drive_unavailable" });
    expect(r.level).toBe("fail");
    expect(r.text).toContain("الصلاحية");
  });

  it("يقول شغّال ويذكر عدد الملفات لما درايف يرد", () => {
    const r = driveHealthMessage({ ok: true, files: 7 });
    expect(r.level).toBe("ok");
    expect(r.text).toContain("7");
  });

  it("ينبّه لما الاتصال شغّال بس الحساب مش شايف ولا ملف", () => {
    const r = driveHealthMessage({ ok: true, files: 0 });
    expect(r.level).toBe("warn");
    expect(r.text).toContain("مشارك");
  });

  it("يفرّق بين انتهاء الجلسة وبين مشكلة درايف", () => {
    const r = driveHealthMessage({ ok: false, error: "unauthorized" });
    expect(r.level).toBe("fail");
    expect(r.text).toContain("الجلسة");
  });

  it("يقول مافيش نت لما النداء نفسه يقع", () => {
    const r = driveHealthMessage({ ok: false, error: "network" });
    expect(r.level).toBe("fail");
    expect(r.text).toContain("اتصال");
  });

  it("مايقولش «شغّال» لو الرد ناقص المعلومة", () => {
    const r = driveHealthMessage({ ok: false } as DriveHealth);
    expect(r.level).toBe("fail");
  });
});
