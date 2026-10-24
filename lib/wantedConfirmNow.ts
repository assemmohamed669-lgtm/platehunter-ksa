/**
 * ══════════════════════════════════════════════════════════════════════
 *  ⚡ نافذة التأكيد الفورية — الصفّارة أسرع **بنفس قاعدة التأكيد بالظبط**
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٤ أكتوبر ٢٠٢٦): «المندوب يقول لوحة مطلوبة والبرنامج ميطلعهاش غير بعد ما يقول ٣ أو ٤ لوحات بعديها …
 * عايز حل صارم … نقلل الوقت المستغرق في المراجعة … بس طبعاً مراجعة موثوقة». ورفض «قراية واحدة قوية تكفي»: إنذار
 * على لوحة مش مطلوبة ممكن المندوب يسحبها.
 *
 * 🔍 **القياس** (١٨٬٦٩٣ لوحة · ٦١٧ جلسة Voice PRO · ٢٠–٢٤ أكتوبر): من نطق اللوحة للصفّارة ≈ ٢٫٧ث:
 *   ① استنى النافذة الزاحفة اللي فيها اللوحة كاملة ≈ ٠٫٧٥ث (كل ١٫٥ث)
 *   ② أول قراية ترجع ≈ ٠٫٦ث (الموديل ٠٫١٧ث والباقي رفع الصوت)
 *   ③ **استنى دور النافذة التانية** عشان التأكيد (`confirmWanted`) ≈ ١٫٣ث ← أكبر وقت ضايع
 *   المندوب السريع بيقول لوحة كل ~٠٫٨ث ⇒ ٣–٤ لوح. بالظبط الشكوى.
 *
 * ⚡ **الحل**: أول ما قراية تلاقي لوحة **في الشيت** ولسه ماتأكّدتش، المحرّك بيبعت النافذة التانية **دلوقتي**:
 *   **نفس بداية** النافذة الزاحفة الجاية (`from + الخطوة`) ونهايتها لحظة الطلب. فاللوحة جوّاها بنفس شرط النافذة
 *   اللي كانت هتأكّد، وهي نافذة **تانية** (`tMs` مختلف) ⇒ `confirmWanted` بيحسبها تأكيد زي أي نافذة.
 *   · القاعدة مااتغيّرتش: نافذتين مختلفتين سمعوا اللوحة **بالحرف**.
 *   · ماأكّدتش ⇒ النوافذ العادية بتكمّل زي ما هي (مافيش حاجة بتضيع).
 *   · طلب واحد زيادة **لكل عربية في الشيت** بس — مش لكل لوحة.
 *   المحاكاة على نفس الجلسات: ٢٫٧ث ⇐ ~١٫٩ث.
 *
 * 🟢 للكل (`WANTED_CONFIRM_NOW_FOR_ALL`) — المالك ٢٤ أكتوبر: «يلا انشرها للكل» (كانت السوبر أدمن الأول، #497).
 */

/** 🟢 للكل — المالك (٢٤ أكتوبر ٢٠٢٦): «يلا انشرها للكل». */
export const WANTED_CONFIRM_NOW_FOR_ALL = true;

/** نافذة التأكيد أقصر من كده مش هتشيل اللوحة (اللوحة لحد ~٣٫٤ث). */
export const CONFIRM_MIN_SEC = 2;

/** النافذة الزاحفة الجاية فاضلها أقل من كده ⇒ مانبعتش تأكيد زيادة (هي هتأكّد). */
export const IMMINENT_SEC = 0.3;

/** الشيت جهز وسط الجلسة ⇒ اللوحات المؤكّدة في آخر الدقيقة دي بس تصفّر. */
export const SHEET_READY_RECENT_MS = 60_000;

export function canConfirmNow(isSuper: boolean): boolean {
  return isSuper === true || WANTED_CONFIRM_NOW_FOR_ALL;
}

export interface SecWindow {
  from: number;
  to: number;
}

/**
 * نافذة التأكيد لقراية النافذة الزاحفة `w` (بالثواني على ساعة الميك).
 *
 * @param nowSec ساعة الميك دلوقتي (القراية لسه راجعة)
 * @param lastSlideToSec نهاية آخر نافذة زاحفة **عادية** اتبعتت
 * @returns `null` لو مفيش لازمة (الجاية اتبعتت خلاص / قديمة / قصيرة)
 */
export function planConfirmWindow(
  w: SecWindow,
  nowSec: number,
  lastSlideToSec: number,
  stepSec: number,
  winSec: number,
): SecWindow | null {
  if (!Number.isFinite(nowSec) || !Number.isFinite(w.from) || !Number.isFinite(w.to)) return null;
  // النافذة الجاية العادية اتبعتت ⇒ هي اللي هتأكّد (أو أكّدت)
  if (lastSlideToSec > w.to + 1e-3) return null;
  // مفيش صوت جديد بعد النافذة الأولى
  if (nowSec <= w.to) return null;
  // الجاية العادية على وشك تتبعت ⇒ هي كفاية (مفيش طلبين ورا بعض)
  if (nowSec >= w.to + stepSec - IMMINENT_SEC) return null;
  const from = w.from + stepSec;
  const to = nowSec;
  if (to - from < CONFIRM_MIN_SEC) return null;
  // أطول من نافذة ⇒ ميعاد الجاية فات من بدري (السكوت وقّف الزحلقة) — مالهاش لازمة
  if (to - from > winSec + 1e-3) return null;
  return { from, to };
}

export interface SheetRow {
  plate: string;
  provisional: boolean;
  mult: number;
  shownAt: number;
  match: Record<string, string> | null;
  edited?: { plate?: boolean } | null;
}

/**
 * الشيت جهز (أو اتغيّر) **وسط الجلسة**: اللوحات اللي اتأكّدت قبله (نافذتين+) في الجلسة دي وفي آخر دقيقة
 * ومش متعلّمة «مطلوبة» ⇒ تصفّر. من غيره اللوحة المطلوبة اللي اتقالت قبل ما الشيت يخلص تحميل بتتعلّم «مطلوبة»
 * في الجدول **من غير صفّارة** (`rehydrateMatch`).
 */
export function sheetReadyAlerts<R extends SheetRow>(
  rows: readonly R[],
  index: ReadonlyMap<string, Record<string, string>>,
  keyOf: (plate: string) => string,
  sessionStartMs: number,
  nowMs: number,
  recentMs: number = SHEET_READY_RECENT_MS,
): Array<{ plate: string; row: Record<string, string> }> {
  const out: Array<{ plate: string; row: Record<string, string> }> = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.match || r.provisional || (r.mult ?? 0) < 2 || r.edited?.plate) continue;
    if (r.shownAt < sessionStartMs || nowMs - r.shownAt > recentMs) continue;
    const k = keyOf(r.plate);
    if (!k || seen.has(k)) continue;
    const hit = index.get(k);
    if (!hit) continue;
    seen.add(k);
    out.push({ plate: r.plate, row: hit });
  }
  return out;
}
