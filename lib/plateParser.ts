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

// The arabized English "zero" — the recognizer clips/spells it a different
// way almost every take (زير, زيرو, زيرة, زيره, زيرا, زيرى). Match the whole
// family as one standalone word instead of chasing each variant. The
// lookbehind/lookahead keep it whole-word, so "وزير" (minister) is untouched.
const ZERO_WORD_RE = /(?<![؀-ۿ])زير[وةهاى]?(?![؀-ۿ])/g;

// ─── Egyptian dialect → Saudi plate letter/digit mapping ─────────────────
// المأمور يقول كل حرف كلمة لوحدها: "دال حه ره واحد اتنين تلاتة أربعة"
export const EGYPTIAN_LETTERS: Record<string, string> = {
  // حروف اللوحات — النطق المصري القصير
  "الف": "ا", "ألف": "ا", "الالف": "ا", "الألف": "ا",
  "به":  "ب", "بة":  "ب",
  "حه":  "ح", "حة":  "ح",
  "دال": "د",
  "ره":  "ر", "رة":  "ر",
  "سين": "س",
  "طه":  "ط", "طة":  "ط",
  "عين": "ع",
  "قاف": "ق",
  "كاف": "ك",
  "لام": "ل",
  "ميم": "م",
  "نون": "ن",
  "هه":  "ه", "هة":  "ه",
  "واو": "و",
  "يه":  "ي", "ية":  "ي",
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
      const clean = w.replace(/[ؐ-ًؚ-ٟ]/g, "");
      return EGYPTIAN_LETTERS[clean] ?? clean;
    })
    .join("");
}

export interface MultiPlateResult {
  plate: string;
  vehicleType?: string;
  notes: string;
  normalized: string;
  // True when the letters weren't cleanly dictated next to the digits — either
  // salvaged from a garbled word, or not found at all. Callers can use this to
  // flag the plate for a quick human glance instead of trusting it blindly.
  uncertain?: boolean;
  // The text behind an uncertain letters guess — either the garbled word
  // salvaged for letters, or the full run of clean letters found when there
  // were more than the 3 a plate can have. This is AFTER Step 1's text-level
  // normalization (diacritics stripped, ه→هـ, alef variants unified) — not a
  // literal substring of the transcript — but that's fine for its one job:
  // a stable, deterministic key. Only set when the guess came from one of
  // those paths; lets a later human correction teach a WordBlendMap entry
  // for the whole fragment instead of a misleading per-letter diff.
  rawLetterSource?: string;
}

/**
 * Rough "how plate-like is this transcript" score. Used to pick the BEST
 * hypothesis when the speech recognizer returns several alternatives
 * (maxResults / maxAlternatives): different hypotheses of the same utterance
 * are scored and the highest one is kept.
 *
 * Rewards clean plate content — mapped single letters (دال→د) and digit groups —
 * and penalizes junk (non-plate) characters, so a hypothesis that spells letters
 * cleanly ("راء قاف سين") beats one that mashes them into an invented word
 * ("راقوف"). Pure heuristic, no side effects.
 */
export function plateContentScore(text: string): number {
  if (!text) return 0;
  let t = removeDiacritics(text.trim());
  t = t.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
  t = replaceAll(t, LETTER_NAMES);
  t = replaceAll(t, PHONETIC_MERGES);
  t = replaceAll(t, SPOKEN_NUMBERS);
  t = normalizeNumerals(t);

  const allValid = (s: string) => [...s].every((c) => VALID_AR_LETTERS.has(c));

  let score = 0;
  for (const tok of t.split(/\s+/).filter(Boolean)) {
    const clean = tok.replace(/ـ/g, "");
    // Pure digit group.
    if (/^\d+$/.test(clean)) { score += Math.min(clean.length, 4); continue; }
    // Glued letters+digits (e.g. حمل8121) — solid plate content.
    const glued = clean.match(/^([؀-ۿ]{1,3})(\d{1,4})$/);
    if (glued && allValid(glued[1])) { score += glued[1].length + Math.min(glued[2].length, 4); continue; }
    // Mapped letter/number name (دال→د, خمسة→5).
    const eg = EGYPTIAN_LETTERS[clean];
    if (eg) { score += /^\d$/.test(eg) ? 1 : 3; continue; }
    // Clean single plate letter — the ideal dictation unit.
    if (clean.length === 1 && VALID_AR_LETTERS.has(clean)) { score += 3; continue; }
    // Short (2-3) all-valid-letter token — plausible glued plate letters.
    if (clean.length <= 3 && /^[؀-ۿ]+$/.test(clean) && allValid(clean)) { score += clean.length; continue; }
    // Anything longer, or with non-plate characters → junk/note. Penalize:
    // plate letters are dictated as short units, not long words.
    score -= 1;
  }
  return score;
}

/**
 * Given several recognizer hypotheses for the SAME utterance, return the one
 * that looks most like plate dictation. Falls back to the first non-empty.
 *
 * `confidences[i]` (0-1), when provided by the recognizer (e.g. the Web Speech
 * API's SpeechRecognitionAlternative.confidence — the native Capacitor plugin
 * doesn't expose this), is added as a small tiebreaker: it can only flip a
 * near-tie in plateContentScore, never override a clearly better-shaped one.
 */
export function pickBestHypothesis(candidates: string[], confidences?: number[]): string {
  let best = "";
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c) continue;
    const s = plateContentScore(c) + (confidences?.[i] ?? 0);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

/**
 * ذرّة تحليل لوحة — حرف (L) / رقم (D) / نوع مركبة (V) / كلمة ملاحظة (N).
 * مُصدَّرة عشان sessionParser يقدر يعمل carry-over على مستوى الذرّات
 * (لوحة مقطوعة على حدود chunk تترحّل للـ chunk الجاي بدل ما تضيع).
 */
export type PlateAtom =
  | { t: "L"; v: string; fromName?: boolean }
  | { t: "D"; v: string; joinedByWaw?: boolean }
  | { t: "V"; v: string }
  | { t: "N"; v: string; letters: string[] };

/**
 * Steps 1-2.5 من استخراج اللوحات المتعددة: التطبيع الكامل + تصنيف التوكنات
 * لذرّات مرتّبة. مفصولة عن التجميع عشان تنفع للتحليل التدريجي (streaming).
 */
export function plateAtoms(transcript: string): PlateAtom[] {
  // ── Step 1: run the SAME normalization the single-plate parser uses, so
  // spoken letter-names (لام→ل), phonetic merges, and number-words (خمسة→5)
  // become plate letters/digits BEFORE segmentation. Vehicle words are kept
  // in place (not stripped) so each can be attached to its nearest plate.
  // replaceAll() surrounds every match with spaces, so word boundaries survive
  // and segmentation still sees one token per spoken unit.
  let text = removeDiacritics(transcript.trim());
  // Punctuation → space FIRST. Whisper separates dictated plates with the
  // Arabic comma "،" (U+060C) glued to the preceding word ("اثنين،"). That
  // char lives INSIDE the [؀-ۿ] block replaceAll's word-boundary lookaround
  // guards on, so it silently blocked the attached number/letter from
  // converting. Clearing it (and other punctuation) to a space up front makes
  // every token a clean word again — and keeps stray punctuation out of notes.
  text = text.replace(/[،؛؟۔.,;!?]/g, " ");
  text = text.replace(ZERO_WORD_RE, " 0 "); // زير/زيرو/زيرة/زيره… = arabized "zero"
  text = text.replace(/[أإآ]/g, "ا");        // alef variants → ا
  // NB: no ألف→1000 rewrite here (unlike parsePlateFromTranscript). In
  // letter-by-letter dictation "ألف" is almost always the LETTER ا, and this
  // segmenter concatenates rather than sums, so the rewrite only ever ATE the
  // very-common ا into a phantom 1000 (fired whenever the next word merely
  // started with و — e.g. the misheard "وواب"/"واو"). A genuine compound like
  // "ألف وخمسمية" produces no digit group here, so extractMultiplePlates
  // returns [] and extractPlates falls back to parsePlateFromTranscript, which
  // sums it correctly (حمن1500). So ألف always → ا via LETTER_NAMES below.
  text = text.replace(/ى/g, "ي");            // alef maqsura → ي
  // Protect the explicit letter-name واو ("the letter waw" — always a letter,
  // never the conjunction) from LETTER_NAMES' text-level collapse to bare و
  // below. Once collapsed it's indistinguishable from a literally-spoken
  // conjunction و, and Step 2.5 needs to tell them apart. A Latin placeholder
  // survives every later Arabic-only regex/lookup untouched and is resolved
  // to a marked atom in Step 2, which Step 2.5 then exempts from removal.
  text = text.replace(/(?<![؀-ۿ])(?:واو|وا)(?![؀-ۿ])/g, " __WAWNAME__ ");
  text = replaceAll(text, LETTER_NAMES);     // دال→د, صاد→ص, لام→ل …
  text = replaceAll(text, PHONETIC_MERGES);  // احلام→ا ح ل …
  text = replaceAll(text, SPOKEN_NUMBERS);   // خمسة→5, تلاتين→30, ألفين→2000 …
  // standalone ه → هـ (SR drops the tatweel) — MUST run AFTER the word maps
  // above, not before: converting bare ه too early corrupts the letter name
  // "هاء" into "هـاء" (no longer matches LETTER_NAMES, so the ه silently
  // disappears) and mangles heh-spelled number words like "ميه" (100). By this
  // point every multi-char word containing ه has already been resolved, so
  // any ه still bare here is a genuine standalone single-letter utterance.
  text = text.replace(/ه(?!ـ)/g, "هـ");
  text = normalizeNumerals(text);            // ٥→5

  const rawTokens = text.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return [];

  // ── Step 2: classify tokens, then flatten into ordered ATOMS.
  //   atom.t: "L" single plate letter | "D" single digit | "V" vehicle | "N" note.
  //   "N" atoms carry a best-effort `letters[]` so a garbled all-letters word
  //   adjacent to a digit group can still yield a correctable plate.
  const atoms: PlateAtom[] = [];
  for (const raw of rawTokens) {
    // The protected letter-name placeholder — always a deliberate letter و,
    // flagged so Step 2.5 never mistakes it for the conjunction.
    if (raw === "__WAWNAME__") { atoms.push({ t: "L", v: "و", fromName: true }); continue; }
    // Strip tashkeel + tatweel; keep base plate letters. (Reuse the same helper
    // the single-plate parser trusts rather than an inline fragile range.)
    const clean = removeDiacritics(raw).replace(/ـ/g, "");
    const mapped = EGYPTIAN_LETTERS[clean] ?? clean;

    // Pure digit run → individual digit atoms (kept per-digit so 5 9 3 2 → 5932).
    if (/^\d+$/.test(clean)) {
      for (const d of clean) atoms.push({ t: "D", v: d });
      continue;
    }
    // Single mapped digit from Egyptian speech ("واحد"→"1").
    if (/^\d$/.test(mapped)) { atoms.push({ t: "D", v: mapped }); continue; }
    // Single valid Saudi plate letter after Egyptian mapping.
    if (mapped.length === 1 && VALID_AR_LETTERS.has(mapped)) {
      atoms.push({ t: "L", v: mapped }); continue;
    }
    // Vehicle keyword (check before letter salvage so نقليات etc. isn't eaten).
    const vt = VEHICLE_TYPES.find((v) => raw.includes(v));
    if (vt) { atoms.push({ t: "V", v: vt }); continue; }
    // Location / directional keyword → ALWAYS a note, never plate letters.
    // Critical because many of these are all-valid-letter words (يمين=ي م ي ن,
    // يسار=ي س ا ر) that would otherwise be salvaged into an adjacent plate.
    if (NOTE_KEYWORDS.has(clean)) { atoms.push({ t: "N", v: raw, letters: [] }); continue; }
    // Glued letters+digits spoken as one token (e.g. حمل8121, ابل2150, رقس3944).
    const glued = clean.match(/^([؀-ۿ]+)(\d+)$/);
    if (glued) {
      const gl = extractLettersFromToken(glued[1]).slice(0, 3);
      if (gl.length > 0) {
        for (const l of gl) atoms.push({ t: "L", v: l });
        for (const d of glued[2]) atoms.push({ t: "D", v: d });
        continue;
      }
    }
    // Pure-Arabic token (tatweel already stripped): clean plate letters or a note.
    if (/^[؀-ۿ]+$/.test(clean)) {
      const letters = extractLettersFromToken(clean);
      // Clean plate-letter token: 1..3 valid letters and NOTHING else.
      if (letters.length >= 1 && letters.length <= 3 && isAllPlateLetters(clean)) {
        for (const l of letters) atoms.push({ t: "L", v: l });
        continue;
      }
      // Longer / partly-invalid word → note, but keep best-effort letters so a
      // garbled all-letters word adjacent to digits can still seed a plate.
      atoms.push({ t: "N", v: raw, letters });
      continue;
    }
    // Anything else (Latin noise, mixed punctuation) → note with no usable letters.
    atoms.push({ t: "N", v: raw, letters: [] });
  }

  // ── Step 2.5: spoken Arabic joins digits with the conjunction "و"
  //   ("6 و 1 و 2 و 1" = 6121). The recognizer emits it as a standalone token
  //   identical to the plate letter waw. When a و sits between two digit atoms
  //   AND the digits it would join still fit one plate number (≤4), it's the
  //   conjunction — drop it so the digits form a single run. Two complete
  //   4-digit groups joined by و ("1234 و 5678") are left alone: there the و
  //   may genuinely be the next plate's letter. A و traced back to the explicit
  //   letter-name "واو" (fromName) is never ambiguous — always kept as a letter.
  //   Every merge is inherently a guess, so the digits it joins are flagged
  //   (joinedByWaw) and the resulting plate is marked uncertain in Step 4 —
  //   a genuine 2nd short plate whose only letter is واو can look identical.
  for (let i = 1; i < atoms.length - 1; i++) {
    const a = atoms[i];
    if (a.t !== "L" || a.v !== "و" || a.fromName) continue;
    const prev = atoms[i - 1], next = atoms[i + 1];
    if (prev.t !== "D" || next.t !== "D") continue;
    let joined = 0;
    for (let k = i - 1; k >= 0 && atoms[k].t === "D"; k--) joined++;
    for (let k = i + 1; k < atoms.length && atoms[k].t === "D"; k++) joined++;
    if (joined <= 4) {
      prev.joinedByWaw = true;
      next.joinedByWaw = true;
      atoms.splice(i, 1); i--;
    }
  }

  return atoms;
}

/**
 * Steps 3-6: تجميع الذرّات المرتّبة للوحات كاملة (حروف + 4 أرقام + نوع + ملاحظات).
 */
export function platesFromAtoms(atoms: PlateAtom[]): MultiPlateResult[] {
  // ── Step 3: anchor on digit groups (runs of D atoms), split into 4-digit
  //   chunks. Several plate numbers dictated back-to-back with no letter
  //   naming between them are still ONE run of consecutive D atoms — without
  //   splitting, only the first 4 digits would survive and the rest would be
  //   silently discarded. Each chunk becomes its own plate.
  const groups: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < atoms.length; i++) {
    if (atoms[i].t === "D") {
      let j = i;
      while (j + 1 < atoms.length && atoms[j + 1].t === "D") j++;
      for (let k = i; k <= j; k += 4) groups.push({ start: k, end: Math.min(k + 3, j) });
      i = j;
    }
  }
  if (groups.length === 0) return [];

  interface Plate {
    gi: number;
    letters: string[];
    digits: string;
    vehicleType?: string;
    notes: string[];
    uncertain: boolean;
    rawLetterSource?: string;
    absorbed?: boolean;
  }

  // ── Step 4: for each group, scan BACKWARD (bounded by the previous group)
  //   collecting up to 3 adjacent plate letters. Adjacent clean "L" atoms win.
  //   If none are adjacent, fall back to the best-effort letters of a directly
  //   preceding garbled "N" word so the plate is still produced (correctable).
  const consumed = new Set<number>();
  const plates: Plate[] = groups.map((g, gi) => {
    for (let k = g.start; k <= g.end; k++) consumed.add(k);
    const digits = atoms
      .slice(g.start, g.end + 1)
      .map((a) => a.v)
      .join("")
      .slice(0, 4);

    const letters: string[] = [];
    const prevBoundary = gi > 0 ? groups[gi - 1].end : -1;
    let i = g.start - 1;
    while (i > prevBoundary && letters.length < 3) {
      const a = atoms[i];
      if (a.t === "L") { letters.unshift(a.v); consumed.add(i); i--; }
      else break;
    }
    // The clean adjacent-letters scan above is the confident path. Anything
    // that has to fall back to salvaging a garbled word — or finds nothing —
    // is flagged uncertain so the UI can prompt a quick human glance. A digit
    // group stitched together by Step 2.5's و-conjunction guess is also
    // flagged: a genuine short plate whose only letter is واو can look
    // identical, so it's worth a glance even when the letters scan is clean.
    // So is a plate whose cap-of-3 scan stopped only because it hit the cap,
    // not because it ran out of clean letters (atoms[i] here is STILL "L") —
    // a real Saudi plate has at most 3 letters, so 4+ dictated back-to-back
    // means something (an extra misheard word/letter) got glued on; which 3
    // of them are the real plate is a guess picking the nearest ones.
    const digitAtoms = atoms.slice(g.start, g.end + 1);
    const wawJoined = digitAtoms.some((a) => a.t === "D" && a.joinedByWaw);
    const letterOverflow = letters.length === 3 && i > prevBoundary && atoms[i]?.t === "L";
    const uncertain = letters.length === 0 || wawJoined || letterOverflow;
    // rawLetterSource is the raw text a later human correction can teach a
    // whole-fragment WordBlendMap entry against — the full overflow run (not
    // just the 3 kept) or the garbled word salvaged for letters. Only ever
    // set on the guess paths, never on a confident clean extraction.
    let rawLetterSource: string | undefined;
    if (letterOverflow) {
      const fullRun = [...letters];
      let j = i;
      while (j > prevBoundary && atoms[j].t === "L") { fullRun.unshift(atoms[j].v); j--; }
      rawLetterSource = fullRun.join("");
    }
    if (letters.length === 0 && i > prevBoundary) {
      const a = atoms[i];
      if (a.t === "N" && a.letters.length > 0) {
        for (const l of a.letters.slice(0, 3)) letters.push(l);
        consumed.add(i);
        const rawSpan = [a.v];
        i--;
        // A garbled word right next to the digits can strand CLEAN letters
        // just before it — e.g. "دال راء تق 3478" (طاء misheard as تق, which
        // has only one valid letter) would otherwise lose the cleanly-heard
        // د and ر, which then get silently misattributed as a note on some
        // unrelated neighboring plate (Step 5 below). Keep pulling clean L
        // atoms from before the garbled word, in speech order, up to the
        // same 3-letter cap, instead of stopping at the garbled word alone.
        while (i > prevBoundary && letters.length < 3) {
          const b = atoms[i];
          if (b.t === "L") { letters.unshift(b.v); rawSpan.unshift(b.v); consumed.add(i); i--; }
          else break;
        }
        rawLetterSource = rawSpan.join("");
      }
    }
    return { gi, letters, digits, notes: [], uncertain, rawLetterSource };
  });

  // ── Step 5: assign leftover atoms to the nearest plate.
  //   Vehicle → nearest PRECEDING plate's vehicleType (else the following plate).
  //   Note    → preceding plate if any (trailing note), else following (leading).
  for (let i = 0; i < atoms.length; i++) {
    if (consumed.has(i)) continue;
    const a = atoms[i];
    if (a.t === "D") continue;

    let before = -1, after = -1;
    for (let p = 0; p < plates.length; p++) {
      const g = groups[plates[p].gi];
      if (g.end < i) before = p;
      else if (g.start > i && after === -1) after = p;
    }

    if (a.t === "V") {
      const p = before !== -1 ? before : after;
      if (p !== -1) {
        if (!plates[p].vehicleType) plates[p].vehicleType = a.v;
        else plates[p].notes.push(a.v);
      }
      continue;
    }
    // Note word (an "N" word, or a stray unconsumed "L" letter). Trailing notes
    // attach to the preceding plate; leading notes to the following one.
    const target = before !== -1 ? before : after;
    if (target !== -1) plates[target].notes.push(a.v);
  }

  // ── Step 6: a real Saudi plate always has letters. A group that still has
  //   NONE after every scan above (clean, salvaged, or supplemented) isn't a
  //   plate — field agents confirmed they never dictate a standalone number,
  //   as either a separate plate or a note, so a letters-less group is
  //   always leftover from a longer digit run (the recognizer commonly adds
  //   a spurious extra digit). Fold its digits into the nearest LETTERED
  //   plate's notes instead of saving it as its own confusing phantom
  //   record — preferring the preceding plate, matching how trailing notes
  //   are attached elsewhere. If no lettered plate exists at all (nothing to
  //   fold into), it's left as its own uncertain entry rather than dropped.
  for (let idx = 0; idx < plates.length; idx++) {
    const orphan = plates[idx];
    if (orphan.letters.length > 0) continue;
    let target: Plate | undefined;
    for (let k = idx - 1; k >= 0; k--) {
      if (plates[k].letters.length > 0) { target = plates[k]; break; }
    }
    if (!target) {
      for (let k = idx + 1; k < plates.length; k++) {
        if (plates[k].letters.length > 0) { target = plates[k]; break; }
      }
    }
    if (!target) continue;
    target.notes.push(orphan.digits.padStart(4, "0"));
    target.notes.push(...orphan.notes);
    if (orphan.vehicleType) {
      if (!target.vehicleType) target.vehicleType = orphan.vehicleType;
      else target.notes.push(orphan.vehicleType);
    }
    orphan.absorbed = true;
  }

  return plates.filter((p) => !p.absorbed).map((p) => {
    const plate = p.letters.join("") + p.digits.padStart(4, "0");
    // لوحة السعودية دايماً ٤ أرقام. لو أقل → المحرك سقّط رقم/أكتر؛ ممنوع نعرضها
    // كأنها مؤكّدة («ممنوع الإسقاط الصامت») — نعلّمها ناقصة (uncertain) للمراجعة
    // بدل ما نحشّي أصفار ونعرض «دمك0065» كأنها صح. (الشكوى الميدانية: يسمع رقم
    // من الأربعة فيكتب ٣ أصفار ورقم).
    const incompleteDigits = p.digits.length < 4;
    return {
      plate,
      vehicleType: p.vehicleType || undefined,
      notes: p.notes.join(" "),
      normalized: normalizePlate(plate),
      uncertain: p.uncertain || incompleteDigits || undefined,
      rawLetterSource: p.rawLetterSource,
    };
  });
}

/**
 * يستخرج عدة لوحات من تسجيل صوتي واحد.
 * الترتيب المتوقع: [ملاحظات] [حروف اللوحة] [أرقام اللوحة] [نوع السيارة] [تكرار]
 * كل لوحة = 1-3 حروف سعودية + 4 أرقام.
 */
export function extractMultiplePlates(transcript: string): MultiPlateResult[] {
  return platesFromAtoms(plateAtoms(transcript));
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
// Includes car-status words (مصدومة/مركونة/معطلة) alongside actual vehicle
// types — field agents dictate them the same way (right after the plate)
// and want them landing in the same "نوع السيارة" field, not notes.
const VEHICLE_TYPES = [
  "ونيت", "فان", "دباب", "شاحنة", "باص",
  "صالون", "بيكاب", "تاكسي", "كروزر", "باترول", "نقليات", "مفحوطة",
  "مصدومة", "مصدومه", "مركونة", "مركونه", "معطلة", "معطله",
];

/**
 * Pull a vehicle-type keyword (ونيت / مصدومة / فان / دباب / مركونة …) out of a
 * spoken phrase and return it separately from the rest, so the caller can put
 * the type in its own column instead of mistaking it for plate letters.
 */
export function extractVehicleType(text: string): { vehicleType?: string; rest: string } {
  for (const vt of VEHICLE_TYPES) {
    if (text.includes(vt)) {
      return { vehicleType: vt, rest: text.replace(vt, " ").replace(/\s+/g, " ").trim() };
    }
  }
  return { rest: text };
}

// ─── Location / directional note keywords ────────────────────────────────────
// Spoken location/direction words that must ALWAYS land in `notes` and never be
// mistaken for plate letters. Several of these are made entirely of valid plate
// letters (يمين = ي م ي ن، يسار = ي س ا ر) so they'd otherwise get salvaged into
// an adjacent plate. Compared against the tatweel-stripped token (`clean`).
const NOTE_KEYWORDS = new Set([
  // اتجاهات
  "يمين", "اليمين", "يسار", "اليسار", "شمال", "الشمال",
  "امام", "أمام", "قدام", "خلف", "ورا", "وراء", "جنب", "بجانب",
  "فوق", "تحت", "داخل", "جوه", "برا", "خارج",
  // أماكن / مواقف
  "جراج", "الجراج", "كراج", "الكراج", "موقف", "الموقف", "باركن", "باركنج",
  "برحة", "بارحة", "البرحة", "البارحة", "حارة", "الحارة", "طريق", "الطريق",
  "شارع", "الشارع", "دوار", "الدوار", "كوبري", "الكوبري",
  "عمارة", "العمارة", "فيلا", "الفيلا", "محل", "المحل", "مدخل", "مخرج",
]);

// ─── Fixed note phrases (dictionary + fuzzy guess) ──────────────────────────
// عبارات الملاحظات الثابتة اللي المندوب بيقولها في الميدان. البرنامج يتعرّف
// عليها ويحطها في خانة الملاحظات، ولو التفريغ مسمعش كويس يخمّن أقرب عبارة.
// بنمسكها *قبل* استخراج اللوحة علشان رقم الجراج ("جراج يمين رقم ٥") ميتلغبطش
// مع أرقام اللوحة.

function normForNotes(text: string): string {
  // Numerals FIRST: removeDiacritics' range (ً-ٰ) overlaps the
  // Arabic-Indic digit block (٠-٩), so it would eat ٥ before we
  // ever convert it. Convert to Western digits up front.
  let t = normalizeNumerals(text);
  t = removeDiacritics(t);
  t = t.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
  t = t.replace(/[،؛؟۔.,;!?]/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

// تطابق مرن: مسافة تعديل ≤ 1 عن أي بديل.
function anchorEq(tok: string, ...alts: string[]): boolean {
  return alts.some((a) => levenshtein(tok, a) <= 1);
}

// أقرب اتجاه للتوكن (يمين/شمال/يسار) مع تسامح للتفريغ الغلط.
function matchDirection(tok: string): "يمين" | "شمال" | "يسار" | null {
  const dirs: [("يمين" | "شمال" | "يسار"), string[]][] = [
    ["يمين", ["يمين", "يمن", "اليمين"]],
    ["يسار", ["يسار", "يسر", "اليسار"]],
    ["شمال", ["شمال", "شمل", "الشمال"]],
  ];
  for (const [canon, alts] of dirs) {
    if (alts.some((a) => levenshtein(tok, a) <= 1)) return canon;
  }
  return null;
}

// رقم منطوق أو رقمي → أرقام (خمسة → 5، ٥ → 5).
function spokenToDigits(tok: string): string {
  if (!tok) return "";
  if (/^\d+$/.test(tok)) return tok;
  const m = replaceAll(tok, SPOKEN_NUMBERS).match(/\d+/);
  return m ? m[0] : "";
}

/** جزء من تقسيم النص: نص عادي (فيه لوحات) أو عبارة ملاحظة معتمدة. */
export type NoteSplitPart =
  | { kind: "text"; text: string }
  | { kind: "note"; note: string };

/**
 * يقسّم نص التفريغ لأجزاء مرتّبة بمواقعها: نص عادي / عبارة ملاحظة معتمدة —
 * بدون ما يفقد ترتيب الكلام. ده الأساس اللي sessionParser بيبني عليه قاعدة
 * «الملاحظة تنطبق على اللوحات اللي بعدها» (السياق الأمامي).
 *
 * holdPending (وضع الستريمنج): لو آخر التوكنات anchor لعبارة اتقطعت على حدود
 * chunk («جراج» من غير اتجاه، «رقم» من غير الرقم) بترجع في pendingTail عشان
 * تترحّل للـ chunk الجاي بدل ما تتفسّر غلط. بدونه (batch) بتتعامل كنص عادي —
 * نفس سلوك extractNotePhrases التاريخي بالظبط.
 */
export function splitByNotePhrases(
  text: string,
  opts?: { holdPending?: boolean }
): { parts: NoteSplitPart[]; pendingTail: string } {
  const parts: NoteSplitPart[] = [];
  const normalized = normForNotes(text);
  if (!normalized) return { parts, pendingTail: "" };
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const holdPending = !!opts?.holdPending;
  const LR = new Set(["يمين", "يسار"]);

  // أقرب اتجاه ضمن نافذة توكنات بعد الفهرس from.
  const findDir = (from: number, span: number, allowed?: Set<string>) => {
    for (let j = from; j <= from + span && j < tokens.length; j++) {
      const d = matchDirection(tokens[j]);
      if (d && (!allowed || allowed.has(d))) return { dir: d, at: j };
    }
    return null;
  };

  // يحاول مطابقة عبارة ملاحظة كاملة عند i.
  //   {note, end}  → عبارة مكتملة (تستهلك i..end)
  //   "incomplete" → الـ anchor ماتش بس التوكنات خلصت قبل اكتمال العبارة
  //   null         → مش عبارة ملاحظة هنا
  const matchAt = (i: number): { note: string; end: number } | "incomplete" | null => {
    const tok = tokens[i];
    const remaining = tokens.length - i;

    // الشارع بيلف يمين / شمال / يسار
    if (anchorEq(tok, "الشارع")) {
      const hit = findDir(i + 1, 2);
      if (hit) return { note: `الشارع بيلف ${hit.dir}`, end: hit.at };
      if (remaining <= 3) return "incomplete";
      return null;
    }

    // جراج / كراج يمين | يسار [رقم N]
    if (anchorEq(tok, "جراج", "كراج", "الجراج", "الكراج")) {
      const hit = findDir(i + 1, 1, LR);
      if (hit) {
        let note = `جراج ${hit.dir}`;
        let end = hit.at;
        const j = hit.at + 1;
        if (j < tokens.length && anchorEq(tokens[j], "رقم")) {
          if (j + 1 >= tokens.length) return "incomplete"; // «رقم» والرقم في الchunk الجاي
          const num = spokenToDigits(tokens[j + 1] ?? "");
          if (num) { note += ` رقم ${num}`; end = j + 1; }
        }
        return { note, end };
      }
      if (remaining <= 2) return "incomplete";
      return null;
    }

    // برحة يمين | شمال  —  أو  برحة أول الشارع
    if (anchorEq(tok, "برحة", "برحه", "البرحة", "البرحه", "بارحة")) {
      let awal = -1, shr = -1;
      for (let j = i + 1; j <= i + 3 && j < tokens.length; j++) {
        if (anchorEq(tokens[j], "اول")) awal = j;
        else if (awal !== -1 && anchorEq(tokens[j], "الشارع")) shr = j;
      }
      if (awal !== -1 && shr !== -1) return { note: "برحة أول الشارع", end: shr };
      const hit = findDir(i + 1, 1);
      if (hit) return { note: `برحة ${hit.dir}`, end: hit.at };
      if (remaining <= 3) return "incomplete";
      return null;
    }

    // آخر الشارع يمين | يسار
    if (anchorEq(tok, "اخر", "اخره")) {
      let shr = -1;
      for (let j = i + 1; j <= i + 2 && j < tokens.length; j++) {
        if (anchorEq(tokens[j], "الشارع")) { shr = j; break; }
      }
      if (shr !== -1) {
        const hit = findDir(shr + 1, 1, LR);
        if (hit) return { note: `آخر الشارع ${hit.dir}`, end: hit.at };
        if (tokens.length - shr <= 2) return "incomplete";
        return null;
      }
      if (remaining <= 2) return "incomplete";
      return null;
    }

    // حتة واسعة يمين | شمال
    if (anchorEq(tok, "حتة", "حته")) {
      let was = -1;
      for (let j = i + 1; j <= i + 2 && j < tokens.length; j++) {
        if (anchorEq(tokens[j], "واسعة", "واسعه")) { was = j; break; }
      }
      if (was !== -1) {
        const hit = findDir(was + 1, 1);
        if (hit) return { note: `حتة واسعة ${hit.dir}`, end: hit.at };
        if (tokens.length - was <= 2) return "incomplete";
        return null;
      }
      if (remaining <= 2) return "incomplete";
      return null;
    }

    return null;
  };

  let buf: string[] = [];
  const flush = () => {
    if (buf.length) { parts.push({ kind: "text", text: buf.join(" ") }); buf = []; }
  };

  for (let i = 0; i < tokens.length; i++) {
    const m = matchAt(i);
    if (m === "incomplete") {
      if (holdPending) {
        flush();
        return { parts, pendingTail: tokens.slice(i).join(" ") };
      }
      buf.push(tokens[i]);
      continue;
    }
    if (m) {
      flush();
      parts.push({ kind: "note", note: m.note });
      i = m.end;
      continue;
    }
    buf.push(tokens[i]);
  }
  flush();
  return { parts, pendingTail: "" };
}

/**
 * يستخرج عبارات الملاحظات الثابتة من نص التفريغ ويرجّعها منفصلة عن باقي النص
 * (اللي فيه اللوحة). كل عبارة تترجع في صيغتها المعتمدة حتى لو التفريغ سمعها غلط.
 */
export function extractNotePhrases(text: string): { notes: string[]; rest: string } {
  const { parts } = splitByNotePhrases(text);
  const notes: string[] = [];
  const restParts: string[] = [];
  for (const p of parts) {
    if (p.kind === "note") notes.push(p.note);
    else restParts.push(p.text);
  }
  return { notes, rest: restParts.join(" ") };
}

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
  // صيغة «الـ + الاسم» — Whisper بيطلّعها كتير (النون/الدال/الكاف...). آمنة لأن
  // replaceAll بتطابق كلمة كاملة (lookbehind/lookahead على الحروف العربية) فمابتلمسش
  // نص جوا كلمة. الصيغ القصيرة الخطرة (ده/دا/لا/ما...) مؤجّلة لمعالجة سياقية.
  // ⚠️ «العين» مقصودة الغياب — كلمة/اسم مكان شائع بتفسد الملاحظات (مراجعة عدائية).
  ["الألف", "ا"], ["الالف", "ا"], ["الفا", "ا"],
  ["الباء", "ب"],
  ["الحاء", "ح"], ["حاه", "ح"],
  ["الدال", "د"], ["داه", "د"],
  ["الراء", "ر"], ["ريه", "ر"],
  ["السين", "س"], ["سينه", "س"],
  ["الصاد", "ص"], ["صاده", "ص"],
  ["الطاء", "ط"], ["طاه", "ط"],
  ["القاف", "ق"],
  ["الكاف", "ك"], ["كافه", "ك"],
  ["اللام", "ل"],
  ["الميم", "م"], ["ميمه", "م"],
  ["النون", "ن"], ["نونه", "ن"],
  ["الهاء", "هـ"],
  ["الواو", "و"], ["واوه", "و"],
  ["الياء", "ي"],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

// ─── Phonetic merges ────────────────────────────────────────────────────────
const PHONETIC_MERGES: [string, string][] = ([
  // Whisper merges the 3 spelled letters "حا با لام" into these two real
  // Arabic words when dictated back-to-back ("حابة علامة" → ح ب ل).
  // Deliberately scoped to the WHOLE two-word phrase, never either word
  // alone: bare "علامة" ("sign/mark") and "حابة" ("wants", fem.) are common,
  // legitimate field-note vocabulary ("جنب علامة الطريق", "المالكة حابة
  // تسدد") — merging either unconditionally was found (adversarial review)
  // to corrupt real notes and adjacent plates. The pipeline's ه→هـ rewrite
  // now runs AFTER this table (moved to fix "هاء"/"ميه" getting corrupted if
  // it ran earlier — see the rewrite's own comment below), so raw SR output
  // reaches here with BARE ه, not هـ. Every realistic teh-marbuta/bare-heh/
  // tatweel-heh spelling combination is listed so none of them depend on
  // ordering relative to that rewrite.
  ["حابة علامة", "ح ب ل"], ["حابهـ علامهـ", "ح ب ل"],
  ["حابة علامهـ", "ح ب ل"], ["حابهـ علامة", "ح ب ل"],
  ["حابه علامه", "ح ب ل"], ["حابه علامة", "ح ب ل"],
  ["حابة علامه", "ح ب ل"], ["حابه علامهـ", "ح ب ل"],
  ["حابهـ علامه", "ح ب ل"],
  // "راء ياء" (letters ر ي) glued into one word with no space between them —
  // neither LETTER_NAMES entry can match mid-word, and it's not a real
  // Arabic word otherwise, so low collision risk.
  ["راياء", "ر ي"],
  // "ياء سين" (letters ي س) glued into "ياسين" — same class as راياء. It's
  // also a real name, but in letter-by-letter plate dictation it's always
  // the two letters, and it never appears in this app's note vocabulary.
  ["ياسين", "ي س"],
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
// their constituent single words (ثلاثة عشر→3 must not eat "ثلاثة عشر" first).
// Sorted longest-first guarantees this automatically.
const SPOKEN_NUMBERS: [string, string][] = ([
  // ── 0-9 ──────────────────────────────────────────────────────────────────
  ["صفر",    "0"], // the زير/زيرو/زيرة family is handled earlier by ZERO_WORD_RE
  ["واحد",   "1"], ["وحده",   "1"], // ملاحظة: «واحده/واحدة» اتشالوا — كلمات شائعة بتولّد لوحات وهمية (يحلها state machine في المرحلة ٢)
  ["اثنين",  "2"], ["اتنين",  "2"], ["اثنان",  "2"], ["تنين",   "2"],
  ["ثلاثة",  "3"], ["تلاتة",  "3"], ["تلاته",  "3"], ["ثلاث",   "3"],
  ["تلات",   "3"], ["تلته",   "3"],
  ["أربعة",  "4"], ["اربعة",  "4"], ["اربعه",  "4"], ["أربعه",  "4"], ["أربع",   "4"], ["اربع",   "4"], ["ربعة", "4"], ["ربعه", "4"], // ربعة/ربعه = colloquial أربعة
  ["خمسة",   "5"], ["خمسه",   "5"], ["خمس",    "5"],
  ["ستة",    "6"], ["سته",    "6"], ["ست",     "6"],
  ["سبعة",   "7"], ["سبعه",   "7"], ["سبع",    "7"],
  ["ثمانية", "8"], ["تمانية", "8"], ["ثمانيه", "8"], ["تمانيه", "8"], ["تمنية",  "8"], ["تمنيه",  "8"], ["ثماني",  "8"], ["تماني",  "8"], ["تمان", "8"],
  ["تسعة",   "9"], ["تسعه",   "9"], ["تسع",    "9"],
  // ── تكرار ملخّص من Whisper ─────────────────────────────────────────────────
  // Whisper بيميل يلخّص الأرقام المكررة («خمسة خمسة خمسة»→«تلات خمسات»=555،
  // «صفر صفر صفر»→«تلات اصفار»=000). عبارات كاملة (أطول) فبتتطبّق قبل «تلات»=3.
  ["تلات خمسات", "555"], ["ثلاث خمسات", "555"], ["تلاته خمسات", "555"],
  ["تلات اصفار", "000"], ["ثلاث اصفار", "000"], ["تلاته اصفار", "000"],
  // ── 10-19 (two-word, must be LONGEST so they win over single words) ───────
  // ⚠️ «عشر» المفردة مقصودة الغياب — كلمة تعداد شائعة («عشر عمارات») بتحقن أرقام
  // وهمية وتكسر العشرات العامّية (مراجعة عدائية). صيغ الهاء المركّبة اتضافت تحت.
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
  // صيغ الهاء العامّية للعشرات المركّبة (Whisper بيكتب ه بدل ة) — عبارات كلمتين
  // فبتكسب على «عشرة»/الوحدة المفردة، وآمنة (مش كلمات ملاحظات).
  ["تلاته عشر", "13"], ["اربعه عشر", "14"], ["خمسه عشر", "15"],
  ["سته عشر", "16"], ["سبعه عشر", "17"], ["تمانيه عشر", "18"], ["ثمانيه عشر", "18"],
  ["تسعه عشر", "19"],
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
  ["وثمانية", "8"], ["وتمانية", "8"], ["وثمانيه", "8"], ["وتمانيه", "8"], ["وتمنيه", "8"],
  ["وسبعة",   "7"], ["وسبعه",   "7"], ["وسبع",   "7"],
  ["وستة",    "6"], ["وسته",    "6"], ["وست",    "6"],
  ["وخمسة",   "5"], ["وخمسه",   "5"], ["وخمس",   "5"],
  ["وأربعة",  "4"], ["واربعة",  "4"], ["واربعه",  "4"], ["وأربعه",  "4"], ["وربعه",  "4"], ["وأربع",  "4"],
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
  return text.replace(/[ً-ٰٟ]/g, "");
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

// ─── Letter-confusion self-learning ─────────────────────────────────────────
// A device/mic's speech recognizer tends to mishear the same letter the same
// way ("ص" heard as "س"). When the user corrects a plate in the review step,
// that's a ground-truth (heard → actual) signal worth remembering so the next
// dictation of the same letter is pre-corrected before the user ever sees it.

// Splits a plate into its letter units (respecting "هـ" as one unit) and its
// digit suffix — mirrors normalizePlate's letters/digits split.
function splitPlateUnits(plate: string): { letters: string[]; digits: string } {
  let i = 0;
  while (i < plate.length && !(plate.charCodeAt(i) >= 48 && plate.charCodeAt(i) <= 57)) i++;
  return { letters: extractLettersFromToken(plate.slice(0, i)), digits: plate.slice(i) };
}

// ─── Wanted-list phonetic anchor (تصحيح حرف الحلق بقائمة المطلوبين) ──────────
// أزواج الالتباس الصوتي اللي التفريغ بيلخبط فيها — كلها حروف لوحات صالحة، فمينفعش
// نصحّح أعمى. بس لو الأرقام مطابقة ولوحة في المطلوبين تفرق بحرف واحد بالظبط من
// زوج من دول → نرجّح إنها هي (المندوب بيدوّر عليها أصلاً). ح↔ه أشهر واحد.
const CONFUSION_CLASS: Record<string, string> = {
  "ح": "ح|ه", "ه": "ح|ه",
  "س": "س|ص", "ص": "س|ص",
  "ق": "ق|ك", "ك": "ق|ك",
  "د": "د|ط", "ط": "د|ط",
};
function isConfusablePair(a: string, b: string): boolean {
  return a !== b && CONFUSION_CLASS[a] !== undefined && CONFUSION_CLASS[a] === CONFUSION_CLASS[b];
}

/** يبني فهرس المطلوبين: آخر 4 أرقام → قائمة اللوحات المطبّعة اللي بتنتهي بيها. */
export function buildWantedIndex(wanted: Set<string> | Iterable<string>): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const raw of wanted) {
    const norm = normalizePlate(raw);
    const { digits } = splitPlateUnits(norm);
    if (digits.length !== 4) continue;
    const arr = idx.get(digits);
    if (arr) { if (!arr.includes(norm)) arr.push(norm); }
    else idx.set(digits, [norm]);
  }
  return idx;
}

export interface AnchorResult {
  plate: string;       // اللوحة بعد أي تصحيح (أو زي ما هي)
  original: string;    // اللوحة قبل التصحيح
  matched: boolean;    // في المطلوبين (تماماً أو بعد تصحيح)
  corrected: boolean;  // اتصحّحت بحرف التباس
  ambiguous: boolean;  // كذا مرشّح صالح → مفيش تصحيح تلقائي (يستاهل نظرة)
}

/**
 * يثبّت لوحة على قائمة المطلوبين لو التفريغ لخبط حرف حلق (ح↔ه، س↔ص، ق↔ك، د↔ط)
 * لكن الأرقام صح. exact يسبق التصحيح؛ التصحيح مشروط بـ: نفس الأرقام + نفس عدد
 * الحروف + فرق حرف واحد بالظبط من زوج التباس + مرشّح وحيد (وإلا يُعلَّم غموض ولا
 * يُصحَّح). عمره ما يخترع لوحة مش في القائمة.
 */
export function anchorPlateToWanted(candidate: string, index: Map<string, string[]>): AnchorResult {
  const norm = normalizePlate(candidate);
  const base: AnchorResult = { plate: norm, original: norm, matched: false, corrected: false, ambiguous: false };
  const { letters, digits } = splitPlateUnits(norm);
  const bucket = index.get(digits);
  if (!bucket || bucket.length === 0) return base;

  // exact match أولاً — مفيش داعي لأي تصحيح.
  if (bucket.includes(norm)) return { ...base, matched: true };

  // المرشّحون: نفس عدد الحروف + صفر اختلاف صعب + فرق حرف واحد التباس بالظبط.
  const autoCands: string[] = [];
  for (const w of bucket) {
    const wl = splitPlateUnits(w).letters;
    if (wl.length !== letters.length) continue;
    let confus = 0, hard = 0;
    for (let i = 0; i < letters.length; i++) {
      if (letters[i] === wl[i]) continue;
      if (isConfusablePair(letters[i], wl[i])) confus++;
      else hard++;
    }
    if (hard === 0 && confus === 1) autoCands.push(w);
  }

  if (autoCands.length === 1) return { plate: autoCands[0], original: norm, matched: true, corrected: true, ambiguous: false };
  if (autoCands.length > 1) return { ...base, ambiguous: true };
  return base;
}

export interface LetterCorrectionDiff { heard: string; corrected: string }

/**
 * Letter-level diff between what the recognizer produced and what the user
 * finally confirmed. Only trusted when the digit part and letter count match
 * exactly — otherwise this might be a different plate entirely, not a
 * mishearing of the same one, so no correction is inferred.
 */
export function diffLetterCorrections(extractedPlate: string, correctedPlate: string): LetterCorrectionDiff[] {
  const a = splitPlateUnits(extractedPlate);
  const b = splitPlateUnits(correctedPlate);
  if (a.digits !== b.digits || a.letters.length !== b.letters.length) return [];

  const diffs: LetterCorrectionDiff[] = [];
  for (let i = 0; i < a.letters.length; i++) {
    if (a.letters[i] !== b.letters[i]) diffs.push({ heard: a.letters[i], corrected: b.letters[i] });
  }
  return diffs;
}

// heard letter → (corrected letter → times seen)
export type LetterConfusionMap = Map<string, Map<string, number>>;

export function recordLetterCorrections(map: LetterConfusionMap, extractedPlate: string, correctedPlate: string): void {
  for (const { heard, corrected } of diffLetterCorrections(extractedPlate, correctedPlate)) {
    if (!map.has(heard)) map.set(heard, new Map());
    const inner = map.get(heard)!;
    inner.set(corrected, (inner.get(corrected) ?? 0) + 1);
  }
}

/**
 * Pre-corrects a freshly-extracted plate's letters using learned confusions.
 * A letter is only auto-corrected once its most common correction has been
 * seen `minCount`+ times AND makes up at least `minDominance` of all
 * corrections recorded for that letter — a single one-off correction, or a
 * letter that gets "corrected" inconsistently, is left alone.
 */
export function applyLetterConfusions(
  plate: string,
  map: LetterConfusionMap,
  minCount = 2,
  minDominance = 0.7,
): string {
  const { letters, digits } = splitPlateUnits(plate);
  const corrected = letters.map((l) => {
    const inner = map.get(l);
    if (!inner) return l;
    let best: string | null = null, bestCount = 0, total = 0;
    for (const [c, count] of inner) {
      total += count;
      if (count > bestCount) { bestCount = count; best = c; }
    }
    return best && bestCount >= minCount && bestCount / total >= minDominance ? best : l;
  });
  return corrected.join("") + digits;
}

export function serializeLetterConfusions(map: LetterConfusionMap): Record<string, Record<string, number>> {
  const obj: Record<string, Record<string, number>> = {};
  for (const [heard, inner] of map) obj[heard] = Object.fromEntries(inner);
  return obj;
}

export function deserializeLetterConfusions(
  obj: Record<string, Record<string, number>> | null | undefined,
): LetterConfusionMap {
  const map: LetterConfusionMap = new Map();
  if (!obj) return map;
  for (const [heard, inner] of Object.entries(obj)) map.set(heard, new Map(Object.entries(inner)));
  return map;
}

// ─── Whole-fragment ("word blend") self-learning ────────────────────────────
// LetterConfusionMap above only fits ONE letter drifting (ص heard as س) —
// diffing it position-by-position against a plate whose ENTIRE letter group
// was replaced by a different one (Whisper hearing "انر" as "راو") would
// teach 3 unrelated, individually-wrong single-letter rules. This learns
// "this exact raw fragment -> these exact corrected letters" as one unit
// instead, keyed on MultiPlateResult.rawLetterSource — which is only ever
// set on a letter-salvage or letter-overflow guess, never a confident
// extraction, so it never collides with the letter-confusion learner's inputs.
export type WordBlendMap = Map<string, Map<string, number>>;

export function recordWordBlend(map: WordBlendMap, rawSource: string, correctedLetters: string): void {
  if (!rawSource || !correctedLetters) return;
  if (!map.has(rawSource)) map.set(rawSource, new Map());
  const inner = map.get(rawSource)!;
  inner.set(correctedLetters, (inner.get(correctedLetters) ?? 0) + 1);
}

/**
 * Looks up a confidently-learned correction for a raw fragment. Same
 * minCount/minDominance safety threshold as applyLetterConfusions — a single
 * one-off correction, or one that gets "corrected" inconsistently, must not
 * start auto-applying.
 */
export function applyWordBlend(
  rawSource: string | undefined,
  map: WordBlendMap,
  minCount = 2,
  minDominance = 0.7,
): string | null {
  if (!rawSource) return null;
  const inner = map.get(rawSource);
  if (!inner) return null;
  let best: string | null = null, bestCount = 0, total = 0;
  for (const [letters, count] of inner) {
    total += count;
    if (count > bestCount) { bestCount = count; best = letters; }
  }
  return best && bestCount >= minCount && bestCount / total >= minDominance ? best : null;
}

export function serializeWordBlend(map: WordBlendMap): Record<string, Record<string, number>> {
  const obj: Record<string, Record<string, number>> = {};
  for (const [raw, inner] of map) obj[raw] = Object.fromEntries(inner);
  return obj;
}

export function deserializeWordBlend(
  obj: Record<string, Record<string, number>> | null | undefined,
): WordBlendMap {
  const map: WordBlendMap = new Map();
  if (!obj) return map;
  for (const [raw, inner] of Object.entries(obj)) map.set(raw, new Map(Object.entries(inner)));
  return map;
}

/**
 * يدمج خريطتي عدّات (heard → corrected → count) في خريطة جديدة بجمع العدّات —
 * للجمع بين تعلّم الجهاز المحلي والتعلّم المشترك من السيرفر. دالة نقية، مابتعدّلش
 * المدخلات. تشتغل على LetterConfusionMap و WordBlendMap (نفس الشكل).
 */
export function mergeCountMaps(
  a: Map<string, Map<string, number>>,
  b: Map<string, Map<string, number>>,
): Map<string, Map<string, number>> {
  const out: Map<string, Map<string, number>> = new Map();
  for (const src of [a, b]) {
    for (const [key, inner] of src) {
      if (!out.has(key)) out.set(key, new Map());
      const o = out.get(key)!;
      for (const [corrected, n] of inner) o.set(corrected, (o.get(corrected) ?? 0) + n);
    }
  }
  return out;
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
  // True when the plate didn't come from the primary clean token scan — either
  // a regex/char-extraction fallback was needed, or no letters were found at all.
  uncertain?: boolean;
}

// ─── Main parser ───────────────────────────────────────────────────────────

export function parsePlateFromTranscript(transcript: string): ParseResult {
  let text = transcript.trim();

  // 1. Remove diacritics
  text = removeDiacritics(text);

  // 1b. Punctuation → space. The Arabic comma "،" (U+060C) sits inside the
  // [؀-ۿ] block replaceAll's boundary lookaround guards on, so a number/letter
  // with a comma glued to it ("اثنين،") wouldn't convert. Clear punctuation
  // up front so every token is a clean word.
  text = text.replace(/[،؛؟۔.,;!?]/g, " ");
  text = text.replace(ZERO_WORD_RE, " 0 "); // زير/زيرو/زيرة/زيره… = arabized "zero"

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

  // 3c. Resolve ألف/الف ambiguity: when followed by و (number compound context)
  // treat as 1000, not the letter ا. Must run BEFORE LETTER_NAMES consumes "ألف".
  // Excludes the letter NAME واو/وا specifically — "دال ألف واو" (spelling
  // د-ا-و) must not have its ا eaten just because واو also starts with و.
  text = text.replace(/(?:ألف|الف)(?=\s+و)(?!\s+(?:واو|وا)(?:\s|$))/g, " 1000 ");

  // 3b. Normalize ى (alef maqsura) → ي — both are valid plate letters, treated as equivalent
  text = text.replace(/ى/g, "ي");

  // 4. Replace letter names
  text = replaceAll(text, LETTER_NAMES);

  // 5. Replace phonetic merges
  text = replaceAll(text, PHONETIC_MERGES);

  // 6. Replace spoken numbers (multi-word 10-90 sorted first, then 0-9)
  text = replaceAll(text, SPOKEN_NUMBERS);

  // 6b. Normalize any REMAINING bare ه → هـ (SR often omits the tatweel). This
  // MUST run AFTER the word maps above — running it earlier corrupted the letter
  // name "هاء" into "هـاء" (so it never matched LETTER_NAMES and the ه was
  // silently dropped), and mangled number words containing ه (سبعه/ميه…).
  // The (?!ـ) guard leaves an already-formed هـ untouched.
  text = text.replace(/ه(?!ـ)/g, "هـ");

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
  let uncertain = false;

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
    uncertain = letterBuf.length === 0;
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
        uncertain = true;
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
          uncertain = true;
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
      uncertain = true;
    }
  }

  // Zero-pad digit suffix to 4 (Saudi plates always have 4-digit numbers: حكل80 → حكل0080)
  if (plate) {
    plate = plate.replace(/(\d+)$/, (m) => m.padStart(4, "0"));
  }

  return { plate, vehicleType, notes, normalized, uncertain: uncertain || undefined };
}

// ─── Fuzzy matching helpers ────────────────────────────────────────────────

/**
 * يكتشف عمود اللوحة بناءً على المحتوى الفعلي للخلايا (لوحات سعودية فعلية)
 * مش اسم الهيدر. يفحص عينة من الصفوف لكل عمود ويحسب نسبة الخلايا اللي
 * شكلها لوحة سعودية صحيحة بعد التطبيع. العمود صاحب أعلى نسبة (وفوق حد أدنى)
 * يفوز. الأولوية لهذه الدالة قبل أي اعتماد على اسم العمود.
 */
export function detectPlateColumnByContent(
  headers: string[],
  rows: Record<string, string>[],
  sampleSize = 50,
  minRatio = 0.5,
): string | null {
  if (headers.length === 0 || rows.length === 0) return null;

  const sample = rows.slice(0, Math.min(sampleSize, rows.length));
  let bestCol: string | null = null;
  let bestRatio = 0;
  let bestNonEmpty = 0;

  for (const header of headers) {
    let plateLike = 0;
    let nonEmpty = 0;
    for (const row of sample) {
      const raw = String(row[header] ?? "").trim();
      if (!raw) continue;
      nonEmpty++;
      if (cellLooksLikePlate(raw)) plateLike++;
    }
    if (nonEmpty === 0) continue;
    const ratio = plateLike / nonEmpty;
    if (ratio > bestRatio || (ratio === bestRatio && nonEmpty > bestNonEmpty)) {
      bestRatio = ratio;
      bestCol = header;
      bestNonEmpty = nonEmpty;
    }
  }

  return bestRatio >= minRatio ? bestCol : null;
}

/**
 * فحص خفيف: هل الخلية شكلها لوحة سعودية بعد التطبيع؟
 * (1-3 أحرف عربي/إنجليزي + 1-4 أرقام، طول إجمالي معقول)
 */
function cellLooksLikePlate(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-_./]/g, "");
  if (cleaned.length < 2 || cleaned.length > 10) return false;

  const digitMatch = cleaned.match(/[0-9٠-٩]+/);
  if (!digitMatch) return false;
  // اللوحة السعودية = 3-4 أرقام. أكواد قصيرة زي «R8» (رقم واحد) مش لوحات — لو
  // سمحنا بيها، عمود تصنيف زي «Risk Grading» بقيمة R8 بيتحسب عمود لوحات ويكسب.
  if (digitMatch[0].length < 3 || digitMatch[0].length > 4) return false;

  const nonDigits = cleaned.replace(/[0-9٠-٩]/g, "");
  if (nonDigits.length === 0 || nonDigits.length > 3) return false;
  if (!/^[\u0600-\u06FFa-zA-Z]+$/.test(nonDigits)) return false;

  return true;
}

export function detectArabicPlateColumn(headers: string[]): string | null {
  for (const h of headers) {
    const lower = h.toLowerCase().trim();
    if (lower.includes("plate") && lower.includes("arabic")) return h;
    if (/لوح/.test(h)) return h;
  }
  return null;
}

export function detectPlateColumn(headers: string[], rows?: Record<string, string>[]): string | null {
  // الأولوية: اكتشاف بناءً على المحتوى الفعلي (يشتغل بغض النظر عن اسم العمود)
  if (rows && rows.length > 0) {
    // تمريرة قوية: عمود نصّه لوحات بوضوح (≥ 50%)
    const strong = detectPlateColumnByContent(headers, rows, 50, 0.5);
    if (strong) return strong;
  }

  // احتياطي باسم العمود قبل التمريرة الضعيفة — عمود اسمه فيه «لوحة/plate»
  // أوثق من عمود نسبته منخفضة.
  const keywords = ["لوحة", "اللوحة", "plate"];
  const matches = headers.filter((h) =>
    keywords.some((k) => h.toLowerCase().includes(k.toLowerCase()))
  );
  if (matches.length > 0) {
    const preferred = matches.find((h) => /عربي|arabic/i.test(h));
    return preferred ?? matches[0];
  }

  // تمريرة ضعيفة: مفيش اسم عمود واضح — خُد أعلى عمود لوحاتٍ حتى لو نسبته
  // متواضعة (عيّنة أكبر + عتبة أقل). عمود التواريخ/الأرقام نسبته 0 فمابيكسبش
  // أبداً، فده بيمنع الرجوع الخاطئ لأول عمود.
  if (rows && rows.length > 0) {
    const weak = detectPlateColumnByContent(headers, rows, 200, 0.12);
    if (weak) return weak;
  }

  return headers[0] ?? null;
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
  // اللوحة المطبّعة لصف الإحالة — بتتحسب وقت الفرز عشان تلوين المكرر والتصدير
  // يشتغلوا حتى لما الصف جاي من شيت إحالة إضافي بعمود لوحة مختلف عن الأساسي.
  refPlateNorm?: string;
}

// ─── دمج شيتات إحالة متعددة (صفحة الفرز) ────────────────────────────────
// المستخدم يقدر يرفع أكتر من شيت إحالة (إحالة ١، ٢، ٣...). كل شيت ليه عمود
// لوحته الخاص وممكن يكون عربي أو إنجليزي (بنك). الدوال دي بتوحّدهم في قائمة
// لوحات مطبّعة واحدة عشان الفرز يعاملهم كقائمة واحدة.
export interface ReferralSource {
  rows: Record<string, string>[];
  plateCol: string;
  isArabic: boolean; // true = عمود عربي (تطبيع مباشر)، false = عمود بنك إنجليزي
}

export interface ReferralEntry {
  norm: string;                    // اللوحة المطبّعة (المفتاح الموحّد)
  row: Record<string, string>;     // صف الإحالة الأصلي
  raw: string;                     // نص اللوحة الخام (قبل التطبيع)
  isArabic: boolean;               // مصدر الصف عربي ولا إنجليزي
}

/** يطبّع خلية لوحة إحالة حسب نوع عمودها (عربي مباشر / إنجليزي بنكي). */
export function normalizeReferralPlate(raw: string, isArabic: boolean): string {
  return isArabic ? normalizePlate(raw) : normalizePlate(bankPlateToArabic(raw));
}

// حروف اللوحات السعودية المعتمدة (بعد التطبيع) — 17 حرف.
const VALID_PLATE_LETTERS = new Set("ابحدرسصطعقكلمنهوي".split(""));

/**
 * هل اللوحة المطبّعة مكسورة الشكل وتحتاج مراجعة يدوية؟ بترجع true لو: فاضية،
 * أرقام بس (بدون حروف)، بدون أرقام، أكتر من 3 حروف (كلمات ما اتحولتش)، أكتر من
 * 4 أرقام، أو فيها حرف مش من حروف اللوحات المعتمدة. متسامحة مع 1-2 حرف و 1-3
 * أرقام عشان ماتعلّمش لوحات سليمة بالغلط. (بتدعم الأرقام العربية واللاتينية.)
 */
export function plateNeedsReview(normalized: string): boolean {
  if (!normalized) return true;
  const letters = normalized.replace(/[0-9٠-٩]/g, "");
  const digits = normalized.replace(/[^0-9٠-٩]/g, "");
  if (letters.length === 0 || digits.length === 0) return true;
  if (letters.length > 3 || digits.length > 4) return true;
  for (const ch of letters) if (!VALID_PLATE_LETTERS.has(ch)) return true;
  return false;
}

/**
 * يدمج عدة شيتات إحالة في قائمة واحدة مطبّعة ومزالة التكرار (أول ظهور يكسب).
 * الخلايا الفارغة تُتخطى. الترتيب يحافظ على ترتيب الشيتات ثم الصفوف.
 */
export function collectReferralEntries(sources: ReferralSource[]): ReferralEntry[] {
  const seen = new Set<string>();
  const out: ReferralEntry[] = [];
  for (const src of sources) {
    for (const row of src.rows) {
      const raw = String(row[src.plateCol] ?? "");
      const norm = normalizeReferralPlate(raw, src.isArabic);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      out.push({ norm, row, raw, isArabic: src.isArabic });
    }
  }
  return out;
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

export interface TokenMatch {
  converted: string;
  row: Record<string, string>;
  dataIdx: number;
  status: "exact" | "fuzzy";
  similarity?: number;
}

// Matches free-typed/pasted plate tokens against a data file — the reverse
// direction of matchDataAgainstReferral (there, each DATA row looks up a
// referral index; here, each TOKEN looks up a data index). Kept as its own
// function rather than reusing buildReferralIndex's single-row-per-key exact
// map, because a token can legitimately match MULTIPLE data rows (the same
// plate spotted more than once in the field) and all of them must surface.
export function matchTokensAgainstRows(
  tokens: string[],
  dataRows: Record<string, string>[],
  dataPlateCol: string,
  fuzzyThreshold = 88,
): TokenMatch[] {
  const exactMap = new Map<string, Array<{ row: Record<string, string>; dataIdx: number }>>();
  const byFirstChar = new Map<string, Array<{ norm: string; row: Record<string, string>; dataIdx: number }>>();
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const norm = normalizePlate(bankPlateToArabic(String(row[dataPlateCol] ?? "")));
    if (!norm) continue;
    const arr = exactMap.get(norm);
    if (arr) arr.push({ row, dataIdx: i });
    else exactMap.set(norm, [{ row, dataIdx: i }]);
    const key = norm[0];
    if (!byFirstChar.has(key)) byFirstChar.set(key, []);
    byFirstChar.get(key)!.push({ norm, row, dataIdx: i });
  }

  const results: TokenMatch[] = [];
  for (const token of tokens) {
    const converted = bankPlateToArabic(token);
    const norm = normalizePlate(converted);
    if (!norm) continue;

    const exactEntries = exactMap.get(norm);
    if (exactEntries) {
      for (const { row, dataIdx } of exactEntries) {
        results.push({ converted, row, dataIdx, status: "exact" });
      }
      continue;
    }

    if (exactMap.size > 50_000) continue;

    let best: { row: Record<string, string>; dataIdx: number; sim: number } | null = null;
    const candidates = byFirstChar.get(norm[0]) ?? [];
    for (const { norm: rowNorm, row, dataIdx } of candidates) {
      if (Math.abs(rowNorm.length - norm.length) > 1) continue;
      const sim = similarityPercent(norm, rowNorm);
      if (sim >= fuzzyThreshold && (!best || sim > best.sim)) best = { row, dataIdx, sim };
    }
    if (best) results.push({ converted, row: best.row, dataIdx: best.dataIdx, status: "fuzzy", similarity: best.sim });
  }
  return results;
}

// Splits free-typed/pasted plate text into one token per plate — for
// matchTokensAgainstRows above. Real pasted lists mix two shapes: a plate
// already glued together ("سبق5765"), and a plate spelled with a space
// between EACH letter ("س ب ق 5765", sometimes with the last letter run
// straight into the digits: "س ب ق5765"). Splitting on whitespace alone (the
// previous approach) explodes the second shape into meaningless single-letter
// and bare-digit fragments that match nothing. Newlines/commas are always
// hard plate boundaries; a run of short (<=3 char) bare-letter chunks is held
// as "pending" until the next digit run (or a letter+digit chunk) completes
// it into one plate — so both shapes end up as one correct token each.
export function tokenizePastedPlates(text: string): string[] {
  const tokens: string[] = [];
  const letterDigitGlued = /^([A-Za-z؀-ۿ]{1,3})(\d+)$/;
  for (const line of text.split(/[\n\r]+/)) {
    for (const segment of line.split(/[,،]+/)) {
      let pendingLetters = "";
      for (const chunk of segment.split(/\s+/).map((c) => c.trim()).filter(Boolean)) {
        const isPureLetters = chunk.length <= 3 && /^[A-Za-z؀-ۿ]+$/.test(chunk);
        const isPureDigits = /^\d+$/.test(chunk);
        const glued = chunk.match(letterDigitGlued);
        if (isPureLetters) {
          pendingLetters += chunk;
        } else if (isPureDigits) {
          tokens.push(pendingLetters + chunk);
          pendingLetters = "";
        } else if (glued) {
          tokens.push(pendingLetters + glued[1] + glued[2]);
          pendingLetters = "";
        } else {
          if (pendingLetters) { tokens.push(pendingLetters); pendingLetters = ""; }
          tokens.push(chunk);
        }
      }
      if (pendingLetters) tokens.push(pendingLetters);
    }
  }
  return tokens.filter(Boolean);
}
