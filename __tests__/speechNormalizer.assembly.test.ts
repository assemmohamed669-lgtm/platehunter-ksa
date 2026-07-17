/**
 * اختبارات التجميع والتحقّق والثقة والمنسّق (خطوة ٣ عنقود ٣+٤)
 * ===========================================================
 * التقطيع/التوجيه (normalizeWords) + كواشف المرحلة ٢ الستَب + الكاشف والمحقّق
 * والثقة + المنسّق الكامل `normalizeTranscript`.
 *
 * كل ده **مستقل عن `plateParser.ts`** — لسه مش متوصّل.
 */
import { describe, it, expect } from "vitest";
import { createContext } from "../lib/speech-normalizer/types";
import { normalizeWords } from "../lib/speech-normalizer/normalizeWords";
import { plateContextStateMachine } from "../lib/speech-normalizer/plateContextStateMachine";
import { fuzzy } from "../lib/speech-normalizer/fuzzy";
import { phonetic } from "../lib/speech-normalizer/phonetic";
import { platePatternDetector } from "../lib/speech-normalizer/platePatternDetector";
import { validatePlate } from "../lib/speech-normalizer/validators";
import { confidenceScore } from "../lib/speech-normalizer/confidenceScore";
import { normalizeTranscript } from "../lib/speech-normalizer";

describe("normalizeWords — التقطيع + توجيه الملاحظات + سحب النوع", () => {
  it("بيقطّع الحروف والأرقام لتوكنات مصنّفة", () => {
    const ctx = createContext("ب د ح 5 9 3 2");
    normalizeWords(ctx);
    expect(ctx.tokens.filter((t) => t.kind === "letter").map((t) => t.text)).toEqual(["ب", "د", "ح"]);
    expect(ctx.tokens.filter((t) => t.kind === "digit").map((t) => t.text)).toEqual(["5", "9", "3", "2"]);
  });

  it("بيوجّه كلمات الاتجاه/المكان للملاحظات (note routing)", () => {
    const ctx = createContext("ب د ح 5 9 3 2 يمين الشارع");
    normalizeWords(ctx);
    expect(ctx.notes).toContain("يمين");
    expect(ctx.notes).toContain("الشارع");
    // ومش بتتحسب حروف لوحة
    expect(ctx.tokens.some((t) => t.kind === "letter" && t.text === "ي")).toBe(false);
  });

  it("بيسحب نوع المركبة لخانته", () => {
    const ctx = createContext("ب د ح 5 9 3 2 ونيت");
    normalizeWords(ctx);
    expect(ctx.vehicleTypes).toContain("ونيت");
  });

  it("بيفكّ توكن ملزوق حروف+أرقام", () => {
    const ctx = createContext("حمل8121");
    normalizeWords(ctx);
    expect(ctx.tokens.filter((t) => t.kind === "letter").map((t) => t.text)).toEqual(["ح", "م", "ل"]);
    expect(ctx.tokens.filter((t) => t.kind === "digit").map((t) => t.text)).toEqual(["8", "1", "2", "1"]);
  });

  it("⚠️ توكن غير معروف بيتحفظ بثقة منخفضة ويتسجّل (لا إسقاط صامت)", () => {
    const ctx = createContext("ب د ح 5 9 3 2 قققق");
    normalizeWords(ctx);
    const unknown = ctx.tokens.find((t) => t.kind === "unknown");
    expect(unknown?.text).toBe("قققق");
    expect(unknown?.confidence).toBe("low");
    // اتسجّل في الـ trace بالسبب
    expect(ctx.trace.some((t) => t.before === "قققق")).toBe(true);
  });
});

describe("stubs المرحلة ٢ — passthrough بتتبّع", () => {
  it("plateContextStateMachine / fuzzy / phonetic كلهم passthrough دلوقتي", () => {
    for (const stage of [plateContextStateMachine, fuzzy, phonetic]) {
      const ctx = createContext("ب د ح 5 9 3 2");
      normalizeWords(ctx);
      const tokensBefore = JSON.stringify(ctx.tokens);
      stage(ctx);
      expect(JSON.stringify(ctx.tokens)).toBe(tokensBefore); // مبيغيّروش التوكنات
      expect(ctx.trace.some((t) => t.reason.includes("مؤجّل"))).toBe(true); // تأجيل للمرحلة ٢
    }
  });
});

describe("platePatternDetector + validators — تجميع وتحقّق", () => {
  it("بيجمّع اللوحة (حروف + أرقام) بالترتيب", () => {
    const ctx = createContext("ب د ح 5 9 3 2");
    normalizeWords(ctx);
    platePatternDetector(ctx);
    expect(ctx.plate).toBe("بدح5932");
  });

  it("المحقّق بيعلّم اللوحة السليمة (٣ حروف + ٤ أرقام) needsReview=false", () => {
    const ctx = createContext("ب د ح 5 9 3 2");
    normalizeWords(ctx);
    platePatternDetector(ctx);
    validatePlate(ctx);
    expect(ctx.needsReview).toBe(false);
  });

  it("المحقّق بيعلّم اللوحة الناقصة needsReview=true", () => {
    const ctx = createContext("ب د 5 9 3"); // حرفين + ٣ أرقام
    normalizeWords(ctx);
    platePatternDetector(ctx);
    validatePlate(ctx);
    expect(ctx.needsReview).toBe(true);
  });
});

describe("confidenceScore — حساب الثقة", () => {
  it("لوحة سليمة كلها تحويلات عالية → high", () => {
    const ctx = createContext("ب د ح 5 9 3 2");
    normalizeWords(ctx);
    platePatternDetector(ctx);
    validatePlate(ctx);
    confidenceScore(ctx);
    expect(ctx.confidence).toBe("high");
  });

  it("وجود توكن غير معروف → low", () => {
    const ctx = createContext("ب د ح 5 9 3 قققق");
    normalizeWords(ctx);
    platePatternDetector(ctx);
    validatePlate(ctx);
    confidenceScore(ctx);
    expect(ctx.confidence).toBe("low");
  });

  it("تصحيح سمعي (medium) بدون لوحة سليمة → مش high", () => {
    const ctx = createContext("سعد سعد سعد 5 9 3 2"); // ص ص ص → ٣ حروف + ٤ أرقام لكن عبر mistakes
    // ملاحظة: بنمرّ بالمنسّق الكامل عشان تحويلات الحروف تحصل
    const r = normalizeTranscript("سعد سعد سعد 5 9 3 2");
    expect(r.confidence).not.toBe("high");
    void ctx;
  });
});

describe("normalizeTranscript — المنسّق الكامل", () => {
  it("بيرجّع لوحة + ثقة + trace + dropped + notes + vehicleTypes", () => {
    const r = normalizeTranscript("باء دال حاء خمسة تسعة تلاتة اتنين ونيت يمين");
    expect(r.plate).toBe("بدح5932");
    expect(r.needsReview).toBe(false);
    expect(r.confidence).toBe("high");
    expect(r.vehicleTypes).toContain("ونيت");
    expect(r.notes).toContain("يمين");
    expect(r.trace.length).toBeGreaterThan(0);
    expect(Array.isArray(r.dropped)).toBe(true);
  });

  it("بيطبّق ترتيب المراحل: unicodeCleanup أول حاجة في الـ trace", () => {
    const r = normalizeTranscript("٥ باء");
    expect(r.trace[0].stage).toBe("unicodeCleanup");
  });

  it("بيقبل تصحيحات متعلّمة محقونة", () => {
    const r = normalizeTranscript("زندق دال حاء 5 9 3 2", { corrections: { "زندق": "ب" } });
    expect(r.plate).toBe("بدح5932");
  });

  it("⚠️ حسم «ألف»: الحروف قبل الأرقام → «الف» = الحرف ا مش ١٠٠٠", () => {
    // القرار المعتمد: normalizeLetters قبل normalizeNumbers، زي plateAtoms في البارسر.
    // «الف باء دال واحد اتنين تلاته اربعه» → ابد1234
    const r = normalizeTranscript("الف باء دال واحد اتنين تلاته اربعه");
    expect(r.plate).toBe("ابد1234");
    expect(r.needsReview).toBe(false);
  });
});
