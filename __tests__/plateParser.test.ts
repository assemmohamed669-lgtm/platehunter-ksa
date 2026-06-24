import { describe, it, expect } from "vitest";
import { bankPlateToArabic, normalizePlate, similarityPercent } from "@/lib/plateParser";

// ─── bankPlateToArabic ────────────────────────────────────────────────────────
describe("bankPlateToArabic", () => {
  it("converts mapped English letters to Arabic and strips spaces", () => {
    // N→ن  K→ك  D→د  |  H→هـ  U→و  V→ي  |  A→ا  B→ب  D→د
    expect(bankPlateToArabic("NKD 5678")).toBe("نكد5678");
    expect(bankPlateToArabic("HUV 9999")).toBe("هـوي9999");
    expect(bankPlateToArabic("ABD 1234")).toBe("ابد1234");
  });

  it("keeps unmapped English letters unchanged (C has no Arabic mapping)", () => {
    // A→ا  B→ب  C→C (kept as-is, no mapping exists)
    expect(bankPlateToArabic("ABC 1234")).toBe("ابC1234");
  });

  it("strips spaces from Arabic-only input", () => {
    expect(bankPlateToArabic("أبح 1234")).toBe("أبح1234");
  });

  it("handles mixed Arabic-English input, stripping all spaces", () => {
    // B→ب  space stripped  ب→ب  space stripped  12→12
    expect(bankPlateToArabic("B ب 12")).toBe("بب12");
  });
});

// ─── normalizePlate ───────────────────────────────────────────────────────────
describe("normalizePlate", () => {
  it("strips spaces and normalizes alef variants (أ → ا, إ → ا)", () => {
    // strips spaces, then أ → ا for matching equality
    expect(normalizePlate("أ ب ح 1234")).toBe("ابح1234");
  });

  it("returns empty string for empty input", () => {
    expect(normalizePlate("")).toBe("");
  });

  it("keeps digits intact after normalizing", () => {
    expect(normalizePlate("نكد 5678")).toBe("نكد5678");
  });
});

// ─── similarityPercent ───────────────────────────────────────────────────────
describe("similarityPercent", () => {
  it("returns 100 for identical strings", () => {
    expect(similarityPercent("أبح1234", "أبح1234")).toBe(100);
  });

  it("returns 0 for completely different strings of same length", () => {
    expect(similarityPercent("أبح1234", "نكد5678")).toBe(0);
  });

  it("returns a value between 0-100 for similar strings", () => {
    const sim = similarityPercent("أبح1234", "أبح1235");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(100);
  });
});
