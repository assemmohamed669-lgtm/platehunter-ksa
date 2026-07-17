/**
 * اختبارات استخراج باقي القواميس كبيانات نقية (المرحلة ١-ب / خطوة ٢)
 * ==================================================================
 * القاعدة: **نقل حرفي** من `lib/plateParser.ts` بدون أي تغيير قيمة أو
 * إضافة أو تنقيح. الاختبارات دي بتقفل إن القيم المنقولة = القيم الحالية
 * المعتمدة، بما فيها صيغ hotfix الأرقام (اربعه/تمنيه…).
 *
 * ملاحظة: الأصول في البارسر (`SPOKEN_NUMBERS` … إلخ) private const مش
 * exported، فالاختبار بيقفل القيم بعينات ممثِّلة + الأعداد + صيغ الـ hotfix،
 * مش بمقارنة مرجع مباشر (النقل الحرفي اتأكّد كمان بمقارنة نصية وقت التنفيذ).
 */
import { describe, it, expect } from "vitest";
import { SPOKEN_NUMBERS } from "../lib/dictionaries/numbers";
import { ZERO_WORD_RE } from "../lib/dictionaries/zeroForms";
import { NOTE_KEYWORDS } from "../lib/dictionaries/noiseWords";
import { PHONETIC_MERGES } from "../lib/dictionaries/mergedWords";
import { VEHICLE_TYPES } from "../lib/dictionaries/vehicleTypes";

const numMap = new Map(SPOKEN_NUMBERS);
const mergeMap = new Map(PHONETIC_MERGES);

describe("numbers.ts — نقل SPOKEN_NUMBERS حرفياً", () => {
  it("صيغ hotfix الأرقام منقولة زي ما هي (اربعه/تمنيه…)", () => {
    expect(numMap.get("اربعه")).toBe("4");
    expect(numMap.get("أربعه")).toBe("4");
    expect(numMap.get("ربعة")).toBe("4");
    expect(numMap.get("ربعه")).toBe("4");
    expect(numMap.get("تمنية")).toBe("8");
    expect(numMap.get("تمنيه")).toBe("8");
    expect(numMap.get("خمسه")).toBe("5");
    expect(numMap.get("سته")).toBe("6");
    expect(numMap.get("سبعه")).toBe("7");
    expect(numMap.get("وتمنيه")).toBe("8"); // و-prefixed hotfix
  });

  it("قرار «واحده/واحدة» المتشالين محفوظ — ١ = واحد/وحده فقط", () => {
    expect(numMap.get("واحد")).toBe("1");
    expect(numMap.get("وحده")).toBe("1");
    expect(numMap.has("واحده")).toBe(false);
    expect(numMap.has("واحدة")).toBe(false);
  });

  it("عينات ممثِّلة عبر كل النطاقات (0 → آلاف + مركّبات)", () => {
    expect(numMap.get("صفر")).toBe("0");
    expect(numMap.get("عشرة")).toBe("10");
    expect(numMap.get("خمسطاشر")).toBe("15");
    expect(numMap.get("تلاتين")).toBe("30");
    expect(numMap.get("مية")).toBe("100");
    expect(numMap.get("مئتين")).toBe("200");
    expect(numMap.get("تلاتمية")).toBe("300");
    expect(numMap.get("ألفين")).toBe("2000");
    expect(numMap.get("ثمانية آلاف")).toBe("8000");
    expect(numMap.get("وعشرين")).toBe("20"); // و-prefixed
    expect(numMap.get("وخمسة")).toBe("5");
  });

  it("كل قيمة رقم صف أرقام غربية بحتة", () => {
    for (const [, digits] of SPOKEN_NUMBERS) {
      expect(digits).toMatch(/^\d+$/);
    }
  });

  it("مرتّبة الأطول-أولاً (عشان المطابقة المركّبة تكسب)", () => {
    for (let i = 1; i < SPOKEN_NUMBERS.length; i++) {
      expect(SPOKEN_NUMBERS[i - 1][0].length).toBeGreaterThanOrEqual(
        SPOKEN_NUMBERS[i][0].length
      );
    }
  });
});

describe("zeroForms.ts — نقل ZERO_WORD_RE حرفياً", () => {
  it("بيمسك عائلة زير/زيرو/زيرة/زيره/زيرى/زيرا ككلمة مستقلة", () => {
    for (const w of ["زير", "زيرو", "زيرة", "زيره", "زيرى", "زيرا"]) {
      const re = new RegExp(ZERO_WORD_RE.source, ZERO_WORD_RE.flags);
      expect(re.test(w)).toBe(true);
    }
  });

  it("مابيمسكش الكلمة لو ملتصقة بحروف عربية (lookaround)", () => {
    const re = new RegExp(ZERO_WORD_RE.source, ZERO_WORD_RE.flags);
    expect(re.test("وزيرالدولة")).toBe(false);
  });

  it("global flag محفوظ", () => {
    expect(ZERO_WORD_RE.flags).toContain("g");
  });
});

describe("noiseWords.ts — نقل NOTE_KEYWORDS حرفياً", () => {
  it("اتجاهات وأماكن ممثِّلة موجودة", () => {
    for (const w of [
      "يمين", "اليمين", "يسار", "شمال",
      "جراج", "الجراج", "كراج",
      "شارع", "الشارع", "برحة", "موقف",
    ]) {
      expect(NOTE_KEYWORDS.has(w)).toBe(true);
    }
  });

  it("Set غير فاضي", () => {
    expect(NOTE_KEYWORDS.size).toBeGreaterThan(0);
  });
});

describe("mergedWords.ts — نقل PHONETIC_MERGES حرفياً", () => {
  it("الدمجات الملتصقة (راياء/ياسين/احلام) منقولة", () => {
    expect(mergeMap.get("راياء")).toBe("ر ي");
    expect(mergeMap.get("ياسين")).toBe("ي س");
    expect(mergeMap.get("احلام")).toBe("ا ح ل");
    expect(mergeMap.get("احلم")).toBe("ا ح ل");
    expect(mergeMap.get("كادو")).toBe("ك د");
  });

  it("عبارة «حابة علامة» بكل صيغ الهاء منقولة → ح ب ل", () => {
    expect(mergeMap.get("حابة علامة")).toBe("ح ب ل");
    expect(mergeMap.get("حابه علامه")).toBe("ح ب ل");
    expect(mergeMap.get("حابهـ علامهـ")).toBe("ح ب ل");
  });

  it("مرتّبة الأطول-أولاً", () => {
    for (let i = 1; i < PHONETIC_MERGES.length; i++) {
      expect(PHONETIC_MERGES[i - 1][0].length).toBeGreaterThanOrEqual(
        PHONETIC_MERGES[i][0].length
      );
    }
  });
});

describe("vehicleTypes.ts — نقل VEHICLE_TYPES حرفياً", () => {
  it("أنواع ممثِّلة موجودة بكل صيغها (تاء مربوطة + هاء)", () => {
    for (const v of [
      "ونيت", "فان", "دباب", "شاحنة", "باص", "صالون", "بيكاب",
      "تاكسي", "كروزر", "باترول", "نقليات", "مفحوطة",
      "مصدومة", "مصدومه", "مركونة", "مركونه", "معطلة", "معطله",
    ]) {
      expect(VEHICLE_TYPES).toContain(v);
    }
  });

  it("العدد = 18 نوع (قفل ضد أي إضافة/حذف غير مقصود)", () => {
    expect(VEHICLE_TYPES).toHaveLength(18);
  });
});
