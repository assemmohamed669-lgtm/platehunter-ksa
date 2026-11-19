/**
 * الكلام اللي جوّه ملف بي دي إف (السيرفر بس) — لقراية بيانات شهايد النهارده (`lib/certParse.ts`).
 * `unpdf` = نسخة PDF.js معمولة للسيرفر؛ السطور بتفضل سطور (`hasEOL`). ملف بايظ ⇒ "".
 *
 * 📐 شهايد «السجل» (sijil.sa) بتتقري **من أوامر الرسم** (`lib/pdfRuns.ts`) — قارئ الكلام العادي بيقطّع قيمها
 * («اسو» بدل «اسود») — والنص بيبدأ بـ`SIJIL_RUNS_MARK` عشان القارئ ياخد القيم زي ما هي. لو قراية الأوامر فشلت
 * أو مالقتش الشهادة ⇒ النص العادي زي الأول.
 */
import { SIJIL_RUNS_MARK } from "./sijilGlyphs";
import { extractRunsText } from "./pdfRuns";

const SIJIL = /sijil\.sa|Saudi Finance Leasing Contracts Registry/i;

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const plain = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    if (SIJIL.test(plain)) {
      const runs = await extractRunsText(pdf);
      if (SIJIL.test(runs)) return `${SIJIL_RUNS_MARK}\n${runs}`;
    }
    return plain;
  } catch {
    return "";
  }
}
