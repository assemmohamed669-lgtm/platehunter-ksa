/**
 * سجلات تشييك الشاصي (شيت رقم الشاص المنفصل).
 *
 * مخزّنة في localStorage مستقلة تماماً عن سجلات اللوحات (fieldChecks في IDB) —
 * عشان الشيتين يفضلوا منفصلين والشاصي مايلخبطش عرض/عدّادات اللوحات.
 * بتفضل بعد إعادة فتح التطبيق، وبتتصدّر لشيت «شيت رقم الشاص».
 */

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
