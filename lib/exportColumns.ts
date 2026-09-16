/**
 * ترتيب أعمدة التصدير/المشاركة — **ثابت ومتّفق عليه مع المالك**.
 *
 * المشكلة قبل كده: الأعمدة كانت بتتبني من **اتحاد مفاتيح الصفوف**. صفوف الداتا
 * بتجيب أعمدة المحفظة وصفوف السجلات بتجيب أعمدتها، فالملف كان بيطلع فيه
 * «الماركة» مرتين و«العنوان» مرتين وأعمدة فاضية وسط الجدول.
 *
 * الحل: اسم موحّد لكل معنى، وأي عمود من أي مصدر بيتلمّ تحته. اللي مالوش مكان
 * في الترتيب بيتلحق آخر الملف (مش بيتشال) — عشان مافيش بيانات تضيع.
 */

export interface ExportColumnSpec {
  /** الاسم اللي هيظهر في الملف. */
  name: string;
  /** أي عمود اسمه بيطابق ده بيتلمّ تحت الاسم ده. */
  match: RegExp;
}

/** الترتيب المطلوب — بالظبط زي ما المالك رتّبه. */
export const EXPORT_COLUMNS: ExportColumnSpec[] = [
  { name: "رقم اللوحة",     match: /^\s*رقم اللوحة\s*$|^\s*اللوحة\s*$/ },
  { name: "نوع السيارة",    match: /نوع|طراز/ },
  { name: "الحي-الشارع",    match: /حي|شارع|عنوان|address|street/i },
  { name: "GPS",            match: /^\s*gps\s*$|موقع|خريطة|location/i },
  { name: "الماركة",        match: /ماركة|صانع|make|manufact|brand/i },
  { name: "اللون",          match: /لون|colou?r/i },
  { name: "سنة الصنع",      match: /سنة|موديل|year/i },
  { name: "ملاحظة",         match: /ملاحظ|note/i },
  { name: "تاريخ التسجيل",  match: /تاريخ|date/i },
  { name: "المندوب",        match: /^\s*المندوب\s*$/ },
];

/**
 * أعمدة **مش بتظهر في نتيجة الفرز خالص** (بطلب المالك).
 *
 * «الحالة» كان البرنامج بيحطّه بنفسه بقيمة «مطلوبة» في **كل صف** — معلومة صفر
 * بتاخد عرض من الجدول والصورة. والشيل لازم يكون صريح: مجرد إني أشيله من
 * الترتيب مش كفاية، لأن أي عمود مش في الترتيب بيتلحق آخر الملف.
 * المطابقة **كاملة** عشان عمود زي «الحالة الفنية» مايتشالش بالغلط.
 */
export const HIDDEN_EXPORT_COLUMNS: RegExp[] = [/^\s*الحالة\s*$/];

const isHidden = (header: string) => HIDDEN_EXPORT_COLUMNS.some((re) => re.test(header));

const text = (v: unknown) => String(v ?? "").trim();

/**
 * عمود متسمّي بمصدره: «نوع السيارة (المحفظة)» أو «الماركة (الداتا)».
 *
 * نتيجة الفرز بتطلّع عمودين لنفس المعنى لما المعنى موجود في الداتا وفي المحفظة
 * — الأول بالاسم الثابت والتاني متسمّي بمصدره. العمود المتسمّي **مش مرشّح** لخانة
 * أخوه؛ له خانته هو. من غير الاستثناء ده كان بيحصل حاجتين وحشين على داتا حقيقية:
 * لو نوع الداتا فاضي، نوع المحفظة بياخد مكانه (فمعنى العمود بيتغيّر من صف لصف)،
 * ولو الداتا مليانة، عمود المحفظة بيتزقّ آخر الملف بعد «الحالة» — وساعات يتشال.
 */
const SOURCE_SUFFIX = /\s*\((?:المحفظة|الداتا)\)\s*$/;

/** اسم العمود من غير لاحقة المصدر — «نوع السيارة (المحفظة)» → «نوع السيارة». */
function baseName(header: string): string {
  return String(header ?? "").replace(SOURCE_SUFFIX, "").trim();
}

/** بيحوّل صف بأعمدة أي مصدر لصف بالأعمدة الموحّدة. */
export function toExportRow(
  src: Record<string, unknown>,
  specs: ExportColumnSpec[] = EXPORT_COLUMNS,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const used = new Set<string>();
  // الأعمدة المتسمّية بمصدرها بتتحجز من البداية عشان ماتتحطّش في خانة غيرها.
  const qualified = Object.keys(src).filter((k) => SOURCE_SUFFIX.test(k) && !isHidden(k));
  for (const k of qualified) used.add(k);

  for (const spec of specs) {
    out[spec.name] = "";
    for (const [k, v] of Object.entries(src)) {
      if (used.has(k) || isHidden(k) || !spec.match.test(k) || !text(v)) continue;
      out[spec.name] = v;          // أول خانة فيها قيمة تكسب
      used.add(k);
      break;
    }
    // إخوة العمود ده المتسمّيين بمصدرهم — جنبه على طول، مش آخر الملف.
    for (const k of qualified) {
      if (k in out || baseName(k) !== spec.name) continue;
      out[k] = src[k] ?? "";
    }
    // وباقي الإخوة: أي عمود تاني بيطابق نفس الخانة (زي «الحي» مع «العنوان»).
    // خانة واحدة بتاخد واحد بس، والباقي كان بيتزقّ **آخر الملف** — فالمندوب
    // اللي مختار «الحي» رقم ٤ كان بيلاقيه آخر عمود مهما عمل. دلوقتي بيقف هنا.
    for (const [k, v] of Object.entries(src)) {
      if (used.has(k) || isHidden(k) || k in out || !spec.match.test(k) || !text(v)) continue;
      out[k] = v;
      used.add(k);
    }
  }
  // اللي مالوش مكان في الترتيب وفيه قيمة — يتلحق آخر الملف بدل ما يضيع.
  // (ده بيشمل عمود متسمّي بمصدره اسمه الأساسي مش في الترتيب أصلاً.)
  for (const [k, v] of Object.entries(src)) {
    if (k in out || isHidden(k) || !text(v)) continue;
    if (used.has(k) && !qualified.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * الملف كامل: كل الصفوف بالأعمدة الموحّدة، والأعمدة **الفاضية تمامًا في كل
 * الصفوف** بتتشال (كانت بتطلع أعمدة فاضية وسط الجدول).
 */
export function buildExportRows(
  sources: Record<string, unknown>[],
  specs: ExportColumnSpec[] = EXPORT_COLUMNS,
): { columns: string[]; rows: Record<string, unknown>[] } {
  const mapped = sources.map((o) => toExportRow(o, specs));
  const columns: string[] = [];
  for (const r of mapped) for (const k of Object.keys(r)) if (!columns.includes(k)) columns.push(k);
  const kept = columns.filter((c) => mapped.some((r) => text(r[c])));
  const rows = mapped.map((r) => {
    const out: Record<string, unknown> = {};
    for (const c of kept) out[c] = r[c] ?? "";
    return out;
  });
  return { columns: kept, rows };
}

/**
 * صفوف المشاركة **بترتيب العرض زي ما هو** — للوضع «المخصّص».
 *
 * المندوب رتّب أعمدته بإيده على التليفون، والمشاركة كانت بتعدّي على الترتيب
 * الثابت (`EXPORT_COLUMNS`) فيطلع الإكسيل والصورة بترتيب تاني خالص. صفوف
 * المشاركة بتتبني أصلاً بترتيب العرض، فترتيب مفاتيح الصف **هو** ترتيب المندوب
 * — بناخده زي ما هو ومانعيدش ترتيبه.
 *
 * اللي بيفضل زي التصدير العادي: الأعمدة المحجوبة بتتشال، والعمود الفاضي في
 * **كل** الصفوف بيتشال، وكل صف بياخد كل الأعمدة (الناقص فاضي).
 */
export function buildDisplayRows(
  sources: Record<string, unknown>[],
): { columns: string[]; rows: Record<string, unknown>[] } {
  const columns: string[] = [];
  for (const src of sources) {
    for (const k of Object.keys(src)) {
      if (isHidden(k) || columns.includes(k)) continue;
      columns.push(k);
    }
  }
  const kept = columns.filter((c) => sources.some((r) => text(r[c])));
  const rows = sources.map((src) => {
    const out: Record<string, unknown> = {};
    for (const c of kept) out[c] = src[c] ?? "";
    return out;
  });
  return { columns: kept, rows };
}
