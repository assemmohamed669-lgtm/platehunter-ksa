/**
 * dataStore — تخزين ملفات الداتا **الكبيرة** في IndexedDB على قرص التليفون بدل
 * الذاكرة، للفرز على أجهزة محدودة الذاكرة (iOS Safari بيقع مع ملفات الـ٧٤٠ ألف
 * صف). بيستخدم محرّك القراءة على دفعات (xlsxStream) فمابيحملش الملف في الذاكرة.
 *
 * التخزين **كدفعات (chunks)**: كل دفعة صفوف = سجل واحد {seq, rows[]}. الكتابة
 * بتبقى سريعة جداً (عشرات السجلات بدل مئات الآلاف بفهرس). المطابقة بتعمل مرور
 * واحد على الدفعات (iterateRows) وتطابق على فهرس الإحالة في الذاكرة (الصغير) —
 * نفس منطق الفرز بالظبط، بس مصدر الصفوف من القرص على دفعات (ذاكرة محدودة).
 *
 * قاعدة **منفصلة تماماً** ("platehunter-bigdata") — مابتلمسش قاعدة التطبيق
 * الرئيسية ("platehunter") ولا داتا المناديب. كله على الجهاز — مفيش سيرفر.
 */
import { streamXlsxToBatches, type XlsxStreamMeta } from "./xlsxStream";
import { detectPlateColumn, detectArabicPlateColumn } from "./plateParser";

const DB_NAME = "platehunter-bigdata";
const DB_VERSION = 2; // v2: تخزين كدفعات (chunks) بدل صف-بصف بفهرس
const CHUNKS = "chunks";
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
interface ChunkRec { rows: DataRow[] }

function openDataDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // نسخة قديمة (صف-بصف بفهرس) → شيلها ونعيد البناء كدفعات.
      if (db.objectStoreNames.contains("rows")) db.deleteObjectStore("rows");
      // سجلات الدفعات: مفتاح تلقائي (ترتيب الإدراج = ترتيب ملف الداتا).
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "slot" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("تعذّر فتح قاعدة الداتا."));
  });
}

/** يمسح كل دفعات الداتا + ميتاداتاها — فوري (store.clear). */
export async function clearData(slot = "data"): Promise<void> {
  const db = await openDataDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([CHUNKS, META], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(CHUNKS).clear();
    tx.objectStore(META).delete(slot);
  });
  db.close();
}

/**
 * يستورد ملف داتا كبير: يقراه على دفعات ويكتب كل دفعة كسجل واحد (بيمسح القديم
 * أولاً). onProgress بعدد الصفوف. بيرجّع الميتاداتا (عناوين/عمود اللوحة/عدد الصفوف).
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

  const writeChunk = (rows: DataRow[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNKS, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(CHUNKS).put({ rows } as ChunkRec);
    });

  const meta: XlsxStreamMeta = await streamXlsxToBatches(
    file,
    async (batch) => {
      if (!plateCol && batch.length) {
        headers = Object.keys(batch[0]);
        plateCol = detectArabicPlateColumn(headers) ?? detectPlateColumn(headers, batch) ?? "";
      }
      await writeChunk(batch);
    },
    { onProgress: opts.onProgress, batchSize: 10000 }
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

/** أول n صف (لكشف الأعمدة والمعاينة) — بيقرا أول دفعة بس. */
export async function getSampleRows(n = 50): Promise<DataRow[]> {
  const db = await openDataDB();
  const out = await new Promise<DataRow[]>((resolve, reject) => {
    const tx = db.transaction(CHUNKS, "readonly");
    const req = tx.objectStore(CHUNKS).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      resolve(c ? ((c.value as ChunkRec).rows ?? []).slice(0, n) : []);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

/** يلفّ على كل صفوف الداتا دفعة-بدفعة (للفرز/المسح الكامل) — بذاكرة دفعة واحدة.
 *  كل استدعاء onBatch بياخد دفعة صفوف بترتيب ملف الداتا الأصلي. */
export async function iterateRows(
  onBatch: (rows: DataRow[], baseIndex: number) => void | Promise<void>,
  opts: { slot?: string } = {}
): Promise<void> {
  const db = await openDataDB();
  try {
    // اقرا مفاتيح الدفعات بالترتيب، وبعدين هات كل دفعة لوحدها ونفّذ onBatch —
    // كده مفيش أكتر من دفعة واحدة في الذاكرة في المرة.
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(CHUNKS, "readonly");
      const req = tx.objectStore(CHUNKS).getAllKeys();
      req.onsuccess = () => resolve(req.result as IDBValidKey[]);
      req.onerror = () => reject(req.error);
    });
    let base = 0;
    for (const key of keys) {
      const rows = await new Promise<DataRow[]>((resolve, reject) => {
        const tx = db.transaction(CHUNKS, "readonly");
        const req = tx.objectStore(CHUNKS).get(key);
        req.onsuccess = () => resolve(((req.result as ChunkRec)?.rows) ?? []);
        req.onerror = () => reject(req.error);
      });
      if (rows.length) { await onBatch(rows, base); base += rows.length; }
    }
  } finally {
    db.close();
  }
}
