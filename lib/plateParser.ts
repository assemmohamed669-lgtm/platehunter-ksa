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

// ─── Egyptian dialect → Saudi plate letter/digit mapping ─────────────────
// المأمور يقول كل حرف كلمة لوحدها: "دال حه ره واحد اتنين تلاتة أربعة"
export const EGYPTIAN_LETTERS: Record<string, string> = {
  // حروف اللوحات — النطق المصري القصير
  "الف": "ا", "ألف": "ا", "الالف": "ا", "الألف": "ا",
  "به":  "ب",
  "حه":  "ح",
  "دال": "د",
  "ره":  "ر",
  "سين": "س",
  "طه":  "ط",
  "عين": "ع",
  "قاف": "ق",
  "كاف": "ك",
  "لام": "ل",
  "ميم": "م",
  "نون": "ن",
  "هه":  "ه",
  "واو": "و",
  "يه":  "ي",
  // حروف اللوحات — النطق الخليجي/الفصيح
  "اليف": "ا",
  "باء":  "ب",
  "حاء":  "ح", "حا": "ح",
  "راء":  "ر",
  "طاء":  "ط", "طا": "ط",
  "هاء":  "ه", "ها": "ه",
  "ياء":  "ي", "يا": "ي",
  // أرقام 0-9 — النطق المصري
  "صفر":    "0",
  "واحد":   "1",
  "اتنين":  "2", "اثنين":  "2",
  "تلاتة":  "3", "ثلاثة":  "3",
  "اربعة":  "4", "أربعة":  "4",
  "خمسة":   "5",
  "ستة":    "6",
  "سبعة":   "7",
  "تمانية": "8", "ثمانية": "8",
  "تسعة":   "9",
};

/**
 * يحول كلام المأمور المصري (حرف حرف) إلى رقم لوحة.
 * "دال حه ره واحد اتنين تلاتة أربعة" → "دحر1234"
 * كل كلمة تُترجم مستقلة — لا regex، لا حدود كلمات.
 */
export function mapEgyptianSpeech(transcript: string): string {
  return transcript
    .trim()
    .split(/\s+/)
    .map((w) => {
      const clean = w.replace(/[ؐ-ًؚ-ٟ]/g, "");
      return EGYPTIAN_LETTERS[clean] ?? clean;
    })
    .join("");
}

export interface MultiPlateResult {
  plate: string;
  vehicleType?: string;
  notes: string;
  normalized: string;
}

/**
 * يستخرج عدة لوحات من تسجيل صوتي واحد.
 * الترتيب المتوقع: [ملاحظات] [حروف اللوحة] [أرقام اللوحة] [نوع السيارة] [تكرار]
 * كل لوحة = 1-3 حروف سعودية + 4 أرقام.
 */
export function extractMultiplePlates(transcript: string): MultiPlateResult[] {
  type Kind = "letter" | "digit" | "vehicle" | "other";
  interface Tok { value: string; kind: Kind }

  // ── Step 1: tokenise + classify ──────────────────────────────────────────
  const flat: Tok[] = [];
  for (const raw of transcript.trim().split(/\s+/).filter(Boolean)) {
    const clean = raw.replace(/[ؐ-ًؚ-ٟ]/g, "").replace(/ـ/g, ""); // strip diacritics + tatweel
    const mapped = EGYPTIAN_LETTERS[clean] ?? clean;

    // Single valid Saudi plate letter after Egyptian mapping
    if (mapped.length === 1 && VALID_AR_LETTERS.has(mapped)) {
      flat.push({ value: mapped, kind: "letter" }); continue;
    }
    // Single mapped digit ("واحد"→"1")
    if (/^\d$/.test(mapped)) {
      flat.push({ value: mapped, kind: "digit" }); continue;
    }
    // SR returned digit string "1234" directly → split into individual digits
    if (/^\d{1,4}$/.test(clean)) {
      for (const d of clean) flat.push({ value: d, kind: "digit" }); continue;
    }
    // 1-3 Arabic chars that are all valid plate letters (e.g. "دحر" said as one word)
    if (/^[؀-ۿ]{1,3}$/.test(clean) && [...clean].every(c => VALID_AR_LETTERS.has(c))) {
      for (const c of clean) flat.push({ value: c, kind: "letter" }); continue;
    }
    // Vehicle type keyword
    const vt = VEHICLE_TYPES.find((v) => raw.includes(v));
    if (vt) { flat.push({ value: vt, kind: "vehicle" }); continue; }
    // Everything else: note word
    flat.push({ value: raw, kind: "other" });
  }

  // ── Step 2: state machine ────────────────────────────────────────────────
  const results: MultiPlateResult[] = [];
  let noteBuf: string[] = [];
  let letterBuf: string[] = [];
  let digitBuf: string[] = [];
  let vtBuf = "";

  function commit() {
    if (letterBuf.length === 0 || digitBuf.length === 0) {
      noteBuf.push(...letterBuf); letterBuf = []; digitBuf = []; vtBuf = ""; return;
    }
    const plate = letterBuf.join("") + digitBuf.join("").slice(0, 4).padStart(4, "0");
    results.push({
      plate,
      vehicleType: vtBuf || undefined,
      notes: noteBuf.join(" "),
      normalized: normalizePlate(plate),
    });
    noteBuf = []; letterBuf = []; digitBuf = []; vtBuf = "";
  }

  type State = "pre" | "letters" | "digits" | "post";
  let state: State = "pre";

  for (let i = 0; i < flat.length; i++) {
    const t = flat[i];
    if (state === "pre") {
      if (t.kind === "letter") { letterBuf.push(t.value); state = "letters"; }
      else                     { noteBuf.push(t.value); }
    } else if (state === "letters") {
      if      (t.kind === "letter" && letterBuf.length < 3) { letterBuf.push(t.value); }
      else if (t.kind === "digit")                          { digitBuf.push(t.value); state = "digits"; }
      else { noteBuf.push(...letterBuf); letterBuf = []; state = "pre"; i--; }
    } else if (state === "digits") {
      if (t.kind === "digit" && digitBuf.length < 4) { digitBuf.push(t.value); }
      else { state = "post"; i--; }
    } else { // post
      if      (t.kind === "vehicle" && !vtBuf) { vtBuf = t.value; }
      else if (t.kind === "letter")            { commit(); letterBuf.push(t.value); state = "letters"; }
      else                                     { commit(); noteBuf.push(t.value); state = "pre"; }
    }
  }
  if (state === "digits" || state === "post") commit();
  return results;
}

// ─── English → Arabic plate letter mapping ────────────────────────────────
export const EN_TO_AR: Record<string, string> = {
  A: "ا", B: "ب", C: "ح", J: "ح", D: "د", R: "ر", S: "س", X: "ص", T: "ط",
  E: "ع", G: "ق", K: "ك", L: "ل", M: "م", Z: "م", N: "ن", H: "ه", U: "و", V: "ي",
};

export const VALID_AR_LETTERS = new Set([
  "ا","ب","ح","د","ر","س","ص","ط","ع","ق","ك","ل","م","ن","هـ","ه","و","ي","ى",
]);

// ─── Vehicle types ─────────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  "ونيت", "فان", "دباب", "شاحنة", "باص",
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
  ["ءاف",  "ق"], ["آف",   "ق"], ["اف",   "ق"],
  ["كاف",  "ك"], ["كَاف", "ك"], ["كي",   "ك"],
  ["لام",  "ل"], ["لَام", "ل"],
  ["ميم",  "م"], ["مِيم", "م"],
  ["نون",  "ن"], ["نُون", "ن"],
  ["هاء",  "هـ"],["هَاء","هـ"],
  ["واو",  "و"], ["وَاو", "و"], ["وا",   "و"],
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
  // ── Hundreds ─────────────────────────────────────────────────────────────
  ["ثلاثمئة", "300"], ["ثلاثمية", "300"], ["تلاتمية", "300"], ["تلتمية",  "300"],
  ["أربعمئة", "400"], ["أربعمية", "400"], ["اربعمية", "400"], ["ربعمية",  "400"],
  ["خمسمئة",  "500"], ["خمسمية",  "500"],
  ["ستمئة",   "600"], ["ستمية",   "600"],
  ["سبعمئة",  "700"], ["سبعمية",  "700"],
  ["ثمانمئة", "800"], ["ثمانمية", "800"], ["تمانمية", "800"],
  ["تسعمئة",  "900"], ["تسعمية",  "900"],
  ["مئتين",   "200"], ["ميتين",   "200"],
  ["مئة",     "100"], ["مية",     "100"], ["ميه",     "100"],
  // ── Thousands ────────────────────────────────────────────────────────────
  ["ثمانية آلاف", "8000"], ["تمانية آلاف", "8000"], ["ثمانية الاف", "8000"], ["تمانية الاف", "8000"],
  ["تسعة آلاف",   "9000"], ["تسعة الاف",   "9000"],
  ["سبعة آلاف",   "7000"], ["سبعة الاف",   "7000"],
  ["ستة آلاف",    "6000"], ["ستة الاف",    "6000"],
  ["خمسة آلاف",   "5000"], ["خمسة الاف",   "5000"],
  ["أربعة آلاف",  "4000"], ["اربعة آلاف",  "4000"], ["أربعة الاف",  "4000"], ["اربعة الاف",  "4000"],
  ["ثلاثة آلاف",  "3000"], ["تلاتة آلاف",  "3000"], ["ثلاثة الاف",  "3000"], ["تلاتة الاف", "3000"],
  ["ألفين",  "2000"], ["الفين",  "2000"],
  ["ألف",    "1000"], ["الف",    "1000"],
  // ── و-prefixed hundreds (for compound: ألف ومئة → 1100) ─────────────────
  ["وتسعمئة",  "900"], ["وتسعمية",  "900"],
  ["وثمانمئة", "800"], ["وتمانمية", "800"],
  ["وسبعمئة",  "700"], ["وسبعمية",  "700"],
  ["وستمئة",   "600"], ["وستمية",   "600"],
  ["وخمسمئة",  "500"], ["وخمسمية",  "500"],
  ["وأربعمئة", "400"], ["واربعمية", "400"],
  ["وثلاثمئة", "300"], ["وتلاتمية", "300"],
  ["ومئتين",   "200"], ["وميتين",   "200"],
  ["ومئة",     "100"], ["ومية",     "100"],
  // ── و-prefixed tens (for compound: خمسة وعشرين → 25) ────────────────────
  ["وتسعين",  "90"], ["وثمانين", "80"], ["وتمانين", "80"],
  ["وسبعين",  "70"], ["وستين",   "60"], ["وخمسين",  "50"],
  ["وأربعين", "40"], ["واربعين", "40"],
  ["وثلاثين", "30"], ["وتلاتين", "30"],
  ["وعشرين",  "20"], ["وعشرة",  "10"], ["وعشره",  "10"],
  // ── و-prefixed units (for compound: مئة وخمسة → 105) ─────────────────────
  ["وتسعة",   "9"], ["وتسعه",   "9"], ["وتسع",   "9"],
  ["وثمانية", "8"], ["وتمانية", "8"],
  ["وسبعة",   "7"], ["وسبعه",   "7"], ["وسبع",   "7"],
  ["وستة",    "6"], ["وسته",    "6"], ["وست",    "6"],
  ["وخمسة",   "5"], ["وخمسه",   "5"], ["وخمس",   "5"],
  ["وأربعة",  "4"], ["واربعة",  "4"], ["وأربع",  "4"],
  ["وثلاثة",  "3"], ["وتلاتة",  "3"], ["وثلاث",  "3"], ["وتلات", "3"],
  ["واثنين",  "2"], ["واتنين",  "2"],
  ["وواحد",   "1"], ["ووحده",   "1"],
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
  // Fast path: if no ASCII letters (A-Z/a-z), keep only Arabic chars + digits.
  // This strips spaces, dashes, dots, slashes and any other punctuation that
  // sometimes appears in bank referral files (e.g. "أبح-1234", "أبح/1234").
  let hasAscii = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) { hasAscii = true; break; }
  }
  if (!hasAscii) return raw.replace(/[^؀-ۿ0-9٠-٩]/g, "");

  // Slow path: convert English plate letters to Arabic.
  // Keep: digits, mapped Arabic equiv of EN letters, existing Arabic chars.
  // Skip: spaces, dashes, dots, slashes, and any other punctuation.
  const upper = raw.toUpperCase();
  let result = "";
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code >= 48 && code <= 57) { result += upper[i]; continue; }   // digit: keep
    if (code >= 65 && code <= 90) { result += EN_TO_AR[upper[i]] ?? upper[i]; continue; } // EN letter → Arabic
    if (code >= 0x0600) { result += upper[i]; continue; }              // Arabic char: keep
    // else: space, dash, dot, slash, etc. → skip
  }
  return result;
}

export function normalizePlate(plate: string): string {
  if (!plate) return "";

  // Scan for chars that require normalization:
  // any non-digit ASCII (spaces, dashes, dots, slashes, letters…), alef variants,
  // ى=1609, Arabic-Indic digits ٠-٩ (1632-1641)
  let needsClean = false;
  for (let i = plate.length - 1; i >= 0; i--) {
    const c = plate.charCodeAt(i);
    if (
      (c <= 127 && (c < 48 || c > 57)) || // any non-digit ASCII char
      c === 1571 || c === 1573 || c === 1570 || // أ إ آ
      c === 1609 ||                              // ى
      c === 1600 ||                              // ـ tatweel elongation mark
      (c >= 1632 && c <= 1641)                   // ٠-٩ Arabic-Indic
    ) {
      needsClean = true;
      break;
    }
  }

  const s = needsClean
    ? plate
        .replace(/[أإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ـ/g, "")            // strip tatweel (not a plate letter)
        .replace(/[٠-٩]/g, (d) => ARABIC_INDIC[d] ?? d)
        .replace(/[^؀-ۿ0-9]/g, "") // strip everything that isn't Arabic or a digit
    : plate;

  if (!s) return "";

  // Separate letters from digits to handle reversed plates (5052حبك → حبك5052)
  // Manual scan is faster than regex for 464K+ calls in the sort loop
  let dStart = -1, dEnd = -1, inRun = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      if (!inRun) { dStart = i; inRun = true; }
      dEnd = i;
    } else if (inRun) {
      break; // end of first contiguous digit run
    }
  }

  if (dStart === -1) return s; // no digits

  // Remove ALL digit chars for letters; use first digit run as the number component
  let letters = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) letters += s[i];
  }
  return letters + s.slice(dStart, dEnd + 1).padStart(4, "0");
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

  // 3. Normalize alef variants (أ إ آ → ا) — SR may return these for the letter ا
  text = text.replace(/[أإآ]/g, "ا");

  // 3b. Normalize standalone ه → هـ (SR often omits the tatweel)
  text = text.replace(/ه(?!ـ)/g, "هـ");

  // 3c. Resolve ألف/الف ambiguity: when followed by و (number compound context)
  // treat as 1000, not the letter ا. Must run BEFORE LETTER_NAMES consumes "ألف".
  text = text.replace(/(?:ألف|الف)(?=\s+و)/g, " 1000 ");

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

  // Zero-pad digit suffix to 4 (Saudi plates always have 4-digit numbers: حكل80 → حكل0080)
  if (plate) {
    plate = plate.replace(/(\d+)$/, (m) => m.padStart(4, "0"));
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

/**
 * Returns ALL headers that look like plate columns (not just the first one).
 * Some bank files have both an English column ("Plate Number") and an Arabic
 * column ("The plate number in Arabic" / "رقم اللوحة عربي"). Indexing both
 * ensures matching works regardless of how the data file encodes the same plate.
 * Uses stricter keywords than detectPlateColumn (excludes "رقم" alone to
 * avoid matching chassis-number columns like "رقم الهيكل").
 */
export function detectAllPlateColumns(headers: string[]): string[] {
  const keywords = ["لوحة", "اللوحة", "plate"];
  return headers.filter((h) =>
    keywords.some((k) => h.toLowerCase().includes(k.toLowerCase()))
  );
}

/**
 * Returns the normalized plate with its Arabic letter portion reversed.
 * Some referral files encode Arabic letters LTR (e.g. "ر د أ 2812" for a
 * plate whose canonical Arabic form is "أدر2812"). Adding the reversed form
 * to lookup maps ensures matching works regardless of encoding direction.
 * "هـ" (U+0647 + U+0640) is treated as a single unit.
 */
export function reversePlateLetters(normalized: string): string {
  let i = 0;
  while (i < normalized.length && (normalized.charCodeAt(i) < 48 || normalized.charCodeAt(i) > 57)) i++;
  if (i === 0 || i === normalized.length) return normalized;
  const letterPart = normalized.slice(0, i);
  const digitPart = normalized.slice(i);
  const units: string[] = [];
  for (let j = 0; j < letterPart.length; j++) {
    if (letterPart.charCodeAt(j) === 0x0647 && letterPart.charCodeAt(j + 1) === 0x0640) {
      units.push("هـ"); j++;
    } else {
      units.push(letterPart[j]);
    }
  }
  return units.reverse().join("") + digitPart;
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
    const rev = reversePlateLetters(norm);
    if (rev !== norm) exact.set(rev, row);
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
    if (!norm) continue;
    dataNormMap.set(norm, row);
    const rev = reversePlateLetters(norm);
    if (rev !== norm) dataNormMap.set(rev, row);
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
