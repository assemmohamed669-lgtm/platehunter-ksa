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
import { streamXlsxToBatches, NotXlsxWorksheetError, type XlsxStreamMeta } from "./xlsxStream";
import { runDataImport } from "./dataImportRunner";
import { verifyImportCounts } from "./importVerify";
import { encodeChunk, decodeChunk } from "./chunkCodec";
import { canFullParseFallback, largeFileFallbackMessage } from "./largeFileFallback";
import { detectPlateColumn, detectArabicPlateColumn } from "./plateParser";
import { isPlateLike, normalizeForCount } from "./referralSheets";

const DB_NAME = "platehunter-bigdata";
const DB_VERSION = 2; // v2: تخزين كدفعات (chunks) بدل صف-بصف بفهرس
const CHUNKS = "chunks";
const META = "meta";

/**
 * ورقة واحدة داخل ملف داتا متعدد الورقات — عشان المندوب يختار يفرز على أنهي
 * ورقة/ورقات. كل ورقة بتتخزّن كدفعات موسومة باسمها، والفرز بيقرا المختار بس.
 */
export interface DataSheetMeta {
  name: string;
  /** مفتاح عمود اللوحة في صفوف الورقة (اسم الهيدر). */
  plateCol: string;
  /** اسم عمود اللوحة المعروض (فاضي لو الورقة بلا هيدر). */
  plateColName: string;
  headers: string[];
  rowCount: number;
  /** عدد اللوحات الفريدة في الورقة (للعرض في الاختيار). */
  plateCount: number;
}

export interface DataMeta {
  slot: string;
  headers: string[];
  sheetName: string;
  rowCount: number;
  plateCol: string;
  fileName: string;
  importedAt: string;
  /** موجودة فقط لو الملف متعدد الورقات (استيراد importMultiSheetData). */
  sheets?: DataSheetMeta[];
}

export type DataRow = Record<string, string>;
/** الدفعة موسومة باسم ورقتها (sheet) في ملفات الداتا متعددة الورقات فقط. */
interface ChunkRec { rows: DataRow[]; sheet?: string }

/**
 * اسم قاعدة الـslot. الـslot الافتراضي "data" (الملف الأساسي) بيفضل على **نفس
 * الاسم القديم** بالظبط عشان داتا المستخدمين المخزّنة قبل كده ماتضيعش. أي slot
 * تاني (ملفات الداتا الإضافية: xdata-*) بياخد **قاعدة منفصلة تماماً** — فكل ملف
 * داتا مبطّن لوحده، وclearData بيمسح ملف واحد بس مش الكل. ده اللي بيخلّي أكتر من
 * ملف داتا كبير يتخزّن على الجهاز مع بعض بأمان (مايكراشش على iOS).
 */
function dbNameForSlot(slot: string): string {
  return slot === "data" ? DB_NAME : `${DB_NAME}::${slot}`;
}

function openDataDB(slot = "data"): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbNameForSlot(slot), DB_VERSION);
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
  const db = await openDataDB(slot);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([CHUNKS, META], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(CHUNKS).clear();
    tx.objectStore(META).delete(slot);
  });
  db.close();
}

// ٣٠٠٠ بدل ١٠٠٠٠: الدفعة الأصغر = ذروة ذاكرة أقل وقت الكتابة في تخزين
// الجهاز. الآيفون بيقتل الصفحة عند الدفعات الكبيرة مع ملف ٧٧٩ ألف صف.
const CHUNK_ROWS = 3000;

/**
 * يستورد ملف داتا كبير: يقراه على دفعات ويكتب كل دفعة كسجل واحد (بيمسح القديم
 * أولاً). onProgress بعدد الصفوف. بيرجّع الميتاداتا (عناوين/عمود اللوحة/عدد الصفوف).
 *
 * قارئ الدفعات بيفهم **xlsx بس**. لو الملف بصيغة تانية (xlsb/xls/ods) أو ببنية
 * غريبة أو أول ورقة فيه فاضية → بنرجع للقارئ العادي (SheetJS) اللي بيفهم كل
 * الصيغ، وبنكتب صفوفه كدفعات بنفس الشكل. الرجوع بيحصل بس لو **لسه مكتبناش
 * ولا صف** (يعني الفشل في القراءة نفسها، مش في نص الاستيراد) — عشان مانعملش
 * الشغل مرتين ومانفتحش ملف ضخم في الذاكرة بلا داعي.
 */
export async function importLargeDataFile(
  file: File,
  opts: { slot?: string; onProgress?: (rows: number) => void } = {}
): Promise<DataMeta> {
  const slot = opts.slot ?? "data";
  await clearData(slot);

  let meta: XlsxStreamMeta | null = null;
  let written = 0;
  let streamErr: unknown = null;

  try {
    // الـWorker بيقرا **ويكتب في التخزين** برّه الخيط الرئيسي — الصفحة بتاخد
    // رقم التقدّم بس، فولا صف بيعدّي عليها. لازم على آيفون: سقف ذاكرة الصفحة
    // صارم، وملف ٧٧٩ ألف صف ذروته ~١٧٥ ميجا.
    const res = await runDataImport(file, {
      slot,
      batchSize: CHUNK_ROWS,
      onProgress: opts.onProgress,
    });
    meta = res.meta;
    written = res.written;
    // حماية من الداتا الناقصة الصامتة: اللي اتقرا لازم يساوي اللي اتكتب.
    verifyImportCounts(meta.rowCount, written);
  } catch (e) {
    if (written > 0) throw e; // اتكتبت صفوف بالفعل → مش مشكلة صيغة
    streamErr = e;
  }

  const db = await openDataDB(slot);

  const writeChunkTo = (rows: DataRow[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNKS, "readwrite");
      tx.oncomplete = () => { written += rows.length; resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.objectStore(CHUNKS).put(encodeChunk(rows));
    });

  // احتياطي: القارئ العادي (SheetJS) — لصيغة مختلفة أو أول ورقة فاضية.
  if (!meta || meta.rowCount === 0) {
    // بيقرا الملف **كامل** في الذاكرة — على آيفون بملف كبير ده كراش مضمون،
    // فرسالة مفهومة أنفع. ولو الخطأ الأصلي بيشرح السبب، بنفضّله.
    if (!canFullParseFallback(file.size)) {
      db.close();
      await clearData(slot);
      throw streamErr instanceof Error ? streamErr : new Error(largeFileFallbackMessage(file.size));
    }
    try {
      const { parseExcelFile } = await import("./excel");
      const table = await parseExcelFile(file);
      if (!table.rows.length) throw new Error("الملف فارغ أو لا يحتوي على بيانات.");
      written = 0;
      for (let i = 0; i < table.rows.length; i += CHUNK_ROWS) {
        await writeChunkTo(table.rows.slice(i, i + CHUNK_ROWS) as DataRow[]);
        opts.onProgress?.(written);
      }
      meta = {
        headers: table.headers,
        sheetName: table.sheetName ?? "",
        rowCount: written,
        allSheetNames: table.allSheetNames ?? [],
      };
    } catch (e) {
      db.close();
      await clearData(slot);
      throw streamErr instanceof NotXlsxWorksheetError ? streamErr : e;
    }
  }

  // عمود اللوحة من عيّنة **متخزّنة** — نفس النتيجة سواء قرا الـWorker ولا
  // الاحتياطي، ومن غير ما نمرّر الصفوف على الخيط الرئيسي.
  const headers = meta.headers;
  let plateCol = detectArabicPlateColumn(headers) ?? "";
  if (!plateCol) {
    const sample = await getSampleRows(50, slot);
    plateCol = detectPlateColumn(headers, sample) ?? "";
  }

  const dataMeta: DataMeta = {
    slot,
    headers,
    sheetName: meta.sheetName,
    rowCount: meta.rowCount,
    plateCol: plateCol || (headers[0] ?? ""),
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

/**
 * يستورد ملف داتا **متعدد الورقات** — كل ورقة فيها لوحات بتتخزّن كدفعات موسومة
 * باسمها، فالمندوب يقدر بعد كده يختار يفرز على أي ورقة/ورقات (الفرز بيقرا
 * الدفعات الموسومة بالورقات المختارة بس عبر iterateRows({sheets})).
 *
 * الذاكرة: بنقرا **ورقة واحدة في المرة** (`sheets:[name]`) وبنبني صفوفها على
 * دفعات ونكتبها ونحرّرها قبل الورقة اللي بعدها — يعني الذروة = ورقة واحدة (زي
 * الاستيراد العادي بالظبط)، مش الملف كله. الورقات الفاضية/بلا لوحات بتتجاهل.
 */
export async function importMultiSheetData(
  file: File,
  opts: { slot?: string; onProgress?: (rows: number) => void } = {}
): Promise<DataMeta> {
  const slot = opts.slot ?? "data";
  await clearData(slot);
  const db = await openDataDB(slot);
  try {
    // parseExcelFile بيشتغل في **worker** (بعيد عن الـmain thread فالشاشة ماتتجمّدش)
    // وبيرجّع صفوف ورقة واحدة بس لو forcedSheet متحدد (مش بيدمج). readSheetNames
    // بيجيب أسماء الورقات (ميتاداتا سريعة). كده بنقرا ورقة-ورقة بذاكرة ورقة واحدة.
    const { parseExcelFile, readSheetNames } = await import("./excel");
    const sheetNames = await readSheetNames(file);

    const writeTagged = (rows: DataRow[], sheet: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CHUNKS, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(CHUNKS).put(encodeChunk(rows, sheet));
      });

    const sheetsMeta: DataSheetMeta[] = [];
    let totalWritten = 0;

    for (const name of sheetNames) {
      let table: Awaited<ReturnType<typeof parseExcelFile>> | null;
      try {
        table = await parseExcelFile(file, undefined, name);   // ورقة واحدة، في الـworker
      } catch { continue; }                                    // ورقة فاضية/مكسورة
      if (!table.rows.length) continue;

      // عمود اللوحة بنفس كشف باقي مسارات الداتا (عربي أولاً، وإلا بالمحتوى).
      const plateKey = detectArabicPlateColumn(table.headers) ?? detectPlateColumn(table.headers, table.rows) ?? "";
      if (!plateKey) { table = null; continue; }               // مش ورقة داتا (مفيش عمود لوحة)

      // plateCount = لوحات فريدة واضحة. لو الورقة مفيهاش ولا لوحة واحدة (ورقة
      // ملخّص/فرز مثلاً) نتجاهلها — detectPlateColumn ساعات بيرجّع عمود تخمين
      // حتى لو مفيش لوحات، فالبوابة الحقيقية هي: فيه لوحات فعلاً؟
      const unique = new Set<string>();
      for (const r of table.rows) {
        const p = String(r[plateKey] ?? "").trim();
        if (isPlateLike(p)) unique.add(normalizeForCount(p));
      }
      if (unique.size === 0) { table = null; continue; }       // مش ورقة داتا (بلا لوحات)

      // بنخزّن **كل** صفوف الورقة (زي importLargeDataFile) على دفعات موسومة باسمها.
      const rowCount = table.rows.length;
      for (let i = 0; i < table.rows.length; i += CHUNK_ROWS) {
        const batch = table.rows.slice(i, i + CHUNK_ROWS) as DataRow[];
        await writeTagged(batch, name);
        totalWritten += batch.length;
        opts.onProgress?.(totalWritten);
      }

      sheetsMeta.push({
        name, plateCol: plateKey, plateColName: plateKey,
        headers: table.headers, rowCount, plateCount: unique.size,
      });
      table = null;   // حرّر ذاكرة الورقة قبل اللي بعدها
    }

    if (sheetsMeta.length === 0) {
      await clearData(slot);
      throw new Error("الملف فارغ أو لا يحتوي على بيانات.");
    }

    const first = sheetsMeta[0];
    const dataMeta: DataMeta = {
      slot,
      headers: first.headers,
      sheetName: first.name,
      rowCount: totalWritten,
      plateCol: first.plateCol,
      fileName: file.name,
      importedAt: new Date().toISOString(),
      sheets: sheetsMeta,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(META).put(dataMeta);
    });
    return dataMeta;
  } finally {
    db.close();
  }
}

/** ميتاداتا slot لو موجود (يعني فيه داتا كبيرة مستوردة). */
export async function getDataMeta(slot = "data"): Promise<DataMeta | null> {
  const db = await openDataDB(slot);
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
export async function getSampleRows(n = 50, slot = "data"): Promise<DataRow[]> {
  const db = await openDataDB(slot);
  const out = await new Promise<DataRow[]>((resolve, reject) => {
    const tx = db.transaction(CHUNKS, "readonly");
    const req = tx.objectStore(CHUNKS).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      resolve(c ? decodeChunk(c.value).rows.slice(0, n) : []);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

/** يلفّ على كل صفوف الداتا دفعة-بدفعة (للفرز/المسح الكامل) — بذاكرة دفعة واحدة.
 *  كل استدعاء onBatch بياخد دفعة صفوف بترتيب ملف الداتا الأصلي + اسم ورقتها.
 *
 *  opts.sheets (اختياري): لو اتبعتت، بنتخطّى دفعات الورقات اللي **مش** في المجموعة
 *  دي — عشان المندوب يفرز على الورقات اللي اختارها بس في ملف متعدد الورقات.
 *  الدفعات القديمة (بلا وسم ورقة) بتتقري دايماً (توافق مع الاستيراد أحادي الورقة). */
export async function iterateRows(
  onBatch: (rows: DataRow[], baseIndex: number, sheet: string) => void | Promise<void>,
  opts: { slot?: string; sheets?: Set<string> | null } = {}
): Promise<void> {
  const db = await openDataDB(opts.slot ?? "data");
  try {
    // اقرا مفاتيح الدفعات بالترتيب، وبعدين هات كل دفعة لوحدها ونفّذ onBatch —
    // كده مفيش أكتر من دفعة واحدة في الذاكرة في المرة.
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(CHUNKS, "readonly");
      const req = tx.objectStore(CHUNKS).getAllKeys();
      req.onsuccess = () => resolve(req.result as IDBValidKey[]);
      req.onerror = () => reject(req.error);
    });
    const filter = opts.sheets ?? null;
    let base = 0;
    for (const key of keys) {
      const rec = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(CHUNKS, "readonly");
        const req = tx.objectStore(CHUNKS).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const decoded = decodeChunk(rec);
      const rows = decoded.rows;
      const sheet = decoded.sheet;
      // فلتر الورقات: نتخطّى ورقة موسومة مش مختارة. الدفعات بلا وسم بتعدّي دايماً.
      if (filter && sheet && !filter.has(sheet)) continue;
      if (rows.length) { await onBatch(rows, base, sheet); base += rows.length; }
    }
  } finally {
    db.close();
  }
}

/**
 * يستورد صفوف **جاهزة في الذاكرة** لقاعدة الداتا على الجهاز — من غير ما نعيد
 * كتابة وقراءة ملف. بتستخدمها صفحة «رفع للداتا» بعد الدمج: الصفوف موجودة
 * أصلاً، فكتابة ملف ضخم وإعادة قراءته هدر كبير (٦ ثواني و~٢ جيجا ذاكرة على
 * ٤٨٠ ألف صف).
 *
 * بيمسح الـslot الأول وبعدين يكتب على دفعات — نفس شكل التخزين بالظبط اللي
 * `importLargeDataFile` بتعمله، فالفرز وباقي الصفحات مايفرقش معاهم.
 */
export async function importRowsToData(
  rows: DataRow[],
  headers: string[],
  opts: { slot?: string; fileName?: string; sheetName?: string; onProgress?: (n: number) => void } = {},
): Promise<DataMeta> {
  const slot = opts.slot ?? "data";
  await clearData(slot);
  const db = await openDataDB(slot);

  const writeChunk = (batch: DataRow[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNKS, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(CHUNKS).put(encodeChunk(batch));
    });

  try {
    for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
      await writeChunk(rows.slice(i, i + CHUNK_ROWS));
      opts.onProgress?.(Math.min(i + CHUNK_ROWS, rows.length));
    }

    const plateCol =
      detectArabicPlateColumn(headers) ?? detectPlateColumn(headers, rows.slice(0, 200)) ?? headers[0] ?? "";
    const dataMeta: DataMeta = {
      slot,
      headers,
      sheetName: opts.sheetName ?? "داتا",
      rowCount: rows.length,
      plateCol,
      fileName: opts.fileName ?? "داتا-محدّثة.xlsx",
      importedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(META).put(dataMeta);
    });
    return dataMeta;
  } finally {
    db.close();
  }
}
