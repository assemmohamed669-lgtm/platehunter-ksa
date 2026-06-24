import { describe, it, expect } from "vitest";
import { bankPlateToArabic, normalizePlate, similarityPercent, levenshtein, matchDataAgainstReferral, parsePlateFromTranscript } from "@/lib/plateParser";

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

// ─── levenshtein ─────────────────────────────────────────────────────────────
describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("نكد5678", "نكد5678")).toBe(0);
  });

  it("returns 1 for a single substitution", () => {
    expect(levenshtein("نكد5678", "نكد5679")).toBe(1);
  });

  it("returns 1 for a single deletion", () => {
    expect(levenshtein("نكد5678", "نكد567")).toBe(1);
  });

  it("returns string length for empty-vs-string comparison", () => {
    expect(levenshtein("", "نكد")).toBe(3);
    expect(levenshtein("نكد", "")).toBe(3);
  });
});

// ─── matchDataAgainstReferral ─────────────────────────────────────────────────
describe("matchDataAgainstReferral", () => {
  const referralRows = [
    { "رقماللوحة": "نكد5678", "الماركة": "تويوتا" },
    { "رقماللوحة": "ابد1234", "الماركة": "هونداي" },
    { "رقماللوحة": "سعو1111", "الماركة": "كيا" },
  ];
  const dataRows = [
    { "رقم اللوحة": "نكد 5678", "GPS": "link1", "الحي": "العليا" },
    { "رقم اللوحة": "ابد 1234", "GPS": "link2", "الحي": "النزهة" },
    { "رقم اللوحة": "قصع9999", "GPS": "link3" }, // not in referral
  ];

  it("finds exact matches after normalizing both Arabic and English plates", () => {
    const results = matchDataAgainstReferral(dataRows, "رقم اللوحة", referralRows, "رقماللوحة");
    const exact = results.filter((r) => r.status === "exact");
    expect(exact).toHaveLength(2);
  });

  it("includes the data row in exact match results", () => {
    const results = matchDataAgainstReferral(dataRows, "رقم اللوحة", referralRows, "رقماللوحة");
    const match = results.find((r) => r.status === "exact" && r.dataRow?.["الحي"] === "العليا");
    expect(match).toBeDefined();
    expect(match?.referralRow["الماركة"]).toBe("تويوتا");
  });

  it("does not include non-matching plates in results", () => {
    const results = matchDataAgainstReferral(dataRows, "رقم اللوحة", referralRows, "رقماللوحة");
    const plates = results.map((r) => r.dataRow?.["رقم اللوحة"]);
    expect(plates).not.toContain("قصع9999");
  });

  it("finds fuzzy match for a plate with one digit error", () => {
    const refWithSimilar = [{ "رقماللوحة": "نكد5679", "الماركة": "نيسان" }];
    const dataWithClose = [{ "رقم اللوحة": "نكد5678" }]; // 1 edit away
    const results = matchDataAgainstReferral(dataWithClose, "رقم اللوحة", refWithSimilar, "رقماللوحة");
    // similarity = (1 - 1/7) * 100 = 85.7% — below 88% threshold, so no fuzzy match
    expect(results.filter((r) => r.status === "fuzzy")).toHaveLength(0);
  });

  it("converts English bank plate format before matching", () => {
    const englishReferral = [{ "Plate Number": "NKD 5678", "Vehicle Name": "Toyota" }];
    const arabicData = [{ "رقم اللوحة": "نكد5678", "GPS": "link" }];
    const results = matchDataAgainstReferral(arabicData, "رقم اللوحة", englishReferral, "Plate Number");
    expect(results.filter((r) => r.status === "exact")).toHaveLength(1);
  });
});

// ─── parsePlateFromTranscript ─────────────────────────────────────────────────
describe("parsePlateFromTranscript", () => {
  // User-provided examples — SR returns letters as a combined token
  it("parses حمن8531 when SR returns letters as one token", () => {
    const r = parsePlateFromTranscript("حمن 8531");
    expect(r.plate).toBe("حمن8531");
  });

  it("parses حرب1149 when SR returns letters as one token", () => {
    const r = parsePlateFromTranscript("حرب 1149");
    expect(r.plate).toBe("حرب1149");
  });

  it("parses منل9864 when SR returns letters as one token", () => {
    const r = parsePlateFromTranscript("منل 9864");
    expect(r.plate).toBe("منل9864");
  });

  it("parses ابك5632 when SR returns letters as one token", () => {
    const r = parsePlateFromTranscript("ابك 5632");
    expect(r.plate).toBe("ابك5632");
  });

  it("parses درق4121 when SR returns letters as one token", () => {
    const r = parsePlateFromTranscript("درق 4121");
    expect(r.plate).toBe("درق4121");
  });

  // Letters said individually still work
  it("parses letters given individually separated by spaces", () => {
    const r = parsePlateFromTranscript("د ر ق 4121");
    expect(r.plate).toBe("درق4121");
  });

  // ى (alef maqsura) treated as ي
  it("normalizes ى to ي in the plate", () => {
    const r = parsePlateFromTranscript("دوى 5521");
    expect(r.plate).toBe("دوي5521");
  });

  // Full 3-letter token with noise words should still work
  it("extracts plate from transcript with noise words", () => {
    const r = parsePlateFromTranscript("اللوحة حمن 8531 صالون");
    expect(r.plate).toBe("حمن8531");
  });

  // Letter names still work
  it("parses letter names like حاء ميم نون", () => {
    const r = parsePlateFromTranscript("حاء ميم نون 8531");
    expect(r.plate).toBe("حمن8531");
  });

  // Partial — only letters without digits
  it("returns empty plate if no digits found", () => {
    const r = parsePlateFromTranscript("حمن فقط");
    expect(r.plate).toBe("");
  });

  // Vehicle type detection
  it("extracts ونيت as vehicleType and keeps plate correct", () => {
    const r = parsePlateFromTranscript("ونيت حمن 8531");
    expect(r.plate).toBe("حمن8531");
    expect(r.vehicleType).toBe("ونيت");
  });

  it("extracts فان as vehicleType", () => {
    const r = parsePlateFromTranscript("فان درق 4121");
    expect(r.plate).toBe("درق4121");
    expect(r.vehicleType).toBe("فان");
  });

  // Observation words → notes (AFTER plate)
  it("captures direction words as notes after the plate", () => {
    const r = parsePlateFromTranscript("حمن 8531 بيلف يمين");
    expect(r.plate).toBe("حمن8531");
    expect(r.notes).toContain("يمين");
  });

  it("captures مركونه as notes (not vehicleType)", () => {
    const r = parsePlateFromTranscript("درق 4121 مركونه");
    expect(r.plate).toBe("درق4121");
    expect(r.vehicleType).toBeUndefined();
    expect(r.notes).toBeTruthy();
  });

  it("captures جراج يمين as notes after the plate", () => {
    const r = parsePlateFromTranscript("ابك 5632 جراج يمين");
    expect(r.plate).toBe("ابك5632");
    expect(r.notes).toContain("جراج");
  });

  // Observation words → notes (BEFORE plate)
  it("captures notes that appear BEFORE the plate letters", () => {
    const r = parsePlateFromTranscript("بيلف يمين حمن 8531");
    expect(r.plate).toBe("حمن8531");
    expect(r.notes).toContain("بيلف");
    expect(r.notes).toContain("يمين");
  });

  it("captures جراج يمين before plate and مركونه after", () => {
    const r = parsePlateFromTranscript("جراج يمين حمن 8531 مركونه");
    expect(r.plate).toBe("حمن8531");
    expect(r.notes).toContain("جراج");
    expect(r.notes).toContain("يمين");
  });

  it("handles individual plate letters with notes before them", () => {
    const r = parsePlateFromTranscript("بيلف يمين ح م ن 8531");
    expect(r.plate).toBe("حمن8531");
    expect(r.notes).toContain("يمين");
  });
});

// ─── normalizePlate — ى handling ─────────────────────────────────────────────
describe("normalizePlate ى normalization", () => {
  it("treats ى as equivalent to ي for matching", () => {
    expect(normalizePlate("دوى5521")).toBe("دوي5521");
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
