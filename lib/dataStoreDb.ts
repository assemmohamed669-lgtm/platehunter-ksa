/**
 * فتح/مسح/كتابة قاعدة الداتا الكبيرة — **مشتركة بين الصفحة والـWorker**.
 *
 * ليه ملف مستقل: الـWorker بقى بيكتب في التخزين بنفسه (عشان الصفوف ماتعديش
 * على الخيط الرئيسي أصلاً)، ولازم يفتح **نفس** القاعدة بنفس النسخة والمخازن.
 * لو الكود اتكرر في المكانين، أول تعديل في واحد بيكسر التاني بصمت.
 */
import { encodeChunk, type DataRow } from "./chunkCodec";

export const DB_NAME = "platehunter-bigdata";
export const DB_VERSION = 2; // v2: تخزين كدفعات (chunks) بدل صف-بصف بفهرس
export const CHUNKS = "chunks";
export const META = "meta";

export function dbNameForSlot(slot: string): string {
  return slot === "data" ? DB_NAME : `${DB_NAME}::${slot}`;
}

export function openDataDB(slot = "data"): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbNameForSlot(slot), DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // نسخة قديمة (صف-بصف بفهرس) → شيلها ونعيد البناء كدفعات.
      if (db.objectStoreNames.contains("rows")) db.deleteObjectStore("rows");
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "slot" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("تعذّر فتح قاعدة الداتا."));
  });
}

/** يمسح كل دفعات الـslot (بيستخدمها الـWorker قبل ما يبدأ يكتب). */
export function clearChunks(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS, "readwrite");
    tx.objectStore(CHUNKS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** يكتب دفعة صفوف مضغوطة. بيرجّع بعد ما المعاملة تكتمل فعلاً (ضغط خلفي طبيعي). */
export function writeChunk(db: IDBDatabase, rows: DataRow[], sheet?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(CHUNKS).put(encodeChunk(rows, sheet));
  });
}
