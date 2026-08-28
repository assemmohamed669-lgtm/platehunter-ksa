/**
 * تشغيل قراءة ملف الداتا: **الـWorker أولاً، والطريقة الحالية احتياطي**.
 *
 * ليه الـWorker: آيفون بيقتل الصفحة لو حجزت ~١٧٥ ميجا (ملف ٧٧٩ ألف صف).
 * الـWorker ليه مساحته المنفصلة، فالصفحة مابيوصلهاش غير دفعة صغيرة في المرة.
 *
 * قاعدة أمان: الرجوع للاحتياطي مسموح **بس** لو الـWorker فشل قبل أول دفعة.
 * لو كان بعت دفعات وبعدين وقع، الرجوع معناه إعادة قراءة الملف من أوله فوق
 * صفوف اتكتبت — يعني تكرار. ساعتها بنرمي الخطأ زي ما هو.
 */
import { streamXlsxToBatches, type XlsxStreamMeta } from "./xlsxStream";

export type DataRow = Record<string, string>;
export type BatchHandler = (rows: DataRow[], firstIndex: number) => void | Promise<void>;

export interface RunImportOptions {
  batchSize: number;
  preferSheet?: string;
  /** للاختبار: يمنع استخدام الـWorker ويجرّب الاحتياطي على طول. */
  forceDirect?: boolean;
}

/** الـWorker مااشتغلش أصلاً (أو وقع قبل أول دفعة) → الاحتياطي مسموح. */
class WorkerUnusable extends Error {}

function viaWorker(
  file: File,
  onBatch: BatchHandler,
  opts: RunImportOptions
): Promise<XlsxStreamMeta> {
  return new Promise<XlsxStreamMeta>((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new WorkerUnusable("Worker غير متاح"));
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(new URL("./dataImportWorker.ts", import.meta.url));
    } catch {
      reject(new WorkerUnusable("تعذّر تشغيل الـWorker"));
      return;
    }

    let emitted = 0;
    let settled = false;
    const end = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try { worker.terminate(); } catch { /* اتقفل خلاص */ }
      fn();
    };

    // فشل قبل أول دفعة = الاحتياطي مسموح. بعد أول دفعة = خطأ حقيقي.
    const fail = (msg: string) =>
      end(() => reject(emitted === 0 ? new WorkerUnusable(msg) : new Error(msg)));

    worker.onerror = () => fail("انقطعت قراءة الملف");
    worker.onmessageerror = () => fail("رسالة تالفة من قارئ الملف");

    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as
        | { type: "batch"; rows: DataRow[]; firstIndex: number }
        | { type: "done"; meta: XlsxStreamMeta }
        | { type: "error"; message: string };
      if (!m || settled) return;

      if (m.type === "batch") {
        emitted++;
        void (async () => {
          try {
            await onBatch(m.rows, m.firstIndex);
          } catch (err) {
            end(() => reject(err as Error));
            return;
          }
          if (!settled) worker.postMessage({ type: "ack" });
        })();
      } else if (m.type === "done") {
        end(() => resolve(m.meta));
      } else if (m.type === "error") {
        fail(m.message);
      }
    };

    worker.postMessage({
      type: "start",
      file,
      batchSize: opts.batchSize,
      preferSheet: opts.preferSheet,
    });
  });
}

export async function runDataImport(
  file: File,
  onBatch: BatchHandler,
  opts: RunImportOptions
): Promise<XlsxStreamMeta> {
  if (!opts.forceDirect) {
    try {
      return await viaWorker(file, onBatch, opts);
    } catch (e) {
      // الاحتياطي بس لو الـWorker ماشتغلش من الأصل — غير كده الخطأ حقيقي.
      if (!(e instanceof WorkerUnusable)) throw e;
    }
  }
  return streamXlsxToBatches(file, onBatch, {
    batchSize: opts.batchSize,
    preferSheet: opts.preferSheet,
  });
}
