/**
 * Web Worker — يقرا ملف الداتا **ويكتبه في تخزين الجهاز**، كله برّه الخيط
 * الرئيسي. الصفحة بتستقبل **رقم التقدّم بس** — ولا صف واحد بيعدّي عليها.
 *
 * ليه: آيفون بيحاسب صفحة الويب على سقف ذاكرة صارم. ملف ٧٧٩ ألف صف ذروته
 * ~١٧٥ ميجا، ومنها ١٧٢ في التجهيز قبل أول صف. أول محاولة نقلنا **القراءة**
 * بس والكتابة فضلت في الصفحة — والكراش فضل عند صفر. فنقلنا الكتابة كمان.
 *
 * مصافحة "ready": بنبعتها أول ما الـWorker يتحمّل. من غيرها الصفحة مش قادرة
 * تفرّق بين «الـWorker شغّال وبيجهّز» و«الـWorker ماشتغلش خالص» — وده اللي
 * خلّى المحاولة الأولى غامضة.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { streamXlsxToBatches } from "./xlsxStream";
import { openDataDB, clearChunks, writeChunk } from "./dataStoreDb";

type StartMsg = { type: "start"; file: File; batchSize: number; slot: string; preferSheet?: string };

const post = (m: unknown) => (self as any).postMessage(m);

// بنقول للصفحة إننا اتحمّلنا فعلاً — ده اللي بيثبت إن الـWorker شغّال.
post({ type: "ready" });

self.onmessage = async (e: MessageEvent<StartMsg>) => {
  const msg = e.data;
  if (msg?.type !== "start") return;

  let db: IDBDatabase | null = null;
  try {
    db = await openDataDB(msg.slot);
    await clearChunks(db);

    let written = 0;
    let headers: string[] = [];

    const meta = await streamXlsxToBatches(
      msg.file,
      async (rows) => {
        if (!headers.length && rows.length) headers = Object.keys(rows[0]);
        await writeChunk(db!, rows);       // الانتظار هنا = ضغط خلفي طبيعي
        written += rows.length;
        post({ type: "progress", written });
      },
      { batchSize: msg.batchSize, preferSheet: msg.preferSheet }
    );

    post({ type: "done", meta, written, headers });
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.constructor.name : "Error",
    });
  } finally {
    try { db?.close(); } catch { /* اتقفلت خلاص */ }
  }
};
