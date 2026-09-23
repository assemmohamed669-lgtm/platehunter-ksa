/**
 * ══════════════════════════════════════════════════════════════════════
 *  📋 صفحة «التسجيل الجديد (تجربة)» → شيت السجلات
 * ══════════════════════════════════════════════════════════════════════
 *
 * طلبات المالك (٢٢ سبتمبر ٢٠٢٦):
 *   · اللوحة المطابقة تجيب **نوع السيارة · تبع أي شركة · رقم الشاص**
 *   · ولو ليها **شهادة** تطلع معاها
 *   · و«لما يدوس تصدير اللوحات تتصدّر **لصفحة السجلات**» — مش ملف إكسل
 *   · وبعدها رسالة بما اتصدّر، **واللي اتأكّد بس** يتمسح من الصفحة
 *
 * القرارات الحسّاسة هنا عشان تتغطّى باختبارات (الصفحة مكوّن React) — نفس
 * أسلوب `trialModelGate` و`typeForPlate` و`provisionalRow`.
 */

import type { CheckColumns } from "./wantedColumns";

/**
 * 🔴 **معرّف ثابت مشتق من الصف** — مش من الوقت.
 *
 * `saveFieldCheckEntry` بتعمل `put` بالـ`id`، فمعرّف بالوقت معناه **صف
 * جديد كل ضغطة**. ده باج موثّق في صفحة التشييك (`instant-check:3535-3539`)
 * اتصلّح بمعرّف ثابت، ولسه موجود في مسار `exportToFieldCheck` لحد النهارده.
 * بنبدأ صح من الأول: مية ضغطة = سجل واحد.
 */
export function trialEntryId(rowId: string): string {
  return "fc-trial-" + String(rowId ?? "");
}

export interface CarDetails {
  /** نوع/طراز السيارة من شيت التشييك */
  car: string | null;
  /** تبع أي شركة/بنك */
  company: string | null;
  /** رقم الهيكل (الشاص) */
  chassis: string | null;
}

/** أسماء أعمدة الشاص المحتملة داخل صف التشييك نفسه. */
const CHASSIS_KEYS = ["رقم الهيكل", "الهيكل", "رقم الشاصي", "الشاص", "chassis number", "chassis", "vin"];

function pick(row: Record<string, string>, col: string | null): string | null {
  if (!col) return null;
  const v = String(row[col] ?? "").trim();
  return v || null;
}

/**
 * نوع السيارة والشركة والشاص من صف الشيت.
 *
 * 🔴 **الشاص ممكن مايكونش في الصف خالص**: `parseExcelFile` بيقرا ورقة
 * واحدة (بيفضّل «تشييك»)، وعمود الهيكل كتير بيكون في ورقة تانية. عشان كده
 * بناخد `fromIndex` — القيمة من فهرس الشاص المبني من **كل** الورقات، زي
 * ما بيعمل مود «شاص» في صفحة التشييك.
 *
 * ⚠️ وبنقرا الأعمدة **بالاسم** مش بـ`matchesPreferred`: دي بتستبعد «رقم
 *   الهيكل» عن قصد (موثّق في CLAUDE.md وعليه ٤ اختبارات)، وتعديلها كان
 *   هيغيّر سلوك صفحة الفرز كلها.
 */
export function carDetails(
  row: Record<string, string> | null | undefined,
  cols: CheckColumns,
  fromIndex?: string | null
): CarDetails {
  if (!row) return { car: null, company: null, chassis: null };
  let chassis = pick(row, (cols as { chassisCol?: string | null }).chassisCol ?? null);
  if (!chassis) {
    for (const k of Object.keys(row)) {
      if (CHASSIS_KEYS.some((h) => k.toLowerCase().includes(h.toLowerCase()))) {
        const v = String(row[k] ?? "").trim();
        if (v) { chassis = v; break; }
      }
    }
  }
  return {
    car: pick(row, cols?.brandCol ?? null) ?? pick(row, cols?.typeCol ?? null),
    company: pick(row, cols?.bankCol ?? null),
    chassis: chassis || (String(fromIndex ?? "").trim() || null),
  };
}

export interface TrialRowLike {
  id: string;
  plate: string;
  type: string | null;
  note: string | null;
  match: Record<string, string> | null;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  shownAt: number;
  tier: "green" | "yellow";
  conf: number;
}

/**
 * صف السجل اللي بيتخزّن في `FieldCheckEntry.row` (وبيروح `extra` jsonb).
 *
 * 🔴 **الفاضي مابيتكتبش**: خانة فاضية في السجل أحسن من مفتاح بقيمة `""` —
 * لأن العرض والتصدير في السجلات بيلفّوا على المفاتيح الموجودة.
 */
export function buildTrialFieldRow(
  row: TrialRowLike,
  details: CarDetails,
  certificate?: string | null
): Record<string, string> {
  const out: Record<string, string> = { "رقم اللوحة": row.plate };
  const put = (k: string, v: string | null | undefined) => {
    const s = String(v ?? "").trim();
    if (s) out[k] = s;
  };
  put("نوع السيارة", details.car);
  put("الشركة", details.company);
  put("رقم الهيكل", details.chassis);
  put("الشهادة", certificate);
  put("النوع", row.type);            // اللي المندوب قاله بصوته
  put("ملاحظة المندوب", row.note);
  if (row.match) out["مطلوبة"] = "نعم";
  put("الحالة", row.tier === "green" ? "مؤكّدة" : "محتاجة نظرة");
  return out;
}

/**
 * 🔴 **«مفيش تصدير بلا موقع»** — قاعدة المالك المكتوبة (`lib/autoExport.ts`).
 * اللي لسه ماخدش GPS بيفضل مكانه في الصفحة لحد ما ياخده، بدل ما يتسجّل
 * سجل بلا مكان ويضيع منه الفايدة.
 */
export function exportableTrialRows<T extends { lat: number | null; lng: number | null }>(
  rows: readonly T[]
): T[] {
  return (rows ?? []).filter((r) => r.lat != null && r.lng != null);
}

/**
 * 🔴 **اللي اتكتب بس هو اللي يتمسح.**
 * نفس حارس صفحة التشييك (`Promise.allSettled` + فلترة `fulfilled`): لو
 * الكتابة فشلت، الصف يفضل قدام المندوب بدل ما يختفي ويضيع.
 */
export function savedIds(
  ids: readonly string[],
  settled: readonly PromiseSettledResult<unknown>[]
): string[] {
  return (ids ?? []).filter((_, i) => settled?.[i]?.status === "fulfilled");
}


/**
 * ══════════════════════════════════════════════════════════════════════
 *  💾 مسودّة الجلسة — الصفوف لازم تعيش لو التطبيق قفل
 * ══════════════════════════════════════════════════════════════════════
 *
 * صفحة التشييك بتحفظ مسودّاتها في IndexedDB مع كل تغيير. صفحة التجربة
 * مكانتش بتحفظ **ولا حاجة** — جلسة ٢٣٥ لوحة كانت هتضيع بالكامل لو
 * التطبيق اتقفل أو الموبايل عمل ريستارت.
 *
 * 🔴 **وبنشيل صف شيت التشييك (`match`) قبل الحفظ.** ده أكبر حاجة في
 * الصف (كل أعمدة الشيت)، ومندوب بـ٢٠٠ لوحة كان هيكتب ميجابايتات —
 * والحصّة في المتصفّح **لكل أصل مش لكل قاعدة**، فامتلاؤها بيفشّل **كل**
 * الكتابات في **كل** القواعد. ده حصل في التشييك قبل كده.
 *
 * وبنرجّعه من الفهرس وقت التحميل — فبيبقى **أحدث** كمان لو المالك غيّر
 * شيت التشييك بين الجلستين.
 */

export interface DraftRow {
  plate: string;
  match: Record<string, string> | null;
}

/** بيجهّز الصفوف للحفظ: بلا صف الشيت. */
export function stripForDraft<T extends DraftRow>(rows: readonly T[]): T[] {
  return (rows ?? []).map((r) => ({ ...r, match: null }));
}

/**
 * بيرجّع «مطلوبة» من فهرس التشييك بعد التحميل.
 * ⚠️ المفتاح لازم يتطبّع بنفس طريقة بناء الفهرس — فالمنادي بيمرّر دالة
 *    التطبيع بتاعته عشان مايبقاش فيه تعريفين.
 */
export function rehydrateMatch<T extends DraftRow>(
  rows: readonly T[],
  index: Map<string, Record<string, string>>,
  keyOf: (plate: string) => string = (p) => p,
): T[] {
  return (rows ?? []).map((r) => ({
    ...r,
    match: index.get(keyOf(r.plate)) ?? null,
  }));
}
