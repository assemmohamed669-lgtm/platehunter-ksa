/**
 * Excel export for PlateHunter KSA.
 * Exports field recordings to .xlsx with the exact 6 columns from the spec.
 * Uses SheetJS (xlsx) — already in package.json.
 */

import * as XLSX from "xlsx";
import type ExcelJS from "exceljs";
import type { RecordingEntry } from "./idb";
import { detectPlateColumnByContent } from "./plateParser";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

export function exportRecordingsToExcel(
  recordings: RecordingEntry[],
  filename = "platehunter-export"
) {
  const rows = recordings
    .filter((r) => !r.plate.startsWith("📍"))
    .map((r) => {
      const gpsLink = r.mapsLink ?? "";
      const coords = r.lat && r.lng ? `${r.lat},${r.lng}` : "";
      return {
        "رقم اللوحة": r.plate,
        "GPS": gpsLink,
        "تاريخ التسجيل": formatDate(r.recordedAt),
        "الحي": r.district ?? "",
        "الشارع": r.street ?? "",
        "ملاحظات": r.notes ?? "",
        "نوع السيارة": r.vehicleType ?? "",
        "اسم المسجّل": r.recorderName ?? "",
        "موقع الشارع": coords,
      };
    });

  if (rows.length === 0) {
    alert("لا توجد بيانات للتصدير.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 14 }, // رقم اللوحة
    { wch: 55 }, // GPS
    { wch: 22 }, // تاريخ التسجيل
    { wch: 18 }, // الحي
    { wch: 26 }, // الشارع
    { wch: 30 }, // ملاحظات
    { wch: 14 }, // نوع السيارة
    { wch: 18 }, // اسم المسجّل
    { wch: 26 }, // موقع الشارع
  ];

  // GPS column as clickable hyperlinks
  rows.forEach((row, i) => {
    const cellRef = `B${i + 2}`;
    if (ws[cellRef] && row["GPS"]) {
      ws[cellRef].l = { Target: row["GPS"], Tooltip: "فتح في الخريطة" };
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "اللوحات");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Read a bank Excel file and return an array of raw plate strings.
 * Tries to auto-detect the column containing plate numbers.
 */
export function readBankExcel(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames.find((n) => n.trim() === "تشييك") ?? wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        
        // تعديل: استخراج البيانات كمصفوفة من المصفوفات
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
        }) as any[][];

        const plates: string[] = [];
        for (const row of rows) {
          // استخدام Object.values أو التكرار المباشر على المصفوفة لتجنب خطأ الـ Type
          for (const cell of row) {
            const val = String(cell ?? "").trim();
            if (val && val.length >= 4) plates.push(val);
          }
        }
        resolve(plates);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export interface ExcelTable {
  headers: string[];
  rows: Record<string, string>[];
  sheetName?: string;
  allSheetNames?: string[];
}

/**
 * يفكّ تشفير ملف محمي بكلمة مرور على السيرفر (SheetJS المجانية لا تفكّ التشفير).
 * يعيد File بعد فك التشفير — جاهز للقراءة المحلية بدون باسوورد.
 */
async function decryptViaServer(file: File, password: string): Promise<File> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("password", password);
  let res: Response;
  try {
    res = await fetch("/api/excel/decrypt", { method: "POST", body: fd });
  } catch {
    throw new Error("تعذّر الاتصال بالخادم لفك تشفير الملف — تأكد من الإنترنت.");
  }
  if (res.status === 401) throw new Error("كلمة مرور الملف غير صحيحة.");
  if (!res.ok) throw new Error("تعذّر فك تشفير الملف — قد يكون محمياً بكلمة مرور.");
  const buf = await res.arrayBuffer();
  return new File([buf], file.name, { type: file.type });
}

export async function parseExcelFile(file: File, password?: string, forcedSheet?: string): Promise<ExcelTable> {
  // ملف محمي: نفكّ تشفيره على السيرفر أولاً ثم نقرأ النسخة المفكوكة محلياً
  // (بدون تمرير الباسوورد للقارئ لأن الملف بقى غير مشفّر).
  const workFile = password ? await decryptViaServer(file, password) : file;
  const buffer = await workFile.arrayBuffer();

  // Try Web Worker first — parsing runs off the main thread so the UI stays responsive
  if (typeof Worker !== "undefined") {
    try {
      const result = await new Promise<ExcelTable>((resolve, reject) => {
        let worker: Worker;
        try {
          worker = new Worker(new URL("./xlsxWorker.ts", import.meta.url));
        } catch {
          reject(new Error("__WORKER_UNAVAILABLE__"));
          return;
        }

        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error("__WORKER_UNAVAILABLE__"));
        }, 120_000);

        worker.onmessage = (e: MessageEvent) => {
          clearTimeout(timer);
          worker.terminate();
          const d = e.data as {
            success: boolean;
            headers?: string[];
            rows?: Record<string, string>[];
            sheetName?: string;
            allSheetNames?: string[];
            error?: string;
          };
          if (d.success && d.headers && d.rows) {
            if (d.rows.length === 0) {
              reject(new Error("الملف فارغ أو لا يحتوي على بيانات."));
            } else {
              resolve({ headers: d.headers, rows: d.rows, sheetName: d.sheetName, allSheetNames: d.allSheetNames });
            }
          } else {
            reject(new Error(d.error ?? "تعذّرت قراءة الملف."));
          }
        };

        worker.onerror = () => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error("__WORKER_UNAVAILABLE__"));
        };

        // No transfer — keep buffer available for the sync fallback.
        // الباسوورد مش بيتمرّر: الملف اتفك تشفيره بالفعل قبل هنا لو كان محمي.
        worker.postMessage({ buffer, forcedSheet });
      });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      // Only fall through on worker init/communication failures; re-throw real parse errors
      if (msg !== "__WORKER_UNAVAILABLE__") throw err;
    }
  }

  // Synchronous fallback (main-thread; may briefly freeze UI on very large files)
  return _parseExcelSync(new Uint8Array(buffer));
}

const PLATE_DETECT_KWS = ["لوحة", "اللوحة", "plate"];

function _cellLooksLikePlate(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-_.ـ/]/g, "");
  if (cleaned.length < 2 || cleaned.length > 10) return false;
  const digitMatch = cleaned.match(/[0-9٠-٩]+/);
  if (!digitMatch || digitMatch[0].length < 3 || digitMatch[0].length > 4) return false;
  const nonDigits = cleaned.replace(/[0-9٠-٩]/g, "");
  return nonDigits.length > 0 && nonDigits.length <= 3 && /^[؀-ۿa-zA-Z]+$/.test(nonDigits);
}

// يعدّ اللوحات الفعلية في أفضل عمود للورقة (عدد مش نسبة) — الورقة صاحبة أكبر
// عدد لوحات تكسب، عشان ملف بورقات كتير يشتغل على أكبر داتا فيها.
function _sheetPlateCount(data: Uint8Array, sheetName: string, password?: string): number {
  try {
    const opts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [sheetName] };
    (opts as Record<string, unknown>).dense = true;
    if (password) (opts as Record<string, unknown>).password = password;
    const wb = XLSX.read(data, opts);
    const ws = wb.Sheets[sheetName];
    if (!ws) return 0;

    const raw2d = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null });
    if (raw2d.length < 2) return 0;

    const numCols = Math.max(...(raw2d.slice(0, 5) as unknown[][]).map((r) => (r as unknown[]).length), 0);
    const sampleN = Math.min(raw2d.length, 201);

    let bestCol = -1, bestRatio = 0;
    for (let col = 0; col < numCols; col++) {
      let plateLike = 0, nonEmpty = 0;
      for (let i = 1; i < sampleN; i++) {
        const raw = String((raw2d[i] as unknown[])?.[col] ?? "").trim();
        if (!raw) continue;
        nonEmpty++;
        if (_cellLooksLikePlate(raw)) plateLike++;
      }
      if (nonEmpty === 0) continue;
      const ratio = plateLike / nonEmpty;
      if (ratio > bestRatio) { bestRatio = ratio; bestCol = col; }
    }
    if (bestCol < 0 || bestRatio < 0.3) return 0;

    let count = 0;
    for (let i = 1; i < raw2d.length; i++) {
      const raw = String((raw2d[i] as unknown[])?.[bestCol] ?? "").trim();
      if (raw && _cellLooksLikePlate(raw)) count++;
    }
    return count;
  } catch { return 0; }
}

// يبقى احتياطي قديم لو فشل اكتشاف المحتوى تماماً (ملفات غريبة الشكل)
function _sheetHasPlateCol(data: Uint8Array, sheetName: string, password?: string): boolean {
  try {
    const opts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [sheetName] };
    (opts as Record<string, unknown>).dense = true;
    if (password) (opts as Record<string, unknown>).password = password;
    const wb = XLSX.read(data, opts);
    const ws = wb.Sheets[sheetName];
    if (!ws) return false;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false });
    return rows.slice(0, 20).some((row) =>
      (row as unknown[]).some((c) => {
        const v = String(c ?? "").trim().toLowerCase();
        return PLATE_DETECT_KWS.some((k) => v.includes(k));
      })
    );
  } catch { return false; }
}

function _parseExcelSync(data: Uint8Array, password?: string): ExcelTable {
  let sheetName: string | undefined;
  let allSheetNames: string[] = [];
  try {
    const wbMeta = XLSX.read(data, { type: "array", bookSheets: true });
    allSheetNames = wbMeta.SheetNames;
  } catch { /* password-protected */ }

  // Multi-sheet detection: score every sheet by plate-like content and pick
  // the highest. Falls back to keyword header check if no sheet scores >= 0.3.
  if (allSheetNames.length > 1) {
    let bestCount = 0;
    let bestName: string | undefined;
    for (const name of allSheetNames) {
      const count = _sheetPlateCount(data, name, password);
      if (count > bestCount) { bestCount = count; bestName = name; }
    }
    if (bestCount > 0) {
      sheetName = bestName;
    } else {
      for (const name of allSheetNames) {
        if (_sheetHasPlateCol(data, name, password)) { sheetName = name; break; }
      }
      if (!sheetName && bestName) sheetName = bestName;
    }
  }
  sheetName = sheetName ?? allSheetNames[0];

  const opts: XLSX.ParsingOptions = {
    type: "array",
    raw: true,
    cellStyles: false,
    sheetStubs: false,
  };
  // dense mode — faster & far lower memory on huge sheets (see xlsxWorker.ts).
  (opts as Record<string, unknown>).dense = true;
  if (password) (opts as Record<string, unknown>).password = password;
  if (sheetName) (opts as Record<string, unknown>).sheets = [sheetName];

  try {
    const wb = XLSX.read(data, opts);
    const finalSheet = sheetName ?? wb.SheetNames[0];
    const ws = wb.Sheets[finalSheet];

    const raw2d = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    });
    if (raw2d.length === 0) throw new Error("empty");

    // Find the actual header row — skip email/instruction rows above the data table.
    // Pass 1 (exact): row with a known plate column name. Pass 2 (keyword): short cells.
    const EXACT_PLATE_COLS = [
      "plate number",
      "the plate number in arabic",
      "رقم اللوحة",
      "رقم اللوحة عربي",
    ];
    const PLATE_KWS = ["لوحة", "اللوحة", "plate"];
    const SCAN = Math.min(raw2d.length, 600);

    let headerRowIdx = -1;

    // Pass 1: exact match — limited to first 50 rows so a late embedded section
    // (e.g. a second table at row 339) doesn't override the real data start.
    const HDR_SCAN = Math.min(raw2d.length, 50);
    for (let ri = 0; ri < HDR_SCAN; ri++) {
      const cells = raw2d[ri] as unknown[];
      const hasExact = cells.some((c) =>
        EXACT_PLATE_COLS.includes(String(c ?? "").trim().toLowerCase())
      );
      if (hasExact) { headerRowIdx = ri; break; }
    }

    // Pass 2: keyword scoring + dense fallback — both limited to first 50 rows.
    // Scanning beyond the first section risks picking a late embedded table's
    // header (e.g. row 339) and discarding all earlier data rows.
    if (headerRowIdx < 0) {
      let bestKwRow = -1, bestKwScore = 0, bestKwNonEmpty = -1;
      let bestDenseRow = 0, bestDenseCount = 0;
      const DENSE_SCAN = Math.min(raw2d.length, 50);
      for (let ri = 0; ri < DENSE_SCAN; ri++) {
        const cells = raw2d[ri] as unknown[];
        const nonEmpty = cells.filter((c) => String(c ?? "").trim()).length;
        if (nonEmpty > bestDenseCount) { bestDenseCount = nonEmpty; bestDenseRow = ri; }
        let kwScore = 0;
        for (const c of cells) {
          const v = String(c ?? "").trim();
          if (v.length > 0 && v.length < 50 && PLATE_KWS.some((k) => v.toLowerCase().includes(k))) {
            kwScore++;
          }
        }
        if (kwScore > bestKwScore || (kwScore > 0 && kwScore === bestKwScore && nonEmpty > bestKwNonEmpty)) {
          bestKwScore = kwScore; bestKwNonEmpty = nonEmpty; bestKwRow = ri;
        }
      }
      headerRowIdx = (bestKwRow >= 0 && bestKwScore > 0) ? bestKwRow : bestDenseRow;
    }

    // Map each non-empty header to its ACTUAL column position so that empty
    // header columns (merged cells, gaps) don't cause value misalignment.
    const rawHeaderCells = (raw2d[headerRowIdx] as unknown[]).map((h) => String(h ?? "").trim());
    const headerCols: Array<{ name: string; col: number }> = [];
    rawHeaderCells.forEach((name, col) => { if (name) headerCols.push({ name, col }); });
    const headers = headerCols.map((hc) => hc.name);
    if (headers.length === 0) throw new Error("empty");

    // If the "header" row itself looks like plate data (headerless file), include
    // it as the first data row so the first plate isn't silently dropped.
    const nonEmptyHdr = headers.filter((h) => h);
    const isPlateCell = (v: string) => {
      const c = v.replace(/[\s\-_.ـ/]/g, "");
      if (c.length < 2 || c.length > 10) return false;
      const dm = c.match(/[0-9٠-٩]+/);
      if (!dm || dm[0].length > 4) return false;
      const nd = c.replace(/[0-9٠-٩]/g, "");
      return nd.length > 0 && nd.length <= 3 && /^[؀-ۿa-zA-Z]+$/.test(nd);
    };
    const headerIsData =
      nonEmptyHdr.length > 0 &&
      nonEmptyHdr.filter(isPlateCell).length / nonEmptyHdr.length >= 0.5;

    const rows: Record<string, string>[] = [];
    if (headerIsData) {
      const firstRow: Record<string, string> = {};
      const hdrCells = raw2d[headerRowIdx] as unknown[];
      for (const { name, col } of headerCols) firstRow[name] = String(hdrCells[col] ?? "");
      rows.push(firstRow);
    }
    for (let i = headerRowIdx + 1; i < raw2d.length; i++) {
      const r = raw2d[i] as unknown[];
      const obj: Record<string, string> = {};
      for (const { name, col } of headerCols) {
        obj[name] = String(r[col] ?? "");
      }
      rows.push(obj);
    }

    if (rows.length === 0) throw new Error("empty");
    return { headers, rows };
  } catch (err) {
    if (err instanceof Error && err.message === "empty") {
      throw new Error("الملف فارغ أو لا يحتوي على بيانات.");
    }
    throw new Error("تعذّرت قراءة الملف — قد يكون محمياً بكلمة مرور.");
  }
}

export interface WatermarkInfo {
  username: string;
  userId: string;
}

export function buildExcelBlob(
  rows: Record<string, unknown>[],
  sheetName: string,
  watermark?: WatermarkInfo
): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);

  // Make URL cells proper hyperlinks
  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];
        if (cell && typeof cell.v === "string" && /^https?:\/\//i.test(cell.v)) {
          cell.l = { Target: cell.v };
        }
      }
    }
  }

  const wb = XLSX.utils.book_new();

  if (watermark) {
    const stamp = `🔒 صدّر هذا الملف: ${watermark.username} (${watermark.userId}) — ${new Date().toLocaleString("ar-SA")}`;
    wb.Props = {
      ...(wb.Props ?? {}),
      Company: stamp,
      Comments: stamp,
    };
    XLSX.utils.sheet_add_aoa(ws, [[stamp]], { origin: -1 });
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// Pure-JS CSV builder — no SheetJS write path at all, so it can't hit the
// "null.indexOf" crash that XLSX.write throws inside some Android WebViews.
// UTF-8 BOM (﻿) makes Excel read the Arabic text correctly, and Excel
// opens .csv natively into columns. Used as a guaranteed fallback when the
// xlsx build fails on-device.
export function buildCsvBlob(rows: Record<string, unknown>[]): Blob {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Quote if it contains a comma, quote, or newline; double interior quotes.
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ];
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

// Builds the spreadsheet as a real .xlsx, but if XLSX.write throws (a known
// SheetJS failure inside some Android WebViews — "null.indexOf"), falls back
// to a plain CSV that opens in Excel just the same. Returns the extension so
// the caller can name the file correctly.
export function buildSpreadsheetBlob(
  rows: Record<string, unknown>[],
  sheetName: string,
): { blob: Blob; ext: "xlsx" | "csv" } {
  try {
    return { blob: buildExcelBlob(rows, sheetName), ext: "xlsx" };
  } catch {
    return { blob: buildCsvBlob(rows), ext: "csv" };
  }
}

export function downloadExcelBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A native call failing for a REAL reason (FileProvider misconfigured, no
// app installed to open .xlsx, plugin not registered in this APK build) must
// never be confused with "this isn't a native platform" — both used to funnel
// into the same catch-and-ignore, silently falling through to a download
// mechanism (<a download>) that doesn't work inside a Capacitor WebView
// either, so the user saw the button do literally nothing with no way for
// anyone to know why. Callers must catch this and show the real message.
export class NativeExportError extends Error {
  constructor(action: string, cause: unknown) {
    super(`${action}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "NativeExportError";
  }
}

// Android's cache dir + FileProvider + FileOpener/Share chain is unreliable
// with non-ASCII filenames (the default export name is Arabic, e.g.
// "اكسيل-05-07-2026.xlsx", and audio shares use the Arabic plate as the
// name) — the content:// URI can come back unusable and the open/share
// silently no-ops or errors. The temp file in Cache is throwaway, so give it
// an ASCII-safe name for the write while callers keep the human-readable
// Arabic name for the web-download path (browsers handle Arabic names fine).
export function toSafeCacheFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const rawExt = dot > 0 ? filename.slice(dot + 1) : "";
  const rawBase = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "") || "dat";
  const base =
    rawBase
      .replace(/[^a-zA-Z0-9._-]+/g, "-") // Arabic / spaces / punctuation → dash
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "file";
  return `${base}.${ext}`;
}

// The MIME type must match the ACTUAL file, not always xlsx — the export now
// falls back to .csv on devices where xlsx-building fails, and telling the
// opener a .csv is an xlsx makes the spreadsheet app report it as corrupt.
function contentTypeForFilename(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "csv") return "text/csv";
  if (ext === "xls") return "application/vnd.ms-excel";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

// Converting a large Blob to base64 one byte at a time (`binary += String.
// fromCharCode(bytes[i])`) runs millions of individual string-concat ops on
// the main thread for a big export (e.g. a sort result with thousands of
// rows) and freezes the whole app for the duration. Encoding in 32KB chunks
// with String.fromCharCode.apply cuts that to a handful of calls instead —
// same output, no more freeze. (32KB keeps well clear of the engine's
// max-arguments limit for Function.apply.)
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

export async function openExcelBlob(blob: Blob, filename: string): Promise<"opened" | "downloaded"> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { FileOpener } = await import("@capacitor-community/file-opener");

      const arrayBuffer = await blob.arrayBuffer();
      const base64 = bytesToBase64(new Uint8Array(arrayBuffer));

      const safeName = toSafeCacheFilename(filename);
      const { uri } = await Filesystem.writeFile({
        path: safeName,
        data: base64,
        directory: Directory.Cache,
      });

      await FileOpener.open({
        filePath: uri,
        contentType: contentTypeForFilename(safeName),
      });
      return "opened";
    } catch (err) {
      throw new NativeExportError("تعذّر فتح ملف Excel", err);
    }
  }

  // Web fallback: download normally
  downloadExcelBlob(blob, filename);
  return "downloaded";
}

export async function shareExcelBlob(blob: Blob, filename: string, title: string): Promise<void> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      const arrayBuffer = await blob.arrayBuffer();
      const base64 = bytesToBase64(new Uint8Array(arrayBuffer));

      const { uri } = await Filesystem.writeFile({
        path: toSafeCacheFilename(filename),
        data: base64,
        directory: Directory.Cache,
      });

      await Share.share({ title, url: uri, dialogTitle: title });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError" || /cancel/i.test(err?.message ?? "")) return; // user dismissed the share sheet
      throw new NativeExportError("تعذّرت مشاركة ملف Excel", err);
    }
  }

  // Web fallback: Web Share API with file, then download
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch { /* user cancelled or not supported */ }
  }
  downloadExcelBlob(blob, filename);
}

/**
 * Build a styled, RTL Excel blob for sort results.
 * Requires exceljs (supports cell fill colors + rightToLeft sheet view).
 */
export async function buildColoredSortExcel(
  rows: Record<string, unknown>[],
  sheetName: string,
  rowHexColors: (string | null)[],
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });

  if (rows.length === 0) {
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const headers = Object.keys(rows[0]);

  // Header row
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });

  // Data rows
  rows.forEach((row, i) => {
    const values = headers.map((h) => {
      const v = row[h];
      return v !== null && v !== undefined ? String(v) : "";
    });
    const excelRow = ws.addRow(values);
    const hex = rowHexColors[i];
    if (hex) {
      const argb = "FF" + hex.replace("#", "");
      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      });
    }
    // Hyperlinks for URL cells
    headers.forEach((h, ci) => {
      const v = row[h];
      if (typeof v === "string" && /^https?:\/\//i.test(v)) {
        const cell = excelRow.getCell(ci + 1);
        cell.value = { text: v, hyperlink: v } as ExcelJS.CellHyperlinkValue;
        cell.font = { color: { argb: "FF0563C1" }, underline: true };
      }
    });
  });

  // Column widths
  headers.forEach((h, ci) => {
    let maxLen = h.length;
    rows.forEach((row) => { const v = String(row[h] ?? ""); if (v.length > maxLen) maxLen = v.length; });
    ws.getColumn(ci + 1).width = Math.min(Math.max(maxLen + 2, 10), 55);
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function buildRowSummaryText(row: Record<string, unknown>): string {
  return Object.entries(row)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

export async function shareOrCopyText(text: string): Promise<"shared" | "copied"> {
  const nav = navigator as any;
  if (nav.share) {
    try {
      await nav.share({ text });
      return "shared";
    } catch {
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}
