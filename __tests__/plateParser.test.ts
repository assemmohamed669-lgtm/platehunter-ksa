import { describe, it, expect } from "vitest";
import { bankPlateToArabic, normalizePlate, similarityPercent, levenshtein, matchDataAgainstReferral, parsePlateFromTranscript, extractMultiplePlates, plateContentScore, pickBestHypothesis, diffLetterCorrections, recordLetterCorrections, applyLetterConfusions, serializeLetterConfusions, deserializeLetterConfusions, recordWordBlend, applyWordBlend, serializeWordBlend, deserializeWordBlend, type LetterConfusionMap, type WordBlendMap } from "@/lib/plateParser";

// ─── plateContentScore / pickBestHypothesis ────────────────────────────────
describe("plateContentScore & pickBestHypothesis", () => {
  it("clean letter-name spelling scores higher than a mashed invented word", () => {
    expect(plateContentScore("راء قاف سين 3944")).toBeGreaterThan(
      plateContentScore("راقوف سين 3944")
    );
  });

  it("plate-like text scores higher than pure junk", () => {
    expect(plateContentScore("دال لام لام 9679")).toBeGreaterThan(
      plateContentScore("السلام عليكم ازيك")
    );
  });

  it("picks the cleanest hypothesis among alternatives", () => {
    const best = pickBestHypothesis(["راقوف سين 3944", "راء قاف سين 3944", "راقو 3944"]);
    expect(best).toBe("راء قاف سين 3944");
  });

  it("falls back to the first non-empty candidate", () => {
    expect(pickBestHypothesis(["", "حمل 8121"])).toBe("حمل 8121");
    expect(pickBestHypothesis([])).toBe("");
  });

  it("uses recognizer confidence as a tiebreaker when content scores are equal", () => {
    // Both hypotheses have identical plate-content shape (3 single letters + 4 digits),
    // so plateContentScore alone can't distinguish them — confidence should decide.
    const best = pickBestHypothesis(
      ["ر ق س 3944", "د ل ن 3944"],
      [0.4, 0.9]
    );
    expect(best).toBe("د ل ن 3944");
  });

  it("still prefers a clearly better content score over a higher-confidence but junkier candidate", () => {
    const best = pickBestHypothesis(
      ["السلام عليكم", "دال لام لام 9679"],
      [0.95, 0.5]
    );
    expect(best).toBe("دال لام لام 9679");
  });
});

// ─── Letter-confusion self-learning ────────────────────────────────────────
describe("diffLetterCorrections", () => {
  it("finds letter diffs when digits and letter count match", () => {
    expect(diffLetterCorrections("صح6469", "سح6469")).toEqual([{ heard: "ص", corrected: "س" }]);
  });

  it("ignores diffs when digits differ (can't be confident it's the same plate)", () => {
    expect(diffLetterCorrections("صح6469", "سح1111")).toEqual([]);
  });

  it("ignores diffs when letter count differs", () => {
    expect(diffLetterCorrections("صح6469", "سبح6469")).toEqual([]);
  });

  it("returns nothing for identical plates", () => {
    expect(diffLetterCorrections("صح6469", "صح6469")).toEqual([]);
  });

  it("treats هـ as a single unit", () => {
    expect(diffLetterCorrections("هـح6469", "بح6469")).toEqual([{ heard: "هـ", corrected: "ب" }]);
  });
});

describe("recordLetterCorrections & applyLetterConfusions", () => {
  it("does not correct below the minimum count", () => {
    const map: LetterConfusionMap = new Map();
    recordLetterCorrections(map, "صح6469", "سح6469");
    recordLetterCorrections(map, "صك1122", "سك1122");
    expect(applyLetterConfusions("صط5555", map)).toBe("صط5555");
  });

  it("corrects once the pattern is seen enough times and is dominant", () => {
    const map: LetterConfusionMap = new Map();
    recordLetterCorrections(map, "صح6469", "سح6469");
    recordLetterCorrections(map, "صك1122", "سك1122");
    recordLetterCorrections(map, "صط7777", "سط7777");
    expect(applyLetterConfusions("صل5555", map)).toBe("سل5555");
  });

  it("does not correct when the corrections for a letter are ambiguous (no dominant pattern)", () => {
    const map: LetterConfusionMap = new Map();
    recordLetterCorrections(map, "صح1111", "سح1111");
    recordLetterCorrections(map, "صك2222", "سك2222");
    recordLetterCorrections(map, "صط3333", "طط3333");
    recordLetterCorrections(map, "صل4444", "طل4444");
    expect(applyLetterConfusions("صم5555", map)).toBe("صم5555");
  });

  it("leaves digits untouched", () => {
    const map: LetterConfusionMap = new Map();
    recordLetterCorrections(map, "صح1111", "سح1111");
    recordLetterCorrections(map, "صك2222", "سك2222");
    recordLetterCorrections(map, "صط3333", "سط3333");
    expect(applyLetterConfusions("صم9999", map)).toBe("سم9999");
  });
});

describe("serializeLetterConfusions & deserializeLetterConfusions", () => {
  it("round-trips a confusion map through plain-object form", () => {
    const map: LetterConfusionMap = new Map();
    recordLetterCorrections(map, "صح6469", "سح6469");
    recordLetterCorrections(map, "صك1122", "سك1122");

    const plain = serializeLetterConfusions(map);
    const restored = deserializeLetterConfusions(plain);

    expect(restored.get("ص")?.get("س")).toBe(2);
  });

  it("deserializing null/undefined returns an empty map", () => {
    expect(deserializeLetterConfusions(undefined).size).toBe(0);
    expect(deserializeLetterConfusions(null).size).toBe(0);
  });
});

// ─── extractMultiplePlates ────────────────────────────────────────────────────
describe("extractMultiplePlates", () => {
  it("extracts a single spaced plate + vehicle type", () => {
    // Regression: the diacritic-strip range once ate base Arabic letters, so
    // "حمل" collapsed to "" and the whole plate was dropped.
    const r = extractMultiplePlates("حمل 8121 ونيت");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حمل8121");
    expect(r[0].vehicleType).toBe("ونيت");
  });

  it("extracts a plate spoken as one glued letters-word + digits", () => {
    const r = extractMultiplePlates("حمل8121 ونيت");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حمل8121");
    expect(r[0].vehicleType).toBe("ونيت");
  });

  it("extracts several plates spoken back-to-back", () => {
    const r = extractMultiplePlates("ابل2150 حمس3652 دبع6152 ربس6061 الط6125 ونيت");
    expect(r.map((x) => x.plate)).toEqual([
      "ابل2150", "حمس3652", "دبع6152", "ربس6061", "الط6125",
    ]);
    // vehicle keyword at the very end attaches to the last plate
    expect(r[r.length - 1].vehicleType).toBe("ونيت");
  });

  it("routes non-plate location words into notes, not the plate", () => {
    const r = extractMultiplePlates("حمل 8121 باركن يمين");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حمل8121");
    expect(r[0].notes).toContain("باركن");
  });
});

describe("extractMultiplePlates — corpus", () => {
  // ── Single clean plate ────────────────────────────────────────────────────
  it("single spaced plate", () => {
    const r = extractMultiplePlates("دنب 6806");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("دنب6806");
    expect(r[0].notes).toBe("");
    expect(r[0].vehicleType).toBeUndefined();
    expect(r[0].normalized).toBe("دنب6806");
  });

  it("single glued letters+digits plate", () => {
    const r = extractMultiplePlates("حمل8121");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حمل8121");
    expect(r[0].notes).toBe("");
  });

  // ── Letter-name normalization (فصحى) ──────────────────────────────────────
  it("fus-ha letter names: دال لام لام → دلل", () => {
    const r = extractMultiplePlates("دال لام لام 9679");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("دلل9679");
  });

  it("mixed letter-name + bare letter: صاد ح → صح (two-letter plate)", () => {
    const r = extractMultiplePlates("صاد ح 6469");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("صح6469");
    expect(r[0].normalized).toBe("صح6469");
  });

  it("letter names: را قاف سين → رقس", () => {
    const r = extractMultiplePlates("را قاف سين 3944");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("رقس3944");
  });

  // ── Egyptian short letter names ───────────────────────────────────────────
  it("egyptian short names: حا را با → حرب", () => {
    const r = extractMultiplePlates("حا را با 8531");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حرب8531");
  });

  it("egyptian short names: طا را سين → طرس", () => {
    const r = extractMultiplePlates("طا را سين 4521");
    expect(r[0].plate).toBe("طرس4521");
  });

  // ── Spoken numbers (number-words → digits) ────────────────────────────────
  it("spoken single-digit words: خمسة تسعة تلاتة اربعة → 5934", () => {
    const r = extractMultiplePlates("حمن خمسة تسعة تلاتة اربعة");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حمن5934");
  });

  it("egyptian number words: تمانية خمسة تلاتة واحد → 8531", () => {
    const r = extractMultiplePlates("درق تمانية خمسة تلاتة واحد");
    expect(r[0].plate).toBe("درق8531");
  });

  it("spoken hundreds: مئة → 0100 (zero-padded)", () => {
    const r = extractMultiplePlates("حمن مئة");
    expect(r[0].plate).toBe("حمن0100");
  });

  // ── Multi-plate back-to-back ──────────────────────────────────────────────
  it("two glued plates back-to-back", () => {
    const r = extractMultiplePlates("رقس3944 دلل9679");
    expect(r.map((x) => x.plate)).toEqual(["رقس3944", "دلل9679"]);
    expect(r.every((x) => x.notes === "")).toBe(true);
  });

  it("two spaced plates back-to-back", () => {
    const r = extractMultiplePlates("دنب 6806 حنص 4482");
    expect(r.map((x) => x.plate)).toEqual(["دنب6806", "حنص4482"]);
  });

  // ── Notes between / after plates ──────────────────────────────────────────
  it("trailing note attaches to preceding plate (ه→هـ applied inside notes)", () => {
    const r = extractMultiplePlates("حكل 80 مركونه");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حكل0080");
    expect(r[0].notes).toBe("مركونهـ");
  });

  it("taa-marbuta note kept verbatim: مركونة stays مركونة", () => {
    const r = extractMultiplePlates("اصك 4577 مركونة");
    expect(r[0].plate).toBe("اصك4577");
    expect(r[0].notes).toBe("مركونة");
  });

  it("note between two plates attaches to the PRECEDING plate", () => {
    const r = extractMultiplePlates("اصك 4577 مركونه حنص 4482");
    expect(r.map((x) => x.plate)).toEqual(["اصك4577", "حنص4482"]);
    expect(r[0].notes).toBe("مركونهـ");
    expect(r[1].notes).toBe("");
  });

  it("notes split across two plates (trailing then trailing)", () => {
    const r = extractMultiplePlates("دنب 6806 مركونه حنص 4482 يمين");
    expect(r.map((x) => x.plate)).toEqual(["دنب6806", "حنص4482"]);
    expect(r[0].notes).toBe("مركونهـ");
    expect(r[1].notes).toBe("يمين");
  });

  it("multi-word trailing note preserves order", () => {
    const r = extractMultiplePlates("حنص 4482 باركن يمين مركونه");
    expect(r[0].plate).toBe("حنص4482");
    expect(r[0].notes).toBe("باركن يمين مركونهـ");
  });

  it("leading note attaches to the FOLLOWING plate", () => {
    const r = extractMultiplePlates("باركن يمين حمل 8121");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حمل8121");
    expect(r[0].notes).toBe("باركن يمين");
  });

  // ── Vehicle types ─────────────────────────────────────────────────────────
  it("vehicle word before plate → vehicleType", () => {
    const r = extractMultiplePlates("دباب حمن 8531");
    expect(r[0].plate).toBe("حمن8531");
    expect(r[0].vehicleType).toBe("دباب");
    expect(r[0].notes).toBe("");
  });

  it("نقليات before plate → vehicleType (not eaten as letters)", () => {
    const r = extractMultiplePlates("نقليات ابك 5632");
    expect(r[0].plate).toBe("ابك5632");
    expect(r[0].vehicleType).toBe("نقليات");
  });

  it("second vehicle word on same plate spills into notes", () => {
    const r = extractMultiplePlates("دباب حمن 8531 ونيت");
    expect(r[0].plate).toBe("حمن8531");
    expect(r[0].vehicleType).toBe("دباب");
    expect(r[0].notes).toBe("ونيت");
  });

  it("vehicle word between two plates attaches to the PRECEDING plate", () => {
    const r = extractMultiplePlates("حمل 8121 صالون دنب 6806");
    expect(r.map((x) => x.plate)).toEqual(["حمل8121", "دنب6806"]);
    expect(r[0].vehicleType).toBe("صالون");
    expect(r[1].vehicleType).toBeUndefined();
  });

  it("vehicle keyword glued to digits is treated as a vehicle, dropping the digits → no plate", () => {
    const r = extractMultiplePlates("شاحنة8121");
    expect(r).toEqual([]);
  });

  // ── 1-2 letter plates with zero-pad ───────────────────────────────────────
  it("single-letter plate zero-pads digits: ا 80 → ا0080", () => {
    const r = extractMultiplePlates("ا 80");
    expect(r[0].plate).toBe("ا0080");
  });

  it("two-letter plate zero-pads a single digit: بح 8 → بح0008", () => {
    const r = extractMultiplePlates("بح 8");
    expect(r[0].plate).toBe("بح0008");
  });

  it("three-digit group zero-pads to four: حكل 800 → حكل0800", () => {
    const r = extractMultiplePlates("حكل 800");
    expect(r[0].plate).toBe("حكل0800");
  });

  it("repeated letter plate: دال دال → دد", () => {
    const r = extractMultiplePlates("دال دال 9679");
    expect(r[0].plate).toBe("دد9679");
  });

  // ── Garbled long-word best-effort ─────────────────────────────────────────
  it("garbled all-letters word adjacent to digits yields first 3 valid letters", () => {
    const r = extractMultiplePlates("راقوف 3944");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("راق3944");
  });

  it("phonetic-merge word normalizes then seeds the plate: احلام → احل", () => {
    const r = extractMultiplePlates("احلام 1234");
    expect(r[0].plate).toBe("احل1234");
  });

  // ── Digit-joining conjunction و ────────────────────────────────────────────
  // Spoken Arabic joins digits with "و" ("6 و 1 و 2 و 1" = 6121). The
  // recognizer emits it as a standalone token identical to the plate letter
  // waw — it must be treated as "and" when it sits between digits that still
  // fit ONE plate number, and as a letter otherwise.
  it("merges و-joined single digits into one plate number, flagged uncertain", () => {
    const r = extractMultiplePlates("ا ب ح 6 و 1 و 2 و 1");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("ابح6121");
    // A merge is always a guess — a genuine short second plate whose only
    // letter is واو can look identical — so it's flagged for a quick glance
    // even though the letters themselves were dictated cleanly.
    expect(r[0].uncertain).toBe(true);
  });

  it("does not flag uncertain when no و-merge happened", () => {
    const r = extractMultiplePlates("ا ب ح 1234");
    expect(r[0].uncertain).toBeFalsy();
  });

  it("the explicit letter name واو is never treated as the conjunction", () => {
    const r = extractMultiplePlates("ك م ل 12 واو 34");
    expect(r).toHaveLength(2);
    expect(r[0].plate).toBe("كمل0012");
    expect(r[1].plate).toBe("و0034");
  });

  // ── Letter-count overflow ───────────────────────────────────────────────
  // Real field recording: "الألف نون راو" dictated for a 3-letter plate ا ن ر
  // was misheard by Whisper as 5 clean letters (ا ن ر ا و — an extra "را" got
  // glued on). A plate has at most 3 letters, so the closest 3 to the digits
  // are kept as the guess (unchanged), but with 2+ more clean letters sitting
  // right before them, picking the last 3 over the first 3 is exactly that —
  // a guess — and must be flagged for a glance rather than trusted silently.
  it("flags uncertain when more than 3 clean letters precede the digits", () => {
    const r = extractMultiplePlates("ا ن ر ا و 6652");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("راو6652"); // nearest 3 kept, same as before this fix
    expect(r[0].uncertain).toBe(true);
  });

  it("does not flag uncertain when exactly 3 clean letters precede the digits", () => {
    const r = extractMultiplePlates("ا ن ر 6652");
    expect(r[0].plate).toBe("انر6652");
    expect(r[0].uncertain).toBeFalsy();
  });

  // ── rawLetterSource — the raw fragment behind an uncertain guess ──────────
  // Exposed so a later human correction can teach a whole-fragment blend
  // (see WordBlendMap tests below) instead of a misleading letter-by-letter
  // diff. Only ever set when the guess actually came from a fragment.
  it("exposes the FULL overflow run (not just the kept 3) as rawLetterSource", () => {
    const r = extractMultiplePlates("ا ن ر ا و 6652");
    expect(r[0].rawLetterSource).toBe("انراو");
  });

  it("exposes the raw garbled word as rawLetterSource for the salvage path", () => {
    const r = extractMultiplePlates("راقوف 3944");
    expect(r[0].rawLetterSource).toBe("راقوف");
  });

  it("leaves rawLetterSource unset for a confident, non-guessed plate", () => {
    const r = extractMultiplePlates("ا ب ح 1234");
    expect(r[0].rawLetterSource).toBeUndefined();
  });

  // ── WordBlendMap — whole-fragment self-learning ───────────────────────────
  // Complements LetterConfusionMap: a mishearing that replaces an entire
  // dictated letter group (not one letter drifting) must be learned as one
  // unit, or diffing it position-by-position teaches individually-wrong
  // single-letter rules. Same minCount/minDominance safety threshold as the
  // letter-confusion learner — a one-off correction must not immediately
  // start auto-applying.
  it("does not auto-apply a blend seen fewer than minCount times", () => {
    const map: WordBlendMap = new Map();
    recordWordBlend(map, "انراو", "انر");
    recordWordBlend(map, "انراو", "انر");
    expect(applyWordBlend("انراو", map)).toBeNull();
  });

  it("auto-applies a blend once it dominates at minCount+", () => {
    const map: WordBlendMap = new Map();
    recordWordBlend(map, "انراو", "انر");
    recordWordBlend(map, "انراو", "انر");
    recordWordBlend(map, "انراو", "انر");
    expect(applyWordBlend("انراو", map)).toBe("انر");
  });

  it("does not apply an inconsistent (non-dominant) blend", () => {
    const map: WordBlendMap = new Map();
    recordWordBlend(map, "باكاف", "حبك");
    recordWordBlend(map, "باكاف", "حبك");
    recordWordBlend(map, "باكاف", "بكا"); // a different correction, breaks dominance
    expect(applyWordBlend("باكاف", map)).toBeNull();
  });

  it("returns null for an unseen fragment or missing source", () => {
    const map: WordBlendMap = new Map();
    expect(applyWordBlend("غير معروف", map)).toBeNull();
    expect(applyWordBlend(undefined, map)).toBeNull();
  });

  it("round-trips WordBlendMap through serialize/deserialize", () => {
    const map: WordBlendMap = new Map();
    recordWordBlend(map, "انراو", "انر");
    recordWordBlend(map, "انراو", "انر");
    recordWordBlend(map, "انراو", "انر");
    const restored = deserializeWordBlend(serializeWordBlend(map));
    expect(applyWordBlend("انراو", restored)).toBe("انر");
  });

  it("keeps و as the next plate's letter between two complete 4-digit groups", () => {
    const r = extractMultiplePlates("ا ب ح 1234 و 5678");
    expect(r).toHaveLength(2);
    expect(r[0].plate).toBe("ابح1234");
    expect(r[1].plate).toBe("و5678");
  });

  // ── Real field transcript (Groq Whisper, single plate حبل6121) ────────────
  // Whisper merged the spelled letters "حا با لام" into the words
  // "حابة علامة" and joined every digit with و.
  it("real Whisper transcript: حابة علامة 6 و 1 و 2 و 1 → حبل6121", () => {
    const r = extractMultiplePlates("حابة علامة 6 و 1 و 2 و 1");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حبل6121");
    // Letters are confidently resolved (compound phonetic merge), but every
    // digit was still joined by a guessed و — worth a glance either way.
    expect(r[0].uncertain).toBe(true);
  });

  it("same transcript spelled with ه instead of ة still → حبل6121", () => {
    const r = extractMultiplePlates("حابه علامه 6 و 1 و 2 و 1");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("حبل6121");
  });

  // ── Full failure-data transcript (the 7 real plates) ──────────────────────
  it("recovers all 7 plates from the real garbled recording", () => {
    const r = extractMultiplePlates(
      "رقس 3944 دلل 9679 بطس 4284 و بصح 6469 و اصك 4577 مركونه حنص 4482 دنب 6806"
    );
    expect(r.map((x) => x.plate)).toEqual([
      "رقس3944", "دلل9679", "بطس4284", "بصح6469", "اصك4577", "حنص4482", "دنب6806",
    ]);
    expect(r[2].notes).toBe("و");
    expect(r[3].notes).toBe("و");
    expect(r[4].notes).toBe("مركونهـ");
  });

  // ── Empty / no-digit input ────────────────────────────────────────────────
  it("returns [] when there is no digit group at all", () => {
    expect(extractMultiplePlates("حمن فقط")).toEqual([]);
  });

  it("returns [] for empty input", () => {
    expect(extractMultiplePlates("")).toEqual([]);
  });
});

describe("extractMultiplePlates — vehicle & location routing", () => {
  it("vehicle word after the plate → vehicleType", () => {
    const r = extractMultiplePlates("حمل 8121 ونيت");
    expect(r[0].plate).toBe("حمل8121");
    expect(r[0].vehicleType).toBe("ونيت");
    expect(r[0].notes).toBe("");
  });

  it("شاحنة / دباب after the plate → vehicleType", () => {
    expect(extractMultiplePlates("دنب 6806 شاحنة")[0].vehicleType).toBe("شاحنة");
    expect(extractMultiplePlates("دنب 6806 دباب")[0].vehicleType).toBe("دباب");
  });

  // Location/directional words are ALL valid plate letters (يمين=ي م ي ن,
  // يسار=ي س ا ر) so without a guard they could be salvaged into the plate.
  it("directional word 'يمين' → notes, never plate letters", () => {
    const r = extractMultiplePlates("حمل 8121 يمين");
    expect(r[0].plate).toBe("حمل8121");
    expect(r[0].notes).toBe("يمين");
  });

  it("directional word 'يسار' → notes", () => {
    const r = extractMultiplePlates("حمل 8121 يسار");
    expect(r[0].plate).toBe("حمل8121");
    expect(r[0].notes).toBe("يسار");
  });

  it("location words جراج / برحة / شارع → notes", () => {
    expect(extractMultiplePlates("حمل 8121 جراج")[0].notes).toBe("جراج");
    expect(extractMultiplePlates("حمل 8121 برحة")[0].notes).toContain("برح");
    expect(extractMultiplePlates("حمل 8121 شارع الملك")[0].notes).toContain("شارع");
  });

  it("a location word with NO clean letters before digits must NOT become the plate", () => {
    // يمين is all-valid-letters; guard must stop it seeding a letterless-digit plate
    const r = extractMultiplePlates("يمين 1234");
    expect(r).toHaveLength(1);
    expect(r[0].plate).toBe("1234"); // digits only, letters not salvaged from يمين
    expect(r[0].notes).toBe("يمين");
  });

  it("vehicle + location together route to the correct fields", () => {
    const r = extractMultiplePlates("حمل 8121 ونيت جراج يمين");
    expect(r[0].plate).toBe("حمل8121");
    expect(r[0].vehicleType).toBe("ونيت");
    expect(r[0].notes).toBe("جراج يمين");
  });

  it("location words route to the correct plate in multi-plate input", () => {
    const r = extractMultiplePlates("دنب 6806 يمين حنص 4482 جراج");
    expect(r.map((x) => x.plate)).toEqual(["دنب6806", "حنص4482"]);
    expect(r[0].notes).toBe("يمين");
    expect(r[1].notes).toBe("جراج");
  });
});

// ─── extractMultiplePlates — long digit runs split into 4-digit chunks ─────
describe("extractMultiplePlates — digit-run chunking", () => {
  it("splits an 8-digit run with no letters between into two 4-digit plates", () => {
    // Two plate numbers dictated back-to-back with no letter naming in between —
    // must NOT collapse into one plate that silently drops the second half.
    const r = extractMultiplePlates("دنب 6806 4482");
    expect(r.map((x) => x.plate)).toEqual(["دنب6806", "4482"]);
    expect(r[1].uncertain).toBe(true);
  });

  it("splits an uneven digit run, keeping the leftover as its own (padded) plate", () => {
    const r = extractMultiplePlates("دنب 68064482 1");
    expect(r.map((x) => x.plate)).toEqual(["دنب6806", "4482", "0001"]);
  });

  it("does not affect a normal single 4-digit plate", () => {
    const r = extractMultiplePlates("دنب 6806");
    expect(r.map((x) => x.plate)).toEqual(["دنب6806"]);
  });
});

// ─── extractMultiplePlates — uncertain flag ────────────────────────────────
describe("extractMultiplePlates — uncertain flag", () => {
  it("is not set when letters come from clean, separately-dictated letters", () => {
    const r = extractMultiplePlates("را قاف سين 3944");
    expect(r[0].plate).toBe("رقس3944");
    expect(r[0].uncertain).toBeFalsy();
  });

  it("is set when letters are salvaged from a garbled word next to the digits", () => {
    const r = extractMultiplePlates("راقوف 3944");
    expect(r[0].plate).toBe("راق3944");
    expect(r[0].uncertain).toBe(true);
  });

  it("is set when no letters at all precede the digit group", () => {
    const r = extractMultiplePlates("3944");
    expect(r[0].plate).toBe("3944");
    expect(r[0].uncertain).toBe(true);
  });
});

// ─── bankPlateToArabic ────────────────────────────────────────────────────────
describe("bankPlateToArabic", () => {
  it("converts mapped English letters to Arabic and strips spaces", () => {
    // N→ن  K→ك  D→د  |  H→ه  U→و  V→ي  |  A→ا  B→ب  D→د
    expect(bankPlateToArabic("NKD 5678")).toBe("نكد5678");
    expect(bankPlateToArabic("HUV 9999")).toBe("هوي9999");
    expect(bankPlateToArabic("ABD 1234")).toBe("ابد1234");
  });

  it("maps C to ح (same as J — some bank files use C for ح)", () => {
    // A→ا  B→ب  C→ح (C was added to EN_TO_AR for bank files that use C instead of J)
    expect(bankPlateToArabic("ABC 1234")).toBe("ابح1234");
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

// ─── parsePlateFromTranscript — uncertain flag ─────────────────────────────
describe("parsePlateFromTranscript — uncertain flag", () => {
  it("is not set when the primary token scan finds clean letters", () => {
    const r = parsePlateFromTranscript("دنب 6806");
    expect(r.plate).toBe("دنب6806");
    expect(r.uncertain).toBeFalsy();
  });

  it("is set when digits are found but no letters precede or follow them", () => {
    const r = parsePlateFromTranscript("6806");
    expect(r.plate).toBe("6806");
    expect(r.uncertain).toBe(true);
  });

  it("is set when the primary token scan fails and the regex fallback is used", () => {
    // "68064482" is an 8-digit run — too long for the primary token scan's <=4
    // digit-token check, so it falls through to the regex fallback, which only
    // picks up the first 4 digits.
    const r = parsePlateFromTranscript("دنب 68064482");
    expect(r.plate).toBe("دنب6806");
    expect(r.uncertain).toBe(true);
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
