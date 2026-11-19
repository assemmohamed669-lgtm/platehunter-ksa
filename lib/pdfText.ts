/**
 * الكلام اللي جوّه ملف بي دي إف (السيرفر بس) — لقراية بيانات شهايد النهارده (`lib/certParse.ts`).
 * `unpdf` = نسخة PDF.js معمولة للسيرفر؛ السطور بتفضل سطور (`hasEOL`). ملف بايظ ⇒ "".
 *
 * 📐 شهايد «السجل» (sijil.sa) بتتقري **من أوامر الرسم** (`lib/pdfRuns.ts`) — قارئ الكلام العادي بيقطّع قيمها
 * («اسو» بدل «اسود») — والنص بيبدأ بـ`SIJIL_RUNS_MARK` عشان القارئ ياخد القيم زي ما هي. لو قراية الأوامر فشلت
 * أو مالقتش الشهادة ⇒ النص العادي زي الأول.
 *
 * 🔗 باقي الشهايد («توثيق»): النص العادي، بس الكلمات اللي فيها رباط («لا»/«لأ»/«لى») بتتصلّح من أوامر الرسم
 * («توكيالت» ⇒ «توكيلات»، «عىل» ⇒ «على»). لو قراية الأوامر فشلت ⇒ النص العادي زي ما هو.
 */
import { SIJIL_RUNS_MARK } from "./sijilGlyphs";
import { pdfRuns, runsToText, ligatureWordFixes, applyWordFixes } from "./pdfRuns";

const SIJIL = /sijil\.sa|Saudi Finance Leasing Contracts Registry/i;

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const plain = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    const pages = await pdfRuns(pdf).catch(() => null);
    if (!pages) return plain;
    if (SIJIL.test(plain)) {
      const runs = pages.map((p) => runsToText(p)).join("\n");
      return SIJIL.test(runs) ? `${SIJIL_RUNS_MARK}\n${runs}` : plain;
    }
    return applyWordFixes(plain, ligatureWordFixes(pages.flat()));
  } catch {
    return "";
  }
}
