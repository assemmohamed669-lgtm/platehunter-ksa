/**
 * اختبارات وحدات النص — الضوضاء/التصحيح المتعلّم/الحروف/الدمج (خطوة ٣ عنقود ٢)
 * ==========================================================================
 */
import { describe, it, expect } from "vitest";
import { createContext } from "../lib/speech-normalizer/types";
import { removeNoise, NOISE_WORDS } from "../lib/speech-normalizer/removeNoise";
import { learnedCorrections } from "../lib/speech-normalizer/learnedCorrections";
import { normalizeLetters } from "../lib/speech-normalizer/normalizeLetters";
import { splitMergedLetters } from "../lib/speech-normalizer/splitMergedLetters";

describe("removeNoise — قائمة الضوضاء فاضية (سلوك جديد مؤجّل للمرحلة ٢)", () => {
  it("القائمة فاضية — أي إضافة تعتبر تغيير سلوك", () => {
    expect(NOISE_WORDS.size).toBe(0);
  });

  it("passthrough — مبيغيّرش النص", () => {
    const ctx = createContext("يا عم اثنين تلاتة");
    removeNoise(ctx);
    expect(ctx.text).toBe("يا عم اثنين تلاتة");
  });

  it("بيسجّل خطوة في الـ trace", () => {
    const ctx = createContext("نص");
    removeNoise(ctx);
    expect(ctx.trace.some((t) => t.stage === "removeNoise")).toBe(true);
  });
});

describe("learnedCorrections — تصحيحات محقونة (فاضية افتراضياً)", () => {
  it("بدون تصحيحات → passthrough", () => {
    const ctx = createContext("سعد خمسة");
    learnedCorrections(ctx);
    expect(ctx.text).toBe("سعد خمسة");
  });

  it("بيطبّق تصحيح محقون ويسجّله في الـ trace", () => {
    const ctx = createContext("كلمةغلط خمسة", { "كلمةغلط": "ص" });
    learnedCorrections(ctx);
    expect(ctx.text.replace(/\s+/g, " ")).toBe("ص خمسة");
    expect(ctx.trace.some((t) => t.stage === "learnedCorrections")).toBe(true);
  });
});

describe("normalizeLetters — أسماء الحروف + التصحيح السمعي", () => {
  it("بيحوّل أسماء الحروف للـ canonical (variants ثقة عالية)", () => {
    const ctx = createContext("باء دال الحاء");
    normalizeLetters(ctx);
    expect(ctx.text.replace(/\s+/g, "")).toBe("بدح");
  });

  it("أخطاء السمع بتتحوّل بثقة medium/low (مش high)", () => {
    const ctx = createContext("سعد");
    normalizeLetters(ctx);
    expect(ctx.text.trim()).toBe("ص");
    const mistakeTrace = ctx.trace.find((t) => t.stage === "normalizeLetters:mistakes");
    expect(mistakeTrace).toBeDefined();
    expect(mistakeTrace?.confidence).not.toBe("high");
  });

  it("خاء/غين (حروف برا المجموعة) بتتحوّل لأقرب حرف رسمي", () => {
    const ctx = createContext("خاء غين");
    normalizeLetters(ctx);
    expect(ctx.text.replace(/\s+/g, "")).toBe("حع");
  });

  it("variants ثقة عالية في الـ trace", () => {
    const ctx = createContext("دال");
    normalizeLetters(ctx);
    const vTrace = ctx.trace.find((t) => t.stage === "normalizeLetters:variants");
    expect(vTrace?.confidence).toBe("high");
  });
});

describe("splitMergedLetters — فك الدمج الصوتي", () => {
  it("بيفك الدمجات الملتصقة (راياء→ر ي، ياسين→ي س)", () => {
    const ctx = createContext("راياء ياسين");
    splitMergedLetters(ctx);
    expect(ctx.text.replace(/\s+/g, "")).toBe("رييس");
  });

  it("بيفك «حابة علامة» → ح ب ل", () => {
    const ctx = createContext("حابة علامة");
    splitMergedLetters(ctx);
    expect(ctx.text.replace(/\s+/g, "")).toBe("حبل");
  });

  it("بيسجّل خطوة في الـ trace", () => {
    const ctx = createContext("احلام");
    splitMergedLetters(ctx);
    expect(ctx.trace.some((t) => t.stage === "splitMergedLetters")).toBe(true);
  });
});
