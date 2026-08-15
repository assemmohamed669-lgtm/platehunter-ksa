/**
 * ذاكرة رفع شيتات التفريغ.
 *
 * المندوب ممكن ينسى إنه رفع الشيت ويرجع تاني يوم يرفعه تاني — فنفس اللوحات
 * تتضاف مرتين للداتا من غير ما ياخد باله. البرنامج بيفتكر كل شيت اترفع
 * وبيحذّره.
 *
 * الدليل الأساسي هو **اللوحات اللي جوّه الشيت**، مش اسم الملف — المندوب
 * بيعيد تسمية الملفات وبيوصلوه بأسماء واتساب زي «(1)». الاسم تنبيه إضافي بس.
 *
 * تحذير مش منع: المندوب قال إن التكرار شغله وهو أدرى بيه، فبنقوله ونسيبه
 * هو يقرر.
 */

import { normalizePlate, bankPlateToArabic } from "@/lib/plateParser";

export interface UploadRecord {
  /** بصمة اللوحات — المفتاح. */
  fingerprint: string;
  /** اللوحات المطبّعة (لحساب التداخل الجزئي). */
  plates: string[];
  fileName: string;
  rowCount: number;
  uploadedAt: string;
  dataFileName: string;
  insertedAfter: string;
}

export type MatchKind = "same" | "overlap" | "name";

export interface UploadMatch {
  kind: MatchKind;
  previous: UploadRecord;
  overlapPercent: number;
  /** كام لوحة في الشيت الحالي مش موجودة في الرفعة القديمة. */
  newPlates: number;
}

/** أقل نسبة تداخل تستاهل تحذير — تحت كده الشيتات بتتقاطع طبيعي. */
const OVERLAP_WARN = 40;

/** اللوحات المطبّعة اللي في الشيت، من غير تكرار. */
export function platesOf(rows: Record<string, string>[], plateCol: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const p = normalizePlate(bankPlateToArabic(String(r?.[plateCol] ?? "")));
    if (p) set.add(p);
  }
  return [...set].sort();
}

/**
 * بصمة الشيت من لوحاته. الترتيب والتكرار والمسافات مابيأثروش — نفس اللوحات
 * تدّي نفس البصمة حتى لو الشيت اتعمله ترتيب تاني أو اتحفظ باسم مختلف.
 */
export function sheetFingerprint(rows: Record<string, string>[], plateCol: string): string {
  const plates = platesOf(rows, plateCol);
  if (!plates.length) return "";
  const joined = plates.join("|");
  // hash بسيط وثابت (FNV-1a) — مش محتاجين تشفير، محتاجين مفتاح ثابت
  let h = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${plates.length}-${h.toString(36)}`;
}

/** تطبيع اسم الملف للمقارنة: من غير امتداد ولا مسافات زيادة ولا «(1)». */
function normName(name: string): string {
  return String(name ?? "")
    .replace(/\.(xlsx|xlsm|xlsb|xls|csv)\s*$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * الشيت ده اترفع قبل كده؟ بيرجّع أقوى تطابق أو null.
 *
 * الترتيب: نفس اللوحات بالظبط، بعدين تداخل كبير، بعدين نفس الاسم.
 */
export function matchPreviousUpload(
  rows: Record<string, string>[],
  plateCol: string,
  fileName: string,
  history: UploadRecord[],
): UploadMatch | null {
  const plates = platesOf(rows, plateCol);
  const fp = sheetFingerprint(rows, plateCol);
  const nameNow = normName(fileName);

  let best: UploadMatch | null = null;
  const rank: Record<MatchKind, number> = { same: 3, overlap: 2, name: 1 };
  const keep = (m: UploadMatch) => {
    if (!best || rank[m.kind] > rank[best.kind] ||
        (rank[m.kind] === rank[best.kind] && m.overlapPercent > best.overlapPercent)) best = m;
  };

  for (const prev of history) {
    if (fp && prev.fingerprint === fp) {
      keep({ kind: "same", previous: prev, overlapPercent: 100, newPlates: 0 });
      continue;
    }
    if (plates.length) {
      const old = new Set(prev.plates);
      const shared = plates.filter((p) => old.has(p)).length;
      const pct = Math.round((shared / plates.length) * 100);
      if (pct >= OVERLAP_WARN) {
        keep({ kind: "overlap", previous: prev, overlapPercent: pct, newPlates: plates.length - shared });
        continue;
      }
    }
    if (nameNow && normName(prev.fileName) === nameNow) {
      keep({ kind: "name", previous: prev, overlapPercent: 0, newPlates: plates.length });
    }
  }
  return best;
}

/** رسالة عربية واضحة للأدمن. */
export function describeMatch(m: UploadMatch): string {
  const d = m.previous.uploadedAt.slice(0, 10);
  const where = m.previous.insertedAfter ? ` تحت «${m.previous.insertedAfter}»` : "";
  if (m.kind === "same")
    return `الشيت ده اترفع قبل كده بالظبط يوم ${d} باسم «${m.previous.fileName}»${where}. لو كمّلت هتتضاف اللوحات تاني.`;
  if (m.kind === "overlap")
    return `${m.overlapPercent}% من لوحات الشيت ده اترفعوا يوم ${d} باسم «${m.previous.fileName}»${where} — الجديد فيه ${m.newPlates} لوحة بس.`;
  return `فيه شيت بنفس الاسم «${m.previous.fileName}» اترفع يوم ${d}${where}، بس اللوحات مختلفة.`;
}

// ── التخزين على الجهاز ──────────────────────────────────────────────────

const DB = "platehunter-uploads";
const STORE = "uploads";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "fingerprint" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("تعذّر فتح ذاكرة الرفع."));
  });
}

/** يسجّل رفعة — أو يحدّث القديمة لو نفس البصمة. */
export async function recordUpload(rec: UploadRecord): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(rec);
    });
  } finally { db.close(); }
}

/** كل الرفعات، الأحدث الأول. */
export async function getUploadHistory(): Promise<UploadRecord[]> {
  const db = await open();
  try {
    const all = await new Promise<UploadRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as UploadRecord[]);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  } finally { db.close(); }
}

export async function clearUploadHistory(): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).clear();
    });
  } finally { db.close(); }
}
