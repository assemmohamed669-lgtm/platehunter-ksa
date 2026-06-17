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
  // Column order exactly matches spec: A B C D E F
  const rows = recordings
    .filter((r) => !r.plate.startsWith("📍")) // skip manual pins from export
    .map((r) => ({
      "رقم اللوحة": r.plate,
      "نوع السيارة": r.vehicleType ?? "",
      الشارع: r.street ?? "",
      الحي: r.district ?? "",
      "تاريخ التسجيل": formatDate(r.recordedAt),
      "رابط الموقع": r.mapsLink ?? "",
    }));

  if (rows.length === 0) {
    alert("لا توجد بيانات للتصدير.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 14 }, // رقم اللوحة
    { wch: 12 }, // نوع السيارة
    { wch: 28 }, // الشارع
    { wch: 20 }, // الحي
    { wch: 18 }, // تاريخ التسجيل
    { wch: 55 }, // رابط الموقع
  ];

  // Header style — bold RTL
  const headerStyle = { font: { bold: true }, alignment: { horizontal: "right" } };
  const headers = ["A1", "B1", "C1", "D1", "E1", "F1"];
  headers.forEach((cell) => {
    if (ws[cell]) ws[cell].s = headerStyle;
  });

  // Make maps link column clickable
  rows.forEach((row, i) => {
    const cellRef = `F${i + 2}`;
    if (ws[cellRef] && row["رابط الموقع"]) {
      ws[cellRef].l = { Target: row["رابط الموقع"], Tooltip: "فتح في الخريطة" };
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
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: Record<string, string>[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
        }) as Record<string, string>[][];

        // Flatten all cells and return non-empty strings
        const plates: string[] = [];
        for (const row of rows) {
          for (const cell of row as string[]) {
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

// =====================================================================
// Phase 5 additions — generic table reading (with optional password),
// watermarked export, and unified save/share.
// =====================================================================

export interface ExcelTable {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Reads any uploaded Excel file into a generic {headers, rows} table.
 * Always goes through the server route (/api/excel/parse) so password-
 * protected files can be handled consistently — see that route's
 * comments for the honest limits of what decryption can cover.
 */
export async function parseExcelFile(file: File, password?: string): Promise<ExcelTable> {
  const formData = new FormData();
  formData.append("file", file);
  if (password) formData.append("password", password);

  const res = await fetch("/api/excel/parse", { method: "POST", body: formData });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error ?? "فشل قراءة الملف.");
  }

  return { headers: json.headers as string[], rows: json.rows as Record<string, string>[] };
}

export interface WatermarkInfo {
  username: string;
  userId: string;
}

/**
 * Builds an .xlsx Blob from arbitrary rows. If a watermark is supplied,
 * embeds a traceability stamp (who exported it, exactly when, and their
 * account id) both in the workbook's metadata and as a trailing row in
 * the sheet — a digital tracking mark rather than a visual stamped
 * image (true visual watermarking needs a heavier library).
 */
export function buildExcelBlob(
  rows: Record<string, unknown>[],
  sheetName: string,
  watermark?: WatermarkInfo
): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
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

/**
 * Single unified "save/share" action. On devices that support the Web
 * Share API with files (most modern Android browsers, and Safari on
 * iOS 16+), this opens the native share sheet — letting the agent pick
 * WhatsApp, Excel, Drive, or "Save to Files" themselves. Where that
 * isn't supported, it falls back to a normal browser download.
 */
export async function shareOrDownloadExcel(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  try {
    const file = new File([blob], filename, { type: blob.type });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return "shared";
    }
  } catch {
    // User cancelled the share sheet, or share failed — fall through to download.
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}
