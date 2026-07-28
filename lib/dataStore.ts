/**
 * dataStore — تخزين ملفات الداتا **الكبيرة** في IndexedDB على قرص التليفون بدل
 * الذاكرة، للفرز على أجهزة محدودة الذاكرة (iOS Safari بيقع مع ملفات الـ٧٤٠ ألف
 * صف). بيستخدم محرّك القراءة على دفعات (xlsxStream) فمابيحملش الملف في الذاكرة.
 *
 * قاعدة **منفصلة تماماً** ("platehunter-bigdata") — مابتلمسش قاعدة التطبيق
 * الرئيسية ("platehunter") ولا داتا المناديب ولا أي حاجة شغّالة. كل ده على
 * الجهاز — مفيش سيرفر ولا حالة مشتركة بين المناديب.
 *
 * الصفوف بتتخزّن {slot, plateNorm, data} مع فهرس على [slot, plateNorm] عشان
 * البحث بلوحة معيّنة O(1) من غير ما نمسك الداتا كلها في الذاكرة.
 */
import { streamXlsxToBatches, type XlsxStreamMeta } from "./xlsxStream";
import { detectPlateColumn, detectArabicPlateColumn, normalizePlate, bankPlateToArabic } from "./plateParser";

const DB_NAME = "platehunter-bigdata";
const DB_VERSION = 1;
const ROWS = "rows";
const META = "meta";

export interface DataMeta {
  slot: string;
  headers: string[];
  sheetName: string;
  rowCount: number;
  plateCol: string;
  fileName: string;
  importedAt: string;
}

export type DataRow = Record<string, string>;
interface StoredRow { slot: string; plateNorm: string; data: DataRow }

function openDataDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ROWS)) {
        const rows = db.createObjectStore(ROWS, { keyPath: "id", autoIncrement: true });
        rows.createIndex("slot", "slot", { unique: false });
        rows.createIndex("slot_plate", ["slot", "plateNorm"], { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "slot" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("تعذّر فتح قاعدة الداتا."));
  });
}

const normPlateCell = (raw: unknown): string => normalizePlate(bankPlateToArabic(String(raw ?? "")));

/** يمسح صفوف slot معيّن (على دفعات عبر cursor) + ميتاداتاه. */
export async function clearData(slot = "data"): Promise<void> {
  const db = await openDataDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ROWS, META], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const idx = tx.objectStore(ROWS).index("slot");
    const cur = idx.openCursor(IDBKeyRange.only(slot));
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { c.delete(); c.continue(); }
    };
    tx.objectStore(META).delete(slot);
  });
  db.close();
}

/**
 * يستورد ملف داتا كبير: يقراه على دفعات ويكتبه في القاعدة (بيمسح القديم أولاً).
 * بيرجّع الميتاداتا (عناوين/عمود اللوحة/عدد الصفوف). onProgress بعدد الصفوف.
 */
export async function importLargeDataFile(
  file: File,
  opts: { slot?: string; onProgress?: (rows: number) => void } = {}
): Promise<DataMeta> {
  const slot = opts.slot ?? "data";
  await clearData(slot);
  const db = await openDataDB();

  let plateCol = "";
  let headers: string[] = [];

  const writeBatch = (rows: DataRow[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(ROWS, "readwrite");
      const store = tx.objectStore(ROWS);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      for (const data of rows) {
        const rec: StoredRow = { slot, plateNorm: plateCol ? normPlateCell(data[plateCol]) : "", data };
        store.put(rec);
      }
    });

  const meta: XlsxStreamMeta = await streamXlsxToBatches(
    file,
    async (batch) => {
      if (!plateCol && batch.length) {
        // كشف عمود اللوحة من العناوين + أول دفعة (نفس منطق collectDataSources).
        headers = Object.keys(batch[0]);
        plateCol = detectArabicPlateColumn(headers) ?? detectPlateColumn(headers, batch) ?? "";
      }
      await writeBatch(batch);
    },
    { onProgress: opts.onProgress, batchSize: 5000 }
  );

  const dataMeta: DataMeta = {
    slot,
    headers: meta.headers,
    sheetName: meta.sheetName,
    rowCount: meta.rowCount,
    plateCol: plateCol || (meta.headers[0] ?? ""),
    fileName: file.name,
    importedAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(META).put(dataMeta);
  });
  db.close();
  return dataMeta;
}

/** ميتاداتا slot لو موجود (يعني فيه داتا كبيرة مستوردة). */
export async function getDataMeta(slot = "data"): Promise<DataMeta | null> {
  const db = await openDataDB();
  const out = await new Promise<DataMeta | null>((resolve, reject) => {
    const tx = db.transaction(META, "readonly");
    const req = tx.objectStore(META).get(slot);
    req.onsuccess = () => resolve((req.result as DataMeta) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

/** أول n صف من slot (لكشف الأعمدة والمعاينة) — بدون مسح كل الداتا. */
export async function getSampleRows(n = 50, slot = "data"): Promise<DataRow[]> {
  const db = await openDataDB();
  const out = await new Promise<DataRow[]>((resolve, reject) => {
    const tx = db.transaction(ROWS, "readonly");
    const idx = tx.objectStore(ROWS).index("slot");
    const req = idx.getAll(IDBKeyRange.only(slot), n);
    req.onsuccess = () => resolve(((req.result as StoredRow[]) ?? []).map((r) => r.data));
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

/** كل صفوف لوحة مطبّعة معيّنة (بحث بالفهرس — بدون مسح كل الداتا).
 *  بترجّع الصف + موضعه (idx = ترتيب الإدراج = ترتيب ملف الداتا) للترتيب. */
export async function lookupByPlate(plateNorm: string, slot = "data"): Promise<Array<{ data: DataRow; idx: number }>> {
  if (!plateNorm) return [];
  const db = await openDataDB();
  const out = await new Promise<Array<{ data: DataRow; idx: number }>>((resolve, reject) => {
    const tx = db.transaction(ROWS, "readonly");
    const idx = tx.objectStore(ROWS).index("slot_plate");
    const req = idx.getAll(IDBKeyRange.only([slot, plateNorm]));
    req.onsuccess = () => resolve(
      ((req.result as Array<StoredRow & { id: number }>) ?? []).map((r) => ({ data: r.data, idx: r.id }))
    );
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

/** يلفّ على كل صفوف slot على دفعات (للمسح الكامل/التصدير) — بذاكرة دفعة واحدة. */
export async function iterateRows(
  onBatch: (rows: DataRow[]) => void | Promise<void>,
  opts: { slot?: string; batchSize?: number } = {}
): Promise<void> {
  const slot = opts.slot ?? "data";
  const batchSize = opts.batchSize ?? 5000;
  const db = await openDataDB();
  try {
    let done = false;
    let lastKey: IDBValidKey | null = null;
    // نلفّ على الفهرس المركّب [slot, plateNorm] بترتيبه، على دفعات عبر getAll + range.
    while (!done) {
      const batch = await new Promise<{ rows: DataRow[]; nextKey: IDBValidKey | null }>((resolve, reject) => {
        const tx = db.transaction(ROWS, "readonly");
        const store = tx.objectStore(ROWS);
        const range = lastKey != null
          ? IDBKeyRange.lowerBound(lastKey, true)
          : undefined;
        const req = store.openCursor(range);
        const rows: DataRow[] = [];
        let nextKey: IDBValidKey | null = null;
        let count = 0;
        req.onsuccess = () => {
          const c = req.result;
          if (c && count < batchSize) {
            const rec = c.value as StoredRow;
            if (rec.slot === slot) rows.push(rec.data);
            nextKey = c.primaryKey;
            count++;
            c.continue();
          } else {
            resolve({ rows, nextKey: c ? nextKey : null });
          }
        };
        req.onerror = () => reject(req.error);
      });
      if (batch.rows.length) await onBatch(batch.rows);
      if (batch.nextKey == null) done = true;
      else lastKey = batch.nextKey;
    }
  } finally {
    db.close();
  }
}
