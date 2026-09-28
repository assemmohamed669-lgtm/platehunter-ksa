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
  // 🙈 الصفوف المخفية الأول — كل مسارات SheetJS بتعدّي من هنا قبل التحويل.
  dropHiddenRows(ws);
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

/**
 * 🙈 **يشيل الصفوف المخفية من الورقة** (فلتر إكسيل أو «إخفاء» يدوي) ويطلّع اللي
 * بعدها مكانها — فأي قراءة بعدها تشوف الورقة زي ما صاحبها شايفها في إكسيل.
 *
 * المالك (٢٩ سبتمبر ٢٠٢٦): «انا مش عايز يقرأ المخفي ابدا». ملف «Initiate Repo D»
 * كان فيه فلتر مخبّي ١٩٣٧ عقد منتهي/مقفول، والبرنامج كان بيقراهم كأنهم ظاهرين
 * فبيطلعوا للمندوب مطلوبين.
 *
 * ⚠️ علامة الإخفاء بتوصل من SheetJS بس لو الملف اتقرا بـ`cellStyles: true`.
 * ⚠️ أول صف فيه بيانات (العناوين) مابيتشالش حتى لو مخفي — وإلا الملف كله يبوظ.
 * الروابط بتتنقل مع خلاياها، والدمج اللي بيعدّي على صف مخفي بيتشال.
 *
 * بترجّع عدد الصفوف اللي اتشالت (٠ = الورقة ماتلمستش خالص).
 */
export function dropHiddenRows(ws: XLSX.WorkSheet | undefined | null): number {
  if (!ws || typeof ws !== "object") return 0;
  const info = ws["!rows"];
  if (!Array.isArray(info) || !info.some((r) => r?.hidden)) return 0;
  const W = ws as Record<string, unknown>;

  const hasValue = (cell: unknown): boolean => {
    const c = cell as { v?: unknown; f?: unknown; l?: unknown } | undefined;
    if (!c || typeof c !== "object") return false;
    if (c.f != null || c.l != null) return true;
    return c.v != null && String(c.v).trim() !== "";
  };
  const rowHasValue = (row: unknown) => Array.isArray(row) && row.some(hasValue);

  // المدى المعلن — الأشكال الـdense بتتلف عليه بدل ما نجمّع كل المفاتيح
  let range: XLSX.Range | null = null;
  try { range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null; } catch { range = null; }

  // الخلايا بالأشكال التلاتة: sparse ("A1") · dense 0.18 (ws[r]) · dense أحدث (!data)
  const data = W["!data"];
  const denseNew = Array.isArray(data);
  let dense018 = false;
  if (!denseNew && range) {
    for (let r = range.s.r; r <= range.e.r; r++) {
      if (W[r] !== undefined) { dense018 = Array.isArray(W[r]); break; }
    }
  }
  const lastRow = range ? range.e.r : -1;
  const cells: [string, unknown, number, number][] = [];   // sparse بس
  let firstDataRow = Infinity;
  if (denseNew) {
    const rows = data as unknown[];
    for (let r = 0; r < rows.length; r++) if (rowHasValue(rows[r])) { firstDataRow = r; break; }
  } else if (dense018) {
    for (let r = range!.s.r; r <= lastRow; r++) if (rowHasValue(W[r])) { firstDataRow = r; break; }
  } else {
    for (const key in W) {
      if (key.charCodeAt(0) === 33 /* '!' */) continue;
      let a: XLSX.CellAddress;
      try { a = XLSX.utils.decode_cell(key); } catch { continue; }
      const val = W[key];
      cells.push([key, val, a.r, a.c]);
      if (a.r < firstDataRow && hasValue(val)) firstDataRow = a.r;
    }
  }

  // الموضع الجديد لكل صف (-1 = اتشال)
  const dropped = (r: number) => info[r]?.hidden === true && r !== firstDataRow;
  const newIdx: number[] = [];
  let removed = 0;
  for (let r = 0; r < info.length; r++) {
    if (dropped(r)) { newIdx[r] = -1; removed++; } else newIdx[r] = r - removed;
  }
  if (removed === 0) return 0;
  const idxOf = (r: number) => (r < newIdx.length ? newIdx[r] : r - removed);

  if (denseNew) {
    const rows = data as unknown[];
    const next: unknown[] = [];
    for (let r = 0; r < rows.length; r++) {
      const nr = idxOf(r);
      if (nr >= 0 && rows[r] !== undefined) next[nr] = rows[r];
    }
    W["!data"] = next;
  } else if (dense018) {
    // في مكانها: كل صف بينزل لموضعه الجديد (دايماً أصغر أو زيه)، فالمكان اللي
    // بيتكتب فيه اتقرا خلاص. وبعدين الذيل بيتشال. مفيش نسخة تانية من الورقة —
    // ده اللي بيخلّي الذاكرة زي من غير المخفي (ملف الداتا مليون صف على الآيفون).
    let lastKept = -1;
    for (let r = 0; r <= lastRow; r++) {
      const nr = idxOf(r);
      if (nr < 0) continue;
      lastKept = nr;
      if (nr === r) continue;
      if (W[r] !== undefined) W[nr] = W[r]; else delete W[nr];
    }
    for (let r = lastKept + 1; r <= lastRow; r++) delete W[r];
  } else {
    for (const [key] of cells) delete W[key];
    for (const [, val, r, c] of cells) {
      const nr = idxOf(r);
      if (nr >= 0) W[XLSX.utils.encode_cell({ r: nr, c })] = val;
    }
  }

  // المدى
  const ref = ws["!ref"];
  if (ref) {
    try {
      const range = XLSX.utils.decode_range(ref);
      let endR = range.e.r;
      while (endR > range.s.r && idxOf(endR) < 0) endR--;
      range.e.r = Math.max(range.s.r, idxOf(endR));
      ws["!ref"] = XLSX.utils.encode_range(range);
    } catch { /* مدى مش مفهوم — نسيبه */ }
  }

  // معلومات الصفوف: الظاهر بس، من غير علامة الإخفاء
  const nextInfo: XLSX.RowInfo[] = [];
  for (let r = 0; r < info.length; r++) {
    const ri = info[r];
    const nr = idxOf(r);
    if (!ri || nr < 0) continue;
    const { hidden: _h, ...rest } = ri;
    void _h;
    nextInfo[nr] = rest;
  }
  ws["!rows"] = nextInfo;

  // الدمج: اللي بيعدّي على صف اتشال بيتشال، والباقي بيتزحزح
  const merges = ws["!merges"];
  if (Array.isArray(merges)) {
    ws["!merges"] = merges
      .filter((m) => { for (let r = m.s.r; r <= m.e.r; r++) if (idxOf(r) < 0) return false; return true; })
      .map((m) => ({ s: { r: idxOf(m.s.r), c: m.s.c }, e: { r: idxOf(m.e.r), c: m.e.c } }));
  }
  return removed;
}

/** بيعلّم الصفوف دي مخفية في الورقة (نتيجة `scanHiddenRows`) — `dropHiddenRows` بتشيلها بعد كده. */
export function markHiddenRows(ws: XLSX.WorkSheet | undefined | null, rows: Iterable<number>): void {
  if (!ws || typeof ws !== "object") return;
  const info = (ws["!rows"] ?? []) as XLSX.RowInfo[];
  for (const r of rows) info[r] = { ...(info[r] ?? {}), hidden: true };
  ws["!rows"] = info;
}
