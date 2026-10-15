import { describe, it, expect } from "vitest";
import { gpsRecordWarning, GPS_STAMP_MAX_ACCURACY_M } from "@/lib/gpsWarning";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ⚠️ تحذير الموقع أثناء التسجيل
 * ══════════════════════════════════════════════════════════════════════
 *  بلاغ المالك (١٥ أكتوبر ٢٠٢٦): مندوب سجّل **٩٦ لوحة** كلها بلا موقع،
 *  ومعرفش غير لما جه يصدّر ولقى «التصدير بيستنى الموقع (96 مستنية)».
 *
 *  البرنامج كان **ساكت** طول التسجيل. الشغل اتعمل والوقت راح والنتيجة صفر.
 *
 *  وقرار المالك: الحد يبقى **١٠٠ متر** بدل ٢٥ — «أفضل من إنه مياخدش خالص».
 */
describe("⚠️ متى نحذّر المندوب", () => {
  it("🔴 بيسجّل ومفيش موقع خالص ⇒ تحذير", () => {
    const w = gpsRecordWarning(null, true);
    expect(w).not.toBeNull();
    expect(w).toContain("الموقع");
  });

  it("🔴 بيسجّل والدقة أوحش من الحد ⇒ تحذير وفيه الرقم", () => {
    const w = gpsRecordWarning({ accuracy: 420 }, true);
    expect(w).toContain("420");
  });

  it("الدقة كويسة ⇒ مفيش تحذير", () => {
    expect(gpsRecordWarning({ accuracy: 8 }, true)).toBeNull();
    expect(gpsRecordWarning({ accuracy: GPS_STAMP_MAX_ACCURACY_M }, true)).toBeNull();
  });

  it("🔴 الحد ١٠٠ متر بقرار المالك (كان ٢٥)", () => {
    expect(GPS_STAMP_MAX_ACCURACY_M).toBe(100);
    expect(gpsRecordWarning({ accuracy: 99 }, true)).toBeNull();
    expect(gpsRecordWarning({ accuracy: 101 }, true)).not.toBeNull();
  });

  it("مش بيسجّل ⇒ مانزعّجوش", () => {
    expect(gpsRecordWarning(null, false)).toBeNull();
    expect(gpsRecordWarning({ accuracy: 900 }, false)).toBeNull();
  });

  it("دقة مش منطقية ⇒ نعتبرها وحشة مش كويسة", () => {
    expect(gpsRecordWarning({ accuracy: 0 }, true)).not.toBeNull();
    expect(gpsRecordWarning({ accuracy: Number.NaN }, true)).not.toBeNull();
  });
});
