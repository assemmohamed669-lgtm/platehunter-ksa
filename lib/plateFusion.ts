import { normalizePlate } from "@/lib/plateParser";

// ─────────────────────────────────────────────────────────────────────────────
// دمج قرارين: موديلنا (whisper-plates المضبوط على اللوحات) + تفريغ Deepgram.
//
// دالة **نقية** بالكامل: بلا I/O، بلا globals، بلا وقت، بلا عشوائية. كل ما
// بتحتاجه بيجيلها في الإدخال — بما فيها عضوية شيت التشييك (callback).
//
// ملاحظة معمارية: ده **حَكَم (judge)** جانب Deepgram، مش محرّك خامس. Deepgram
// لازم يفضل لأن نصّه الحر هو اللي بيطلّع نوع السيارة والملاحظات وأكتر من لوحة
// في النبضة الواحدة — وموديلنا بيطلّع اللوحة بس.
//
// ─── ليه الجدول ده بالظبط (كله مقيس على ١٢٠ مقطع ميداني محتجَز) ──────────────
//   موديلنا   ١١٥/١٢٠ = ٩٥٫٨٪ لوحة مطابقة تماماً (CER ٠٫٨٪)
//   Deepgram   ٩٨/١٢٠ = ٨١٫٧٪ (بإعداد الإنتاج nova-3)   McNemar p = 7.6e-5
//   النتائج المزدوجة: الاتنين صح ٩٧ · موديلنا لوحده ١٨ · Deepgram لوحده ١ · ولا واحد ٤
//
// نتيجتان بتحكما التصميم:
//  ١. الدمج **مش** بيرفع الدقة (السقف النظري ١١٦/١٢٠ = ٩٦٫٧٪ مقابل ٩٥٫٨٪ من غيره).
//     قيمته الحقيقية إنه بيقيس **اليقين**: عند الاتفاق (٩٨/١٢٠ = ٨١٫٧٪ من الحالات)
//     الجواب صح ٩٩٫٠٪، و٤ من أخطائنا الـ٥ الباقية واقعين جوّه الـ٢٢ اختلاف.
//     ⇒ الاتفاق إشارة ثقة أقوى من أي درجة رقمية حسبناها. عشان كده:
//        اتفاق = بلا مراجعة · أي حاجة تانية = مراجعة.
//  ٢. عند الاختلاف بناخد موديلنا لأن الميزان ١٨:١ لصالحه. بنخسر بمعرفتنا المقطع
//     الواحد اللي Deepgram لوحده كان صح فيه — بس بعلامة مراجعة ظاهرة للمندوب.
//
// موديلنا **مش قادر** يقول «مافيش لوحة»: على ٢٣٠ مقطع بلا لوحة طلّع لوحة سليمة
// الشكل ٩٧٫٨٪ من المرات. عشان كده بوابة الثقة (training/plate_confidence.py،
// المواصفة في docs/confidence-gate.md) هي اللي بتحدد `accepted`، وهنا بنحترم
// قرارها: مرفوض = غير موجود.
// ─────────────────────────────────────────────────────────────────────────────

/** حروف اللوحات السعودية المعتمدة — نفس المجموعة المغلقة اللي في
 *  `plateParser.VALID_PLATE_LETTERS` و`plate_confidence.CANON_LETTERS`. */
const CANON_LETTERS = new Set("ابحدرسصطعقكلمنهوي".split(""));

export type FusionSource = "agree" | "ours" | "deepgram" | "none";

/** سبب قابل للقراءة آلياً — مجموعة مغلقة عشان ينفع يتسجّل ويتعدّ. */
export type FusionReason =
  | "agree"
  | "disagree_prefer_ours"
  | "disagree_sheet_prefers_ours"
  | "disagree_sheet_prefers_deepgram"
  | "deepgram_empty_use_ours"
  | "ours_unusable_use_deepgram"
  | "both_unavailable";

/** مخرَج موديلنا + قرار بوابة الثقة عليه (`GateDecision`). */
export interface OurPlateCandidate {
  /** اللوحة اللي الموديل طلّعها (نص خام، ممكن تكون فاضية/null). */
  plate?: string | null;
  /**
   * `GateDecision.accept` من `plate_confidence.gate(...)`.
   * ⚠️ **غايب = مرفوض** (فشل مغلق): لو المنادي مابعتش قرار بوابة فمعناه إن البوابة
   * ماشتغلتش، وساعتها أسوأ حالة لازم تساوي سلوك النهاردة (Deepgram لوحده) — نفس
   * منطق `fetchLearningEnabled` اللي بترجع false على أي خطأ.
   */
  accepted?: boolean;
  /** `GateDecision.reason` — للتسجيل بس، مش بيأثر على القرار. */
  reason?: string;
  /** `GateDecision.score` = mean_logprob — للتسجيل بس. */
  meanLogprob?: number | null;
  /** أضعف توكن — للتسجيل بس. */
  minLogprob?: number | null;
  /** رأس `<|nocaptions|>` — للتسجيل بس. */
  noSpeechProb?: number | null;
}

export interface FusionInput {
  /** اللوحة المستخرجة من تفريغ Deepgram (ممكن تكون نص كامل، فاضي، أو null). */
  deepgramPlate?: string | null;
  ours: OurPlateCandidate;
  /**
   * عضوية شيت التشييك — **اختيارية**. المنادي هو اللي بيوفّرها (مثلاً
   * `(p) => checkIndex.has(p)`). بتتنادى بلوحة **مطبّعة**، وبتتنادى **بس** عند
   * الاختلاف. لو ماتبعتتش، قاعدة الشيت ماتشتغلش خالص.
   */
  onCheckSheet?: ((plate: string) => boolean) | null;
}

export interface FusionResult {
  /** اللوحة المختارة **مطبّعة** (جاهزة لـ`checkIndex.get`)، أو "" لو `source==="none"`. */
  plate: string;
  source: FusionSource;
  /** false **بس** لما `source==="agree"`. أي حالة تانية = المندوب لازم يراجع. */
  needsReview: boolean;
  reason: FusionReason;
  /** المرشّحان الأصليان زي ما وصلوا — عشان الواجهة تعرض الاتنين للمندوب. */
  oursPlate: string;
  deepgramPlate: string;
  /** نفسهم بعد التطبيع — عشان التسجيل والمقارنة. */
  oursNorm: string;
  deepgramNorm: string;
  /** هل مرشّح موديلنا كان صالح للاستخدام (مقبول من البوابة + شكله سليم)؟ */
  oursUsable: boolean;
  /** اختصار لـ`source==="agree"` — إشارة اليقين (٩٩٫٠٪ صح عند الاتفاق). */
  agreed: boolean;
}

/**
 * لوحة سعودية قانونية = ٣ حروف من المجموعة المغلقة + ٤ أرقام — بعد التطبيع.
 * نظير `plate_confidence.is_valid_plate` بالجانب الـTS، بس بيطبّع الأول فالتطويل
 * («هـ») والهمزة والأرقام العربية ماتكسرش الفحص.
 *
 * ملاحظة: `normalizePlate` بتكمّل الأرقام لأربعة بأصفار على الشمال
 * («ابح123» → «ابح0123») لأن ده الشكل القانوني في الشيتات، فالنتيجة متسقة مع
 * البحث في `checkIndex`.
 */
export function isCanonicalPlate(plate: string | null | undefined): boolean {
  const norm = normalizePlate(plate ?? "");
  if (norm.length !== 7) return false;
  let letters = 0, digits = 0;
  for (const ch of norm) {
    if (ch >= "0" && ch <= "9") { digits++; continue; }
    if (!CANON_LETTERS.has(ch)) return false;
    letters++;
  }
  return letters === 3 && digits === 4;
}

/**
 * هل النص المطبّع فيه «مادة لوحة» أصلاً (حرف واحد على الأقل ورقم واحد على الأقل)؟
 *
 * ده الفحص المتسامح المستخدَم لمرشّح **Deepgram** بس. متسامح عن قصد: مسار
 * Deepgram هو مسار النهاردة، ولو فلترناه بالشكل الصارم كنّا هنشيل صفوف بتظهر
 * للمندوب النهاردة (`addOnePttRow` بيقبل ٢-٣ حروف و٣-٤ أرقام وبيسيب الحروف
 * غير المعتمدة تمرّ). الشرط الوحيد إنه يكون لوحة مش جملة: «مش عارف والله»
 * بتطبّع لحروف بلا أرقام ⇒ مافيش لوحة.
 */
function hasPlateSubstance(norm: string): boolean {
  let letters = 0, digits = 0;
  for (const ch of norm) {
    if (ch >= "0" && ch <= "9") digits++;
    else letters++;
  }
  return letters > 0 && digits > 0;
}

/** سؤال الشيت بأمان: أي استثناء = «مانعرفش» (ماينفعش حَكَم يكسر مسار الصوت). */
function askSheet(fn: (plate: string) => boolean, plate: string): boolean | null {
  try {
    return fn(plate) === true;
  } catch {
    return null;
  }
}

/**
 * جدول القرار — كل صف مغطّى باختبار في `__tests__/plateFusion.test.ts`:
 *
 * | الحالة                                   | source     | needsReview |
 * |------------------------------------------|------------|-------------|
 * | الاتنين موجودين ومتطابقين بعد التطبيع    | `agree`    | false       |
 * | الاتنين موجودين ومختلفين                 | `ours`     | true        |
 * | موديلنا مقبول و Deepgram فاضي            | `ours`     | true        |
 * | موديلنا مرفوض/مكسور و Deepgram موجود     | `deepgram` | true        |
 * | موديلنا مرفوض و Deepgram فاضي            | `none`     | true        |
 * | موديلنا موجود بس شكله مكسور              | يُعتبر غير موجود          |
 *
 * زيادة: عند الاختلاف، لو `onCheckSheet` مبعوتة و**واحد بالظبط** من المرشّحين
 * عضو في الشيت → نرجّحه ونقولها في `reason`. ماتشتغلش على التعادل (الاتنين
 * أعضاء أو ولا واحد) ولا لما الدالة مش مبعوتة.
 */
export function fusePlate(input: FusionInput): FusionResult {
  const oursRaw = input.ours?.plate ?? "";
  const dgRaw = input.deepgramPlate ?? "";

  // المقارنة **دايماً** بعد التطبيع، عمرها ما تبقى `===` على النص الخام: صور
  // التطويل («دمهـ4420») والهمزة والأرقام العربية كانت بتخلق اختلافات وهمية —
  // الباج ده لوحده ضيّع ٥ مقاطع في قياس أسبق.
  const oursNorm = normalizePlate(oursRaw);
  const dgNorm = normalizePlate(dgRaw);

  // مرشّح موديلنا صالح بس لو البوابة قبلته **و**شكله لوحة قانونية.
  // (الشكل المكسور = «غير موجود» — البوابة نفسها بترجع `bad_shape` هنا، والفحص
  //  التاني حزام أمان لو المنادي جاب اللوحة من طريق تاني.)
  const oursUsable = input.ours?.accepted === true && isCanonicalPlate(oursNorm);
  const dgPresent = hasPlateSubstance(dgNorm);

  const base = {
    oursPlate: oursRaw,
    deepgramPlate: dgRaw,
    oursNorm,
    deepgramNorm: dgNorm,
    oursUsable,
  };
  const decide = (
    plate: string, source: FusionSource, reason: FusionReason,
  ): FusionResult => ({
    ...base, plate, source, reason,
    needsReview: source !== "agree",
    agreed: source === "agree",
  });

  // ١. مافيش أي مرشّح → اطلب من المندوب يكرّر.
  if (!oursUsable && !dgPresent) return decide("", "none", "both_unavailable");

  // ٢. موديلنا مرفوض/مكسور و Deepgram موجود → مسار النهاردة بالحرف.
  if (!oursUsable) return decide(dgNorm, "deepgram", "ours_unusable_use_deepgram");

  // ٣. موديلنا مقبول و Deepgram فاضي (أو نصّ بلا لوحة).
  if (!dgPresent) return decide(oursNorm, "ours", "deepgram_empty_use_ours");

  // ٤. الاتنين موجودين ومتطابقين → إشارة اليقين (٩٩٫٠٪ صح على ٩٨/١٢٠ مقطع).
  if (oursNorm === dgNorm) return decide(oursNorm, "agree", "agree");

  // ٥. الاتنين موجودين ومختلفين. قاعدة الشيت الأول (لو متاحة)، وإلا موديلنا.
  //
  //    مبرّر القاعدة من القياس: في الـ٢٢ اختلاف موديلنا صح ١٨ وDeepgram صح ١.
  //    أي ترجيح إضافي لازم **ماتقدرش** تشيل جواب صح — وده بالظبط اللي شرط
  //    «واحد بالظبط» بيضمنه: لو موديلنا صح وعضو في الشيت فالقاعدة بترجّحه هو
  //    (نفس النتيجة)، ولو الاتنين أعضاء أو ولا واحد عضو فالقاعدة ساكتة والافتراضي
  //    (موديلنا) هو اللي يمشي. المكسب المحتمل: الاختلاف الوحيد اللي Deepgram كان
  //    صح فيه بينجو لو الحقيقة بس هي اللي على الشيت. المخاطرة الوحيدة (لوحة
  //    موديلنا الصح مش على الشيت ولوحة Deepgram الغلط عليه) بتخرج بعلامة مراجعة
  //    برضه، فالمندوب شايفها. والشيت هو الدليل الخارجي الوحيد المتاح وقت التنفيذ.
  const sheet = input.onCheckSheet;
  if (typeof sheet === "function") {
    const oursOn = askSheet(sheet, oursNorm);
    const dgOn = askSheet(sheet, dgNorm);
    // null = الدالة رمت استثناء ⇒ نتجاهل القاعدة بصمت.
    if (oursOn !== null && dgOn !== null) {
      if (oursOn && !dgOn) return decide(oursNorm, "ours", "disagree_sheet_prefers_ours");
      if (dgOn && !oursOn) return decide(dgNorm, "deepgram", "disagree_sheet_prefers_deepgram");
    }
  }
  return decide(oursNorm, "ours", "disagree_prefer_ours");
}

// ─────────────────────────────────────────────────────────────────────────────
// مزامنة الإنذار بعد ترقيع الحَكَم — آلة حالة الصفّارة والكارت
// =============================================================================
// ليه الملف ده محتاج الدالة دي؟ لأن ترقيع الحَكَم بيغيّر `row.found` **بعد** ما
// إنذار النطق طلع (أو مَطلعش)، وإعادة البحث بتبقى **صامتة** عن قصد عشان مانلفّش
// صفّارة تانية لنفس العربية. من غير مزامنة صريحة الحالتين دول بيحصلوا:
//
//   • F→T (اللي المراجعة العدائية أثبتته): لوحتنا على شيت التشييك ولوحة Deepgram
//     مش عليه ⇒ الصف يقلب «مطلوبة» (خلية الحالة والتلوين وعلامة «راجع» كلهم
//     بيتحدّثوا) و**ولا صفّارة** بتطلع وكارت «مطلوبة» مايفتحش. عربية مطلوبة
//     بتعدّي في سكوت.
//   • T→F: مسار الـfuzzy (≥٨٨٪) بيرجّع `found=true` بينما `checkIndex.has(dgNorm)`
//     بيرجّع false، فقاعدة الشيت بتشوف «ولا واحد عضو» وتسكت، موديلنا يكسب،
//     واللوحة الجديدة ماتطلعش على الشيت ⇒ الصف يقلب غير مطلوب **بعد** ما
//     الصفّارة اتشغّلت، والكارت يفضل واقف على اللوحة القديمة «مطلوبة».
//
// الثوابت اللي الدالة بتضمنها (مغطّاة بـ٣٢ حالة في `__tests__/plateFusion.test.ts`):
//   ١. **صفّارة واحدة بالظبط لكل نبضة**: `fire` عمرها ما تترجع لو الصفّارة
//      اتشغّلت خلاص (`wasFound`)، وعمرها ما تُنسى لو الحالة النهائية «مطلوبة».
//      (الصفّارة بترجع مرة واحدة بس؛ لو اتشغّلت والنهاية «غير مطلوبة» فأقصى اللي
//       ينفع نعمله هو تصفية الكارت — الجرس مابيترجّعش.)
//   ٢. **الكارت و`row.found` عمرهم ما يختلفوا** بعد تنفيذ الفعل.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * الفعل الواجب على كارت «مطلوبة» (وصفّارته) بعد ترقيع الحَكَم:
 *  - `fire`    → شغّل الإنذار للوحة الجديدة وافتح الكارت عليها (أول وآخر صفّارة).
 *  - `clear`   → اقفل الكارت لو كان واقف على الصف ده (الصف بقى غير مطلوب).
 *  - `repoint` → سيب الكارت مفتوح بس نقّله للوحة الجديدة (بلا صفّارة تانية).
 *  - `none`    → مافيش حاجة تتعمل.
 */
export type JudgeAlertAction = "fire" | "clear" | "repoint" | "none";

export interface JudgeAlertTransition {
  /**
   * هل ترقيع الحَكَم **اتطبّق فعلاً** على الصف؟ (اللوحة اتغيّرت + المندوب
   * مالمسهاش بإيده + إعادة البحث رجّعت نتيجة). لو false فالصف زي ما هو،
   * وبالتالي الكارت زي ما هو ⇒ `none`.
   */
  patched: boolean;
  /** لوحة الصف قبل الترقيع — اللي الصفّارة اتشغّلت عليها لو `wasFound`. */
  prevPlate: string;
  /** لوحة الصف بعد الترقيع (قرار `fusePlate`). */
  nextPlate: string;
  /** `row.found` قبل الترقيع ⇒ صفّارة واحدة اتشغّلت وقت النطق لو true. */
  wasFound: boolean;
  /** `found` من إعادة البحث الصامتة على `nextPlate`. */
  nowFound: boolean;
  /**
   * الصف لسه **موجود** في القائمة وقت وصول الرد؟ (`false` = المندوب مسحه).
   * غايب = `true` (توافق للخلف).
   *
   * ليه ده لازم يبقى هنا؟ `deletePttRow` بيقفل الكارت وبيشيل الصف، بس **مابيلغيش**
   * أي رد في الطريق (زمن الرد المقيس ٤١٠–٢٣٠٢ms). ورد لصف ممسوح كان بيوصل لفرع
   * `fire` ⇒ صفّارة + كارت «مطلوبة» لصف مش في القائمة، لأن `canJudgeWriteAlert`
   * بترجّع `true` على كارت مقفول. صف مش موجود = مافيش أي فعل.
   */
  rowAlive?: boolean;
}

/**
 * دالة **نقية** (بلا I/O ولا حالة): بتاخد الانتقال وترجّع فعل واحد، والصفحة هي
 * اللي تنفّذه. ترتيب الفحوص مقصود: **انتقال الحالة بيكسب على مقارنة اللوحة**،
 * فأي طريق نهايته «مطلوبة» بلا صفّارة سابقة بيطلّع صفّارة، حتى لو اللوحة نفسها
 * مااتغيّرتش (حالة مستحيلة عملياً — `found` دالة اللوحة + الشيت — بس الدالة
 * لازم تبقى كاملة ومحافظة).
 *
 * المقارنة **بعد التطبيع** دايماً: «دمهـ4420» و«دمه4420» نفس اللوحة، وأي `===`
 * على النص الخام كان هيطلّع `repoint` وهمي.
 */
/**
 * هوية الكارت المعروض / الكارت اللي عايزين نكتبه: أي صف، وترتيبه في الجلسة.
 * `seq` عدّاد **تصاعدي** بيتزوّد مع كل صف بيتخلق (`pttSeqRef`)، فالمقارنة بتقول
 * «مين أحدث» بلا أي اعتماد على الساعة (ساعة الجهاز تقدر ترجع لورا، والـ`id`
 * فيه `Date.now()` فمش صالح للمقارنة).
 */
export interface JudgeAlertCardRef {
  rowId: string;
  seq: number;
}

/**
 * هل ينفع الرأي التاني **يكتب** كارت «مطلوبة» دلوقتي؟
 *
 * ليه الدالة دي لازمة؟ فرع `fire` في `requestSecondOpinion` كان بيعمل
 * `setPttAlert({ … })` **بلا حرس** — بينما فرعي `clear` و`repoint` جانبه محروسين
 * بـ`a?.id === rowId`. بسقف طلب واحد كان ده غير قابل للوصول (رد واحد في المرة)؛
 * بعد ما السقف بقى ٢ + طابور ٢ بقى فيه ردّين في الهوا، ورد **متأخّر** لصف قديم
 * يقدر يمسح كارت **أحدث**. وده قابل للوصول على إيقاعه: ٥ من ٢٤ زوج صفوف متتابعة
 * في جلسته بينهم ١٫٥٦–٢٫٣٩ث (أقل من دورته ٢٫٩٨ث).
 *
 * القاعدة نفس قاعدة النطق بالحرف — **أحدث لوحة مطلوبة هي اللي تكسب الكارت** —
 * فمافيش سلوكين مختلفين للحاجة الواحدة. و**فشل مغلق**: أي تسلسل غير منتهي بين
 * صفّين مختلفين = ماتكتبش (نسيب الكارت القايم، هو على الأقل صف حقيقي).
 *
 * ⚠️ الصفّارة **مش** بتمرّ من هنا. الصفّارة حدث الصف نفسه (نبضة قلبت «مطلوبة»
 *    لازم تسمع مرة واحدة بالظبط)، والكارت عرض واحد لكل الصفوف. خلطهم كان بيكسر
 *    ثابت «ولا صفّارة ضايعة».
 */
export function canJudgeWriteAlert(
  current: JudgeAlertCardRef | null | undefined,
  mine: JudgeAlertCardRef,
): boolean {
  if (!current) return true;                       // مافيش كارت ⇒ اكتب
  if (current.rowId === mine.rowId) return true;   // كارتي ⇒ رقّعه
  const a = current.seq, b = mine.seq;
  if (typeof a !== "number" || !Number.isFinite(a)) return false;
  if (typeof b !== "number" || !Number.isFinite(b)) return false;
  return b > a;                                    // الأحدث بس هو اللي يكسب
}

export function decideJudgeAlertAction(t: JudgeAlertTransition): JudgeAlertAction {
  if (t.rowAlive === false) return "none";       // الصف اتمسح ⇒ مافيش صفّارة ولا كارت
  if (!t.patched) return "none";                 // الصف زي ما هو ⇒ الكارت زي ما هو
  if (!t.wasFound && t.nowFound) return "fire";  // بقى مطلوب ومافيش صفّارة اتشغّلت
  if (t.wasFound && !t.nowFound) return "clear"; // بقى غير مطلوب والصفّارة اتشغّلت خلاص
  if (!t.wasFound && !t.nowFound) return "none"; // مش مطلوب قبل ولا بعد
  // الاتنين مطلوبين: الصفّارة اتشغّلت خلاص، فالمطلوب بس إن الكارت يلحق اللوحة.
  return normalizePlate(t.prevPlate) === normalizePlate(t.nextPlate) ? "none" : "repoint";
}
