/**
 * تشغيل استيراد ملف الداتا عبر Web Worker.
 *
 * الـWorker بيقرا **ويكتب في التخزين** بنفسه — الصفحة بتستقبل رقم التقدّم بس،
 * فولا صف بيعدّي على الخيط الرئيسي. ده لازم على آيفون: سقف ذاكرة الصفحة صارم،
 * وملف ٧٧٩ ألف صف ذروته ~١٧٥ ميجا.
 *
 * ⚠️ درس من المحاولة الأولى: كان فيه **رجوع صامت** للقراءة على الخيط الرئيسي
 * لو الـWorker فشل. النتيجة إن المندوب فضل يشوف نفس الكراش، وإحنا مش قادرين
 * نعرف إذا كان الـWorker اشتغل ولا لأ. دلوقتي:
 *   • مصافحة "ready" بتقول لنا إن الـWorker اتحمّل فعلاً.
 *   • الرجوع للطريقة القديمة **للملفات الصغيرة بس** — للكبير رسالة واضحة،
 *     لأن الرجوع في الكبير معناه كراش مضمون بدل رسالة مفهومة.
 */
import { streamXlsxToBatches, type XlsxStreamMeta } from "./xlsxStream";
import { openDataDB, clearChunks, writeChunk } from "./dataStoreDb";
import type { DataRow } from "./chunkCodec";

/** فوق كده الرجوع للخيط الرئيسي بيقتل الصفحة على آيفون — نرمي رسالة بدله. */
export const WORKER_REQUIRED_ABOVE_BYTES = 8 * 1024 * 1024;

/** مهلة انتظار مصافحة الـWorker. تحميل الـbundle بياخد وقت على تليفون بطيء. */
const READY_TIMEOUT_MS = 15000;

export interface ImportResult {
  meta: XlsxStreamMeta;
  written: number;
  /** المسار اللي اشتغل فعلاً — بيظهر في الأخطاء عشان التشخيص. */
  via: "worker" | "main";
}

export interface RunImportOptions {
  slot: string;
  batchSize: number;
  preferSheet?: string;
  onProgress?: (written: number) => void;
}

class WorkerUnusable extends Error {}

function viaWorker(file: File, opts: RunImportOptions): Promise<ImportResult> {
  return new Promise<ImportResult>((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new WorkerUnusable("المتصفح مايدعمش Web Worker"));
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./dataImportWorker.ts", import.meta.url));
    } catch {
      reject(new WorkerUnusable("تعذّر تشغيل قارئ الملفات"));
      return;
    }

    let ready = false;
    let settled = false;
    const end = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(readyTimer);
      try { worker.terminate(); } catch { /* اتقفل */ }
      fn();
    };

    // لو مافيش "ready" في المهلة، يبقى الـWorker مااتحمّلش أصلاً.
    const readyTimer = setTimeout(() => {
      if (!ready) end(() => reject(new WorkerUnusable("قارئ الملفات مااشتغلش (انتهت المهلة)")));
    }, READY_TIMEOUT_MS);

    worker.onerror = () =>
      end(() => reject(ready ? new Error("انقطعت قراءة الملف") : new WorkerUnusable("قارئ الملفات وقع عند التحميل")));

    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: "ready" }
        | { type: "progress"; written: number }
        | { type: "done"; meta: XlsxStreamMeta; written: number }
        | { type: "error"; message: string };
      if (!m || settled) return;

      if (m.type === "ready") {
        ready = true;
        clearTimeout(readyTimer);
        worker.postMessage({
          type: "start",
          file,
          batchSize: opts.batchSize,
          slot: opts.slot,
          preferSheet: opts.preferSheet,
        });
      } else if (m.type === "progress") {
        opts.onProgress?.(m.written);
      } else if (m.type === "done") {
        end(() => resolve({ meta: m.meta, written: m.written, via: "worker" }));
      } else if (m.type === "error") {
        end(() => reject(new Error(m.message)));
      }
    };
  });
}

/** الطريقة القديمة: القراءة **والكتابة** على الخيط الرئيسي. للملفات الصغيرة بس. */
async function viaMainThread(file: File, opts: RunImportOptions): Promise<ImportResult> {
  const db = await openDataDB(opts.slot);
  try {
    await clearChunks(db);
    let written = 0;
    const meta = await streamXlsxToBatches(
      file,
      async (rows: DataRow[]) => {
        await writeChunk(db, rows);
        written += rows.length;
        opts.onProgress?.(written);
      },
      { batchSize: opts.batchSize, preferSheet: opts.preferSheet }
    );
    return { meta, written, via: "main" };
  } finally {
    db.close();
  }
}

export async function runDataImport(file: File, opts: RunImportOptions): Promise<ImportResult> {
  try {
    return await viaWorker(file, opts);
  } catch (e) {
    if (!(e instanceof WorkerUnusable)) throw e;

    // الـWorker مش متاح. للملف الصغير الطريقة القديمة آمنة؛ للكبير هي كراش
    // مضمون على آيفون — فرسالة مفهومة أنفع للمندوب من شاشة موت.
    if (file.size > WORKER_REQUIRED_ABOVE_BYTES) {
      throw new Error(
        `قارئ الملفات مش شغّال على المتصفح ده (${e.message})، والملف كبير ` +
        `(${Math.round(file.size / 1048576)} ميجا) فمينفعش يتقرا من غيره. ` +
        `جرّب تقفل التطبيق وتفتحه، أو افتحه من متصفح تاني.`
      );
    }
    return viaMainThread(file, opts);
  }
}
