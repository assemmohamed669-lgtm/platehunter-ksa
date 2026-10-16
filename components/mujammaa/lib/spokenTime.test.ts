import { describe, expect, it } from "vitest";
import { DAY_MS, spokenTimes } from "./spokenTime";

/**
 * ==========================================================================
 *  الوقتين اللي كانوا بيتلخبطوا
 * ==========================================================================
 *
 *  🔴 غلطة حقيقية (اتمسكت في مراجعة ١٠ سبتمبر):
 *  `SessionStamp.at()` بتاخد وقت **نسبي** من بداية التسجيل — مكتوب في
 *  `StampEdit.tMs`: «التوقيت النسبي من بداية التسجيل». والصفحة كانت
 *  بتناديها بـ`spokenAtMs` وهو **مطلق** (epoch).
 *
 *  ونتيجة اللخبطة كانت **مختلفة** على كل محرك:
 *   · «المقاطع» بيبعت epoch ضخم ⇒ `pick` بترجع **آخر** إدخال دايماً،
 *     يعني الشارع اللي المندوب كتبه في آخر الجولة بيتحطّ على أول لوحة.
 *   · «كامل ⚡» ماكانش عنده وقت خالص ⇒ صفر ⇒ `pick` مالقتش أي إدخال
 *     ⇒ **الحي بيطلع فاضي على كل لوحة**.
 *
 *  والوقت المطلق نفسه لازم يفضل مطلق، لأن `pinAt()` بتاخد epoch.
 *  ⇒ الاتنين بقوا مخرج **دالة واحدة**، فمستحيل تتبادلوا بالغلط.
 */
describe("spokenTimes", () => {
  const BASE = 1_757_500_000_000; // بداية تسجيل حقيقية (epoch)

  it("لوحة ليها وقت في الصوت: المطلق للدبوس والنسبي للختم", () => {
    const t = spokenTimes({ timeStartS: 5, baseMs: BASE, lastKnownAbsMs: 0 });
    expect(t.absMs).toBe(BASE + 5000);
    expect(t.relMs).toBe(5000);
    expect(t.known).toBe(true);
  });

  it("🔴 النسبي عمره ما يبقى epoch — دي الغلطة الأصلية", () => {
    for (const s of [0, 1.82, 34.62, 900]) {
      const t = spokenTimes({ timeStartS: s, baseMs: BASE, lastKnownAbsMs: 0 });
      expect(t.relMs).toBeLessThan(DAY_MS);
      expect(t.relMs).toBe(Math.round(s * 1000));
    }
  });

  it("مافيش وقت في الصوت: بيرجع لآخر لوحة معروفة، والنسبي بيتحسب منها", () => {
    const t = spokenTimes({
      timeStartS: undefined,
      baseMs: BASE,
      lastKnownAbsMs: BASE + 12_000,
    });
    expect(t.absMs).toBe(BASE + 12_000);
    expect(t.relMs).toBe(12_000);
    expect(t.known).toBe(true);
  });

  it("🔴 مافيش وقت ولا آخر معروفة: **مش معروف** — والصفحة ماتحطّش دبوس", () => {
    const t = spokenTimes({
      timeStartS: undefined,
      baseMs: BASE,
      lastKnownAbsMs: 0,
    });
    expect(t.known).toBe(false);
    expect(t.absMs).toBe(0);
    // الختم بيرجع لبداية الجلسة — السياق اللي المندوب دخله قبل ما يسجّل
    expect(t.relMs).toBe(0);
  });

  it("النسبي عمره ما يبقى سالب", () => {
    const t = spokenTimes({
      timeStartS: undefined,
      baseMs: BASE,
      lastKnownAbsMs: BASE - 9_000, // ساعة الجهاز اتعدّلت للخلف
    });
    expect(t.relMs).toBe(0);
    expect(t.absMs).toBe(BASE - 9_000);
  });

  it("قيم غريبة مابتطلّعش NaN", () => {
    const bad = [
      { timeStartS: Number.NaN, baseMs: BASE, lastKnownAbsMs: 0 },
      { timeStartS: Infinity, baseMs: BASE, lastKnownAbsMs: 0 },
      { timeStartS: 5, baseMs: Number.NaN, lastKnownAbsMs: 0 },
      { timeStartS: undefined, baseMs: 0, lastKnownAbsMs: Number.NaN },
    ];
    for (const b of bad) {
      const t = spokenTimes(b as never);
      expect(Number.isFinite(t.absMs)).toBe(true);
      expect(Number.isFinite(t.relMs)).toBe(true);
      expect(t.relMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("وقت صفر في الصوت = لوحة في أول الشريط، مش «مش معروف»", () => {
    const t = spokenTimes({ timeStartS: 0, baseMs: BASE, lastKnownAbsMs: 0 });
    expect(t.known).toBe(true);
    expect(t.absMs).toBe(BASE);
    expect(t.relMs).toBe(0);
  });
});
