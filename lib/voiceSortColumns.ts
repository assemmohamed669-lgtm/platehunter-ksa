/**
 * ══════════════════════════════════════════════════════════════════════
 *  🎛️ أعمدة نتيجة فرز «صوت فقط» — زي صفحة الفرز بالظبط
 * ══════════════════════════════════════════════════════════════════════
 * المالك (٩ أكتوبر ٢٠٢٦): «انا عايزك تشيلها [الأعمدة] دي من عندهم وتحط نفس اللي في صفحه الفرز اللي هو خيار
 * الترتيب الاساسي للاعمده (زي البرنامج) وخيار تخصيص ... ولما يختار ويحدد التحديدة اللي هو عايزها تتحفظ حتي لو
 * خرج من البرنامج او اتنقل للصفحات».
 *
 * - **أساسي** = نفس ترتيب صفحة الفرز المتّفق عليه (`buildExportRows` / `EXPORT_COLUMNS`): كل معنى في عمود واحد
 *   («النوع» ⇐ «نوع السيارة»، «الموقع» ⇐ «GPS»، «التاريخ» ⇐ «تاريخ التسجيل»…) واللي مالوش مكان بيتلحق في الآخر.
 * - **تخصيص** = رقم اللوحة وبعده اللي المندوب اختاره **بترتيبه** (`orderedLabels`).
 * الوضع والترتيب بيتحفظوا على الجهاز بنفس مفاتيح صفحة الفرز (`lib/columnOrder.ts`).
 */
import { buildExportRows, HIDDEN_EXPORT_COLUMNS } from "./exportColumns";
import { orderedLabels, type OrderMode } from "./columnOrder";

export const VS_PLATE_COL = "رقم اللوحة";

const text = (v: unknown) => String(v ?? "").trim();
/** «الحالة» وغيره — مابيظهروش في نتيجة الفرز خالص (زي صفحة الفرز). */
const hidden = (k: string) => HIDDEN_EXPORT_COLUMNS.some((re) => re.test(k));

/**
 * جدول النتيجة بالأعمدة اللي هتظهر **وتتشارك** — `src` كل صف فيه «رقم اللوحة» + أعمدة السجل والإحالة.
 * أول عمود دايماً «رقم اللوحة».
 */
export function voiceSortTable(
  src: Record<string, unknown>[],
  mode: OrderMode,
  order: readonly string[],
): { columns: string[]; rows: Record<string, unknown>[] } {
  if (mode !== "custom") return buildExportRows(src);
  const avail: string[] = [];
  for (const r of src) {
    for (const [k, v] of Object.entries(r)) {
      if (k === VS_PLATE_COL || hidden(k) || !text(v) || avail.includes(k)) continue;
      avail.push(k);
    }
  }
  const columns = [VS_PLATE_COL, ...orderedLabels(avail, [...order])];
  return { columns, rows: src.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? ""]))) };
}

/** أعمدة الاختيار في «تخصيص» مقسّمة: السجلات ثم الإحالة — من غير رقم اللوحة والفاضي ومن غير تكرار. */
export function voiceSortGroups(
  results: readonly { dataRow?: Record<string, string> | null; referralRow: Record<string, string> }[],
): { records: string[]; referral: string[] } {
  const records: string[] = [];
  const referral: string[] = [];
  const seen = new Set<string>([VS_PLATE_COL]);
  for (const m of results) {
    for (const [k, v] of Object.entries(m.dataRow ?? {})) {
      if (seen.has(k) || hidden(k) || !text(v)) continue;
      seen.add(k); records.push(k);
    }
  }
  for (const m of results) {
    for (const [k, v] of Object.entries(m.referralRow ?? {})) {
      if (seen.has(k) || hidden(k) || !text(v)) continue;
      seen.add(k); referral.push(k);
    }
  }
  return { records, referral };
}

/**
 * 🧾 صف **السجل** بأسماء البرنامج قبل الترتيب — مراجعة ٩ أكتوبر ٢٠٢٦.
 *
 * السجل (`recordsToRows`) بيتحفظ ومعاه أعمدة ملف التشييك **قبل** «التاريخ»/«الموقع» بتوعه، والترتيب الأساسي بياخد
 * أول قيمة بتطابق الخانة ⇒ عمود زي «تاريخ الإحالة» أو «GPS» من الملف كان بياخد «تاريخ التسجيل»/«GPS» مكان تاريخ
 * وموقع المندوب الحقيقيين. هنا تاريخ المندوب ⇐ «تاريخ التسجيل» وموقعه ⇐ «GPS» **في الأول**، وأي عمود من الملف
 * بنفس الاسم بيتشال (زي صفحة الفرز: لينك المندوب بيغلب). صف مش سجل (مالوش «الطريقة») بيرجع زي ما هو.
 */
export function recordRowForSort(row: Record<string, string>): Record<string, string> {
  if (!row || !("الطريقة" in row)) return row;
  const out: Record<string, string> = {};
  if (VS_PLATE_COL in row) out[VS_PLATE_COL] = row[VS_PLATE_COL];
  if (text(row["التاريخ"])) out["تاريخ التسجيل"] = row["التاريخ"];
  if (text(row["الموقع"])) out["GPS"] = row["الموقع"];
  for (const [k, v] of Object.entries(row)) {
    if (k === "التاريخ" || k === "الموقع" || k in out) continue;
    out[k] = v;
  }
  return out;
}

/**
 * 💾 حفظ ترتيب «صوت فقط» **لوحده** — مراجعة ٩ أكتوبر ٢٠٢٦: بنفس مفاتيح صفحة الفرز كانت الأسماء بتتلخبط بين الصفحتين
 * (صفحة الفرز بأسماء موحّدة و«صوت فقط» بأعمدة الصفوف)، فمشترك اتحوّل من باقة لباقة كان ممكن يلاقي رقم اللوحة بس.
 * نفس السلوك بالظبط (الافتراضي «أساسي»، والاختيار بيفضل لحد ما المندوب يغيّره بإيده).
 */
const VS_ORDER_KEY = "ph:voiceSort:colOrder";
const VS_MODE_KEY = "ph:voiceSort:colMode";

export function loadVoiceSortOrder(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(VS_ORDER_KEY) || "[]") as unknown;
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}
export function saveVoiceSortOrder(order: string[]): void {
  try { localStorage.setItem(VS_ORDER_KEY, JSON.stringify(order)); } catch { /* storage unavailable */ }
}
export function loadVoiceSortMode(): OrderMode {
  try { return localStorage.getItem(VS_MODE_KEY) === "custom" ? "custom" : "basic"; } catch { return "basic"; }
}
export function saveVoiceSortMode(m: OrderMode): void {
  try { localStorage.setItem(VS_MODE_KEY, m); } catch { /* storage unavailable */ }
}
