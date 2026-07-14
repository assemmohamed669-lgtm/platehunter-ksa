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
    const dLines = wrapText(measure, detailText(r.details), detailMaxW);
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
    const dLines = wrapText(ctx, detailText(r.details), WIDTH - PAD * 2);
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

/** ينزّل صورة data URL باسم معيّن (ويب/موبايل عبر رابط تنزيل). */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
