/**
 * سجلات تشييك الشاصي (شيت رقم الشاص المنفصل).
 *
 * مخزّنة في localStorage مستقلة تماماً عن سجلات اللوحات (fieldChecks في IDB) —
 * عشان الشيتين يفضلوا منفصلين والشاصي مايلخبطش عرض/عدّادات اللوحات.
 * بتفضل بعد إعادة فتح التطبيق، وبتتصدّر لشيت «شيت رقم الشاص».
 */
import { detectChassisColumn, buildChassisIndex, matchChassis, normalizeChassis } from "./chassis";
import { toMapsLink } from "./gps";
import { typeToCode } from "./vehicleType";

export interface ChassisRecord {
  id: string;
  chassis: string;                    // رقم الشاص
  vehicleType?: string;               // نوع السيارة (يكتبها المندوب)
  notes?: string;                     // ملاحظات (يكتبها المندوب)
  region?: string;                    // اسم المنطقة (تلقائي من GPS، قابل للتعديل)
  row?: Record<string, string>;       // بيانات السيارة كاملة من الصف المطابق
  found: boolean;                     // مطلوب؟
  lat?: number;
  lng?: number;
  mapsLink?: string;
  checkedAt: string;                  // ISO — تاريخ الالتقاط/الكتابة
}

const KEY = "ph:check:chassisRecords";

export function getChassisRecords(): ChassisRecord[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(arr) ? (arr as ChassisRecord[]) : [];
  } catch {
    return [];
  }
}

function persist(all: ChassisRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full/off — best effort */
  }
}

/** Prepend a new record (newest first) and persist. Returns the updated list. */
export function addChassisRecord(rec: ChassisRecord): ChassisRecord[] {
  const all = [rec, ...getChassisRecords()];
  persist(all);
  return all;
}

export function deleteChassisRecord(id: string): ChassisRecord[] {
  const all = getChassisRecords().filter((r) => r.id !== id);
  persist(all);
  return all;
}

/** Patch one record's editable fields (نوع/ملاحظات/منطقة…) and persist. */
export function updateChassisRecord(id: string, patch: Partial<ChassisRecord>): ChassisRecord[] {
  const all = getChassisRecords().map((r) => (r.id === id ? { ...r, ...patch } : r));
  persist(all);
  return all;
}

export function clearChassisRecords(): void {
  persist([]);
}

/** يستبدل القائمة كلها ويحفظها — للحفظ الجماعي بعد التعديل بوضع «تعديل» (draft). */
export function replaceChassisRecords(list: ChassisRecord[]): ChassisRecord[] {
  const all = list.map((r) => ({ ...r }));
  persist(all);
  return all;
}

/**
 * يدمج سجلات جاية من السيرفر مع المحلي — بالـid (الموجود محلياً مايتكررش، السيرفر
 * بيكمّل الناقص). النتيجة مرتّبة بالأحدث. يُستخدم في استرجاع الشاص من Supabase.
 */
export function mergeChassisRecords(incoming: ChassisRecord[]): ChassisRecord[] {
  const byId = new Map<string, ChassisRecord>();
  for (const r of getChassisRecords()) byId.set(r.id, r);
  for (const r of incoming) if (!byId.has(r.id)) byId.set(r.id, r);
  const merged = [...byId.values()].sort((a, b) => (b.checkedAt || "").localeCompare(a.checkedAt || ""));
  persist(merged);
  return merged;
}

// ─── مشاركة شيت الشاص إكسيل (صفحة السجلات) ─────────────────────────────────

/** 📊 «مشاركة إكسيل» تحت شيت الشاص — للسوبر أدمن بس لحد ما المالك يجرّب (٣ نوفمبر ٢٠٢٦). */
export const CHASSIS_EXCEL_FOR_ALL = false;

const CHASSIS_BASE_HEADERS = ["رقم الشاص", "نوع السيارة", "الحي-الشارع", "ملاحظات", "GPS", "التاريخ", "الحالة"];

/**
 * صفوف إكسيل «شيت رقم الشاص» بترتيب المالك: الشاص (مكان «رقم اللوحة» في شيت اللوحات) ⇐ نوع السيارة ⇐ الحي-الشارع ⇐
 * ملاحظات ⇐ GPS ⇐ التاريخ (بالوقت) ⇐ الحالة، وبعدهم أي بيانات زيادة من صف ملف التشييك المطابق. عمود الهيكل اللي في
 * الصف (نفس الشاص) مابيتكررش. النوع بالحرف المختصر زي شيت اللوحات.
 */
export function chassisSheetRows(
  recs: readonly ChassisRecord[],
  fmtDate: (iso: string) => string,
): { rows: Record<string, string>[]; headers: string[] } {
  const headers = [...CHASSIS_BASE_HEADERS];
  const seen = new Set(headers);
  const rows = recs.map((r) => {
    const gps = r.mapsLink || (r.lat != null && r.lng != null ? toMapsLink(r.lat, r.lng) : "");
    const obj: Record<string, string> = {
      "رقم الشاص": r.chassis,
      "نوع السيارة": typeToCode(r.vehicleType ?? "") || (r.vehicleType ?? ""),
      "الحي-الشارع": r.region ?? "",
      "ملاحظات": r.notes ?? "",
      "GPS": gps,
      "التاريخ": r.checkedAt ? fmtDate(r.checkedAt) : "",
      "الحالة": r.found ? "مطلوب" : "غير مطلوب",
    };
    const vin = normalizeChassis(r.chassis);
    for (const [k, v] of Object.entries(r.row ?? {})) {
      const val = String(v ?? "");
      if (CHASSIS_BASE_HEADERS.includes(k) || (vin && normalizeChassis(val) === vin)) continue;
      obj[k] = val;
      if (!seen.has(k)) { seen.add(k); headers.push(k); }
    }
    return obj;
  });
  for (const row of rows) for (const h of headers) if (!(h in row)) row[h] = "";
  return { rows, headers };
}

// ─── فرز أرقام الشاص على ملف الإحالة (صفحة الفرز) ──────────────────────────
export interface ReferralSheet {
  headers: string[];
  rows: Record<string, string>[];
}

/** رقم شاص مسجّل طابق الإحالة — مع صف الإحالة المطابق ونوع التطابق. */
export interface ChassisSortMatch {
  record: ChassisRecord;
  referralRow: Record<string, string>;
  matchType: "exact" | "fuzzy" | "partial";
}

/**
 * يبني فهرس شاص من كل أوراق الإحالة (يكتشف عمود الشاص في كل ورقة بالاسم أو
 * المحتوى — «هيكل المرور»/«رقم الشاص»/«شاص»/VIN... عبر detectChassisColumn).
 */
export function buildReferralChassisIndex(sheets: ReferralSheet[]): Map<string, Record<string, string>> {
  const index = new Map<string, Record<string, string>>();
  for (const sheet of sheets) {
    if (!sheet?.rows?.length) continue;
    const col = detectChassisColumn(sheet.headers, sheet.rows);
    if (!col) continue;
    for (const [k, row] of buildChassisIndex(sheet.rows, col)) {
      if (!index.has(k)) index.set(k, row);
    }
  }
  return index;
}

/**
 * يطابق أرقام الشاص المسجّلة (شيت الشاص) على عمود الشاص في الإحالات. بيرجّع كل
 * سجل طابق مع صف الإحالة (فيه لوحة/نوع السيارة). المطابقة تامة/تقريبية/بآخر الأرقام
 * (نفس منطق كاميرا الشاص عبر matchChassis).
 */
export function matchChassisRecordsAgainstReferrals(
  records: ChassisRecord[],
  sheets: ReferralSheet[],
): ChassisSortMatch[] {
  const index = buildReferralChassisIndex(sheets);
  if (index.size === 0) return [];
  const out: ChassisSortMatch[] = [];
  for (const rec of records) {
    if (!rec.chassis) continue;
    const m = matchChassis(rec.chassis, index);
    if (m.found && m.row) {
      out.push({ record: rec, referralRow: m.row, matchType: m.matchType ?? "exact" });
    }
  }
  return out;
}
