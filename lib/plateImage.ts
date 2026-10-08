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
  /**
   * 🖼️ «grid» = جدول مرتب زي صورة البرنامج المنافس اللي بعتها المالك (٨ أكتوبر ٢٠٢٦): عناوين بنفسجي بكتابة
   * بيضا، خطوط جدول غامقة، الكلام في نص الخانة، المكرر بلون مجموعته وبخط عريض، و`GRID_PER_IMAGE` لوحة في
   * الصورة. من غيره = الشكل القديم بالحرف (باقي الصفحات).
   */
  style?: "grid";
  /**
   * 🎨 مفتاح مجموعة المكرر لكل صف (null = مش مكرر) — في «grid» الألوان بتتوزّع **جوّه كل صورة** من
   * `GRID_DUP_PALETTE` (`gridGroupColors`) بدل `rowColors`، فمجموعتين في نفس الصورة عمرهم ما ياخدوا نفس اللون.
   */
  rowGroups?: (string | null)[];
}

/** 🖼️ لوحات كل صورة في الشكل «grid» — المالك: «3 صور كل صورة فيها 20 لوحه بتفاصيلها». */
export const GRID_PER_IMAGE = 20;
const GRID_TITLE_BG = "#4c1d95";
const GRID_HEAD_BG = "#6d28d9";
const GRID_LINE = "#374151";
const GRID_TEXT = "#111827";
const GRID_FONT_FAMILY = "system-ui, 'Segoe UI', Tahoma, sans-serif";
// «خلي الخط بولد علشان يبقي واضح» (المالك ٨ أكتوبر ٢٠٢٦) — كل الخانات عريضة، والمكرر بيتميّز باللون
const G_CELL_FONT = `bold 30px ${GRID_FONT_FAMILY}`;
const G_BOLD_FONT = `bold 30px ${GRID_FONT_FAMILY}`;
const G_PLATE_FONT = `bold 34px ${GRID_FONT_FAMILY}`;
const G_HEAD_FONT = `bold 30px ${GRID_FONT_FAMILY}`;
const G_LINE_H = 42;
const G_CELL_PAD = 14;
const G_MIN_COL_W = 110;
const G_MAX_COL_W = 250;

/**
 * 🎨 ٢٠ لون (الكتابة الغامقة مقروءة عليهم). **أول ١٠ = ١٠ عيلات ألوان مختلفة خالص** (أصفر · أزرق · أخضر ·
 * بمبي · برتقالي · سماوي · أحمر · بنفسجي · ليموني · بيج) — والـ١٠ اللي بعدهم درجة تانية من نفس العيلات بنفس
 * الترتيب، فاللونين من عيلة واحدة بينهم ١٠ مجموعات. المالك: «المكرر كل لوحات مكررة تاخد لون مختلف عن لوحات
 * مكررة تاني اللون يبقي مختلف تماما».
 */
export const GRID_DUP_PALETTE = [
  "#FDE68A", "#93C5FD", "#86EFAC", "#F9A8D4", "#FDBA74", "#67E8F9", "#FCA5A5", "#C4B5FD", "#D9F99D", "#E7D3B8",
  "#FDE047", "#BAE6FD", "#A7F3D0", "#FECDD3", "#FED7AA", "#99F6E4", "#FECACA", "#E9D5FF", "#BEF264", "#CBD5E1",
] as const;

/**
 * لون كل صف في **صورة واحدة**: أول مجموعة تظهر تاخد أول لون، والتانية التاني… ونفس المجموعة نفس اللون.
 * الصورة فيها ٢٠ صف بالكتير و`GRID_DUP_PALETTE` ٢٠ لون ⇒ مجموعتين في نفس الصورة عمرهم ما يتشابهوا.
 */
export function gridGroupColors(groups: readonly (string | null | undefined)[]): (string | null)[] {
  const idx = new Map<string, number>();
  return groups.map((g) => {
    if (!g) return null;
    if (!idx.has(g)) idx.set(g, idx.size);
    return GRID_DUP_PALETTE[idx.get(g)! % GRID_DUP_PALETTE.length];
  });
}

/**
 * بدايات الصور (فهارس الصفوف) — صورة جديدة لما الصورة الحالية توصل `maxRows` صف أو ارتفاعها يعدّي
 * `maxBodyH` (حد الآيفون). **نفس الدالة للعدّ قبل المشاركة وللرسم** — فالرقم اللي المندوب بيشوفه هو اللي بيطلع.
 */
export function chunkTableRows(rowHeights: readonly number[], maxBodyH: number, maxRows: number): number[] {
  const starts = [0];
  let count = 0;
  let curH = 0;
  for (let i = 0; i < rowHeights.length; i++) {
    const h = rowHeights[i];
    if (count && (curH + h > maxBodyH || count >= maxRows)) {
      starts.push(i);
      count = 0; curH = 0;
    }
    count++;
    curH += h;
  }
  return starts;
}

/** «57 لوحة ⇐ هيطلعوا في 3 صور — كل صورة فيها 20 لوحة بتفاصيلها (الأخيرة 17)» — بيتعرض تحت «إرسال كصورة». */
export function imagePlanText(total: number, starts: readonly number[]): string {
  const n = Math.max(1, starts.length);
  if (n === 1) return `${total} لوحة ⇐ هيطلعوا في صورة واحدة بتفاصيلها`;
  const sizes = starts.map((st, i) => (i + 1 < starts.length ? starts[i + 1] : total) - st);
  const head = sizes.slice(0, -1);
  const last = sizes[sizes.length - 1];
  const imgs = n === 2 ? "صورتين" : n <= 10 ? `${n} صور` : `${n} صورة`;
  const even = head.every((x) => x === head[0]) && head[0] === GRID_PER_IMAGE;
  if (!even) return `${total} لوحة ⇐ هيطلعوا في ${imgs} — كل صورة فيها لحد ${Math.max(...sizes)} لوحة بتفاصيلها`;
  return `${total} لوحة ⇐ هيطلعوا في ${imgs} — كل صورة فيها ${GRID_PER_IMAGE} لوحة بتفاصيلها`
    + (last < GRID_PER_IMAGE ? ` (الأخيرة ${last})` : "");
}

// خطوط أكبر عشان بيانات اللوحة تبقى واضحة للمندوب في الصورة المشاركة (كانت
// صغيرة). العرض الأقصى للعمود بيتزاد شوية بس عشان الصورة ماتتوسّعش أكتر من
// اللازم — فالخط أكبر نسبةً للصورة (أوضح حتى في معاينة واتساب قبل الزوم).
const T_PAD = 22;
const T_CELL_PAD = 13;
const T_LINE_H = 46;
const T_MAX_COL_W = 200;   // النص يلفّ بدل ما الصورة تتوسّع، فالخط أكبر نسبةً للصورة
const T_MIN_COL_W = 92;
const T_TITLE_H = 88;
const T_SUB_H = 42;
const T_CELL_FONT = "34px system-ui, 'Segoe UI', Tahoma, sans-serif";
const T_HEAD_FONT = "bold 33px system-ui, 'Segoe UI', Tahoma, sans-serif";

// كثافة رسم الكانفاس (بيتضاعف بيها العرض والارتفاع بالبكسل).
// كثافة رسم أقل (١.٥ بدل ٢) = صورة أخف فبتشيل صفوف أكتر قبل ما توصل حد آيفون،
// **من غير ما حجم الخط يتغيّر** (الكثافة بتأثّر على حدّة البكسل وقت الزوم بس،
// مش على شكل الخط نسبةً للصورة). فالمندوب بيلاقي لوحات أكتر في الصورة الواحدة.
const T_SCALE = 1.5;
// حدود كانفاس آيفون/iOS Safari: فوق ~١٦.٧ مليون بكسل مساحة (أو بُعد كبير جداً)
// بيرجّع صورة **فاضية** فالمشاركة بتفشل. بنقصّ كل صورة تحت الحدود دي بأمان —
// لما الخط كبر (نسخ أحدث) الصورة بـ٢٨ صف بقت تعدّي الحد على آيفون فمابتتشاركش.
const IOS_MAX_CANVAS_AREA = 14_000_000; // بكسل² (هامش أمان تحت حد آيفون ~١٦.٧M)
const IOS_MAX_CANVAS_DIM = 8192;        // أقصى بُعد بالبكسل

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
  const scale = T_SCALE;
  canvas.width = Math.ceil(totalW * scale);
  canvas.height = Math.ceil(height * scale);
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
  ctx.font = "bold 38px system-ui, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(opts.title, T_PAD + tableW, T_TITLE_H / 2);
  if (opts.subtitle) {
    ctx.font = "22px system-ui, 'Segoe UI', Tahoma, sans-serif";
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
      ctx.font = ci === 0 ? "bold 37px system-ui, 'Segoe UI', Tahoma, sans-serif" : T_CELL_FONT;
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
  ctx.font = "22px system-ui, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(pageInfo, T_PAD + tableW, height - FOOTER_H / 2);

  return canvas.toDataURL("image/png");
}

export interface TablePlan {
  /** الخيارات بعد شيل الأعمدة الفاضية تماماً. */
  opts: TableImageOptions;
  colW: number[];
  tableW: number;
  /** بدايات الصور (`chunkTableRows`). */
  starts: number[];
}

/**
 * يقيس الجدول ويقرّر التقسيم **من غير ما يرسم** — بيستخدمه الرسم، وبيستخدمه زر المشاركة عشان يقول للمندوب
 * «هيطلعوا في كام صورة» قبل ما يدوس.
 */
export function planTableImages(opts: TableImageOptions): TablePlan {
  const grid = opts.style === "grid";
  const cellFont = grid ? G_CELL_FONT : T_CELL_FONT;
  const headFont = grid ? G_HEAD_FONT : T_HEAD_FONT;
  const cellPad = grid ? G_CELL_PAD : T_CELL_PAD;
  const lineH = grid ? G_LINE_H : T_LINE_H;
  const minW = grid ? G_MIN_COL_W : T_MIN_COL_W;
  const maxW = grid ? G_MAX_COL_W : T_MAX_COL_W;
  // نشيل الأعمدة الفاضية تماماً (كل خاناتها فاضية) — بتاخد عرض من غير أي فايدة
  // وبتصغّر الخط بالنسبة للصورة. العمود اللي فيه أي قيمة بيفضل.
  const keep = opts.columns.map((_, ci) => opts.rows.some((r) => String(r[ci] ?? "").trim() !== ""));
  if (keep.some((k) => !k)) {
    opts = {
      ...opts,
      columns: opts.columns.filter((_, ci) => keep[ci]),
      rows: opts.rows.map((r) => r.filter((_, ci) => keep[ci])),
    };
  }
  // عرض كل عمود = أعرض محتوى فيه (رأس أو خانة) محصور بين حد أدنى وأقصى.
  const measure = document.createElement("canvas").getContext("2d")!;
  const colW = opts.columns.map((h, ci) => {
    measure.font = headFont;
    let w = measure.measureText(h).width;
    measure.font = grid && ci === 0 ? G_PLATE_FONT : grid ? G_BOLD_FONT : cellFont;
    for (const row of opts.rows) w = Math.max(w, measure.measureText(String(row[ci] ?? "")).width);
    return Math.min(maxW, Math.max(minW, Math.ceil(w) + cellPad * 2));
  });
  const tableW = colW.reduce((a, b) => a + b, 0);
  const totalW = tableW + T_PAD * 2;

  // ── تقسيم آمن على آيفون: بنقيس ارتفاع كل صف ونعبّي الصور بحيث كل كانفاس يفضل
  //    تحت حدود iOS (مساحة/بُعد) — وإلا آيفون بيرجّع صورة فاضية.
  const innerW = colW.map((w) => w - cellPad * 2);
  measure.font = headFont;
  const headH = cellPad * 2 + Math.max(1, ...opts.columns.map((h, ci) => wrapText(measure, h, innerW[ci]).length)) * lineH;
  measure.font = cellFont;
  const rowHeights = opts.rows.map((row) =>
    cellPad * 2 + Math.max(1, ...opts.columns.map((_, ci) => wrapText(measure, String(row[ci] ?? ""), innerW[ci]).length)) * lineH,
  );
  const titleH = T_TITLE_H + (opts.subtitle ? T_SUB_H : 0);
  const overhead = titleH + headH + FOOTER_H;
  // أقصى ارتفاع كانفاس (بكسل) يفضل تحت حدّ المساحة وحدّ البُعد على آيفون.
  const maxCanvasH = Math.min(IOS_MAX_CANVAS_DIM, Math.floor(IOS_MAX_CANVAS_AREA / (totalW * T_SCALE)));
  // أقصى ارتفاع صفوف (bodyH) لكل صورة بالوحدات المنطقية.
  const maxBodyH = Math.max(1, Math.floor(maxCanvasH / T_SCALE) - overhead);
  // احترام perImage لو المستخدم حدّده؛ «grid» = ٢٠؛ وإلا بلا سقف عددي.
  const maxRows = opts.perImage && opts.perImage > 0 ? opts.perImage : grid ? GRID_PER_IMAGE : Infinity;
  return { opts, colW, tableW, starts: chunkTableRows(rowHeights, maxBodyH, maxRows) };
}

/** يرسم النتائج كجدول (زي شيت إكسيل) — صورة واحدة أو أكتر حسب عدد الصفوف. */
export function renderTableImages(opts: TableImageOptions): string[] {
  const plan = planTableImages(opts);
  const o = plan.opts;
  const total = plan.starts.length;
  return plan.starts.map((st, idx) => {
    const end = idx + 1 < total ? plan.starts[idx + 1] : o.rows.length;
    const chunk = o.rows.slice(st, end);
    const colors = (o.rowColors ?? []).slice(st, end).concat(Array(Math.max(0, chunk.length - (o.rowColors ?? []).slice(st, end).length)).fill(null));
    if (o.style === "grid") {
      // 🎨 الألوان من جوّه الصورة نفسها لو المجموعات موجودة — وإلا ألوان الشاشة زي ما هي
      const gridColors = o.rowGroups ? gridGroupColors(o.rowGroups.slice(st, end)) : colors;
      const pageInfo = total > 1
        ? `صورة ${idx + 1} من ${total} · اللوحات ${st + 1}–${end} من ${o.rows.length}`
        : `${o.rows.length} لوحة`;
      return renderGridChunk(chunk, o, plan.colW, plan.tableW, pageInfo, gridColors);
    }
    const pageInfo = total > 1
      ? `صفحة ${idx + 1} من ${total} · ${o.rows.length} لوحة`
      : `${o.rows.length} لوحة`;
    return renderTableChunk(chunk, o, plan.colW, plan.tableW, pageInfo, colors);
  });
}

/**
 * 🖼️ صورة «grid» — جدول مرتب زي صورة المنافس: عناوين بنفسجي بكتابة بيضا، الكلام في نص الخانة، خطوط
 * غامقة، المكرر بلون مجموعته (نفس لون الشاشة) وبخط عريض، واللوحة (العمود الأول) عريضة دايماً.
 */
function renderGridChunk(
  rows: string[][], opts: TableImageOptions, colW: number[], tableW: number, pageInfo: string,
  rowColors: (string | null)[],
): string {
  const totalW = tableW + T_PAD * 2;
  const innerW = colW.map((w) => w - G_CELL_PAD * 2);
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = G_HEAD_FONT;
  const headLines = opts.columns.map((h, ci) => wrapText(measure, h, innerW[ci]));
  const headH = G_CELL_PAD * 2 + Math.max(1, ...headLines.map((l) => l.length)) * G_LINE_H;
  measure.font = G_CELL_FONT;
  const cellLines = rows.map((row) => opts.columns.map((_, ci) => wrapText(measure, String(row[ci] ?? ""), innerW[ci])));
  const rowH = cellLines.map((cells) => G_CELL_PAD * 2 + Math.max(1, ...cells.map((l) => l.length)) * G_LINE_H);

  const titleBlock = T_TITLE_H + (opts.subtitle ? T_SUB_H : 0);
  const bodyH = rowH.reduce((a, b) => a + b, 0);
  const height = titleBlock + headH + bodyH + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(totalW * T_SCALE);
  canvas.height = Math.ceil(height * T_SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(T_SCALE, T_SCALE);
  ctx.textBaseline = "middle";
  (ctx as CanvasRenderingContext2D & { direction: string }).direction = "rtl";

  // حواف الأعمدة (RTL: العمود ٠ أقصى اليمين) ونصّها.
  const colRight: number[] = [];
  let xr = T_PAD + tableW;
  for (let ci = 0; ci < colW.length; ci++) { colRight[ci] = xr; xr -= colW[ci]; }
  const colMid = colW.map((w, ci) => colRight[ci] - w / 2);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, totalW, height);

  // العنوان + التاريخ
  ctx.fillStyle = GRID_TITLE_BG;
  ctx.fillRect(0, 0, totalW, titleBlock);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.font = `bold 38px ${GRID_FONT_FAMILY}`;
  ctx.fillText(opts.title, T_PAD + tableW, T_TITLE_H / 2);
  if (opts.subtitle) {
    ctx.font = `22px ${GRID_FONT_FAMILY}`;
    ctx.fillText(opts.subtitle, T_PAD + tableW, T_TITLE_H + T_SUB_H / 2 - 2);
  }

  // صف العناوين — بنفسجي بكتابة بيضا في النص
  let y = titleBlock;
  ctx.fillStyle = GRID_HEAD_BG;
  ctx.fillRect(T_PAD, y, tableW, headH);
  ctx.fillStyle = "#ffffff";
  ctx.font = G_HEAD_FONT;
  ctx.textAlign = "center";
  opts.columns.forEach((_, ci) => {
    const lines = headLines[ci];
    let ly = y + headH / 2 - ((lines.length - 1) * G_LINE_H) / 2;
    for (const line of lines) { ctx.fillText(line, colMid[ci], ly); ly += G_LINE_H; }
  });
  y += headH;

  // الصفوف — المكرر بلون مجموعته وبخط عريض، والباقي أبيض عادي
  rows.forEach((row, i) => {
    const h = rowH[i];
    const dup = rowColors[i];
    if (dup) { ctx.fillStyle = dup; ctx.fillRect(T_PAD, y, tableW, h); }
    row.forEach((_, ci) => {
      ctx.font = ci === 0 ? G_PLATE_FONT : dup ? G_BOLD_FONT : G_CELL_FONT;
      ctx.fillStyle = GRID_TEXT;
      const lines = cellLines[i][ci];
      let ly = y + h / 2 - ((lines.length - 1) * G_LINE_H) / 2;
      for (const line of lines) { ctx.fillText(line, colMid[ci], ly); ly += G_LINE_H; }
    });
    y += h;
  });

  // خطوط الجدول — غامقة، وإطار حوالين الجدول كله
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = 1.5;
  const top = titleBlock;
  const bottom = titleBlock + headH + bodyH;
  let hy = titleBlock + headH;
  ctx.beginPath(); ctx.moveTo(T_PAD, hy); ctx.lineTo(T_PAD + tableW, hy); ctx.stroke();
  for (const h of rowH) { hy += h; ctx.beginPath(); ctx.moveTo(T_PAD, hy); ctx.lineTo(T_PAD + tableW, hy); ctx.stroke(); }
  for (let ci = 0; ci <= colW.length; ci++) {
    const x = ci < colW.length ? colRight[ci] : T_PAD;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(T_PAD, top); ctx.lineTo(T_PAD + tableW, top); ctx.stroke();

  // الفوتر
  ctx.fillStyle = COL.footer;
  ctx.textAlign = "right";
  ctx.font = `22px ${GRID_FONT_FAMILY}`;
  ctx.fillText(pageInfo, T_PAD + tableW, height - FOOTER_H / 2);

  return canvas.toDataURL("image/png");
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
