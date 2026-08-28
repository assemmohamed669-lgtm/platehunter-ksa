/**
 * تخزين دفعات الداتا بشكل مضغوط على الجهاز.
 *
 * المشكلة: كل صف كان بيتخزّن **كائن بأسماء أعمدته**. مع ملف فيه ٧٧٩ ألف صف
 * و٦ أعمدة، ده **٤.٧ مليون نسخة من أسماء الأعمدة** متخزّنة ومتسلسلة —
 * والآيفون بيقتل الصفحة قبل ما يخلّص.
 *
 * الحل: أسماء الأعمدة **مرة واحدة لكل دفعة**، والصفوف مصفوفات قيم بنفس
 * الترتيب. نفس البيانات بالظبط، بجزء صغير من الحجم.
 *
 * التوافق: `decodeChunk` بيفهم **الشكلين** — الجديد والقديم — عشان الداتا
 * المتخزّنة دلوقتي على أجهزة المناديب ماتضيعش بعد التحديث.
 */
export type DataRow = Record<string, string>;

/** الشكل الجديد: أعمدة مرة واحدة + صفوف كمصفوفات. */
export interface CompactChunk {
  cols: string[];
  vals: string[][];
  sheet?: string;
}

/** الشكل القديم (لسه على أجهزة المناديب). */
interface LegacyChunk {
  rows: DataRow[];
  sheet?: string;
}

export function encodeChunk(rows: DataRow[], sheet?: string): CompactChunk {
  // اتحاد الأعمدة بترتيب أول ظهور — صفوف الإكسيل ممكن تختلف مفاتيحها.
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) { seen.add(k); cols.push(k); }
    }
  }
  const vals = rows.map((r) => cols.map((c) => r[c] ?? ""));
  return sheet === undefined ? { cols, vals } : { cols, vals, sheet };
}

export function decodeChunk(rec: unknown): { rows: DataRow[]; sheet: string } {
  if (!rec || typeof rec !== "object") return { rows: [], sheet: "" };

  // الشكل القديم: فيه rows جاهزة ككائنات.
  const legacy = rec as Partial<LegacyChunk>;
  if (Array.isArray(legacy.rows)) {
    return { rows: legacy.rows as DataRow[], sheet: legacy.sheet ?? "" };
  }

  const c = rec as Partial<CompactChunk>;
  if (!Array.isArray(c.cols) || !Array.isArray(c.vals)) return { rows: [], sheet: "" };

  const cols = c.cols;
  const rows: DataRow[] = new Array(c.vals.length);
  for (let i = 0; i < c.vals.length; i++) {
    const v = c.vals[i];
    const row: DataRow = {};
    for (let j = 0; j < cols.length; j++) row[cols[j]] = v?.[j] ?? "";
    rows[i] = row;
  }
  return { rows, sheet: c.sheet ?? "" };
}
