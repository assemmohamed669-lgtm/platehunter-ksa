/**
 * 📄 أعمدة نتيجة «شهايد النهارده» — ترتيب المالك ثابت، والمندوب يخفي/يظهر بإيده.
 *
 * المالك (٥ أكتوبر ٢٠٢٦): «اولا رقم اللوحه وبعديها النوع في الداتا او السجلات ... وبعدين نوع
 * السيارة او نوع المركبه من الشهادة ... وبعدين العنوان وبعدين gps وبعدين تاريخ التسجيل ... وبعدين
 * موقعها في الداتا وبعدين عمود الشهادة وبعدين الحاله وبعدين اسم المؤجر».
 * والباقي مستخبي: «خليها خيار المندوب يقدر يظهرهم لو حب ... بس خلي ثابت اللي انا قولتلك عليه ولو
 * هو حب يخفي حاجه او يظهر يقدر يعملها يدوي».
 *
 *  · رقم اللوحة ثابت أول عمود (برّه القايمة دي).
 *  · عمود من الأساسي بيستخبى، ولما يرجع بيرجع **مكانه الثابت**.
 *  · الإضافي بيظهر في الآخر **بالترتيب اللي المندوب دوس بيه**.
 * الاختيار بيتحفظ على الجهاز، ومنفصل عن ترتيب أعمدة الفرز العادي.
 */
import type { WantedRow } from "@/components/WantedResultsTable";

export const CERT_DEFAULT_COLS = [
  "النوع", "نوع المركبة", "العنوان", "GPS", "تاريخ التسجيل", "موقعها في الداتا", "الشهادة", "الحالة", "المؤجر",
] as const;
export const CERT_EXTRA_COLS = ["رقم الشاص", "الماركة", "سنة الصنع", "اللون", "حالة العقد", "تاريخ الشهادة", "الحي"] as const;
/** أعمدة أزرار مش بيانات — مابتدخلش الإكسيل ولا الصورة ولا نص واتساب. («الشهادة» بقى فيها رقم العقد ⇒ بتدخل.) */
export const CERT_ACTION_COLS: ReadonlySet<string> = new Set(["موقعها في الداتا"]);

export interface CertColPrefs {
  /** أعمدة من الأساسي المندوب خبّاها. */
  hidden: string[];
  /** أعمدة إضافية المندوب ظهّرها — بترتيب الدوس. */
  extras: string[];
}
export const DEFAULT_CERT_COL_PREFS: CertColPrefs = { hidden: [], extras: [] };

const DEFAULTS: ReadonlySet<string> = new Set(CERT_DEFAULT_COLS);
const EXTRAS: ReadonlySet<string> = new Set(CERT_EXTRA_COLS);

/** الأعمدة المعروضة بالترتيب (من غير رقم اللوحة). */
export function certDisplayCols(p: CertColPrefs): string[] {
  const hidden = new Set(p.hidden);
  const seen = new Set<string>();
  const extras = p.extras.filter((c) => EXTRAS.has(c) && !seen.has(c) && (seen.add(c), true));
  return [...CERT_DEFAULT_COLS.filter((c) => !hidden.has(c)), ...extras];
}

export function isCertColOn(p: CertColPrefs, label: string): boolean {
  return DEFAULTS.has(label) ? !p.hidden.includes(label) : p.extras.includes(label);
}

/** دوسة على عمود: الأساسي بيستخبى/يرجع مكانه، والإضافي بيتضاف في الآخر/يتشال. */
export function toggleCertCol(p: CertColPrefs, label: string): CertColPrefs {
  if (DEFAULTS.has(label)) {
    return p.hidden.includes(label)
      ? { ...p, hidden: p.hidden.filter((c) => c !== label) }
      : { ...p, hidden: [...p.hidden, label] };
  }
  if (EXTRAS.has(label)) {
    return p.extras.includes(label)
      ? { ...p, extras: p.extras.filter((c) => c !== label) }
      : { ...p, extras: [...p.extras, label] };
  }
  return p;
}

const KEY = "ph:certs:cols";
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function loadCertColPrefs(): CertColPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CERT_COL_PREFS;
    const o = JSON.parse(raw) as { hidden?: unknown; extras?: unknown } | null;
    return { hidden: strings(o?.hidden), extras: strings(o?.extras) };
  } catch {
    return DEFAULT_CERT_COL_PREFS;
  }
}

export function saveCertColPrefs(p: CertColPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* التخزين مش متاح */ }
}

/** قيمة خانة في جدول الشهايد (الأعمدة النصية — الأزرار ليها خانات خاصة). */
export function certCellValue(r: WantedRow, label: string): string {
  switch (label) {
    case "النوع": return r.type;
    case "نوع المركبة": return r.vehicleModel ?? "";
    case "العنوان": return r.address;
    case "GPS": return r.mapsLink;
    case "تاريخ التسجيل": return r.date;
    case "الحالة": return r.wantedStatus ?? "";
    case "الشهادة": return r.certNo ?? "";
    case "المؤجر": return r.bank ?? "";
    case "رقم الشاص": return r.vin ?? "";
    case "الماركة": return r.brand;
    case "سنة الصنع": return r.year;
    case "اللون": return r.color;
    case "حالة العقد": return r.contract ?? "";
    case "تاريخ الشهادة": return r.certDate ?? "";
    case "الحي": return r.district ?? "";
    default: return "";
  }
}

/** صف إكسيل/مشاركة بنفس أعمدة الجدول وترتيبها — من غير الأزرار. */
export function certExportRow(r: WantedRow, cols: readonly string[]): Record<string, string> {
  const o: Record<string, string> = { "رقم اللوحة": r.plate };
  for (const c of cols) if (!CERT_ACTION_COLS.has(c)) o[c] = certCellValue(r, c);
  return o;
}

/**
 * مشاركة واحدة للنافذتين (المالك ٦ أكتوبر ٢٠٢٦: «المشاركه تبقي مجمعه ... يشارك اللي طالع من الداتا
 * واللي طالع من السجلات في مشاركه واحدة») — نفس الأعمدة، و«المصدر» جنب اللوحة (داتا / سجلات).
 */
export function certCombinedExportRows(dataRows: readonly WantedRow[], recordRows: readonly WantedRow[], cols: readonly string[]): Record<string, string>[] {
  const tag = (r: WantedRow, src: string) => {
    const { "رقم اللوحة": plate, ...rest } = certExportRow(r, cols);
    return { "رقم اللوحة": plate, "المصدر": src, ...rest };
  };
  return [...dataRows.map((r) => tag(r, "داتا")), ...recordRows.map((r) => tag(r, "سجلات"))];
}

/** نص واتساب لعربية — نفس الأعمدة المعروضة: الحالة جنب اللوحة والخريطة في الآخر. */
export function certShareText(r: WantedRow, cols: readonly string[]): string {
  const status = cols.includes("الحالة") && r.wantedStatus ? ` — ${r.wantedStatus}` : "";
  const lines = [`🚗 ${r.plate}${status}`];
  for (const c of cols) {
    if (CERT_ACTION_COLS.has(c) || c === "GPS" || c === "الحالة") continue;
    const v = certCellValue(r, c);
    if (v) lines.push(`${c}: ${v}`);
  }
  if (cols.includes("GPS") && r.mapsLink) lines.push(`📍 ${r.mapsLink}`);
  return lines.join("\n");
}
