/**
 * اختبارات اشتقاق القواميس من البذرة (المرحلة ١-ب / خطوة ١)
 * =========================================================
 * القاعدة: القواميس دي **مشتقّة** من `lib/dictionaries/saudiPlateLetters.ts`
 * (import/transform) — مش إعادة كتابة أو اختراع. الاختبارات بتقفل:
 *  1. كل variant من كل حرف بيتحوّل للـ canonical بتاعه.
 *  2. riskyOverlaps **ما بتدخلش** الخريطة المباشرة (آلة الحالة بس تحكم فيها).
 *  3. الاشتقاق بيرمي بصوت عالي لو فيه تعارض variant (No Silent Drops على مستوى البيانات).
 *  4. الجيرة الصوتية متماثلة ومقصورة على الـ 17 حرف.
 *  5. أخطاء السمع الشائعة منفصلة تماماً عن أشكال النطق (variants).
 */
import { describe, it, expect } from "vitest";
import {
  SAUDI_PLATE_LETTERS,
  COMMON_LETTER_MISTAKES,
  PHONETIC_NEIGHBOR_GROUPS,
} from "../lib/dictionaries/saudiPlateLetters";
import {
  CANONICAL_PLATE_LETTERS,
  LETTER_VARIANT_MAP,
  buildLetterVariantMap,
} from "../lib/dictionaries/letters";
import {
  PHONETIC_NEIGHBOR_GROUPS as ALIASES_GROUPS,
  phoneticNeighborsOf,
} from "../lib/dictionaries/phoneticAliases";
import {
  COMMON_LETTER_MISTAKES as MISTAKES_REEXPORT,
  LETTER_MISTAKE_MAP,
} from "../lib/dictionaries/commonMistakes";

describe("letters.ts — اشتقاق أشكال النطق من البذرة", () => {
  it("الحروف الرسمية = بالظبط الـ 17 canonical من البذرة وبنفس الترتيب", () => {
    expect(CANONICAL_PLATE_LETTERS).toEqual(
      SAUDI_PLATE_LETTERS.map((e) => e.canonical)
    );
    expect(CANONICAL_PLATE_LETTERS).toHaveLength(17);
  });

  it("كل variant من كل حرف بيتحوّل للـ canonical بتاعه", () => {
    for (const entry of SAUDI_PLATE_LETTERS) {
      for (const v of entry.variants) {
        expect(LETTER_VARIANT_MAP[v]).toBe(entry.canonical);
      }
    }
  });

  it("كل قيمة في الخريطة حرف رسمي (مافيش قيمة مخترعة)", () => {
    const canon = new Set(CANONICAL_PLATE_LETTERS);
    for (const value of Object.values(LETTER_VARIANT_MAP)) {
      expect(canon.has(value)).toBe(true);
    }
  });

  it("الخريطة مشتقّة من variants فقط — riskyOverlaps ما تدخلش", () => {
    // riskyOverlaps نصوص وصفية؛ ولا واحد منها المفروض يبقى مفتاح مباشر
    for (const entry of SAUDI_PLATE_LETTERS) {
      for (const risky of entry.riskyOverlaps ?? []) {
        expect(LETTER_VARIANT_MAP).not.toHaveProperty(risky);
      }
    }
    // عدد المفاتيح = عدد الـ variants الفريدة (مافيش زيادة من مصدر تاني)
    const uniqueVariants = new Set(
      SAUDI_PLATE_LETTERS.flatMap((e) => e.variants)
    );
    expect(Object.keys(LETTER_VARIANT_MAP)).toHaveLength(uniqueVariants.size);
  });

  it("buildLetterVariantMap بيرمي بصوت عالي عند تعارض variant (لا إسقاط صامت)", () => {
    expect(() =>
      buildLetterVariantMap([
        { canonical: "ا", latin: "A", msaName: "ألف", variants: ["مثال"] },
        { canonical: "ب", latin: "B", msaName: "باء", variants: ["مثال"] },
      ])
    ).toThrow();
  });
});

describe("phoneticAliases.ts — اشتقاق الجيرة الصوتية من البذرة", () => {
  it("بيعيد تصدير مجموعات الجيرة زي ما هي في البذرة", () => {
    expect(ALIASES_GROUPS).toEqual(PHONETIC_NEIGHBOR_GROUPS);
  });

  it("جيران ح فيهم ه ومش فيهم ح نفسه", () => {
    const n = phoneticNeighborsOf("ح");
    expect(n).toContain("ه");
    expect(n).not.toContain("ح");
  });

  it("الجيرة متماثلة: لو b جار a يبقى a جار b", () => {
    for (const letter of CANONICAL_PLATE_LETTERS) {
      for (const neighbor of phoneticNeighborsOf(letter)) {
        expect(phoneticNeighborsOf(neighbor)).toContain(letter);
      }
    }
  });

  it("كل حرف في مجموعات الجيرة حرف رسمي", () => {
    const canon = new Set(CANONICAL_PLATE_LETTERS);
    for (const group of ALIASES_GROUPS) {
      for (const letter of group) {
        expect(canon.has(letter)).toBe(true);
      }
    }
  });

  it("حرف مالهوش جيران بيرجّع مصفوفة فاضية", () => {
    expect(phoneticNeighborsOf("ح")).not.toHaveLength(0);
    // "لا حرف" → فاضي
    expect(phoneticNeighborsOf("ز")).toEqual([]);
  });
});

describe("commonMistakes.ts — اشتقاق أخطاء السمع من البذرة", () => {
  it("بيعيد تصدير قائمة الأخطاء زي ما هي في البذرة", () => {
    expect(MISTAKES_REEXPORT).toEqual(COMMON_LETTER_MISTAKES);
  });

  it("كل خطأ مسموع بيتحوّل لحرف رسمي مع درجة ثقته", () => {
    for (const m of COMMON_LETTER_MISTAKES) {
      expect(LETTER_MISTAKE_MAP[m.heard]).toEqual({
        canonical: m.canonical,
        confidence: m.confidence,
      });
    }
  });

  it("كل canonical في الأخطاء حرف رسمي", () => {
    const canon = new Set(CANONICAL_PLATE_LETTERS);
    for (const m of COMMON_LETTER_MISTAKES) {
      expect(canon.has(m.canonical)).toBe(true);
    }
  });

  it("أخطاء السمع منفصلة تماماً عن أشكال النطق (مافيش توكن في الاتنين)", () => {
    for (const heard of Object.keys(LETTER_MISTAKE_MAP)) {
      expect(LETTER_VARIANT_MAP).not.toHaveProperty(heard);
    }
  });
});
