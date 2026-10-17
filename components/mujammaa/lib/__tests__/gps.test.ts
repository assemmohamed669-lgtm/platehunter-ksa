import { describe, it, expect } from "vitest";
import { GpsTrack, toMapsLink, pinLabel, STALE_AFTER_MS, type GpsFix } from "../gps";

/**
 * ‎GpsTrack‎ الحقيقي بيسمع من متصفح. هنا بنحقن القراءات مباشرة عشان نختبر
 * منطق «أقرب قراءة للحظة» — وهو المنطق اللي بيحقّق المطلوب:
 * دبوس لكل لوحة في مكان نطقها، مش مكان التفريغ.
 */
function trackWith(fixes: GpsFix[]): GpsTrack {
  const track = new GpsTrack();
  // @ts-expect-error — بندخل على الحقل الخاص بقصد للاختبار
  track.fixes = fixes;
  return track;
}

const T0 = 1_700_000_000_000;

const FIXES: GpsFix[] = [
  { lat: 24.71, lng: 46.67, accuracy: 10, at: T0 }, // ثانية 0
  { lat: 24.72, lng: 46.68, accuracy: 8, at: T0 + 30_000 }, // ثانية 30
  { lat: 24.73, lng: 46.69, accuracy: 9, at: T0 + 60_000 }, // ثانية 60
];

describe("GpsTrack.pinAt — دبوس لحظة نطق اللوحة", () => {
  /*
   * ⚠️ التلات اختبارات دي كانت بتتوقع **أقرب قراءة بالظبط**. `pinAt` بقت
   * **تستنبط بين القراءتين المحيطتين** — المندوب ماشي، فنص المسافة بين
   * قراءتين أقرب لمكانه الحقيقي من أي طرف فيهم. القيمة بتفرق حاجة بسيطة
   * (24.71 ⇒ 24.7107) وبتفضل **محصورة بين القراءتين** — وده اللي بنعايره.
   */
  it("لوحة أول التسجيل تاخد موقع ملزوق في أول قراءة", () => {
    const pin = trackWith(FIXES).pinAt(T0 + 2_000);
    expect(pin!.lat).toBeCloseTo(24.71, 2);
    expect(pin!.lat).toBeGreaterThanOrEqual(24.71);
    expect(pin?.stale).toBe(false);
  });

  it("لوحة في نص التسجيل تاخد موقع النص — مش الأخير", () => {
    const pin = trackWith(FIXES).pinAt(T0 + 28_000);
    expect(pin!.lat).toBeCloseTo(24.72, 2);
    expect(pin!.lat).toBeLessThan(24.73);
  });

  it("لوحة آخر التسجيل تاخد موقع آخر التسجيل", () => {
    const pin = trackWith(FIXES).pinAt(T0 + 59_000);
    expect(pin!.lat).toBeCloseTo(24.73, 2);
  });

  it("لوحات مختلفة في نفس التسجيل تاخد دبابيس مختلفة (ده جوهر المطلوب)", () => {
    const track = trackWith(FIXES);
    const a = track.pinAt(T0 + 1_000);
    const b = track.pinAt(T0 + 31_000);
    const c = track.pinAt(T0 + 61_000);
    expect(new Set([a?.lat, b?.lat, c?.lat]).size).toBe(3);
  });

  it("بيعلّم «قديم» لو أقرب قراءة بعيدة عن اللحظة", () => {
    const pin = trackWith(FIXES).pinAt(T0 + 60_000 + STALE_AFTER_MS + 5_000);
    expect(pin?.stale).toBe(true);
  });

  it("مسار فاضي (الإذن مرفوض) بيرجّع null بلا كراش", () => {
    expect(trackWith([]).pinAt(T0)).toBeNull();
  });

  it("مسار بقراءة واحدة بيرجّعها لكل اللوحات", () => {
    const track = trackWith([FIXES[0]]);
    expect(track.pinAt(T0)?.lat).toBe(24.71);
    expect(track.pinAt(T0 + 100_000)?.lat).toBe(24.71);
  });
});

describe("روابط ونصوص الموقع", () => {
  it("رابط خريطة جوجل", () => {
    expect(toMapsLink(24.712345, 46.6753)).toBe(
      "https://www.google.com/maps?q=24.712345,46.675300"
    );
  });

  it("نص الدبوس فيه الدقة", () => {
    expect(
      pinLabel({ lat: 24.712345, lng: 46.6753, accuracy: 8.4, at: T0, ageMs: 0, stale: false })
    ).toContain("±8م");
  });

  it("بلا دبوس بيرجّع نص مفهوم", () => {
    expect(pinLabel(null)).toBe("بدون موقع");
  });
});
