import { describe, it, expect } from "vitest";
import {
  KSA_PLATE_LETTERS,
  letterFromName,
  isPlateLetter,
  snapToPlateLetter,
  displayLetter,
  letterBoostTerms,
} from "../plateAlphabet";

describe("KSA_PLATE_LETTERS — الحروف المعتمدة على اللوحة السعودية", () => {
  it("١٧ حرف بالظبط", () => {
    expect(KSA_PLATE_LETTERS.length).toBe(17);
  });

  it("الحروف الصح جوّه القايمة", () => {
    for (const ch of ["ا", "ب", "ح", "د", "ر", "س", "ص", "ط", "ع", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي"]) {
      expect(isPlateLetter(ch)).toBe(true);
    }
  });

  it("الحروف اللي مش على اللوحة برّه القايمة", () => {
    for (const ch of ["ت", "ث", "ج", "خ", "ذ", "ز", "ش", "ض", "ظ", "غ", "ف"]) {
      expect(isPlateLetter(ch)).toBe(false);
    }
  });
});

describe("letterFromName — كل طرق نطق الحرف → الحرف المنفرد", () => {
  it("قاموس الشمولية المطلوب في المواصفات", () => {
    const cases: Array<[string[], string]> = [
      [["كاف", "كا", "ك"], "ك"],
      [["حاء", "حا", "ح"], "ح"],
      [["جيم", "چيم", "جا", "ج"], "ج"],
      [["ألف", "الف", "إلف", "أ"], "ا"],
      [["باء", "با", "ب"], "ب"],
      [["تاء", "تا", "ت"], "ت"],
      [["ثاء", "ثا", "ث"], "ث"],
      [["خاء", "خا", "خ"], "خ"],
      [["دال", "دا", "د"], "د"],
      [["ذال", "ذا", "ذ"], "ذ"],
      [["راء", "را", "ر"], "ر"],
      [["زاي", "زين", "زا", "ز"], "ز"],
      [["سين", "سا", "س"], "س"],
      [["شين", "شا", "ش"], "ش"],
      [["صاد", "صا", "ص"], "ص"],
      [["ضاد", "ضا", "ض"], "ض"],
      [["طاء", "طا", "ط"], "ط"],
      [["ظاء", "ظا", "ظ"], "ظ"],
      [["عين", "عا", "ع"], "ع"],
      [["غين", "غا", "غ"], "غ"],
      [["فاء", "فا", "ف"], "ف"],
      [["قاف", "قا", "ق"], "ق"],
      [["لام", "لا", "ل"], "ل"],
      [["ميم", "ما", "م"], "م"],
      [["نون", "نا", "ن"], "ن"],
      [["هاء", "ها", "هـ"], "ه"],
      [["واو", "وا", "و"], "و"],
      [["ياء", "يا", "ي"], "ي"],
    ];

    for (const [names, expected] of cases) {
      for (const name of names) {
        expect(letterFromName(name), `«${name}» المفروض ترجّع «${expected}»`).toBe(expected);
      }
    }
  });

  it("جدول النطق الحصري للـ١٧ حرف (المواصفات المحدّثة)", () => {
    // الجدول ده هو المرجع النهائي — أي حرف من الـ١٧ لازم كل صيغه تشتغل
    const table: Array<[string, string[]]> = [
      ["ا", ["ألف", "الف", "إلف", "أ", "آ"]],
      ["ب", ["باء", "با", "ب", "بيه"]],
      ["ح", ["حاء", "حا", "ح", "حه"]],
      ["د", ["دال", "دا", "د"]],
      ["ر", ["راء", "را", "ر", "ريه"]],
      ["س", ["سين", "سا", "س"]],
      ["ص", ["صاد", "صا", "ص"]],
      ["ط", ["طاء", "طا", "ط", "طيه"]],
      ["ع", ["عين", "عا", "ع"]],
      ["ق", ["قاف", "قا", "ق"]],
      ["ك", ["كاف", "كا", "ك"]],
      ["ل", ["لام", "لا", "ل"]],
      ["م", ["ميم", "ما", "م"]],
      ["ن", ["نون", "نا", "ن"]],
      ["ه", ["هاء", "ها", "هـ", "ه"]],
      ["و", ["واو", "وا", "و"]],
      ["ي", ["ياء", "يا", "ي", "ييه"]],
    ];

    expect(table).toHaveLength(17);

    for (const [letter, forms] of table) {
      expect(isPlateLetter(letter), `«${letter}» لازم يكون من حروف اللوحة`).toBe(true);
      for (const form of forms) {
        expect(letterFromName(form), `«${form}» المفروض ترجّع «${letter}»`).toBe(letter);
      }
    }
  });

  it("يتعامل مع التشكيل والتطويل", () => {
    expect(letterFromName("كَاف")).toBe("ك");
    expect(letterFromName("هـــا")).toBe("ه");
  });

  it("كلمة عادية مش حرف ترجّع null", () => {
    expect(letterFromName("سيارة")).toBeNull();
    expect(letterFromName("مطلوبة")).toBeNull();
  });
});

describe("snapToPlateLetter — تصحيح حرف مش موجود على اللوحة", () => {
  it("الحرف المعتمد يفضل زي ما هو", () => {
    expect(snapToPlateLetter("ب")).toEqual({ letter: "ب", changed: false, alternatives: [] });
  });

  it("يصحّح الحروف اللي مستحيل تكون على لوحة سعودية", () => {
    expect(snapToPlateLetter("ت").letter).toBe("ط");
    expect(snapToPlateLetter("ث").letter).toBe("س");
    expect(snapToPlateLetter("ج").letter).toBe("ح");
    expect(snapToPlateLetter("خ").letter).toBe("ح");
    expect(snapToPlateLetter("ذ").letter).toBe("د");
    expect(snapToPlateLetter("ز").letter).toBe("س");
    expect(snapToPlateLetter("ش").letter).toBe("س");
    expect(snapToPlateLetter("ض").letter).toBe("ص");
    expect(snapToPlateLetter("ظ").letter).toBe("ط");
    expect(snapToPlateLetter("غ").letter).toBe("ع");
    expect(snapToPlateLetter("ف").letter).toBe("ق");
  });

  it("بيعلّم إنه غيّر وبيرجّع بدائل", () => {
    const r = snapToPlateLetter("ض");
    expect(r.changed).toBe(true);
    expect(r.alternatives).toContain("د");
  });
});

describe("displayLetter — شكل العرض", () => {
  it("الهاء تتعرض هـ", () => {
    expect(displayLetter("ه")).toBe("هـ");
  });
  it("الباقي زي ما هو", () => {
    expect(displayLetter("ب")).toBe("ب");
  });
});

describe("letterBoostTerms — تعزيز المفردات لمحركات الصوت", () => {
  it("بيرجّع أسماء حروف اللوحة عشان نبعتها لـ Deepgram", () => {
    const terms = letterBoostTerms();
    expect(terms).toContain("كاف");
    expect(terms).toContain("واحد");
    expect(terms.length).toBeGreaterThan(20);
  });
});
