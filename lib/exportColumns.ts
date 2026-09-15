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
  { name: "الحالة",         match: /^\s*الحالة\s*$/ },
];

const text = (v: unknown) => String(v ?? "").trim();

/** بيحوّل صف بأعمدة أي مصدر لصف بالأعمدة الموحّدة. */
export function toExportRow(
  src: Record<string, unknown>,
  specs: ExportColumnSpec[] = EXPORT_COLUMNS,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const used = new Set<string>();
  for (const spec of specs) {
    out[spec.name] = "";
    for (const [k, v] of Object.entries(src)) {
      if (used.has(k) || !spec.match.test(k) || !text(v)) continue;
      out[spec.name] = v;          // أول خانة فيها قيمة تكسب
      used.add(k);
      break;
    }
  }
  // اللي مالوش مكان في الترتيب وفيه قيمة — يتلحق آخر الملف بدل ما يضيع.
  for (const [k, v] of Object.entries(src)) {
    if (used.has(k) || k in out || !text(v)) continue;
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
