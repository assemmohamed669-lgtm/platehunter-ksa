/**
 * Saudi Plate Parser — PlateHunter KSA v2
 *
 * Pipeline:
 *   1. Strip vehicle type
 *   2. Replace letter names  (حاء→ح, باء→ب, لام→ل …)
 *   3. Replace phonetic merges (حابه→ح ب, احلام→ا ح ل …)
 *   4. Normalize numerals  (٨٢→82, تلاتة→3 …)
 *   5. Clean text (keep Arabic + digits + spaces)
 *   6. Regex: 1-3 Arabic letters + 1-4 digits (or reversed)
 *   7. Character-extraction fallback if regex fails
 *   8. Notes = normalized text minus the plate portion
 */

// ─── English → Arabic plate letter mapping ────────────────────────────────
export const EN_TO_AR: Record<string, string> = {
  A: "ا", B: "ب", J: "ح", D: "د", R: "ر", S: "س", X: "ص", T: "ط",
  E: "ع", G: "ق", K: "ك", L: "ل", Z: "م", N: "ن", H: "هـ", U: "و", V: "ي",
};

export const VALID_AR_LETTERS = new Set([
  "ا","ب","ح","د","ر","س","ص","ط","ع","ق","ك","ل","م","ن","هـ","و","ي",
]);

// Vehicle types the agent may mention
const VEHICLE_TYPES = ["ونيت", "فان", "دباب", "شاحنة", "باص", "مصدومة"];

// ─── Letter names → character ──────────────────────────────────────────────
// Sorted longest-first so "باء" matches before "با"
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
// SR merges multiple spelled-out letters into a single word.
// e.g., "حاء باء" said quickly → SR returns "حابه"
// Only non-common-Arabic-word forms are added here to avoid false positives.
// Sorted longest-first.
const PHONETIC_MERGES: [string, string][] = ([
  ["حابه",  "ح ب"],   // حاء + باء (merged suffix "ه")
  ["احلام", "ا ح ل"], // ا + ح + ل sounds like "احلام" (dreams) in SR
  ["احلم",  "ا ح ل"],
  ["بالو",  "ب ل"],   // باء + لام + و (suffix noise)
  ["مالو",  "م ل"],   // ميم + لام
  ["دالو",  "د ل"],   // دال + لام
  ["سارو",  "س ر"],   // سين + راء
  ["كادو",  "ك د"],   // كاف + دال
  ["نالو",  "ن ل"],   // نون + لام
  ["رامو",  "ر م"],   // راء + ميم
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

// ─── Spoken numbers ────────────────────────────────────────────────────────
// Sorted longest-first to prevent partial matches (e.g. "تلاتة" before "تلات")
const SPOKEN_NUMBERS: [string, string][] = ([
  ["صفر",    "0"],
  ["واحد",   "1"], ["وحده",   "1"],
  ["اثنين",  "2"], ["اتنين",  "2"], ["اثنان",  "2"], ["تنين",   "2"],
  ["ثلاثة",  "3"], ["تلاتة",  "3"], ["تلاته",  "3"], ["ثلاث",   "3"], ["تلات",   "3"], ["تلته",   "3"],
  ["أربعة",  "4"], ["اربعة",  "4"], ["أربع",   "4"], ["اربع",   "4"],
  ["خمسة",   "5"], ["خمسه",   "5"], ["خمس",    "5"],
  ["ستة",    "6"], ["سته",    "6"], ["ست",     "6"],
  ["سبعة",   "7"], ["سبعه",   "7"], ["سبع",    "7"],
  ["ثمانية", "8"], ["تمانية", "8"], ["ثماني",  "8"], ["تماني",  "8"], ["تمان",   "8"],
  ["تسعة",   "9"], ["تسعه",   "9"], ["تسع",    "9"],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

const ARABIC_INDIC: Record<string, string> = {
  "٠":"0","١":"1","٢":"2","٣":"3","٤":"4",
  "٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function replaceAll(text: string, pairs: [string, string][]): string {
  let result = text;
  for (const [from, to] of pairs) {
    result = result.replace(new RegExp(from, "g"), ` ${to} `);
  }
  return result.replace(/\s+/g, " ").trim();
}

function normalizeNumerals(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => ARABIC_INDIC[d] ?? d);
}

// ─── Exported public helpers (unchanged API) ───────────────────────────────

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

  // 1. Detect vehicle type and remove from text
  let vehicleType: string | undefined;
  for (const vt of VEHICLE_TYPES) {
    if (text.includes(vt)) {
      vehicleType = vt;
      text = text.replace(vt, " ").trim();
      break;
    }
  }

  // 2. Replace letter names (حاء→ح, باء→ب, لام→ل …)
  text = replaceAll(text, LETTER_NAMES);

  // 3. Replace phonetic merges (حابه→ح ب, احلام→ا ح ل …)
  text = replaceAll(text, PHONETIC_MERGES);

  // 4. Normalize numerals (٨٢→82) and spoken numbers (تلاتة→3)
  text = normalizeNumerals(text);
  text = replaceAll(text, SPOKEN_NUMBERS);

  // 5. Clean: keep Arabic Unicode + digits + spaces
  text = text.replace(/[^؀-ۿ0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const normalized = text; // snapshot for debug

  // 6. Regex extraction — allows any spacing between letters
  const AR = "[\\u0600-\\u06FF]";
  const lettersGroup = `(${AR}(?:\\s*${AR}){0,2})`;
  const digitsGroup  = `(\\d(?:\\s*\\d){0,3})`;

  let plate = "";
  let notes = normalized;

  // Pattern A: letters then digits
  const mA = text.match(new RegExp(`${lettersGroup}\\s*${digitsGroup}`));
  if (mA) {
    const letters = mA[1].replace(/\s/g, "");
    const digits  = mA[2].replace(/\s/g, "");
    if (digits.length >= 1 && digits.length <= 4) {
      plate = `${letters}${digits}`;
      notes = normalized.replace(mA[0], " ").replace(/\s+/g, " ").trim();
    }
  }

  // Pattern B: digits then letters (some speakers say it reversed)
  if (!plate) {
    const mB = text.match(new RegExp(`${digitsGroup}\\s*${lettersGroup}`));
    if (mB) {
      const digits  = mB[1].replace(/\s/g, "");
      const letters = mB[2].replace(/\s/g, "");
      if (digits.length >= 1 && digits.length <= 4) {
        plate = `${letters}${digits}`;
        notes = normalized.replace(mB[0], " ").replace(/\s+/g, " ").trim();
      }
    }
  }

  // 7. Character-extraction fallback: when regex fails (word not in any dict)
  //    Find the first 1-4 digit sequence, then take Arabic chars immediately before it.
  if (!plate) {
    const dMatch = text.match(/\d{1,4}/);
    if (dMatch) {
      const digits   = dMatch[0];
      const before   = text.slice(0, dMatch.index!);
      const arChars  = before.match(/[؀-ۿ]/g) ?? [];
      if (arChars.length >= 1) {
        // Take up to 3 chars (first = leftmost = least distorted by SR)
        const letters = arChars.slice(0, 3).join("");
        plate = `${letters}${digits}`;
        notes = normalized
          .replace(new RegExp(`[\\u0600-\\u06FF\\s]*${digits}`), " ")
          .replace(/\s+/g, " ")
          .trim();
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
