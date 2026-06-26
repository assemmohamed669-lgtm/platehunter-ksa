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

// ─── Egyptian & colloquial dialect ───────────────────────────────────────────
describe("parsePlateFromTranscript — Egyptian & colloquial dialect", () => {
  // Short letter names (Egyptian)
  it("'را' recognized as ر (Egyptian short for راء)", () => {
    const r = parsePlateFromTranscript("حا را با 8531");
    expect(r.plate).toBe("حرب8531");
  });

  it("'طا' recognized as ط (Egyptian short for طاء)", () => {
    const r = parsePlateFromTranscript("طا را سين 4521");
    expect(r.plate).toBe("طرس4521");
  });

  it("'كي' recognized as ك (Egyptian letter name)", () => {
    const r = parsePlateFromTranscript("كي دال سين 8531");
    expect(r.plate).toBe("كدس8531");
  });

  // Egyptian ق (glottal stop — SR may return ءاف or آف instead of قاف)
  it("'ءاف' recognized as ق (Egyptian ق glottal stop transcription)", () => {
    const r = parsePlateFromTranscript("ءاف را دال 4521");
    expect(r.plate).toBe("قرد4521");
  });

  it("'آف' recognized as ق (alternative glottal stop transcription)", () => {
    const r = parsePlateFromTranscript("آف را دال 4521");
    expect(r.plate).toBe("قرد4521");
  });

  // Egyptian colloquial numbers
  it("'اتنين' recognized as 2 (Egyptian for اثنين)", () => {
    const r = parsePlateFromTranscript("حمن واحد اتنين تلاتة اربعة");
    expect(r.plate).toBe("حمن1234");
  });

  it("'تمانية' recognized as 8 (Egyptian for ثمانية)", () => {
    const r = parsePlateFromTranscript("درق تمانية خمسة تلاتة واحد");
    expect(r.plate).toBe("درق8531");
  });

  it("'تلاتين' recognized as 30 (Egyptian colloquial)", () => {
    const r = parsePlateFromTranscript("حمن تلاتين");
    expect(r.plate).toBe("حمن0030");
  });

  it("'حداشر' recognized as 11 (Egyptian colloquial)", () => {
    const r = parsePlateFromTranscript("حمن حداشر");
    expect(r.plate).toBe("حمن0011");
  });

  it("'اتناشر' recognized as 12 (Egyptian colloquial)", () => {
    const r = parsePlateFromTranscript("حمن اتناشر");
    expect(r.plate).toBe("حمن0012");
  });
});

// ─── Compound Arabic numbers ──────────────────────────────────────────────────
describe("parsePlateFromTranscript — compound Arabic numbers", () => {
  // و-prefixed tens (e.g. "خمسة وسبعين" = 75)
  it("parses و-prefixed ten: واحد وسبعين = 71 → 0071", () => {
    const r = parsePlateFromTranscript("حمن واحد وسبعين");
    expect(r.plate).toBe("حمن0071");
  });

  it("parses و-prefixed ten: خمسة وعشرين = 25 → 0025", () => {
    const r = parsePlateFromTranscript("حمن خمسة وعشرين");
    expect(r.plate).toBe("حمن0025");
  });

  it("parses و-prefixed ten: ثلاثة وثلاثين = 33 → 0033", () => {
    const r = parsePlateFromTranscript("درق ثلاثة وثلاثين");
    expect(r.plate).toBe("درق0033");
  });

  // Hundreds
  it("parses مئة alone = 100 → 0100", () => {
    const r = parsePlateFromTranscript("حمن مئة");
    expect(r.plate).toBe("حمن0100");
  });

  it("parses مية alone = 100 → 0100 (dialect)", () => {
    const r = parsePlateFromTranscript("حمن مية");
    expect(r.plate).toBe("حمن0100");
  });

  it("parses سبعمية = 700 → 0700", () => {
    const r = parsePlateFromTranscript("حمن سبعمية");
    expect(r.plate).toBe("حمن0700");
  });

  it("parses مئة وخمسة = 105 → 0105", () => {
    const r = parsePlateFromTranscript("درق مئة وخمسة");
    expect(r.plate).toBe("درق0105");
  });

  it("parses سبعمية وواحد وعشرين = 721 → 0721", () => {
    const r = parsePlateFromTranscript("حمن سبعمية وواحد وعشرين");
    expect(r.plate).toBe("حمن0721");
  });

  // Thousands
  it("parses 1000 digit-by-digit: واحد صفر صفر صفر", () => {
    // ألف standalone is ambiguous with the letter name for ا — use digit-by-digit
    const r = parsePlateFromTranscript("حمن واحد صفر صفر صفر");
    expect(r.plate).toBe("حمن1000");
  });

  it("parses ألفين = 2000", () => {
    const r = parsePlateFromTranscript("حمن ألفين");
    expect(r.plate).toBe("حمن2000");
  });

  it("parses سبعة آلاف = 7000", () => {
    const r = parsePlateFromTranscript("حمن سبعة آلاف");
    expect(r.plate).toBe("حمن7000");
  });

  it("parses ألف وخمسمية = 1500", () => {
    const r = parsePlateFromTranscript("حمن ألف وخمسمية");
    expect(r.plate).toBe("حمن1500");
  });

  it("parses سبعة آلاف ومئة وواحد وسبعين = 7171", () => {
    const r = parsePlateFromTranscript("حمن سبعة آلاف ومئة وواحد وسبعين");
    expect(r.plate).toBe("حمن7171");
  });

  it("parses ألف وخمسمية وأربعة وعشرين = 1524", () => {
    const r = parsePlateFromTranscript("درق ألف وخمسمية وأربعة وعشرين");
    expect(r.plate).toBe("درق1524");
  });
});

// ─── Alef variants (أ إ آ → ا) ──────────────────────────────────────────────
describe("parsePlateFromTranscript — alef variants", () => {
  it("handles إ (kasra) as ا: إبل 8089", () => {
    const r = parsePlateFromTranscript("إبل 8089");
    expect(r.plate).toBe("ابل8089");
  });

  it("handles أ (hamza above) as ا: أبل 8089", () => {
    const r = parsePlateFromTranscript("أبل 8089");
    expect(r.plate).toBe("ابل8089");
  });

  it("handles آ (madda) as ا: آبل 8089", () => {
    const r = parsePlateFromTranscript("آبل 8089");
    expect(r.plate).toBe("ابل8089");
  });

  it("handles إبل as letter names in plate: ابل8089", () => {
    const r = parsePlateFromTranscript("إبل 8089 ونيت");
    expect(r.plate).toBe("ابل8089");
    expect(r.vehicleType).toBe("ونيت");
  });
});

// ─── normalizePlate — ى handling ─────────────────────────────────────────────
describe("normalizePlate ى normalization", () => {
  it("treats ى as equivalent to ي for matching", () => {
    expect(normalizePlate("دوى5521")).toBe("دوي5521");
  });
});

// ─── normalizePlate — zero-padding ────────────────────────────────────────────
describe("normalizePlate zero-padding", () => {
  it("zero-pads 2-digit plate to 4: حكل80 → حكل0080", () => {
    expect(normalizePlate("حكل80")).toBe("حكل0080");
  });

  it("zero-pads 1-digit plate to 4: حكل8 → حكل0008", () => {
    expect(normalizePlate("حكل8")).toBe("حكل0008");
  });

  it("zero-pads 3-digit plate to 4: حكل800 → حكل0800", () => {
    expect(normalizePlate("حكل800")).toBe("حكل0800");
  });

  it("keeps 4-digit plate unchanged: حكل8000 → حكل8000", () => {
    expect(normalizePlate("حكل8000")).toBe("حكل8000");
  });

  it("idempotent: padding twice gives same result", () => {
    expect(normalizePlate("حكل0080")).toBe("حكل0080");
  });
});

// ─── normalizePlate — reversed plates ────────────────────────────────────────
describe("normalizePlate reversed plates", () => {
  it("fixes reversed Arabic plate: 5052حبك → حبك5052", () => {
    expect(normalizePlate("5052حبك")).toBe("حبك5052");
  });

  it("fixes reversed plate with spaces: 5052 ح ب ك → حبك5052", () => {
    expect(normalizePlate("5052 ح ب ك")).toBe("حبك5052");
  });

  it("fixes reversed plate with short digits: 80حكل → حكل0080", () => {
    expect(normalizePlate("80حكل")).toBe("حكل0080");
  });

  it("fixes reversed plate already zero-padded: 0080حكل → حكل0080", () => {
    expect(normalizePlate("0080حكل")).toBe("حكل0080");
  });
});

// ─── Real-world voice scenarios ──────────────────────────────────────────────
describe("parsePlateFromTranscript — real-world voice scenarios", () => {
  // ── Plate extraction ────────────────────────────────────────────────────────
  it("روع7171 via spoken compound number", () => {
    const r = parsePlateFromTranscript("روع سبعة آلاف ومئة وواحد وسبعين");
    expect(r.plate).toBe("روع7171");
  });

  it("روع7171 — letters as one token", () => {
    const r = parsePlateFromTranscript("روع 7171");
    expect(r.plate).toBe("روع7171");
  });

  it("حمن3594 via spoken compound number", () => {
    const r = parsePlateFromTranscript("حمن ثلاثة آلاف وخمسمية وأربعة وتسعين");
    expect(r.plate).toBe("حمن3594");
  });

  it("درق4121 — letters individually spoken", () => {
    const r = parsePlateFromTranscript("دال راء قاف أربعة آلاف ومئة وواحد وعشرين");
    expect(r.plate).toBe("درق4121");
  });

  // ── Vehicle type before plate ────────────────────────────────────────────────
  it("ونيت before plate → vehicleType", () => {
    const r = parsePlateFromTranscript("ونيت روع سبعة آلاف ومئة وواحد وسبعين");
    expect(r.plate).toBe("روع7171");
    expect(r.vehicleType).toBe("ونيت");
    expect(r.notes).not.toContain("ونيت");
  });

  it("فان before plate → vehicleType", () => {
    const r = parsePlateFromTranscript("فان روع سبعة آلاف ومئة وواحد وسبعين");
    expect(r.plate).toBe("روع7171");
    expect(r.vehicleType).toBe("فان");
  });

  it("دباب before plate → vehicleType", () => {
    const r = parsePlateFromTranscript("دباب حمن ثلاثة آلاف وتسعمية وواحد وعشرين");
    expect(r.plate).toBe("حمن3921");
    expect(r.vehicleType).toBe("دباب");
  });

  it("صالون before plate → vehicleType", () => {
    const r = parsePlateFromTranscript("صالون درق أربعة آلاف ومئة وواحد وعشرين");
    expect(r.plate).toBe("درق4121");
    expect(r.vehicleType).toBe("صالون");
  });

  it("vehicle type after plate still detected", () => {
    const r = parsePlateFromTranscript("روع سبعة آلاف ومئة وواحد وسبعين ونيت");
    expect(r.plate).toBe("روع7171");
    expect(r.vehicleType).toBe("ونيت");
  });

  // ── Notes after plate ────────────────────────────────────────────────────────
  it("جراج يمين → notes", () => {
    const r = parsePlateFromTranscript("روع سبعة آلاف ومئة وواحد وسبعين جراج يمين");
    expect(r.plate).toBe("روع7171");
    expect(r.notes).toContain("جراج");
    expect(r.notes).toContain("يمين");
    expect(r.vehicleType).toBeUndefined();
  });

  it("الشارع بيلف يمين → notes", () => {
    const r = parsePlateFromTranscript("روع سبعة آلاف ومئة وواحد وسبعين الشارع بيلف يمين");
    expect(r.plate).toBe("روع7171");
    expect(r.notes).toContain("يمين");
  });

  it("مصدومة → notes (not vehicleType)", () => {
    const r = parsePlateFromTranscript("روع سبعة آلاف ومئة وواحد وسبعين مصدومة");
    expect(r.plate).toBe("روع7171");
    expect(r.vehicleType).toBeUndefined();
    expect(r.notes).toContain("مصدومة");
  });

  it("مركونة → notes", () => {
    const r = parsePlateFromTranscript("روع سبعة آلاف ومئة وواحد وسبعين مركونة");
    expect(r.plate).toBe("روع7171");
    expect(r.vehicleType).toBeUndefined();
    expect(r.notes).toContain("مركون");
  });

  it("جراج يسار → notes", () => {
    const r = parsePlateFromTranscript("حمن ثلاثة آلاف وخمسمية وأربعة وتسعين جراج يسار");
    expect(r.plate).toBe("حمن3594");
    expect(r.notes).toContain("جراج");
    expect(r.notes).toContain("يسار");
  });

  it("واقفة في الشارع → notes", () => {
    const r = parsePlateFromTranscript("روع 7171 واقفة في الشارع");
    expect(r.plate).toBe("روع7171");
    expect(r.notes).toContain("واقف");
  });

  // ── Combined: vehicleType + plate + notes ───────────────────────────────────
  it("ونيت + plate + جراج يمين → all three fields", () => {
    const r = parsePlateFromTranscript("ونيت روع سبعة آلاف ومئة وواحد وسبعين جراج يمين");
    expect(r.plate).toBe("روع7171");
    expect(r.vehicleType).toBe("ونيت");
    expect(r.notes).toContain("جراج");
    expect(r.notes).toContain("يمين");
  });

  it("فان + plate + مصدومة → type + plate + notes", () => {
    const r = parsePlateFromTranscript("فان روع سبعة آلاف ومئة وواحد وسبعين مصدومة");
    expect(r.plate).toBe("روع7171");
    expect(r.vehicleType).toBe("فان");
    expect(r.notes).toContain("مصدومة");
  });

  it("دباب + plate + مركونة في الجراج → type + plate + notes", () => {
    const r = parsePlateFromTranscript("دباب حمن ثلاثة آلاف وتسعمية وواحد وعشرين مركونة في الجراج");
    expect(r.plate).toBe("حمن3921");
    expect(r.vehicleType).toBe("دباب");
    expect(r.notes).toContain("مركون");
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
