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
    let allSheetNames: string[] = [];
    try {
      const wbMeta = XLSX.read(data, { type: "array", bookSheets: true });
      allSheetNames = wbMeta.SheetNames;
    } catch {
      /* password-protected — sheetName stays undefined; detect after full parse */
    }

    // Pass 1.5 (only for multi-sheet files): scan each sheet for a plate column header.
    // Single-sheet files skip this block — zero overhead.
    const PLATE_DET_KWS = ["لوحة", "اللوحة", "plate"];
    if (allSheetNames.length > 1) {
      for (const name of allSheetNames) {
        try {
          const scanOpts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [name] };
          if (password) (scanOpts as Record<string, unknown>).password = password;
          const wbScan = XLSX.read(data, scanOpts);
          const wsScan = wbScan.Sheets[name];
          if (!wsScan) continue;
          const scanRows = XLSX.utils.sheet_to_json<any[]>(wsScan, { header: 1, raw: false });
          const hasPlate = scanRows.slice(0, 20).some((row: any[]) =>
            row.some((c: any) => {
              const v = String(c ?? "").trim().toLowerCase();
              return PLATE_DET_KWS.some((k) => v.includes(k));
            })
          );
          if (hasPlate) { sheetName = name; break; }
        } catch { continue; }
      }
    }
    sheetName = sheetName ?? allSheetNames[0];

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
    const finalSheet = sheetName ?? wb.SheetNames[0];
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

    // Find the actual header row — skip email/instruction rows above the data table.
    //
    // Pass 1 (exact): scan for a row containing a known plate column name exactly.
    //   These are the actual column names used in bank referral files.
    // Pass 2 (keyword): fall back to scoring rows by short cells with plate keywords.
    // Pass 3 (dense): last resort — densest row.
    const EXACT_PLATE_COLS = [
      "plate number",
      "the plate number in arabic",
      "رقم اللوحة",
      "رقم اللوحة عربي",
    ];
    const PLATE_KWS = ["لوحة", "اللوحة", "plate"];
    const SCAN = Math.min(raw2d.length, 600);

    let headerRowIdx = -1;

    // Pass 1: exact match
    for (let ri = 0; ri < SCAN; ri++) {
      const cells = raw2d[ri] as any[];
      const hasExact = cells.some((c: any) =>
        EXACT_PLATE_COLS.includes(String(c ?? "").trim().toLowerCase())
      );
      if (hasExact) { headerRowIdx = ri; break; }
    }

    // Pass 2: keyword scoring in short cells
    if (headerRowIdx < 0) {
      let bestKwRow = -1, bestKwScore = 0, bestKwNonEmpty = -1;
      let bestDenseRow = 0, bestDenseCount = 0;
      for (let ri = 0; ri < SCAN; ri++) {
        const cells = raw2d[ri] as any[];
        const nonEmpty = cells.filter((c: any) => String(c ?? "").trim()).length;
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
