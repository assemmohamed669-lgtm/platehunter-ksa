/**
 * 📤 «مشاركة اللوحات الجديدة» في «فرز جديد» (٢٦ أكتوبر ٢٠٢٦).
 *
 * المالك: «لما المندوب يختار فرز جديد يظهر تحت شيت الاحاله علامه مشاركه صغيرة ولما المندوب يدوس عليها يجيلو رساله
 * مفادها ان البرنامج هيشارك لوحات السيارات الجديدة في شيت اكسيل ولما يختارها يشارك الملف اكسيل وفيه لوحات السيارات
 * الجديدة في الشيت بكل بياناتها اللي نازله في المحفظه».
 *
 * «الجديد» = **نفس حساب «فرز جديد» بالحرف** (`runNewSort`): كل شيتات الإحالة مدموجة ومزالة التكرار (أول ظهور يكسب —
 * `collectReferralEntries`) ناقص اللي في ملفات التشييك (`splitReferralByCheck`) ⇒ العدد بيطابق «X من Y في التشييك».
 * الصف بيطلع بكل أعمدة المحفظة زي ما هو (نسخة — الإكسيل مابيلمسش بيانات الصفحة).
 */
import { collectReferralEntries, type ReferralSource } from "./plateParser";
import { splitReferralByCheck } from "./newSortCheck";
import { normalizeArabicKey, looksLikeCarName } from "./sortingCols";

export function newPlatesFromReferral(sources: ReferralSource[], checkSet: Set<string>): Record<string, string>[] {
  return splitReferralByCheck(collectReferralEntries(sources), checkSet).fresh.map((e) => ({ ...e.row }));
}

/**
 * ↔️ ترتيب الأعمدة (المالك ٢٦ أكتوبر ٢٠٢٦): «عمود رقم اللوحه والنوع او طراز المركبه وصانع المركبه وسنه الصنع ولون
 * المركبه والشاص دول بالترتيب كدة ييجو ان وجدو يبقي ترتيبهم من اليمين لليسار وييجي بعدهم باقي البيانات ان وجدت».
 * الورقة بتتفتح من اليمين (RTL) ⇒ أول عمود في القايمة = أقصى اليمين. الخانة اللي فيها أكتر من عمود (كذا شيت) ⇒
 * جنب بعض بترتيب ظهورهم؛ والباقي بترتيبه الأصلي.
 */
const SLOT_PLATE = 0, SLOT_TYPE = 1, SLOT_MAKE = 2, SLOT_YEAR = 3, SLOT_COLOR = 4, SLOT_CHASSIS = 5;

// «النوع» بالاسم بالظبط بس — «نوع التمويل»/«نوع اللوحة»/«نوع العقد» مش نوع العربية.
const TYPE_EXACT = new Set([
  "نوع", "النوع", "نوع المركبه", "نوع السياره", "نوع العربيه", "اسم المركبه", "اسم السياره",
  "vehicle name", "vehicle type", "car type", "type of car", "car name",
]);

// «الموديل» ملتبس: عند ناس سنة (٢٠١٩) وعند ناس طراز (كامري) ⇒ القيم بتحسم.
function looksLikeYears(header: string, rows: Record<string, string>[]): boolean | null {
  let seen = 0, years = 0;
  for (const r of rows) {
    const v = String(r[header] ?? "").trim();
    if (!v) continue;
    seen++;
    if (/^(19|20)\d{2}$/.test(v)) years++;
    if (seen >= 200) break;
  }
  return seen ? years / seen >= 0.8 : null;
}

const COLOR_WORDS = new Set([
  "ابيض", "اسود", "فضي", "رمادي", "احمر", "ازرق", "اخضر", "بني", "بيج", "ذهبي", "عنابي", "كحلي", "برتقالي", "اصفر",
  "لولوي", "بنفسجي", "زيتي", "سماوي", "نحاسي", "white", "black", "silver", "grey", "gray", "red", "blue", "green", "brown",
  "beige", "gold", "maroon", "orange", "yellow", "navy", "platinum", "pearl", "bronze", "purple",
]);
const isVin = (v: string) => /^[A-HJ-NPR-Z0-9]{17}$/i.test(v) && /\d/.test(v) && /[a-z]/i.test(v);
const isYear = (v: string) => /^(19|20)\d{2}$/.test(v);
// كلمة كاملة (مش جوّه كلمة: «Expired» فيها red)
const isColor = (v: string) => normalizeArabicKey(v).split(/[^a-z؀-ۿ]+/).some((t) => COLOR_WORDS.has(t.replace(/^ال/, "")));
const CONTENT_TESTS: [number, (v: string) => boolean][] = [
  [SLOT_CHASSIS, isVin], [SLOT_YEAR, isYear], [SLOT_COLOR, isColor], [SLOT_TYPE, looksLikeCarName],
];

/**
 * ملف من غير عناوين (أول صف داتا — زي إحالة عبد اللطيف جميل): «العنوان» نفسه قيمة ⇒ العمود بيتعرف من قيمه.
 * لازم العنوان نفسه يعدّي نفس الاختبار — فملف بعناوين عمرها ماتتحرّك عمود اسمه مش منهم.
 */
function contentSlot(header: string, rows: Record<string, string>[]): number | null {
  const hv = header.trim();
  for (const [slot, ok] of CONTENT_TESTS) {
    if (!ok(hv)) continue;
    let seen = 0, hits = 0;
    for (const r of rows) {
      const v = String(r[header] ?? "").trim();
      if (!v) continue;
      seen++;
      if (ok(v)) hits++;
      if (seen >= 200) break;
    }
    if (!seen || hits / seen >= 0.6) return slot;
  }
  return null;
}

function columnSlot(header: string, plateCols: Set<string>, rows: Record<string, string>[]): number | null {
  if (plateCols.has(header)) return SLOT_PLATE;
  // العنوان المتكرر بيتسمّى «نوع المركبة (2)» ⇒ يتقرا زي أخوه
  const h = normalizeArabicKey(header).replace(/\s*\(\d+\)$/, "");
  const word = (w: string) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(h);
  // «Structure No» = ترجمة «رقم الهيكل» (Vehicles Details For Repo)
  if (/شاص|شاسي|هيكل|chas+is/.test(h) || word("vin") || word("structure")) return SLOT_CHASSIS;
  if (/لون/.test(h) || word("colou?r")) return SLOT_COLOR;
  if (/(^|\s)(ال)?سنه/.test(h) || word("year")) return SLOT_YEAR;
  if (/صانع|مصنع|ماركه/.test(h) || word("make") || word("manufacturer") || word("brand")) return SLOT_MAKE;
  if (/طراز/.test(h) || TYPE_EXACT.has(h)) return SLOT_TYPE;
  if (/موديل/.test(h) || word("model")) {
    const y = looksLikeYears(header, rows);
    return (y ?? /موديل/.test(h)) ? SLOT_YEAR : SLOT_TYPE;
  }
  return contentSlot(header, rows);
}

export function orderNewPlatesColumns(headers: string[], plateCols: string[], rows: Record<string, string>[]): string[] {
  const plates = new Set(plateCols);
  const slots: string[][] = [[], [], [], [], [], []];
  const rest: string[] = [];
  for (const h of headers) {
    const s = columnSlot(h, plates, rows);
    (s == null ? rest : slots[s]).push(h);
  }
  return [...slots.flat(), ...rest];
}

/** صفوف الجديد + ترتيب أعمدته (كل الأعمدة من كل الشيتات). */
export function newPlatesSheet(
  sources: ReferralSource[],
  checkSet: Set<string>,
): { rows: Record<string, string>[]; headers: string[] } {
  const rows = newPlatesFromReferral(sources, checkSet);
  const seen = new Set<string>();
  const all: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); all.push(k); }
  return { rows, headers: orderNewPlatesColumns(all, sources.map((s) => s.plateCol), rows) };
}

/** الرسالة اللي بتطلع قبل المشاركة. */
export function newPlatesConfirmText(count: number): string {
  return `البرنامج هيشارك لوحات السيارات الجديدة (${count.toLocaleString("ar-EG")} لوحة) في ملف إكسيل بكل بياناتها اللي في المحفظة. تكمّل؟`;
}

/** اسم الملف من غير الامتداد: «لوحات-جديدة-2026-10-26». */
export function newPlatesFileBase(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `لوحات-جديدة-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 📁 اسم الملف المتشارك = **نفس اسم ملف الإحالة المرفوع** (المالك: «يتشارك بنفس اسم الملف المرفوع») بامتداد الملف
 * الجديد (xlsx أو csv الاحتياطي). من غير اسم ⇒ «لوحات-جديدة-التاريخ».
 */
export function newPlatesShareName(uploadedName: string | null | undefined, ext: string, now: Date): string {
  const name = (uploadedName ?? "").trim();
  const base = name.replace(/.[^.]+$/, "").trim();
  return `${base || newPlatesFileBase(now)}.${ext}`;
}
