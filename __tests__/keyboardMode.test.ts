// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  PLATE_LETTERS,
  plateLetterCount,
  plateKeyboardMode,
  readSmartKeyboard,
  writeSmartKeyboard,
} from "@/lib/keyboardMode";

describe("plateLetterCount — عدد الحروف بس (بلا فراغات ولا أرقام)", () => {
  it("قيمة فاضية ⇒ صفر", () => {
    expect(plateLetterCount("")).toBe(0);
    expect(plateLetterCount(null as unknown as string)).toBe(0);
    expect(plateLetterCount(undefined as unknown as string)).toBe(0);
  });
  it("حروف عربية", () => {
    expect(plateLetterCount("ق")).toBe(1);
    expect(plateLetterCount("قن")).toBe(2);
    expect(plateLetterCount("قنص")).toBe(3);
  });
  it("الفراغات مش محسوبة", () => {
    expect(plateLetterCount("ق ن ص")).toBe(3);
    expect(plateLetterCount(" ق ")).toBe(1);
  });
  it("الأرقام (عربية أو إنجليزية) مش حروف", () => {
    expect(plateLetterCount("قنص1234")).toBe(3);
    expect(plateLetterCount("قنص ١٢٣٤")).toBe(3);
    expect(plateLetterCount("١٢٣٤")).toBe(0);
    expect(plateLetterCount("1234")).toBe(0);
  });
  it("حروف إنجليزية زي العربية", () => {
    expect(plateLetterCount("ABC")).toBe(3);
    expect(plateLetterCount("AB12")).toBe(2);
  });
});

describe("plateKeyboardMode — الخيار مقفول (السلوك الحالي)", () => {
  // أهم اختبار: مقفول ⇒ text دايماً مهما كانت القيمة.
  it("smart=false ⇒ text لكل القيم", () => {
    for (const v of ["", "ق", "قن", "قنص", "قنص1234", "ABC", "ق ن ص 1 2 3 4"]) {
      expect(plateKeyboardMode(v, false)).toBe("text");
    }
  });
});

describe("plateKeyboardMode — الخيار مفتوح", () => {
  it("حرف/حرفين ⇒ text، والحرف التالت ⇒ numeric", () => {
    expect(plateKeyboardMode("", true)).toBe("text");
    expect(plateKeyboardMode("ق", true)).toBe("text");
    expect(plateKeyboardMode("قن", true)).toBe("text");
    expect(plateKeyboardMode("قنص", true)).toBe("numeric");
  });
  it("مع الأرقام ⇒ numeric", () => {
    expect(plateKeyboardMode("قنص1", true)).toBe("numeric");
    expect(plateKeyboardMode("قنص1234", true)).toBe("numeric");
  });
  it("مسح حرف بيرجّع text", () => {
    expect(plateKeyboardMode("قنص", true)).toBe("numeric");
    expect(plateKeyboardMode("قن", true)).toBe("text"); // بعد ما مسح حرف
  });
  it("«ق ن ص» بفراغات ⇒ numeric (الفراغات مش محسوبة)", () => {
    expect(plateKeyboardMode("ق ن ص", true)).toBe("numeric");
  });
  it("حروف إنجليزية (ABC) ⇒ numeric", () => {
    expect(plateKeyboardMode("ABC", true)).toBe("numeric");
  });
  it("أرقام عربية (١٢٣٤) مش حروف ⇒ text", () => {
    expect(plateKeyboardMode("١٢٣٤", true)).toBe("text");
  });
  it("PLATE_LETTERS = 3", () => {
    expect(PLATE_LETTERS).toBe(3);
  });
});

describe("readSmartKeyboard / writeSmartKeyboard — localStorage، الافتراضي false", () => {
  beforeEach(() => localStorage.clear());
  it("الافتراضي false", () => {
    expect(readSmartKeyboard()).toBe(false);
  });
  it("بتتكتب وتتقري", () => {
    writeSmartKeyboard(true);
    expect(readSmartKeyboard()).toBe(true);
    writeSmartKeyboard(false);
    expect(readSmartKeyboard()).toBe(false);
  });
});
