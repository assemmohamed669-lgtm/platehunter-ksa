/**
 * استخدام بيانات الكلمات من Deepgram (توقيت + ثقة) لتحسين تقسيم اللوحات —
 * الخطوة ٤. جوّه المحلّل فقط، بلا أي واجهة مراجعة.
 *
 * المشكلة اللي بيحلها (اتّأكدت بتجربة ميدانية): لما المندوب يقول لوحات ورا بعض،
 * Deepgram أحياناً بيرجّعهم في نتيجة نهائية واحدة، فأرقام لوحة بتتلخبط مع حروف
 * اللوحة اللي بعدها. الحل: نفصلهم عند **الفجوة الزمنية** بين الكلمات (الوقفة
 * الطبيعية بين لوحتين أطول من الفجوة بين حروف/أرقام نفس اللوحة).
 *
 * دوال نقية قابلة للاختبار — القراءة من رسالة WebSocket في الصفحة.
 */

import { plateAtoms, normalizePlate, type PlateAtom } from "./plateParser";

export interface DgWord {
  word: string;
  start?: number;      // ثانية بداية الكلمة
  end?: number;        // ثانية نهاية الكلمة
  confidence?: number; // 0..1 (لترجيح التصحيح لاحقاً — خطوة ٥)
}

/**
 * يفصل قائمة الكلمات لمقاطع عند أي فجوة زمنية ≥ gapSec (بين نهاية كلمة وبداية
 * اللي بعدها). كل مقطع = نص كلماته بمسافات. توقيتات ناقصة → مفيش فصل (مقطع
 * واحد آمن، مايضيّعش لوحات).
 */
export function segmentByGap(words: DgWord[], gapSec = 0.65): string[] {
  if (!Array.isArray(words) || words.length === 0) return [];
  const segments: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i > 0) {
      const prevEnd = words[i - 1].end;
      const curStart = words[i].start;
      if (typeof prevEnd === "number" && typeof curStart === "number") {
        const gap = curStart - prevEnd;
        if (gap >= gapSec && cur.length > 0) {
          segments.push(cur.join(" "));
          cur = [];
        }
      }
    }
    const text = (words[i].word ?? "").trim();
    if (text) cur.push(text);
  }
  if (cur.length > 0) segments.push(cur.join(" "));
  return segments.filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// حدود المقاطع **بالزمن** — لنافذة قصّ الصوت، مش للتقسيم النصّي
// =============================================================================
// `segmentByGap` فوق بترجّع نص بس، وده كل اللي التقسيم النصّي محتاجه. بس نافذة
// قصّ الصوت (طيّار الرأي التاني) محتاجة **زمن**: تبدأ فين وتخلص فين.
// ─────────────────────────────────────────────────────────────────────────────

export interface DgSegmentBounds {
  /** بداية أول كلمة في المقطع (ms، زمن ميديا). */
  startMs: number;
  /** نهاية آخر كلمة في المقطع (ms). */
  endMs: number;
  /** نص كلماته بمسافات — نفس مخرَج `segmentByGap` للمقطع ده. */
  text: string;
  /** فهرس أول/آخر كلمة في المصفوفة الأصلية. */
  from: number;
  to: number;
}

/**
 * زي `segmentByGap` بس بترجّع الحدود الزمنية كمان. أي كلمة بلا توقيت كامل
 * بتلغي المقطعة كلها (`[]`) — نافذة على توقيت ناقص أوحش من مافيش نافذة.
 */
export function segmentBoundsByGap(words: DgWord[], gapSec = 0.65): DgSegmentBounds[] {
  if (!Array.isArray(words) || words.length === 0) return [];
  for (const x of words) {
    if (typeof x?.start !== "number" || typeof x?.end !== "number") return [];
    if (!Number.isFinite(x.start) || !Number.isFinite(x.end)) return [];
  }
  const out: DgSegmentBounds[] = [];
  let from = 0;
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && (words[i].start as number) - (words[i - 1].end as number) >= gapSec) {
      out.push(bounds(words, from, i - 1));
      from = i;
    }
  }
  out.push(bounds(words, from, words.length - 1));
  return out;
}

function bounds(words: DgWord[], from: number, to: number): DgSegmentBounds {
  return {
    startMs: Math.round((words[from].start as number) * 1000),
    endMs: Math.round((words[to].end as number) * 1000),
    text: words.slice(from, to + 1).map((x) => (x.word ?? "").trim()).filter(Boolean).join(" "),
    from,
    to,
  };
}

/** آخر مقطع + عدد المقاطع كلها. `null` = مافيش توقيت كامل ⇒ مافيش قرار. */
export function lastSegmentBounds(
  words: DgWord[], gapSec = 0.65,
): (DgSegmentBounds & { segments: number }) | null {
  const segs = segmentBoundsByGap(words, gapSec);
  if (segs.length === 0) return null;
  return { ...segs[segs.length - 1], segments: segs.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// نطق **آخر لوحة** جوّه رسالة واحدة — القاعدة على المحتوى، لا على الفجوة
// =============================================================================
// ليه مش الفجوة؟ لأن التوزيعين **متقاطعين** على صوت المالك (مقيس على جلسة
// الـ٣٠ لوحة، بإعادة بناء خط زمن الميديا من `cut_start` لكل مقطع محفوظ + VAD
// طاقة + سؤال الموديل الحي عن كل منطقة كلام لوحدها):
//   • أضيق سكتة **بين لوحتين**: ٤٦٠ms  (وكذلك ٤٧٠/٤٧٠/٥٤٠ — أربع حالات)
//   • أطول وقفة **جوّه لوحة واحدة** («حروف … وقفة … أرقام»): ٩٣٠ms
// يعني مافيش أي عتبة فجوة تقدر تفصلهم: ٠٫٦٥ث بتفشل من الناحيتين — مابتفصلش
// النتايج الملزوقة الأربع، وبتقطع الوقفتين الجوّانيتين (٩٠٠/٩٣٠ms).
//
// اللي **بيفصل** فعلاً هو المحتوى: اللوحة السعودية = ٣ حروف بعدين ٤ أرقام،
// والمالك بيمليها بالترتيب ده دايماً. فبنمشي من **آخر** كلمة لورا ونجمّع ذرّات
// (`plateAtoms` — نفس المصنّف اللي المحلّل النصّي بيستخدمه)، وأول ما يتجمّع
// نطق لوحة كامل نقف. وبعدين — وده الأهم — **نتحقّق**: اللوحة المجمّعة لازم
// تطابق لوحة الصف. لو مااتطابقتش فمعناه إن الكلمات دي مش اللي طلّعت الصف ده
// ⇒ نرجّع `null` والمنادي **يسكت** بسبب مسمّى. السكوت أمين؛ طلب مبني على صوت
// لوحة تانية مش أمين.
// ─────────────────────────────────────────────────────────────────────────────

/** أقصى عدد كلمات في نطق لوحة واحدة — ٣ حروف + ٤ أرقام مفكوكة + هامش. */
const MAX_PLATE_WORDS = 16;
/**
 * أقصى كلمات **بلا مادة لوحة** في آخر الرسالة نسمح بتخطّيها. الشغل هنا متزامن
 * على الثريد الرئيسي (`planJudgeSlice` بيتنادى قبل أي await)، والتكلفة
 * `MAX_PLATE_WORDS` × عدد المتخطّى من نداءات `plateAtoms`. ٨ كلمات ملاحظة
 * («جراج يمين تحت العمارة …») أكتر من أي ذيل حقيقي، وبتسقّف التكلفة عند ~١٤٤
 * نداء بدل ما تبقى مفتوحة على طول الرسالة.
 */
const MAX_TRAILING_SKIP = 8;

export interface PlateWordSpan {
  /** بداية أول كلمة في نطق آخر لوحة (ms، زمن ميديا). */
  startMs: number;
  /** نهاية آخر كلمة فيها (ms). */
  endMs: number;
  /** فهرس أول/آخر كلمة — للتسجيل والاختبار. */
  from: number;
  to: number;
  /** اللوحة اللي اتجمّعت من الذرّات، مطبّعة (= `expectPlateNorm` بالضرورة). */
  plateNorm: string;
}

/**
 * يبني لوحة من ذرّات: كل الحروف لازم تجي **قبل** كل الأرقام (ترتيب النطق
 * السعودي)، ومافيش ذرّات نوع/ملاحظة جوّه النطق. أي خرق = `null`.
 */
function plateFromAtoms(atoms: PlateAtom[]): string | null {
  let letters = "", digits = "";
  for (const a of atoms) {
    if (a.t === "L") {
      if (digits) return null;                 // حرف بعد رقم = لوحة تانية بدأت
      letters += a.v;
    } else if (a.t === "D") {
      digits += a.v;
    } else {
      return null;                             // نوع مركبة / ملاحظة = مش نطق لوحة
    }
  }
  if (!letters || !digits) return null;
  return letters + digits;
}

/** فيه أي مادة لوحة (حرف أو رقم) في النص ده؟ */
function hasPlateMaterial(text: string): boolean {
  return plateAtoms(text).some((a) => a.t === "L" || a.t === "D");
}

/**
 * نطق **آخر لوحة** جوّه مصفوفة كلمات نتيجة نهائية واحدة، متحقَّق منه ضد لوحة
 * الصف. `null` = مش مثبَت ⇒ المنادي يسكت.
 *
 * الضمانات (كلها مغطّاة باختبار على أرقام جلسة المالك):
 *  • عمرها ما ترجّع نطق **لوحة تانية**: النطق المرجَّع لازم يطبّع لنفس
 *    `expectPlateNorm`، وده هو الإثبات.
 *  • كلمة أخيرة مالهاش مادة لوحة (ملاحظة/ضجيج) **مابتمدّش** النهاية.
 *  • كلمة أخيرة **فيها** مادة لوحة مش من لوحة الصف ⇒ `null` (مافيش تخمين).
 *  • أي كلمة بلا توقيت كامل جوّه النطق ⇒ `null`.
 *
 * ⚠️ فجوة **مقصودة وموثّقة**: رقم منطوق **مركّب** («ألف وخمسمية وتمانية وتمانين»
 *    = ١٥٨٨) بيرجّع `null`، لأن `plateAtoms` مابتجمّعش المركّبات عن قصد (شوف تعليق
 *    `ألف` جوّاها) والمحلّل النصّي بيعالجها بمسار تانٍ (`parsePlateFromTranscript`).
 *    استخدام المسار التانِ هنا **مرفوض**: هو متسامح مع كلمات الملاحظات، فبيقبل
 *    مدى فيه كلام مش من اللوحة ⇒ الإثبات نفسه بيضيع (اتجرّب: مدى فيه «والله»
 *    الزايدة بقى «مطابق» والنافذة طوّلت ١٠٦٠ms على كلام مش لوحة).
 *    والشكل ده مالوش وجود في مسار الطيّار عملياً: `numerals: "true"` بيخلّي
 *    Deepgram يرجّع أرقام (١٥٨٨)، وجلسة المالك المقيسة كلها رقم-برقم.
 *    النتيجة عند حدوثه: سكوت `window_unproven` — وده الاتجاه الصح.
 */
export function lastPlateWordSpan(
  words: DgWord[], expectPlateNorm: string,
): PlateWordSpan | null {
  // نفس الحساب بالحرف — المسح المشترك بـ`skipTrailingPlates: false` = القاعدة
  // الأصلية (أي مادة لوحة في الآخر مش من لوحة الصف ⇒ سكوت فوراً).
  const scan = scanPlateSpan(words, expectPlateNorm, false);
  return scan ? scan.span : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// المسح المشترك — نفس البناء-والتحقّق، وحدّي الجار على الطرفين
// =============================================================================
// `lastPlateWordSpan` فوق بترجّع المدى بس، وده كل اللي المسار الأحادي محتاجه.
// المسار المتعدّد (لوحة اتقالت على نتيجتين نهائيتين) محتاج حاجتين زيادة:
//   • **نهاية آخر كلمة قبل** النطق — الحدّ السفلي الحقيقي للجار. على المسار
//     المتعدّد حدّ `prevWordEndMs` (نهاية النتيجة السابقة) بيلغي نفسه، لأن
//     النتيجة السابقة هي اللي شايلة **حروف اللوحة نفسها**.
//   • **بداية أول كلمة فيها مادة لوحة بعد** النطق — الحدّ العلوي، عشان الحشوة
//     ماتلمسش نطق الجار لما لوحة الصف مش آخر لوحة في الرسالة.
// ─────────────────────────────────────────────────────────────────────────────

interface PlateSpanScan {
  span: PlateWordSpan;
  /** نهاية آخر كلمة قبل النطق (ms) — `null` = النطق أول كلمة في المصفوفة. */
  prevEndMs: number | null;
  /**
   * بداية أول كلمة **فيها مادة لوحة** بعد النطق (ms). `null` = مافيش كلام لوحة
   * بعده. كلمة فيها مادة لوحة **بلا توقيت** بترجّع نهاية النطق نفسها = «مافيش
   * حشوة على الناحية دي» (أأمن قرار، مش تجاهل).
   */
  nextPlateStartMs: number | null;
}

function ms(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) : null;
}

/** أول كلمة فيها مادة لوحة بعد `to` — الحدّ العلوي للجار. */
function nextPlateWordStart(words: DgWord[], to: number, endMs: number): number | null {
  for (let i = to + 1; i < words.length; i++) {
    const t = (words[i]?.word ?? "").trim();
    if (!t || !hasPlateMaterial(t)) continue;
    const s = ms(words[i].start);
    return s === null ? endMs : s;         // جار بلا توقيت ⇒ صفر حشوة
  }
  return null;
}

/**
 * البناء من الآخر لورا + التحقّق (نفس `lastPlateWordSpan` بالحرف)، بحدّي الجار.
 * `skipTrailingPlates`: لما تبقى `true`، كلمة آخرانية فيها مادة لوحة **مش** من
 * لوحة الصف مابتوقّفش المسح — بنجرّب الكلمة اللي قبلها. آمن لأن الشرط الوحيد
 * للقبول ثابت: الذرّات المجمّعة لازم تطبّع لـ`expectPlateNorm` بالظبط.
 */
function scanPlateSpan(
  words: DgWord[], expectPlateNorm: string, skipTrailingPlates: boolean,
): PlateSpanScan | null {
  if (!Array.isArray(words) || words.length === 0) return null;
  if (typeof expectPlateNorm !== "string" || !expectPlateNorm) return null;
  const txt = (i: number) => (words[i]?.word ?? "").trim();

  const floor = Math.max(0, words.length - 1 - MAX_TRAILING_SKIP);
  for (let to = words.length - 1; to >= floor; to--) {
    if (!txt(to)) continue;                       // كلمة فاضية = مش موجودة
    for (let from = to; from >= 0 && to - from < MAX_PLATE_WORDS; from--) {
      const text = words.slice(from, to + 1).map((x) => (x.word ?? "").trim())
        .filter(Boolean).join(" ");
      if (!text) continue;
      const built = plateFromAtoms(plateAtoms(text));
      if (built === null) continue;
      if (normalizePlate(built) !== expectPlateNorm) continue;
      const s = words[from].start, e = words[to].end;
      if (typeof s !== "number" || !Number.isFinite(s)) return null;
      if (typeof e !== "number" || !Number.isFinite(e)) return null;
      // كل كلمة جوّه النطق لازم يكون عندها توقيت — نافذة على توقيت ناقص = تخمين.
      for (let i = from; i <= to; i++) {
        const ws = words[i].start, we = words[i].end;
        if (typeof ws !== "number" || !Number.isFinite(ws)) return null;
        if (typeof we !== "number" || !Number.isFinite(we)) return null;
      }
      const startMs = Math.round(s * 1000), endMs = Math.round(e * 1000);
      return {
        span: { startMs, endMs, from, to, plateNorm: expectPlateNorm },
        prevEndMs: from > 0 ? ms(words[from - 1].end) : null,
        nextPlateStartMs: nextPlateWordStart(words, to, endMs),
      };
    }
    // مافيش نطق مطابق بينتهي عند الكلمة دي:
    //  • لو فيها **مادة لوحة** (حرف/رقم) فهي كلام لوحة مش لوحة الصف ⇒ مش مثبَت.
    //  • لو مالهاش (ملاحظة «والله» / نوع «ونيت» / ضجيج) فهي **بره** النطق —
    //    ماتمدّش النافذة، ونجرّب الكلمة اللي قبلها.
    if (hasPlateMaterial(txt(to)) && !skipTrailingPlates) return null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// لوحة واحدة على **نتيجتين نهائيتين** — أكبر سبب سكوت مقيس
// =============================================================================
// المالك بيسكت وسط اللوحة («حروف … سكتة … أرقام»): ٩ لوحات من ٣٠، والوقفة توصل
// **٩٣٠ms** بينما أضيق سكتة **بين لوحتين** ٤٦٠ms ⇒ التوزيعان متقاطعان ومافيش
// عتبة فجوة تفصلهم (اتجرّبت وفشلت). مع `endpointing=100` Deepgram بينهّي **نص**
// اللوحة، فالمحلّل بيلمّها بالـcarry-over (الصف صح) لكن كلمات النتيجة الأخيرة
// لوحدها **مش** فيها لوحة الصف ⇒ `lastPlateWordSpan` = null ⇒ سكوت.
//
// الحل: نفس البناء ونفس التحقّق، بس على كلمات آخر شوية نتايج **موصولة**.
// **الأمان مش في عدد النتايج — الأمان في التحقّق**: المدى المرجَّع لازم تكون
// ذرّاته = لوحة الصف بالظبط، فمستحيل يرجّع نطق لوحة تانية. وفوق كده حدّان
// بكلمات الجار نفسها (`prevEndMs` / `nextPlateStartMs`) وسقف مدة في المنادي.
// ─────────────────────────────────────────────────────────────────────────────

/** نتيجة نهائية واحدة في تاريخ التيار — كلماتها + حدّ الجار اللي قبلها. */
export interface DgFinal {
  words: DgWord[];
  /** نهاية آخر كلمة في النتيجة النهائية **اللي قبل** دي على نفس التيار (ms). */
  prevWordEndMs: number | null;
  /**
   * النتيجة دي من **التيار الحالي**؟ (`dgStreamSeqRef.current === streamSeq`)
   *
   * ⚠️ الحقل ده أمان، مش تحسين. `planPlateWindow` بيرفض **الرسالة** الجاية من
   * تيار قديم (`stale_stream`)، بس التاريخ كان مالوش أي بصمة تيار: نتيجة نهائية
   * متأخّرة من سوكيت قديم بتوصل بعد ما التاريخ اتصفّر (`page.tsx` بيصفّره مع كل
   * مسجّل جديد) فبتدخل تاريخ التيار **الجديد**، وتوقيتها بساعة تانية خالص. المدى
   * المثبَت بياخد وقته من توقيت الكلمات ⇒ نافذة على صوت مش صوت اللوحة.
   *
   * فحص التزايد تحت بيمسك الاتجاه الشايع (ساعة جديدة بتبدأ من الصفر ⇒ التوقيت
   * بينزل عند الحدّ ⇒ مرفوض)، لكنه **مش** كافي: لو إعادة الاتصال حصلت بدري في
   * التيار القديم — أو المالك سكت بعدها فالنتيجة القديمة فضلت في التاريخ — يبقى
   * توقيت النتيجة القديمة أصغر من الجديدة، فالتزايد سليم والإثبات بيعدّي.
   * المقيس على الحالة المبنية: ١٤٥٠ms من الـ٣٠٥٠ في النافذة مش من صوت اللوحة.
   *
   * غايب = `true` (توافق للخلف مع أي منادي قديم).
   */
  streamFresh?: boolean;
}

export interface PlateSpanProof {
  /** المدى المثبَت — فهارسه على الكلمات **الموصولة**، وزمنه زمن الميديا. */
  span: PlateWordSpan;
  /** الحدّ السفلي: نهاية آخر كلمة قبل النطق (أو الحدّ المحفوظ مع أقدم نتيجة). */
  neighbourEndMs: number | null;
  /** الحدّ العلوي: بداية أول كلمة فيها مادة لوحة بعد النطق. */
  nextPlateStartMs: number | null;
  /** عدد النتائج النهائية اللي النطق اتلمّ منها. */
  finalsUsed: number;
  /** النطق عدّى حدّ نتيجة نهائية؟ (`false` = كله جوّه نتيجة واحدة) */
  crossed: boolean;
}

export function provePlateSpanAcrossFinals(
  finalsIn: DgFinal[], expectPlateNorm: string,
): PlateSpanProof | null {
  if (!Array.isArray(finalsIn) || finalsIn.length === 0) return null;
  if (typeof expectPlateNorm !== "string" || !expectPlateNorm) return null;
  // فشل مغلق على **ساعة تانية**: الإثبات عمره ما يعبر نتيجة نهائية مش من التيار
  // الحالي. بنقطع التاريخ عند **آخر** نتيجة موسومة `streamFresh === false`
  // ونستخدم اللي بعدها بس؛ لو مافيش حاجة بعدها فمافيش إثبات (سكوت مسمّى).
  // القطع — لا الشيل — مقصود: شيل عنصر من الوسط بيلزق نتيجتين مش متجاورتين،
  // وده بيخلّي المدى «متصل» في المصفوفة وهو مقطوع في الزمن.
  let cut = -1;
  for (let f = 0; f < finalsIn.length; f++) {
    if (finalsIn[f]?.streamFresh === false) cut = f;
  }
  const finals = cut < 0 ? finalsIn : finalsIn.slice(cut + 1);
  if (finals.length === 0) return null;
  const flat: DgWord[] = [];
  const owner: number[] = [];                    // كل كلمة تبع أنهي نتيجة
  for (let f = 0; f < finals.length; f++) {
    const ws = Array.isArray(finals[f]?.words) ? finals[f].words : [];
    for (const x of ws) {
      if (!x || typeof x.word !== "string") continue;
      flat.push(x);
      owner.push(f);
    }
  }
  if (flat.length === 0) return null;
  const scan = scanPlateSpan(flat, expectPlateNorm, true);
  if (!scan) return null;
  const { from, to, startMs, endMs } = scan.span;
  // ساعات مختلطة (نتيجة متأخّرة من تيار قديم دخلت التاريخ بالغلط) = فشل مغلق:
  // النطق لازم يكون **متزايد زمنياً** من أوله لآخره.
  if (endMs <= startMs) return null;
  for (let i = from; i < to; i++) {
    const a = flat[i].start, b = flat[i + 1].start;
    if (typeof a !== "number" || typeof b !== "number" || !(a <= b)) return null;
  }
  const first = owner[from], last = owner[to];
  const neighbourEndMs = scan.prevEndMs !== null
    ? scan.prevEndMs
    : (typeof finals[first]?.prevWordEndMs === "number"
      && Number.isFinite(finals[first].prevWordEndMs as number)
      ? (finals[first].prevWordEndMs as number) : null);
  return {
    span: scan.span,
    neighbourEndMs,
    nextPlateStartMs: scan.nextPlateStartMs,
    finalsUsed: last - first + 1,
    crossed: first !== last,
  };
}

/** يقرأ words[] من رسالة Deepgram (channel.alternatives[0].words) بأمان. */
export function readDeepgramWords(msg: unknown): DgWord[] {
  const raw = (msg as { channel?: { alternatives?: Array<{ words?: unknown }> } })
    ?.channel?.alternatives?.[0]?.words;
  if (!Array.isArray(raw)) return [];
  const out: DgWord[] = [];
  for (const w of raw) {
    const o = w as Record<string, unknown>;
    const word = typeof o?.word === "string" ? o.word : "";
    if (!word) continue;
    out.push({
      word,
      start: typeof o.start === "number" ? o.start : undefined,
      end: typeof o.end === "number" ? o.end : undefined,
      confidence: typeof o.confidence === "number" ? o.confidence : undefined,
    });
  }
  return out;
}
