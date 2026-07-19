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

/** يحوّل خلية واحدة (لو HYPERLINK/hyperlink) لقيمتها = الرابط. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveCell(cell: any): void {
  if (!cell || typeof cell !== "object") return;
  const url = hyperlinkFormulaUrl(cell.f) ?? (cell.l && cell.l.Target) ?? null;
  if (url) {
    cell.v = url;
    cell.w = url;
    cell.t = "s";
    delete cell.f;
  }
}

/**
 * يمرّ على خلايا الورقة: أي خلية صيغتها HYPERLINK (أو ليها hyperlink حقيقي عبر
 * l.Target) بتتحوّل قيمتها للرابط نفسه (ونشيل الصيغة). بيعدّل الورقة في مكانها،
 * ولازم يتنادى قبل sheet_to_json. بيدعم الوضعين: dense (الخلايا في `!data` مصفوفة
 * صفوف — ده اللي التطبيق بيقرا بيه) و sparse (مفاتيح A1).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveHyperlinkCells(ws: any): void {
  if (!ws || typeof ws !== "object") return;
  // dense (بعض النسخ): الصفوف في !data
  if (Array.isArray(ws["!data"])) {
    for (const row of ws["!data"]) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) resolveCell(cell);
    }
    return;
  }
  // نلف على كل المفاتيح: القيمة إما صف-array (dense على مفتاح رقمي زي ws[0], ws[1])
  // أو خلية واحدة (sparse على مفتاح A1). نتخطى مفاتيح "!...".
  for (const key in ws) {
    if (key.charCodeAt(0) === 33) continue; // "!"
    const val = ws[key];
    if (Array.isArray(val)) {
      for (const cell of val) resolveCell(cell);
    } else {
      resolveCell(val);
    }
  }
}
