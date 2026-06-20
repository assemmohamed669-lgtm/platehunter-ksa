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
        const ws = wb.Sheets[wb.SheetNames[0]];
        
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
  try {
    const file = new File([blob], filename, { type: blob.type });
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return "opened";
    }
  } catch {
  }
  downloadExcelBlob(blob, filename);
  return "downloaded";
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