/**
 * Web Worker — parses Excel files off the main thread to keep the UI responsive.
 * Bundled automatically by Next.js/webpack when imported via:
 *   new Worker(new URL('./xlsxWorker.ts', import.meta.url))
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as XLSX from "xlsx";
import { detectHeaderless, buildHeaderlessColumns } from "./headerlessColumns";

// ─── فحص خفيف: هل الخلية شكلها لوحة سعودية بعد التطبيع؟ ─────────────────
// (نسخة خفيفة مستقلة — الـ worker معزول ومايقدرش يستورد من plateParser.ts)
// خلية → نص. خلايا التاريخ (لما نقرا بـ cellDates:true) بتيجي كائن Date —
// نحوّلها لتاريخ منسّق dd/mm/yyyy بدل الرقم التسلسلي بتاع Excel (زي 45877).
// أي قيمة تانية (أرقام/لوحات/نصوص) بتفضل زي ما هي — صفر أثر عليها.
function cellToStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${v.getFullYear()}`;
  }
  return String(v);
}

function cellLooksLikePlate(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-_.ـ/]/g, ""); // strip tatweel too
  if (cleaned.length < 2 || cleaned.length > 10) return false;

  const digitMatch = cleaned.match(/[0-9٠-٩]+/);
  if (!digitMatch) return false;
  // اللوحة السعودية = 3-4 أرقام — أكواد قصيرة (R8) مش لوحات.
  if (digitMatch[0].length < 3 || digitMatch[0].length > 4) return false;

  const nonDigits = cleaned.replace(/[0-9٠-٩]/g, "");
  if (nonDigits.length === 0 || nonDigits.length > 3) return false;
  if (!/^[\u0600-\u06FFa-zA-Z]+$/.test(nonDigits)) return false;

  return true;
}

// يعدّ اللوحات الفعلية في أفضل عمود بالورقة كلها — مش نسبة، عدد فعلي.
// نختار العمود بأعلى نسبة من عينة أول 200 صف، بعدين نعدّه كامل. كده الورقة
// اللي فيها 40 ألف لوحة تكسب ورقة صغيرة نسبتها 100% بس فيها 10 صفوف.
function countPlatesInBestColumn(raw2d: any[][]): number {
  if (raw2d.length < 2) return 0;
  const numCols = Math.max(...raw2d.slice(0, 5).map((r) => (r as any[])?.length ?? 0), 0);
  const sampleN = Math.min(raw2d.length, 201);

  let bestCol = -1;
  let bestRatio = 0;
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
      // المحاولة الأولى: اختر الورقة صاحبة أكبر عدد لوحات فعلية (أكبر داتا)
      let bestCount = 0;
      let bestName: string | undefined;
      for (const name of allSheetNames) {
        try {
          const scanOpts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [name] };
          (scanOpts as Record<string, unknown>).dense = true;
          if (password) (scanOpts as Record<string, unknown>).password = password;
          const wbScan = XLSX.read(data, scanOpts);
          const wsScan = wbScan.Sheets[name];
          if (!wsScan) continue;
          const scanRows = XLSX.utils.sheet_to_json<any[]>(wsScan, { header: 1, raw: false, defval: null });
          if (scanRows.length < 2) continue;
          const count = countPlatesInBestColumn(scanRows);
          if (count > bestCount) { bestCount = count; bestName = name; }
        } catch { continue; }
      }
      if (bestCount > 0) {
        sheetName = bestName;
      }

      // المحاولة الثانية (احتياطي): اسم الهيدر القديم
      if (!sheetName) {
        for (const name of allSheetNames) {
          try {
            const scanOpts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [name] };
            (scanOpts as Record<string, unknown>).dense = true;
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
      cellDates: true,    // خلايا التاريخ تيجي Date (مش رقم تسلسلي) — نفرمتها في cellToStr
      cellStyles: false,  // skip style parsing
      sheetStubs: false,  // no stubs for empty cells
    };
    // dense mode: array-backed worksheet — much faster & far lower memory on
    // huge sheets (the 464K-row data file), which also avoids the low-end-device
    // out-of-memory white screen. sheet_to_json reads dense sheets transparently.
    (opts as Record<string, unknown>).dense = true;
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

    // Pass 1: exact match — limited to first 50 rows so a late embedded section
    // (e.g. a second table at row 339) doesn't override the real data start.
    const HDR_SCAN = Math.min(raw2d.length, 50);
    for (let ri = 0; ri < HDR_SCAN; ri++) {
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
    // cellToStr (مش String) عشان خلايا التاريخ (Date من cellDates) تتنسّق dd/mm/yyyy
    // فالكاشف detectHeaderless يشوفها زي البنّاء بالظبط (اتساق كاشف/بنّاء).
    const rawHeaderCells = (raw2d[headerRowIdx] as any[]).map((h: any) => cellToStr(h).trim());

    // شيت بدون صف عناوين (الصف المرشّح داتا مش عناوين): نسمّي الأعمدة بالمحتوى
    // (لوحة/تاريخ/حي/GPS) ونعتبر الصف ده داتا — نفس منطق excel.ts (مصدر واحد).
    let headerCols: Array<{ name: string; col: number }>;
    let dataStartRow: number;
    if (detectHeaderless(rawHeaderCells)) {
      headerCols = buildHeaderlessColumns(raw2d as any[][], headerRowIdx, cellToStr);
      dataStartRow = headerRowIdx; // الصف ده داتا مش عناوين
    } else {
      headerCols = [];
      rawHeaderCells.forEach((name, col) => { if (name) headerCols.push({ name, col }); });
      dataStartRow = headerRowIdx + 1;
    }
    const headers = headerCols.map((hc) => hc.name);

    if (headers.length === 0) {
      postMessage({ success: false, error: "الملف فارغ أو لا يحتوي على بيانات." });
      return;
    }

    // Build objects from the 2-D array using actual column positions
    const rows: Record<string, string>[] = [];
    for (let i = dataStartRow; i < raw2d.length; i++) {
      const r = raw2d[i] as any[];
      const obj: Record<string, string> = {};
      for (const { name, col } of headerCols) {
        obj[name] = cellToStr(r[col]);
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
