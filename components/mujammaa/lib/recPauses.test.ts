import { describe, expect, it } from "vitest";
import { audioToWallMs, pausedTotalMs, pausesForReport, sanitizePauses, type RecPause } from "./recPauses";

/**
 * ⏸️ «وقف مؤقت» في نفس التسجيل (المالك ٢٢ أكتوبر ٢٠٢٦): «اللوحات اللي قبل كدة تبقي متاخد ليها موقعها … وقت
 * ما قالها … ولما ييستأنف … كل لوحة بعدها يتاخدل ليها الموقع وقت ما قالها المندوب».
 *
 * الصوت مافيهوش الوقفة ⇒ ثانية اللوحة جوّه الصوت بتبقى **أبدر** من وقت نطقها بمدة الوقفات اللي قبلها.
 * `audioToWallMs` بترجّعها لوقتها الحقيقي (من بداية التسجيل) — ده اللي الموقع والوقت والمربعات بيتحسبوا بيه.
 */
describe("audioToWallMs", () => {
  const P: RecPause[] = [
    { atAudioMs: 60_000, durMs: 600_000 }, // بعد دقيقة صوت وقف ١٠ دقايق
    { atAudioMs: 90_000, durMs: 120_000 }, // بعد دقيقة ونص صوت وقف دقيقتين
  ];

  it("من غير وقفات = نفس الوقت بالظبط (التسجيل العادي مايتغيّرش)", () => {
    expect(audioToWallMs(12_345, [])).toBe(12_345);
    expect(audioToWallMs(12_345, undefined)).toBe(12_345);
    expect(audioToWallMs(12_345, null)).toBe(12_345);
  });

  it("لوحة قبل الوقفة ⇒ وقتها زي ما هو", () => {
    expect(audioToWallMs(59_000, P)).toBe(59_000);
  });

  it("لوحة بعد الوقفة الأولى ⇒ بتتأخر بمدتها", () => {
    expect(audioToWallMs(65_000, P)).toBe(665_000);
  });

  it("لوحة بعد الوقفتين ⇒ بتتأخر بمجموعهم", () => {
    expect(audioToWallMs(100_000, P)).toBe(100_000 + 600_000 + 120_000);
  });

  it("لوحة اتقالت أول ما كمّل (على حد الوقفة بالظبط) ⇒ بعد الوقفة", () => {
    expect(audioToWallMs(60_000, P)).toBe(660_000);
  });

  it("الترتيب في المصفوفة مايفرقش", () => {
    expect(audioToWallMs(100_000, [P[1], P[0]])).toBe(820_000);
  });

  it("وقت مش رقم بيرجع زي ما هو", () => {
    expect(audioToWallMs(Number.NaN, P)).toBeNaN();
  });
});

describe("sanitizePauses — اللي جاي من التخزين", () => {
  it("بيشيل الوقفات البايظة ويرتّب", () => {
    expect(
      sanitizePauses([
        { atAudioMs: 9000, durMs: 1000 },
        { atAudioMs: -5, durMs: 100 },
        { atAudioMs: 3000, durMs: 0 },
        { atAudioMs: "x", durMs: 10 },
        null,
        { atAudioMs: 2000, durMs: 500 },
      ])
    ).toEqual([
      { atAudioMs: 2000, durMs: 500 },
      { atAudioMs: 9000, durMs: 1000 },
    ]);
  });

  it("مش مصفوفة ⇒ فاضية", () => {
    expect(sanitizePauses(undefined)).toEqual([]);
    expect(sanitizePauses({})).toEqual([]);
  });
});

describe("pausedTotalMs / pausesForReport", () => {
  it("مجموع الوقفات", () => {
    expect(pausedTotalMs([{ atAudioMs: 1, durMs: 1500 }, { atAudioMs: 2, durMs: 500 }])).toBe(2000);
    expect(pausedTotalMs(undefined)).toBe(0);
  });

  it("للتقرير: [ثانيتها في الصوت, مدتها بالثواني]", () => {
    expect(pausesForReport([{ atAudioMs: 61_250, durMs: 600_400 }])).toEqual([[61.3, 600.4]]);
    expect(pausesForReport([])).toBeUndefined();
  });
});
