/**
 * Saudi Plate Parser for PlateHunter KSA.
 *
 * Handles:
 * 1. Converting Whisper transcript → clean joined plate string (e.g. أبح1234)
 * 2. English→Arabic bank-list letter mapping (for Phase 4 sorting)
 * 3. Vehicle type detection (ونيت، فان، دباب، مصدومة)
 * 4. Arabic-Indic numerals → Western numerals
 */

// ─── English → Arabic plate letter mapping (from spec) ────────────────────────
export const EN_TO_AR: Record<string, string> = {
  A: "ا",
  B: "ب",
  J: "ح",
  D: "د",
  R: "ر",
  S: "س",
  X: "ص",
  T: "ط",
  E: "ع",
  G: "ق",
  K: "ك",
  L: "ل",
  Z: "م",
  N: "ن",
  H: "هـ",
  U: "و",
  V: "ي",
};

// Valid Arabic plate letters (per spec)
export const VALID_AR_LETTERS = new Set([
  "ا","ب","ح","د","ر","س","ص","ط","ع","ق","ك","ل","م","ن","هـ","و","ي",
]);

// Vehicle types the agent may mention
const VEHICLE_TYPES = ["ونيت", "فان", "دباب", "مصدومة"];

// Spoken Arabic numbers → Western digits
const SPOKEN_NUMBERS: Record<string, string> = {
  صفر: "0",
  واحد: "1",
  اثنين: "2",
  اتنين: "2",
  اثنان: "2",
  ثلاثة: "3",
  تلاتة: "3",
  ثلاث: "3",
  أربعة: "4",
  اربعة: "4",
  أربع: "4",
  خمسة: "5",
  خمس: "5",
  ستة: "6",
  ست: "6",
  سبعة: "7",
  سبع: "7",
  ثمانية: "8",
  تمانية: "8",
  تسعة: "9",
  تسع: "9",
};

// Arabic-Indic numerals → Western
const ARABIC_INDIC: Record<string, string> = {
  "٠": "0","١": "1","٢": "2","٣": "3","٤": "4",
  "٥": "5","٦": "6","٧": "7","٨": "8","٩": "9",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeNumerals(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => ARABIC_INDIC[d] ?? d);
}

function replaceSpokenNumbers(text: string): string {
  let result = text;
  for (const [spoken, digit] of Object.entries(SPOKEN_NUMBERS)) {
    result = result.replace(new RegExp(spoken, "g"), digit);
  }
  return result;
}

/**
 * Convert a bank-list plate string (English letters + digits) to the
 * Arabic joined format used in field recordings.
 * e.g. "ABJ 1234" → "ابح1234"
 */
export function bankPlateToArabic(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/\s+/g, "");
  return cleaned
    .split("")
    .map((ch) => EN_TO_AR[ch] ?? ch)
    .join("");
}

/**
 * Post-process a Whisper transcript to extract:
 * - plate: joined Arabic plate string (3 letters + 4 digits)
 * - vehicleType: only if agent explicitly mentioned a vehicle type
 */
export function parsePlateFromTranscript(transcript: string): {
  plate: string;
  vehicleType?: string;
} {
  let text = transcript.trim();

  // Detect vehicle type first, then strip it from text
  let vehicleType: string | undefined;
  for (const vt of VEHICLE_TYPES) {
    if (text.includes(vt)) {
      vehicleType = vt;
      text = text.replace(vt, "").trim();
      break;
    }
  }

  // Normalize
  text = normalizeNumerals(text);
  text = replaceSpokenNumbers(text);

  // Remove everything except valid plate letters, digits, and spaces
  // Valid letters already cover ا-ي range but we be explicit
  const validChars = new RegExp(
    `[^اأإبتثجحخدذرزسشصضطظعغفقكلمنهوي٠-٩0-9\\s]`,
    "g"
  );
  text = text.replace(validChars, "").replace(/\s+/g, " ").trim();

  // Try to extract pattern: 3 Arabic letters + 4 digits (with optional spaces)
  const platePattern =
    /([اأإبتثجحخدذرزسشصضطظعغفقكلمنهوي]{1,3})\s*(\d{1,4})/;
  const match = text.match(platePattern);

  if (match) {
    const letters = match[1].replace(/\s/g, "");
    const digits = match[2].replace(/\s/g, "");
    const plate = `${letters}${digits}`;
    return { plate, vehicleType };
  }

  // Fallback: just strip spaces from whatever text we have
  const plate = text.replace(/\s/g, "");
  return { plate: plate || transcript.trim(), vehicleType };
}

/**
 * Normalize a plate string for comparison (strip spaces, normalize letters).
 * Used when checking duplicates.
 */
export function normalizePlate(plate: string): string {
  return plate
    .replace(/\s/g, "")
    .replace(/أ|إ/g, "ا") // normalize alef variants
    .trim()
    .toLowerCase();
}

/**
 * Find duplicate plates in a list of plates.
 * Returns a Set of normalized plates that appear more than once.
 */
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

// ─── Fuzzy matching (Phase 5) ──────────────────────────────────────────────

/** Classic Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Similarity percentage (0-100) based on edit distance relative to the longer string. */
export function similarityPercent(a: string, b: string): number {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length, 1);
  return Math.round((1 - dist / maxLen) * 100);
}

/** Guess which column in an uploaded Excel sheet holds the plate number. */
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

/**
 * Matches each row of a "referral" (bank) table against a "data" (field
 * recordings) table by plate number. Tries an exact match first; if none
 * is found, falls back to fuzzy matching (Levenshtein-based) above the
 * given threshold — catching small spelling/hearing mistakes like ح vs خ.
 *
 * Fuzzy comparison only runs for rows that failed the exact match, which
 * keeps this fast even on large datasets (the expensive O(n×m) fuzzy pass
 * only ever touches the leftover, usually-small subset).
 */
export function matchReferralAgainstData(
  referralRows: Record<string, string>[],
  referralPlateCol: string,
  dataRows: Record<string, string>[],
  dataPlateCol: string,
  fuzzyThreshold = 88
): MatchResult[] {
  const dataNormMap = new Map<string, Record<string, string>>();
  for (const row of dataRows) {
    const raw = String(row[dataPlateCol] ?? "");
    const norm = normalizePlate(bankPlateToArabic(raw));
    if (norm) dataNormMap.set(norm, row);
  }

  return referralRows.map((refRow) => {
    const raw = String(refRow[referralPlateCol] ?? "");
    const converted = bankPlateToArabic(raw);
    const norm = normalizePlate(converted);

    if (!norm) return { referralRow: refRow, status: "none" as const };

    const exact = dataNormMap.get(norm);
    if (exact) {
      return { referralRow: refRow, dataRow: exact, status: "exact" as const };
    }

    let best: { row: Record<string, string>; sim: number } | null = null;
    for (const [dataNorm, row] of dataNormMap) {
      // Cheap pre-filter before the more expensive edit-distance calculation
      if (Math.abs(dataNorm.length - norm.length) > 1) continue;
      const sim = similarityPercent(norm, dataNorm);
      if (sim >= fuzzyThreshold && (!best || sim > best.sim)) {
        best = { row, sim };
      }
    }

    if (best) {
      return {
        referralRow: refRow,
        dataRow: best.row,
        status: "fuzzy" as const,
        similarity: best.sim,
      };
    }

    return { referralRow: refRow, status: "none" as const };
  });
}
