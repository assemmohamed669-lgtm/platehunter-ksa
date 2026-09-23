/**
 * ══════════════════════════════════════════════════════════════════════
 *  صفحة «الجديد» — زرّي القفل/التصدير التلقائي، وصفوف الإكسيل
 * ══════════════════════════════════════════════════════════════════════
 *
 * القرارات دي بتتاخد **وقت ما المندوب واقف في الشارع وبيدوس بسرعة**، فنصّ
 * الرسالة نفسه جزء من الأمان: العدد لازم يكون **في الرسالة**، مش «تمام؟»
 * مجرّدة — وإلا بيدوس نعم بلا ما يعرف هيضيّع إيه. نفس مبدأ
 * `unexportedDeleteWarning` الموجود في `lib/checkDrafts.ts`.
 */

import { toMapsLink } from "./gps";
import { AREA_KEY, RECORDER_KEY } from "./trialRecords";

/** ⑩أ تحذير قفل الموقع — بيوضّح إنه على **اللي جاي** مش اللي فات. */
export function noGpsWarning(): string {
  return "اللوحات اللي هتاخدها بعد كده هتاخدها بدون موقع.\n\nمتأكد؟";
}

/** ⑩ب سؤال تفعيل التصدير التلقائي. */
export function autoExportPrompt(): string {
  return "سيتم تفعيل التصدير التلقائي — هل تريد هذا؟";
}

/**
 * ⑩ب رسالة نهاية التسجيل لما التصدير التلقائي مفعّل.
 * `null` لو مافيش لوحات — مانزعّجش المندوب بسؤال على ولا حاجة.
 */
export function autoExportStopPrompt(pending: number): string | null {
  if (!Number.isFinite(pending) || pending <= 0) return null;
  return "سيتم تصدير " + pending + " لوحة لم يتم تصديرها.\n\nهل تريد التصدير للسجلات؟";
}

export interface TrialExcelRow {
  plate: string;
  type?: string | null;
  note?: string | null;
  match?: Record<string, string> | null;
  lat?: number | null;
  lng?: number | null;
  shownAt: number;
  /** الحي والشارع — مختوم على الصف لحظة النطق. */
  area?: string | null;
  /** اسم المسجّل — مختوم على الصف لحظة النطق. */
  recorder?: string | null;
}

/**
 * ⑨ صفوف ملف الإكسيل — **اللي المندوب شايفه بالظبط**، الأحدث الأول.
 *
 * 🔴 **الفاضي مابيتحطّش عمود**: لو حطّينا المفتاح لكل صف حتى وهو فاضي،
 * الملف بيتملّى أعمدة بيضا والمالك بيدوّر في نص فاضي. نفس قاعدة
 * `buildTrialFieldRow`.
 */
export function trialExcelRows(
  rows: readonly TrialExcelRow[],
): Record<string, unknown>[] {
  /**
   * 🔴 **كل صف بختمه هو** — كان بياخد قيمة المربّع **الحالية** لكل الصفوف،
   * فالمندوب اللي بيلفّ شوارع كتير كانت لوحاته بتطلع في الإكسيل **في آخر
   * شارع كتبه**. المالك: «ميضيفش على القديم لأني بغيّر دايماً».
   */
  return rows.slice()
    .sort((a, b) => b.shownAt - a.shownAt)     // الأحدث الأول — زي العرض
    .map((r) => {
      const out: Record<string, unknown> = { "رقم اللوحة": r.plate };
      const put = (k: string, v: unknown) => {
        const s = String(v ?? "").trim();
        if (s) out[k] = s;
      };
      put("النوع", r.type);
      put("الملاحظة", r.note);
      if (r.match) out["مطلوبة"] = "نعم";
      put(AREA_KEY, r.area);
      put(RECORDER_KEY, r.recorder);
      const d = new Date(r.shownAt);
      out["التاريخ"] = d.toLocaleDateString("ar-EG");
      out["الوقت"] = d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (r.lat != null && r.lng != null) out["الموقع"] = toMapsLink(r.lat, r.lng);
      return out;
    });
}

/**
 * السطر الصغير تحت دايرة الموديل (اسم الموديل · الكارت · حالة التوكن).
 *
 * المالك (٢٣ سبتمبر ٢٠٢٦): «ckpt-7500 على كارت الشاشة · التوكن سليم —
 * اخفي دي عن المناديب». الكلام ده تقني ومالوش معنى عند المندوب، ورسايل
 * الغلط فيه بتقول «اضغط مسح الإعداد» وده زرّ مش ظاهر عنده أصلاً.
 * المندوب بيكفيه العنوان: 🟢 أو «🔴 مش واصل».
 */
export function modelBoxDetail(msg: string | undefined, isSuper: boolean): string {
  return isSuper ? (msg ?? "") : "";
}
