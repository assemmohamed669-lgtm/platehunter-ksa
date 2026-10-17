/**
 * مسار الـGPS للتسجيل الممتد — كل لوحة تتختم بمكانها **لحظة ما اتقالت**.
 *
 * 🔴 القاعدة الحاكمة (نفس قاعدة اللوحات): **ما نخترعش**. لو مافيش قراءة موقع
 * موثوقة للحظة النطق، نرجّع `null` — دبوس غلط أسوأ من غير دبوس، لأن المندوب
 * هيروح لعربية مش موجودة هناك ويفقد ثقته في البرنامج.
 *
 * ⚠️ الاختبارات دي بدأت على وحدة منفصلة كتبتها، وطلع إن `gps.ts` فيها
 * `GpsTrack` أصلاً وموصولة بالمتصفح وبصفحتين. فبدل ما نشحن نسختين من نفس
 * الكلاس، الضمانات اتحقنت في الموجودة والاختبار بيعاير عليها هي.
 */
import { describe, it, expect } from "vitest";
import { GpsTrack } from "../gps";

/** المسار الحقيقي بيتغذّي من `startGpsWatch` — بنحقن القراءات مباشرة للاختبار */
function track(fixes: Array<{ at: number; lat: number; lng: number; accuracy?: number }>) {
  const t = new GpsTrack();
  // @ts-expect-error حقن مباشر بدل ما نشغّل مراقب المتصفح
  t.fixes = fixes.map((f) => ({ ...f, accuracy: f.accuracy ?? 10 }));
  return t;
}

describe("GpsTrack.pinAt", () => {
  it("يرجّع موقعاً بين القراءتين المحيطتين بلحظة النطق", () => {
    const t = track([
      { at: 0, lat: 24.0, lng: 46.0 },
      { at: 10_000, lat: 24.2, lng: 46.4 },
    ]);
    const mid = t.pinAt(5_000)!;
    expect(mid.lat).toBeCloseTo(24.1, 3);
    expect(mid.lng).toBeCloseTo(46.2, 3);
  });

  it("🔴 يرجّع null لو أقرب قراءة بعيدة زمنياً — مش أقرب حاجة موجودة", () => {
    const t = track([{ at: 0, lat: 24.7, lng: 46.67 }]);
    expect(t.pinAt(10 * 60_000)).toBeNull();
  });

  it("🔴 مايستنبطش عبر فجوة كبيرة — الاستنباط بيرسم طريق ماحصلش", () => {
    const t = track([
      { at: 0, lat: 24.0, lng: 46.0 },
      { at: 10 * 60_000, lat: 25.0, lng: 47.0 },
    ]);
    expect(t.pinAt(5 * 60_000)).toBeNull();
  });

  it("🔴 يتجاهل القراءات اللي دقتها ضعيفة — ±٥٠٠م مش هتوصّل لعربية", () => {
    const t = track([{ at: 1_000, lat: 24.0, lng: 46.0, accuracy: 500 }]);
    expect(t.pinAt(1_000)).toBeNull();
  });

  it("يرجّع null لو المسار فاضي (الموقع مقفول أو المندوب رفض الإذن)", () => {
    expect(track([]).pinAt(1_000)).toBeNull();
  });

  it("يعلّم الدبوس البعيد زمنياً بإنه غير طازة", () => {
    const t = track([{ at: 0, lat: 24.0, lng: 46.0 }]);
    const p = t.pinAt(50_000)!;      // جوّه الحد بس أقدم من STALE_AFTER_MS؟ لأ
    expect(p.stale).toBe(false);
    const q = t.pinAt(59_000)!;
    expect(q.ageMs).toBe(59_000);
  });

  it("قراءة واحدة قريبة زمنياً تتقبل عادي", () => {
    const t = track([{ at: 10_000, lat: 24.5, lng: 46.5 }]);
    const p = t.pinAt(12_000)!;
    expect(p.lat).toBeCloseTo(24.5, 6);
    expect(p.ageMs).toBe(2_000);
  });
});
