/**
 * ==========================================================================
 *  سجل اللوحة — الوحدة اللي الصفحتين بيشتغلوا بيها
 * ==========================================================================
 *  كل لوحة بتظهر على الشاشة هي «سجل» بيجمّع أربع حاجات مع بعض:
 *    ١. نتيجة المراجعة (اللوحة + الثقة + التصحيحات)
 *    ٢. دبوس الموقع لحظة النطق
 *    ٣. نتيجة المطابقة على شيت البنك + تفاصيل السيارة
 *    ٤. وقت التسجيل والمصدر
 *
 *  والتصدير لـ Excel/CSV بياخد كل ده في صف واحد.
 */

import * as XLSX from "xlsx";
import type { ReviewedPlate } from "./plateReview";
import type { GpsPin } from "./gps";
import { pinLink } from "./gps";
import type { BankMatch, BankSheet } from "./bankSheet";
import { rowDetails } from "./bankSheet";

/**
 * مرحلة التأكيد — **بتحل محل نسبة الثقة في العرض الحي**.
 *
 * ⚠️ ليه؟ النسبة كانت مقلوبة ومضلّلة: قراءة Deepgram اللي موديلنا لسه
 * ماشافهاش كانت بتعرض **١٠٠٪**، واللي اتفق عليها المحرّكان **٩٩٪** —
 * فأقل قراءة موثوقة تبان أعلى ثقة. السبب إن ‎extractPlates‎ بيشغّل محرّك
 * المراجعة اللي بيبدأ من ١٠٠ وبيخصم، والقيمة ‎60‎ المقصودة للحالة غير
 * المراجَعة مكانت بتشتغل إلا لما الاستخراج يفشل تماماً.
 *
 * والحالة أصدق من الرقم كمان: النسبة محتاجة تفهمها وتقارنها، والحالة
 * بتتقرا بلمحة — وده اللي محتاجه المندوب وهو ماشي وبيتكلّم.
 */
export type PlateStage =
  /** Deepgram سمعها وموديلنا لسه ماراجعهاش */
  | "heard"
  /** المحرّكان قالوا نفس اللوحة — أقوى يقين عندنا */
  | "agreed"
  /** اختلفوا وأخدنا الأقوى — تستحق نظرة */
  | "conflict"
  /** شكلها مش سليم أو البوابة رفضتها */
  | "shaky"
  /**
   * المحلّل حشّى جزء ناقص (أرقام بأصفار / حروف من كلمة مكركبة).
   *
   * 🔴 **كانت مدموجة مع `shaky`** فالكارت كان بيقول «شكلها غلط» على لوحة
   * شكلها سليم تماماً. المالك شافها بعينه: بطاقة فيها «شكل سليم: ٣ حروف
   * معتمدة + ٤ أرقام» **و**«شكلها غلط» في نفس الوقت. سببين مختلفين
   * مايتعرضوش بنفس الكلمة.
   */
  | "padded"
  /**
   * موديلنا **ماراجعهاش** — والسبب معروف بالاسم.
   *
   * 🔴 قبل كده الكارت كان بيفضل «بتتراجع…» للأبد وهو مش بيتراجع. السبب
   * كان بيتعدّ في التقرير بس الكارت مايعرفوش.
   */
  | "unreviewed"
  /** المندوب عدّلها بإيده — فوق أي محرّك */
  | "edited";

export interface PlateEntry {
  id: string;
  /**
   * درجة البطاقة قبل ما الشاهد يعلّمها — عشان لو الخلاف اتحل نرجّعها
   * بدل ما تفضل 👁 للأبد. شوف `dropStaleWitnessNotes`.
   */
  witnessPrevStage?: PlateStage;

  review: ReviewedPlate;
  pin: GpsPin | null;
  match: BankMatch;
  /** وقت ظهور اللوحة (ملي ثانية) */
  capturedAt: number;
  source: "batch" | "live";
  /** مرحلة التأكيد — العرض الحي بيستخدمها بدل النسبة */
  stage?: PlateStage;
  /**
   * المحلّل حشّى أرقام ناقصة بأصفار أو لمّ الحروف من كلمة مكركبة.
   * لازم تعيش على السجل لآخر الدمج — الدمج بيعيد حساب المرحلة، ولو العلامة
   * ضاعت في الطريق اللوحة المخترعة بترجع تطلع «مؤكّدة ✓».
   */
  uncertain?: boolean;
  /**
   * قراءة Deepgram للصف ده زي ما وصلت — **شاهد مستقل على النطق**.
   *
   * 🔴 محتاجينها في الدمج: لما موديلنا يقرا صف على إنه جاره، البطاقتين
   * بيبانوا نسخة واحدة فالدمج بيمسح لوحة حقيقية. وقراءة Deepgram هي
   * الدليل الوحيد إنهم نطقين مختلفين — «حب6986» مقابل «حرب2205».
   * (٤ لوحات ضاعت كده في جلسة ٦٠ لوحة بسرعة المندوب، ٢٠٢٦/٨/١٥.)
   */
  deepgramPlate?: string;
  /**
   * الحتة من الشريط اللي رأي موديلنا اتاخد عليها.
   *
   * 🔴 التطابق الكامل فيها بين بطاقتين = **نطق واحد بشكل قاطع** — حتة
   * صوت واحدة ماتحصلش من عربيتين. وده بيغلب حارس ‎deepgramPlate‎ فوق:
   * لما Deepgram يقرا للحتة الواحدة حاجتين، ده غلط قراءة مش دليل نطقين.
   * (حوك8005 طلعت بطاقتين على ١٧١.٢→١٧٤.١ث في الاتنين، جلسة ٩٠ لوحة.)
   */
  judgeWindow?: { startMs: number; endMs: number };
  /**
   * مصدر النافذة (`plate_words` · `message_split` · …).
   *
   * 🔴 لازم على البطاقة نفسها — حاجز التكرار محتاجه عشان يعرف إن قراءة
   * Deepgram على البطاقة دي تستاهل تتحسب دليل على «نطقين» ولا لأ.
   * (`message_split` دقّته ٤٣٪ فقراءته مش دليل.) شوف `windowTrust.ts`.
   */
  windowSource?: string | null;

  /* ───────── حقول المندوب الإضافية (كلها اختيارية) ─────────
   * اختيارية بقصد: التسجيل المجمّع والسجلات القديمة المسترجَعة مفيهاش،
   * ولو بقت إجبارية كل سجل قديم في localStorage هيتكسر عند التحميل. */

  /**
   * نوع السيارة — قيمة من `VEHICLE_TYPES` يختارها المندوب من منسدلة.
   * مش جزء من هوية اللوحة، فتعديله ما بيقلبش `stage` لـ«تعديلك».
   */
  vehicleType?: string;
  /**
   * اسم الحي وقت النطق — بيتعبّى تلقائياً من `pin` عبر reverse-geocode بلا
   * مفتاح، ولو النت فصل المندوب يكتبه بإيده. مربوط بنفس الدبوس (`pin`).
   */
  neighborhood?: string;
  /** ملاحظة حرة يكتبها المندوب — بتتحفظ وتتصدّر وتتدفّق لصفحة الداتا. */
  note?: string;
  /** 🧾 «اسم المسجّل» من المربع لحظة النطق (١٨ أكتوبر ٢٠٢٦) — فاضي ⇒ عموده مايظهرش */
  recorderName?: string;
  /** 🏘️ «اسم الحي» جه من موقع اللوحة (المندوب ماكتبوش) — `components/mujammaa/lib/autoDistrict.ts` */
  neighborhoodAuto?: boolean;
  /**
   * ✍️ النوع اللي البرنامج طلّعه **قبل** ما المندوب يغيّره من المنسدلة (`""` = ماكانش فيه نوع) — للتقرير بس
   * («قال ونيت وطلع فان»)، مابيتصدّرش. بيتحفظ أول تغيير بس (١٩ أكتوبر ٢٠٢٦).
   */
  typeHeard?: string;
}

/**
 * 🔴 **تلات تصنيفات، عمودين.**
 *
 * طلب المالك (٩ سبتمبر ٢٠٢٦): **نوع العربية** يفضل في عمود «نوع السيارة»،
 * و**حالتها ومكانها** يروحوا عمود «ملاحظة المندوب». الحقلين موجودين أصلاً
 * في `PlateEntry` (`vehicleType` و `note`) وبيتصدّروا وبيتدفّقوا لصفحة
 * الداتا — فمافيش عمود جديد ولا هجرة بيانات.
 *
 * **البق اللي ده بيصلّحه:** الماسح كان بيرجّع **قيمة واحدة** («الأخير
 * يكسب»)، فلو المالك قال نوع **و**حالة، النوع **بيضيع**:
 *     «ونيت مصدومه» → مصدومه   ·   «فان جراج يمين» → فان ضاع
 *
 * وبنفصل **الحالة** عن **المكان** كذلك (مش تصنيف واحد) عشان كل تصنيف ياخد
 * **قيمة واحدة، الأخيرة تكسب** — نافذة النوع بتبدأ ثانيتين قبل مركز اللوحة
 * فأولها ذيل اللوحة اللي قبلها، ولمّ **كل** المطابقات كان هيسرّب حالتها.
 */

/**
 * **نوع العربية** — بيروح لعمود «نوع السيارة».
 *
 * 🔴 قاعدة المالك: لو سمع حاجة برّه القائمة **ميهلوسش** — يسيبها فاضية
 * أحسن ما يكتب تخمين.
 *
 * الأنواع المعلّمة ⟨مقيسة⟩ اتطلعت من **عدّ شيتات المناديب الحقيقية**
 * (٤ سبتمبر ٢٠٢٦) — مكانتش في القائمة والمناديب بيستخدموها فعلاً.
 */
export const VEHICLE_TYPE_KINDS = [
  "ملاكي",
  "ونيت",
  "نقل",
  "فان",
  "تاكسي",
  "دينه",
  "دباب",
  "باص",
  "موتوسيكل",
  "شاص",
  "اتش١",
  "غمارتين",
  "غمارة",
  "هاي اس",
  "جينيسيس",
  // 🔴 «ديانا» اتشالت كعضو منفصل — قرار المالك (٣ أكتوبر ٢٠٢٦): هي نفس
  //   العربية «دينه» والإملاء الصح «دينه». نطقاتها (ديانا · ديانة · ديان ·
  //   دينا · دينة) بتتحوّل «دينه» في VARIANTS (vehicleTypeScan.ts).
  "شاحنه",
  "صالون",
  "دفع رباعي",
  "نقليات",
  /**
   * ⬇️ **إضافة ١٠ سبتمبر ٢٠٢٦ — من جرد شيتات المناديب الحقيقية.**
   * `TYPE_DATA_INVENTORY.md`: ١٥٠ قيمة في عمود النوع، **٢١ بس** كانت في
   * القائمة. دي اللي المناديب بيقولوها فعلاً وكانت **مستحيل تتطابق**.
   * العدد جنب كل واحدة = مرات ظهورها في الشيتات.
   */
  "ميكروباص",      // ١٠ · ٣ مناديب
  "كوستر",         // ٢
  "اتوبيس",        // ٢
  "حافله",         // ٢
  "دوكر",          // ٣ · ٢ مناديب
  "سطحه",          // ٣ · ٣ مناديب
  "تريلا",         // ١
  "راس شاحنه",     // ١
  // ماركات — القائمة أصلاً فيها «جينيسيس» فالماركة جزء من المفردات
  "مرسيدس",        // ٧
  "دودج",          // ٤
  "جران ماكس",     // ٤
  "اودي",          // ٣
  "استار",         // ٣
  "رينج",          // ٢
  "بي ام",         // ٢
  "لكزس",          // ١
  "توسان",         // ١
  /**
   * 🔴 **«لوحه صفرا» نوع، مش مكان (تصحيح المالك، ٩ سبتمبر ٢٠٢٦).**
   * اللوحة الصفرا في السعودية معناها **ملاكي تبع شركة** — فهي وصف نوع زي
   * «ونيت»، ومنها بنعرف إن العربية ملاكي شركة. كانت مصنّفة «مكان» غلط.
   */
  "لوحه صفرا",
] as const;

/**
 * **حالة العربية ومكانها** — بيروحوا لعمود «ملاحظة المندوب».
 *
 * 🔴 **المكان مش «نوع»** — بس قيمته التشغيلية مش أقل: المندوب بيستخدمه
 * عشان يلاقي العربية تاني.
 *
 * ⚠️ وفيه عبارات من **٤ و٥ كلمات** («برحه اخر الشارع يمين»). الماسح لازم
 * ياخد **الأطول أولاً** لأن «برحه يمين» جوّه «برحه اخر الشارع يمين»،
 * ومكان غلط أوحش من مكان فاضي.
 */
/** **حالة العربية** — تصنيف مستقل عشان ياخد قيمة واحدة (الأخيرة تكسب). */
export const VEHICLE_CONDITION_KINDS = [
  "مصدومه",
  "متربه",
  "مركونه",
  "متحركة",
  "حادث",
  // ⬇️ من جرد الشيتات (١٠ سبتمبر ٢٠٢٦)
  "متغطيه",             // ٨ · ٢ مناديب
  "مهمل",               // ٢
  "قديم",               // ٢
  "مسحوب",              // ١
  "مبنشره",             // ١
  "بدون لوحه اماميه",   // ١
] as const;

/** **مكان العربية** — تصنيف مستقل، عشان الحالة والمكان يتحفظوا **مع بعض**. */
export const VEHICLE_PLACE_KINDS = [
  // 🔴 «جراج» لوحدها — المالك بيقولها كده في تسجيلاته. كانت ناقصة فالكلمة
  // كانت مستحيل تطابق (٩ سبتمبر ٢٠٢٦). مستثناة من المطابقة التقريبية في
  // vehicleTypeScan عشان «جرار»/«جراح» ماياخدوش مكانها.
  "جراج",
  "جراج يمين",
  "جراج يسار",
  "برحه اخر الشارع يمين",
  "برحه اخر الشارع يسار",
  "برحه اول الشارع يمين",
  "برحه اول الشارع يسار",
  "برحه يمين",
  "برحه يسار",
  "امام فندق",
  "فندق",
  /**
   * ⬇️ من جرد الشيتات (١٠ سبتمبر ٢٠٢٦). **دول أكتر اللي بيتقال فعلاً**
   * و«مظله» لوحدها ظهرت ١٣٨ مرة — أكتر من أي نوع في القائمة القديمة.
   *
   * 🔴 **بالشكل المنطوق مش شكل الشيت.** الشيت بيكتب «جراش1يمين»، والمنطوق
   * «جراج واحد يمين». الماسح بيطابق كلام الموديل (منطوق)، وفكّ رموز
   * الشيتات خريطة **تانية** خاصة بتحضير التدريب.
   */
  "مظله",                  // ١٣٨
  "تنده",                  // ٨٦ · ٤ مناديب
  "تحت تنده",              // ٥١
  "اخر الشارع",            // ٥٢ · ٢ مناديب
  "اول الشارع",            // ١
  "جراج بدروم",            // ٩
  "جراج واحد يمين",        // ٢٢ · ٣ مناديب (جراش1يمين)
  "جراج واحد يسار",        // ١٠ · ٢ مناديب
  "جراج اتنين يمين",       // ٣
  "جراج اتنين يسار",
  "جراج تلاته يمين",       // ٦
  "جراج تلاته يسار",
  "مسجد",                  // ٢
  "داخل محطه",             // ١
  "باكيه منزل",            // ٢
  "داخل باكيه منزل",       // ٣
  "داخل بيت",              // ١
  "طلعه يمين",             // ١
  "طلعه يسار",
  "لفه يمين",
  "لفه يسار",              // ١
] as const;

/** اللي بيروح لعمود «ملاحظة المندوب» = الحالة + المكان. */
export const VEHICLE_NOTE_KINDS = [
  ...VEHICLE_CONDITION_KINDS,
  ...VEHICLE_PLACE_KINDS,
] as const;

/**
 * القائمة الكاملة — للمنسدلة اليدوية والتوافق مع السجلات القديمة.
 * ⚠️ الاتحاد ده **لازم يفضل** موجود: المنسدلة و`PlateTable` بيلفّوا عليه.
 */
export const VEHICLE_TYPES = [
  ...VEHICLE_TYPE_KINDS,
  ...VEHICLE_NOTE_KINDS,
  "أخرى",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

let idCounter = 0;

/**
 * بادئة عشوائية لكل تحميل للصفحة.
 *
 * ⚠️ من غيرها كان بيحصل تصادم معرّفات: العدّاد بيرجع صفر مع كل تحميل،
 * فلوحة مسترجَعة اسمها ‎plate-3-ابح1234‎ بتتصادم مع تالت لوحة جديدة لو
 * كانت نفس اللوحة ⇒ مفتاحين متطابقين في React، و«حذف» بيشيل الصفّين.
 */
const SESSION_PREFIX = Math.random().toString(36).slice(2, 8);

export function makePlateEntry(input: {
  review: ReviewedPlate;
  pin: GpsPin | null;
  match: BankMatch;
  source: "batch" | "live";
  capturedAt?: number;
  stage?: PlateStage;
  uncertain?: boolean;
  vehicleType?: string;
  neighborhood?: string;
  note?: string;
  recorderName?: string;
}): PlateEntry {
  idCounter += 1;
  return {
    id: `plate-${SESSION_PREFIX}-${idCounter}-${input.review.plate}`,
    review: input.review,
    pin: input.pin,
    match: input.match,
    capturedAt: input.capturedAt ?? Date.now(),
    source: input.source,
    stage: input.stage,
    uncertain: input.uncertain,
    vehicleType: input.vehicleType,
    neighborhood: input.neighborhood,
    note: input.note,
    ...(input.recorderName ? { recorderName: input.recorderName } : {}),
  };
}

/**
 * يعدّل حقول المندوب الوصفية على سجل — نسخة جديدة (immutable).
 *
 * ⚠️ منفصلة عن `editEntry`/`applyManualEdit` بقصد: تعديل اللوحة بيقلب
 * `stage` لـ«تعديلك»، لكن الحقول دي (نوع/حي/ملاحظة) **مش** جزء من هوية
 * اللوحة فما تلمسش `review` ولا `stage`. قيمة فاضية/مسافات = تمسح الحقل.
 */
/**
 * 🔴 **هل القيمة الجديدة ترقية للقديمة؟**
 *
 * القاعدة في الفوري كانت «املا الخانة لو فاضية بس» — فأول إجابة قصيرة
 * بتقفل الباب قدام الأطول الصح. من جلسة ١٦ سبتمبر ٢٠٢٦:
 *
 *     ددي3636 : «برحه اخر الشارع يسار» ← اتكتب «اخر الشارع»
 *     لقا9821 : «راس شاحنه»            ← اتكتب «شاحنه»
 *
 * الترقية **أحادية الاتجاه**: الجديد لازم يكون شامل القديم بحروفه
 * الملزوقة. فمفيش قيمة **مختلفة** تقدر تبدّل قيمة موجودة — ودي نفس
 * القاعدة اللي بتمنع نوع اللوحة الجارة إنه يزحلق.
 */
export function upgradesValue(
  old: string | null | undefined,
  next: string | null | undefined
): boolean {
  const b = String(next || "").trim();
  if (!b) return false;
  const a = String(old || "").trim();
  if (!a) return true;
  if (a === b) return false;
  const g = (x: string) => x.replace(/[\s·]/g, "");
  return g(b).length > g(a).length && g(b).includes(g(a));
}

export function annotateEntry(
  entry: PlateEntry,
  patch: { vehicleType?: string; neighborhood?: string; note?: string }
): PlateEntry {
  const next = { ...entry };
  if ("vehicleType" in patch) next.vehicleType = patch.vehicleType?.trim() || undefined;
  if ("neighborhood" in patch) next.neighborhood = patch.neighborhood?.trim() || undefined;
  if ("note" in patch) next.note = patch.note?.trim() || undefined;
  return next;
}

/* ------------------------------------------------------- مرحلة التأكيد */

/** الاسم المعروض للمرحلة — بلا نسب، الحالة بس */
export function stageLabel(stage: PlateStage): string {
  if (stage === "agreed") return "مؤكّدة ✓";
  if (stage === "heard") return "بتتراجع…";
  // conflict = المحرّكان اختلفوا وأخدنا الأقوى — غالباً صح. «راجعها» كانت
  // بتوحي بالخطأ؛ «محتاجة نظرة» تلميح هادي بأنها تستحق بصّة، مش إنها غلط.
  if (stage === "conflict") return "محتاجة نظرة 👁";
  if (stage === "edited") return "تعديلك";
  // فيها جزء إحنا حشّيناه — **مش** «شكلها غلط»
  if (stage === "padded") return "فيها حشو";
  // موديلنا ماشافهاش — السبب في الملاحظات
  if (stage === "unreviewed") return "بلا مراجعة";
  return "شكلها غلط";
}

/**
 * شرح الحالة (tooltip).
 *
 * 🔴 **كان في `StageChip` وبيكدب.** أي حالة مش في القايمة كانت بتاخد
 * «شكلها مش ٣ حروف + ٤ أرقام» — يعني نفس الكذبة اللي في اللافتة، مكرّرة
 * في التلميح. نقلته هنا عشان يبقى مختبَر ومش نسخة تانية من المنطق.
 */
export function stageTitle(stage: PlateStage): string {
  switch (stage) {
    case "agreed":
      return "Deepgram وموديلنا قالوا نفس اللوحة";
    case "heard":
      return "Deepgram سمعها · موديلنا لسه بيراجع";
    case "conflict":
      return "المحرّكان اختلفوا وأخدنا الأقوى — غالباً صح، راجعها بنظرة سريعة";
    case "edited":
      return "انت عدّلتها بإيدك";
    case "padded":
      return "الشاهد سمع جزء ناقص وإحنا كمّلناه — راجع الأرقام";
    case "unreviewed":
      return "موديلنا ماراجعهاش — السبب مكتوب في الملاحظات";
    default:
      return "شكلها مش ٣ حروف + ٤ أرقام";
  }
}

/**
 * المرحلة من نتيجة الدمج وحالة الشكل.
 *
 * الترتيب مقصود: **الشكل الغلط يغلب كل حاجة**. لوحة مش ٣ حروف + ٤ أرقام
 * معروف إنها غلط، فمايصحّش تتعرض «مؤكّدة» حتى لو المحرّكان اتفقوا عليها.
 */
export function stageOf(input: {
  agreed: boolean;
  shapeOk: boolean;
  manuallyEdited?: boolean;
  /**
   * المحلّل حشّى أرقام ناقصة بأصفار (أو لمّ الحروف من كلمة مكركبة).
   *
   * 🔴 لازم تغلب الاتفاق: بعد الحشو الشكل بيبقى ٣ حروف + ٤ أرقام فبوابة
   * الشكل بتقول «سليمة»، ولو المحرّكين اتفقوا على القيمة المحشية البطاقة
   * كانت بتطلع **«مؤكّدة ✓»** — يعني رقم مخترع بعلامة يقين.
   *
   * المقيس على ٢٠٠ مقطع بلا لوحة: «تمانية واحد» → ‎0081‎ ·
   * «يوم أربعة سبعة» → ‎يوم0047‎. ولوحة مخترعة أوحش من لوحة ضايعة.
   */
  uncertain?: boolean;
  /**
   * النافذة اللي الرأي اتاخد عليها **مش مثبَتة** إنها صوت اللوحة دي.
   *
   * 🔴 مقيس على ٢٤٠ بطاقة: الاتفاق على نافذة ضعيفة دقّته **٦٧٪** مقابل
   * ٩٤٪ للاتفاق عموماً. أربع لوحات غلط طلعت «مؤكّدة ✓» كده (ودا1668 ·
   * نكو6857 · بعص9968 · مل6860). والمحرّكان لما يقروا نفس الصوت الغلط،
   * اتفاقهم مش دليل. التفاصيل في `windowTrust.ts`.
   */
  weakWindow?: boolean;
}): PlateStage {
  if (input.manuallyEdited) return "edited";
  /**
   * 🔴 **الترتيب والفصل مقصودين.** كان سطر واحد:
   *     if (!shapeOk || uncertain) return "shaky";
   * فالحشو كان بيتعرض «شكلها غلط» — وصف **غلط** للوحة شكلها سليم.
   * الشكل أقطع فبيغلب، والحشو ليه اسمه.
   */
  if (!input.shapeOk) return "shaky";
  if (input.uncertain) return "padded";
  // اتفاق على نافذة مش مثبَتة = مش يقين. ٦٧٪ مقابل ٩٤٪ (مقيس).
  if (input.weakWindow) return "conflict";
  return input.agreed ? "agreed" : "conflict";
}

/** يطبّع للمقارنة — فراغ وهمزات */
function normPlate(x: string): string {
  return String(x || "").split(/\s+/).join("")
    .replace(/[أإآ]/g, "ا")
    .trim();
}

function isCompletePlate(p: string): boolean {
  const s = normPlate(p);
  const letters = (s.match(/[؀-ۿ]/g) || []).length;
  const digits = (s.match(/\d/g) || []).length;
  return letters >= 3 && digits >= 4;
}

/**
 * هل الحشو **لسه في اللوحة المعروضة**؟
 *
 * 🔴 المشكلة: راية الحشو بتترفع وقت تحليل **شظية الشاهد** (`0000` · `د` ·
 * `٥`)، وبعدين موديلنا بيكسب بلوحة كاملة قراها بنفسه — **والراية بتفضل**.
 * فالشريحة الحمراء بتوصف نصّ مش معروض.
 *
 * والقاعدة هنا **ضيّقة بقصد**: الراية تتطفي **بس** لو اللوحة المعروضة هي
 * بالحرف قراءة موديلنا **وهي كاملة** (٣ حروف + ٤ أرقام). ساعتها مافيش أي
 * حشو في اللي بيتعرض.
 *
 * ⚠️ ومابنوسّعش أكتر من كده: الراية موجودة تمنع رقم مخترع يطلع «مؤكّدة ✓»
 * (مقيس: «تمانية واحد» → `0081`). لو طفّيناها بشكل واسع نرجّع البق ده.
 */
export function paddingStillApplies(input: {
  finalPlate: string;
  oursPlate?: string | null;
  parserPadded: boolean;
}): boolean {
  if (!input.parserPadded) return false;
  const ours = input.oursPlate ? normPlate(input.oursPlate) : "";
  if (!ours) return true;
  if (normPlate(input.finalPlate) !== ours) return true;
  return !isCompletePlate(ours);
}

/**
 * سبب تخطّي المراجعة بالعربي — للمندوب، مش للمطوّر.
 *
 * 🔴 الأسباب دي كانت بتتعدّ في التقرير بس **مابتوصلش الكارت**، فالكارت
 * كان بيفضل «بتتراجع…» للأبد وهو مش بيتراجع.
 */
const SKIP_LABELS: Record<string, string> = {
  not_configured: "سيرفر الموديل مش مظبوط",
  no_timing: "مافيش توقيت للكلمات — مش عارفين نقصّ فين",
  stale_stream: "التوقيت من تيار صوت قديم",
  window_unproven: "مش قادرين نثبت إن النافذة دي هي اللوحة",
  busy: "الموديل كان مشغول بأربع مراجعات — دي اتخطّت",
  queue_full: "الطابور ملآن — دي اتخطّت",
  no_audio: "الصوت في النافذة دي فاضي",
  prefix_too_large: "النافذة أكبر من الحد — اتخطّت",
  multi_plate_message: "الرسالة فيها أكتر من لوحة ومش قادرين نقسّمها",
  carried_over: "اللوحة اتقسمت بين رسالتين — مافيش نافذة مثبَتة ليها",
  split_too_long: "القسمة طلعت أطول من اللازم",
  window_after_audio: "النافذة بتبدأ بعد آخر صوت عندنا",
};

export function judgeSkipLabel(reason: string): string {
  return SKIP_LABELS[reason] ?? `موديلنا ماراجعهاش (${reason})`;
}

/* ------------------------------------------------------- نصوص العرض */

export function matchLabel(match: BankMatch): string {
  if (match.kind === "exact") return "مطلوبة ✓";
  return "غير مطلوبة";
}

export function statusLabel(status: ReviewedPlate["status"]): string {
  if (status === "solid") return "سليمة";
  if (status === "review") return "محتاجة مراجعة";
  return "ضعيفة";
}

/* --------------------------------------------------------- التصدير */

/** صف واحد في ملف التصدير */
function toExportRow(
  entry: PlateEntry,
  sheet: BankSheet | null,
  index: number
): Record<string, string> {
  const { review, pin, match } = entry;

  const details = sheet ? rowDetails(match.row, sheet.plateColumn) : [];
  const detailsText = details.map((d) => `${d.label}: ${d.value}`).join(" | ");

  const row: Record<string, string> = {
    // ترقيم متسلسل على الملف كله.
    // ‎review.order‎ بيتصفّر مع كل تفريغ، فلو استخدمناه في البث المباشر
    // كانت كل اللوحات هتطلع «١» لأن كل نطقة تفريغ مستقل.
    "#": String(index + 1),
    "ترتيبها في التفريغ": String(review.order),
    الحروف: review.letters.join(" "),
    الأرقام: review.digits,
    "اللوحة كاملة": review.plate,
    "اللوحة كما سمعناها": review.heardPlate,
    /**
     * ⚠️ «الثقة ٪» بتفضل للتوافق مع الملفات القديمة، بس **متعتمدش عليها في
     * البث المباشر**: قراءة موديلنا لسه ماشافهاش كانت بتطلع ١٠٠٪ واللي اتفق
     * عليها المحرّكان ٩٩٪. العمود اللي بعده («التأكيد») هو الصح.
     */
    "الثقة ٪": String(review.confidence),
    // التأكيد — **نفس اللي البطاقة بتعرضه على الشاشة بالحرف**، فالتقرير
    // والملف يقولوا نفس كلام الشاشة. («—» = تسجيل مجمّع، مافيهوش مراحل)
    التأكيد: entry.stage ? stageLabel(entry.stage) : "—",
    الحالة: statusLabel(review.status),
    // حقول المندوب — الاسم للقراءة السريعة، والإحداثيات تحت للدقة
    "نوع السيارة": entry.vehicleType ?? "",
    الحي: entry.neighborhood ?? "",
    "ملاحظة المندوب": entry.note ?? "",
    "شيت البنك": matchLabel(match),
    "نسبة التطابق ٪": match.kind === "none" ? "" : String(match.similarity),
    "تفاصيل السيارة": detailsText,
    "دبوس الموقع": pinLink(pin) ?? "",
    "خط العرض": pin ? pin.lat.toFixed(6) : "",
    "خط الطول": pin ? pin.lng.toFixed(6) : "",
    "دقة الموقع (م)": pin ? String(Math.round(pin.accuracy)) : "",
    "الموقع قديم؟": pin ? (pin.stale ? "نعم" : "لا") : "بدون موقع",
    الوقت: new Date(entry.capturedAt).toLocaleString("ar-EG"),
    المصدر: entry.source === "batch" ? "تسجيل مجمع" : "بث مباشر",
    التصحيحات: review.corrections
      .map((c) => `${c.from}→${c.to} (${c.reason})`)
      .join(" | "),
    ملاحظات: review.notes.join(" | "),
    "النص الأصلي": review.raw,
  };

  // لو فيه شيت بنك، بنفرد أعمدته كأعمدة مستقلة كذلك —
  // فالمندوب يقدر يفرز ويفلتر عليها في Excel عادي.
  if (sheet && match.row) {
    for (const header of sheet.headers) {
      if (header === sheet.plateColumn) continue;
      row[`[شيت] ${header}`] = match.row[header] ?? "";
    }
  }

  return row;
}

export function buildExportRows(
  entries: PlateEntry[],
  sheet: BankSheet | null
): Record<string, string>[] {
  // الأقدم أول — البطاقات معروضة الأحدث فوق، بس في الملف الترتيب
  // الزمني أنفع للمراجعة
  return [...entries]
    .sort((a, b) => a.capturedAt - b.capturedAt)
    .map((e, i) => toExportRow(e, sheet, i));
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
    d.getHours()
  )}-${pad(d.getMinutes())}`;
}

/** يبني ملف Excel (بلوب) من اللوحات بكل تفاصيلها + الموقع — يستخدمه التنزيل والمشاركة. */
export function buildEntriesXlsxBlob(
  entries: PlateEntry[],
  sheet: BankSheet | null,
  /**
   * عدّادات التشخيص — ورقة تانية في نفس الملف.
   *
   * ⚠️ ليه في الإكسل مش في التقرير المنسوخ بس؟ لأن النسخ للحافظة بيفشل
   * على الموبايل أحياناً (المتصفح بيرفض بلا سبب ظاهر)، وساعتها بنفضل
   * نخمّن ليه موديلنا سكت. الملف بينزل دايماً — فالتشخيص لازم يبقى فيه.
   */
  diagnostics?: Record<string, Record<string, number>>,
  /**
   * الكلام الخام اللي المحرّك سمعه — ورقة تالتة.
   *
   * ⚠️ دي الحاجة الوحيدة اللي بتفسّر **اللوحة اللي مافيش لها بطاقة**: لو
   * اللوحة ضاعت، مافيش صف يشرح ليه، والسبب الوحيد اللي ممكن يبان هو نص
   * Deepgram في اللحظة دي. كانت في التقرير المنسوخ بس — والنسخ للحافظة
   * فشل على موبايل المندوب، فقعدنا نخمّن.
   */
  heard?: Array<{ engine: string; text: string; plates: string[] }>,
  /**
   * سطر تحذير عن **صحة الجلسة نفسها** — أهم من أي عدّاد تحته.
   *
   * ⚠️ ليه في أول ورقة التشخيص؟ لأن جلسة ٢٠٢٦/٨/١٥ (٣٠ لوحة) مشيت
   * والمحرّك التاني ميّت، وطلعت النتيجة كأنها قياس للمحرّك المدمج.
   * الملف مكانش فيه أي أثر إن ده حصل، فالمقارنة بالجلسة اللي قبلها
   * كانت هتبقى بين حاجتين مختلفتين خالص.
   */
  sessionWarning?: string | null
): Blob {
  const rows = buildExportRows(entries, sheet);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "اللوحات");

  if (diagnostics || sessionWarning) {
    const diagRows: Record<string, string>[] = [];
    if (sessionWarning) {
      diagRows.push({ القسم: "⚠️ حالة الجلسة", السبب: sessionWarning, العدد: "" });
      diagRows.push({ القسم: "", السبب: "", العدد: "" });
    }
    for (const [group, counts] of Object.entries(diagnostics ?? {})) {
      const keys = Object.keys(counts);
      if (!keys.length) {
        diagRows.push({ القسم: group, السبب: "(مافيش)", العدد: "0" });
        continue;
      }
      for (const k of keys.sort((a, b) => counts[b] - counts[a])) {
        diagRows.push({ القسم: group, السبب: k, العدد: String(counts[k]) });
      }
    }
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(diagRows),
      "التشخيص"
    );
  }

  /**
   * ⚠️ الورقة بتتضاف **دايماً** لو المنادي بعت المصفوفة — حتى لو فاضية.
   *
   * أول نسخة كانت ‎if (heard?.length)‎، وفي جلستين ورا بعض الورقة مانزلتش
   * ومكانش فيه طريقة أعرف السبب: كود قديم في كاش الموبايل؟ ولا السجل كان
   * فاضي؟ ولا المندوب مسحه؟ غياب الورقة كان بيشيل الدليل بدل ما يقدّمه.
   */
  if (heard) {
    // الأقدم أول — نفس ترتيب النطق زي ورقة اللوحات
    const heardRows = heard.length
      ? [...heard].reverse().map((h, i) => ({
          "#": String(i + 1),
          المحرك: h.engine,
          "الكلام الخام": h.text,
          "اللوحات اللي طلعت": h.plates.length ? h.plates.join(" · ") : "(مافيش)",
        }))
      : [{ "#": "0", المحرك: "—", "الكلام الخام": "(السجل كان فاضي)", "اللوحات اللي طلعت": "—" }];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(heardRows),
      "اللي المحرك سمعه"
    );
  }

  const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** تصدير Excel (تنزيل) */
export function exportEntriesToExcel(
  entries: PlateEntry[],
  sheet: BankSheet | null,
  fileLabel = "لوحات",
  diagnostics?: Record<string, Record<string, number>>,
  heard?: Array<{ engine: string; text: string; plates: string[] }>,
  sessionWarning?: string | null
): void {
  triggerDownload(
    buildEntriesXlsxBlob(entries, sheet, diagnostics, heard, sessionWarning),
    `${fileLabel}_${stamp()}.xlsx`
  );
}

/** تصدير CSV — بـ BOM عشان Excel يقرا العربي صح */
export function exportEntriesToCsv(
  entries: PlateEntry[],
  sheet: BankSheet | null,
  fileLabel = "لوحات"
): void {
  const rows = buildExportRows(entries, sheet);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  triggerDownload(
    new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
    `${fileLabel}_${stamp()}.csv`
  );
}
