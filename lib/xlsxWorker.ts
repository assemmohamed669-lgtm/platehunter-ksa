/**
 * Web Worker — parses Excel files off the main thread to keep the UI responsive.
 * Bundled automatically by Next.js/webpack when imported via:
 *   new Worker(new URL('./xlsxWorker.ts', import.meta.url))
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";

onmessage = function (e: MessageEvent<{ buffer: ArrayBuffer; password?: string }>) {
  const { buffer, password } = e.data;
  try {
    const data = new Uint8Array(buffer);

    // Pass 1: read sheet names only — no cell data parsed (very fast)
    let sheetName: string | undefined;
    try {
      const wbMeta = XLSX.read(data, { type: "array", bookSheets: true });
      sheetName =
        wbMeta.SheetNames.find((n: string) => n.trim() === "تشييك") ??
        wbMeta.SheetNames[0];
    } catch {
      /* password-protected — sheetName stays undefined; detect after full parse */
    }

    // Pass 2: parse only the target sheet with performance-optimised options
    const opts: XLSX.ParsingOptions = {
      type: "array",
      raw: true,          // skip cell formatting (~30-50% faster)
      cellStyles: false,  // skip style parsing
      sheetStubs: false,  // no stubs for empty cells
    };
    if (password) (opts as Record<string, unknown>).password = password;
    if (sheetName) (opts as Record<string, unknown>).sheets = [sheetName];

    const wb = XLSX.read(data, opts);
    const finalSheet =
      sheetName ??
      wb.SheetNames.find((n: string) => n.trim() === "تشييك") ??
      wb.SheetNames[0];
    const ws = wb.Sheets[finalSheet];

    // 2-D array mode is faster than auto-object mode in sheet_to_json
    const raw2d = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    });

    if (raw2d.length === 0) {
      postMessage({ success: false, error: "الملف فارغ أو لا يحتوي على بيانات." });
      return;
    }

    // Find the actual header row — skip title/email/instruction rows above the table.
    // Among all rows in the first 200: pick the row that has the most non-empty cells
    // AND contains a plate-related keyword (short column name, not instruction paragraph).
    // If no keyword found anywhere, pick the densest row as fallback.
    const PLATE_KWS = ["لوحة", "اللوحة", "plate"];
    const SCAN = Math.min(raw2d.length, 200);
    let bestKwRow = -1, bestKwCount = -1;
    let bestDenseRow = 0, bestDenseCount = 0;
    for (let ri = 0; ri < SCAN; ri++) {
      const cells = raw2d[ri] as any[];
      const nonEmpty = cells.filter((c: any) => String(c ?? "").trim()).length;
      if (nonEmpty > bestDenseCount) { bestDenseCount = nonEmpty; bestDenseRow = ri; }
      const hasKw = cells.some((c: any) =>
        PLATE_KWS.some((k) => String(c ?? "").toLowerCase().includes(k))
      );
      if (hasKw && nonEmpty > bestKwCount) { bestKwCount = nonEmpty; bestKwRow = ri; }
    }
    const headerRowIdx = bestKwRow >= 0 ? bestKwRow : bestDenseRow;

    const headers = (raw2d[headerRowIdx] as any[])
      .map((h: any) => String(h ?? "").trim())
      .filter(Boolean);

    if (headers.length === 0) {
      postMessage({ success: false, error: "الملف فارغ أو لا يحتوي على بيانات." });
      return;
    }

    // Build objects from the 2-D array — avoids SheetJS internal formatting per cell
    const rows: Record<string, string>[] = [];
    for (let i = headerRowIdx + 1; i < raw2d.length; i++) {
      const r = raw2d[i] as any[];
      const obj: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = String(r[j] ?? "");
      }
      rows.push(obj);
    }

    postMessage({ success: true, headers, rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isPassword = /password|crypt|encrypt/i.test(msg);
    postMessage({
      success: false,
      error: isPassword
        ? "تعذّرت قراءة الملف — قد يكون محمياً بكلمة مرور."
        : "تعذّرت قراءة الملف.",
    });
  }
};
