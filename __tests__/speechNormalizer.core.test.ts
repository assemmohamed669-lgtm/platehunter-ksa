/**
 * اختبارات نواة محرّك تطبيع الكلام (المرحلة ١-ب / خطوة ٣ — عنقود ١)
 * =================================================================
 * الأساس (context + trace + ledger الإسقاط) + أول وحدتين نصيتين:
 *  - unicodeCleanup (تنظيف يونيكود من السلوك الحالي)
 *  - normalizeNumbers (ZERO_WORD_RE **قبل** SPOKEN_NUMBERS — قيد رسمي)
 *
 * مبدأ «ممنوع الإسقاط الصامت» متطبّق من أول سطر: أي توكن بيسقط بيتسجّل في
 * ctx.dropped **و** ctx.trace بالسبب — الاختبارات بتتأكد من ده.
 */
import { describe, it, expect } from "vitest";
import {
  createContext,
  addTrace,
  dropToken,
} from "../lib/speech-normalizer/types";
import { unicodeCleanup } from "../lib/speech-normalizer/unicodeCleanup";
import { normalizeNumbers } from "../lib/speech-normalizer/normalizeNumbers";

describe("types — أساس السياق والتتبّع وسجلّ الإسقاط", () => {
  it("createContext بيبدأ بسياق نضيف", () => {
    const ctx = createContext("نص");
    expect(ctx.original).toBe("نص");
    expect(ctx.text).toBe("نص");
    expect(ctx.trace).toEqual([]);
    expect(ctx.dropped).toEqual([]);
    expect(ctx.notes).toEqual([]);
    expect(ctx.vehicleTypes).toEqual([]);
  });

  it("addTrace بيسجّل خطوة بالسبب", () => {
    const ctx = createContext("x");
    addTrace(ctx, "stageA", "x", "y", "سبب");
    expect(ctx.trace).toHaveLength(1);
    expect(ctx.trace[0]).toMatchObject({ stage: "stageA", before: "x", after: "y", reason: "سبب" });
  });

  it("dropToken بيسجّل في dropped وفي trace معاً (لا إسقاط صامت)", () => {
    const ctx = createContext("x");
    dropToken(ctx, "؟؟", "stageA", "توكن غير معروف");
    expect(ctx.dropped).toHaveLength(1);
    expect(ctx.dropped[0]).toMatchObject({ text: "؟؟", stage: "stageA", reason: "توكن غير معروف" });
    // لازم يظهر في الـ trace كمان
    expect(ctx.trace.some((t) => t.reason.includes("توكن غير معروف"))).toBe(true);
  });
});

describe("unicodeCleanup — تنظيف اليونيكود", () => {
  it("بيشيل التشكيل والتطويل", () => {
    const ctx = createContext("دَالْـ");
    unicodeCleanup(ctx);
    expect(ctx.text).toBe("دال");
  });

  it("بيوحّد الألف (أ/إ/آ → ا) والياء (ى → ي)", () => {
    const ctx = createContext("أحمد إلى آخر مصطفى");
    unicodeCleanup(ctx);
    expect(ctx.text).toBe("احمد الي اخر مصطفي");
  });

  it("بيحوّل الأرقام العربية-الهندية لغربية", () => {
    const ctx = createContext("٥٩٣٢");
    unicodeCleanup(ctx);
    expect(ctx.text).toBe("5932");
  });

  it("بيحوّل علامات الترقيم لمسافات", () => {
    const ctx = createContext("اثنين،تلاتة؛اربعة");
    unicodeCleanup(ctx);
    expect(ctx.text).toBe("اثنين تلاتة اربعة");
  });

  it("بيسجّل خطوة في الـ trace", () => {
    const ctx = createContext("دَال");
    unicodeCleanup(ctx);
    expect(ctx.trace.some((t) => t.stage === "unicodeCleanup")).toBe(true);
  });
});

describe("normalizeNumbers — تطبيع الأرقام المنطوقة", () => {
  it("بيحوّل الأرقام المنطوقة الأحادية", () => {
    const ctx = createContext("خمسة تسعة تلاتة اتنين");
    normalizeNumbers(ctx);
    expect(ctx.text.replace(/\s+/g, "")).toBe("5932");
  });

  it("بيحوّل عائلة زير للصفر (زيرو/زيرة/زيره)", () => {
    for (const w of ["زيرو", "زيرة", "زيره", "زير"]) {
      const ctx = createContext(w);
      normalizeNumbers(ctx);
      expect(ctx.text.trim()).toBe("0");
    }
  });

  it("صيغ hotfix بتتحوّل (اربعه/تمنيه)", () => {
    const ctx = createContext("اربعه تمنيه");
    normalizeNumbers(ctx);
    expect(ctx.text.replace(/\s+/g, "")).toBe("48");
  });

  it("⚠️ قيد الترتيب: ZERO_WORD_RE بيتطبّق قبل SPOKEN_NUMBERS", () => {
    // «صفر» في SPOKEN_NUMBERS و عائلة «زير» في ZERO_WORD_RE. لو اتعكس الترتيب،
    // «زيرو» ممكن يتقطّع غلط. الاختبار ده بيثبت إن zero-forms بتتحل الأول.
    const ctx = createContext("زيرو خمسة");
    normalizeNumbers(ctx);
    expect(ctx.text.replace(/\s+/g, "")).toBe("05");
    // والـ trace بيوثّق إن مرحلة zero-forms جت قبل spoken-numbers
    const zeroIdx = ctx.trace.findIndex((t) => t.stage === "normalizeNumbers:zeroForms");
    const spokenIdx = ctx.trace.findIndex((t) => t.stage === "normalizeNumbers:spokenNumbers");
    expect(zeroIdx).toBeGreaterThanOrEqual(0);
    expect(spokenIdx).toBeGreaterThan(zeroIdx);
  });

  it("بيسجّل التحويلات في الـ trace", () => {
    const ctx = createContext("خمسة");
    normalizeNumbers(ctx);
    expect(ctx.trace.some((t) => t.stage.startsWith("normalizeNumbers"))).toBe(true);
  });
});
