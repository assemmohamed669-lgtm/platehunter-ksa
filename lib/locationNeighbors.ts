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
