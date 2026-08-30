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
import { streamXlsxToBatches, NotXlsxWorksheetError } from "./xlsxStream";
import { openDataDB, clearChunks, writeChunk } from "./dataStoreDb";
import { parseWorkbookViaXlsx } from "./parseWorkbook";

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

    try {
      // المسار العادي: xlsx على دفعات (ذاكرة قليلة).
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
      return;
    } catch (streamErr) {
      // اتكتبت صفوف بالفعل → مش مشكلة صيغة (تلف في النص) → ارمي.
      if (written > 0) throw streamErr;

      // ── الاحتياطي: صيغة مش xlsx (xlsb / xls / ods) → نقراها بـSheetJS **جوّه
      //    الـWorker** (ذاكرة معزولة عن سقف الصفحة على آيفون) ونكتبها على دفعات.
      //    فأي صيغة وأي حجم بيتقري من غير ما يلمس الخيط الرئيسي — مفيش كراش. ──
      await clearChunks(db!); // احتياط: أي دفعات ناقصة من المحاولة اللي فشلت
      const buf = new Uint8Array(await msg.file.arrayBuffer());
      let table;
      try {
        table = parseWorkbookViaXlsx(buf, { forcedSheet: msg.preferSheet });
      } catch (parseErr) {
        // الاحتياطي كمان فشل: رسالة الصيغة الأصلية أوضح لو موجودة، وإلا خطأ القراءة.
        throw streamErr instanceof NotXlsxWorksheetError ? streamErr : parseErr;
      }
      if (!table.rows.length) {
        throw streamErr instanceof NotXlsxWorksheetError ? streamErr : new Error("الملف فارغ أو لا يحتوي على بيانات.");
      }
      headers = table.headers;
      written = 0;
      const bs = msg.batchSize;
      for (let i = 0; i < table.rows.length; i += bs) {
        const batch = table.rows.slice(i, i + bs) as Record<string, string>[];
        await writeChunk(db!, batch);
        written += batch.length;
        post({ type: "progress", written });
      }
      post({
        type: "done",
        meta: { headers: table.headers, sheetName: table.sheetName ?? "", rowCount: written, allSheetNames: table.allSheetNames ?? [] },
        written, headers,
      });
      return;
    }
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
