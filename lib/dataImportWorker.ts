/**
 * Web Worker — يقرا ملف الداتا على دفعات **برّه الخيط الرئيسي**.
 *
 * ليه: آيفون بيحاسب صفحة الويب على سقف ذاكرة صارم. قراءة ملف فيه ٧٧٩ ألف صف
 * بتوصل لذروة ~١٧٥ ميجا، ولو دي جوّه الصفحة WebKit بيقتلها («حدثت مشكلة بشكل
 * متكرر»). الـWorker ليه مساحته المنفصلة — ولذلك مربّع الإحالة (اللي بيستخدم
 * worker) بينجح على نفس الملف اللي بيقتل مربّع الداتا.
 *
 * الضغط الخلفي: بنبعت دفعة وبنستنى «ack» من الصفحة قبل ما نكمّل. من غير كده
 * الـWorker بيسبق الكتابة وبتتكدّس الدفعات في الذاكرة — يعني نرجع لنفس
 * المشكلة من باب تاني.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { streamXlsxToBatches } from "./xlsxStream";

type StartMsg = { type: "start"; file: File; batchSize: number; preferSheet?: string };
type AckMsg = { type: "ack" };
type InMsg = StartMsg | AckMsg;

let ackResolve: (() => void) | null = null;

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;

  if (msg?.type === "ack") { const r = ackResolve; ackResolve = null; r?.(); return; }
  if (msg?.type !== "start") return;

  try {
    const meta = await streamXlsxToBatches(
      msg.file,
      async (rows, firstIndex) => {
        (self as any).postMessage({ type: "batch", rows, firstIndex });
        // نستنى تأكيد الكتابة قبل الدفعة اللي بعدها.
        await new Promise<void>((res) => { ackResolve = res; });
      },
      { batchSize: msg.batchSize, preferSheet: msg.preferSheet }
    );
    (self as any).postMessage({ type: "done", meta });
  } catch (err) {
    // بنبعت اسم الصنف كمان عشان الصفحة تفرّق NotXlsxWorksheetError (ليها
    // رسالة بتسمّي الصيغة الحقيقية) عن أي خطأ تاني.
    (self as any).postMessage({
      type: "error",
      name: err instanceof Error ? err.constructor.name : "Error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
