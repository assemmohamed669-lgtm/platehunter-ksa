/**
 * الكلام اللي جوّه ملف بي دي إف (السيرفر بس) — لقراية بيانات شهايد النهارده (`lib/certParse.ts`).
 * `unpdf` = نسخة PDF.js معمولة للسيرفر؛ السطور بتفضل سطور (`hasEOL`). ملف بايظ ⇒ "".
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : String(text ?? "");
  } catch {
    return "";
  }
}
