import { normalizePlate, bankPlateToArabic } from "./plateParser";

/**
 * جيران السيارة في نفس الموقع (شارع/حي) داخل ملف الداتا المرتّب.
 *
 * ملف الداتا (التفريغ الميداني) مسجّل بترتيب القيادة، فالسيارات اللي في نفس
 * الشارع/الموقع بتبقى متجاورة في الملف. الميزة دي بتجيب السيارة المطلوبة +
 * ٥ سيارات قبلها و٥ بعدها **بنفس اسم الموقع** — عشان المندوب يحدد مكانها
 * بالظبط من خلال جيرانها. لو السيارة في أول/آخر الموقع بترجّع أقل + علامة.
 */

/**
 * يكتشف عمود «اسم الموقع/الشارع» في الداتا للتجميع بيه. الأولوية:
 * «اسم الموقع» → شارع/عنوان → الحي/منطقة. يرجّع null لو مفيش.
 * (بيتجنّب أعمدة GPS/الموقع/الخريطة لأنها روابط مش أسماء مواقع.)
 */
export function detectLocationColumn(headers: string[]): string | null {
  const norm = (h: string) => String(h).trim();
  const find = (re: RegExp): string | null => headers.find((h) => re.test(norm(h))) ?? null;
  // 1) «اسم الموقع» صراحةً
  const named = find(/اسم\s*الموقع/);
  if (named) return named;
  // 2) شارع / عنوان (أدق مستوى)
  const street = find(/الشارع|شارع|العنوان|عنوان|street|address/i);
  if (street) return street;
  // 3) الحي / المنطقة (احتياطي أوسع)
  const district = find(/الحي|حى|المنطقة|منطقة|district|area|neighbou?rhood/i);
  if (district) return district;
  return null;
}

/** عدد الجيران المعروض قبل السيارة وبعدها في نافذة «موقعها» (بطلب المندوب: ١٥+١٥). */
export const NEIGHBOR_SPAN = 15;

export interface LocationContext {
  /** اسم الموقع الخام للسيارة المطلوبة (زي ما هو في الداتا) — للعنوان بس. */
  locationName: string;
  /** حتى ١٥ سيارة قبلها في ترتيب ملف الداتا (بالترتيب الطبيعي). */
  before: Record<string, string>[];
  /** حتى ١٥ سيارة بعدها في ترتيب ملف الداتا (بالترتيب الطبيعي). */
  after: Record<string, string>[];
  /** دي أول سيارة في ملف الداتا (مفيش قبلها). */
  isFirstInLocation: boolean;
  /** دي آخر سيارة في ملف الداتا (مفيش بعدها). */
  isLastInLocation: boolean;
}

/**
 * جيران الصف رقم `index` في ملف الداتا المرتّب — `span` سيارة قبله و`span` بعده
 * **بالموضع** (مش محدودة بنفس الشارع)، بطلب المندوب. ملف الداتا مسجّل بترتيب
 * القيادة فالجيران دول هم اللي المندوب عدّى عليهم فعلاً قبل/بعد السيارة دي.
 * `locCol` بيتستخدم لاسم الموقع في العنوان بس (اختياري).
 */
export function neighborsInSameLocation(
  rows: Record<string, string>[],
  index: number,
  locCol?: string | null,
  span = NEIGHBOR_SPAN,
): LocationContext {
  const empty: LocationContext = {
    locationName: "", before: [], after: [], isFirstInLocation: true, isLastInLocation: true,
  };
  if (!rows.length || index < 0 || index >= rows.length) return empty;

  const target = rows[index];
  const before = rows.slice(Math.max(0, index - span), index);
  const after = rows.slice(index + 1, index + 1 + span);

  return {
    locationName: locCol ? String(target[locCol] ?? "") : "",
    before,
    after,
    isFirstInLocation: index === 0,
    isLastInLocation: index === rows.length - 1,
  };
}

/**
 * نفس `neighborsInSameLocation` بالظبط — بس **من ملف على الجهاز** بدل الذاكرة.
 *
 * ليه موجودة: ملف الداتا الكبير مابيتحمّلش في الذاكرة، بيتخزّن على الجهاز
 * (IndexedDB) والذاكرة فيها عيّنة ٥٠ صف بس. والفرز بيدّي كل سيارة **رقم صفها
 * في الملف الكامل** (ممكن يبقى ٣١٢ ألف). فالبحث عن الصف ده جوه الـ٥٠ عيّنة
 * كان بيفشل دايماً — وده اللي كان بيطلّع «تعذّر تحديد موقع السيارة».
 *
 * بتعمل **مرور واحد** على الدفعات وبتمسك في الذاكرة `span` صف بس قبل الهدف
 * (نافذة متحرّكة) و`span` بعده — يعني ١١ صف بالكتير مهما كبر الملف.
 *
 * `iterate` بتاخد نفس شكل `iterateRows`: بتنادي `onBatch(rows, baseIndex)`
 * لكل دفعة بالترتيب، و`baseIndex` بيعدّ **الصفوف اللي اتلفّ عليها فعلاً**
 * (نفس عدّاد الفرز، فالورقات غير المختارة مابتتحسبش في الاتنين).
 */
export async function neighborsFromStream(
  iterate: (
    onBatch: (rows: Record<string, string>[], baseIndex: number) => void | Promise<void>,
  ) => Promise<void>,
  index: number,
  locCol?: string | null,
  span = NEIGHBOR_SPAN,
): Promise<{ ctx: LocationContext; target: Record<string, string> | null }> {
  const empty: LocationContext = {
    locationName: "", before: [], after: [], isFirstInLocation: true, isLastInLocation: true,
  };
  if (index < 0) return { ctx: empty, target: null };

  const prev: Record<string, string>[] = [];   // نافذة متحرّكة: آخر span صف قبل الهدف
  const after: Record<string, string>[] = [];   // أول span صف بعد الهدف
  let target: Record<string, string> | null = null;
  let done = false;

  await iterate((rows, base) => {
    if (done) return;
    for (let i = 0; i < rows.length; i++) {
      const g = base + i;
      if (g < index) {
        prev.push(rows[i]);
        if (prev.length > span) prev.shift();   // مانحتفظش بأكتر من span
      } else if (g === index) {
        target = rows[i];
      } else {
        after.push(rows[i]);
        if (after.length >= span) { done = true; return; }   // خلصنا — بطّل شغل
      }
    }
  });

  if (target === null) return { ctx: empty, target: null };

  return {
    ctx: {
      locationName: locCol ? String((target as Record<string, string>)[locCol] ?? "") : "",
      before: prev,          // آخر span صف قبل الهدف (بالموضع، مش محدودة بالموقع)
      after,
      isFirstInLocation: prev.length === 0,   // مفيش صف قبله = أول الملف
      isLastInLocation: after.length === 0,   // مفيش صف بعده = آخر الملف
    },
    target,
  };
}

/**
 * بيدوّر على أول صف لوحته تساوي `wantNorm` (لوحة مطبّعة) في ملف على الجهاز،
 * ويرجّع فهرسه — أو -1 لو مش موجودة. مرور واحد، بذاكرة دفعة واحدة.
 *
 * ليه باللوحة مش بالفهرس: الفرز بيخزّن فهرس **عام** عبر كل ملفات الداتا، وتحويله
 * لفهرس محلّي جوه ملف معيّن محتاج طول كل ملف قبله بدقة — وده مش مضمون مع فلتر
 * الورقات. البحث باللوحة بيدّي نفس النتيجة بدون الحسابات دي.
 */
export async function findIndexByPlate(
  iterate: (
    onBatch: (rows: Record<string, string>[], baseIndex: number) => void | Promise<void>,
  ) => Promise<void>,
  plateCol: string,
  wantNorm: string,
): Promise<number> {
  if (!wantNorm) return -1;
  let found = -1;
  await iterate((rows, base) => {
    if (found >= 0) return;
    for (let i = 0; i < rows.length; i++) {
      if (normalizePlate(bankPlateToArabic(String(rows[i][plateCol] ?? ""))) === wantNorm) {
        found = base + i;
        return;
      }
    }
  });
  return found;
}
