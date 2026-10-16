/**
 * ==========================================================================
 *  parseSaudiPlates — المحرك المركزي لاستخراج اللوحات من الكلام المفرغ
 * ==========================================================================
 *
 *  ليه آلة حالة (State Machine) ومش Regex؟
 *  ─────────────────────────────────────────
 *  الـ Regex بيفشل في تلات حالات حقيقية بتحصل كل يوم:
 *
 *   ١. الالتباس: «ألف» يا رقم ١٠٠٠ يا حرف الألف — والفرق بالموقع مش بالشكل.
 *   ٢. الحشو: «لا» و «يا» و «ما» أسماء حروف وكذلك كلام عادي.
 *      Regex هيطلّع لوحات وهمية من أي جملة فيها «لا والله».
 *   ٣. السرد السريع: «أ ب ح ١٢٣٤ س ص ط ٥٦٧٨» بدون فاصل — لازم نعرف
 *      إن ظهور حرف بعد الأرقام معناه إن اللوحة خلصت واللي بعدها بدأت.
 *
 *  آلة الحالة بتحل التلاتة طبيعياً: كل علامة بتتفسّر حسب مكانها في اللوحة.
 *
 *  الحالات:
 *    IDLE    → مستني أول حرف
 *    LETTERS → بيجمّع الحروف
 *    DIGITS  → بيجمّع الأرقام (وأي حرف هنا معناه لوحة جديدة)
 *
 *  المخرجات: لوحات مرتّبة بلا تداخل، كل واحدة بأعلامها (Flags) وبدائلها
 *  وتوقيتها في الصوت — والتوقيت هو اللي بيخلّي المراجعة الصوتية ممكنة.
 */

import {
  letterFromName,
  isPlateLetter,
  displayLetters,
} from "./plateAlphabet";
import {
  numberTokenValue,
  parseNumberGroup,
  isNumberConnector,
} from "./arabicNumbers";
import { lookupKey, splitWords, toWesternDigits } from "./textNormalize";

/* ============================================================== الأنواع */

/** كلمة جاية من محرك الصوت، ومعاها توقيتها لو متاح */
export interface SourceWord {
  word: string;
  /** ثانية البداية في المقطع الصوتي */
  start?: number;
  /** ثانية النهاية */
  end?: number;
}

export type PlateFlag =
  /** الحروف أكتر من ٣ — أخدنا آخر ٣ */
  | "extra-letters"
  /** الحروف أقل من ٣ */
  | "few-letters"
  /** الأرقام أكتر من ٤ — أخدنا أول ٤ */
  | "extra-digits"
  /** الأرقام أقل من ٤ */
  | "few-digits"
  /** فيه حرف مستحيل يكون على لوحة سعودية (يتصحّح في مرحلة المراجعة) */
  | "impossible-letter";

export interface PlateCandidate {
  /** الترتيب في السرد، بيبدأ من ١ */
  order: number;
  /** الحروف بعد الاختيار (٣ حروف في الحالة السليمة) */
  letters: string[];
  /** كل الحروف اللي سمعناها فعلاً — بيفيد المراجعة */
  heardLetters: string[];
  /** الأرقام كنص */
  digits: string;
  /** اللوحة مطبّعة للمطابقة: «ابح1234» */
  plate: string;
  /** اللوحة للعرض: «أ ب حـ 1234» */
  display: string;
  /** الكلام الأصلي اللي طلعت منه اللوحة */
  raw: string;
  /** ثانية بداية اللوحة في الصوت (لو التوقيتات متاحة) */
  timeStart?: number;
  /** ثانية نهاية اللوحة في الصوت */
  timeEnd?: number;
  /** ملاحظات على الشكل — بتغذّي حساب الثقة في مرحلة المراجعة */
  flags: PlateFlag[];
  /** لوحات بديلة معقولة، المندوب يبدّل لأي واحدة بضغطة */
  alternatives: string[];
}

/* ======================================================= كلمات الحشو */

/** كلمات المندوب بيقولها حول اللوحة ومالهاش معنى في التحليل */
const FILLER_WORDS = new Set(
  [
    "لوحة",
    "اللوحة",
    "لوحه",
    "اللوحه",
    "نمرة",
    "النمرة",
    "نمره",
    "رقم",
    "الرقم",
    "تشييك",
    "تشيك",
    "سيارة",
    "السيارة",
    "عربية",
    "العربية",
    "موتوسيكل",
    "دباب",
    "بعدين",
    "ثم",
    "كمان",
    "تاني",
    "التالي",
    "التالية",
    "الجاية",
    "أيوة",
    "أيوه",
    "تمام",
    "طيب",
    "خلاص",
    "يلا",
    "شوف",
    "اكتب",
    "سجل",
    "التالى",
    "ياللا",
    "أوك",
  ].map(lookupKey)
);

/**
 * كلمات عربية عادية مكوّنة من ٣ حروف كلها موجودة على اللوحة.
 * لازم نستثنيها من «تفكيك الكلمة الملزوقة» عشان ما نطلّعش لوحة وهمية
 * من جملة زي «الدور 3» أو «اللون 2».
 */
const GLUED_STOP_WORDS = new Set(
  [
    "دور",
    "لون",
    "مال",
    "حال",
    "عدد",
    "سعر",
    "سكن",
    "طول",
    "عرض",
    "كود",
    "رمز",
    "سنه",
    "هنا",
    "هلا",
    "كان",
    "مين",
    "وين",
    "كام",
    "على",
    "الى",
    "ولا",
    "بلا",
    "نمر",
    "كله",
    "دهم",
    "معه",
    "منه",
    "عند",
    "بعد",
    "قبل",
    "كده",
    "علي",
    "الا",
    "اما",
    "لما",
    "دلع",
    "حكم",
    "علم",
    "ملك",
    "عمل",
    "بلد",
    "سلم",
    "قلم",
    "كلم",
  ].map(lookupKey)
);

/* ========================================================== التصنيف */

type TokKind = "letter" | "num" | "alf" | "waw" | "filler" | "other";

interface Tok {
  kind: TokKind;
  /** الكلمة كما وصلت (للمجموعات الرقمية بنمرّرها لمحرك الأرقام) */
  word: string;
  /** الحرف الناتج (لو kind = letter) */
  letter?: string;
  /** رقم الكلمة في المصدر — بنجمّع بيه النص الأصلي */
  srcIndex: number;
  start?: number;
  end?: number;
}

/** لوحة ملزوقة في كلمة واحدة: «ابح1234» أو «1234ابح» */
const GLUED_PLATE_LETTERS_FIRST = /^([ء-ي]{2,4})(\d{1,5})$/;
const GLUED_PLATE_DIGITS_FIRST = /^(\d{1,5})([ء-ي]{2,4})$/;

/** ٣ حروف ملزوقة كلها من حروف اللوحة: «ابح» */
const THREE_PLATE_LETTERS = /^[ء-ي]{3}$/;

/**
 * يحوّل كلمات المصدر لعلامات مصنّفة.
 * كلمة واحدة ممكن تتفكّك لأكتر من علامة (زي «وسبعمية» → «و» + «سبعمية»).
 */
function classify(words: SourceWord[]): Tok[] {
  const out: Tok[] = [];

  const push = (t: Omit<Tok, "srcIndex">, srcIndex: number) => {
    out.push({ ...t, srcIndex });
  };

  for (let i = 0; i < words.length; i++) {
    const src = words[i];
    const time = { start: src.start, end: src.end };
    const cleaned = toWesternDigits(String(src.word)).trim();
    if (!cleaned) continue;

    const key = lookupKey(cleaned);
    if (!key) continue;

    // ── ١. حشو (الأول عشان «رقم» ما تتفككش لحروف)
    if (FILLER_WORDS.has(key)) {
      push({ kind: "filler", word: cleaned, ...time }, i);
      continue;
    }

    // ── ٢. رقم مكتوب رقمياً
    if (/^\d+$/.test(cleaned)) {
      push({ kind: "num", word: cleaned, ...time }, i);
      continue;
    }

    // ── ٣. لوحة ملزوقة في كلمة واحدة
    const gluedLettersFirst = cleaned.match(GLUED_PLATE_LETTERS_FIRST);
    if (gluedLettersFirst) {
      for (const ch of gluedLettersFirst[1]) {
        const l = letterFromName(ch);
        if (l) push({ kind: "letter", word: ch, letter: l, ...time }, i);
      }
      push({ kind: "num", word: gluedLettersFirst[2], ...time }, i);
      continue;
    }
    const gluedDigitsFirst = cleaned.match(GLUED_PLATE_DIGITS_FIRST);
    if (gluedDigitsFirst) {
      for (const ch of gluedDigitsFirst[2]) {
        const l = letterFromName(ch);
        if (l) push({ kind: "letter", word: ch, letter: l, ...time }, i);
      }
      push({ kind: "num", word: gluedDigitsFirst[1], ...time }, i);
      continue;
    }

    // ── ٤. واو مفردة — معناها بيتحدد من الحالة (عطف / حرف / فاصل)
    if (key === "و") {
      push({ kind: "waw", word: cleaned, ...time }, i);
      continue;
    }

    // ── ٥. رقم منطوق
    const num = numberTokenValue(cleaned);
    if (num) {
      push(
        {
          kind: num.ambiguousWithLetter ? "alf" : "num",
          word: cleaned,
          ...time,
        },
        i
      );
      continue;
    }

    // ── ٦. اسم حرف
    const letter = letterFromName(cleaned);
    if (letter) {
      push({ kind: "letter", word: cleaned, letter, ...time }, i);
      continue;
    }

    // ── ٧. ٣ حروف لوحة ملزوقة والكلمة اللي بعدها أرقام
    //     («ابح» قبل «1234») — إشارة قوية، بس بنستثني الكلمات العادية
    if (
      THREE_PLATE_LETTERS.test(cleaned) &&
      !GLUED_STOP_WORDS.has(key) &&
      [...cleaned].every((ch) => isPlateLetter(letterFromName(ch) ?? ch)) &&
      nextIsNumeric(words, i)
    ) {
      for (const ch of cleaned) {
        const l = letterFromName(ch);
        if (l) push({ kind: "letter", word: ch, letter: l, ...time }, i);
      }
      continue;
    }

    // ── ٨. كلمة بتبدأ بواو العطف: «وسبعمية» → «و» + «سبعمية»
    if (cleaned.length > 1 && cleaned.startsWith("و")) {
      const rest = cleaned.slice(1);
      const restNum = numberTokenValue(rest);
      const restLetter = letterFromName(rest);
      if (restNum || restLetter) {
        push({ kind: "waw", word: "و", ...time }, i);
        if (restNum) {
          push(
            {
              kind: restNum.ambiguousWithLetter ? "alf" : "num",
              word: rest,
              ...time,
            },
            i
          );
        } else if (restLetter) {
          push({ kind: "letter", word: rest, letter: restLetter, ...time }, i);
        }
        continue;
      }
    }

    // ── ٩. مش أي حاجة من دي → كلمة عادية بتكسر اللوحة
    push({ kind: "other", word: cleaned, ...time }, i);
  }

  return out;
}

/** هل الكلمة اللي بعد الموقع ده رقم؟ (لتأكيد الحروف الملزوقة) */
function nextIsNumeric(words: SourceWord[], i: number): boolean {
  for (let j = i + 1; j < words.length; j++) {
    const w = toWesternDigits(String(words[j].word)).trim();
    const key = lookupKey(w);
    if (!key) continue;
    if (FILLER_WORDS.has(key)) continue;
    if (/^\d+$/.test(w)) return true;
    return numberTokenValue(w) !== null;
  }
  return false;
}

/* ==================================================== آلة الحالة */

/** أقصى عدد حروف نجمّعه قبل ما نبدأ نرمي الأقدم (حماية من التسلسل الطويل) */
const MAX_COLLECTED_LETTERS = 6;

/** كم كلمة حشو متتالية تعتبر «نهاية اللوحة» */
const FILLER_BREAK = 3;

export interface ParseOptions {
  /**
   * أقصى عدد أرقام مقبول (٤ على اللوحة السعودية).
   * سيبناها قابلة للتعديل لو احتجنا نجرّب لوحات مختلفة.
   */
  maxDigits?: number;
  /** أقل عدد حروف يخلّينا نعتبرها لوحة (٢ عشان ما نضيّعش لوحة ناقصة حرف) */
  minLetters?: number;
}

/**
 * الدالة المركزية. بتقبل:
 *   - نص كامل (من Whisper أو Deepgram)
 *   - أو قائمة كلمات بتوقيتاتها (بيخلّي المراجعة الصوتية ممكنة)
 */
export function parseSaudiPlates(
  input: string | SourceWord[],
  options: ParseOptions = {}
): PlateCandidate[] {
  const maxDigits = options.maxDigits ?? 4;
  const minLetters = options.minLetters ?? 2;

  const sourceWords: SourceWord[] = Array.isArray(input)
    ? input
    : splitWords(input).map((w) => ({ word: w.word }));

  const rawWords = sourceWords.map((w) => String(w.word));
  const toks = classify(sourceWords);

  const results: PlateCandidate[] = [];

  type State = "IDLE" | "LETTERS" | "DIGITS";
  let state: State = "IDLE";
  let letters: string[] = [];
  let digits = "";
  let firstSrc = -1;
  let lastSrc = -1;
  let firstTime: number | undefined;
  let lastTime: number | undefined;
  let fillerRun = 0;

  const reset = () => {
    state = "IDLE";
    letters = [];
    digits = "";
    firstSrc = -1;
    lastSrc = -1;
    firstTime = undefined;
    lastTime = undefined;
    fillerRun = 0;
  };

  const touch = (t: Tok) => {
    if (firstSrc === -1) firstSrc = t.srcIndex;
    lastSrc = t.srcIndex;
    if (t.start !== undefined && firstTime === undefined) firstTime = t.start;
    if (t.end !== undefined) lastTime = t.end;
  };

  const emit = () => {
    if (letters.length < minLetters || digits.length < 1) {
      reset();
      return;
    }

    const flags: PlateFlag[] = [];
    const alternatives: string[] = [];

    // ── الأرقام
    let chosenDigits = digits;
    if (digits.length > maxDigits) {
      chosenDigits = digits.slice(0, maxDigits);
      flags.push("extra-digits");
    } else if (digits.length < maxDigits) {
      flags.push("few-digits");
    }

    // ── الحروف
    let chosenLetters = letters.slice();
    if (letters.length > 3) {
      // آخر ٣ هو الترشيح الأقوى: الزيادة عادةً كلمة قبل اللوحة
      // زي «يا» النداء اللي اتقرأت حرف ياء.
      chosenLetters = letters.slice(-3);
      flags.push("extra-letters");
      alternatives.push(letters.slice(0, 3).join("") + chosenDigits);
    } else if (letters.length < 3) {
      flags.push("few-letters");
    }

    // بديل للأرقام الزايدة: آخر ٤ بدل أول ٤
    if (digits.length > maxDigits) {
      alternatives.push(chosenLetters.join("") + digits.slice(-maxDigits));
    }

    if (chosenLetters.some((ch) => !isPlateLetter(ch))) {
      flags.push("impossible-letter");
    }

    const raw = rawWords
      .slice(Math.max(0, firstSrc), lastSrc + 1)
      .join(" ")
      .trim();

    results.push({
      order: results.length + 1,
      letters: chosenLetters,
      heardLetters: letters.slice(),
      digits: chosenDigits,
      plate: chosenLetters.join("") + chosenDigits,
      display: `${displayLetters(chosenLetters)} ${chosenDigits}`,
      raw,
      timeStart: firstTime,
      timeEnd: lastTime,
      flags,
      alternatives: [...new Set(alternatives)],
    });

    reset();
  };

  /**
   * يبلع مجموعة الأرقام المتتالية كاملة ويرجّع الأرقام كنص.
   * بياخد روابط العطف اللي جوّه العدد («خمسة وعشرين») ويوقف عند
   * أي حاجة تانية.
   */
  const consumeNumberRun = (startIdx: number): { digits: string; next: number } => {
    const words: string[] = [];
    let i = startIdx;

    while (i < toks.length) {
      const t = toks[i];

      if (t.kind === "num" || t.kind === "alf") {
        words.push(t.word);
        touch(t);
        i++;
        continue;
      }

      // «و» بين رقمين = رابط جوّه العدد، مش نهاية
      if (t.kind === "waw") {
        const nxt = toks[i + 1];
        if (nxt && (nxt.kind === "num" || nxt.kind === "alf")) {
          touch(t);
          i++;
          continue;
        }
      }

      break;
    }

    return { digits: parseNumberGroup(words).digits, next: i };
  };

  /** يبدأ لوحة جديدة بالحرف ده */
  const startLetters = (t: Tok) => {
    letters = [t.letter!];
    digits = "";
    firstSrc = t.srcIndex;
    lastSrc = t.srcIndex;
    firstTime = t.start;
    lastTime = t.end;
    fillerRun = 0;
    state = "LETTERS";
  };

  const addLetter = (t: Tok) => {
    letters.push(t.letter!);
    if (letters.length > MAX_COLLECTED_LETTERS) letters.shift();
    touch(t);
    fillerRun = 0;
  };

  let i = 0;
  while (i < toks.length) {
    const t = toks[i];

    /* ------------------------------------------------------------- IDLE */
    if (state === "IDLE") {
      if (t.kind === "letter") {
        startLetters(t);
        i++;
        continue;
      }
      if (t.kind === "alf") {
        // في بداية اللوحة «ألف» = حرف الألف
        startLetters({ ...t, kind: "letter", letter: "ا" });
        i++;
        continue;
      }
      if (t.kind === "num") {
        // أرقام بلا حروف قبلها — نبلعها كلها ونكمّل
        i = consumeNumberRun(i).next;
        reset();
        continue;
      }
      // waw / filler / other → نتجاهل
      i++;
      continue;
    }

    /* ----------------------------------------------------------- DIGITS */
    if (state === "DIGITS") {
      if (t.kind === "num" || t.kind === "alf") {
        const run = consumeNumberRun(i);
        digits += run.digits;
        i = run.next;
        continue;
      }

      if (t.kind === "letter") {
        // حرف بعد الأرقام = اللوحة خلصت واللي بعدها بدأت (السرد السريع)
        emit();
        startLetters(t);
        i++;
        continue;
      }

      if (t.kind === "waw") {
        // «و» بعد أرقام كاملة = عطف بين لوحتين
        emit();
        i++;
        continue;
      }

      if (t.kind === "filler") {
        fillerRun++;
        touch(t);
        if (fillerRun >= FILLER_BREAK) emit();
        i++;
        continue;
      }

      // كلمة عادية → اللوحة خلصت
      emit();
      i++;
      continue;
    }

    /* ---------------------------------------------------------- LETTERS */
    // مافيش حالة رابعة — لو مش IDLE ومش DIGITS فإحنا بنجمّع حروف
    if (t.kind === "letter") {
      addLetter(t);
      i++;
      continue;
    }

    if (t.kind === "alf") {
      if (letters.length < 3) {
        // لسه في خانة الحروف → «ألف» حرف
        addLetter({ ...t, kind: "letter", letter: "ا" });
        i++;
        continue;
      }
      // الحروف كملت ٣ → «ألف» رقم ١٠٠٠
      const run = consumeNumberRun(i);
      digits += run.digits;
      state = "DIGITS";
      i = run.next;
      continue;
    }

    if (t.kind === "waw") {
      // جوّه تهجئة اللوحة الواو حرف، بعد ما الحروف تكمل بتكون عطف
      if (letters.length < 3) {
        addLetter({ ...t, kind: "letter", letter: "و" });
      } else {
        touch(t);
      }
      i++;
      continue;
    }

    if (t.kind === "num") {
      const run = consumeNumberRun(i);
      digits += run.digits;
      state = "DIGITS";
      i = run.next;
      continue;
    }

    if (t.kind === "filler") {
      fillerRun++;
      if (fillerRun >= FILLER_BREAK) reset();
      i++;
      continue;
    }

    // كلمة عادية → اللوحة اتكسرت
    reset();
    i++;
  }

  // آخر الكلام — emit() بنفسه بيتأكد إن فيه لوحة صالحة قبل ما يضيفها،
  // فنداءها بلا شرط آمن ومافيهوش تكرار.
  emit();

  // إعادة ترقيم مضمونة
  return results.map((r, idx) => ({ ...r, order: idx + 1 }));
}
