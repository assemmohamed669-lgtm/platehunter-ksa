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
 * Pure, guaranteed browser download — no share-sheet attempt. Used by
 * the "تحميل الملف" (Download File) button, which should behave the
 * same way on every device every time.
 */
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

/**
 * Used by the "فتح الملف" (Open File) button. There is no universal
 * browser API to force-launch a specific desktop app like Excel, so
 * this opens the OS/browser's native "Open with…" share sheet via the
 * Web Share API — on most phones that sheet lists Excel, Google
 * Sheets, WhatsApp, etc. directly. Where Web Share with files isn't
 * supported (mainly older desktop browsers), it falls back to a plain
 * download so the action still does something useful.
 */
export async function openExcelBlob(blob: Blob, filename: string): Promise<"opened" | "downloaded"> {
  try {
    const file = new File([blob], filename, { type: blob.type });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return "opened";
    }
  } catch {
    // User cancelled the sheet, or share failed — fall through to download.
  }
  downloadExcelBlob(blob, filename);
  return "downloaded";
}

/**
 * Builds a human-readable "label: value" block from a result row, in
 * the exact column order the user selected. Used for both the Copy
 * button (clipboard) and the Share button (Web Share API text), so a
 * single result can be pasted into WhatsApp, SMS, etc. with all the
 * fields the agent actually cares about — nothing more, nothing less.
 */
export function buildRowSummaryText(row: Record<string, unknown>): string {
  return Object.entries(row)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

/**
 * Shares plain text via the native Share sheet (WhatsApp, SMS, etc.).
 * Falls back to clipboard copy with a return flag so the caller can
 * show "تم النسخ" instead of a false "تمت المشاركة" on browsers that
 * don't support Web Share for text (mainly older desktop browsers).
 */
export async function shareOrCopyText(text: string): Promise<"shared" | "copied"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  if (nav.share) {
    try {
      await nav.share({ text });
      return "shared";
    } catch {
      // user cancelled the share sheet — treat as a no-op, not an error
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}
