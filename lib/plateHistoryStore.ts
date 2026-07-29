/**
 * plateHistoryStore — تخزين سجل السيارات (plateHistory) على قرص التليفون.
 *
 * قاعدة **منفصلة بالكامل** ("platehunter-history") — مالهاش أي علاقة بقاعدة
 * التطبيق الرئيسية ("platehunter") ولا بقاعدة الداتا الكبيرة ("platehunter-bigdata").
 * فأي حاجة تحصل هنا مستحيل تلمس سجلات المناديب أو ملفاتهم.
 *
 * السجل خاص بكل مندوب: الحفظ بيتم لكل حساب لوحده (agentId) عشان لو اتغيّر
 * الحساب على نفس الجهاز مايتخلطش.
 */
import type { HistoryMap, PlateHistoryEntry } from "./plateHistory";
import { newHistoryMap } from "./plateHistory";

const DB_NAME = "platehunter-history";
const DB_VERSION = 1;
const STORE = "entries";

interface StoredEntry extends PlateHistoryEntry { key: string; agentId: string }

const keyOf = (agentId: string, plate: string) => `${agentId}::${plate}`;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "key" });
        s.createIndex("agentId", "agentId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("تعذّر فتح قاعدة السجل."));
  });
}

/** يقرا سجل مندوب كامل كخريطة (لوحة → سجل). */
export async function loadHistory(agentId: string): Promise<HistoryMap> {
  const db = await openDB();
  const out = await new Promise<HistoryMap>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("agentId").getAll(IDBKeyRange.only(agentId));
    req.onsuccess = () => {
      const map = newHistoryMap();
      for (const row of (req.result as StoredEntry[]) ?? []) {
        const { key: _k, agentId: _a, ...entry } = row;
        map.set(entry.plate, entry as PlateHistoryEntry);
      }
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

/** يكتب/يحدّث سجلات محددة (upsert) — على دفعات عشان الكتابة تفضل سريعة. */
export async function saveHistoryEntries(agentId: string, entries: PlateHistoryEntry[]): Promise<void> {
  if (!entries.length) return;
  const db = await openDB();
  try {
    const CHUNK = 2000;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore(STORE);
        for (const e of slice) store.put({ ...e, key: keyOf(agentId, e.plate), agentId } as StoredEntry);
      });
    }
  } finally {
    db.close();
  }
}

/** يكتب الخريطة كلها (بعد تقليم أو استرجاع من نسخة احتياطية). */
export async function saveHistoryMap(agentId: string, map: HistoryMap): Promise<void> {
  await saveHistoryEntries(agentId, [...map.values()]);
}

/** يمسح سجل مندوب بالكامل (للتنظيف/إعادة الضبط). */
export async function clearHistory(agentId: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const cur = tx.objectStore(STORE).index("agentId").openCursor(IDBKeyRange.only(agentId));
    cur.onsuccess = () => { const c = cur.result; if (c) { c.delete(); c.continue(); } };
  });
  db.close();
}

/** عدد سجلات مندوب (للتشخيص/العرض). */
export async function countHistory(agentId: string): Promise<number> {
  const db = await openDB();
  const n = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("agentId").count(IDBKeyRange.only(agentId));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return n;
}
