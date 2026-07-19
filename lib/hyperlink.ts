/**
 * قراءة روابط الخرائط من خلايا الإكسيل اللي متعمولها HYPERLINK.
 *
 * الملفات اللي بنطلّعها (الداتا + عمود المواقع) بتكتب الموقع كـ
 *   =HYPERLINK("https://maps...","خريطة")
 * عشان Excel يبيّن كلمة «خريطة» وكليك يفتح الخريطة. لكن قارئ SheetJS بيرجّع
 * القيمة المخزّنة ("خريطة") مش الرابط — فالتطبيق ماكانش يعرف يعمله لينك. الدوال دي
 * بتحوّل خلية HYPERLINK (أو hyperlink حقيقي عبر l.Target) لقيمتها = الرابط نفسه،
 * فالتطبيق يعرضه «📍 خريطة» زي أي عمود GPS.
 */

/** يستخرج الرابط من نص صيغة HYPERLINK، أو null لو مش HYPERLINK. */
export function hyperlinkFormulaUrl(formula: string | undefined | null): string | null {
  if (!formula) return null;
  const m = /HYPERLINK\(\s*"([^"]+)"/i.exec(formula);
  return m ? m[1] : null;
}

/**
 * يمرّ على خلايا الورقة: أي خلية صيغتها HYPERLINK (أو ليها hyperlink حقيقي عبر
 * l.Target) بتتحوّل قيمتها للرابط نفسه (ونشيل الصيغة). بيعدّل الورقة في مكانها،
 * ولازم يتنادى قبل sheet_to_json.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveHyperlinkCells(ws: any): void {
  if (!ws || typeof ws !== "object") return;
  for (const ref in ws) {
    if (ref.charCodeAt(0) === 33) continue; // يتخطى "!ref" و"!cols" ...
    const cell = ws[ref];
    if (!cell || typeof cell !== "object") continue;
    const url = hyperlinkFormulaUrl(cell.f) ?? (cell.l && cell.l.Target) ?? null;
    if (url) {
      cell.v = url;
      cell.w = url;
      cell.t = "s";
      delete cell.f;
    }
  }
}
