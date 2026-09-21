/**
 * checkDrafts — تخزين قوايم التشييك اللي لسه ما اتصدّرتش (يدوي/كاميرا/صوت).
 *
 * **ليه اتنقلت من localStorage:** الـWebView بيمسح localStorage أحياناً
 * (حصلت قبل كده وضاع شغل مندوب). القاعدة اللي المالك حطّها: «اللوحات تفضل في
 * الصفحة مكانها متتمسحش حتى لو عمل تسجيل خروج… المندوب يخسر شغله دي مفيهاش
 * تسامح». فالتخزين الأساسي بقى IndexedDB (اللي عليه `navigator.storage.persist`
 * في اللياوت)، وlocalStorage فضلت **مرآة** — نكتب فيها كمان، ونقرا منها مرة
 * واحدة وقت الترحيل بس.
 */

const DB_NAME = "ph-check-drafts";
const STORE = "drafts";
const DB_VERSION = 1;

/** علم بيتكتب أول ما نحفظ في IDB — بعده IDB هو مصدر الحقيقة. */
const INIT_SUFFIX = ":init";

export type DraftKey = "hits" | "ptt" | "manual" | "hits-exported" | "ptt-exported";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as T) ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

/**
 * مين المصدر: IndexedDB لو اتكتب فيه قبل كده (حتى لو القائمة فاضية)، وإلا
 * localStorage مرة واحدة للترحيل.
 *
 * الحتة الحرجة: **القائمة الفاضية بعد التصدير مايصحّش ترجع من localStorage** —
 * وإلا اللوحات اللي اتصدّرت بتظهر تاني وتتصدّر مرتين.
 */
export function pickDraft<T>(fromIdb: T[] | null, idbInitialised: boolean, fromLocal: T[] | null | undefined): T[] {
  if (idbInitialised) return Array.isArray(fromIdb) ? fromIdb : [];
  return Array.isArray(fromLocal) ? fromLocal : [];
}

/** يقرا قائمة: IDB أولاً، وlocalStorage للترحيل. أي فشل → localStorage لوحدها. */
export async function loadDraft<T>(key: DraftKey, localKey: string): Promise<T[]> {
  let local: T[] | null = null;
  try {
    const s = localStorage.getItem(localKey);
    if (s) local = JSON.parse(s) as T[];
  } catch { /* مش متاحة أو بايظة */ }

  try {
    const initialised = (await idbGet<boolean>(key + INIT_SUFFIX)) === true;
    const fromIdb = await idbGet<T[]>(key);
    return pickDraft<T>(fromIdb, initialised, local);
  } catch {
    return Array.isArray(local) ? local : [];   // IDB مش متاح — نكمّل بالمرآة
  }
}

/**
 * طابور كتابة لكل مفتاح — كل حفظ بيستنى اللي قبله.
 *
 * ليه: كل نداء بيفتح اتصال IDB لوحده، والترتيب بين اتصالين **مش مضمون**. من
 * غير الطابور، كتابة قديمة ممكن تنزل بعد الجديدة فترجّع لوحات اتصدّرت أو
 * اتمسحت. مع سرعة المندوب في التسجيل ده مش احتمال نظري.
 */
const writeQueue = new Map<string, Promise<void>>();

/** يحفظ في IDB (الأساسي) وlocalStorage (مرآة). أي فشل في واحدة مايوقفش التانية. */
export function saveDraft<T>(key: DraftKey, localKey: string, value: T[]): Promise<void> {
  const next = (writeQueue.get(key) ?? Promise.resolve()).then(async () => {
    try { localStorage.setItem(localKey, JSON.stringify(value)); } catch { /* ممتلئة/مقفولة */ }
    try {
      await idbPut(key, value);
      await idbPut(key + INIT_SUFFIX, true);
    } catch { /* IDB مش متاح — المرآة بتغطّي */ }
  });
  writeQueue.set(key, next);
  return next;
}

/**
 * تحذير قبل مسح لوحات لسه ما اتصدّرتش. `null` = مفيش داعي للتحذير.
 * «لا» بترجّعه للصفحة عشان يصدّرها من الزرار لو حب.
 */
export function unexportedDeleteWarning(count: number): string | null {
  if (count <= 0) return null;
  return `انتبه: فيه ${count} لوحة مش متصدّرة للسجلات — لو مسحتها هتضيع.\n\n«موافق» = امسح   |   «إلغاء» = ارجع وصدّرها من زر التصدير`;
}
