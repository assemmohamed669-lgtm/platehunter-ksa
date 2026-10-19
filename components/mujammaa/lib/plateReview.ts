/**
 * ==========================================================================
 *  نظام المراجعة والتصحيح — الطريق لصفر أخطاء
 * ==========================================================================
 *
 *  التفريغ الصوتي مهما كان محرّكه بيغلط. الفكرة إننا ما نعتمدش على المحرك
 *  لوحده، لكن نمرّر كل لوحة على أربع طبقات تصحيح متتالية، كل طبقة أقوى
 *  من اللي قبلها في نوع الخطأ اللي بتمسكه:
 *
 *  ┌─ الطبقة ١: الحصر القسري (فورية، بلا تكلفة) ─────────────────────────┐
 *  │ اللوحة السعودية فيها ١٧ حرف بس. أي حرف تاني = خطأ مؤكّد ١٠٠٪.       │
 *  │ فبنصحّحه لأقرب حرف معتمد صوتياً: «ت»→«ط» ، «ج»→«ح» ، «ف»→«ق».      │
 *  │ دي بتمسك أكتر خطأ شائع في تفريغ العربي وبتحلّه بلا أي تخمين.        │
 *  └─────────────────────────────────────────────────────────────────────┘
 *  ┌─ الطبقة ٢: فحص الشكل (فورية) ────────────────────────────────────────┐
 *  │ ٣ حروف + ٤ أرقام. أي نقص أو زيادة = علم يقلّل الثقة ويطلب مراجعة.  │
 *  └─────────────────────────────────────────────────────────────────────┘
 *  ┌─ الطبقة ٣: توجيه بالمفردات المقفولة (فورية) ─────────────────────────┐
 *  │ شيت البنك = قائمة اللوحات الممكنة عملياً. لو اللوحة المشكوك فيها     │
 *  │ تفرق حرف واحد عن لوحة **واحدة** في الشيت → نصحّحها عليها.           │
 *  │ الشرط «واحدة بس» بيمنعنا من التخمين لما يكون فيه أكتر من احتمال.    │
 *  └─────────────────────────────────────────────────────────────────────┘
 *  ┌─ الطبقة ٤: المراجعة الصوتية (ثواني، بتكلفة نداء صغير) ───────────────┐
 *  │ لو الثقة لسه أقل من الحد: بنقطع **الجزء بتاع اللوحة دي بس** من      │
 *  │ الصوت (بتوقيتات الكلمات) ونبعته تاني برأي ثاني. مقطع ثانيتين        │
 *  │ بيرجع في أقل من ثانية، فالمراجعة بتحصل في ثواني مش دقايق.          │
 *  │ لو الرأيين اتفقوا → الثقة تعلى. لو اختلفوا → نختار الأسلم ونعلّم.    │
 *  └─────────────────────────────────────────────────────────────────────┘
 */

import type { PlateCandidate, PlateFlag, SourceWord } from "./parseSaudiPlates";
import { parseSaudiPlates } from "./parseSaudiPlates";
import {
  snapToPlateLetter,
  isPlateLetter,
  displayLetters,
} from "./plateAlphabet";
import {
  findNearestInVocabulary,
  isWellFormedPlate,
} from "./plateMatch";
import { isPinMark } from "./platePin";

/* ============================================================== الأنواع */

export type ReviewStatus =
  /** سليمة — نمشي بيها */
  | "solid"
  /** محتاجة نظرة — الشكل ناقص أو فيه تصحيح */
  | "review"
  /** ضعيفة — الأغلب غلط */
  | "weak";

export interface Correction {
  from: string;
  to: string;
  /** سبب التصحيح بالعربي — بيظهر للمندوب */
  reason: string;
}

export interface AudioReviewResult {
  /** الرأي التاني اتفق مع الأول؟ */
  agreed: boolean;
  /** اللوحة اللي طلعت من الرأي التاني */
  secondOpinion: string | null;
  /** اسم المحرك اللي عمل المراجعة */
  engine: string;
}

export interface ReviewedPlate {
  order: number;
  letters: string[];
  digits: string;
  /** اللوحة النهائية بعد كل التصحيحات */
  plate: string;
  /** للعرض: «أ ب حـ 1234» */
  display: string;
  /** اللوحة قبل أي تصحيح — بيفضل محفوظ للشفافية */
  heardPlate: string;
  heardLetters: string[];
  raw: string;
  timeStart?: number;
  timeEnd?: number;
  flags: PlateFlag[];
  alternatives: string[];
  /** ثقة ٠-١٠٠ */
  confidence: number;
  status: ReviewStatus;
  /** ملاحظات بالعربي للعرض في الواجهة */
  notes: string[];
  corrections: Correction[];
  /** الطبقة الرابعة مطلوبة؟ */
  needsAudioReview: boolean;
  audioReview?: AudioReviewResult;
  /**
   * 🔴 **ثقة الإجماع الخام (٠..١)** — `review.confidence` **مقسّمة لدرجات**
   * (أخضر ٩٥ / أصفر ٧٠)، فبطاقتين من نفس الدرجة بيتعادلوا وفيصل التوأم
   * بيرجع لترتيب الوصول. والملف `collapseTwinCards` محذّر من ده بالحرف:
   * «الترتيب مش دليل — الثقة دليل».
   *
   * مقيس في جلستين للمالك: `حلن5123` كسبت `حلن5191`، و`حهق4060` كسبت
   * `حهق4079` — الاتنين لأن الغلط وصل الأول.
   */
  rawConf?: number;
  /** المندوب عدّلها بإيده — بلا مراجعة تانية */
  manuallyEdited?: boolean;
}

/* ========================================================== الإعدادات */

/** خصم الثقة لكل نوع مشكلة */
const PENALTY = {
  /** حرف مستحيل اتصحّح قسرياً */
  snappedLetter: 16,
  /** حرف مش معروف خالص ما قدرناش نصحّحه */
  unknownLetter: 30,
  fewLetters: 34,
  extraLetters: 18,
  fewDigits: 24,
  extraDigits: 18,
} as const;

/** حدود تصنيف الحالة */
const SOLID_AT = 90;
const WEAK_UNDER = 55;

/** أقل من كده = ابعت للمراجعة الصوتية */
export const AUDIO_REVIEW_THRESHOLD = 90;

/** الثقة بعد اتفاق رأيين مستقلين على نفس اللوحة */
const AGREED_CONFIDENCE = 97;

/** الثقة بعد تصحيح موجّه من شيت البنك */
const VOCAB_GUIDED_CONFIDENCE = 92;

/** الثقة لو اللوحة موجودة نصاً في شيت البنك */
const VOCAB_EXACT_CONFIDENCE = 99;

export interface ReviewOptions {
  /**
   * مفردات مقفولة (لوحات شيت البنك مطبّعة).
   * لو موجودة، بنستخدمها في الطبقة التالتة.
   */
  vocabulary?: Iterable<string>;
  /** حد إرسال المراجعة الصوتية */
  audioReviewThreshold?: number;
}

/* ================================================= الطبقة ١ + ٢ + ٣ */

/**
 * يمرّر كل حروف لوحة على الحصر القسري.
 * «جبك5212» → «حبك5212»
 */
function snapPlateString(plate: string): string {
  return [...plate]
    .map((ch) => (/[ء-ي]/.test(ch) ? snapToPlateLetter(ch).letter : ch))
    .join("");
}

function statusOf(confidence: number): ReviewStatus {
  if (confidence >= SOLID_AT) return "solid";
  if (confidence < WEAK_UNDER) return "weak";
  return "review";
}

const FLAG_NOTES: Record<PlateFlag, string> = {
  "extra-letters": "سمعنا حروف أكتر من ٣ — أخدنا آخر تلاتة",
  "few-letters": "الحروف أقل من ٣",
  "extra-digits": "سمعنا أرقام أكتر من ٤ — أخدنا أول أربعة",
  "few-digits": "الأرقام أقل من ٤",
  "impossible-letter": "فيه حرف مش موجود على اللوحات السعودية",
};

/**
 * يراجع لوحة واحدة ويرجّعها مصحّحة بثقة محسوبة.
 * الطبقات ١-٣ كلها هنا وكلها فورية (بلا أي نداء شبكة).
 */
export function reviewPlate(
  candidate: PlateCandidate,
  options: ReviewOptions = {}
): ReviewedPlate {
  const threshold = options.audioReviewThreshold ?? AUDIO_REVIEW_THRESHOLD;

  const corrections: Correction[] = [];
  const notes: string[] = [];
  let confidence = 100;

  /* ── الطبقة ١: الحصر القسري على الـ١٧ حرف ───────────────────────── */
  const fixedLetters: string[] = [];

  for (const ch of candidate.letters) {
    if (isPlateLetter(ch)) {
      fixedLetters.push(ch);
      continue;
    }

    const snap = snapToPlateLetter(ch);
    if (snap.changed) {
      fixedLetters.push(snap.letter);
      corrections.push({
        from: ch,
        to: snap.letter,
        reason: `«${ch}» مش موجود على اللوحات السعودية — أقرب حرف معتمد «${snap.letter}»`,
      });
      confidence -= PENALTY.snappedLetter;
      // البدائل التانية بتتحوّل لوحات كاملة بعد شوية (تحت)
    } else {
      // حرف غريب خالص — نسيبه ونعلّمه
      fixedLetters.push(ch);
      confidence -= PENALTY.unknownLetter;
      notes.push(`حرف «${ch}» مش معروف — لازم مراجعة`);
    }
  }

  /* ── الطبقة ٢: فحص الشكل ────────────────────────────────────────── */
  for (const flag of candidate.flags) {
    if (flag === "impossible-letter") continue; // اتعامل معاه فوق
    notes.push(FLAG_NOTES[flag]);
    if (flag === "few-letters") confidence -= PENALTY.fewLetters;
    if (flag === "extra-letters") confidence -= PENALTY.extraLetters;
    if (flag === "few-digits") confidence -= PENALTY.fewDigits;
    if (flag === "extra-digits") confidence -= PENALTY.extraDigits;
  }

  let plate = fixedLetters.join("") + candidate.digits;
  let letters = fixedLetters;
  let digits = candidate.digits;

  // البدائل الجاية من المحرك ممكن تحتوي حروف مستحيلة (لأنها من الكلام
  // الخام)، فبنمرّرها على نفس الحصر القسري — عشان المندوب ما يقدرش
  // يختار بديل فيه حرف مش موجود على اللوحات السعودية.
  const alternatives = new Set<string>(
    candidate.alternatives.map(snapPlateString)
  );
  for (let i = 0; i < fixedLetters.length; i++) {
    const original = candidate.letters[i];
    if (!original || isPlateLetter(original)) continue;
    for (const alt of snapToPlateLetter(original).alternatives) {
      const swapped = fixedLetters.slice();
      swapped[i] = alt;
      alternatives.add(swapped.join("") + digits);
    }
  }

  confidence = Math.max(0, Math.min(100, confidence));

  /* ── الطبقة ٣: توجيه بالمفردات المقفولة (شيت البنك) ─────────────── */
  if (options.vocabulary) {
    const exactHit = findNearestInVocabulary(plate, options.vocabulary, 0);
    if (exactHit && exactHit.distance === 0) {
      // اللوحة موجودة نصاً في الشيت → دليل قوي إن التفريغ صح
      confidence = Math.max(confidence, VOCAB_EXACT_CONFIDENCE);
      notes.push("اللوحة موجودة نصاً في شيت البنك — تأكيد قوي للتفريغ");
    } else if (confidence < SOLID_AT && isWellFormedPlate(plate)) {
      /**
       * ⛔ **الشدّ للشيت بقى للّوحة السليمة الشكل بس** (٢٠٢٦/٨/١٥)
       *
       * الحالة الحقيقية (مندوب أ): اللوحة اتسمعت **«ا0007»** — حرف واحد
       * وأربع أرقام. الشدّ لقى «لا0007» في الشيت على بعد خانة، فحوّلها
       * وعرضها **«مطلوبة»**. يعني اخترعنا لوحة من نص لوحة وحطّينا عليها
       * علامة يقين، والمندوب ممكن يتحرّك على عربية مالهاش وجود.
       *
       * الشدّ اتعمل عشان يصلّح **خانة واحدة في لوحة كاملة**، مش عشان
       * يكمّل لوحة ناقصة. واللوحة اللي إحنا نفسنا شايفينها ناقصة
       * (مش ٣ حروف + ٤ أرقام) ممنوع تتحوّل لـ«مطلوبة» بأي حال.
       *
       * ومقيس قبل كده على ٢٥٣ مقطع بالشيت الحقيقي (٥٠٨٣٥ لوحة): الشدّ
       * على اللوحة السليمة صلّح **٠** وبوّظ **٣٢** (٩٣.٧٪ → ٨١٪).
       */
      // مشكوك فيها → نجرّب نلاقي أقرب لوحة على مسافة حرف واحد
      const near = findNearestInVocabulary(plate, options.vocabulary, 1);
      if (near && !near.ambiguous && near.distance === 1) {
        corrections.push({
          from: plate,
          to: near.plate,
          reason:
            "تفرق حرف واحد عن لوحة واحدة بس في شيت البنك — الأغلب هي دي",
        });
        alternatives.add(plate);
        plate = near.plate;
        const m = plate.match(/^([ء-ي]+)(\d+)$/);
        if (m) {
          letters = [...m[1]];
          digits = m[2];
        }
        confidence = Math.max(confidence, VOCAB_GUIDED_CONFIDENCE);
        notes.push("اتصحّحت بتوجيه من شيت البنك");
      } else if (near?.ambiguous) {
        notes.push(
          "فيه أكتر من لوحة قريبة في شيت البنك — ما صحّحناهاش عشان ما نخمّنش غلط"
        );
      }
    }
  }

  const wellFormed = isWellFormedPlate(plate);
  if (wellFormed && confidence >= SOLID_AT && notes.length === 0) {
    notes.push("شكل سليم: ٣ حروف معتمدة + ٤ أرقام");
  }

  return {
    order: candidate.order,
    letters,
    digits,
    plate,
    display: `${displayLetters(letters)} ${digits}`,
    heardPlate: candidate.plate,
    heardLetters: candidate.heardLetters,
    raw: candidate.raw,
    timeStart: candidate.timeStart,
    timeEnd: candidate.timeEnd,
    flags: candidate.flags,
    alternatives: [...alternatives].filter((a) => a && a !== plate),
    confidence,
    status: statusOf(confidence),
    notes,
    corrections,
    needsAudioReview: confidence < threshold,
  };
}

/** يراجع قائمة لوحات */
export function reviewPlates(
  candidates: PlateCandidate[],
  options: ReviewOptions = {}
): ReviewedPlate[] {
  return candidates.map((c) => reviewPlate(c, options));
}

/**
 * الدالة الجاهزة اللي بتستخدمها الصفحتين:
 * تفريغ → استخراج → مراجعة، في نداء واحد.
 */
export function extractPlates(
  input: string | SourceWord[],
  options: ReviewOptions = {}
): ReviewedPlate[] {
  return reviewPlates(parseSaudiPlates(input), options);
}

/* ============================ اختيار أفضل احتمال (Multi-Hypothesis) */

export interface BestTranscript {
  /** النص اللي اخترناه */
  text: string;
  /** اللوحات اللي طلعت منه بعد المراجعة */
  plates: ReviewedPlate[];
  /** ترتيبه في الاحتمالات اللي وصلت (٠ = اللي المحرك رشّحه أولاً) */
  index: number;
  /** درجته في الترشيح — للتشخيص */
  score: number;
}

/**
 * بعض المحركات (زي التعرّف المدمج في المتصفح) بترجّع **أكتر من احتمال**
 * لنفس الكلام. الاحتمال الأول مش دايماً الأصح في سياقنا، لأن المحرك
 * بيرشّح على أساس «إيه أقرب كلام عربي معقول» وإحنا عايزين «إيه أقرب
 * تهجئة لوحة سعودية».
 *
 * فبنجرّب كل احتمال على محرك اللوحات كامل ونختار اللي:
 *   ١. يطلّع أكتر لوحات سليمة (٣ حروف معتمدة + ٤ أرقام)
 *   ٢. لوحاته موجودة في شيت البنك (أقوى دليل ممكن)
 *   ٣. ثقة لوحاته أعلى
 *
 * وده تصحيح **مجاني**: بلا أي نداء إضافي ولا تكلفة، مجرد إننا بنستغل
 * معلومة كانت بتترمى.
 */
export function pickBestTranscript(
  alternatives: string[],
  options: ReviewOptions = {}
): BestTranscript {
  const vocab = options.vocabulary ? new Set(options.vocabulary) : null;

  let best: BestTranscript = { text: "", plates: [], index: 0, score: -1 };

  for (let i = 0; i < alternatives.length; i++) {
    const text = alternatives[i];
    const plates = extractPlates(text, options);

    let score = 0;
    for (const p of plates) {
      score += 400; // أي لوحة أحسن من ولا لوحة
      if (isWellFormedPlate(p.plate)) score += 600;
      if (vocab?.has(p.plate)) score += 900; // موجودة في شيت البنك
      score += p.confidence;
    }

    // عند التعادل نفضّل ترشيح المحرك الأول (هو الأقرب صوتياً)
    if (score > best.score) {
      best = { text, plates, index: i, score };
    }
  }

  // مافيش احتمالات خالص
  if (best.score < 0) {
    return { text: alternatives[0] ?? "", plates: [], index: 0, score: 0 };
  }

  return best;
}

/* ==================================================== الطبقة ٤ */

/**
 * يوفّق بين اللوحة الأصلية والرأي التاني على نفس المقطع الصوتي.
 *
 * منطق الحكم (بالترتيب):
 *   ١. اتفقوا            → الثقة تعلى وخلاص
 *   ٢. واحد بس شكله سليم → الأسلم يكسب
 *   ٣. واحد بس في الشيت  → اللي في الشيت يكسب
 *   ٤. غير كده           → نسيب الأصلي ونحُط التاني كبديل ونعلّم الخلاف
 */
export function reconcileSecondOpinion(
  primary: ReviewedPlate,
  secondOpinionText: string,
  options: ReviewOptions & { engine?: string } = {}
): ReviewedPlate {
  const engine = options.engine ?? "مراجعة صوتية";
  const secondCandidates = parseSaudiPlates(secondOpinionText);
  const second = secondCandidates.length
    ? reviewPlate(secondCandidates[0], options)
    : null;

  if (!second) {
    return {
      ...primary,
      needsAudioReview: false,
      notes: [...primary.notes, "المراجعة الصوتية ما طلّعتش لوحة من المقطع"],
      audioReview: { agreed: false, secondOpinion: null, engine },
    };
  }

  const agreed = second.plate === primary.plate;

  if (agreed) {
    return {
      ...primary,
      confidence: Math.max(primary.confidence, AGREED_CONFIDENCE),
      status: statusOf(Math.max(primary.confidence, AGREED_CONFIDENCE)),
      needsAudioReview: false,
      notes: [...primary.notes, `المراجعة الصوتية اتفقت مع التفريغ الأول ✓`],
      audioReview: { agreed: true, secondOpinion: second.plate, engine },
    };
  }

  const vocab = options.vocabulary ? [...options.vocabulary] : [];
  const inVocab = (p: string) => vocab.includes(p);

  const primaryWell = isWellFormedPlate(primary.plate);
  const secondWell = isWellFormedPlate(second.plate);

  let winner = primary;
  let loser = second;
  let reason = "";

  if (secondWell && !primaryWell) {
    winner = second;
    loser = primary;
    reason = "الرأي التاني شكله سليم (٣ حروف + ٤ أرقام) والأول لأ";
  } else if (primaryWell && !secondWell) {
    reason = "التفريغ الأول شكله سليم والرأي التاني لأ";
  } else if (vocab.length && inVocab(second.plate) && !inVocab(primary.plate)) {
    winner = second;
    loser = primary;
    reason = "الرأي التاني موجود في شيت البنك";
  } else if (second.confidence > primary.confidence + 10) {
    winner = second;
    loser = primary;
    reason = "الرأي التاني ثقته أعلى بفرق واضح";
  } else {
    reason = "الرأيين مختلفين — سيبنا الأول وحُطينا التاني كبديل";
  }

  const merged: ReviewedPlate = {
    ...winner,
    order: primary.order,
    raw: primary.raw,
    timeStart: primary.timeStart,
    timeEnd: primary.timeEnd,
    heardPlate: primary.heardPlate,
    heardLetters: primary.heardLetters,
    alternatives: [...new Set([...winner.alternatives, loser.plate])].filter(
      (p) => p && p !== winner.plate
    ),
    notes: [
      ...winner.notes,
      `المراجعة الصوتية اختلفت: «${loser.plate}» — ${reason}`,
    ],
    needsAudioReview: false,
    audioReview: { agreed: false, secondOpinion: second.plate, engine },
  };

  // اختلاف الرأيين معناه شك حقيقي — الثقة ما تعلاش لفوق حد المراجعة
  merged.confidence = Math.min(merged.confidence, SOLID_AT - 1);
  merged.status = statusOf(merged.confidence);

  return merged;
}

/* =============================================== التعديل اليدوي */

/**
 * المندوب عدّل الحروف أو الأرقام بإيده.
 * رأي المندوب فوق أي محرك — فالثقة ١٠٠٪ والمراجعة تتلغي.
 */
export function applyManualEdit(
  plate: ReviewedPlate,
  next: { letters?: string[]; digits?: string }
): ReviewedPlate {
  const letters = (next.letters ?? plate.letters).map((ch) => ch.trim()).filter(Boolean);
  const digits = (next.digits ?? plate.digits).replace(/\D/g, "").slice(0, 4);

  return {
    ...plate,
    letters,
    digits,
    plate: letters.join("") + digits,
    display: `${displayLetters(letters)} ${digits}`,
    confidence: 100,
    status: "solid",
    needsAudioReview: false,
    manuallyEdited: true,
    // 📍 علامة الموقع بتفضل — تعديل اللوحة مابيغيّرش مكانها («نفس موقع اللوحة اللي قبلها» لازم يفضل باين)
    notes: ["تعديل يدوي من المندوب", ...(plate.notes || []).filter(isPinMark)],
    corrections: plate.corrections,
  };
}
