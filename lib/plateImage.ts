/**
 * plateImage.ts — يرسم قائمة لوحات على صورة (PNG) عشان تتبعت على واتساب أو
 * تتنزّل على التليفون. القوائم الكبيرة بتتقسّم تلقائياً لكذا صورة (كل ~22 لوحة
 * صورة) عشان تفضل مقروءة على الموبايل بدل صورة واحدة طويلة.
 *
 * رسم يدوي على canvas (مش مكتبة) — أضمن للنص العربي RTL في الـ WebView، وبدون
 * أي اعتماديات جديدة. الألوان ثابتة (خلفية فاتحة) عشان الصورة تطلع واضحة على
 * واتساب بغضّ النظر عن ثيم التطبيق.
 */

export interface PlateImageRow {
  /** اللوحة (تظهر كبيرة وبولد). */
  plate: string;
  /** تفاصيل إضافية [العنوان، القيمة] — تظهر تحت اللوحة سطر صغير. */
  details: [string, string][];
  /** سطر تفاصيل جاهز (قيم بدون رؤوس عناوين). لو موجود بيُستخدم بدل `details`. */
  detailsText?: string;
}

export interface PlateImageOptions {
  title: string;
  rows: PlateImageRow[];
  /** أقصى عدد لوحات في الصورة الواحدة قبل ما تتقسّم. */
  perImage?: number;
}

const WIDTH = 720;
const PAD = 24;
const TITLE_H = 64;
const FOOTER_H = 40;
const PLATE_LH = 30;   // ارتفاع سطر اللوحة
const DETAIL_LH = 20;  // ارتفاع سطر التفاصيل
const ROW_PAD = 12;    // حشو رأسي داخل صف اللوحة

const COL = {
  bg: "#ffffff",
  headerBg: "#0f766e",
  headerText: "#ffffff",
  plate: "#0f172a",
  detail: "#475569",
  rowAlt: "#f1f5f9",
  border: "#e2e8f0",
  footer: "#94a3b8",
};

/** يلفّ نص التفاصيل على سطور بعرض متاح (بالبكسل). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function detailText(details: [string, string][]): string {
  return details
    .filter(([, v]) => String(v ?? "").trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("  •  ");
}

/** يرسم مجموعة صفوف على canvas واحد ويرجّع data URL (PNG). */
function renderChunk(rows: PlateImageRow[], title: string, pageInfo: string): string {
  const measure = document.createElement("canvas").getContext("2d")!;
  const detailMaxW = WIDTH - PAD * 2;

  // مرحلة القياس: نحسب ارتفاع كل صف (سطر لوحة + سطور تفاصيل ملفوفة).
  measure.font = "16px system-ui, 'Segoe UI', Tahoma, sans-serif";
  const rowHeights = rows.map((r) => {
    const dLines = wrapText(measure, r.detailsText ?? detailText(r.details), detailMaxW);
    return ROW_PAD * 2 + PLATE_LH + dLines.length * DETAIL_LH;
  });
  const bodyH = rowHeights.reduce((a, b) => a + b, 0);
  const height = TITLE_H + bodyH + FOOTER_H;

  const canvas = document.createElement("canvas");
  // دقة مضاعفة عشان النص يطلع حاد على شاشات الموبايل.
  const scale = 2;
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.textBaseline = "middle";
  (ctx as CanvasRenderingContext2D & { direction: string }).direction = "rtl";
  ctx.textAlign = "right";
  const rightX = WIDTH - PAD;

  // خلفية
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, WIDTH, height);

  // شريط العنوان
  ctx.fillStyle = COL.headerBg;
  ctx.fillRect(0, 0, WIDTH, TITLE_H);
  ctx.fillStyle = COL.headerText;
  ctx.font = "bold 22px system-ui, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(title, rightX, TITLE_H / 2);

  // الصفوف
  let y = TITLE_H;
  rows.forEach((r, i) => {
    const h = rowHeights[i];
    if (i % 2 === 1) {
      ctx.fillStyle = COL.rowAlt;
      ctx.fillRect(0, y, WIDTH, h);
    }
    // اللوحة
    ctx.fillStyle = COL.plate;
    ctx.font = "bold 24px system-ui, 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(`${i + 1}.  ${r.plate}`, rightX, y + ROW_PAD + PLATE_LH / 2);
    // التفاصيل
    ctx.fillStyle = COL.detail;
    ctx.font = "16px system-ui, 'Segoe UI', Tahoma, sans-serif";
    const dLines = wrapText(ctx, r.detailsText ?? detailText(r.details), WIDTH - PAD * 2);
    let dy = y + ROW_PAD + PLATE_LH + DETAIL_LH / 2;
    for (const line of dLines) { ctx.fillText(line, rightX, dy); dy += DETAIL_LH; }
    // فاصل
    ctx.strokeStyle = COL.border;
    ctx.beginPath();
    ctx.moveTo(0, y + h);
    ctx.lineTo(WIDTH, y + h);
    ctx.stroke();
    y += h;
  });

  // الفوتر
  ctx.fillStyle = COL.footer;
  ctx.font = "14px system-ui, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(pageInfo, rightX, height - FOOTER_H / 2);

  return canvas.toDataURL("image/png");
}

/**
 * يرسم كل اللوحات ويرجّع مصفوفة صور (data URLs) — واحدة أو أكتر حسب العدد.
 */
export function renderPlateImages(opts: PlateImageOptions): string[] {
  const perImage = opts.perImage && opts.perImage > 0 ? opts.perImage : 22;
  const chunks: PlateImageRow[][] = [];
  for (let i = 0; i < opts.rows.length; i += perImage) {
    chunks.push(opts.rows.slice(i, i + perImage));
  }
  if (chunks.length === 0) return [];
  const total = chunks.length;
  return chunks.map((chunk, idx) => {
    const pageInfo = total > 1
      ? `صفحة ${idx + 1} من ${total} · ${opts.rows.length} لوحة`
      : `${opts.rows.length} لوحة`;
    return renderChunk(chunk, opts.title, pageInfo);
  });
}

/**
 * يحوّل صفّ عرض جاهز (Record — زي اللي بترجّعه buildRowObject وأخواتها، فيه
 * «رقم اللوحة» + باقي الأعمدة) لـ PlateImageRow. أي عمود فاضي بيتشال.
 */
export function objToPlateRow(obj: Record<string, unknown>, plateKey = "رقم اللوحة"): PlateImageRow {
  const plate = String(obj[plateKey] ?? "").trim();
  const details: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k === plateKey) continue;
    const val = String(v ?? "").trim();
    if (val) details.push([k, val]);
  }
  return { plate, details };
}

// ─────────────────────────────────────────────────────────────────────────────
// جدول (زي شيت إكسيل) — رؤوس أعمدة من فوق + خانات متصفّة لكل صف. RTL.
// ─────────────────────────────────────────────────────────────────────────────

export interface TableImageOptions {
  title: string;
  subtitle?: string;    // سطر تحت العنوان (تاريخ/وقت الإنشاء)
  columns: string[];    // رؤوس الأعمدة — RTL: الأول = أقصى اليمين
  rows: string[][];     // كل صف = قيم بترتيب columns
  rowColors?: (string | null)[]; // لون خلفية كل صف (hex) — للوحات المكررة، محاذي لـ rows
  perImage?: number;    // أقصى عدد صفوف في الصورة قبل التقسيم
}

const T_PAD = 20;
const T_CELL_PAD = 8;
const T_LINE_H = 22;
const T_MAX_COL_W = 210;
const T_MIN_COL_W = 56;
const T_TITLE_H = 52;
const T_SUB_H = 26;
const T_CELL_FONT = "15px system-ui, 'Segoe UI', Tahoma, sans-serif";
const T_HEAD_FONT = "bold 15px system-ui, 'Segoe UI', Tahoma, sans-serif";

function renderTableChunk(
  rows: string[][], opts: TableImageOptions, colW: number[], tableW: number, pageInfo: string,
  rowColors?: (string | null)[],
): string {
  const totalW = tableW + T_PAD * 2;
  const innerW = colW.map((w) => w - T_CELL_PAD * 2);
  const measure = document.createElement("canvas").getContext("2d")!;

  // لفّ الخانات + ارتفاع كل صف (والرؤوس).
  measure.font = T_HEAD_FONT;
  const headLines = opts.columns.map((h, ci) => wrapText(measure, h, innerW[ci]));
  const headH = T_CELL_PAD * 2 + Math.max(1, ...headLines.map((l) => l.length)) * T_LINE_H;
  measure.font = T_CELL_FONT;
  const cellLines = rows.map((row) => opts.columns.map((_, ci) => wrapText(measure, String(row[ci] ?? ""), innerW[ci])));
  const rowH = cellLines.map((cells) => T_CELL_PAD * 2 + Math.max(1, ...cells.map((l) => l.length)) * T_LINE_H);

  const titleBlock = T_TITLE_H + (opts.subtitle ? T_SUB_H : 0);
  const bodyH = rowH.reduce((a, b) => a + b, 0);
  const height = titleBlock + headH + bodyH + FOOTER_H;

  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = totalW * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.textBaseline = "middle";
  (ctx as CanvasRenderingContext2D & { direction: string }).direction = "rtl";
  ctx.textAlign = "right";

  // حواف الأعمدة (RTL: العمود ٠ أقصى اليمين).
  const colRight: number[] = [];
  let xr = T_PAD + tableW;
  for (let ci = 0; ci < colW.length; ci++) { colRight[ci] = xr; xr -= colW[ci]; }

  // خلفية
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, totalW, height);

  // شريط العنوان + التاريخ/الوقت
  ctx.fillStyle = COL.headerBg;
  ctx.fillRect(0, 0, totalW, titleBlock);
  ctx.fillStyle = COL.headerText;
  ctx.font = "bold 20px system-ui, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(opts.title, T_PAD + tableW, T_TITLE_H / 2);
  if (opts.subtitle) {
    ctx.font = "13px system-ui, 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(opts.subtitle, T_PAD + tableW, T_TITLE_H + T_SUB_H / 2 - 2);
  }

  // صف الرؤوس
  let y = titleBlock;
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(T_PAD, y, tableW, headH);
  ctx.fillStyle = "#0f172a";
  ctx.font = T_HEAD_FONT;
  opts.columns.forEach((_, ci) => {
    let ly = y + T_CELL_PAD + T_LINE_H / 2;
    for (const line of headLines[ci]) { ctx.fillText(line, colRight[ci] - T_CELL_PAD, ly); ly += T_LINE_H; }
  });
  y += headH;

  // الصفوف
  rows.forEach((row, i) => {
    const h = rowH[i];
    // اللوحة المكررة بس بتتلوّن (كل مجموعة لون). اللي ملهاش شبيه تفضل بيضا —
    // بدون تخطيط ولا أي لون (بطلب المستخدم).
    const dup = rowColors?.[i];
    if (dup) { ctx.fillStyle = dup; ctx.fillRect(T_PAD, y, tableW, h); }
    row.forEach((_, ci) => {
      // العمود الأول (اللوحة/المطلوب) بولد وغامق للتمييز.
      ctx.font = ci === 0 ? "bold 16px system-ui, 'Segoe UI', Tahoma, sans-serif" : T_CELL_FONT;
      ctx.fillStyle = ci === 0 ? COL.plate : COL.detail;
      let ly = y + T_CELL_PAD + T_LINE_H / 2;
      for (const line of cellLines[i][ci]) { ctx.fillText(line, colRight[ci] - T_CELL_PAD, ly); ly += T_LINE_H; }
    });
    y += h;
  });

  // خطوط الجدول (أفقي + رأسي)
  ctx.strokeStyle = COL.border;
  ctx.lineWidth = 1;
  // أفقي: تحت الرؤوس وتحت كل صف
  let hy = titleBlock + headH;
  ctx.beginPath(); ctx.moveTo(T_PAD, titleBlock + headH); ctx.lineTo(T_PAD + tableW, titleBlock + headH); ctx.stroke();
  for (const h of rowH) { hy += h; ctx.beginPath(); ctx.moveTo(T_PAD, hy); ctx.lineTo(T_PAD + tableW, hy); ctx.stroke(); }
  // رأسي: على حواف الأعمدة
  for (let ci = 0; ci <= colW.length; ci++) {
    const x = ci < colW.length ? colRight[ci] : T_PAD;
    ctx.beginPath(); ctx.moveTo(x, titleBlock); ctx.lineTo(x, titleBlock + headH + bodyH); ctx.stroke();
  }

  // الفوتر
  ctx.fillStyle = COL.footer;
  ctx.font = "13px system-ui, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(pageInfo, T_PAD + tableW, height - FOOTER_H / 2);

  return canvas.toDataURL("image/png");
}

/** يرسم النتائج كجدول (زي شيت إكسيل) — صورة واحدة أو أكتر حسب عدد الصفوف. */
export function renderTableImages(opts: TableImageOptions): string[] {
  const perImage = opts.perImage && opts.perImage > 0 ? opts.perImage : 28;
  // عرض كل عمود = أعرض محتوى فيه (رأس أو خانة) محصور بين حد أدنى وأقصى.
  const measure = document.createElement("canvas").getContext("2d")!;
  const colW = opts.columns.map((h, ci) => {
    measure.font = T_HEAD_FONT;
    let w = measure.measureText(h).width;
    measure.font = T_CELL_FONT;
    for (const row of opts.rows) w = Math.max(w, measure.measureText(String(row[ci] ?? "")).width);
    return Math.min(T_MAX_COL_W, Math.max(T_MIN_COL_W, Math.ceil(w) + T_CELL_PAD * 2));
  });
  const tableW = colW.reduce((a, b) => a + b, 0);

  const chunks: string[][][] = [];
  const colorChunks: (string | null)[][] = [];
  for (let i = 0; i < opts.rows.length; i += perImage) {
    chunks.push(opts.rows.slice(i, i + perImage));
    colorChunks.push((opts.rowColors ?? []).slice(i, i + perImage));
  }
  if (chunks.length === 0) { chunks.push([]); colorChunks.push([]); }
  const total = chunks.length;
  return chunks.map((chunk, idx) => {
    const pageInfo = total > 1
      ? `صفحة ${idx + 1} من ${total} · ${opts.rows.length} لوحة`
      : `${opts.rows.length} لوحة`;
    return renderTableChunk(chunk, opts, colW, tableW, pageInfo, colorChunks[idx]);
  });
}

/** ينزّل صورة data URL باسم معيّن (ويب/موبايل عبر رابط تنزيل). */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
