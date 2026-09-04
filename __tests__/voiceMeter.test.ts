import { describe, it, expect } from "vitest";
import { smoothLevel, meterBars, barHeightScale, peakHold } from "@/lib/voiceMeter";

/**
 * مؤشّر الصوت القديم = ٥ أعمدة بتشتغل/تطفي على عتبات ثابتة، فبيرفرف وبيقول
 * معلومة قليلة. الجديد: أعمدة أكتر بتتملي **جزئياً**، بتنعيم سريع الصعود بطيء
 * الهبوط (فالكلام يبان فوراً والمؤشّر مايهتزّش)، وعلامة ذروة بتنزل بالراحة.
 */
describe("meterBars — امتلاء جزئي بدل شغّال/طافي", () => {
  it("سكوت = كل الأعمدة فاضية", () => {
    expect(meterBars(0, 5)).toEqual([0, 0, 0, 0, 0]);
  });

  it("أقصى مستوى = كل الأعمدة مليانة", () => {
    expect(meterBars(1, 4)).toEqual([1, 1, 1, 1]);
  });

  it("النص = نص الأعمدة مليان", () => {
    expect(meterBars(0.5, 4)).toEqual([1, 1, 0, 0]);
  });

  it("العمود اللي عند الحافة بيتملي جزئي — ده اللي بيدّي إحساس السلاسة", () => {
    const bars = meterBars(0.3, 4);
    expect(bars[0]).toBe(1);
    expect(bars[1]).toBeCloseTo(0.2);
    expect(bars[2]).toBe(0);
  });

  it("بيقصّ المستويات الغلط بدل ما يطلّع أرقام شاذة", () => {
    expect(meterBars(-5, 3)).toEqual([0, 0, 0]);
    expect(meterBars(9, 3)).toEqual([1, 1, 1]);
  });
});

describe("smoothLevel — يطلع بسرعة وينزل بالراحة", () => {
  it("الصعود أسرع من الهبوط لنفس الفرق", () => {
    const up = smoothLevel(0.2, 0.8);
    const down = smoothLevel(0.8, 0.2);
    expect(up - 0.2).toBeGreaterThan(0.8 - down);
  });

  it("بيقرب من الهدف مايتخطّاهوش", () => {
    expect(smoothLevel(0, 1)).toBeGreaterThan(0);
    expect(smoothLevel(0, 1)).toBeLessThanOrEqual(1);
  });

  it("مستقرّ لو الهدف مااتغيّرش", () => {
    expect(smoothLevel(0.5, 0.5)).toBeCloseTo(0.5);
  });

  it("محبوس بين ٠ و١", () => {
    expect(smoothLevel(0.5, 9)).toBeLessThanOrEqual(1);
    expect(smoothLevel(0.5, -9)).toBeGreaterThanOrEqual(0);
  });
});

describe("barHeightScale — شكل مرايا (الأعمدة الوسط أطول)", () => {
  it("الوسط أطول من الأطراف", () => {
    const n = 9;
    const mid = barHeightScale(4, n);
    expect(mid).toBeGreaterThan(barHeightScale(0, n));
    expect(mid).toBeGreaterThan(barHeightScale(8, n));
  });

  it("متماثل حوالين المنتصف", () => {
    const n = 8;
    expect(barHeightScale(0, n)).toBeCloseTo(barHeightScale(7, n));
    expect(barHeightScale(2, n)).toBeCloseTo(barHeightScale(5, n));
  });

  it("مايوصلش صفر — كل عمود ليه أرضية مرئية", () => {
    for (let i = 0; i < 12; i++) expect(barHeightScale(i, 12)).toBeGreaterThan(0.2);
  });
});

describe("peakHold — علامة الذروة بتنزل بالراحة", () => {
  it("بتقفز فوراً للذروة الجديدة", () => {
    expect(peakHold(0.3, 0.9)).toBe(0.9);
  });

  it("بتنزل شوية شوية لما الصوت يهدا", () => {
    const p1 = peakHold(0.9, 0.1);
    expect(p1).toBeLessThan(0.9);
    expect(p1).toBeGreaterThan(0.1);
  });

  it("مابتنزلش تحت المستوى الحالي", () => {
    expect(peakHold(0.5, 0.5)).toBeGreaterThanOrEqual(0.5);
  });
});
