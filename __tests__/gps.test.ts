import { describe, it, expect } from "vitest";
import { pickBetterFix, gpsAccuracyLevel, GPS_STALE_MS, type GpsCoords } from "@/lib/gps";

const fix = (accuracy: number, timestamp: number): GpsCoords => ({ lat: 24.7, lng: 46.7, accuracy, timestamp });

describe("pickBetterFix — إبقاء أفضل فيكس حديث (مش أحدث فيكس مهما كانت دقته)", () => {
  it("مفيش قديم → ياخد الجديد", () => {
    expect(pickBetterFix(null, fix(30, 1000))).toEqual(fix(30, 1000));
  });

  it("مفيش جديد → يسيب القديم", () => {
    expect(pickBetterFix(fix(10, 1000), null)).toEqual(fix(10, 1000));
  });

  it("فيكس أقل دقة وأحدث بشوية ماينفعش يمسح فيكس أدق قريب (الباجّ الأساسي)", () => {
    // القديم دقة ٨م، الجديد بعده بثانية دقة ٤٥م → لازم يفضل القديم (مش يروح للشارع الموازي)
    expect(pickBetterFix(fix(8, 1000), fix(45, 2000))).toEqual(fix(8, 1000));
  });

  it("فيكس أدق بياخده", () => {
    expect(pickBetterFix(fix(40, 1000), fix(10, 1500))).toEqual(fix(10, 1500));
  });

  it("فيكس قديم (بايت) بيتستبدل حتى لو الجديد أقل دقة — المندوب اتحرك", () => {
    const stale = fix(8, 1000);
    const fresh = fix(45, 1000 + GPS_STALE_MS + 1000);
    expect(pickBetterFix(stale, fresh)).toEqual(fresh);
  });

  it("فيكس أحدث ودقته كويسة (≤٢٠م) بياخده حتى لو القديم أدق بشوية — الحداثة أهم", () => {
    expect(pickBetterFix(fix(10, 1000), fix(18, 2000))).toEqual(fix(18, 2000));
  });
});

describe("gpsAccuracyLevel — تصنيف جودة الدقة", () => {
  it("≤١٥م = ممتاز", () => {
    expect(gpsAccuracyLevel(8)).toBe("good");
    expect(gpsAccuracyLevel(15)).toBe("good");
  });
  it("≤٣٥م = متوسط", () => {
    expect(gpsAccuracyLevel(20)).toBe("ok");
    expect(gpsAccuracyLevel(35)).toBe("ok");
  });
  it(">٣٥م أو غير صالح = ضعيف", () => {
    expect(gpsAccuracyLevel(50)).toBe("poor");
    expect(gpsAccuracyLevel(0)).toBe("poor");
    expect(gpsAccuracyLevel(NaN)).toBe("poor");
  });
});
