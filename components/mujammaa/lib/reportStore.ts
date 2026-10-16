/**
 * 💾 حفظ تقارير التفريغ — IndexedDB في قاعدة **لوحدها** (٣٠ سبتمبر ٢٠٢٦).
 *
 * المالك: «الأهم إن التقرير ميتمسحش حتى لو خرجت من الصفحة — يفضل موجود،
 * أمسحه يدوي من زرّ المسح بس».
 *
 *  · قاعدة منفصلة (`plate-lab-reports`) — مابتلمسش قاعدة الملفات ولا بتتمسح معاها.
 *  · مافيش مسح تلقائي ولا حدّ عدد. المسح بس من `deleteReport` / `clearReports`
 *    (زرّين في الصفحة، والمسح الكلي بيسأل الأول).
 *  · `navigator.storage.persist()` عشان المتصفح مايمسحهاش لوحده وقت الزحمة.
 */
import type { BatchReport } from "./batchReport";
import { closeSessions, removePart, storedReport, type SessionSave } from "./sessionReport";

const DB = "plate-lab-reports";
const STORE = "reports";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

let persistAsked = false;

async function askPersist(): Promise<void> {
  if (persistAsked) return;
  persistAsked = true;
  try { await navigator.storage?.persist?.(); } catch { /* مش مدعوم — مش مشكلة */ }
}

export async function saveReport(r: BatchReport): Promise<void> {
  await askPersist();
  await tx("readwrite", (s) => s.put(storedReport(r)));
}

const newestFirst = (all: BatchReport[] | undefined) => (all || []).sort((a, b) => b.createdAt - a.createdAt);

/** كل التقارير — الأحدث الأول. */
export async function listReports(): Promise<BatchReport[]> {
  return newestFirst(await tx<BatchReport[]>("readonly", (s) => s.getAll() as IDBRequest<BatchReport[]>));
}

/**
 * قراية كل التقارير + كتابة اللي اتقرّر **في نفس المعاملة** (٤ أكتوبر ٢٠٢٦ —
 * تقرير الجلسة). `plan` متزامنة، فالمعاملة مابتقفلش في النص. كل كتابة بتعدّي
 * على `storedReport` (التشخيص مابيتحفظش مرتين — عيب ٦/١١).
 *
 * 🔴 ليه مش `listReports` وبعدين `saveReport`: لو «ابدأ تقرير جديد» اتداس
 * بين الاتنين، الكتابة كانت هترجّع التقرير المقفول مفتوح (نسخة قبل القفل).
 * معاملات القراية/الكتابة على نفس المخزن بتمشي واحدة ورا التانية.
 */
async function rewrite<T>(plan: (reports: BatchReport[]) => { put: BatchReport[]; result: T }): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      const s = t.objectStore(STORE);
      let done: { result: T } | undefined;
      let fail: unknown;
      const all = s.getAll() as IDBRequest<BatchReport[]>;
      all.onsuccess = () => {
        try {
          const p = plan(newestFirst(all.result));
          for (const r of p.put) s.put(storedReport(r));
          done = { result: p.result };
        } catch (err) {
          fail = err;
          t.abort();
        }
      };
      t.oncomplete = () => (done ? resolve(done.result) : reject(new Error("التقرير ماتبناش")));
      t.onerror = () => reject(fail ?? t.error);
      t.onabort = () => reject(fail ?? t.error ?? new Error("المعاملة اتلغت"));
    });
  } finally {
    db.close();
  }
}

/**
 * حفظ تفريغ في تقرير الجلسة: `make` بتقرّر (`planSessionSave`) التقرير اللي
 * التفريغ ده دخله + أي تقارير تانية تتحفظ معاه (نسخة «قبل فرّغ تاني» · تقرير
 * اتقفل لأن الورقة اتقرت تاني) — كله في معاملة واحدة. بيرجّع التقرير اللي
 * المقطع هيشاور عليه.
 *
 * ⏱️ بمهلة: الصفحة بقت **بتستنى** الحفظ قبل ما التفريغ يخلص (عشان المقطع
 * يتربط بالتقرير، والمقطع الجاي في الطابور يلاقي التقرير المفتوح). تخزين
 * معلّق (آيفون) كان هيوقّف التفريغ للأبد ⇒ بعد المهلة بنرمي غلط والتفريغ يكمّل.
 */
export const REPORT_SAVE_TIMEOUT_MS = 8000;

export function saveReportFrom(
  make: (reports: BatchReport[]) => SessionSave,
  timeoutMs = REPORT_SAVE_TIMEOUT_MS
): Promise<BatchReport> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("التخزين مابيردّش — التقرير ماتحفظش")), timeoutMs);
  });
  const write = (async () => {
    await askPersist();
    return rewrite((all) => {
      const { report, also } = make(all);
      return { put: [...also, report], result: report };
    });
  })();
  return Promise.race([write, late]).finally(() => clearTimeout(timer));
}

/**
 * «📄 ابدأ تقرير جديد»: كل تقرير مفتوح بيتقفل (`closed: true`) — مافيش مسح.
 * القراية والكتابة في معاملة واحدة، فتفريغ بيحفظ في نفس اللحظة مابيضيعش.
 * بترجّع عدد اللي اتقفلوا.
 */
export async function closeOpenSessionReports(): Promise<number> {
  return rewrite((all) => {
    const closed = closeSessions(all);
    return { put: closed, result: closed.length };
  });
}

/**
 * 🔎 «شيل التسجيل ده» (عيب ٣ · مراجعة ٤ أكتوبر): التسجيل بيخرج من التقرير
 * والتقرير بيتبني من جديد على الباقي (`removePart`) في مكانه — بإيد المالك
 * بس، من زرّ على التسجيل في الكارت. `false` = مانفعش (آخر تسجيل مثلاً).
 */
export async function removeReportPart(id: string, clipId: string): Promise<boolean> {
  return rewrite((all) => {
    const r = all.find((x) => x.id === id);
    const next = r ? removePart(r, clipId, Date.now()) : undefined;
    return { put: next ? [next] : [], result: Boolean(next) };
  });
}

export async function deleteReport(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

export async function clearReports(): Promise<void> {
  await tx("readwrite", (s) => s.clear());
}
