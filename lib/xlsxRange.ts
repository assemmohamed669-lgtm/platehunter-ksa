import * as XLSX from "xlsx";

/**
 * قصّ «المدى الوهمي» في ورقة إكسل.
 *
 * محافظ كتير (خصوصاً اللي اتعملها تنسيق أو فلترة على أعمدة كاملة) بيبقى فيها
 * `!ref` مسجّل لغاية صف مليون رغم إن الداتا الفعلية ١٥٠٠ صف. مثال حقيقي:
 * «محفظة البنك العربي» — `A1:Q998660` وفيها **١٤٩٩ صف** بس.
 *
 * المشكلة إن `sheet_to_json` بيمشي على المدى المعلن مش على الخلايا الموجودة،
 * فبيولّد قرابة مليون مصفوفة فاضية → ١٢ ثانية و٢٥٠ ميجا ذاكرة على الكمبيوتر،
 * وعلى الموبايل التطبيق بيتجمّد ويقفل.
 *
 * الدالة دي بتلف على الخلايا **الموجودة فعلاً** (٢٤ ألف خلية، لمح البصر)
 * وبتصغّر `!ref` لآخر صف/عمود فيه قيمة. مابتشيلش أي خلية فيها قيمة — بما فيها
 * القيم اللي بتتقرا falsy زي `0` و`false`.
 *
 * بتشتغل على الأشكال التلاتة للورقة:
 *  - sparse: مفاتيح عناوين خلايا (`"A1"`)
 *  - dense في xlsx 0.18: مفاتيح رقمية (`ws[3]` = مصفوفة صف)
 *  - dense في الإصدارات الأحدث: `ws["!data"]`
 */
export function trimSheetToData(ws: XLSX.WorkSheet | undefined | null): void {
  if (!ws || typeof ws !== "object") return;
  const ref = ws["!ref"];
  if (!ref) return;

  let range: XLSX.Range;
  try {
    range = XLSX.utils.decode_range(ref);
  } catch {
    return;
  }

  let maxR = -1;
  let maxC = -1;

  const seen = (r: number, c: number) => {
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  };

  // خلية فيها محتوى فعلي؟ (0 و false قيم — النص الفاضي لأ)
  // الخلايا اللي فيها صيغة (f) أو رابط (l) بتتحسب محتوى حتى لو قيمتها فاضية،
  // عشان ما نقصّش خلية =HYPERLINK قبل ما resolveHyperlinkCells تشتغل عليها.
  const hasValue = (cell: unknown): boolean => {
    const c = cell as { v?: unknown; f?: unknown; l?: unknown } | undefined;
    if (!c || typeof c !== "object") return false;
    if (c.f != null || c.l != null) return true;
    return c.v != null && String(c.v).trim() !== "";
  };

  // أعلى عمود فيه قيمة داخل صف dense
  const scanDenseRow = (row: unknown, r: number) => {
    if (!Array.isArray(row)) return;
    for (let c = row.length - 1; c >= 0; c--) {
      if (hasValue(row[c])) {
        seen(r, c);
        break;
      }
    }
  };

  const data = (ws as Record<string, unknown>)["!data"];
  if (Array.isArray(data)) {
    for (let r = 0; r < data.length; r++) scanDenseRow(data[r], r);
  } else {
    for (const key in ws) {
      if (key.charCodeAt(0) === 33 /* '!' */) continue;
      const val = (ws as Record<string, unknown>)[key];
      if (Array.isArray(val)) {
        // dense (xlsx 0.18) — المفتاح رقم الصف
        const r = Number(key);
        if (Number.isInteger(r) && r >= 0) scanDenseRow(val, r);
        continue;
      }
      if (!hasValue(val)) continue;
      try {
        const a = XLSX.utils.decode_cell(key);
        seen(a.r, a.c);
      } catch {
        /* مفتاح مش عنوان خلية — نتجاهله */
      }
    }
  }

  // ورقة مافيهاش ولا قيمة → نخليها خلية واحدة بدل مليون صف فاضي
  if (maxR < 0 || maxC < 0) {
    ws["!ref"] = XLSX.utils.encode_range({ s: range.s, e: range.s });
    return;
  }

  const endR = Math.min(range.e.r, Math.max(maxR, range.s.r));
  const endC = Math.min(range.e.c, Math.max(maxC, range.s.c));
  if (endR === range.e.r && endC === range.e.c) return; // المدى مظبوط أصلاً

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: range.s.r, c: range.s.c },
    e: { r: endR, c: endC },
  });
}
