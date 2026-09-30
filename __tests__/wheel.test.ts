import { describe, it, expect } from "vitest";
import { pickDays, canGrantSpin, daysWord, WHEEL_ODDS } from "@/lib/wheel";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🎡 عجلة الحظ — لفّة واحدة لكل **تجديد اشتراك**
 * ══════════════════════════════════════════════════════════════════════
 *  طلب المالك (٣٠ سبتمبر ٢٠٢٦): «زر في صفحة كل مندوب — لما ييجي ميعاد
 *  التجديد ويدفع وأمدّدله، أدوس الزر فتظهرله العجلة مرة واحدة. ولو دوست
 *  الزر مرتين ميلفش غير مرة واحدة — كل مندوب ليه مرة واحدة من وقت ما
 *  بجددله اشتراكه.»
 *
 *  فالمفتاح هو **التجديد** مش ضغطة الزرار: كل تمديد بيتسجّل في
 *  `subscription_events`، وبنربط اللفّة بآخر تجديد. ضغطتين على نفس التجديد
 *  = لفّة واحدة. تجديد جديد = لفّة جديدة.
 *
 *  الاحتمالات بطلب المالك: ٤ أيام ١٪ · ٣ أيام **٥٪** · يومين ٤٧٪ · يوم ٤٧٪.
 */

describe("احتمالات العجلة", () => {
  it("الحدود بالظبط زي ما المالك طلب", () => {
    expect(pickDays(0)).toBe(4);
    expect(pickDays(0.0099)).toBe(4);
    expect(pickDays(0.01)).toBe(3);
    expect(pickDays(0.0599)).toBe(3);
    expect(pickDays(0.06)).toBe(2);
    expect(pickDays(0.5299)).toBe(2);
    expect(pickDays(0.53)).toBe(1);
    expect(pickDays(0.9999)).toBe(1);
  });

  it("النِسَب مجموعها ١٠٠٪ وكل واحدة زي المتفق عليه", () => {
    expect(WHEEL_ODDS).toEqual([
      { days: 4, chance: 0.01 },
      { days: 3, chance: 0.05 },
      { days: 2, chance: 0.47 },
      { days: 1, chance: 0.47 },
    ]);
    expect(WHEEL_ODDS.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1, 10);
  });

  it("كل نتيجة ممكنة بين ١ و٤ — مافيش صفر ولا أكتر من ٤", () => {
    for (let i = 0; i <= 1000; i++) {
      const d = pickDays(i / 1000);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(4);
    }
  });
});

describe("قفل «مرة واحدة لكل تجديد»", () => {
  const R1 = "2026-09-30T10:00:00.000Z";
  const R2 = "2026-10-29T10:00:00.000Z";

  it("أول ضغطة بعد تجديد ⇒ تتفعّل", () => {
    expect(canGrantSpin(R1, null)).toEqual({ ok: true });
  });

  it("🔒 ضغطة تانية على **نفس** التجديد ⇒ مافيش لفّة جديدة", () => {
    expect(canGrantSpin(R1, R1)).toEqual({ ok: false, reason: "already" });
  });

  it("الشهر اللي بعده — جدّد اشتراكه ⇒ الزرار يشتغل تاني", () => {
    expect(canGrantSpin(R2, R1)).toEqual({ ok: true });
  });

  it("مندوب لسه مافيش له أي تجديد مسجّل ⇒ مايتفعّلش", () => {
    expect(canGrantSpin(null, null)).toEqual({ ok: false, reason: "no-renewal" });
  });

  it("🔒 لفّة مفعّلة ولسه ملفّهاش ⇒ الضغط تاني مايعملش لفّة زيادة", () => {
    // نفس المفتاح متسجّل وقت التفعيل، فالضغطة التانية بترجع «اتفعّلت خلاص».
    expect(canGrantSpin(R1, R1)).toEqual({ ok: false, reason: "already" });
  });
});

describe("صيغة الأيام بالعربي", () => {
  it("يوم / يومين / أيام", () => {
    expect(daysWord(1)).toBe("يوم");
    expect(daysWord(2)).toBe("يومين");
    expect(daysWord(3)).toBe("٣ أيام");
    expect(daysWord(4)).toBe("٤ أيام");
  });
});
