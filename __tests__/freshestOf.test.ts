import { describe, it, expect } from "vitest";
import { freshestOf } from "@/lib/gps";

/**
 * 🔴 **الموقع المجمّد — نفس النقطة لكل اللوحات.**
 *
 * `getFreshReading` لما النداء الأصلي يفشل كان بيرجّع `lastRaw ?? lastCoords`.
 * و`lastRaw` بيتحدّث من جوّه الدالة دي **بس** — يعني لو النداء نجح مرة وبعدها
 * فشل، كل اللوحات اللي بعدها بتاخد **نفس القراءة القديمة**، بينما المراقب
 * (`watchPosition`) بيحدّث `lastCoords` كل ثانية.
 *
 * بلاغ مندوب آيفون (٢٧ سبتمبر ٢٠٢٦): «الصوت بياخد نفس الموقع لكل اللوحات».
 */
describe("freshestOf — الأحدث بالوقت، مش الأول في الترتيب", () => {
  const at = (t: number, lat = 24.7) => ({ lat, lng: 46.8, accuracy: 10, timestamp: t });

  it("🔴 بيرجّع الأحدث حتى لو التاني في الترتيب", () => {
    const old = at(1000, 24.1);
    const live = at(9000, 24.9);
    expect(freshestOf(old, live)).toBe(live);
  });

  it("وبيرجّع الأول لو هو الأحدث", () => {
    const newer = at(9000, 24.9);
    const older = at(1000, 24.1);
    expect(freshestOf(newer, older)).toBe(newer);
  });

  it("لو واحد بس موجود بيرجّعه", () => {
    const only = at(5000);
    expect(freshestOf(only, null)).toBe(only);
    expect(freshestOf(null, only)).toBe(only);
  });

  it("الاتنين فاضيين = null", () => {
    expect(freshestOf(null, null)).toBeNull();
    expect(freshestOf(undefined, null)).toBeNull();
  });

  it("نفس الوقت بالظبط = الأول (سلوك ثابت، مش عشوائي)", () => {
    const a = at(5000, 24.1);
    const b = at(5000, 24.9);
    expect(freshestOf(a, b)).toBe(a);
  });
});
