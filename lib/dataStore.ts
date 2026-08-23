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
import * as XLSX from "xlsx";
import { streamXlsxToBatches, NotXlsxWorksheetError, type XlsxStreamMeta } from "./xlsxStream";
import { detectPlateColumn, detectArabicPlateColumn } from "./plateParser";
import { analyzeSheetShape, isPlateLike, normalizeForCount } from "./referralSheets";

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

const CHUNK_ROWS = 10000;

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
  const db = await openDataDB();

  let plateCol = "";
  let headers: string[] = [];
  let written = 0;

  const writeChunk = (rows: DataRow[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNKS, "readwrite");
      tx.oncomplete = () => { written += rows.length; resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.objectStore(CHUNKS).put({ rows } as ChunkRec);
    });

  const takeHeaders = (batch: DataRow[]) => {
    if (!plateCol && batch.length) {
      headers = Object.keys(batch[0]);
      plateCol = detectArabicPlateColumn(headers) ?? detectPlateColumn(headers, batch) ?? "";
    }
  };

  let meta: XlsxStreamMeta | null = null;
  let streamErr: unknown = null;
  try {
    meta = await streamXlsxToBatches(
      file,
      async (batch) => { takeHeaders(batch); await writeChunk(batch); },
      { onProgress: opts.onProgress, batchSize: CHUNK_ROWS }
    );
  } catch (e) {
    if (written > 0) { db.close(); throw e; } // اتكتبت صفوف بالفعل → مش مشكلة صيغة
    streamErr = e;
  }

  // احتياطي: القارئ العادي (SheetJS) — لصيغة مختلفة أو بنية غريبة أو صفر صفوف
  // (مثلاً أول ورقة فاضية وSheetJS بيختار الورقة اللي فيها اللوحات).
  if (!meta || meta.rowCount === 0) {
    try {
      const { parseExcelFile } = await import("./excel");
      const table = await parseExcelFile(file);
      if (!table.rows.length) throw new Error("الملف فارغ أو لا يحتوي على بيانات.");
      plateCol = ""; headers = [];
      for (let i = 0; i < table.rows.length; i += CHUNK_ROWS) {
        const batch = table.rows.slice(i, i + CHUNK_ROWS) as DataRow[];
        takeHeaders(batch);
        await writeChunk(batch);
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
      // رسالة قارئ الدفعات أوضح **بس** لما تكون بتسمّي الصيغة؛ غير كده (زي خطأ
      // jszip الإنجليزي للملف اللي مش zip) رسالة القارئ العادي أنفع للمندوب.
      throw streamErr instanceof NotXlsxWorksheetError ? streamErr : e;
    }
  }

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
  const db = await openDataDB();
  try {
    const buf = new Uint8Array(await file.arrayBuffer());

    // أسماء الورقات بس (سريع — من غير قراءة خلايا).
    let sheetNames: string[] = [];
    try {
      sheetNames = XLSX.read(buf, { type: "array", bookSheets: true }).SheetNames;
    } catch { /* ملف مقفول/غريب — هيتعامل معاه المستدعي */ }

    const writeTagged = (rows: DataRow[], sheet: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(CHUNKS, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(CHUNKS).put({ rows, sheet } as ChunkRec);
      });

    const sheetsMeta: DataSheetMeta[] = [];
    let totalWritten = 0;

    for (const name of sheetNames) {
      let aoa: unknown[][];
      try {
        const opt: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [name] };
        (opt as Record<string, unknown>).dense = true;
        const wb = XLSX.read(buf, opt);
        const ws = wb.Sheets[name];
        if (!ws) continue;
        aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null });
      } catch { continue; }

      const shape = analyzeSheetShape(aoa);
      if (shape.plateCol < 0) { aoa = []; continue; }   // ورقة بلا لوحات — نتجاهلها
      const plateKey = shape.headers[shape.plateCol];

      // نبني الصفوف على دفعات (مش كلها مرة واحدة) ونكتبها موسومة باسم الورقة.
      let batch: DataRow[] = [];
      const unique = new Set<string>();
      let rowCount = 0;
      const start = shape.headerRow >= 0 ? shape.headerRow + 1 : 0;
      for (let i = start; i < aoa.length; i++) {
        const raw = aoa[i] as unknown[];
        if (!raw || !raw.some((v) => String(v ?? "").trim() !== "")) continue;   // صف فاضي
        const plate = String(raw[shape.plateCol] ?? "").trim();
        if (!isPlateLike(plate)) continue;                                       // صف بلا لوحة
        unique.add(normalizeForCount(plate));
        const obj: DataRow = {};
        for (let c = 0; c < shape.headers.length; c++) obj[shape.headers[c]] = String(raw[c] ?? "").trim();
        batch.push(obj);
        rowCount++;
        if (batch.length >= CHUNK_ROWS) {
          await writeTagged(batch, name);
          totalWritten += batch.length; batch = [];
          opts.onProgress?.(totalWritten);
        }
      }
      if (batch.length) {
        await writeTagged(batch, name);
        totalWritten += batch.length; batch = [];
        opts.onProgress?.(totalWritten);
      }
      aoa = [];   // حرّر ذاكرة الورقة قبل اللي بعدها

      if (rowCount > 0) {
        sheetsMeta.push({
          name, plateCol: plateKey, plateColName: shape.plateColName,
          headers: shape.headers, rowCount, plateCount: unique.size,
        });
      }
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
 *  كل استدعاء onBatch بياخد دفعة صفوف بترتيب ملف الداتا الأصلي + اسم ورقتها.
 *
 *  opts.sheets (اختياري): لو اتبعتت، بنتخطّى دفعات الورقات اللي **مش** في المجموعة
 *  دي — عشان المندوب يفرز على الورقات اللي اختارها بس في ملف متعدد الورقات.
 *  الدفعات القديمة (بلا وسم ورقة) بتتقري دايماً (توافق مع الاستيراد أحادي الورقة). */
export async function iterateRows(
  onBatch: (rows: DataRow[], baseIndex: number, sheet: string) => void | Promise<void>,
  opts: { slot?: string; sheets?: Set<string> | null } = {}
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
    const filter = opts.sheets ?? null;
    let base = 0;
    for (const key of keys) {
      const rec = await new Promise<ChunkRec | undefined>((resolve, reject) => {
        const tx = db.transaction(CHUNKS, "readonly");
        const req = tx.objectStore(CHUNKS).get(key);
        req.onsuccess = () => resolve(req.result as ChunkRec | undefined);
        req.onerror = () => reject(req.error);
      });
      const rows = rec?.rows ?? [];
      const sheet = rec?.sheet ?? "";
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
  const db = await openDataDB();

  const writeChunk = (batch: DataRow[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(CHUNKS, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(CHUNKS).put({ rows: batch } as ChunkRec);
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
