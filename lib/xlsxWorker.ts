/**
 * Web Worker — parses Excel files off the main thread to keep the UI responsive.
 * Bundled automatically by Next.js/webpack when imported via:
 *   new Worker(new URL('./xlsxWorker.ts', import.meta.url))
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";

// ─── فحص خفيف: هل الخلية شكلها لوحة سعودية بعد التطبيع؟ ─────────────────
// (نسخة خفيفة مستقلة — الـ worker معزول ومايقدرش يستورد من plateParser.ts)
function cellLooksLikePlate(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-_./]/g, "");
  if (cleaned.length < 2 || cleaned.length > 10) return false;

  const digitMatch = cleaned.match(/[0-9٠-٩]+/);
  if (!digitMatch) return false;
  if (digitMatch[0].length > 4) return false;

  const nonDigits = cleaned.replace(/[0-9٠-٩]/g, "");
  if (nonDigits.length === 0 || nonDigits.length > 3) return false;
  if (!/^[\u0600-\u06FFa-zA-Z]+$/.test(nonDigits)) return false;

  return true;
}

// يحسب نسبة الخلايا التي تشبه اللوحات في أفضل عمود — يُرجع 0..1
function scorePlateColumnByContent(raw2d: any[][], headerRowIdx: number): number {
  const headerRow = (raw2d[headerRowIdx] as any[]).map((h) => String(h ?? "").trim());
  const sample = raw2d.slice(headerRowIdx + 1, headerRowIdx + 1 + 100);

  let bestRatio = 0;
  for (let col = 0; col < headerRow.length; col++) {
    let plateLike = 0;
    let nonEmpty = 0;
    for (const r of sample) {
      const raw = String((r as any[])[col] ?? "").trim();
      if (!raw) continue;
      nonEmpty++;
      if (cellLooksLikePlate(raw)) plateLike++;
    }
    if (nonEmpty === 0) continue;
    const ratio = plateLike / nonEmpty;
    if (ratio > bestRatio) bestRatio = ratio;
  }
  return bestRatio;
}

onmessage = function (e: MessageEvent<{ buffer: ArrayBuffer; password?: string; forcedSheet?: string }>) {
  const { buffer, password, forcedSheet } = e.data;
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

    // If caller forced a specific sheet, skip auto-detection entirely
    if (forcedSheet && allSheetNames.includes(forcedSheet)) {
      sheetName = forcedSheet;
    }

    // Pass 1.5 (only for multi-sheet files): score every sheet by plate-like content,
    // pick the one with the highest ratio. Falls back to keyword header check if
    // no sheet scores above the minimum threshold.
    const PLATE_DET_KWS = ["لوحة", "اللوحة", "plate"];
    if (!sheetName && allSheetNames.length > 1) {
      // المحاولة الأولى: score كل ورقة واختر الأعلى
      let bestScore = 0;
      let bestName: string | undefined;
      for (const name of allSheetNames) {
        try {
          const scanOpts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [name] };
          if (password) (scanOpts as Record<string, unknown>).password = password;
          const wbScan = XLSX.read(data, scanOpts);
          const wsScan = wbScan.Sheets[name];
          if (!wsScan) continue;
          const scanRows = XLSX.utils.sheet_to_json<any[]>(wsScan, { header: 1, raw: false, defval: null });
          if (scanRows.length < 2) continue;
          const score = scorePlateColumnByContent(scanRows, 0);
          if (score > bestScore) { bestScore = score; bestName = name; }
        } catch { continue; }
      }
      if (bestScore >= 0.1) {
        sheetName = bestName;
      }

      // المحاولة الثانية (احتياطي): اسم الهيدر القديم
      if (!sheetName) {
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
        if (!sheetName && bestName) sheetName = bestName;
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

    // Pass 2: keyword scoring + dense fallback — both limited to first 50 rows.
    // Scanning beyond the first section risks picking a late embedded table's
    // header (e.g. row 339) and discarding all earlier data rows.
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
    const rawHeaderCells = (raw2d[headerRowIdx] as any[]).map((h: any) => String(h ?? "").trim());
    const headerCols: Array<{ name: string; col: number }> = [];
    rawHeaderCells.forEach((name, col) => { if (name) headerCols.push({ name, col }); });
    const headers = headerCols.map((hc) => hc.name);

    if (headers.length === 0) {
      postMessage({ success: false, error: "الملف فارغ أو لا يحتوي على بيانات." });
      return;
    }

    // Build objects from the 2-D array using actual column positions
    const rows: Record<string, string>[] = [];
    for (let i = headerRowIdx + 1; i < raw2d.length; i++) {
      const r = raw2d[i] as any[];
      const obj: Record<string, string> = {};
      for (const { name, col } of headerCols) {
        obj[name] = String(r[col] ?? "");
      }
      rows.push(obj);
    }

    postMessage({ success: true, headers, rows, sheetName: finalSheet, allSheetNames });
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
