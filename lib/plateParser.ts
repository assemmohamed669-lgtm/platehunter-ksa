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
  "ا","ب","ح","د","ر","س","ص","ط","ع","ق","ك","ل","م","ن","هـ","و","ي",
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
  ["راء",  "ر"], ["رَاء", "ر"],
  ["زاي",  "ز"], ["زَاي", "ز"],
  ["سين",  "س"], ["سِين", "س"],
  ["شين",  "ش"], ["شِين", "ش"],
  ["صاد",  "ص"], ["صَاد", "ص"], ["صادي", "ص"],
  ["ضاد",  "ض"], ["ضَاد", "ض"],
  ["طاء",  "ط"], ["طَاء", "ط"],
  ["ظاء",  "ظ"], ["ظَاء", "ظ"],
  ["عين",  "ع"], ["عَين", "ع"],
  ["غين",  "غ"], ["غَين", "غ"],
  ["فاء",  "ف"], ["فَاء", "ف"],
  ["قاف",  "ق"], ["قَاف", "ق"], ["قافي", "ق"],
  ["كاف",  "ك"], ["كَاف", "ك"],
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
  ["اثنا عشر",       "12"], ["اثني عشر",       "12"], ["اتنا عشر",  "12"],
  ["ثلاثة عشر",      "13"], ["تلاتة عشر",      "13"],
  ["أربعة عشر",      "14"], ["اربعة عشر",      "14"],
  ["خمسة عشر",       "15"], ["خمستاشر",        "15"], ["خمسطاشر",   "15"],
  ["ستة عشر",        "16"], ["ستاشر",          "16"], ["سطاشر",     "16"],
  ["سبعة عشر",       "17"], ["سبعتاشر",        "17"],
  ["ثمانية عشر",     "18"], ["تمانية عشر",     "18"], ["تمانتاشر",  "18"],
  ["تسعة عشر",       "19"], ["تسعتاشر",        "19"],
  // ── 20-90 ────────────────────────────────────────────────────────────────
  ["عشرون", "20"], ["عشرين", "20"],
  ["ثلاثون", "30"], ["ثلاثين", "30"],
  ["أربعون", "40"], ["أربعين", "40"],
  ["خمسون",  "50"], ["خمسين",  "50"],
  ["ستون",   "60"], ["ستين",   "60"],
  ["سبعون",  "70"], ["سبعين",  "70"],
  ["ثمانون", "80"], ["ثمانين", "80"],
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
  return plate.replace(/\s/g, "").replace(/أ|إ/g, "ا").trim().toLowerCase();
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

  // ── 9. Token scan (primary extraction) ───────────────────────────────────
  //  Each token is independently classified as letter(s), digits, or noise.
  //  This handles noise between letters and digits, and scattered digit tokens.
  const tokens = normalized.split(/\s+/).filter(Boolean);

  const letterBuf: string[] = [];   // valid plate letters, up to 3
  const digitTokens: string[] = []; // digit strings to concatenate
  const usedIdx = new Set<number>();

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (/^\d+$/.test(tok) && tok.length <= 4) {
      digitTokens.push(tok);
      usedIdx.add(i);
    } else if (letterBuf.length < 3 && tok.length <= 2) {
      // Only accept short tokens (1-char letter or 2-char "هـ") — rejects noise words
      const letters = extractLettersFromToken(tok);
      if (letters.length > 0) {
        letterBuf.push(...letters.slice(0, 3 - letterBuf.length));
        usedIdx.add(i);
      }
    }
  }

  // Combine digit tokens:
  // – all single digits (0-9) → concatenate  e.g. 5 9 3 2 → "5932"
  // – any token ≥ 10        → additive Arabic compound  e.g. 5 + 20 → "25"
  const digitNums = digitTokens.map(Number);
  const digits = digitNums.some((v) => v >= 10)
    ? String(digitNums.reduce((a, b) => a + b, 0)).slice(0, 4)
    : digitTokens.join("").slice(0, 4);
  const letters = letterBuf.join("");

  let plate = "";
  let notes = "";

  if (digits) {
    plate = letters + digits;
    // Notes = tokens not used for the plate
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

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

export function similarityPercent(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length, 1);
  return Math.round((1 - dist / maxLen) * 100);
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
