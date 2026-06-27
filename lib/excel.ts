/**
 * Excel export for PlateHunter KSA.
 * Exports field recordings to .xlsx with the exact 6 columns from the spec.
 * Uses SheetJS (xlsx) — already in package.json.
 */

import * as XLSX from "xlsx";
import type { RecordingEntry } from "./idb";

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
}

export async function parseExcelFile(file: File, password?: string): Promise<ExcelTable> {
  const buffer = await file.arrayBuffer();

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
            error?: string;
          };
          if (d.success && d.headers && d.rows) {
            if (d.rows.length === 0) {
              reject(new Error("الملف فارغ أو لا يحتوي على بيانات."));
            } else {
              resolve({ headers: d.headers, rows: d.rows });
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

        // No transfer — keep buffer available for the sync fallback
        worker.postMessage({ buffer, password });
      });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      // Only fall through on worker init/communication failures; re-throw real parse errors
      if (msg !== "__WORKER_UNAVAILABLE__") throw err;
    }
  }

  // Synchronous fallback (main-thread; may briefly freeze UI on very large files)
  return _parseExcelSync(new Uint8Array(buffer), password);
}

function _parseExcelSync(data: Uint8Array, password?: string): ExcelTable {
  let sheetName: string | undefined;
  try {
    const wbMeta = XLSX.read(data, { type: "array", bookSheets: true });
    sheetName =
      wbMeta.SheetNames.find((n) => n.trim() === "تشييك") ?? wbMeta.SheetNames[0];
  } catch { /* password-protected */ }

  const opts: XLSX.ParsingOptions = {
    type: "array",
    raw: true,
    cellStyles: false,
    sheetStubs: false,
  };
  if (password) (opts as Record<string, unknown>).password = password;
  if (sheetName) (opts as Record<string, unknown>).sheets = [sheetName];

  try {
    const wb = XLSX.read(data, opts);
    const finalSheet =
      sheetName ??
      wb.SheetNames.find((n) => n.trim() === "تشييك") ??
      wb.SheetNames[0];
    const ws = wb.Sheets[finalSheet];

    const raw2d = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    });
    if (raw2d.length === 0) throw new Error("empty");

    const headers = (raw2d[0] as unknown[])
      .map((h) => String(h ?? "").trim())
      .filter(Boolean);
    if (headers.length === 0) throw new Error("empty");

    const rows: Record<string, string>[] = new Array(raw2d.length - 1);
    for (let i = 1; i < raw2d.length; i++) {
      const r = raw2d[i] as unknown[];
      const obj: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = String(r[j] ?? "");
      }
      rows[i - 1] = obj;
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

export async function openExcelBlob(blob: Blob, filename: string): Promise<"opened" | "downloaded"> {
  // On native Android (Capacitor): write to filesystem then open with FileOpener
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { FileOpener } = await import("@capacitor-community/file-opener");

      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const { uri } = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });

      await FileOpener.open({
        filePath: uri,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      return "opened";
    }
  } catch { /* not native or plugin unavailable */ }

  // Web fallback: download normally
  downloadExcelBlob(blob, filename);
  return "downloaded";
}

export async function shareExcelBlob(blob: Blob, filename: string, title: string): Promise<void> {
  // On native Android (Capacitor): write to cache then share via native share sheet
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const { uri } = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });

      await Share.share({ title, url: uri, dialogTitle: title });
      return;
    }
  } catch { /* not native or plugin unavailable */ }

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