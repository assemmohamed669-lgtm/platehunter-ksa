import { describe, it, expect } from "vitest";
import { resolveLearningEnabled } from "@/lib/learningSettings";

describe("resolveLearningEnabled — مفتاح التعلّم (الافتراضي: متوقّف = آمن)", () => {
  it("الافتراضي متوقّف لو مش محدّد", () => {
    expect(resolveLearningEnabled(null)).toBe(false);
    expect(resolveLearningEnabled(undefined)).toBe(false);
    expect(resolveLearningEnabled("")).toBe(false);
  });

  it("متوقّف صراحةً", () => {
    expect(resolveLearningEnabled(false)).toBe(false);
    expect(resolveLearningEnabled("0")).toBe(false);
    expect(resolveLearningEnabled(0)).toBe(false);
    expect(resolveLearningEnabled("false")).toBe(false);
  });

  it("شغّال بس لو true صريح", () => {
    expect(resolveLearningEnabled(true)).toBe(true);
    expect(resolveLearningEnabled("1")).toBe(true);
    expect(resolveLearningEnabled(1)).toBe(true);
    expect(resolveLearningEnabled("true")).toBe(true);
  });

  it("أي قيمة غريبة → متوقّف (آمن)", () => {
    expect(resolveLearningEnabled("xyz")).toBe(false);
    expect(resolveLearningEnabled({})).toBe(false);
    expect(resolveLearningEnabled(2)).toBe(false);
  });
});
