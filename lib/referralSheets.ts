/**
 * referralSheets — قراءة ملف إحالة **متعدد الورقات** بأشكال مختلفة.
 *
 * المشكلة اللي بيحلها: ملفات الإحالة اللي بتيجي من الشركات مش على نظام واحد —
 * كل ورقة ليها اسم مختلف لعمود اللوحة («رقم اللوحة» / «لوحة السيارة» /
 * «رقم السيارة»)، والهيدر مش في أول صف (فوقه عناوين وتواريخ ومعلومات)، وفيه
 * ورقات من غير هيدر خالص. القارئ القديم كان بياخد أول ورقة ويعتبر أول صف هيدر
 * → الفرز يفشل أو يطلّع لوحة واحدة.
 *
 * هنا بنحلّل كل ورقة لوحدها: نلاقي صف الهيدر الحقيقي، ونكتشف عمود اللوحة
 * **بالمحتوى** مش بالاسم (فيشتغل حتى بدون هيدر)، ونرجّع عدد اللوحات لكل ورقة
 * عشان المندوب يختار الورقات اللي يفرز عليها ويشوف الإجمالي قبل ما يبدأ.
 *
 * ملاحظة مهمة على شكل اللوحة: فيه لوحات قديمة بـ**رقمين أو ٣** مش ٤ (زي
 * «ه ب ق 73»). القاعدة هنا ١-٤ أرقام — القاعدة الأضيق (٣-٤) كانت بتفوّت
 * سيارات مطلوبة حقيقية.
 */

/** حروف عربية أو لاتينية فقط (بعد شيل الأرقام والفواصل). */
const LETTERS_ONLY = /^[؀-ۿa-zA-Z]+$/;
const SEPARATORS = /[\s\-_.ـ/\\]/g;
const DIGITS = /[0-9٠-٩]/g;

/** هل القيمة دي شكلها لوحة؟ (٢-٤ حروف + ١-٤ أرقام) */
export function isPlateLike(value: unknown): boolean {
  const cleaned = String(value ?? "").replace(SEPARATORS, "");
  if (cleaned.length < 3 || cleaned.length > 12) return false;
  const digits = (cleaned.match(DIGITS) ?? []).join("");
  if (digits.length < 1 || digits.length > 4) return false;
  const letters = cleaned.replace(DIGITS, "");
  if (letters.length < 2 || letters.length > 4) return false;
  return LETTERS_ONLY.test(letters);
}

/** تطبيع للمقارنة/إزالة التكرار: شيل الفواصل ووحّد الألف. */
export function normalizeForCount(value: unknown): string {
  return String(value ?? "").replace(SEPARATORS, "").replace(/[أإآ]/g, "ا");
}

export interface SheetInfo {
  name: string;
  /** صف الهيدر (0-based)؛ -1 = الورقة بلا هيدر والداتا من أولها. */
  headerRow: number;
  /** فهرس عمود اللوحة؛ -1 = مفيش عمود لوحات. */
  plateCol: number;
  /** اسم عمود اللوحة (فاضي لو الورقة بلا هيدر). */
  plateColName: string;
  /** عدد اللوحات **الفريدة** في الورقة (للمنطق الداخلي). */
  plateCount: number;
  /** عدد **الصفوف** اللي فيها لوحة (للعرض — زي مربع الداتا). */
  rowCount: number;
  /** أسماء الأعمدة (مولّدة «عمود ١، ٢…» لو مفيش هيدر). */
  headers: string[];
  /** صفوف البيانات ككائنات جاهزة للفرز. */
  rows: Record<string, string>[];
  /**
   * الورقة مخفية في الإكسيل (state="hidden")؟ المحافظ بتيجي فيها ورقة عمل
   * مخفية جنب ورقة المطلوبين — والمخفية مابتتعلّمش تلقائياً، بس بتفضل معروضة
   * في الاختيار عشان المندوب يعلّم عليها بإيده لو محتاج.
   */
  hidden: boolean;
}

const cell = (row: unknown[] | undefined, i: number): string =>
  String(row?.[i] ?? "").trim();

/** أوسع صف في الورقة (عدد الأعمدة). */
function widthOf(aoa: unknown[][]): number {
  let w = 0;
  for (const r of aoa) if (r && r.length > w) w = r.length;
  return w;
}

/**
 * عمود اللوحة = العمود اللي فيه أكبر عدد قيم شكلها لوحة. الاكتشاف بالمحتوى
 * (مش بالاسم) عشان يشتغل مع أي تسمية وحتى بدون هيدر.
 */
/**
 * فوق العدد ده بنختار العمود من عيّنة بدل الورقة كلها — عشان ورقة ضخمة
 * (لو حد رفع ملف داتا بالغلط في مربع الإحالة) ما تعملش عدد × أعمدة عمليات
 * على الـ main thread وتجمّد الصفحة. العدّ النهائي بيفضل على الورقة كلها،
 * فالرقم اللي بيتعرض للمندوب دقيق. ملفات الإحالة العادية (آلاف قليلة) أقل
 * من الحد ده، يعني سلوكها ما اتغيرش.
 */
const PLATE_COL_SCAN_LIMIT = 20_000;

function findPlateColumn(aoa: unknown[][], width: number): { col: number; count: number } {
  const scan = aoa.length > PLATE_COL_SCAN_LIMIT ? aoa.slice(0, PLATE_COL_SCAN_LIMIT) : aoa;

  let bestCol = -1;
  let bestCount = 0;
  for (let c = 0; c < width; c++) {
    let n = 0;
    for (const r of scan) if (isPlateLike(r?.[c])) n++;
    if (n > bestCount) { bestCount = n; bestCol = c; }
  }

  // اتعيّن العمود من عيّنة → نعدّ العمود ده لوحده على الورقة كلها
  if (bestCol >= 0 && scan !== aoa) {
    let n = 0;
    for (const r of aoa) if (isPlateLike(r?.[bestCol])) n++;
    bestCount = n;
  }

  return { col: bestCol, count: bestCount };
}

/**
 * صف الهيدر = آخر صف **قبل** أول لوحة، بشرط إن خانته في عمود اللوحة فيها نص
 * مش لوحة (زي «رقم اللوحة»). لو أول لوحة في أول صف → الورقة بلا هيدر (-1).
 */
function findHeaderRow(aoa: unknown[][], plateCol: number): number {
  let firstPlateRow = -1;
  for (let i = 0; i < aoa.length; i++) {
    if (isPlateLike(aoa[i]?.[plateCol])) { firstPlateRow = i; break; }
  }
  if (firstPlateRow <= 0) return -1;             // مفيش لوحات، أو الداتا من أول صف
  const above = cell(aoa[firstPlateRow - 1], plateCol);
  return above ? firstPlateRow - 1 : -1;         // الصف اللي فوقها فاضي → بلا هيدر
}

/** أسماء أعمدة فريدة (بتملأ الفاضي وبتفكّ التكرار) — مفاتيح صالحة للصفوف. */
function buildHeaders(headerCells: string[], width: number): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  for (let c = 0; c < width; c++) {
    let name = (headerCells[c] ?? "").trim() || `عمود ${c + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n > 0) name = `${name}_${n}`;
    out.push(name);
  }
  return out;
}

/**
 * شكل الورقة (صف الهيدر + عمود اللوحة + الأعمدة) **من غير** بناء كل الصفوف.
 * ضروري لاستيراد ملف داتا ضخم (مليون صف/ورقة): بنكتشف الشكل بمرور خفيف،
 * وبعدين بنبني الصفوف على دفعات في dataStore بدل ما نحمّلها كلها في الذاكرة.
 * plateCol = -1 معناها الورقة مفيهاش عمود لوحات.
 */
export function analyzeSheetShape(
  aoa: unknown[][]
): { headerRow: number; plateCol: number; plateColName: string; headers: string[] } {
  const width = widthOf(aoa);
  if (width === 0) return { headerRow: -1, plateCol: -1, plateColName: "", headers: [] };

  const { col: plateCol } = findPlateColumn(aoa, width);
  if (plateCol < 0) {
    return {
      headerRow: -1, plateCol: -1, plateColName: "",
      headers: buildHeaders((aoa[0] ?? []).map((v) => String(v ?? "")), width),
    };
  }

  const headerRow = findHeaderRow(aoa, plateCol);
  const headerCells = headerRow >= 0 ? (aoa[headerRow] ?? []).map((v) => String(v ?? "")) : [];
  const headers = buildHeaders(headerCells, width);
  const plateColName = headerRow >= 0 ? headers[plateCol] : "";
  return { headerRow, plateCol, plateColName, headers };
}

/** يحلّل ورقة واحدة (صفوفها كمصفوفات خام). */
export function analyzeSheet(name: string, aoa: unknown[][], hidden = false): SheetInfo {
  const width = widthOf(aoa);
  const empty: SheetInfo = {
    name, headerRow: -1, plateCol: -1, plateColName: "",
    plateCount: 0, rowCount: 0, headers: [], rows: [], hidden,
  };
  if (width === 0) return empty;

  const { headerRow, plateCol, plateColName, headers } = analyzeSheetShape(aoa);
  if (plateCol < 0) {
    // مفيش لوحات — بنرجّع الورقة بهيدرها عشان تفضل معروضة بعدد صفر.
    return { ...empty, headers };
  }

  const rows: Record<string, string>[] = [];
  const unique = new Set<string>();
  for (let i = headerRow + 1; i < aoa.length; i++) {
    const raw = aoa[i];
    if (!raw || !raw.some((v) => String(v ?? "").trim() !== "")) continue;   // صف فاضي
    const plate = cell(raw, plateCol);
    if (!isPlateLike(plate)) continue;                                       // صف بلا لوحة
    unique.add(normalizeForCount(plate));
    const obj: Record<string, string> = {};
    for (let c = 0; c < width; c++) obj[headers[c]] = cell(raw, c);
    rows.push(obj);
  }

  return { name, headerRow, plateCol, plateColName, plateCount: unique.size, rowCount: rows.length, headers, rows, hidden };
}

/** يحلّل كل ورقات الملف. */
export function analyzeWorkbook(sheets: { name: string; aoa: unknown[][]; hidden?: boolean }[]): SheetInfo[] {
  return sheets.map((s) => analyzeSheet(s.name, s.aoa, s.hidden === true));
}

/**
 * الاختيار الافتراضي عند رفع الملف — بيعلّم على ورقات «المطلوبين» بس.
 *
 * ملفات الشركات بتيجي بنمط ثابت: ورقة ضخمة فيها **كل أسطول الشركة** (مرجع، مش
 * مطلوبين)، + ورقات صغيرة بالمطلوبين فعلاً (مباعة/مسروقة/قبل وبعد الاستحواذ)،
 * + أحياناً ورقة خام بلا عنوان (نسخة عمل). فبنستبعد:
 *   • الورقة **المهيمنة**: لوحاتها ≥٦٠٪ من الملف و≥٣ أضعاف تانية أكبر ورقة.
 *   • الورقات **بلا صف عنوان** — دي نسخ خام مش قوائم رسمية.
 * وأي استبعاد بيرجع لو هيسيبنا بلا اختيار خالص.
 *
 * ده **افتراضي بس** — المندوب بيغيّره من الاختيار وبيتحفظ.
 */
export function defaultSelection(sheets: SheetInfo[]): Set<string> {
  const withPlates = sheets.filter((s) => s.plateCount > 0);
  if (withPlates.length <= 1) return new Set(withPlates.map((s) => s.name));

  const counts = withPlates.map((s) => s.plateCount).sort((a, b) => b - a);
  const total = counts.reduce((a, b) => a + b, 0);
  const [biggest, second = 0] = counts;
  // ⚠️ النمط بيحتاج **٣ ورقات على الأقل**: أسطول + مباعة + مسروقة… ورقتين بس
  //    مافيش فيهم دليل كفاية إن الكبيرة مرجع مش مطلوبين — ومحفظة «مجمع الجبر»
  //    (١٠٣ + ٧ والاتنين مطلوبين) كانت بتتقص فيها الكبيرة، فالمندوب يفرز على
  //    ٧ لوحات ويعيد الباقي بإيده. تفويت مطلوب أخطر من إن الفرز يكبر شوية.
  const hasDominant = withPlates.length >= 3 && biggest >= total * 0.6 && biggest >= second * 3;

  const keep = withPlates.filter((s) => {
    if (s.hidden) return false;                                   // ورقة عمل مخفية
    if (hasDominant && s.plateCount === biggest) return false;   // أسطول الشركة
    if (s.headerRow < 0) return false;                            // نسخة خام بلا عنوان
    return true;
  });

  // ماينفعش نسيبه بلا اختيار — لو الاستبعاد شال كل حاجة، علّم على الكل.
  return new Set((keep.length ? keep : withPlates).map((s) => s.name));
}

/** إجمالي اللوحات الفريدة عبر الورقات المختارة (المكرر بين الورقات مرة واحدة). */
export function totalPlates(sheets: SheetInfo[]): number {
  const all = new Set<string>();
  for (const s of sheets) {
    if (s.plateCol < 0) continue;
    for (const r of s.rows) all.add(normalizeForCount(r[s.headers[s.plateCol]]));
  }
  return all.size;
}
