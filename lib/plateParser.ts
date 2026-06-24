/**
 * Saudi Plate Parser — PlateHunter KSA v3
 *
 * Pipeline:
 *   1. Remove diacritics (تشكيل)
 *   2. Strip vehicle type keyword
 *   3. Normalize ه → هـ
 *   4. Replace letter names  (حاء→ح, باء→ب …)
 *   5. Replace phonetic merges (حابه→ح ب …)
 *   6. Replace spoken numbers — multi-word first (ثلاثة عشر→13), then single (تلاتة→3)
 *   7. Normalize Arabic-Indic numerals (٨٢→82)
 *   8. Clean (keep Arabic + digits + spaces)
 *   9. Token scan: collect valid letters + digit strings independently
 *  10. Regex fallback (letters-then-digits or digits-then-letters block)
 *  11. Char-extraction fallback (first digit run + preceding Arabic chars)
 *  12. Notes = tokens not consumed by the plate
 */

// ─── English → Arabic plate letter mapping ────────────────────────────────
export const EN_TO_AR: Record<string, string> = {
  A: "ا", B: "ب", J: "ح", D: "د", R: "ر", S: "س", X: "ص", T: "ط",
  E: "ع", G: "ق", K: "ك", L: "ل", Z: "م", N: "ن", H: "هـ", U: "و", V: "ي",
};

export const VALID_AR_LETTERS = new Set([
  "ا","ب","ح","د","ر","س","ص","ط","ع","ق","ك","ل","م","ن","هـ","و","ي","ى",
]);

// ─── Vehicle types ─────────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  "ونيت", "فان", "دباب", "شاحنة", "باص", "مصدومة",
  "صالون", "بيكاب", "تاكسي", "كروزر", "باترول", "نقليات", "مفحوطة",
];

// ─── Letter names → character ──────────────────────────────────────────────
const LETTER_NAMES: [string, string][] = ([
  ["ألف",  "ا"], ["الف",  "ا"], ["آلف",  "ا"],
  ["باء",  "ب"], ["بَاء", "ب"], ["با",   "ب"],
  ["تاء",  "ت"], ["تَاء", "ت"],
  ["ثاء",  "ث"], ["ثَاء", "ث"],
  ["جيم",  "ج"], ["جِيم", "ج"],
  ["حاء",  "ح"], ["حَاء", "ح"], ["حا",   "ح"],
  ["خاء",  "خ"], ["خَاء", "خ"],
  ["دال",  "د"], ["دَال", "د"],
  ["ذال",  "ذ"], ["ذَال", "ذ"],
  ["راء",  "ر"], ["رَاء", "ر"], ["را",   "ر"],
  ["زاي",  "ز"], ["زَاي", "ز"],
  ["سين",  "س"], ["سِين", "س"],
  ["شين",  "ش"], ["شِين", "ش"],
  ["صاد",  "ص"], ["صَاد", "ص"], ["صادي", "ص"],
  ["ضاد",  "ض"], ["ضَاد", "ض"],
  ["طاء",  "ط"], ["طَاء", "ط"], ["طا",   "ط"],
  ["ظاء",  "ظ"], ["ظَاء", "ظ"],
  ["عين",  "ع"], ["عَين", "ع"],
  ["غين",  "غ"], ["غَين", "غ"],
  ["فاء",  "ف"], ["فَاء", "ف"],
  ["قاف",  "ق"], ["قَاف", "ق"], ["قافي", "ق"],
  ["ءاف",  "ق"], ["آف",   "ق"],
  ["كاف",  "ك"], ["كَاف", "ك"], ["كي",   "ك"],
  ["لام",  "ل"], ["لَام", "ل"],
  ["ميم",  "م"], ["مِيم", "م"],
  ["نون",  "ن"], ["نُون", "ن"],
  ["هاء",  "هـ"],["هَاء","هـ"],
  ["واو",  "و"], ["وَاو", "و"],
  ["ياء",  "ي"], ["يَاء", "ي"], ["يا",   "ي"],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

// ─── Phonetic merges ────────────────────────────────────────────────────────
const PHONETIC_MERGES: [string, string][] = ([
  ["حابه",  "ح ب"],
  ["احلام", "ا ح ل"],
  ["احلم",  "ا ح ل"],
  ["بالو",  "ب ل"],
  ["مالو",  "م ل"],
  ["دالو",  "د ل"],
  ["سارو",  "س ر"],
  ["كادو",  "ك د"],
  ["نالو",  "ن ل"],
  ["رامو",  "ر م"],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

// ─── Spoken numbers ─────────────────────────────────────────────────────────
// Multi-word entries (10-19) must come first so they're processed before
// their constituent single words (ثلاثة→3 must not eat "ثلاثة عشر" first).
// Sorted longest-first guarantees this automatically.
const SPOKEN_NUMBERS: [string, string][] = ([
  // ── 0-9 ──────────────────────────────────────────────────────────────────
  ["صفر",    "0"],
  ["واحد",   "1"], ["وحده",   "1"],
  ["اثنين",  "2"], ["اتنين",  "2"], ["اثنان",  "2"], ["تنين",   "2"],
  ["ثلاثة",  "3"], ["تلاتة",  "3"], ["تلاته",  "3"], ["ثلاث",   "3"],
  ["تلات",   "3"], ["تلته",   "3"],
  ["أربعة",  "4"], ["اربعة",  "4"], ["أربع",   "4"], ["اربع",   "4"],
  ["خمسة",   "5"], ["خمسه",   "5"], ["خمس",    "5"],
  ["ستة",    "6"], ["سته",    "6"], ["ست",     "6"],
  ["سبعة",   "7"], ["سبعه",   "7"], ["سبع",    "7"],
  ["ثمانية", "8"], ["تمانية", "8"], ["ثماني",  "8"], ["تماني",  "8"], ["تمان", "8"],
  ["تسعة",   "9"], ["تسعه",   "9"], ["تسع",    "9"],
  // ── 10-19 (two-word, must be LONGEST so they win over single words) ───────
  ["عشرة",           "10"], ["عشره",           "10"],
  ["أحد عشر",        "11"], ["احد عشر",        "11"], ["إحدى عشر",  "11"],
  ["حداشر",          "11"], ["حداعشر",         "11"],
  ["اثنا عشر",       "12"], ["اثني عشر",       "12"], ["اتنا عشر",  "12"],
  ["اتناشر",         "12"], ["اتنعشر",         "12"],
  ["ثلاثة عشر",      "13"], ["تلاتة عشر",      "13"],
  ["تلتاشر",         "13"],
  ["أربعة عشر",      "14"], ["اربعة عشر",      "14"],
  ["اربعتاشر",       "14"],
  ["خمسة عشر",       "15"], ["خمستاشر",        "15"], ["خمسطاشر",   "15"],
  ["ستة عشر",        "16"], ["ستاشر",          "16"], ["سطاشر",     "16"],
  ["سبعة عشر",       "17"], ["سبعتاشر",        "17"],
  ["ثمانية عشر",     "18"], ["تمانية عشر",     "18"], ["تمانتاشر",  "18"],
  ["تسعة عشر",       "19"], ["تسعتاشر",        "19"],
  // ── 20-90 ────────────────────────────────────────────────────────────────
  ["عشرون", "20"], ["عشرين", "20"],
  ["ثلاثون", "30"], ["ثلاثين", "30"], ["تلاتين", "30"],
  ["أربعون", "40"], ["أربعين", "40"], ["اربعون", "40"], ["اربعين", "40"],
  ["خمسون",  "50"], ["خمسين",  "50"],
  ["ستون",   "60"], ["ستين",   "60"],
  ["سبعون",  "70"], ["سبعين",  "70"],
  ["ثمانون", "80"], ["ثمانين", "80"], ["تمانين", "80"],
  ["تسعون",  "90"], ["تسعين",  "90"],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

const ARABIC_INDIC: Record<string, string> = {
  "٠":"0","١":"1","٢":"2","٣":"3","٤":"4",
  "٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function removeDiacritics(text: string): string {
  // Strip tashkeel: fatha, damma, kasra, sukun, shadda, tanwin variants, superscript alef
  return text.replace(/[ً-ٰٟ]/g, "");
}

function replaceAll(text: string, pairs: [string, string][]): string {
  let result = text;
  for (const [from, to] of pairs) {
    // Only match when not surrounded by Arabic chars (prevents "با" eating "دبا")
    result = result.replace(
      new RegExp(`(?<![\\u0600-\\u06FF])${from}(?![\\u0600-\\u06FF])`, "g"),
      ` ${to} `
    );
  }
  return result.replace(/\s+/g, " ").trim();
}

function normalizeNumerals(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => ARABIC_INDIC[d] ?? d);
}

// Returns true if every character in the token is a valid Saudi plate letter.
// Handles "هـ" (two chars) and standalone "ه" (which SR may return without tatweel).
function isAllPlateLetters(tok: string): boolean {
  let i = 0;
  while (i < tok.length) {
    if (tok[i] === "ه" && tok[i + 1] === "ـ") { i += 2; continue; }
    if (tok[i] === "ه") { i++; continue; }
    if (VALID_AR_LETTERS.has(tok[i])) { i++; continue; }
    return false;
  }
  return i > 0;
}

// Extract valid plate letters from a single token, treating "هـ" as one unit.
function extractLettersFromToken(token: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < token.length) {
    // "هـ" is U+0647 + U+0640 — treat as one letter
    if (token[i] === "ه" && token[i + 1] === "ـ") {
      result.push("هـ");
      i += 2;
    } else if (VALID_AR_LETTERS.has(token[i])) {
      result.push(token[i]);
      i++;
    } else {
      i++;
    }
  }
  return result;
}

// ─── Exported public helpers ────────────────────────────────────────────────

export function bankPlateToArabic(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/\s+/g, "");
  return cleaned.split("").map((ch) => EN_TO_AR[ch] ?? ch).join("");
}

export function normalizePlate(plate: string): string {
  return plate.replace(/\s/g, "").replace(/أ|إ/g, "ا").replace(/ى/g, "ي").trim().toLowerCase();
}

export function findDuplicates(plates: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of plates) {
    const n = normalizePlate(p);
    if (!n) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const dups = new Set<string>();
  for (const [norm, count] of counts) {
    if (count > 1) dups.add(norm);
  }
  return dups;
}

// ─── ParseResult ───────────────────────────────────────────────────────────

export interface ParseResult {
  plate: string;
  vehicleType?: string;
  notes: string;
  normalized: string;
}

// ─── Main parser ───────────────────────────────────────────────────────────

export function parsePlateFromTranscript(transcript: string): ParseResult {
  let text = transcript.trim();

  // 1. Remove diacritics
  text = removeDiacritics(text);

  // 2. Detect and strip vehicle type
  let vehicleType: string | undefined;
  for (const vt of VEHICLE_TYPES) {
    if (text.includes(vt)) {
      vehicleType = vt;
      text = text.replace(vt, " ").trim();
      break;
    }
  }

  // 3. Normalize standalone ه → هـ (SR often omits the tatweel)
  text = text.replace(/ه(?!ـ)/g, "هـ");

  // 3b. Normalize ى (alef maqsura) → ي — both are valid plate letters, treated as equivalent
  text = text.replace(/ى/g, "ي");

  // 4. Replace letter names
  text = replaceAll(text, LETTER_NAMES);

  // 5. Replace phonetic merges
  text = replaceAll(text, PHONETIC_MERGES);

  // 6. Replace spoken numbers (multi-word 10-90 sorted first, then 0-9)
  text = replaceAll(text, SPOKEN_NUMBERS);

  // 7. Normalize Arabic-Indic numerals
  text = normalizeNumerals(text);

  // 8. Clean: keep Arabic Unicode block + digits + spaces
  text = text.replace(/[^؀-ۿ0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const normalized = text;

  // ── 9. Token scan (proximity-based extraction) ───────────────────────────
  //  Find digit tokens first, then scan BACKWARD from the first digit to
  //  collect plate letters. This way observations before OR after the plate
  //  always end up in notes regardless of order.
  const tokens = normalized.split(/\s+/).filter(Boolean);

  const digitTokenIndices: number[] = [];
  const digitTokenValues: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d+$/.test(tokens[i]) && tokens[i].length <= 4) {
      digitTokenIndices.push(i);
      digitTokenValues.push(tokens[i]);
    }
  }

  const usedIdx = new Set<number>(digitTokenIndices);
  const letterBuf: string[] = [];

  let plate = "";
  let notes = "";

  if (digitTokenIndices.length > 0) {
    const firstDigitIdx = digitTokenIndices[0];

    // Scan BACKWARD from the first digit token — letters adjacent to digits win
    for (let i = firstDigitIdx - 1; i >= 0 && letterBuf.length < 3; i--) {
      const tok = tokens[i];
      if (tok.length <= 2 || (tok.length <= 4 && isAllPlateLetters(tok))) {
        const letters = extractLettersFromToken(tok);
        if (letters.length > 0) {
          // unshift preserves left-to-right order when prepending
          letterBuf.unshift(...letters.slice(0, 3 - letterBuf.length));
          usedIdx.add(i);
        }
      }
    }

    // If still short, scan FORWARD from the last digit token (letters after digits)
    if (letterBuf.length < 3) {
      const lastDigitIdx = digitTokenIndices[digitTokenIndices.length - 1];
      for (let i = lastDigitIdx + 1; i < tokens.length && letterBuf.length < 3; i++) {
        const tok = tokens[i];
        if (tok.length <= 2 || (tok.length <= 4 && isAllPlateLetters(tok))) {
          const letters = extractLettersFromToken(tok);
          if (letters.length > 0) {
            letterBuf.push(...letters.slice(0, 3 - letterBuf.length));
            usedIdx.add(i);
          }
        }
      }
    }

    // Combine digit tokens:
    // – all single digits (0-9) → concatenate  e.g. 5 9 3 2 → "5932"
    // – any token ≥ 10        → additive Arabic compound  e.g. 5 + 20 → "25"
    const digitNums = digitTokenValues.map(Number);
    const digits = digitNums.some((v) => v >= 10)
      ? String(digitNums.reduce((a, b) => a + b, 0)).slice(0, 4)
      : digitTokenValues.join("").slice(0, 4);

    plate = letterBuf.join("") + digits;
    notes = tokens.filter((_, i) => !usedIdx.has(i)).join(" ");
  }

  // ── 10. Regex fallback: letters-digits or digits-letters as a block ───────
  if (!plate) {
    const AR = "[\\u0600-\\u06FF]";
    const lettersGroup = `(${AR}(?:\\s*${AR}){0,2})`;
    const digitsGroup  = `(\\d(?:\\s*\\d){0,3})`;

    const mA = text.match(new RegExp(`${lettersGroup}\\s*${digitsGroup}`));
    if (mA) {
      const l = mA[1].replace(/\s/g, "");
      const d = mA[2].replace(/\s/g, "");
      if (d.length >= 1 && d.length <= 4) {
        plate = `${l}${d}`;
        notes = normalized.replace(mA[0], " ").replace(/\s+/g, " ").trim();
      }
    }

    if (!plate) {
      const mB = text.match(new RegExp(`${digitsGroup}\\s*${lettersGroup}`));
      if (mB) {
        const d = mB[1].replace(/\s/g, "");
        const l = mB[2].replace(/\s/g, "");
        if (d.length >= 1 && d.length <= 4) {
          plate = `${l}${d}`;
          notes = normalized.replace(mB[0], " ").replace(/\s+/g, " ").trim();
        }
      }
    }
  }

  // ── 11. Char-extraction fallback ─────────────────────────────────────────
  if (!plate) {
    const dMatch = text.match(/\d{1,4}/);
    if (dMatch) {
      const d = dMatch[0];
      const before = text.slice(0, dMatch.index!);
      const arChars = before.match(/[؀-ۿ]/g) ?? [];
      if (arChars.length >= 1) {
        const l = arChars.slice(0, 3).join("");
        plate = `${l}${d}`;
        notes = normalized
          .replace(new RegExp(`[\\u0600-\\u06FF\\s]*${d}`), " ")
          .replace(/\s+/g, " ")
          .trim();
      } else {
        // Digits found but no letters — save partial plate (digits only)
        plate = d;
        notes = normalized.replace(d, " ").replace(/\s+/g, " ").trim();
      }
    }
  }

  return { plate, vehicleType, notes, normalized };
}

// ─── Fuzzy matching helpers ────────────────────────────────────────────────

export function detectPlateColumn(headers: string[]): string | null {
  const keywords = ["لوحة", "اللوحة", "plate", "رقم"];
  const found = headers.find((h) =>
    keywords.some((k) => h.toLowerCase().includes(k.toLowerCase()))
  );
  return found ?? headers[0] ?? null;
}

export interface MatchResult {
  referralRow: Record<string, string>;
  dataRow?: Record<string, string>;
  status: "exact" | "fuzzy" | "none";
  similarity?: number;
}

// Two-row Levenshtein: O(n) space instead of O(nm), no per-call allocation
let _levPrev: number[] = [];
let _levCurr: number[] = [];

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (_levPrev.length < n + 1) { _levPrev = new Array(n + 1); _levCurr = new Array(n + 1); }
  for (let j = 0; j <= n; j++) _levPrev[j] = j;
  for (let i = 1; i <= m; i++) {
    _levCurr[0] = i;
    for (let j = 1; j <= n; j++) {
      _levCurr[j] = a[i - 1] === b[j - 1]
        ? _levPrev[j - 1]
        : 1 + Math.min(_levPrev[j], _levCurr[j - 1], _levPrev[j - 1]);
    }
    const tmp = _levPrev; _levPrev = _levCurr; _levCurr = tmp;
  }
  return _levPrev[n];
}

export function similarityPercent(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length, 1);
  return Math.round((1 - dist / maxLen) * 100);
}

// Pre-built index for referral file — call once, reuse across chunks.
export interface ReferralIndex {
  exact: Map<string, Record<string, string>>;
  byFirstChar: Map<string, Array<{ norm: string; row: Record<string, string> }>>;
}

export function buildReferralIndex(
  referralRows: Record<string, string>[],
  referralPlateCol: string,
): ReferralIndex {
  const exact = new Map<string, Record<string, string>>();
  const byFirstChar = new Map<string, Array<{ norm: string; row: Record<string, string> }>>();
  for (const row of referralRows) {
    const norm = normalizePlate(bankPlateToArabic(String(row[referralPlateCol] ?? "")));
    if (!norm) continue;
    exact.set(norm, row);
    const key = norm[0];
    if (!byFirstChar.has(key)) byFirstChar.set(key, []);
    byFirstChar.get(key)!.push({ norm, row });
  }
  return { exact, byFirstChar };
}

// Match a single chunk of data rows against a pre-built referral index.
export function matchChunkAgainstIndex(
  dataChunk: Record<string, string>[],
  dataPlateCol: string,
  index: ReferralIndex,
  fuzzyThreshold = 88,
): MatchResult[] {
  const results: MatchResult[] = [];
  for (const dataRow of dataChunk) {
    const norm = normalizePlate(bankPlateToArabic(String(dataRow[dataPlateCol] ?? "")));
    if (!norm) continue;
    const exact = index.exact.get(norm);
    if (exact) { results.push({ referralRow: exact, dataRow, status: "exact" }); continue; }
    if (index.exact.size <= 50_000) {
      let best: { row: Record<string, string>; sim: number } | null = null;
      // First-char bucketing: at >=88% on 7-char plates, first-char edits score 85.7% < threshold
      const candidates = index.byFirstChar.get(norm[0]) ?? [];
      for (const { norm: refNorm, row } of candidates) {
        if (Math.abs(refNorm.length - norm.length) > 1) continue;
        const sim = similarityPercent(norm, refNorm);
        if (sim >= fuzzyThreshold && (!best || sim > best.sim)) best = { row, sim };
      }
      if (best) results.push({ referralRow: best.row, dataRow, status: "fuzzy", similarity: best.sim });
    }
  }
  return results;
}

// Convenience wrapper (used by tests + paste path).
export function matchDataAgainstReferral(
  dataRows: Record<string, string>[],
  dataPlateCol: string,
  referralRows: Record<string, string>[],
  referralPlateCol: string,
  fuzzyThreshold = 88,
): MatchResult[] {
  const index = buildReferralIndex(referralRows, referralPlateCol);
  return matchChunkAgainstIndex(dataRows, dataPlateCol, index, fuzzyThreshold);
}

export function matchReferralAgainstData(
  referralRows: Record<string, string>[],
  referralPlateCol: string,
  dataRows: Record<string, string>[],
  dataPlateCol: string,
  fuzzyThreshold = 88,
): MatchResult[] {
  const dataNormMap = new Map<string, Record<string, string>>();
  for (const row of dataRows) {
    const raw  = String(row[dataPlateCol] ?? "");
    const norm = normalizePlate(bankPlateToArabic(raw));
    if (norm) dataNormMap.set(norm, row);
  }

  return referralRows.map((refRow) => {
    const raw       = String(refRow[referralPlateCol] ?? "");
    const converted = bankPlateToArabic(raw);
    const norm      = normalizePlate(converted);
    if (!norm) return { referralRow: refRow, status: "none" as const };

    const exact = dataNormMap.get(norm);
    if (exact) return { referralRow: refRow, dataRow: exact, status: "exact" as const };

    if (dataNormMap.size > 50_000) {
      return { referralRow: refRow, status: "none" as const };
    }

    let best: { row: Record<string, string>; sim: number } | null = null;
    for (const [dataNorm, row] of dataNormMap) {
      if (Math.abs(dataNorm.length - norm.length) > 1) continue;
      const sim = similarityPercent(norm, dataNorm);
      if (sim >= fuzzyThreshold && (!best || sim > best.sim)) best = { row, sim };
    }

    if (best) {
      return { referralRow: refRow, dataRow: best.row, status: "fuzzy" as const, similarity: best.sim };
    }
    return { referralRow: refRow, status: "none" as const };
  });
}
