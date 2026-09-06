import { describe, it, expect } from "vitest";
import { activityStatus, shouldSendLocation } from "@/lib/presence";

const NOW = new Date("2026-07-17T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60000;
const HR = 60 * MIN;
const DAY = 24 * HR;

describe("activityStatus", () => {
  it("مفيش last_seen → لم يفتح البرنامج", () => {
    expect(activityStatus(null, NOW)).toEqual({ online: false, label: "لم يفتح البرنامج", minsAgo: null });
  });
  it("من دقيقتين → نشط الآن", () => {
    const s = activityStatus(ago(2 * MIN), NOW);
    expect(s.online).toBe(true);
    expect(s.label).toBe("نشط الآن");
  });
  it("بالظبط ٥ دقايق → لسه نشط", () => {
    expect(activityStatus(ago(5 * MIN), NOW).online).toBe(true);
  });
  it("٦ دقايق → مش نشط", () => {
    const s = activityStatus(ago(6 * MIN), NOW);
    expect(s.online).toBe(false);
    expect(s.label).toBe("آخر ظهور من 6 دقيقة");
  });
  it("٣ ساعات → بالساعة", () => {
    expect(activityStatus(ago(3 * HR), NOW).label).toBe("آخر ظهور من 3 ساعة");
  });
  it("يومين → باليوم", () => {
    expect(activityStatus(ago(2 * DAY), NOW).label).toBe("آخر ظهور من 2 يوم");
  });
  it("تاريخ غير صالح → لم يفتح البرنامج", () => {
    expect(activityStatus("not-a-date", NOW).online).toBe(false);
  });
});

describe("shouldSendLocation", () => {
  const p = { lat: 24.7136, lng: 46.6753, at: NOW };
  it("أول مرة (مفيش سابق) → يبعت", () => {
    expect(shouldSendLocation(null, { lat: 24.7, lng: 46.7 }, NOW)).toBe(true);
  });
  it("نفس المكان وخلال المدة → ما يبعتش", () => {
    expect(shouldSendLocation(p, { lat: 24.7136, lng: 46.6753 }, NOW + 10000)).toBe(false);
  });
  it("عدّت المدة (٤٥ث) وهو واقف → يبعت", () => {
    expect(shouldSendLocation(p, { lat: 24.7136, lng: 46.6753 }, NOW + 46000)).toBe(true);
  });
  // 🐞 ده كان أخطر بق في الحمل: خدمة الـGPS بتنده **كل ثانيتين**، والخانق كان
  // بيسمح بالإرسال لمجرد إنه اتحرك ٢٥ متر — والعربية بتقطع ٢٥ متر في ثانيتين عند
  // ٤٥ كم/س. النتيجة: كتابة على الداتابيز كل ثانيتين لكل مندوب بيسوق =
  // ١٨٠٠ كتابة/ساعة للواحد، و~٤٨ ألف طلب/ساعة خنقوا الداتابيز (Unhealthy).
  it("🐞 اتحرك كتير بس بعد ثانيتين بس → ما يبعتش (نبضة السواقة)", () => {
    // ~٥٠٠ متر في ثانيتين — أسرع من أي عربية، ومع ذلك بدري على الإرسال
    expect(shouldSendLocation(p, { lat: 24.7181, lng: 46.6753 }, NOW + 2000)).toBe(false);
  });

  it("اتحرك أكتر من ٢٥ متر وعدّى الفاصل الأدنى → يبعت", () => {
    expect(shouldSendLocation(p, { lat: 24.7181, lng: 46.6753 }, NOW + 16000)).toBe(true);
  });

  it("🐞 ساعة سواقة = مئات الكتابات مش آلاف", () => {
    // نحاكي الواقع: نبضة كل ثانيتين، ~٦٠ كم/س (~٣٣ متر بين النبضة والتانية)
    let prev = { lat: 24.7136, lng: 46.6753, at: NOW };
    let sends = 0;
    let lat = 24.7136;
    for (let t = 2000; t <= 3_600_000; t += 2000) {
      lat += 0.0003;                                    // ~٣٣ متر كل نبضة
      const next = { lat, lng: 46.6753 };
      if (shouldSendLocation(prev, next, NOW + t)) { sends++; prev = { ...next, at: NOW + t }; }
    }
    expect(sends).toBeLessThanOrEqual(260);             // كان ١٨٠٠
  });

  it("الواقف لسه بيبعت نبضة — آخر ظهور يفضل حديث", () => {
    let prev = { lat: 24.7136, lng: 46.6753, at: NOW };
    let sends = 0;
    for (let t = 2000; t <= 3_600_000; t += 2000) {
      if (shouldSendLocation(prev, { lat: 24.7136, lng: 46.6753 }, NOW + t)) {
        sends++; prev = { lat: 24.7136, lng: 46.6753, at: NOW + t };
      }
    }
    expect(sends).toBeGreaterThanOrEqual(70);           // ~٨٠ نبضة/ساعة
  });
  it("حركة صغيرة جداً (بضعة أمتار) خلال المدة → ما يبعتش", () => {
    expect(shouldSendLocation(p, { lat: 24.71362, lng: 46.67531 }, NOW + 5000)).toBe(false);
  });
});
