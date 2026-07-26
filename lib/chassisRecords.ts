/**
 * سجل تشييك الشاص — بناء صفوف التصدير (شيت أرقام الشاص) + الفرز على الإحالات
 * بالشاص. دوال نقية قابلة للاختبار (المطابقة نفسها من lib/chassis.ts).
 */
import type { ChassisEntry } from "./idb";
import { detectChassisColumn, buildChassisIndex, matchChassisInIndex, type SheetTable } from "./chassis";

/** يلتقط اسم البنك من صف مطابق (أي عمود اسمه فيه «بنك»/bank). */
export function pickBank(row?: Record<string, string>): string {
  if (!row) return "";
  for (const k of Object.keys(row)) {
    if (/بنك|bank/i.test(k) && String(row[k] ?? "").trim()) return String(row[k]).trim();
  }
  return "";
}

/** يلتقط نوع/طراز السيارة من صف مطابق (مش «نوع الهيكل» — ده بدن مش نوع سيارة). */
export function pickVehicleType(row?: Record<string, string>): string {
  if (!row) return "";
  for (const k of Object.keys(row)) {
    const kn = k.toLowerCase();
    if (kn.includes("هيكل")) continue; // «نوع الهيكل» = بدن، مش نوع السيارة
    if (/نوع السيارة|نوع المركبة|vehicle name|vehicle type|طراز|صانع|موديل|model|make/.test(kn) && String(row[k] ?? "").trim()) {
      return String(row[k]).trim();
    }
  }
  return "";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** صف تصدير واحد لأرقام الشاص (يظهر في «شيت أرقام الشاص»). */
export function chassisExportRow(e: ChassisEntry): Record<string, string> {
  const loc = e.mapsLink || (e.lat != null && e.lng != null ? `${e.lat},${e.lng}` : "");
  return {
    "رقم الشاص": e.chassis,
    "رقم اللوحة": e.plate ?? "",
    "البنك": e.bank ?? pickBank(e.details),
    "نوع السيارة": e.vehicleType ?? pickVehicleType(e.details),
    "الحالة": e.found ? (e.matchType === "fuzzy" ? `مشتبه ${e.similarity ?? ""}%` : "مطلوب") : "غير مطابق",
    "الموقع": loc,
    "التاريخ والوقت": formatDateTime(e.checkedAt),
  };
}

export function buildChassisExportRows(entries: ChassisEntry[]): Record<string, string>[] {
  return entries.map(chassisExportRow);
}

export interface ChassisSortRow {
  chassis: string;
  found: boolean;
  matchType?: "exact" | "fuzzy";
  similarity?: number;
  referralRow?: Record<string, string>;
}

/** يبني فهرس شاص من كل أوراق الإحالة (يكتشف عمود الشاص في كل ورقة، أول ظهور يكسب). */
export function buildReferralChassisIndex(sheets: SheetTable[]): Map<string, Record<string, string>> {
  const merged = new Map<string, Record<string, string>>();
  for (const s of sheets) {
    const col = detectChassisColumn(s.headers, s.rows);
    if (!col) continue;
    const idx = buildChassisIndex(s.rows, col);
    for (const [k, row] of idx) if (!merged.has(k)) merged.set(k, row);
  }
  return merged;
}

/**
 * فرز شيت الشاص على الإحالات: كل رقم شاص (من شيت الشاص) بيتطابق على عمود الشاص
 * في الإحالات — تام أو تقريبي. بيرجّع صف لكل رقم مع حالته + صف الإحالة المطابق.
 */
export function sortChassisAgainstReferrals(
  chassisNumbers: string[],
  referralSheets: SheetTable[],
): ChassisSortRow[] {
  const index = buildReferralChassisIndex(referralSheets);
  return chassisNumbers.map((c) => {
    const m = matchChassisInIndex(index, c);
    return { chassis: m.chassis, found: m.found, matchType: m.matchType, similarity: m.similarity, referralRow: m.row };
  });
}
