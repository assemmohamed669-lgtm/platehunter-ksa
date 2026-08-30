/**
 * قراءة workbook بأي صيغة يفهمها SheetJS (xlsx / **xlsb** / xls / ods) وتحويلها
 * لـ{headers, rows} — منطق **مشترك** بين xlsxWorker (القارئ العام) و
 * dataImportWorker (استيراد الداتا الكبيرة). نفس اكتشاف الورقة/صف العناوين/
 * الأعمدة بلا عناوين/الهايبرلينك بالظبط، فمصدر واحد ومفيش تكرار يتفرّع.
 *
 * ليه مشترك: مربّع الإحالة كان بيقرا أي صيغة (عبر xlsxWorker في worker معزول)،
 * لكن مربّع الداتا كان لازم xlsx للقراءة على دفعات، والاحتياطي (SheetJS) كان
 * بيتنفّذ على **الخيط الرئيسي** فبيتقفل بسقف حجم على آيفون. دلوقتي dataImportWorker
 * بيستخدم نفس الدالة دي **جوّه الـworker** (ذاكرة معزولة) ويكتب الصفوف على الجهاز —
 * فأي صيغة وأي حجم بيتقري من غير ما يلمس الخيط الرئيسي.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";
import { detectHeaderless, buildHeaderlessColumns } from "./headerlessColumns";
import { resolveHyperlinkCells } from "./hyperlink";
import { trimSheetToData } from "./xlsxRange";

// خلية → نص. خلايا التاريخ (cellDates:true) تيجي Date — نفرمتها dd/mm/yyyy بدل
// الرقم التسلسلي بتاع Excel. أي قيمة تانية تفضل زي ما هي.
export function cellToStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${v.getFullYear()}`;
  }
  return String(v);
}

function cellLooksLikePlate(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-_.ـ/]/g, "");
  if (cleaned.length < 2 || cleaned.length > 10) return false;
  const digitMatch = cleaned.match(/[0-9٠-٩]+/);
  if (!digitMatch) return false;
  if (digitMatch[0].length < 3 || digitMatch[0].length > 4) return false;
  const nonDigits = cleaned.replace(/[0-9٠-٩]/g, "");
  if (nonDigits.length === 0 || nonDigits.length > 3) return false;
  if (!/^[؀-ۿa-zA-Z]+$/.test(nonDigits)) return false;
  return true;
}

/** يعدّ اللوحات الفعلية في أفضل عمود بالورقة — لاختيار ورقة الداتا في ملف متعدد. */
export function countPlatesInBestColumn(raw2d: any[][]): number {
  if (raw2d.length < 2) return 0;
  const numCols = Math.max(...raw2d.slice(0, 5).map((r) => (r as any[])?.length ?? 0), 0);
  const sampleN = Math.min(raw2d.length, 201);
  let bestCol = -1, bestRatio = 0;
  for (let col = 0; col < numCols; col++) {
    let plateLike = 0, nonEmpty = 0;
    for (let i = 1; i < sampleN; i++) {
      const raw = String((raw2d[i] as any[])?.[col] ?? "").trim();
      if (!raw) continue;
      nonEmpty++;
      if (cellLooksLikePlate(raw)) plateLike++;
    }
    if (nonEmpty === 0) continue;
    const ratio = plateLike / nonEmpty;
    if (ratio > bestRatio) { bestRatio = ratio; bestCol = col; }
  }
  if (bestCol < 0 || bestRatio < 0.3) return 0;
  let count = 0;
  for (let i = 1; i < raw2d.length; i++) {
    const raw = String((raw2d[i] as any[])?.[bestCol] ?? "").trim();
    if (raw && cellLooksLikePlate(raw)) count++;
  }
  return count;
}

export interface WorkbookTable {
  headers: string[];
  rows: Record<string, string>[];
  sheetName: string;
  allSheetNames: string[];
}

/**
 * يقرا workbook (أي صيغة) ويطلّع {headers, rows, sheetName, allSheetNames}.
 * بيرمي Error لو الملف فارغ/محمي/متعذّر قراءته. **لا** postMessage — دالة نقية
 * يستدعيها أي worker. (مستخرجة حرفياً من منطق xlsxWorker القديم.)
 */
export function parseWorkbookViaXlsx(
  data: Uint8Array,
  opts: { password?: string; forcedSheet?: string } = {},
): WorkbookTable {
  const { password, forcedSheet } = opts;

  // Pass 1: read sheet names only (fast).
  let sheetName: string | undefined;
  let allSheetNames: string[] = [];
  try {
    const wbMeta = XLSX.read(data, { type: "array", bookSheets: true });
    allSheetNames = wbMeta.SheetNames;
  } catch { /* محمي — نكتشف بعد القراءة الكاملة */ }

  if (forcedSheet && allSheetNames.includes(forcedSheet)) sheetName = forcedSheet;

  // Pass 1.5 (multi-sheet): اختر الورقة صاحبة أكبر عدد لوحات، وإلا اسم الهيدر.
  const PLATE_DET_KWS = ["لوحة", "اللوحة", "plate"];
  if (!sheetName && allSheetNames.length > 1) {
    let bestCount = 0, bestName: string | undefined;
    for (const name of allSheetNames) {
      try {
        const scanOpts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [name] };
        (scanOpts as Record<string, unknown>).dense = true;
        if (password) (scanOpts as Record<string, unknown>).password = password;
        const wbScan = XLSX.read(data, scanOpts);
        const wsScan = wbScan.Sheets[name];
        if (!wsScan) continue;
        trimSheetToData(wsScan);
        const scanRows = XLSX.utils.sheet_to_json<any[]>(wsScan, { header: 1, raw: false, defval: null });
        if (scanRows.length < 2) continue;
        const count = countPlatesInBestColumn(scanRows);
        if (count > bestCount) { bestCount = count; bestName = name; }
      } catch { continue; }
    }
    if (bestCount > 0) sheetName = bestName;
    if (!sheetName) {
      for (const name of allSheetNames) {
        try {
          const scanOpts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [name] };
          (scanOpts as Record<string, unknown>).dense = true;
          if (password) (scanOpts as Record<string, unknown>).password = password;
          const wbScan = XLSX.read(data, scanOpts);
          const wsScan = wbScan.Sheets[name];
          if (!wsScan) continue;
          trimSheetToData(wsScan);
          const scanRows = XLSX.utils.sheet_to_json<any[]>(wsScan, { header: 1, raw: false });
          const hasPlate = scanRows.slice(0, 20).some((row: any[]) =>
            row.some((c: any) => {
              const v = String(c ?? "").trim().toLowerCase();
              return PLATE_DET_KWS.some((k) => v.includes(k));
            }));
          if (hasPlate) { sheetName = name; break; }
        } catch { continue; }
      }
      if (!sheetName && bestName) sheetName = bestName;
    }
  }
  sheetName = sheetName ?? allSheetNames[0];

  // Pass 2: parse only the target sheet.
  const parseOpts: XLSX.ParsingOptions = {
    type: "array", raw: true, cellDates: true, cellStyles: false, sheetStubs: false,
  };
  (parseOpts as Record<string, unknown>).dense = true;
  if (password) (parseOpts as Record<string, unknown>).password = password;
  if (sheetName) (parseOpts as Record<string, unknown>).sheets = [sheetName];

  const wb = XLSX.read(data, parseOpts);
  const finalSheet = sheetName ?? wb.SheetNames[0];
  const ws = wb.Sheets[finalSheet];
  trimSheetToData(ws);
  resolveHyperlinkCells(ws);

  const raw2d = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
  if (raw2d.length === 0) throw new Error("الملف فارغ أو لا يحتوي على بيانات.");

  const EXACT_PLATE_COLS = ["plate number", "the plate number in arabic", "رقم اللوحة", "رقم اللوحة عربي"];
  const PLATE_KWS = ["لوحة", "اللوحة", "لوحه", "plate"];

  let headerRowIdx = -1;
  const HDR_SCAN = Math.min(raw2d.length, 50);
  for (let ri = 0; ri < HDR_SCAN; ri++) {
    const cells = raw2d[ri] as any[];
    if (cells.some((c: any) => EXACT_PLATE_COLS.includes(String(c ?? "").trim().toLowerCase()))) { headerRowIdx = ri; break; }
  }
  if (headerRowIdx < 0) {
    let bestKwRow = -1, bestKwScore = 0, bestKwNonEmpty = -1;
    let bestDenseRow = 0, bestDenseCount = 0;
    const DENSE_SCAN = Math.min(raw2d.length, 50);
    for (let ri = 0; ri < DENSE_SCAN; ri++) {
      const cells = raw2d[ri] as any[];
      const nonEmpty = cells.filter((c: any) => String(c ?? "").trim()).length;
      if (nonEmpty > bestDenseCount) { bestDenseCount = nonEmpty; bestDenseRow = ri; }
      let kwScore = 0;
      for (const c of cells) {
        const v = String(c ?? "").trim();
        if (v.length > 0 && v.length < 50 && PLATE_KWS.some((k) => v.toLowerCase().includes(k))) kwScore++;
      }
      if (kwScore > bestKwScore || (kwScore > 0 && kwScore === bestKwScore && nonEmpty > bestKwNonEmpty)) {
        bestKwScore = kwScore; bestKwNonEmpty = nonEmpty; bestKwRow = ri;
      }
    }
    headerRowIdx = (bestKwRow >= 0 && bestKwScore > 0) ? bestKwRow : bestDenseRow;
  }

  const rawHeaderCells = (raw2d[headerRowIdx] as any[]).map((h: any) => cellToStr(h).trim());
  let headerCols: Array<{ name: string; col: number }>;
  let dataStartRow: number;
  if (detectHeaderless(rawHeaderCells)) {
    headerCols = buildHeaderlessColumns(raw2d as any[][], headerRowIdx, cellToStr);
    dataStartRow = headerRowIdx;
  } else {
    headerCols = [];
    rawHeaderCells.forEach((name, col) => { if (name) headerCols.push({ name, col }); });
    dataStartRow = headerRowIdx + 1;
  }
  const headers = headerCols.map((hc) => hc.name);
  if (headers.length === 0) throw new Error("الملف فارغ أو لا يحتوي على بيانات.");

  const rows: Record<string, string>[] = [];
  for (let i = dataStartRow; i < raw2d.length; i++) {
    const r = raw2d[i] as any[];
    const obj: Record<string, string> = {};
    for (const { name, col } of headerCols) obj[name] = cellToStr(r[col]);
    rows.push(obj);
  }

  return { headers, rows, sheetName: finalSheet, allSheetNames };
}
