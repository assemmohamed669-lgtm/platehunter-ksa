import { normalizePlate, bankPlateToArabic } from "./plateParser";

/**
 * جيران السيارة في نفس الموقع (شارع/حي) داخل ملف الداتا المرتّب.
 *
 * ملف الداتا (التفريغ الميداني) مسجّل بترتيب القيادة، فالسيارات اللي في نفس
 * الشارع/الموقع بتبقى متجاورة في الملف. الميزة دي بتجيب السيارة المطلوبة +
 * ٥ سيارات قبلها و٥ بعدها **بنفس اسم الموقع** — عشان المندوب يحدد مكانها
 * بالظبط من خلال جيرانها. لو السيارة في أول/آخر الموقع بترجّع أقل + علامة.
 */

/** يطبّع قيمة الموقع للمقارنة (يشيل الفراغات الزيادة). */
function normLoc(v: unknown): string {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

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

export interface LocationContext {
  /** اسم الموقع الخام (زي ما هو في الداتا). */
  locationName: string;
  /** حتى ٥ سيارات قبلها بنفس الموقع (بالترتيب من الأبعد للأقرب). */
  before: Record<string, string>[];
  /** حتى ٥ سيارات بعدها بنفس الموقع (بالترتيب من الأقرب للأبعد). */
  after: Record<string, string>[];
  /** مفيش سيارة قبلها في نفس الموقع (دي أول سيارة في الموقع). */
  isFirstInLocation: boolean;
  /** مفيش سيارة بعدها في نفس الموقع (دي آخر سيارة في الموقع). */
  isLastInLocation: boolean;
}

/**
 * يجمع جيران الصف رقم `index` في `rows` اللي بنفس قيمة `locCol` — حتى `span`
 * قبله و`span` بعده، ويقف عند أول صف بموقع مختلف (حدود الموقع).
 */
export function neighborsInSameLocation(
  rows: Record<string, string>[],
  index: number,
  locCol: string,
  span = 5,
): LocationContext {
  const empty: LocationContext = {
    locationName: "", before: [], after: [], isFirstInLocation: true, isLastInLocation: true,
  };
  if (!rows.length || index < 0 || index >= rows.length) return empty;

  const target = rows[index];
  const key = normLoc(target[locCol]);

  const before: Record<string, string>[] = [];
  for (let i = index - 1; i >= 0 && before.length < span; i--) {
    if (normLoc(rows[i][locCol]) !== key) break;
    before.unshift(rows[i]); // نخليهم بالترتيب الطبيعي (الأبعد أولاً)
  }

  const after: Record<string, string>[] = [];
  for (let i = index + 1; i < rows.length && after.length < span; i++) {
    if (normLoc(rows[i][locCol]) !== key) break;
    after.push(rows[i]);
  }

  const isFirstInLocation = index === 0 || normLoc(rows[index - 1][locCol]) !== key;
  const isLastInLocation = index === rows.length - 1 || normLoc(rows[index + 1][locCol]) !== key;

  return { locationName: String(target[locCol] ?? ""), before, after, isFirstInLocation, isLastInLocation };
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
  locCol: string,
  span = 5,
): Promise<{ ctx: LocationContext; target: Record<string, string> | null }> {
  const empty: LocationContext = {
    locationName: "", before: [], after: [], isFirstInLocation: true, isLastInLocation: true,
  };
  if (index < 0) return { ctx: empty, target: null };

  const prev: Record<string, string>[] = [];   // نافذة متحرّكة: آخر span صف قبل الهدف
  const next: Record<string, string>[] = [];   // أول span صف بعد الهدف
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
        next.push(rows[i]);
        if (next.length >= span) { done = true; return; }   // خلصنا — بطّل شغل
      }
    }
  });

  if (target === null) return { ctx: empty, target: null };
  const key = normLoc((target as Record<string, string>)[locCol]);

  // من الهدف للورا: خد اللي بنفس الموقع وقف عند أول اختلاف (حدّ الموقع).
  const before: Record<string, string>[] = [];
  for (let i = prev.length - 1; i >= 0; i--) {
    if (normLoc(prev[i][locCol]) !== key) break;
    before.unshift(prev[i]);
  }
  const after: Record<string, string>[] = [];
  for (const row of next) {
    if (normLoc(row[locCol]) !== key) break;
    after.push(row);
  }

  return {
    ctx: {
      locationName: String((target as Record<string, string>)[locCol] ?? ""),
      before,
      after,
      // prev فاضية = الهدف أول صف في الملف كله.
      isFirstInLocation: prev.length === 0 || normLoc(prev[prev.length - 1][locCol]) !== key,
      // next فاضية = الهدف آخر صف في الملف كله.
      isLastInLocation: next.length === 0 || normLoc(next[0][locCol]) !== key,
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
