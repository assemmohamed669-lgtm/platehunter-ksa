/**
 * ══════════════════════════════════════════════════════════════════════
 *  دمج صف اللوحة لما الإجماع يأكّدها — **من غير ما يضيّع شغل المندوب**
 * ══════════════════════════════════════════════════════════════════════
 *
 * بلاغ المالك (٢٣ سبتمبر ٢٠٢٦): «لما بختار النوع أو الملاحظة يدوي مش
 * بتظهر في المربّع».
 *
 * 🔴 **السبب**: لما الإجماع يأكّد لوحة أو يحدّثها — وده بيحصل في أول
 * ثانيتين-تلاتة بعد ما تظهر، **بالظبط** الوقت اللي المندوب بيختار فيه
 * النوع — الصف كان بيتدمج كـ`{ ...fresh }`، يعني **`id` جديد**:
 *
 *   · React بيشيل الصف القديم ويحط جديد (المفتاح اتغيّر) ⇒ المنسدلة
 *     المفتوحة **بتتقفل تحت إيد المندوب**
 *   · واختياره بيروح لـ`saveCell(idالقديم)` ⇒ مالقاش الصف ⇒ **ضاع في صمت**
 *
 * ومن نفس السطر مشكلتين تانيين كانوا مستخبيين:
 *   · **تصحيح اللوحة** بإيد المندوب كان بيتكتب فوقيه بقراءة الموديل
 *   · لو كوهير رجع يوماً، تخمينه كان هيغلب اختيار المندوب
 *
 * ⇒ القاعدة: **الصف بيحافظ على هويته (`id`)، وأي خانة المندوب عدّلها
 *   بإيده بتغلب أي حاجة جاية من الموديل** — حتى في الدمجات الجاية.
 */

/** الخانات اللي المندوب عدّلها بإيده. */
export interface Edited {
  plate?: boolean;
  type?: boolean;
  note?: boolean;
}

export interface MergeRow {
  id: string;
  plate: string;
  type: string | null;
  note: string | null;
  match: Record<string, string> | null;
  shownAt: number;
  latencyMs: number;
  edited?: Edited;
  /** الحي والشارع — مختوم لحظة النطق (`sessionStamp`). */
  area?: string | null;
  /** اسم المسجّل — مختوم لحظة النطق. */
  recorder?: string | null;
}

/**
 * يدمج القراءة الجديدة (`fresh`) في الصف الموجود (`twin`).
 *
 * كل حقول `fresh` التانية (الثقة · الطبقة · عدد النوافذ · الموقع…) بتتاخد
 * زي ما هي — دي معلومات الإجماع اللي اتحسّنت. اللي بيتحمى هو **الهوية
 * وشغل المندوب**.
 */
/** مقارنة لوحتين بلا مسافات وبلا فرق همزة — نفس تطبيع الشيت. */
function normPlate(p: string): string {
  return String(p ?? "").replace(/\s+/g, "").replace(/[أإآ]/g, "ا");
}

export function mergeTwinRow<T extends MergeRow>(fresh: T, twin: T): T {
  const ed = twin.edited ?? {};
  // اللوحة ومطابقتها مع بعض: لو المندوب صحّح اللوحة، المطابقة اتحسبت على
  // تصحيحه (`savePlate`)، ففصلهم كان هيطلّع لوحة بمطابقة لوحة تانية.
  const keepPlate = ed.plate === true;
  /**
   * 🔴 **ولو اللوحة نفسها اتغيّرت، المطابقة القديمة مالهاش مكان.** بلاغ
   * المالك (٢٥ سبتمبر ٢٠٢٦): قراية غلط «رلم6113» (في الشيت) علّمت الصف
   * مطلوب، والإجماع صحّحه لـ«رلم6146» (مش في الشيت) — و`fresh.match ?? twin.match`
   * خلّى الصف رقم لوحة **ببيانات وشهادة لوحة تانية**. الرجوع للقديمة مسموح
   * بس لو **نفس اللوحة** (القراءة الجديدة ممكن تكون اتحسبت قبل الشيت).
   */
  const samePlate = normPlate(fresh.plate) === normPlate(twin.plate);
  const match = keepPlate
    ? twin.match
    : (samePlate ? (fresh.match ?? twin.match) : fresh.match);
  return {
    ...fresh,
    id: twin.id,
    shownAt: Math.min(fresh.shownAt, twin.shownAt),
    latencyMs: Math.min(fresh.latencyMs, twin.latencyMs),
    plate: keepPlate ? twin.plate : fresh.plate,
    match,
    type: ed.type ? twin.type : (fresh.type ?? twin.type),
    note: ed.note ? twin.note : (fresh.note ?? twin.note),
    edited: twin.edited,
    /**
     * 🔴 **الحي والمسجّل من الختم الأول** — لو المندوب غيّر الشارع بين ما
     * اللوحة ظهرت وما اتأكّدت، القيمة الصح هي اللي كانت **وقت ما قالها**.
     * والختم الفاضي بيفضل فاضي (مابيتملاش من التأكيد).
     */
    area: twin.area ?? null,
    recorder: twin.recorder ?? null,
  };
}
