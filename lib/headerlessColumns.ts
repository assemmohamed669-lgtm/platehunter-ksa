/**
 * headerlessColumns — التعامل مع شيتات الداتا اللي **بدون صف عناوين**.
 *
 * المشكلة: بعض شيتات المناديب مالهاش صف عناوين خالص (الصف الأول داتا مباشرة،
 * أو فاضي). كشف العناوين القديم بياخد أول صف داتا كـ«عناوين» → أول لوحة تضيع،
 * والأعمدة بتاخد أسماء = قيَم (تاريخ/حي)، فاختيار الأعمدة المبني على الاسم بيفشل
 * (التاريخ/الحي مبيظهروش صح).
 *
 * الحل: نكتشف إن الصف المرشّح للعناوين هو **داتا مش عناوين**، وساعتها نسمّي كل
 * عمود **بمحتواه** (لوحة/تاريخ/حي/GPS، وإلا «عمود A/B…») فكل المنطق اللي بعده
 * (matchesPreferred/isMandatory — كلهم اسم-based) يشتغل من غير تغيير.
 *
 * كل الدوال هنا **نقية وقابلة للاختبار**.
 */

// أسماء أعمدة معروفة — لو خلية بتساويها بالظبط يبقى الصف عناوين حقيقية مش داتا.
// المطابقة **بالتساوي الكامل** (مش احتواء) عشان قيمة زي «حي العليا» (داتا) ماتتحسبش
// عنوان لمجرد إنها فيها كلمة «حي».
const HEADER_KEYWORDS = new Set(
  [
    // اللوحة
    "رقم اللوحة", "رقم اللوحه", "اللوحة", "اللوحه", "لوحة", "لوحه",
    "plate", "plate number", "the plate number in arabic", "رقم اللوحة عربي",
    // التاريخ
    "التاريخ", "تاريخ", "date",
    // الحي / المنطقة
    "الحي", "حي", "الحى", "حى", "المنطقة", "منطقة", "المدينة", "مدينة",
    "district", "area", "city", "region", "neighborhood", "neighbourhood",
    // GPS / الشارع / العنوان
    "gps", "الموقع", "جي بي اس", "الشارع", "شارع", "العنوان", "عنوان",
    // النوع / الماركة / اللون / السنة …
    "النوع", "نوع السيارة", "نوع المركبة", "الماركة", "ماركة", "ماركه",
    "طراز", "طراز المركبة", "صانع", "صانع المركبة", "الموديل", "موديل",
    "اللون", "لون", "لون المركبة", "السنة", "سنة", "سنة الصنع",
    "vehicle", "vehicle name", "make", "model", "brand", "color", "year",
    "year model", "type of car", "chassis number", "رقم الهيكل",
  ].map((s) => s.toLowerCase()),
);

export function looksLikeHeaderKeyword(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s.length > 0 && HEADER_KEYWORDS.has(s);
}

/** تاريخ منطوق كنص: 15/5/2024، 5-15-2024، 2024-05-15 … (يقبل أرقام عربية-هندية). */
export function looksLikeDate(v: string): boolean {
  const s = v.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  if (!s) return false;
  return /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}$/.test(s) || /^\d{4}-\d{1,2}-\d{1,2}/.test(s);
}

/** إحداثيات lat,lng أو لينك خرائط. */
export function looksLikeGps(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (/^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(s)) return true;
  return /(maps\.|google\.[^ ]*\/maps|goo\.gl\/maps|geo:|@-?\d)/i.test(s);
}

/**
 * لوحة سعودية ملزوقة: ٢-٣ حروف + ٣-٤ أرقام (أي ترتيب). «دطط2804» / «2804دطط».
 * بنطبّع الأرقام العربية-الهندية (٠-٩) ونشيل الفواصل (- _ . / ـ) الأول — زي باقي
 * الكود (cellLooksLikePlate/normalizePlate) — عشان «دطط٢٨٠٤» و«دطط-2804» يتعرفوا.
 */
export function looksLikePlate(v: string): boolean {
  const s = v
    .replace(/[\s\-_.ـ/]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  return /^[ء-ي]{2,3}\d{3,4}$/.test(s) || /^\d{3,4}[ء-ي]{2,3}$/.test(s);
}

/** قيمة حي: «حي العليا» / «الحي ...». */
export function looksLikeDistrict(v: string): boolean {
  return /^(الحي|حي|حى)\s+\S/.test(v.trim());
}

function isPureNumber(v: string): boolean {
  const s = v.trim();
  return s !== "" && /^\d+([.,]\d+)?$/.test(s);
}

/** فهرس عمود → حرف إكسيل: 0→A، 25→Z، 26→AA. */
export function columnLetter(idx: number): string {
  let s = "";
  let n = idx;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * هل الصف المرشّح للعناوين هو **داتا** (يعني الشيت بدون عناوين)؟
 * القاعدة: مفيش أي خلية بتساوي اسم عمود معروف، ونص الخلايا (أو أكتر) شكلها داتا
 * (لوحة/تاريخ/GPS/رقم/حي). محافظة عشان ماتغلطش مع عناوين نصية مخصّصة.
 */
export function detectHeaderless(headerRowValues: string[]): boolean {
  const nonEmpty = headerRowValues.map((v) => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return false;
  if (nonEmpty.some(looksLikeHeaderKeyword)) return false;
  const dataLike = nonEmpty.filter(
    (v) => looksLikePlate(v) || looksLikeDate(v) || looksLikeGps(v) || isPureNumber(v) || looksLikeDistrict(v),
  );
  return dataLike.length / nonEmpty.length >= 0.5;
}

function nameColumn(colValues: string[], col: number, used: Set<string>): string {
  const nonEmpty = colValues.map((v) => v.trim()).filter(Boolean);
  const ratio = (pred: (s: string) => boolean) =>
    nonEmpty.length ? nonEmpty.filter(pred).length / nonEmpty.length : 0;
  let base: string;
  if (nonEmpty.length >= 2 && ratio(looksLikePlate) >= 0.5) base = "رقم اللوحة";
  else if (nonEmpty.length >= 2 && ratio(looksLikeDate) >= 0.5) base = "التاريخ";
  else if (nonEmpty.length >= 2 && ratio(looksLikeGps) >= 0.5) base = "GPS";
  else if (nonEmpty.length >= 2 && ratio(looksLikeDistrict) >= 0.5) base = "الحي";
  else base = `عمود ${columnLetter(col)}`;
  let name = base;
  let i = 2;
  while (used.has(name)) name = `${base} ${i++}`;
  used.add(name);
  return name;
}

/**
 * يبني أعمدة مسمّاة بالمحتوى لشيت بدون عناوين.
 * @param rawRows كل صفوف الشيت (خام — قيم Excel زي ما هي، ممكن تكون Date/رقم/نص).
 * @param startRow صف بداية الداتا (= صف العناوين المرشّح، لأنه داتا مش عناوين).
 * @param toStr محوّل الخلية لنص (بينسّق التواريخ dd/mm/yyyy) — للتسمية بالمحتوى.
 * @param nameSampleSize عدد الصفوف المستخدمة للتسمية (للأداء على الملفات الكبيرة).
 *
 * **مهم:** وجود العمود و`maxCols` بيتحسبوا من **كل** الصفوف (مش عيّنة) عشان عمود
 * متفرّق (فاضي في البداية زي GPS) مايتشالش وتضيع داتاه. التسمية بس اللي بتستخدم
 * عيّنة. الأعمدة الفاضية تماماً بتتشال. الأسماء المكرّرة بتاخد لاحقة رقمية.
 */
export function buildHeaderlessColumns(
  rawRows: unknown[][],
  startRow: number,
  toStr: (v: unknown) => string,
  nameSampleSize = 200,
): Array<{ name: string; col: number }> {
  const end = rawRows.length;
  let maxCols = 0;
  for (let i = startRow; i < end; i++) {
    const len = rawRows[i]?.length ?? 0;
    if (len > maxCols) maxCols = len;
  }
  const sampleEnd = Math.min(end, startRow + nameSampleSize);
  const used = new Set<string>();
  const cols: Array<{ name: string; col: number }> = [];
  for (let c = 0; c < maxCols; c++) {
    // وجود العمود: أي خلية غير فاضية عبر كل الصفوف (مع short-circuit) — عمود
    // متفرّق يبدأ بعد الصف 200 لازم يتحسب. String خفيف (مش محتاج تنسيق تاريخ هنا).
    let present = false;
    for (let i = startRow; i < end; i++) {
      const cell = rawRows[i]?.[c];
      if (cell != null && String(cell).trim() !== "") { present = true; break; }
    }
    if (!present) continue;
    const sampleVals: string[] = [];
    for (let i = startRow; i < sampleEnd; i++) sampleVals.push(toStr(rawRows[i]?.[c]));
    cols.push({ name: nameColumn(sampleVals, c, used), col: c });
  }
  return cols;
}
